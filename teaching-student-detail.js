/* Teacher-only read views; no local cache is treated as live cloud evidence. */
(function(){
 'use strict';
 const api=window.TeachingDesktopHomework,model=window.TeachingStudentInsights;
 const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let state=null,node=null,mode='',epoch=0,reminderNode=null,reminderState=null,reminderEpoch=0,reminderKey='';
 function invalidate(){epoch++;reminderEpoch++;state=null;node=null;reminderState=null;reminderKey='';}
 function draw(){
  if(!node || !node.isConnected || !state)return;
  if(!api.ready()){node.textContent='教师数据尚未同步，请同步后重新读取。';return;}
  if(mode==='binding'){
   if(state.bindingLoading){node.textContent='正在读取绑定状态…';return;}
   if(state.bindingError){node.textContent='绑定状态待核对：'+state.bindingError+' ';const retry=document.createElement('button');retry.textContent='重试';retry.onclick=loadBinding;node.append(retry);return;}
   if(!state.binding){node.innerHTML='<button type="button" data-read-binding>读取绑定状态</button>';node.querySelector('[data-read-binding]').onclick=loadBinding;return;}
   if(Date.now()-state.bindingAt>60000){node.innerHTML='<p>绑定状态已超过 1 分钟，请重新核对。</p><button type="button" data-read-binding>重新读取</button>';node.querySelector('[data-read-binding]').onclick=loadBinding;return;}
   node.innerHTML='<h4>账号绑定 · 只读</h4><dl class="balance-profile"><div><dt>学员编号</dt><dd>已在教师课程表核对</dd></div><div><dt>绑定状态</dt><dd>'+esc(state.binding.status)+'</dd></div><div><dt>关联账号</dt><dd>'+esc(state.binding.accounts.join('、')||'—')+'</dd></div><div><dt>课程与作业授权</dt><dd>需按具体课程和作业核对</dd></div></dl><p class="insight-note">仅读取状态；账号解绑和换绑在教师小天地处理。</p><button type="button" data-read-binding>重新读取</button>';
   node.querySelector('[data-read-binding]').onclick=loadBinding;return;
  }
  const rows=state.rows,failed=rows.some(row=>row.error),published=rows.filter(row=>row.assignments && row.assignments.length);
  const approved=rows.reduce((n,row)=>n+(row.approved||0),0),total=rows.reduce((n,row)=>n+(row.total||0),0);
  const practiceKnown=published.every(row=>row.practiceDone!==null),practiceDone=rows.reduce((n,row)=>n+(row.practiceDone||0),0),practiceTotal=rows.reduce((n,row)=>n+(row.practiceTotal||0),0);
  const trend=rows.filter(row=>!row.error && row.total>0).slice(0,2);
  const trendText=failed?'部分课程读取失败，趋势待核对':trend.length===2?'最近 '+Math.round(100*trend[0].approved/trend[0].total)+'% · 上一节 '+Math.round(100*trend[1].approved/trend[1].total)+'%':'已读取课程不足两节，暂无比较';
  node.innerHTML='<h4>成长档案 · 只读</h4><p class="insight-note">已读取 '+rows.length+' / '+state.courses.length+' 节课程；统计仅覆盖已读取课程。</p><div class="insight-summary"><span>作业 <b>'+(failed?'—':published.reduce((n,r)=>n+r.assignments.length,0))+'</b></span><span>已通过 <b>'+(failed?'—':approved+' / '+total)+'</b></span><span>练习标记 <b>'+(failed || !practiceKnown?'待核对':practiceDone+' / '+practiceTotal)+'</b></span></div><h4>成长趋势</h4><p class="insight-note">'+esc(trendText)+'（按作业任务通过比例）</p><h4>最近学习</h4>'+(rows.length?'<ol class="balance-ledger">'+rows.map(row=>'<li><div><b>'+esc(row.date)+'</b><span>'+esc(row.error?'读取失败':row.legacy?'历史反馈':row.assignments.length?'已发布作业':'暂无已发布作业')+'</span></div>'+(row.error?'<p>'+esc(row.error)+'</p>':row.assignments.map(a=>'<p>'+esc(a.title)+' · '+a.approved+' / '+a.total+' 项通过</p>').join('')+row.reviews.map(r=>'<p>教师评价：'+esc(r.text)+'</p>').join(''))+'</li>').join('')+'</ol>':'<p>暂无已读取课程</p>')+'<h4>课程摘要</h4><ol class="balance-ledger">'+state.courses.slice(0,5).map(c=>'<li><div><b>'+esc(c.date)+'</b><span>'+esc(({planned:'待上',done:'已上',absent:'请假',cancelled:'取消'})[c.status]||'待核对')+'</span></div><p>'+esc(c.lessonContent||'暂无课堂内容')+'</p></li>').join('')+'</ol><button type="button" data-growth-more '+(state.loading||state.cursor>=state.courses.length?'disabled':'')+'>'+(state.loading?'读取中…':'加载更多课程')+'</button> <button type="button" data-growth-refresh '+(state.loading?'disabled':'')+'>重新读取</button>';
  node.querySelector('[data-growth-more]').onclick=loadMore;node.querySelector('[data-growth-refresh]').onclick=()=>{state.rows=[];state.cursor=0;loadMore();};
 }
 async function checkScope(scope){if(await api.scope()!==scope)throw new Error('教师账号已变化，请重新读取');}
 async function loadBinding(){
  if(!state||state.bindingLoading)return;const own=epoch,ref=state;ref.bindingLoading=true;ref.bindingError='';draw();
  try{const scope=await api.scope(), result=await api.request({action:'teacherBindingInfo',teachingStudentId:ref.id});await checkScope(scope);if(own!==epoch||state!==ref)return;ref.binding=model.bindingSummary(ref.id,result);ref.bindingAt=Date.now();}
  catch(e){if(own===epoch&&state===ref){ref.binding=null;ref.bindingError=e.message;}}
  finally{if(own===epoch&&state===ref){ref.bindingLoading=false;draw();}}
 }
 async function loadMore(){
  if(!state||state.loading)return;const own=epoch,ref=state;ref.loading=true;draw();
  try{const scope=await api.scope(),batch=ref.courses.slice(ref.cursor,ref.cursor+5),rows=[];
   for(const course of batch){
    try{const r=await api.request({action:'teacherCoursePlan',courseId:course.id}),plan=r.plan||null;let practice=null;
     if(plan && Array.isArray(plan.assignments) && plan.assignments.some(a=>a.lifecycle==='published')){try{practice=await api.request({action:'teacherPracticeState',courseId:course.id,planId:plan.id});}catch(_){practice=null;}}
     rows.push(model.courseSummary(course,ref.id,plan,practice));
    }catch(e){rows.push({id:course.id,date:course.date||'',error:e.message,assignments:[],reviews:[],approved:0,total:0,practiceDone:null});}
   }
   await checkScope(scope);if(own!==epoch||state!==ref)return;ref.rows.push(...rows);ref.cursor+=batch.length;
  }catch(e){if(own===epoch&&state===ref)ref.error=e.message;}
  finally{if(own===epoch&&state===ref){ref.loading=false;draw();if(ref.error&&node){const p=document.createElement('p');p.textContent=ref.error;node.prepend(p);ref.error='';}}}
 }
 function mount(target,student,courses,tab){
  node=target;mode=tab;if(!student || !api || !model){if(node)node.textContent='学员资料待核对';return;}
  if(!state||state.id!==student.id){epoch++;state={id:student.id,courses:courses.filter(c=>c && c.studentId===student.id && !c.isTrial && c.id).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))),rows:[],cursor:0,loading:false,binding:null,bindingError:'',bindingLoading:false};}
  draw();
  if(!api.ready())return;
  if(tab==='growth' && !state.rows.length && state.courses.length && !state.loading)loadMore();
  if(tab==='binding' && !state.binding && !state.bindingError && !state.bindingLoading)loadBinding();
 }
 function mountReminder(target,students,courses,syncState,today){
  reminderNode=target;
  const ready=!!api && api.ready() && syncState==='saved';
  const key=JSON.stringify(courses.map(c=>[c.id,c.studentId,c.date,c.status,c.isTrial,c.hiddenFromTimetable]));
  if(key!==reminderKey){reminderKey=key;reminderEpoch++;reminderState=null;}
  let balances;
  try{balances=window.TeachingReminders.balances({fresh:ready,syncState,students,courses,today},window.TeachingLessonBalance.statement);}catch(_){balances={available:false};}
  if(!balances.available){target.textContent='提醒待同步：请连接 GuitarBuddy 并完成同步。';return;}
  const date=new Date(today+'T12:00:00');date.setDate(date.getDate()+6);
  const end=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  const upcoming=courses.filter(c=>c && c.date>=today && c.date<=end && c.status==='planned' && !c.hiddenFromTimetable).length;
  const debt=balances.unknown.length?'待核对':balances.low.length,uninitialized=balances.unknown.length?'待核对':balances.uninitialized.length;
  const expired=reminderState && reminderState.checkedAt && Date.now()-reminderState.checkedAt>60000;
  const pending=expired?'待重新核对':reminderState && reminderState.pending!=null?reminderState.pending:'待读取';
  const followup=expired?'待重新核对':reminderState && reminderState.followup!=null?reminderState.followup:'待读取';
  target.innerHTML='<div class="insight-reminders"><b>待处理</b><span>今天起 7 天课程 '+upcoming+'</span><span>待跟进作业（上次核对） '+esc(followup)+'</span><span>待验收任务（上次核对） '+esc(pending)+'</span><span>低课时 '+esc(debt)+'</span><span>未初始化 '+esc(uninitialized)+'</span><button type="button" data-reminder-refresh>'+(reminderState && reminderState.loading?'读取中…':'核对作业')+'</button></div>';
  const button=target.querySelector('[data-reminder-refresh]');button.disabled=!!(reminderState && reminderState.loading);
  button.onclick=async()=>{
   if(!api.ready())return;const own=reminderEpoch,ref={loading:true,pending:null};reminderState=ref;mountReminder(reminderNode,students,courses,syncState,today);
   try{
    const scope=await api.scope(),eligible=courses.filter(c=>c && c.id && c.studentId && !c.isTrial),ids=[...new Set(eligible.map(c=>c.id))],followups=new Set();let count=0;
    for(let start=0;start<ids.length;start+=28){const batch=ids.slice(start,start+28),r=await api.request({action:'teacherCoursePlans',courseIds:batch});
     if(!Array.isArray(r.courses)||r.courses.length!==batch.length||new Set(r.courses.map(x=>x.courseId)).size!==batch.length||r.courses.some(x=>!batch.includes(x.courseId)||x.error))throw new Error('部分作业状态无法读取');
     for(const item of r.courses){if(!item.plan||!Array.isArray(item.plan.assignments))continue;
      const progress=item.plan.publishedProgress && item.plan.publishedProgress.assignments;if(!Array.isArray(progress))throw new Error('作业进度不完整');
      if(item.plan.assignments.some(a=>!a || typeof a.id!=='string' || !a.id) || new Set(item.plan.assignments.map(a=>a.id)).size!==item.plan.assignments.length || new Set(progress.map(a=>a.id)).size!==progress.length)throw new Error('作业记录重复');
      for(const assignment of item.plan.assignments.filter(a=>a.lifecycle==='published')){const p=progress.find(a=>a.id===assignment.id);if(!p||!Array.isArray(p.tasks)||p.tasks.some(t=>!['approved','revision_requested','not_started'].includes(t.status)))throw new Error('作业进度不完整');const pendingTasks=p.tasks.filter(t=>t.status!=='approved').length;count+=pendingTasks;if(pendingTasks)followups.add(JSON.stringify([item.courseId,assignment.id]));}
     }
    }
    await checkScope(scope);if(own!==reminderEpoch||reminderState!==ref)return;ref.pending=count;ref.followup=followups.size;ref.checkedAt=Date.now();
   }catch(_){if(own===reminderEpoch&&reminderState===ref){ref.pending='待核对';ref.followup='待核对';}}
   finally{if(own===reminderEpoch&&reminderState===ref){ref.loading=false;if(reminderNode&&reminderNode.isConnected)mountReminder(reminderNode,students,courses,syncState,today);}}
  };
 }
 window.addEventListener('teaching-sync-state',event=>{if(['disconnected','error','pending','conflict'].includes(event.detail.state))invalidate();});
 window.TeachingStudentDetail={mount,mountReminder,invalidate};
}());
