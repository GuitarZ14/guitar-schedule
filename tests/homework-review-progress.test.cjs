'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reviewProgress}=require('../teaching-homework-index');
const row=(...statuses)=>({assignment:{lifecycle:'published'},tasks:statuses.map(status=>({status}))});
test('teacher review progress is distinct from student practice',()=>{
 assert.deepEqual(reviewProgress(row('approved','approved')),{key:'complete',label:'全部通过',approved:2,total:2});
 assert.deepEqual(reviewProgress(row('approved','not_started')),{key:'partial',label:'部分通过',approved:1,total:2});
 assert.equal(reviewProgress(row('not_started','not_started')).key,'pending');
 assert.equal(reviewProgress(row('revision_requested','not_started')).key,'revision');
});
test('missing, empty, draft and unrecognized progress never count as passed',()=>{
 for(const item of [null,{},row(),row('approved','unexpected'),{assignment:{lifecycle:'draft'},tasks:[{status:'approved'}]}])assert.equal(reviewProgress(item).key,'unknown');
});
