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
 assert(index.includes('./teaching-homework-index.js?v=20261113-v1'));
 assert(cache.includes('guitar-wb-v65-hide-absent-v1'));
});
