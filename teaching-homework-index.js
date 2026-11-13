(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingHomeworkIndex = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BATCH_SIZE = 28;
  function eligible(courses) {
    const seen = new Set();
    return (courses || []).filter(c => {
      if (!c || typeof c.id !== 'string' || !c.id || !c.studentId || c.isTrial || seen.has(c.id)) return false;
      seen.add(c.id); return true;
    }).sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.start || '').localeCompare(String(a.start || '')) || String(a.id).localeCompare(String(b.id)));
  }
  function extract(items, response) {
    if (!response || !Array.isArray(response.courses) || response.courses.length !== items.length)
      throw new Error('课程作业批量响应不完整');
    const ids = new Set(items.map(c=>c.id)), found = new Map(), rows = [];
    for (const item of response.courses) {
      if (!item || !ids.has(item.courseId) || found.has(item.courseId))
        throw new Error('云端课程作业归属或编号异常');
      found.set(item.courseId, item);
    }
    for (const course of items) {
      const entry = found.get(course.id);
      if (!entry) throw new Error('云端课程作业未覆盖本批课程');
      if (entry.error) { rows.push({course, error:String(entry.error)}); continue; }
      if (!Object.prototype.hasOwnProperty.call(entry, 'plan')) throw new Error('课程作业状态缺失');
      const plan=entry.plan;
      if (!plan) continue;
      if (plan.lessonId && plan.lessonId !== course.id) throw new Error('作业关联的课程编号不一致');
      if (plan.teachingStudentId && plan.teachingStudentId !== course.studentId)
        throw new Error('作业关联的学员编号不一致');
      if (!Array.isArray(plan.assignments)) {
        rows.push({course,error:plan.kind==='courseFeedback'?'历史课程反馈，请在小程序查看':'旧版作业待核对'});
        continue;
      }
      if (!plan.publishedProgress || !Array.isArray(plan.publishedProgress.assignments))
        throw new Error('课程作业进度不完整');
      for (const assignment of plan.assignments) {
        if (!assignment || !assignment.id) throw new Error('任务编号无效');
        const progress=plan.publishedProgress.assignments.find(a=>a.id===assignment.id);
        const tasks=progress && Array.isArray(progress.tasks)?progress.tasks:[];
        rows.push({course,assignment,tasks});
      }
    }
    return rows;
  }
  async function scan(courses, request, onProgress, shouldContinue) {
    const source=eligible(courses);
    const batches=[];
    for(let i=0;i<source.length;i+=BATCH_SIZE)batches.push(source.slice(i,i+BATCH_SIZE));
    const indexed=new Array(batches.length);
    let next=0, checked=0, errors=0;
    async function worker() {
      while(next<batches.length) {
        if (shouldContinue && !shouldContinue()) return;
        const index=next++, batch=batches[index];
        try {
          const response=await request({action:'teacherCoursePlans',courseIds:batch.map(c=>c.id)});
          if (shouldContinue && !shouldContinue()) return;
          indexed[index]=extract(batch,response);
        } catch(error) {
          indexed[index]=[{course:batch[0],error:'第 '+(index+1)+' 批读取失败：'+(error && error.message || '未知错误'),batchFailure:true}];
          errors++;
        }
        checked+=batch.length;
        if (onProgress) onProgress({checked,total:source.length,found:indexed.flat().filter(x=>x && x.assignment).length,errors,
          rows:indexed.flat().filter(Boolean)});
      }
    }
    await Promise.all(Array.from({length:Math.min(2,batches.length)},()=>worker()));
    return {rows:indexed.flat().filter(Boolean),checked,total:source.length,errors};
  }
  return {eligible,extract,scan,BATCH_SIZE};
}));