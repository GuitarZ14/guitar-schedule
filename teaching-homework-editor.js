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
  async function openEditor(root,course,assignmentId,onChanged) {
    root.textContent='正在读取课程作业…';
    try {
      const plan=await readPlan(course.id);
      if(plan && !Array.isArray(plan.assignments)) throw new Error('该课程为历史反馈，请先在小程序核对');
      const scope=await api.scope();
      let assignment=assignmentId && plan && plan.assignments.find(a=>a.id===assignmentId);
      if(assignmentId && (!assignment || assignment.lifecycle!=='draft')) throw new Error('该作业不是可编辑草稿，请刷新');
      let state=assignment ? model.applyAssignment(assignment) : model.createState('staged',()=>crypto.randomUUID());
      let currentId=assignment ? assignment.id : crypto.randomUUID(), revision=plan ? plan.revision : 0;
      const draftKey='gb_hw_editor_v1_'+scope+'_'+course.id+'_'+(assignmentId||'new');
      let draftWarning='',staleDraft=false;
      try {
        const draft=JSON.parse(localStorage.getItem(draftKey)||'null');
        if(draft && draft.revision===revision && draft.state && draft.currentId){state=draft.state;currentId=draft.currentId;draftWarning='已恢复本机草稿，提交前请核对。';}
        else if(draft) {staleDraft=true;draftWarning='本机草稿对应的云端版本已变化，请先核对；未覆盖本机草稿。';}
      } catch(_) {staleDraft=true;draftWarning='本机草稿无法读取，请检查浏览器存储。';}
      let songs=[], nextCursor=0;
      const paint=()=>{
        root.innerHTML='<h3>布置作业</h3><p>'+esc(course.date)+' · '+esc(course.studentName)+'</p><div data-pending class="hw-warning"></div><div class="hw-form"><label>作业类型<select name="mode"><option value="staged">阶段作业</option><option value="single">单项任务</option><option value="free">自由练习</option></select></label><label>作业名称<input name="title" maxlength="200" value="'+esc(state.form.title)+'"></label><label>教师要求<textarea name="notes" maxlength="2000">'+esc(state.form.notes)+'</textarea></label><label>关联曲谱（选填）<select name="song"><option value="">不关联曲谱</option>'+(state.form.songId && !songs.some(s=>s.id===state.form.songId)?'<option value="'+esc(state.form.songId)+'">'+esc(state.form.songTitle||state.form.songId)+'</option>':'')+songs.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join('')+'</select></label><button type="button" data-songs>'+(songs.length?'加载更多曲谱':'加载曲谱目录')+'</button><label class="hw-check"><input type="checkbox" name="tracking"> 跟踪练习小节</label><label>练习结束小节<input name="totalBars" inputmode="numeric" value="'+esc(state.form.totalBars)+'"></label><div data-tasks>'+state.tasks.map((t,i)=>'<fieldset><legend>任务 '+(i+1)+'</legend><label>练习内容<textarea data-task="contentText">'+esc(t.contentText)+'</textarea></label><label>验收标准<input data-task="acceptanceCriteria" value="'+esc(t.acceptanceCriteria)+'"></label><div class="hw-fields"><label>开始小节<input data-task="startBar" value="'+esc(t.startBar)+'"></label><label>结束小节<input data-task="endBar" value="'+esc(t.endBar)+'"></label></div></fieldset>').join('')+'</div><button type="button" data-add>添加阶段</button><div role="status" data-message></div><div class="hw-buttons"><button type="button" data-save>保存草稿</button><button type="button" class="primary" data-publish>发布作业</button><button type="button" data-cancel>返回</button></div></div>';
        root.querySelector('[name="mode"]').value=state.mode;root.querySelector('[name="tracking"]').checked=state.form.trackingEnabled;
        root.querySelector('[name="song"]').value=state.form.songId;
        const message=root.querySelector('[data-message]');
        message.textContent=draftWarning;
        const collect=()=>{
          state.mode=value(root,'mode');const songId=value(root,'song');if(songId!==state.form.songId){const selected=songs.find(s=>s.id===songId);state.form.songId=songId;state.form.songVersion=selected?String(selected.version||''):'';state.form.songTitle=selected?selected.title:'';delete state.form.interactiveRef;}Object.assign(state.form,{title:value(root,'title'),notes:value(root,'notes'),trackingEnabled:root.querySelector('[name="tracking"]').checked,totalBars:value(root,'totalBars')});
          root.querySelectorAll('fieldset').forEach((element,i)=>{for(const key of ['contentText','acceptanceCriteria','startBar','endBar']) state.tasks[i][key]=element.querySelector('[data-task="'+key+'"]').value;});
        };
        root.querySelector('[data-add]').onclick=()=>{collect();if(state.mode!=='staged')return message.textContent='仅阶段作业可添加多个任务';if(state.tasks.length>=100)return message.textContent='最多 100 项任务';state.tasks.push(model.emptyTask(crypto.randomUUID()));paint();};
        root.querySelector('[data-songs]').onclick=async()=>{if(nextCursor==null)return message.textContent='曲谱目录已全部加载';try{collect();message.textContent='正在读取曲谱…';const data=await api.request({action:'teacherSheetCatalog',instrument:course.instrument||'guitar',cursor:nextCursor});if(!Array.isArray(data.songs))throw new Error('曲谱目录响应不完整');songs=songs.concat(data.songs);nextCursor=data.nextCursor;paint();}catch(e){message.textContent='曲谱读取失败：'+e.message;}};
        root.querySelector('[name="mode"]').onchange=()=>{const next=value(root,'mode'),previous=state.mode;collect();state.mode=previous;const result=model.switchMode(state,next,()=>crypto.randomUUID());if(result.blocked){message.textContent='后续阶段已有内容，请先处理后再切换';root.querySelector('[name="mode"]').value=state.mode;return;}state=result.state;paint();};
        root.querySelector('[data-cancel]').onclick=onChanged;
        root.querySelector('.hw-form').addEventListener('input',event=>{
          if(event.target.name==='mode')return;
          if(staleDraft)return;
          try {collect();localStorage.setItem(draftKey,JSON.stringify({revision,currentId,state}));}
          catch(_){message.textContent='本机草稿保存失败，请勿关闭页面';}
        });
        const commit=async publish=>{
          try {
            if(staleDraft)throw new Error('本机草稿与云端版本不一致，请先核对');
            collect();model.validate(state,{publish});
            if(publish && state.tasks.some(t=>!t.acceptanceCriteria.trim()))throw new Error('请填写每项任务的验收标准');
            if(publish && !confirm('确认发布给该课程学员？'))return;
            message.textContent='正在保存…';
            const record=model.buildAssignment(state,'draft',currentId);
            const saved=await writer.submit({action:'saveMixedDraft',courseId:course.id,assignmentId:currentId,expectedRevision:revision,assignment:record});
            if(!Number.isInteger(saved.revision))throw new Error('云端版本不明确，请刷新后核对');
            revision=saved.revision;
            localStorage.removeItem(draftKey);
            if(publish){message.textContent='正在发布…';const result=await writer.submit({action:'publishMixed',courseId:course.id,assignmentId:currentId,expectedRevision:revision});if(!Number.isInteger(result.revision))throw new Error('云端版本不明确，请刷新后核对');}
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
    root.innerHTML='<div class="hw-review-head"><div><h3>'+esc(assignment.title)+'</h3><p>'+esc(course.studentName)+' · '+esc(course.date)+' · 已发布</p></div><p data-practice>正在读取学员练习进度…</p></div><div data-pending class="hw-warning"></div><div class="hw-review-title"><h4>练习任务（'+tasks.length+' 项）</h4><label>筛选 <select data-task-filter aria-label="筛选练习任务"><option value="all">全部任务</option><option value="pending">待验收</option><option value="approved">已通过</option><option value="revision_requested">需加强</option></select></label></div><div class="hw-task-list">'+tasks.map((t,i)=>'<div class="hw-task-row" data-task-row="'+i+'"><div><strong>'+esc(t.contentText||('任务 '+(i+1)))+'</strong><small data-practice-task="'+i+'"></small>'+(t.acceptanceCriteria?'<p>验收标准：'+esc(t.acceptanceCriteria)+'</p>':'')+'</div><span class="hw-task-status">'+esc(t.status==='approved'?'已通过':t.status==='revision_requested'?'需加强':'待验收')+'</span><button type="button" data-task="'+i+'">'+(t.status==='approved'?'查看':'验收')+'</button></div>').join('')+'</div><div data-review></div><div class="hw-review-panels"><section><h4>综合评价（学员可见）</h4><textarea name="overall" maxlength="300" placeholder="填写给学员的练习建议"></textarea><button type="button" class="primary" data-overall>提交综合评价</button></section><section><h4>验收历史</h4><ul>'+((plan.reviews||[]).filter(r=>r.assignmentId===assignment.id).map(r=>'<li><span>'+esc(r.result==='approved'?'通过':'需加强')+(r.revokedAt?'（已撤销）':'')+' '+esc(r.comment||'')+'</span></li>').join('')||'<li>暂无验收记录</li>')+'</ul></section></div><div role="status" data-message></div>';
    root.querySelector('[data-task-filter]').onchange=event=>{const filter=event.target.value;root.querySelectorAll('[data-task-row]').forEach(row=>{const task=tasks[Number(row.dataset.taskRow)];row.hidden=filter!=='all' && (filter==='pending'?(task.status==='approved'||task.status==='revision_requested'):task.status!==filter);});};
    const message=root.querySelector('[data-message]');
    const assessmentList=(plan.assessments||[]).filter(item=>item.assignmentId===assignment.id && !item.deletedAt);
    if(assessmentList.length){const title=document.createElement('h4'),list=document.createElement('ul');title.textContent='综合评价历史';assessmentList.forEach(item=>{const li=document.createElement('li');li.textContent=item.comment||'';list.append(li);});message.before(title,list);}
    const refresh=()=>onChanged(course,assignment.id);
    const practiceSlot=root.querySelector('[data-practice]');
    api.request({action:'teacherPracticeState',courseId:course.id,planId:plan.id}).then(data=>{
      if(!practiceSlot.isConnected)return;
      if(data.planId!==plan.id||data.courseId!==course.id||data.revision!==plan.revision||!Array.isArray(data.marks)) throw new Error('版本已变化');
      const marks=data.marks.filter(m=>m.assignmentId===assignment.id && tasks.some(t=>t.id===m.taskId && t.version===m.version));
      if(marks.length!==tasks.length || new Set(marks.map(m=>m.taskId)).size!==tasks.length)throw new Error('练习状态不完整');
      practiceSlot.textContent='学员练习进度：'+marks.filter(m=>m.checked).length+' / '+tasks.length;
      tasks.forEach((task,i)=>{const mark=marks.find(m=>m.taskId===task.id && m.version===task.version),node=root.querySelector('[data-practice-task="'+i+'"]');if(node)node.textContent=mark && mark.checked?' · 已标记练习':' · 未标记练习';});
    }).catch(()=>{if(practiceSlot.isConnected)practiceSlot.textContent='学员练习进度暂不可读取，请稍后重试';});
    const submit=async payload=>{try{message.textContent='正在提交…';await writer.submit({...payload,courseId:course.id,assignmentId:assignment.id,expectedRevision:plan.revision});await refresh();}catch(e){message.textContent=e.message;await showPending(root,course.id,refresh).catch(()=>{});}};
    root.querySelector('[data-overall]').onclick=()=>{const comment=value(root,'overall').trim();if(!comment)return message.textContent='请填写综合评价';submit({action:'assessMixed',comment});};
    root.querySelectorAll('[data-task]').forEach(button=>button.onclick=()=>{
      const task=tasks[Number(button.dataset.task)],box=root.querySelector('[data-review]');
      if(task.status==='approved'){box.textContent='该任务已通过；如需撤销，请在教师小天地操作。';return;}
      box.innerHTML='<h4>教师验收</h4><label>结果<select name="result"><option value="approved">通过</option><option value="revision_requested">需加强</option></select></label><label>教师评价（学员可见）<textarea name="comment"></textarea></label><button type="button" data-submit>提交验收</button>';
      box.querySelector('[data-submit]').onclick=()=>{const result=value(box,'result'),comment=value(box,'comment').trim();if(result==='revision_requested'&&!comment)return message.textContent='需加强时请填写教师评价';submit({action:'reviewMixed',taskId:task.id,taskVersion:task.version,result,comment});};
    });
    await showPending(root,course.id,refresh).catch(e=>{message.textContent=e.message;});
  }
  window.TeachingHomeworkEditor={openEditor,showReview};
}());
