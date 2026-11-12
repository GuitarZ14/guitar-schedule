(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingStudentInsights = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function courseSummary(course, studentId, plan, practice) {
    if (!course || course.studentId !== studentId || !course.id) throw new Error('课程与学员归属不一致');
    const row={id:course.id,date:course.date||'',status:course.status||'',content:course.lessonContent||'',assignments:[],reviews:[],approved:0,total:0,practiceDone:null,practiceTotal:null};
    if(!plan)return row;
    if(!Array.isArray(plan.assignments)) { if(plan.courseStudentId!==studentId)throw new Error('历史作业与学员不一致');row.legacy=true; return row; }
    if(plan.teachingStudentId!==studentId || plan.lessonId!==course.id)throw new Error('作业与课程学员不一致');
    const published=plan.assignments.filter(a=>a && a.lifecycle==='published');
    const projection=plan.publishedProgress && plan.publishedProgress.assignments;
    if(!Array.isArray(projection))throw new Error('作业进度暂不可读取');
    const ids=new Set(published.map(a=>a.id));
    for(const a of published){
      const entry=projection.find(item=>item.id===a.id),tasks=entry && entry.tasks;
      if(!Array.isArray(tasks) || !Array.isArray(a.tasks) || tasks.length!==a.tasks.length || new Set(tasks.map(t=>t.id)).size!==tasks.length || tasks.some(t=>!['approved','revision_requested','not_started'].includes(t.status) || !a.tasks.some(raw=>raw.id===t.id && raw.version===t.version)))throw new Error('作业任务版本不一致');
      const approved=tasks.filter(t=>t.status==='approved').length;
      row.approved+=approved; row.total+=tasks.length;
      row.assignments.push({title:a.title||'课程作业',approved,total:tasks.length});
    }
    row.reviews=[...(plan.reviews||[]).filter(r=>r && ids.has(r.assignmentId) && !r.revokedAt && typeof r.comment==='string' && r.comment.trim()).map(r=>({text:r.comment,at:r.reviewedAt||0})),
      ...(plan.assessments||[]).filter(r=>r && ids.has(r.assignmentId) && !r.deletedAt && typeof r.comment==='string' && r.comment.trim()).map(r=>({text:r.comment,at:r.assessedAt||0}))].sort((a,b)=>b.at-a.at).slice(0,3);
    if(practice && practice.planId===plan.id && practice.courseId===course.id && practice.revision===plan.revision && Array.isArray(practice.marks)){
      const marks=practice.marks.filter(m=>ids.has(m.assignmentId));
      const expected=published.flatMap(a=>a.tasks.map(t=>JSON.stringify([a.id,t.id,t.version]))), actual=marks.map(m=>JSON.stringify([m.assignmentId,m.taskId,m.version]));
      if(marks.length===row.total && marks.every(m=>typeof m.checked==='boolean') && new Set(actual).size===row.total && expected.every(key=>actual.includes(key))){row.practiceDone=marks.filter(m=>m.checked===true).length;row.practiceTotal=row.total;}
    }
    return row;
  }
  function bindingSummary(expectedId, result){
    if(!result || result.teachingStudentId!==expectedId || typeof result.conflict!=='boolean' || !Number.isInteger(result.activeCount) || !Array.isArray(result.guardians))throw new Error('绑定状态暂不可核实');
    if(result.conflict || result.activeCount>1)return {status:'存在绑定冲突，请人工核对',accounts:[]};
    if(result.activeCount===0){if(result.guardians.length)throw new Error('绑定状态暂不可核实');return {status:result.pendingCount || result.awaitingCount?'待学生确认':'未绑定',accounts:[]};}
    if(result.activeCount!==1 || result.guardians.length!==1 || result.guardians[0].status!=='active' || typeof result.guardians[0].label!=='string')throw new Error('绑定状态暂不可核实');
    return {status:'已绑定',accounts:[result.guardians[0].label]};
  }
  return {courseSummary,bindingSummary};
}));
