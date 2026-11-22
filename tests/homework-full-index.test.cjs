'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {eligible,extract,scan,BATCH_SIZE}=require('../teaching-homework-index');
const course=i=>({id:'c'+i,studentId:'student'+(i%4),date:'2026-11-'+String(30-i%25).padStart(2,'0'),start:'10:00',isTrial:false});
const assignment=(id='a1')=>({id,title:'模拟作业'+id,mode:'staged',lifecycle:'published'});
const plan=(courseId,studentId,assignments=[assignment()])=>({lessonId:courseId,teachingStudentId:studentId,assignments,
  publishedProgress:{assignments:assignments.map(a=>({id:a.id,tasks:[{status:'approved'},{status:'pending'}]}))}});
test('only eligible distinct lessons are scanned; course dates sort newest first',()=>{
 const items=eligible([course(4),{...course(4),date:'2026-12-10'},course(1),{...course(2),isTrial:true},{id:'bad'},null]);
 assert.deepEqual(items.map(c=>c.id),['c1','c4']);
});
test('scans every course in 28-course batches and finds assignments outside first batch',async()=>{
 const courses=Array.from({length:87},(_,i)=>course(i));
 const tail=new Set(eligible(courses).slice(-2).map(c=>c.id));
 const observed=[],progress=[];
 const result=await scan(courses,async input=>{
  observed.push(input.courseIds);
  return {courses:input.courseIds.map(id=>({courseId:id,plan:tail.has(id)?
    plan(id,courses.find(c=>c.id===id).studentId):null}))};
 },p=>progress.push(p));
 assert.equal(observed.length,4);
 assert.equal(result.total,87);assert.equal(result.checked,87);assert.equal(result.errors,0);
 assert.equal(result.rows.filter(r=>r.assignment).length,2);
 assert(result.rows.some(r=>tail.has(r.course.id)));
 assert(progress.length>=4);
 assert.equal(progress.at(-1).checked,87);
 assert(progress[0].checked < result.total);
 assert(progress.some(p=>p.found===0 && p.checked>0));
});
test('keeps legacy rows and draft/withdrawn assignments for teacher investigation',()=>{
 const c=course(1),draft={...assignment('draft1'),lifecycle:'draft'},withdrawn={...assignment('withdrawn1'),lifecycle:'withdrawn'};
 const result=extract([c],{courses:[{courseId:c.id,plan:plan(c.id,c.studentId,[draft,withdrawn])}]});
 assert.deepEqual(result.map(x=>x.assignment.lifecycle),['draft','withdrawn']);
 const legacy=extract([c],{courses:[{courseId:c.id,plan:{kind:'courseFeedback',courseStudentId:c.studentId}}]});
 assert.equal(legacy.length,1);assert.match(legacy[0].error,/历史课程反馈/);
});
test('rejects invalid, duplicated or unscoped batch responses instead of calling them empty',()=>{
 const c=course(2);
 assert.throws(()=>extract([c],{courses:[]}),/不完整/);
 assert.throws(()=>extract([c],{courses:[{courseId:'other',plan:null}]}),/编号异常/);
 assert.throws(()=>extract([c],{courses:[{courseId:c.id,plan:plan(c.id,'unrelated')}] }),/学员编号不一致/);
 assert.throws(()=>extract([c],{courses:[{courseId:c.id,plan:{lessonId:'wrong'}}]}),/课程编号不一致/);
 assert.throws(()=>extract([c],{courses:[{courseId:c.id}]}),/状态缺失/);
});
test('one failed batch shows incomplete state while retaining verified assignments',async()=>{
 const courses=Array.from({length:59},(_,i)=>course(i));
 const result=await scan(courses,async({courseIds})=>{
  if(courseIds.includes('c29'))throw new Error('test network glitch');
  return {courses:courseIds.map(id=>({courseId:id,plan:plan(id,courses.find(c=>c.id===id).studentId)}))};
 });
 assert(result.errors>=1);
 assert(result.rows.some(r=>r.batchFailure));
 assert(result.rows.some(r=>r.assignment));
 assert.equal(result.checked,59);
});
test('stop flag prevents queued scans when user leaves page',async()=>{
 const courses=Array.from({length:90},(_,i)=>course(i));
 let current=true,called=0;
 const result=await scan(courses,async ({courseIds})=>{
  called++;current=false;return{courses:courseIds.map(id=>({courseId:id,plan:null}))};
 },null,()=>current);
 assert(called<=2);
 assert(result.checked<90);
});
test('page now scans all assignments and PWA assets have a fresh version',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../teaching-homework.js'),'utf8');
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const cache=fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8');
 assert(html.includes('TeachingHomeworkIndex.scan(source'));
 assert(html.includes('正在检查全部课程'));
 assert(html.includes('部分课程未能读取'));
 assert(!html.includes('courses.slice(page * 28'));
 assert(index.includes('./teaching-homework-index.js?v=20261118-batch-recovery-v1'));
 assert(cache.includes('guitar-wb-v96-dedup-cancelled-v1'));
});
test('swiss stage 2: week grid rows, student table scroll, modal single column',()=>{
 const theme=fs.readFileSync(path.join(__dirname,'../theme-swiss.css'),'utf8');
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 // 周课表课程卡：三行结构（时间 / 学员 / 内容摘要），内容行由 courseContent 首行渲染
 assert(index.includes('<div class="cc">'));
 assert(index.includes("const brief=String(courseContent(c)||'')"));
 assert(theme.includes('.ccard .cc{'));
 // 课程类型以 class 暴露，供状态编码使用（k-trial 斜纹 / k-online / k-home）
 assert(index.includes("' k-'+courseKind(c)"));
 assert(theme.includes('.ccard.k-trial{'));
 // 日期头两行：日期与「+」同行，复制排课在第二行（hover 显示）
 assert(theme.includes('.dhead-copy{'));
 assert(theme.includes('.daycol:hover .dhead-copy'));
 // 学员表：常显细滚动条 + 彩色色点去色（黑白主题下色点无法区分）
 assert(theme.includes('.stu-table-wrap::-webkit-scrollbar{height:8px;}'));
 assert(theme.includes('.stu-name .swatch{display:none;}'));
 // 学员档案改为右侧抽屉：表格单栏占满，面板 fixed 定位 + 关闭按钮 + 打开态类名
 assert(theme.includes('.balance-layout{grid-template-columns:minmax(0,1fr);gap:0;}'));
 assert(theme.includes('body.sw-drawer-open .balance-detail{transform:translateX(0);}'));
 assert(theme.includes('.sw-drawer-close{'));
 assert(index.includes('./theme-swiss.js?v=20261122-dedup-cancelled-v1'));
 // 阶段四：抽屉挤压式（≥1200px 让白，不覆盖表格；操作列让位避免横滚）
 assert(theme.includes(':root{--sw-drawer-w:400px;}'));
 assert(theme.includes('width:var(--sw-drawer-w);'));
 assert(theme.includes('@media(min-width:1200px){'));
 assert(theme.includes('body.sw-drawer-open #view-edit{padding-right:var(--sw-drawer-w);}'));
 assert(theme.includes('body.sw-drawer-open .stu-table{min-width:0;}'));
 assert(theme.includes('body.sw-drawer-open .stu-table th:nth-child(8),'));
 // 13 寸档位再让「状态」列 + 收窄抽屉，保证 1200 宽也不出现横向滚动
 assert(theme.includes('@media(min-width:1200px) and (max-width:1399px){'));
 assert(theme.includes(':root{--sw-drawer-w:360px;}'));
 assert(theme.includes('body.sw-drawer-open .stu-table td:nth-child(7){display:none;}'));
 // 误取消兜底：已取消的课程从格子消失但必须留可恢复入口（独立类名，不干扰「已隐藏」）
 assert(index.includes('<details class="schedule-cancelled" open>'));
 assert(index.includes('data-open-cancelled='));
 assert(theme.includes('.schedule-cancelled{'));
 // 课程弹窗窄屏：字段单列、标签在上、课程类型两列按钮
 assert(theme.includes('grid-template-columns:minmax(0,1fr) !important;'));
 assert(theme.includes('#courseModal #fCourseType{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'));
});

