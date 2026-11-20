/* 课表内的课程与作业工作台：复用既有 V2.5 作业读写/验收组件，不建立第二套作业记录。 */
(function(){
  'use strict';
  const api=window.TeachingDesktopHomework;
  const editor=window.TeachingHomeworkEditor;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentId=null,activeTab='course',openedSignature='',generation=0;
  const byId=id=>document.getElementById(id);
  const courseFor=()=>currentId?courses.find(c=>c.id===currentId):null;
  const courseName=c=>c?(c.isTrial?c.trialName:studentName(c.studentId)):'';
  const typeName=c=>c?courseKindName(c):'';
  const courseData=c=>({
    ...c,studentName:courseName(c),
    lessonContent:c.lessonContent||c.focus||'',
    isTrial:!!(c.isTrial||courseKind(c)==='trial')
  });
  const signature=()=>{
    const ids=['fStudent','fTrialName','fInstrument','fDate','fStart','fEnd','fHomework','fLessonContent','fNote'];
    return JSON.stringify({fields:ids.map(id=>byId(id)?.value||''),type:courseFormType,status:getRadio('fStatus')});
  };
  function hasUnsavedCourseChanges(){return openedSignature!==signature();}
  function refreshOverview(){
    const kind=typeof courseFormType==='string'?courseFormType:'regular';
    const rawDate=byId('fDate')?.value||'',start=byId('fStart')?.value||'',end=byId('fEnd')?.value||'';
    const name=kind==='trial'?(byId('fTrialName')?.value||'体验课学员'):
      (byId('fStudent')?.selectedOptions?.[0]?.textContent||'未选择学员');
    const status=getRadio('fStatus');
    const statuses={planned:'待上课',done:'已上课',absent:'已请假',cancelled:'已取消'};
    const type=kind==='trial'?'体验课':'常规课';
    const method={regular:'线下授课',trial:'线下体验',online:'网课',home:'上门教学'}[kind]||'线下授课';
    const [sh,sm]=(start||'0:0').split(':').map(Number),[eh,em]=(end||'0:0').split(':').map(Number);
    const mins=start&&end?(eh*60+em)-(sh*60+sm):0;
    const duration=mins>0?mins+' 分钟':'待填写';
    const header=byId('courseWorkspaceContext');
    let weekday='';
    if(/^\d{4}-\d{2}-\d{2}$/.test(rawDate)){
      const day=new Date(rawDate+'T00:00:00').getDay();
      weekday='（周'+'日一二三四五六'[day]+'）';
    }
    if(header)header.textContent=(name||'未选择学员')+'  ·  '+(rawDate.replace(/-/g,'/')||'未定日期')+weekday+
      '  ·  '+(start||'--:--')+' – '+(end||'--:--')+'（'+duration+'）  ·  '+method;
    const values={cwOverviewStatus:statuses[status]||'待确认',cwOverviewType:type,cwOverviewMode:method,cwOverviewDuration:duration};
    for(const [id,display] of Object.entries(values)){
      const el=byId(id);if(el)el.textContent=display;
    }
    const switcher=byId('cwStatusDetail');
    if(switcher)switcher.dataset.status=status;
    const display=byId('courseDurDisplay');
    if(display)display.textContent=duration;
  }
  function context(){
    const c=courseFor(),target=byId('courseWorkspaceContext');
    if(!target)return;
    refreshOverview();
    const sequence=c?courses.filter(x=>x.studentId&&x.studentId===c.studentId&&!(x.isTrial)).sort((a,b)=>
      String(a.date||'').localeCompare(String(b.date||''))||
      String(a.start||'').localeCompare(String(b.start||''))||
      String(a.id||'').localeCompare(String(b.id||''))):[];
    const i=sequence.findIndex(x=>x.id===currentId);
    byId('coursePrev').disabled=i<=0;
    byId('courseNext').disabled=i<0||i>=sequence.length-1;
  }
  function open(id){
    generation++;
    currentId=id||null;activeTab='course';
    byId('courseHomeworkMain').replaceChildren();
    byId('courseProgressMain').replaceChildren();
    byId('courseHomeworkSide').replaceChildren();
    byId('courseProgressSide').replaceChildren();
    openedSignature=signature();
    context();applyTabVisibility();
  }
  function close(){
    generation++;currentId=null;activeTab='course';
    for(const id of ['courseHomeworkMain','courseProgressMain','courseHomeworkSide','courseProgressSide'])byId(id)?.replaceChildren();
  }
  function applyTabVisibility(){
    for(const tab of ['course','homework','progress']){
      const button=document.querySelector('[data-course-tab="'+tab+'"]');
      if(button)button.setAttribute('aria-pressed',String(tab===activeTab));
      const panel=byId(({course:'courseInfoPanel',homework:'courseHomeworkPanel',progress:'courseProgressPanel'})[tab]);
      if(panel)panel.hidden=tab!==activeTab;
    }
    byId('courseActions').hidden=activeTab!=='course';
    const scroller=byId('courseWorkspaceScroll');
    if(scroller)scroller.scrollTop=0;
  }
  function actionHint(host,heading,description){
    host.innerHTML='<section class="cw-empty"><h4>'+esc(heading)+'</h4><p>'+esc(description)+'</p><button type="button" class="primary" data-save-first>保存课程并继续</button></section>';
    host.querySelector('[data-save-first]').onclick=()=>{
      const targetTab=activeTab;
      const id=saveCourse();
      if(id){openCourseModal(id);show(targetTab);}
    };
  }
  function show(tab){
    if(!['course','homework','progress'].includes(tab))return;
    activeTab=tab;generation++;applyTabVisibility();
    if(tab!=='course')load();
  }
  function lessonSide(host,course,plan){
    const count=plan&&Array.isArray(plan.assignments)?plan.assignments.length:0;
    host.innerHTML='<section class="cw-side-card"><h4>本节课程</h4><dl>'+
      '<dt>学员</dt><dd>'+esc(course.studentName)+'</dd>'+
      '<dt>课程类型</dt><dd>'+esc(typeName(course))+'</dd>'+
      '<dt>课程时间</dt><dd>'+esc(course.date+' '+(course.start||''))+'</dd>'+
      '<dt>上课重点</dt><dd class="cw-long">'+esc(course.lessonContent||'暂无上课记录')+'</dd>'+
      '<dt>课程状态</dt><dd>'+esc(({done:'已上',planned:'待上',absent:'已请假',cancelled:'取消'})[course.status]||'待确认')+'</dd>'+
      '<dt>本课作业</dt><dd>'+count+' 份</dd>'+
      '</dl></section><section class="cw-side-card" data-progress-card><h4>学员进度与验收</h4><p>正在核对作业进度…</p></section>';
    const published=plan&&Array.isArray(plan.assignments)?plan.assignments.filter(a=>a.lifecycle==='published'):[];
    const summaries=published.map(a=>{
      const progress=(plan.publishedProgress?.assignments||[]).find(p=>p.id===a.id);
      if(!progress||!Array.isArray(progress.tasks))return esc(a.title)+'：待核对';
      const passed=progress.tasks.filter(x=>x.status==='approved').length;
      return esc(a.title)+'：已通过 '+passed+' / '+progress.tasks.length+' 项';
    });
    const card=host.querySelector('[data-progress-card]');
    card.innerHTML='<h4>学员进度与验收</h4>'+
      (summaries.length?'<div class="cw-progress-lines">'+summaries.map(x=>'<p>'+x+'</p>').join('')+'</div>':'<p>本课暂无已发布作业</p>')+
      '<button type="button" data-to-review>查看进度与验收</button>';
    card.querySelector('[data-to-review]').onclick=()=>show('progress');
  }
  function createHost(where){
    where.replaceChildren();
    const el=document.createElement('div');el.className='cw-editor-host';where.append(el);return el;
  }
  async function load(autoOpenDraft=true){
    const token=++generation,c=courseFor(),mode=activeTab;
    const host=byId(mode==='homework'?'courseHomeworkMain':'courseProgressMain');
    const side=byId(mode==='homework'?'courseHomeworkSide':'courseProgressSide');
    if(!host||!side)return;
    host.textContent='正在读取本课作业…';
    side.replaceChildren();
    if(!c || hasUnsavedCourseChanges()){
      actionHint(host,!c?'请先保存课程':'课程信息尚未保存',!c?'新增课程保存后会自动关联正确的学员和课程。':'先保存当前课程修改，避免作业绑定到错误的学员或课程。');
      return;
    }
    if(c.isTrial||!c.studentId||c.status==='cancelled'||c.status==='absent'){
      host.innerHTML='<div class="cw-empty">当前课程不支持直接布置作业，请确认课程状态和学员绑定。</div>';return;
    }
    if(!api||!api.ready()){
      host.innerHTML='<div class="cw-empty"><h4>请先连接 GuitarBuddy</h4><p>当前不读取也不写入云端作业。连接并同步后再次打开此标签。</p><button data-retry>重新检查</button></div>';
      host.querySelector('[data-retry]').onclick=()=>load();return;
    }
    const live=()=>generation===token&&activeTab===mode&&currentId===c.id&&!byId('courseModal').hidden;
    try{
      const response=await api.request({action:'teacherCoursePlan',courseId:c.id});
      if(!live())return;
      if(!response||!Object.prototype.hasOwnProperty.call(response,'plan'))throw Error('未收到完整课程作业状态');
      const plan=response.plan;
      if(plan&&plan.lessonId&&plan.lessonId!==c.id)throw Error('云端作业课程编号不一致');
      if(plan&&plan.teachingStudentId&&plan.teachingStudentId!==c.studentId)throw Error('云端作业学员编号不一致');
      lessonSide(side,courseData(c),plan);
      if(plan&&!Array.isArray(plan.assignments)){
        host.innerHTML='<div class="cw-empty"><h4>历史课程反馈</h4><p>该课程仍是旧版反馈，请先核对后转换，原记录不会删除。</p><button type="button" data-legacy>查看与转换</button></div>';
        host.querySelector('[data-legacy]').onclick=()=>editor.openEditor(createHost(host),courseData(c),null,()=>load(false));
        return;
      }
      if(plan&&(!plan.publishedProgress||!Array.isArray(plan.publishedProgress.assignments)))
        throw Error('课程作业进度尚未核对，已阻止操作');
      const assignments=plan?.assignments||[];
      const published=assignments.filter(a=>a.lifecycle==='published');
      const drafts=assignments.filter(a=>a.lifecycle==='draft');
      host.innerHTML='<div class="cw-list-head"><h4>'+(mode==='homework'?'本课作业':'进度与验收')+'</h4>'+
        '<button type="button" data-refresh>刷新</button>'+
        (mode==='homework'?'<button type="button" class="primary" data-create>＋ 布置新作业</button>':'')+'</div>'+
        '<div class="cw-assignment-list"></div><div data-editor-slot></div>';
      host.querySelector('[data-refresh]').onclick=()=>load();
      const list=host.querySelector('.cw-assignment-list'),slot=host.querySelector('[data-editor-slot]');
      const shown=mode==='progress'?published:assignments;
      list.innerHTML=shown.length?shown.map(a=>'<button type="button" data-assignment="'+esc(a.id)+'" class="cw-assignment-card"><span><strong>'+esc(a.title||'未命名作业')+'</strong><small>'+esc(({draft:'草稿 · 仅教师可见',published:'已发布 · 学员可见',withdrawn:'已撤回 · 历史保留'})[a.lifecycle]||'待核对')+'</small></span><span>'+ (a.lifecycle==='draft'?'编辑':a.lifecycle==='published'?'查看与验收':'查看历史')+'</span></button>').join(''):'<p class="cw-subtle">'+(mode==='progress'?'还没有可验收的已发布作业。':'本课暂无作业，可以直接布置。')+'</p>';
      const selected=a=>{
        if(!live())return;
        const root=createHost(slot),data=courseData(c),refresh=()=>{if(live())load(false);};
        if(a.lifecycle==='draft')editor.openEditor(root,data,a.id,refresh);
        else if(a.lifecycle==='published')editor.showReview(root,data,plan,a,refresh);
        else editor.showWithdrawn(root,data,plan,a);
      };
      list.querySelectorAll('[data-assignment]').forEach(btn=>btn.onclick=()=>{
        const a=shown.find(x=>x.id===btn.dataset.assignment);
        if(a){selected(a);slot.scrollIntoView({block:'nearest',behavior:'smooth'});}
      });
      if(mode==='homework'){
        host.querySelector('[data-create]').onclick=()=>{
          if(drafts.length){selected(drafts[0]);return;}
          editor.openEditor(createHost(slot),courseData(c),null,()=>{if(live())load(false);});
        };
        if(drafts.length&&autoOpenDraft)selected(drafts[0]);
        else if(!assignments.length&&autoOpenDraft)host.querySelector('[data-create]').click();
      } else if(published.length)selected(published[0]);
    }catch(error){
      if(live())host.innerHTML='<section class="cw-empty"><h4>作业读取失败</h4><p>'+esc(error.message||'请稍后重试')+'</p><p>结果尚未核对，不会新建或覆盖作业。</p><button data-retry>重新读取</button></section>';
      const retry=host.querySelector('[data-retry]');
      if(retry)retry.onclick=()=>load();
    }
  }
  function navigate(direction){
    const c=courseFor();
    if(!c||hasUnsavedCourseChanges()){alert('请先保存课程修改，再切换上一节或下一节。');return;}
    const seq=courses.filter(x=>x.studentId&&x.studentId===c.studentId&&!x.isTrial).sort((a,b)=>
      String(a.date||'').localeCompare(String(b.date||''))||
      String(a.start||'').localeCompare(String(b.start||''))||
      String(a.id||'').localeCompare(String(b.id||'')));
    const i=seq.findIndex(x=>x.id===c.id),next=seq[i+direction];
    if(next)openCourseModal(next.id);
  }
  function init(){
    document.querySelectorAll('[data-course-tab]').forEach(btn=>btn.addEventListener('click',()=>show(btn.dataset.courseTab)));
    byId('coursePrev')?.addEventListener('click',()=>navigate(-1));
    byId('courseNext')?.addEventListener('click',()=>navigate(1));
    const modal=byId('courseModal');
    if(modal){
      const update=event=>{
        if(event.target.closest('#courseInfoPanel'))refreshOverview();
        if(event.target.matches('input[name="fStatus"]'))byId('cwStatusDetail').open=false;
      };
      modal.addEventListener('input',update);
      modal.addEventListener('change',update);
      byId('fCourseType')?.addEventListener('click',refreshOverview);
    }
  }
  window.TeachingCourseWorkspace={init,open,close,show,hasUnsavedCourseChanges};
  init();
})();
