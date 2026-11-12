/* 课程作业：只读取服务器授权的课程作业；写入入口待接入并验收。 */
(function () {
  'use strict';
  let page = 0, generation = 0, detailGeneration = 0, active = false;
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(root, allCourses, students) {
    if (!root || !root.hidden && active) return;
    active = true;
    const courses = allCourses.filter(c => c && c.id && c.studentId && !c.isTrial).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
    page = Math.min(page, Math.max(0, Math.ceil(courses.length / 28) - 1));
    const items = courses.slice(page * 28, page * 28 + 28), names = new Map(students.map(s => [s.id,s.name]));
    const own = ++generation;
    root.innerHTML = '<div class="hw-toolbar"><span>作业列表</span><div><input type="search" data-search placeholder="搜索本页学员或作业" aria-label="搜索本页学员或作业"> <select data-course aria-label="选择布置作业的课程"><option value="">选择课程</option>'+items.map(c=>'<option value="'+escape(c.id)+'">'+escape(c.date)+' · '+escape(names.get(c.studentId)||'学员待核对')+'</option>').join('')+'</select> <button type="button" class="primary" data-create>布置作业</button> <button type="button" data-refresh>刷新</button></div></div><div class="hw-layout"><div class="hw-list" role="status">正在读取作业…</div><aside class="hw-detail">选择一条作业查看详情</aside></div><div class="hw-pages"><button type="button" data-prev>上一页</button><span>第 '+(page+1)+' 页</span><button type="button" data-next>下一页</button></div>';
    const list=root.querySelector('.hw-list'), detail=root.querySelector('.hw-detail');
    const refresh = () => { active=false; render(root,allCourses,students); };
    root.querySelector('[data-refresh]').onclick=refresh;
    root.querySelector('[data-create]').onclick=()=>{
      const selected=items.find(c=>c.id===root.querySelector('[data-course]').value);
      if(!selected){detail.textContent='请先选择要布置作业的课程';return;}
      window.TeachingHomeworkEditor.openEditor(detail,{...selected,studentName:names.get(selected.studentId)||'学员待核对'},null,refresh);
    };
    const prev=root.querySelector('[data-prev]'),next=root.querySelector('[data-next]');
    prev.disabled=page===0; next.disabled=(page+1)*28>=courses.length;
    prev.onclick=()=>{page--;refresh();};next.onclick=()=>{page++;refresh();};
    if (!window.TeachingDesktopHomework.ready()) { list.textContent='请先连接 GuitarBuddy 并完成同步，再读取课程作业。'; return; }
    if (!items.length) { list.textContent='没有可读取的课程。'; return; }
    window.TeachingDesktopHomework.request({action:'teacherCoursePlans',courseIds:items.map(c=>c.id)}).then(result=>{
      if (own!==generation || root.hidden) return;
      if (!Array.isArray(result.courses)) throw new Error('作业响应不完整');
      const byId=new Map(result.courses.map(x=>[x.courseId,x]));
      const rows=[];
      for (const course of items) {
        const entry=byId.get(course.id);
        if (!entry) { rows.push({course,error:'作业状态未返回'}); continue; }
        if (entry.error) { rows.push({course,error:entry.error}); continue; }
        const plan=entry.plan;
        if (!plan) continue;
        if (!Array.isArray(plan.assignments)) { rows.push({course,error:'历史课程反馈，请在小程序查看'}); continue; }
        const progress=plan.publishedProgress && Array.isArray(plan.publishedProgress.assignments) ? plan.publishedProgress.assignments : [];
        for (const assignment of plan.assignments) {
          const current=progress.find(a=>a.id===assignment.id), tasks=current && Array.isArray(current.tasks)?current.tasks:[];
          rows.push({course,assignment,tasks});
        }
      }
      if (!rows.length) { list.textContent='本页课程暂无作业。'; return; }
      list.innerHTML='<table><thead><tr><th>学员</th><th>课程日期</th><th>课程作业</th><th>类型</th><th>已通过</th><th>待验收</th><th>状态</th><th></th></tr></thead><tbody>'+rows.map((r,i)=>{
        const approved=r.tasks ? r.tasks.filter(t=>t.status==='approved').length : 0;
        const published=r.assignment && r.assignment.lifecycle==='published';
        return '<tr><td>'+escape(names.get(r.course.studentId)||'学员待核对')+'</td><td>'+escape(r.course.date)+'</td><td>'+escape(r.assignment?r.assignment.title:r.error)+'</td><td>'+escape(r.assignment?({staged:'阶段作业',single:'单项任务',free:'自由练习'}[r.assignment.mode]||'作业'):'—')+'</td><td>'+(published?approved+' / '+r.tasks.length:'—')+'</td><td>'+(published?r.tasks.length-approved:'—')+'</td><td>'+escape(r.assignment ? (r.assignment.lifecycle==='published'?'已发布':r.assignment.lifecycle==='draft'?'草稿':'已撤回') : '待核对')+'</td><td><button type="button" data-index="'+i+'" '+(!r.assignment?'disabled':'')+'>查看</button></td></tr>';
      }).join('')+'</tbody></table>';
      root.querySelector('[data-search]').oninput=event=>{const query=event.target.value.trim().toLowerCase();list.querySelectorAll('tbody tr').forEach(tr=>{tr.hidden=!!query&&!tr.textContent.toLowerCase().includes(query);});};
      list.querySelectorAll('[data-index]').forEach(button=>button.onclick=async()=>{
        const row=rows[Number(button.dataset.index)], detailRequest=++detailGeneration;detail.textContent='正在读取作业详情…';
        const openDetail=async()=>{try {
          const response=await window.TeachingDesktopHomework.request({action:'teacherCoursePlan',courseId:row.course.id});
          if (own!==generation || detailRequest!==detailGeneration || root.hidden) return;
          const plan=response.plan, assignment=plan && Array.isArray(plan.assignments) && plan.assignments.find(a=>a.id===row.assignment.id);
          if(!assignment) throw new Error('作业已变化，请刷新列表');
          const progress=plan.publishedProgress && Array.isArray(plan.publishedProgress.assignments) && plan.publishedProgress.assignments.find(item=>item.id===assignment.id);
          if(assignment.lifecycle==='published' && progress && Array.isArray(progress.tasks)){
            const passed=progress.tasks.filter(task=>task.status==='approved').length, cells=button.closest('tr').cells;
            cells[4].textContent=passed+' / '+progress.tasks.length;cells[5].textContent=String(progress.tasks.length-passed);
          }
          const course={...row.course,studentName:names.get(row.course.studentId)||'学员待核对'};
          if(assignment.lifecycle==='draft') await window.TeachingHomeworkEditor.openEditor(detail,course,assignment.id,refresh);
          else if(assignment.lifecycle==='published') await window.TeachingHomeworkEditor.showReview(detail,course,plan,assignment,openDetail);
          else detail.textContent='该作业已撤回，请在小程序查看历史记录。';
        } catch(e) { if(own===generation && detailRequest===detailGeneration && !root.hidden) detail.textContent='读取失败：'+e.message; }};
        await openDetail();
      });
    }).catch(error=>{if(own===generation && !root.hidden) list.textContent='读取失败：'+error.message;});
  }
  document.addEventListener('teaching-sync-state',e=>{
    if (!['error','disconnected','conflict','pending'].includes(e.detail.state)) return;
    active=false; generation++;
    const root=document.getElementById('view-homework');
    if (root && !root.hidden) root.textContent='连接或同步状态已变化，请在同步完成后重新打开课程作业。';
  });
  window.TeachingHomeworkPage={render,leave(){active=false;generation++;}};
}());