test('swiss monochrome theme: black/white tokens, sharp corners, monochrome sidebar',()=>{
 const theme=fs.readFileSync(path.join(__dirname,'../theme-swiss.css'),'utf8');
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const ws=fs.readFileSync(path.join(__dirname,'../workspace.css'),'utf8');
 // 令牌：纯黑白 + 直角 + 无阴影
 assert(theme.includes('--paper:#FFFFFF'));
 assert(theme.includes('--primary:#000000'));
 assert(theme.includes('--text:#000000'));
 assert(theme.includes('--line:#E5E5E5'));
 assert(theme.includes('--r-sm:0px; --r-md:0px; --r-lg:0px'));
 assert(theme.includes('--sh-1:none'));
 // 侧栏与按钮：黑字白底、主按钮黑底
 assert(theme.includes('.sidebar .nav-item.active{'));
 assert(theme.includes('button.primary{background:#000;color:#fff;border-color:#000;}'));
 // 今日卡：移动端纵向时间轴（≤700px 换成单列，靠竖线串联）
 assert(theme.includes('.tf-node::before{'));
 assert(theme.includes('grid-template-columns:40px 12px minmax(0,1fr) auto;'));
 // 主题层必须被页面与 Service Worker 引用，否则线上不生效、离线不缓存
 assert(index.includes('./theme-swiss.css?v=20261122-dedup-cancelled-v1'));
 assert(index.includes('./geist-fonts.css?v=20261122-dedup-cancelled-v1'));
 // 旧暖木色不得残留在具体规则里（:root 里的旧令牌由主题层覆盖，保留仅为可回滚）
 const wsRules=ws.replace(/:root\{[^}]*\}/g,'');
 assert(!wsRules.includes('#F5EEE3'));
 assert(!wsRules.includes('#D8C4AC'));
 assert(!wsRules.includes('#F0EAE2'));
 assert(!wsRules.includes('#FBF8F2'));
 assert(!wsRules.includes('#F7F5F0'));
 // 浏览器状态栏底色跟随主题
 assert(index.includes('theme-color" content="#FFFFFF'));
});
