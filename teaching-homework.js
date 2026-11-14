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
    root.innerHTML='<div class="hw-toolbar"><nav class="hw-tabs" aria-label="作业视图"><button type="button" data-tab="courses" aria-pressed="true">按课程管理</button><button type="button" data-tab="all" aria-pressed="false">全部作业</button><button type="button" data-tab="anomalies" aria-pressed="false">异常记录</button></nav><div><input type="search" data-search placeholder="搜索学员、日期或作业" aria-label="搜索学员、日期或作业"><button type="button" data-refresh>刷新</button></div></div>'+
      '<div class="hw-status" data-status aria-live="polite">准备读取课程作业…</div><div data-course-view class="hw-course-layout"><section class="hw-course-panel"><div class="hw-course-heading"><h3>快速选课</h3><select data-range aria-label="课程范围"><option value="recent">近期课程</option><option value="all">全部课程</option></select></div><label class="hw-date">课程日期 <input type="date" data-date></label><div data-courses></div><div class="hw-pages"><button type="button" data-course-prev>上一页</button><span data-course-page></span><button type="button" data-course-next>下一页</button></div></section><section class="hw-detail" data-course-detail>选择一节课程查看作业</section></div>'+
      '<div data-all-view hidden><div class="hw-layout"><div class="hw-list" role="status">正在读取作业…</div><aside class="hw-detail" data-all-detail>选择一条作业查看详情</aside></div><div class="hw-pages"><button type="button" data-prev>上一页</button><span data-page>第 1 页</span><button type="button" data-next>下一页</button></div></div><div class="hw-detail" data-anomalies hidden>异常记录请前往 GuitarBuddy 小程序的「教师小天地 → 异常记录」查看。</div>';
    const list=root.querySelector('.hw-list'),detail=root.querySelector('[data-all-detail]');
    const courseDetail=root.querySelector('[data-course-detail]');
    const status=root.querySelector('[data-status]'),search=root.querySelector('[data-search]');
    const prev=root.querySelector('[data-prev]'),next=root.querySelector('[data-next]');
    const showPage=root.querySelector('[data-page]');
    let rows=[],checked=0,total=source.length,errors=0,complete=false,query='',coursePage=0,selected=null,tab='courses';
    const alive=()=>own===generation&&active&&!root.hidden;
    const refresh=()=>{active=false;render(root,allCourses,students);};
    root.querySelector('[data-refresh]').onclick=refresh;
    function courseRows() {
      const range=root.querySelector('[data-range]').value,date=root.querySelector('[data-date]').value;
      const today=new Date(); today.setHours(0,0,0,0);
      const filtered=source.filter(c=>{
        const day=new Date((c.date||'')+'T00:00:00');
        const recent=Number.isFinite(day.getTime()) && Math.abs(day-today)<=30*86400000;
        return (range==='all'||recent) && (!date||c.date===date) && (!query||[names.get(c.studentId),c.date].some(v=>String(v||'').toLowerCase().includes(query)));
      });
      const size=10; coursePage=Math.min(coursePage,Math.max(0,Math.ceil(filtered.length/size)-1));
      root.querySelector('[data-course-page]').textContent='第 '+(coursePage+1)+' / '+Math.max(1,Math.ceil(filtered.length/size))+' 页 · '+filtered.length+' 节';
      root.querySelector('[data-course-prev]').disabled=coursePage===0;
      root.querySelector('[data-course-next]').disabled=(coursePage+1)*size>=filtered.length;
      const slot=root.querySelector('[data-courses]'),slice=filtered.slice(coursePage*size,(coursePage+1)*size);
      slot.innerHTML=slice.length?slice.map((c,i)=>'<button type="button" class="hw-course-item'+(selected&&selected.id===c.id?' selected':'')+'" data-course-index="'+i+'"><strong>'+escape(names.get(c.studentId)||'学员待核对')+'</strong><span>'+escape(c.date)+' '+escape(c.start||'')+'</span></button>').join(''):'<p class="hw-empty">没有匹配的课程，可切换全部课程或调整筛选。</p>';
      slot.querySelectorAll('[data-course-index]').forEach(button=>button.onclick=()=>{detailGeneration++;selected=slice[Number(button.dataset.courseIndex)];courseRows();showCourse();});
    }
    function showCourse() {
      if(!selected)return;
      const course={...selected,studentName:names.get(selected.studentId)||'学员待核对'};
      const matches=rows.filter(r=>r.course.id===course.id);
      courseDetail.innerHTML='<div class="hw-course-heading"><div><h3>'+escape(course.studentName)+'</h3><p>'+escape(course.date)+' '+escape(course.start||'')+'</p></div><button type="button" class="primary" data-create>布置作业</button></div><h4>本课作业</h4><div data-course-assignments></div><div data-course-editor></div>';
      const assignments=courseDetail.querySelector('[data-course-assignments]'), editor=courseDetail.querySelector('[data-course-editor]');
      assignments.innerHTML=matches.length?matches.map((r,i)=>{const passed=(r.tasks||[]).filter(t=>t.status==='approved').length;return '<div class="hw-assignment"><div><strong>'+escape(r.assignment?r.assignment.title:r.error)+'</strong><p>'+escape(r.assignment?stateLabel(r.assignment):'待核对')+(r.assignment&&r.assignment.lifecycle==='published'?' · 已通过 '+passed+' / '+r.tasks.length:'')+'</p></div>'+(r.assignment?'<button type="button" data-open="'+i+'">查看</button>':'')+'</div>';}).join(''):('<p>'+(!complete?'正在核对作业…':errors?'查询不完整，请刷新后核对。':'本课暂无作业')+'</p>');
      courseDetail.querySelector('[data-create]').onclick=()=>window.TeachingHomeworkEditor.openEditor(editor,course,null,refresh);
      assignments.querySelectorAll('[data-open]').forEach(button=>button.onclick=async()=>{
        const row=matches[Number(button.dataset.open)],requestId=++detailGeneration;
        const open=async()=>{try{editor.textContent='正在读取作业详情…';const response=await window.TeachingDesktopHomework.request({action:'teacherCoursePlan',courseId:course.id});if(!alive()||requestId!==detailGeneration)return;const plan=response.plan,assignment=plan&&Array.isArray(plan.assignments)&&plan.assignments.find(a=>a.id===row.assignment.id);if(!assignment)throw new Error('作业已变化，请刷新列表');if(assignment.lifecycle==='draft')await window.TeachingHomeworkEditor.openEditor(editor,course,assignment.id,refresh);else if(assignment.lifecycle==='published')await window.TeachingHomeworkEditor.showReview(editor,course,plan,assignment,open);else editor.textContent='该作业已撤回，请在小程序查看历史记录。';}catch(e){if(alive()&&requestId===detailGeneration)editor.textContent='读取失败：'+e.message;}};await open();
      });
    }
    root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));root.querySelector('[data-course-view]').hidden=tab!=='courses';root.querySelector('[data-all-view]').hidden=tab!=='all';root.querySelector('[data-anomalies]').hidden=tab!=='anomalies';});
    root.querySelector('[data-range]').onchange=()=>{coursePage=0;courseRows();};
    root.querySelector('[data-date]').onchange=()=>{coursePage=0;courseRows();};
    root.querySelector('[data-course-prev]').onclick=()=>{coursePage--;courseRows();};
    root.querySelector('[data-course-next]').onclick=()=>{coursePage++;courseRows();};
    courseRows();
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
    search.oninput=()=>{query=search.value.trim().toLowerCase();page=0;coursePage=0;courseRows();showRows();};
    prev.onclick=()=>{page=Math.max(0,page-1);showRows();};
    next.onclick=()=>{page++;showRows();};
    prev.disabled=true;next.disabled=true;
    if(!window.TeachingDesktopHomework.ready()){root.querySelector('[data-course-view]').hidden=true;status.textContent='请先连接 GuitarBuddy 并完成同步';list.textContent='连接尚未准备好，暂不能读取作业。';return;}
    if(!source.length){complete=true;showRows();return;}
    window.TeachingHomeworkIndex.scan(source,input=>window.TeachingDesktopHomework.request(input),
      progress=>{if(!alive())return;rows=progress.rows;checked=progress.checked;total=progress.total;errors=progress.errors;showRows();if(selected && !courseDetail.querySelector('[data-course-editor]')?.hasChildNodes())showCourse();},alive
    ).then(result=>{if(!alive())return;rows=result.rows;checked=result.checked;total=result.total;errors=result.errors;complete=true;showRows();if(selected && !courseDetail.querySelector('[data-course-editor]')?.hasChildNodes())showCourse();})
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