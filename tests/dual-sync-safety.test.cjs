'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../teaching-core');
const sync=require('../teaching-sync');
const student={id:'synthetic_student',name:'合成学员',stuStatus:'paused',lessonAccount:{asOf:'2026-11-01',opening:12,entries:[{id:'credit1',type:'recharge',delta:2,date:'2026-11-06',note:'模拟充值',createdAt:'2026-11-06T00:00:00.000Z'}]}};
const course=(id,category='regular',extra={})=>({id,studentId:student.id,date:'2026-11-'+({reg:'10',online:'11',home:'12',trial:'10'}[id]),start:'10:00',end:'10:50',status:'done',instrument:'electric',courseCategory:category,...extra});
const baseData={students:[student],courses:[course('reg'),course('online','online'),course('home','home'),course('trial','regular',{isTrial:true,trialName:'模拟体验'})],extraIncome:[{id:'income',date:'2026-11-06',amount:80,desc:'合成收入'}]};
const versions=Object.fromEntries(['students_synthetic_student','courses_reg','courses_online','courses_home','courses_trial','extraIncome_income'].map(k=>[k,1]));
const base={data:baseData,versions,revision:5};
test('physical course and student deletion rejected by local shared teaching validation',()=>{
 for(const kind of ['courses','students']){
  const id=kind==='students'?'synthetic_student':'reg';
  assert.throws(()=>core.apply(base,[{kind,id,version:1,data:null}]),/暂不支持直接删除/);
 }
 const next=core.apply(base,[{kind:'extraIncome',id:'income',version:1,data:null}]);
 assert.equal(next.data.extraIncome.length,0);
 assert.equal(next.data.courses.length,4);
});
test('online and home lessons charge student packages but not teacher salary counts',()=>{
 const r=core.monthReport(baseData,'2026-11','2026-11-12');
 assert.equal(r.salaryCount,1);assert.equal(r.onlineCount,1);assert.equal(r.homeCount,1);assert.equal(r.trialCount,1);
 assert.equal(r.count,1);
 assert.equal(core.usesStudentPackage(baseData.courses[1]),true);
 assert.equal(core.usesStudentPackage(baseData.courses[2]),true);
 assert.equal(core.usesStudentPackage(baseData.courses[3]),false);
});
test('teaching sync refuses deleted local records before staging or cloud upload',()=>{
 let pushed=0;
 const client=sync.create({
  load:()=>({base:structuredClone(baseData),data:structuredClone(baseData),versions:structuredClone(versions),revision:5}),
  save:()=>{},request:async req=>{if(req.action==='push'){pushed++;return {...base}} return {...base}}
 });
 const next=client.getData();next.courses=next.courses.filter(c=>c.id!=='reg');
 assert.throws(()=>client.write(next),/禁止直接删除学员或课程/);
 assert.equal(client.dirty(),false);assert.equal(pushed,0);
});
test('stale local backup with deleted courses cannot automatically push deletion',async()=>{
 let pushed=0;const localData=structuredClone(baseData);localData.courses=localData.courses.filter(c=>c.id!=='reg');
 const client=sync.create({
  load:()=>({base:structuredClone(baseData),data:localData,versions:structuredClone(versions),revision:5}),
  save:()=>{},request:async req=>{if(req.action==='push')pushed++;return structuredClone(base)}
 });
 const ok=await client.sync();
 assert.equal(ok,false);assert.equal(pushed,0);assert.equal(client.dirty(),true);
});
test('connected bulk import and clear are blocked, physical delete handlers are inert',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 assert(html.includes("if(protectConnectedTeachingBulk()) return;"));
 assert(html.includes('function protectConnectedTeachingBulk()'));
 assert(html.includes("localStorage.getItem('gb_teaching_connection')"));
 assert(!html.includes("courses=courses.filter(c=>c.id!==editingCourseId)"));
 assert(!html.includes("students=students.filter(s=>s.id!==id)"));
 assert(html.includes("document.getElementById('fInstrument').value=src.instrument||'guitar'"));
 assert(html.includes("instrument:c.instrument||'guitar'"));
 assert(html.includes("const instrument=document.getElementById('rInstrument').value"));
 assert(html.includes('attendanceHistory'));
 assert(html.includes('已上课会扣减学员课包'));
});
