(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingLessonBalance = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';
// Teacher-only lesson balance model. Never infer the 2026-11-01 opening
// balance from the historic 8-10 month timetable or legacy totalHours.
function usesStudentPackage(c) {
 // The website used courseType before GuitarBuddy adopted courseCategory.
 const category=c && (c.courseCategory || c.courseType);
 return !!c && !c.isTrial && c.courseType!=='trial' && (!category || ['regular', 'online', 'home'].includes(category));
}
const START='2026-11-01';
const TYPES={opening:'课时初始化',recharge:'课时充值',adjustment:'课时调整',lesson:'已上扣课'};
const amountOK=n=>typeof n==='number' && Number.isFinite(n) && Math.abs(n)<=10000 && Math.round(n*2)===n*2;
const round=n=>Math.round(n*2)/2;
function validateAccount(account){
 if(!account || typeof account!=='object'||Array.isArray(account)||
    account.asOf!==START||!amountOK(account.opening)||account.opening<0)
   throw new Error('请按2026年11月1日上课前的余额初始化课时，支持0.5节');
 if(!Array.isArray(account.entries)||account.entries.length>120)
   throw new Error('课时流水过多，请先导出备份再操作');
 const ids=new Set();
 for(const x of account.entries){
   if(!x||typeof x!=='object'||typeof x.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(x.id)||
     ids.has(x.id)||!['recharge','adjustment'].includes(x.type)||!amountOK(x.delta)||
     (x.type==='recharge'&&x.delta<=0)||x.delta===0||
     !/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')||x.date<START||
     typeof x.note!=='string'||x.note.trim().length<2||x.note.length>200 ||
     typeof x.createdAt!=='string'||x.createdAt.length>50)
     throw new Error('课时流水内容不正确');
   ids.add(x.id);
 }
 return account;
}
function statement(student,courses,asOf){
 const account=student&&student.lessonAccount;
 if(!account)return {initialized:false,asOf:START,remainingText:'待初始化',
   openingText:'—',deducted:0,recharged:0,adjusted:0,remaining:null,
   entries:[],doneCount:0,allLessons:[]};
 validateAccount(account);
 const date=asOf||START;
 const changes=account.entries.map(x=>({
   key:'manual-'+x.id,id:x.id,type:x.type,label:TYPES[x.type],date:x.date,
   delta:x.delta,note:x.note,time:x.createdAt,isLesson:false,
 }));
 // 课包扣减与教师课时/工资独立：正式常规课、网课和上门教学扣课，体验课不扣。
 const billed=(courses||[]).filter(c=>usesStudentPackage(c) && c.studentId===student.id &&
   c.status==='done' && c.date>=START && c.date<=date);
 const lessonLines=billed.map(c=>({key:'course-'+c.id,id:c.id,type:'lesson',
   label:TYPES.lesson,date:c.date,delta:-1,
   note:(c.instrument==='electric'?'电吉他':c.instrument==='bass'?'电贝斯':c.instrument==='ukulele'?'尤克里里':'吉他')+'课'+
     (c.start?' · '+c.start:'')+'（已上）',isLesson:true}));
 const entries=[{key:'opening',id:'opening',type:'opening',label:TYPES.opening,date:START,
   delta:account.opening,note:'11月1日上课前确认余额',isLesson:false},
   ...changes.filter(x=>x.date<=date),...lessonLines];
 entries.sort((a,b)=>b.date.localeCompare(a.date)||
   (b.time||'').localeCompare(a.time||'')||a.key.localeCompare(b.key));
 const recharged=round(changes.filter(x=>x.type==='recharge'&&x.date<=date).reduce((s,x)=>s+x.delta,0));
 const adjusted=round(changes.filter(x=>x.type==='adjustment'&&x.date<=date).reduce((s,x)=>s+x.delta,0));
 const remaining=round(account.opening+recharged+adjusted-billed.length);
 return {initialized:true,asOf:START,remaining,remainingText:String(remaining),
   openingText:String(account.opening),deducted:billed.length,recharged,adjusted,
   entries,doneCount:billed.length};
}
function studentCourses(studentId,courses,now){
 return (courses||[]).filter(c=>c && !c.isTrial && c.courseType!=='trial' && c.studentId===studentId)
 .sort((a,b)=>(b.date+' '+b.start).localeCompare(a.date+' '+a.start))
 .map(c=>({ ...c,statusLabel:{planned:'待上',done:'已上',absent:'已请假',cancelled:'已取消'}[c.status]||'未知',
   counted: usesStudentPackage(c)&&c.status==='done'&&c.date>=START&&c.date<=now,
   timeText:c.start+'–'+c.end,
   classText:c.instrument==='electric'?'电吉他':c.instrument==='bass'?'电贝斯':c.instrument==='ukulele'?'尤克里里':'吉他'
 }));
}
return {START,TYPES,amountOK,validateAccount,statement,studentCourses};
}));
