/* V2.5 教师作业编辑和验收。所有写入复用同一课程的待确认请求。 */
(function () {
  'use strict';
  const model=window.TeachingHomeworkModel, api=window.TeachingDesktopHomework;
  const writer=window.TeachingHomeworkActions.create({storage:localStorage,scope:()=>api.scope(),request:(payload,scope)=>api.request(payload,scope),id:()=>crypto.randomUUID()});
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const value=(root,name)=>root.querySelector('[name="'+name+'"]')?.value||'';
  async function showPending(root,courseId,refresh) {
    const pending=await writer.pending(courseId), slot=root.querySelector('[data-pending]');
    if(!slot)return;
    if(!pending){slot.textContent='';return;}
    slot.innerHTML='<p>上次请求结果尚未确认。请先重试同一请求，避免重复操作。</p><button type="button" data-retry>重试并核对</button>';
    slot.querySelector('[data-retry]').onclick=async()=>{try{slot.textContent='正在核对…';await writer.retry(courseId);await refresh();}catch(e){slot.textContent=e.message;const b=document.createElement('button');b.textContent='重新检查';b.onclick=()=>showPending(root,courseId,refresh);slot.append(b);}};
  }
  async function readPlan(courseId){const result=await api.request({action:'teacherCoursePlan',courseId});return result.plan||null;}
  async function openEditor(root,course,assignmentId,onChanged,options) {
    root.textContent='正在读取课程作业…';
    try {
      const plan=await readPlan(course.id);
      // 历史课程反馈（legacy courseFeedback 无 assignments）→ 先预览，确认后转阶段作业。
      if (plan && !Array.isArray(plan.assignments)) {
        if (assignmentId) throw new Error('该作业已不存在，请刷新列表');
        const fb=plan.feedback||{};
        root.innerHTML='<h3>历史课程反馈</h3><p>'+esc(course.date)+' · '+esc(course.studentName)+'</p><div class="hw-warning">这是旧版课程反馈，尚未转为作业。转换后以阶段作业形式重新布置，原反馈与历史记录保留。</div><h4>课程内容</h4><p>'+esc(fb.content||'（无）')+'</p><h4>课后建议</h4><p>'+esc(fb.advice||'（无）')+'</p><button type="button" data-convert>转为阶段作业</button> <button type="button" data-cancel>取消</button>';
        root.querySelector('[data-cancel]').onclick=onChanged;
        root.querySelector('[data-convert]').onclick=async()=>{root.textContent='正在准备转换…';try{await openEditor(root,course,null,onChanged,{legacy:true});}catch(e){root.textContent='无法转换历史反馈：'+e.message;}};
        return;
      }
      const legacyMode=!!(options&&options.legacy);
      const scope=await api.scope();
      let assignment=assignmentId && plan && plan.assignments.find(a=>a.id===assignmentId);
      if(assignmentId && (!assignment || assignment.lifecycle!=='draft')) throw new Error('该作业不是可编辑草稿，请刷新');
      let state=assignment ? model.applyAssignment(assignment) : model.createState('staged',()=>crypto.randomUUID());
      if(!assignment)state.form.title='本节课课后练习';
      let currentId=assignment ? assignment.id : crypto.randomUUID(), revision=plan ? plan.revision : 0;
      const draftKey='gb_hw_editor_v1_'+scope+'_'+course.id+'_'+(assignmentId||(legacyMode?'legacy':'new'));
      let draftWarning='',staleDraft=false,generating=false;
      const courseHasDraft=!!(plan && plan.assignments.some(item=>item.lifecycle==='draft'));
      try {
        const draft=JSON.parse(localStorage.getItem(draftKey)||'null');
        if(draft && draft.revision===revision && draft.state && draft.currentId){state=draft.state;currentId=draft.currentId;draftWarning='已恢复本机草稿，提交前请核对。';}
        else if(draft) {staleDraft=true;draftWarning='本机草稿对应的云端版本已变化，请先核对；未覆盖本机草稿。';}
      } catch(_) {staleDraft=true;draftWarning='本机草稿无法读取，请检查浏览器存储。';}
      let songs=[], nextCursor=0, songQuery='';
      const paint=()=>{
        root.innerHTML='<h3>课后作业</h3><p>'+esc(course.date)+' · '+esc(course.studentName)+'</p><div data-pending class="hw-warning"></div><div class="hw-form hw-simple-form"><label class="hw-title-field">作业名称 *<input name="title" maxlength="200" placeholder="请输入作业名称" value="'+esc(state.form.title)+'"></label><div data-tasks>'+state.tasks.map((t,i)=>'<fieldset class="hw-part"><div class="hw-part-head"><strong>第 '+(i+1)+' 部分</strong><div class="hw-part-actions"><button type="button" data-move="-1" data-index="'+i+'" '+(i===0?'disabled':'')+'>上移</button><button type="button" data-move="1" data-index="'+i+'" '+(i===state.tasks.length-1?'disabled':'')+'>下移</button><button type="button" data-copy="'+i+'" '+(state.mode!=='staged'?'disabled':'')+'>复制</button><button type="button" data-remove="'+i+'" '+(state.tasks.length===1?'disabled':'')+'>删除</button></div></div><label>练习内容 *<textarea data-task="contentText" placeholder="填写练习内容">'+esc(t.contentText)+'</textarea></label><label>验收标准 *<textarea data-task="acceptanceCriteria" placeholder="填写验收标准">'+esc(t.acceptanceCriteria)+'</textarea></label><details class="hw-extra"><summary>小节范围（选填）</summary><div class="hw-fields"><label>开始小节<input data-task="startBar" value="'+esc(t.startBar)+'"></label><label>结束小节<input data-task="endBar" value="'+esc(t.endBar)+'"></label></div></details></fieldset>').join('')+'</div><p class="hw-form-hint">没有验收标准可保存草稿，填写后才能发布。</p><button type="button" data-add '+(state.mode!=='staged'?'disabled':'')+'>＋ 添加练习部分</button><details class="hw-extra hw-advanced"><summary>更多设置</summary><label>作业类型<select name="mode"><option value="staged">阶段作业</option><option value="single">单项任务</option><option value="free">自由练习</option></select></label><label>教师要求<textarea name="notes" maxlength="2000">'+esc(state.form.notes)+'</textarea></label><label>关联曲谱（选填）<input type="search" data-song-search placeholder="搜索已加载曲谱"><select name="song"><option value="">不关联曲谱</option>'+(state.form.songId && !songs.some(s=>s.id===state.form.songId)?'<option value="'+esc(state.form.songId)+'">'+esc(state.form.songTitle||state.form.songId)+'</option>':'')+songs.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join('')+'</select></label><button type="button" data-search-all>搜索完整目录</button> <button type="button" data-songs>'+(songs.length?'加载更多曲谱':'加载曲谱目录')+'</button><label class="hw-check"><input type="checkbox" name="tracking"> 跟踪练习小节</label><label>练习结束小节<input name="totalBars" inputmode="numeric" value="'+esc(state.form.totalBars)+'"></label></details><div role="status" data-message></div><div class="hw-buttons"><button type="button" data-save>保存作业草稿</button><button type="button" class="primary" data-publish>发布作业</button><button type="button" data-cancel>返回</button></div></div>';

        root.querySelector('[name="mode"]').value=state.mode;root.querySelector('[name="tracking"]').checked=state.form.trackingEnabled;
        root.querySelector('[name="song"]').value=state.form.songId;
        root.querySelector('[data-song-search]').value=songQuery;
        const message=root.querySelector('[data-message]');
        message.textContent=draftWarning;
        const collect=()=>{
          state.mode=value(root,'mode');const songId=value(root,'song');if(songId!==state.form.songId){const selected=songs.find(s=>s.id===songId);state.form.songId=songId;state.form.songVersion=selected?String(selected.version||''):'';state.form.songTitle=selected?selected.title:'';delete state.form.interactiveRef;}Object.assign(state.form,{title:value(root,'title'),notes:value(root,'notes'),trackingEnabled:root.querySelector('[name="tracking"]').checked,totalBars:value(root,'totalBars')});
          root.querySelectorAll('fieldset').forEach((element,i)=>{for(const key of ['contentText','acceptanceCriteria','startBar','endBar']) state.tasks[i][key]=element.querySelector('[data-task="'+key+'"]').value;});
        };
        const saveLocal=()=>{if(staleDraft)return;try{localStorage.setItem(draftKey,JSON.stringify({revision,currentId,state}));}catch(_){root.querySelector('[data-message]').textContent='本机草稿保存失败，请勿关闭页面';}};
        const plainState=()=>state.mode==='staged' && state.form.title==='本节课课后练习' &&
          state.tasks.length===1 && !Object.entries(state.tasks[0]).some(([key,input])=>key!=='id' && input) &&
          !Object.entries(state.form).some(([key,input])=>key!=='title' && input);
        if(!assignmentId && !legacyMode && !course.isTrial && course.studentId && ['guitar','electric'].includes(course.instrument||'guitar')){
          const button=document.createElement('button');
          button.type='button';
          button.dataset.generateHomework='';
          button.textContent='根据课堂记录生成作业草稿';
          const status=document.createElement('p');
          status.setAttribute('role','status');
          status.hidden=true;
          const report=text=>{status.textContent=text;status.hidden=false;};
          const form=root.querySelector('.hw-form');
          form.before(button,status);
          button.onclick=async()=>{
            if(generating)return;
            const current=()=>root.isConnected && root.contains(button) && !root.closest('[hidden]');
            generating=true;
            button.disabled=true;
            try{
              collect();
              if(staleDraft||courseHasDraft||!plainState()||localStorage.getItem(draftKey))
                throw new Error('已有作业草稿，请继续编辑原草稿');
              const lessonContent=String(course.lessonContent||'').trim(),focus=String(course.focus||'').trim();
              if(!lessonContent&&!focus)throw new Error('请先在课表填写课堂记录并完成同步');
              const before=JSON.stringify(state);
              if(await writer.pending(course.id))throw new Error('本课有待确认的作业操作，请先核对');
              if(!current())return;
              collect();
              if(before!==JSON.stringify(state)||localStorage.getItem(draftKey))
                throw new Error('作业表单已修改，已保留当前内容');
              report('正在根据课堂记录生成草稿…');
              const result=await api.request({action:'generateHomeworkDraft',courseId:course.id,studentId:course.studentId,lessonContent,focus},scope);
              if(!current())return;
              collect();
              if(before!==JSON.stringify(state)||localStorage.getItem(draftKey))
                throw new Error('作业表单已修改，已保留当前内容');
              const draft=result && result.draft;
              const filled=(value,max)=>typeof value==='string' && value.trim() && value.length<=max;
              if(result?.workspaceId!==scope || !filled(draft?.title,60) || !Array.isArray(draft.tasks) ||
                 !draft.tasks.length || draft.tasks.length>3 ||
                 draft.tasks.some(item=>!filled(item?.contentText,1000)||!filled(item?.acceptanceCriteria,1500)))
                throw new Error('生成结果不完整，请核对课堂记录');
              state.form.title=draft.title.trim();
              state.tasks=draft.tasks.map(item=>({...model.emptyTask(crypto.randomUUID()),
                contentText:item.contentText.trim(),acceptanceCriteria:item.acceptanceCriteria.trim()}));
              draftWarning='已生成本机草稿，请核对练习内容和验收标准后再发布。';
              paint();
              saveLocal();
            }catch(error){
              if(current())report(error.code==='TIMEOUT'?'生成等待超时，请稍后手动重试。':error.message);
            }finally{
              generating=false;
              if(current())button.disabled=false;
            }
          };
        }
        root.querySelector('[data-add]').onclick=()=>{collect();if(state.mode!=='staged')return message.textContent='仅阶段作业可添加多个任务';if(state.tasks.length>=100)return message.textContent='最多 100 项任务';state.tasks.push(model.emptyTask(crypto.randomUUID()));saveLocal();paint();};
        root.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{collect();const i=Number(button.dataset.index),j=i+Number(button.dataset.move);if(j<0||j>=state.tasks.length)return;[state.tasks[i],state.tasks[j]]=[state.tasks[j],state.tasks[i]];saveLocal();paint();});
        root.querySelectorAll('[data-copy]').forEach(button=>button.onclick=()=>{collect();if(state.tasks.length>=100)return message.textContent='最多 100 项任务';const i=Number(button.dataset.copy);state.tasks.splice(i+1,0,{...state.tasks[i],id:crypto.randomUUID()});saveLocal();paint();});
        root.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{collect();const i=Number(button.dataset.remove);if(state.tasks.length<=1)return;if(['contentText','acceptanceCriteria','startBar','endBar','scheduledDate','suggestedMinutes'].some(key=>state.tasks[i][key])&&!confirm('确认删除这一练习部分？'))return;state.tasks.splice(i,1);saveLocal();paint();});
        const renderSongs=()=>{const select=root.querySelector('[name="song"]'),selected=select.value,known=songs.find(x=>x.id===selected),label=known?known.title:state.form.songTitle||selected, matches=songs.filter(x=>String(x.title||'').toLowerCase().includes(songQuery.trim().toLowerCase()));select.innerHTML='<option value="">不关联曲谱</option>'+(selected&&!matches.some(x=>x.id===selected)?'<option value="'+esc(selected)+'">'+esc(label)+'</option>':'')+matches.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join('');select.value=selected;};
        root.querySelector('[data-song-search]').oninput=event=>{songQuery=event.target.value;renderSongs();};renderSongs();
        // GP 固定版本选取：选中曲谱后查互动谱条目，仅当已发布且版本明确才固定 interactiveRef。
        root.querySelector('[name="song"]').addEventListener('change',async()=>{
          collect();
          const songId=state.form.songId;
          if(!songId){saveLocal();return;}
          message.textContent='正在核对互动谱版本…';
          try{
            const data=await api.request({action:'teacherSheetInteractiveEntry',sheetId:songId});
            if(data && data.interactive && data.interactive.available && data.interactive.scoreId && data.interactive.version){
              state.form.interactiveRef={scoreId:data.interactive.scoreId,version:data.interactive.version};
              message.textContent='已关联互动谱固定版本';
            } else {
              delete state.form.interactiveRef;
              message.textContent='该曲谱暂无互动谱版本，使用图片谱';
            }
            saveLocal();
          }catch(e){delete state.form.interactiveRef;message.textContent='互动谱版本核对失败，继续使用图片谱';saveLocal();}
        });
        root.querySelector('[data-songs]').onclick=async event=>{if(nextCursor==null)return message.textContent='曲谱目录已全部加载';const button=event.currentTarget;button.disabled=true;try{message.textContent='正在读取曲谱…';const data=await api.request({action:'teacherSheetCatalog',instrument:course.instrument||'guitar',cursor:nextCursor});if(!root.contains(button))return;if(!Array.isArray(data.songs))throw new Error('曲谱目录响应不完整');songs=songs.concat(data.songs);nextCursor=data.nextCursor;renderSongs();button.textContent=nextCursor==null?'曲谱目录已加载':'加载更多曲谱';message.textContent=nextCursor==null?'已搜索全部已加载曲谱':'仅搜索已加载曲谱，可继续加载更多';}catch(e){if(root.contains(button))message.textContent='曲谱读取失败：'+e.message;}finally{if(root.contains(button))button.disabled=false;}};
        root.querySelector('[data-search-all]').onclick=async event=>{const button=event.currentTarget,more=root.querySelector('[data-songs]');button.disabled=true;more.disabled=true;try{while(nextCursor!=null){const cursor=nextCursor;message.textContent='正在搜索完整曲谱目录…';const data=await api.request({action:'teacherSheetCatalog',instrument:course.instrument||'guitar',cursor});if(!root.contains(button))return;if(!Array.isArray(data.songs)||!(data.nextCursor===null||Number.isInteger(data.nextCursor)&&data.nextCursor>cursor))throw new Error('曲谱目录响应不完整');songs=songs.concat(data.songs);nextCursor=data.nextCursor;renderSongs();}message.textContent='已搜索完整曲谱目录';more.textContent='曲谱目录已加载';}catch(e){if(root.contains(button))message.textContent='搜索未完成：'+e.message;}finally{if(root.contains(button)){button.disabled=false;more.disabled=false;}}};
        root.querySelector('[name="mode"]').onchange=()=>{const next=value(root,'mode'),previous=state.mode;collect();state.mode=previous;const result=model.switchMode(state,next,()=>crypto.randomUUID());if(result.blocked){message.textContent='后续阶段已有内容，请先处理后再切换';root.querySelector('[name="mode"]').value=state.mode;return;}state=result.state;saveLocal();paint();};
        root.querySelector('[data-cancel]').onclick=onChanged;
        root.querySelector('.hw-form').addEventListener('input',event=>{
          if(event.target.name==='mode')return;
          if(staleDraft)return;
          collect();saveLocal();
        });
        const commit=async publish=>{
          try {
            if(staleDraft)throw new Error('本机草稿与云端版本不一致，请先核对');
            collect();
            if(legacyMode && state.mode!=='staged')throw new Error('历史反馈只能转为阶段作业');
            model.validate(state,{publish});
            if(publish && state.tasks.some(t=>!t.acceptanceCriteria.trim()))throw new Error('请填写每项任务的验收标准');
            if(publish && !confirm('确认发布给该课程学员？'))return;
            message.textContent='正在保存…';
            const record=model.buildAssignment(state,'draft',currentId);
            const saveAction=legacyMode?'saveLegacyCandidate':'saveMixedDraft';
            const publishAction=legacyMode?'publishLegacyCandidate':'publishMixed';
            const saved=await writer.submit({action:saveAction,courseId:course.id,assignmentId:currentId,expectedRevision:revision,assignment:record});
            if(!Number.isInteger(saved.revision))throw new Error('云端版本不明确，请刷新后核对');
            revision=saved.revision;
            localStorage.removeItem(draftKey);
            if(publish){message.textContent='正在发布…';const result=await writer.submit({action:publishAction,courseId:course.id,assignmentId:currentId,expectedRevision:revision});if(!Number.isInteger(result.revision))throw new Error('云端版本不明确，请刷新后核对');}
            await onChanged();
          }catch(e){message.textContent=e.message;await showPending(root,course.id,onChanged).catch(()=>{});}
        };
        root.querySelector('[data-save]').onclick=()=>commit(false);root.querySelector('[data-publish]').onclick=()=>commit(true);
        showPending(root,course.id,onChanged).catch(e=>{message.textContent=e.message;});
      };paint();
    } catch(e){root.textContent='无法打开作业编辑：'+e.message;}
  }
  async function showReview(root,course,plan,assignment,onChanged) {
    const progress=plan.publishedProgress && plan.publishedProgress.assignments.find(a=>a.id===assignment.id),tasks=progress?progress.tasks:[];
    const linked=(plan.knowledgeLinks||[]).filter(l=>l.assignmentId===assignment.id);
    root.innerHTML='<div class="hw-review-head"><div><h3>'+esc(assignment.title)+'</h3><div class="hw-part-actions"><button type="button" data-rename>修改标题</button> <button type="button" data-withdraw>撤回作业</button></div><p>'+esc(course.studentName)+' · '+esc(course.date)+' · 已发布</p></div><p data-practice>正在读取学员练习进度…</p></div><div data-pending class="hw-warning"></div><div class="hw-review-title"><h4>练习任务（'+tasks.length+' 项）</h4><label>筛选 <select data-task-filter aria-label="筛选练习任务"><option value="all">全部任务</option><option value="pending">待验收</option><option value="approved">已通过</option><option value="revision_requested">需加强</option></select></label></div><div class="hw-task-list">'+tasks.map((t,i)=>'<div class="hw-task-row" data-task-row="'+i+'"><div><strong>'+esc(t.contentText||('任务 '+(i+1)))+'</strong><div class="hw-self-practice" data-practice-task="'+i+'">正在读取学员自评…</div>'+(t.acceptanceCriteria?'<p>验收标准：'+esc(t.acceptanceCriteria)+'</p>':'')+'</div><span class="hw-task-status">'+esc(t.status==='approved'?'已通过':t.status==='revision_requested'?'需加强':'待验收')+'</span><div class="hw-task-actions"><button type="button" data-task="'+i+'">'+(t.status==='approved'?'查看':'验收')+'</button><button type="button" data-edit-task="'+i+'">修改任务</button></div></div>').join('')+'</div><div data-review></div><div class="hw-review-panels"><section><h4>综合评价（学员可见）</h4><textarea name="overall" maxlength="300" placeholder="填写给学员的练习建议"></textarea><button type="button" class="primary" data-overall>提交综合评价</button></section><section><h4>知识推荐</h4><div data-knowledge>'+ (linked.length?linked.map(l=>'<div class="hw-assignment"><span>'+esc(l.title||'')+'</span><button type="button" data-unlink="'+esc(l.articleId)+'">取消关联</button></div>').join(''):'<p>暂无关联文章</p>') +'</div><button type="button" data-link-knowledge>关联文章</button><div data-knowledge-picker hidden></div></section><section><h4>验收历史</h4><ul>'+((plan.reviews||[]).filter(r=>r.assignmentId===assignment.id).map(r=>'<li><span>'+esc(r.result==='approved'?'通过':'需加强')+(r.revokedAt?'（已撤销）':'')+' '+esc(r.comment||'')+'</span></li>').join('')||'<li>暂无验收记录</li>')+'</ul></section></div><div role="status" data-message></div>';
    root.querySelector('[data-task-filter]').onchange=event=>{const filter=event.target.value;root.querySelectorAll('[data-task-row]').forEach(row=>{const task=tasks[Number(row.dataset.taskRow)];row.hidden=filter!=='all' && (filter==='pending'?(task.status==='approved'||task.status==='revision_requested'):task.status!==filter);});};
    const message=root.querySelector('[data-message]');
    const assessmentList=(plan.assessments||[]).filter(item=>item.assignmentId===assignment.id && !item.deletedAt);
    if(assessmentList.length){const title=document.createElement('h4'),list=document.createElement('div');title.textContent='综合评价历史';list.innerHTML=assessmentList.map((item,i)=>'<div class="hw-assignment"><span>'+esc(item.comment||'')+'</span><div><button type="button" data-assessment-edit="'+i+'">修改</button> <button type="button" data-assessment-delete="'+i+'">删除</button></div></div>').join('');message.before(title,list);}
    const refresh=()=>onChanged(course,assignment.id);
    const practiceSlot=root.querySelector('[data-practice]');let practiceMarks=null;
    const readPractice=async()=>{
      if(!practiceSlot.isConnected)return;
      practiceMarks=null;practiceSlot.textContent='正在读取学员自评…';
      root.querySelectorAll('[data-practice-task]').forEach(node=>{node.className='hw-self-practice';node.textContent='正在读取学员自评…';});
      try {
        const data=await api.request({action:'teacherPracticeState',courseId:course.id,planId:plan.id});
        if(!practiceSlot.isConnected)return;
        if(data.planId!==plan.id||data.courseId!==course.id||data.revision!==plan.revision||!Array.isArray(data.marks)) throw new Error('版本已变化');
        const marks=data.marks.filter(m=>m.assignmentId===assignment.id && tasks.some(t=>t.id===m.taskId && t.version===m.version));
        if(marks.length!==tasks.length || new Set(marks.map(m=>m.taskId)).size!==tasks.length || marks.some(m=>typeof m.checked!=='boolean'))throw new Error('练习状态不完整');
        practiceMarks=marks;practiceSlot.textContent='学员自评完成：'+marks.filter(m=>m.checked).length+' / '+tasks.length+' 项 · 教师验收另行记录';
        tasks.forEach((task,i)=>{
          const mark=marks.find(m=>m.taskId===task.id && m.version===task.version),node=root.querySelector('[data-practice-task="'+i+'"]');
          if(!node)return;
          node.classList.toggle('is-checked',mark.checked);
          const when=mark.checked && Number.isFinite(mark.checkedAt) && mark.checkedAt>0?new Date(mark.checkedAt):null;
          node.textContent=mark.checked?'学员已自评完成'+(when&&!Number.isNaN(when.getTime())?' · '+when.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):''):'学员尚未标记练习';
        });
      } catch(_){
        if(!practiceSlot.isConnected)return;
        practiceSlot.textContent='学员自评暂时无法读取，不影响教师验收。 ';
        root.querySelectorAll('[data-practice-task]').forEach(node=>{node.textContent='学员自评状态未知';});
        const retry=document.createElement('button');retry.type='button';retry.textContent='重新读取';retry.onclick=readPractice;practiceSlot.append(retry);
      }
    };
    readPractice();
    const submit=async payload=>{try{message.textContent='正在提交…';await writer.submit({...payload,courseId:course.id,assignmentId:assignment.id,expectedRevision:plan.revision});await refresh();}catch(e){message.textContent=e.message;await showPending(root,course.id,refresh).catch(()=>{});}};
    root.querySelector('[data-rename]').onclick=()=>{const title=prompt('修改作业标题（不改变任务和验收记录）',assignment.title);if(title==null)return;const next=title.trim();if(!next||next.length>60||next===assignment.title){message.textContent='请输入不同的 1–60 字标题';return;}if(confirm('确认修改作业标题？'))submit({action:'renameMixed',expectedTitle:assignment.title,title:next});};
    root.querySelector('[data-withdraw]').onclick=()=>{const reason=prompt('撤回原因（学员将看到，必填）');if(reason==null)return;const next=reason.trim();if(!next)return message.textContent='请填写撤回原因';if(confirm('确认撤回这份作业？撤回后学员不再看到，历史验收记录保留。'))submit({action:'withdrawMixed',reason:next});};
    root.querySelector('[data-link-knowledge]').onclick=async()=>{
      const picker=root.querySelector('[data-knowledge-picker]');
      if(!picker.hidden){picker.hidden=true;return;}
      picker.hidden=false;picker.innerHTML='正在读取文章目录…';
      try{
        const data=await api.request({action:'teacherKnowledgeCatalog',cursor:0});
        const articles=data.articles||[];
        const render=()=>{const q=(picker.querySelector('[data-kw]')&&picker.querySelector('[data-kw]').value||'').trim().toLowerCase();picker.querySelector('[data-kw-list]').innerHTML=(articles.filter(a=>!q||String(a.title||'').toLowerCase().includes(q)).map(a=>'<div class="hw-assignment"><span>'+esc(a.title)+'</span><button type="button" data-pick="'+esc(a.id)+'">关联</button></div>').join(''))||'<p>没有匹配文章</p>';picker.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{picker.hidden=true;submit({action:'linkMixedKnowledge',articleId:b.dataset.pick,removeKnowledge:false});});};
        picker.innerHTML=articles.length?'<input type="search" data-kw placeholder="搜索文章"><div data-kw-list></div>':'<p>暂无已发布文章</p>';
        if(articles.length){picker.querySelector('[data-kw]').oninput=render;render();}
      }catch(e){picker.textContent='文章目录读取失败：'+e.message;}
    };
    root.querySelectorAll('[data-unlink]').forEach(button=>button.onclick=()=>{if(confirm('取消关联这篇文章？文章本身不会删除。'))submit({action:'linkMixedKnowledge',articleId:button.dataset.unlink,removeKnowledge:true});});
    root.querySelectorAll('[data-assessment-edit]').forEach(button=>button.onclick=()=>{const a=assessmentList[Number(button.dataset.assessmentEdit)],comment=prompt('修改综合评价（学员可见）',a.comment);if(comment==null)return;const next=comment.trim();if(!next||next.length>300||next===a.comment){message.textContent='请输入不同的 1–300 字评价';return;}if(confirm('确认修改这条综合评价？'))submit({action:'updateMixedAssessment',assessmentId:a.id,expectedAssessedAt:a.assessedAt,expectedComment:a.comment,comment:next});});
    root.querySelectorAll('[data-assessment-delete]').forEach(button=>button.onclick=()=>{const a=assessmentList[Number(button.dataset.assessmentDelete)];if(confirm('确认删除这条综合评价？删除后学员不再看到，原始记录保留审计。'))submit({action:'deleteMixedAssessment',assessmentId:a.id,expectedAssessedAt:a.assessedAt,expectedComment:a.comment});});
    root.querySelectorAll('[data-edit-task]').forEach(button=>button.onclick=()=>{const task=tasks[Number(button.dataset.editTask)],box=root.querySelector('[data-review]'),original=Array.isArray(assignment.tasks)&&assignment.tasks.find(t=>t.id===task.id&&t.version===task.version);if(!practiceMarks)return message.textContent='请先重新读取学员自评，再修改任务';if(!original)return message.textContent='任务版本不一致，请刷新';if(task.status==='approved')return message.textContent='已通过的任务请先撤销验收';box.innerHTML='<h4>修改练习任务</h4><label>练习内容<textarea name="editContent">'+esc(original.contentText||'')+'</textarea></label><label>验收标准<textarea name="editCriteria">'+esc(original.acceptanceCriteria||'')+'</textarea></label><button type="button" data-save-task>保存修改</button>';box.querySelector('[data-save-task]').onclick=()=>{const content=value(box,'editContent').trim(),criteria=value(box,'editCriteria').trim();if(!content||content.length>12000||criteria.length>3000||(assignment.mode==='single'&&!criteria))return message.textContent='请检查练习内容和验收标准';if(content===original.contentText&&criteria===(original.acceptanceCriteria||''))return message.textContent='任务内容没有变化';if(!confirm('保存后此任务将使用新版本，学员需重新练习和验收，旧记录仍保留。确认修改？'))return;submit({action:'editMixedTask',taskId:task.id,taskVersion:task.version,task:{...original,contentText:content,acceptanceCriteria:criteria}});};});
    root.querySelector('[data-overall]').onclick=()=>{const comment=value(root,'overall').trim();if(!comment)return message.textContent='请填写综合评价';submit({action:'assessMixed',comment});};
    root.querySelectorAll('[data-task]').forEach(button=>button.onclick=()=>{
      const task=tasks[Number(button.dataset.task)],box=root.querySelector('[data-review]');
      if(task.status==='approved'){const review=task.latestReview;if(!review || !review.id){box.textContent='验收记录未能核对，请刷新。';return;}box.innerHTML='<h4>撤销验收</h4><label>撤销原因<textarea name="reason"></textarea></label><button type="button" data-revoke>确认撤销</button>';box.querySelector('[data-revoke]').onclick=()=>{const reason=value(box,'reason').trim();if(!reason)return message.textContent='请填写撤销原因';if(confirm('确认撤销此任务的通过验收？'))submit({action:'revokeMixed',taskId:task.id,taskVersion:task.version,reviewId:review.id,reason});};return;}
      box.innerHTML='<h4>教师验收</h4><label>结果<select name="result"><option value="approved">通过</option><option value="revision_requested">需加强</option></select></label><label>教师评价（学员可见）<textarea name="comment"></textarea></label><button type="button" data-submit>提交验收</button>';
      box.querySelector('[data-submit]').onclick=()=>{const result=value(box,'result'),comment=value(box,'comment').trim();if(result==='revision_requested'&&!comment)return message.textContent='需加强时请填写教师评价';submit({action:'reviewMixed',taskId:task.id,taskVersion:task.version,result,comment});};
    });
    await showPending(root,course.id,refresh).catch(e=>{message.textContent=e.message;});
  }
  function showWithdrawn(root,course,plan,assignment) {
    const reviews=(plan.reviews||[]).filter(r=>r.assignmentId===assignment.id);
    root.innerHTML='<h3>'+esc(assignment.title)+'</h3><p>'+esc(course.studentName)+' · '+esc(course.date)+' · 已撤回，只读</p>'+(assignment.withdrawReason?'<p>撤回原因：'+esc(assignment.withdrawReason)+'</p>':'')+'<h4>练习内容</h4><ul>'+(Array.isArray(assignment.tasks)?assignment.tasks.map(t=>'<li><span>'+esc(t.contentText||'未填写')+(t.acceptanceCriteria?' · 验收标准：'+esc(t.acceptanceCriteria):'')+'</span></li>').join(''):'')+'</ul><h4>验收历史</h4><ul>'+(reviews.map(r=>'<li><span>'+esc(r.result==='approved'?'通过':'需加强')+(r.revokedAt?'（已撤销）':'')+' '+esc(r.comment||'')+'</span></li>').join('')||'<li>暂无验收记录</li>')+'</ul>';
  }
  window.TeachingHomeworkEditor={openEditor,showReview,showWithdrawn};
}());
