/* GuitarBuddy 课程作业：查询所有课程的作业索引，不以最近 28 节课程代替全量作业。 */
(function () {
  'use strict';
  let page = 0, generation = 0, detailGeneration = 0, active = false;
  const limit=28;
  const escape=value=>String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateLabel=a=>a.lifecycle==='published'?'已发布':a.lifecycle==='draft'?'草稿':a.lifecycle==='withdrawn'?'已撤回':'待核对';
  function render(root, allCourses, students) {
    if (!root || (active && !root.hidden)) return;
    active=true; page=0;
    const source=window.TeachingHomeworkIndex.eligible(allCourses);
    const names=new Map(students.map(s=>[s.id,s.name]));
    const own=++generation;
    root.innerHTML='<div class="hw-toolbar"><span>作业列表</span><div><input type="search" data-search placeholder="搜索全部学员或作业" aria-label="搜索全部学员或作业"> <select data-course aria-label="选择布置作业的课程"><option value="">选择课程</option>'+
      source.map(c=>'<option value="'+escape(c.id)+'">'+escape(c.date)+' · '+escape(names.get(c.studentId)||'学员待核对')+'</option>').join('')+
      '</select> <button type="button" class="primary" data-create>布置作业</button> <button type="button" data-refresh>刷新</button></div></div>'+
      '<div class="hw-status" data-status aria-live="polite">准备读取课程作业…</div>'+
      '<div class="hw-layout"><div class="hw-list" role="status">正在读取作业…</div><aside class="hw-detail">选择一条作业查看详情</aside></div>'+
      '<div class="hw-pages"><button type="button" data-prev>上一页</button><span data-page>第 1 页</span><button type="button" data-next>下一页</button></div>';
    const list=root.querySelector('.hw-list'),detail=root.querySelector('.hw-detail');
    const status=root.querySelector('[data-status]'),search=root.querySelector('[data-search]');
    const prev=root.querySelector('[data-prev]'),next=root.querySelector('[data-next]');
    const showPage=root.querySelector('[data-page]');
    let rows=[],checked=0,total=source.length,errors=0,complete=false,query='';
    const alive=()=>own===generation&&active&&!root.hidden;
    const refresh=()=>{active=false;render(root,allCourses,students);};
    root.querySelector('[data-refresh]').onclick=refresh;
    root.querySelector('[data-create]').onclick=()=>{
      const selected=source.find(c=>c.id===root.querySelector('[data-course]').value);
      if(!selected){detail.textContent='请先选择要布置作业的课程';return;}
      window.TeachingHomeworkEditor.openEditor(detail,{...selected,studentName:names.get(selected.studentId)||'学员待核对'},null,refresh);
    };
    function showRows() {
      if(!alive())return;
      const filtered=rows.filter(r=>!query ||
        [names.get(r.course.studentId),r.course.date,r.assignment&&r.assignment.title,r.error].some(v=>String(v||'').toLowerCase().includes(query)));
      page=Math.min(page,Math.max(0,Math.ceil(filtered.length/limit)-1));
      const sliced=filtered.slice(page*limit,(page+1)*limit);
      prev.disabled=page===0;next.disabled=(page+1)*limit>=filtered.length;
      showPage.textContent='第 '+(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/limit))+' 页 · '+filtered.length+' 条';
      status.textContent=(complete?'查询完成':'正在核对课程')+' · 已检查 '+checked+' / '+total+' 节课程 · 找到 '+rows.filter(r=>r.assignment).length+' 份作业'+
        (errors?' · '+errors+' 批查询失败，结果不完整':'');
      status.classList.toggle('hw-status-warning',errors>0);
      if(!sliced.length) {
        list.textContent=query?'没有匹配的作业':!complete?'正在检查全部课程，请不要把当前空列表当作没有作业…':
          errors?'部分课程未能读取，结果不完整，请稍后刷新。':
          '已检查全部 '+total+' 节课程，未找到与这些课程关联的作业；若小程序仍有作业，请核对完整作业索引。';
        return;
      }
      list.innerHTML='<table><thead><tr><th>学员</th><th>课程日期</th><th>课程作业</th><th>类型</th><th>已通过</th><th>待验收</th><th>状态</th><th>操作</th></tr></thead><tbody>'+
        sliced.map((r,i)=>{
          const approved=r.tasks?r.tasks.filter(t=>t.status==='approved').length:0;
          const published=r.assignment&&r.assignment.lifecycle==='published';
          return '<tr><td>'+escape(names.get(r.course.studentId)||'学员待核对')+'</td>'+
            '<td>'+escape(r.course.date)+'</td>'+
            '<td>'+escape(r.assignment?r.assignment.title:r.error)+'</td>'+
            '<td>'+escape(r.assignment?({staged:'阶段作业',single:'单项任务',free:'自由练习'}[r.assignment.mode]||'作业'):'—')+'</td>'+
            '<td>'+(published?approved+' / '+r.tasks.length:'—')+'</td>'+
            '<td>'+(published?r.tasks.length-approved:'—')+'</td>'+
            '<td>'+escape(r.assignment?stateLabel(r.assignment):'待核对')+'</td>'+
            '<td><button type="button" data-index="'+i+'" '+(!r.assignment?'disabled':'')+'>查看</button></td></tr>';
        }).join('')+'</tbody></table>';
      list.querySelectorAll('[data-index]').forEach(button=>button.onclick=async()=>{
        const row=sliced[Number(button.dataset.index)], requestId=++detailGeneration;
        detail.textContent='正在读取作业详情…';
        const openDetail=async()=>{
          try{
            const response=await window.TeachingDesktopHomework.request({action:'teacherCoursePlan',courseId:row.course.id});
            if(!alive()||requestId!==detailGeneration)return;
            const plan=response.plan;
            const assignment=plan&&Array.isArray(plan.assignments)&&plan.assignments.find(a=>a.id===row.assignment.id);
            if(!assignment)throw new Error('作业已变化，请刷新列表');
            const progress=plan.publishedProgress&&Array.isArray(plan.publishedProgress.assignments)&&plan.publishedProgress.assignments.find(item=>item.id===assignment.id);
            if(assignment.lifecycle==='published'&&progress&&Array.isArray(progress.tasks)) {
              const passed=progress.tasks.filter(task=>task.status==='approved').length,cells=button.closest('tr').cells;
              if(cells){cells[4].textContent=passed+' / '+progress.tasks.length;cells[5].textContent=String(progress.tasks.length-passed);}
            }
            const course={...row.course,studentName:names.get(row.course.studentId)||'学员待核对'};
            if(assignment.lifecycle==='draft')await window.TeachingHomeworkEditor.openEditor(detail,course,assignment.id,refresh);
            else if(assignment.lifecycle==='published')await window.TeachingHomeworkEditor.showReview(detail,course,plan,assignment,openDetail);
            else detail.textContent='该作业已撤回，请在小程序查看历史记录。';
          }catch(e){if(alive()&&requestId===detailGeneration)detail.textContent='读取失败：'+e.message;}
        };
        await openDetail();
      });
    }
    search.oninput=()=>{query=search.value.trim().toLowerCase();page=0;showRows();};
    prev.onclick=()=>{page=Math.max(0,page-1);showRows();};
    next.onclick=()=>{page++;showRows();};
    prev.disabled=true;next.disabled=true;
    if(!window.TeachingDesktopHomework.ready()){status.textContent='请先连接 GuitarBuddy 并完成同步';list.textContent='连接尚未准备好，暂不能读取作业。';return;}
    if(!source.length){complete=true;showRows();return;}
    window.TeachingHomeworkIndex.scan(source,input=>window.TeachingDesktopHomework.request(input),
      progress=>{if(!alive())return;rows=progress.rows;checked=progress.checked;total=progress.total;errors=progress.errors;showRows();},alive
    ).then(result=>{if(!alive())return;rows=result.rows;checked=result.checked;total=result.total;errors=result.errors;complete=true;showRows();})
     .catch(e=>{if(!alive())return;errors++;complete=true;status.textContent='课程作业索引读取未完成';list.textContent='读取失败：'+e.message+'。请重试，不要重新布置已有作业。';});
  }
  document.addEventListener('teaching-sync-state',event=>{
    if(!['error','disconnected','conflict','pending'].includes(event.detail.state))return;
    active=false;generation++;
    const root=document.getElementById('view-homework');
    if(root&&!root.hidden)root.textContent='连接或同步状态已变化，请在同步完成后重新打开课程作业。';
  });
  window.TeachingHomeworkPage={render,leave(){active=false;generation++;}};
}());