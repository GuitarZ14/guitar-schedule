'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const reminders=require('../teaching-reminders'),balance=require('../teaching-lesson-balance');
const student=(id,status,opening)=>({id,stuStatus:status,...(opening==null?{}:{lessonAccount:{asOf:'2026-11-01',opening,entries:[]}})});
const base={fresh:true,syncState:'saved',today:'2026-11-12',courses:[],students:[student('a','active',2),student('b','active',0),student('c','active',3),student('d','leave',0),student('e','paused',0),student('f','finished',0),student('g','active',null)]};
test('only active students with confirmed low balance are reminded; uninitialized stays separate',()=>{
 const original=structuredClone(base);const result=reminders.balances(base,balance.statement);
 assert.deepEqual(result.low,['a','b']);assert.deepEqual(result.uninitialized,['g']);assert.deepEqual(result.unknown,[]);assert.deepEqual(base,original);
});
test('stale, pending or disconnected snapshots never produce alerts',()=>{
 for(const patch of [{fresh:false},{syncState:'pending'},{syncState:'disconnected'},{syncState:'syncing'}])assert.deepEqual(reminders.balances({...base,...patch},balance.statement),{available:false,low:[],uninitialized:[],unknown:[]});
});
test('bad account is unknown and duplicate identities fail closed',()=>{
 const bad={...base,students:[{id:'x',stuStatus:'active',lessonAccount:{asOf:'2026-11-01',opening:'0',entries:[]}}]};
 assert.deepEqual(reminders.balances(bad,balance.statement).unknown,['x']);
 assert.throws(()=>reminders.balances({...base,students:[student('a','active',1),student('a','active',1)]},balance.statement),/重复/);
});
test('uninitialized students are identified independently of renewal eligibility',()=>{
 const snapshot={...base,students:[student('inactive','paused',null)]};
 assert.deepEqual(reminders.balances(snapshot,balance.statement).uninitialized,['inactive']);
 assert.deepEqual(reminders.balances(snapshot,balance.statement).low,[]);
});
