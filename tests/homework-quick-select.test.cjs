'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {quickCourses}=require('../teaching-homework-index');
const names=new Map([['a','罗婕睿'],['b','合成学员']]);
const courses=[{id:'future',studentId:'b',date:'2026-11-28',status:'planned'},{id:'done-a',studentId:'a',date:'2026-11-13',status:'done'},{id:'done-b',studentId:'b',date:'2026-11-12',status:'done'},{id:'cancelled',studentId:'a',date:'2026-11-13',status:'cancelled'},{id:'old',studentId:'a',date:'2026-09-01',status:'done'},{id:'absent',studentId:'a',date:'2026-11-13',status:'absent'}];
const opts={today:'2026-11-14',complete:true,rows:[{course:courses[1],assignment:{id:'a'}}]};
test('recent completed lessons without assignments come before assigned and planned',()=>assert.deepEqual(quickCourses(courses,names,opts).map(c=>c.id),['done-b','done-a','future']));
test('name and date search reach older courses, exclude cancelled and absent',()=>{assert.deepEqual(quickCourses(courses,names,{...opts,query:'罗婕睿'}).map(c=>c.id),['done-a','old']);assert.deepEqual(quickCourses(courses,names,{...opts,date:'2026-09-01'}).map(c=>c.id),['old']);assert.equal(quickCourses(courses,names,{...opts,query:'不存在'}).length,0);});
test('all includes historical lessons and retains safe order with incomplete scan',()=>{const result=quickCourses(courses,names,{...opts,range:'all',complete:false});assert.deepEqual(result.map(c=>c.id),['done-a','done-b','future','old']);});
