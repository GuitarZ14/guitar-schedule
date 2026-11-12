const test = require('node:test');
const assert = require('node:assert/strict');
const status = require('../teaching-student-status');
const core = require('../teaching-core');
const sync = require('../teaching-sync');
const balance = require('../teaching-lesson-balance');
const student = () => ({id:'synthetic-student',name:'合成学员',stuStatus:'active',studentBinding:'untouched',lessonAccount:{asOf:'2026-11-01',opening:2,entries:[]}});
const data = () => ({students:[student()],courses:[{id:'synthetic-future',studentId:'synthetic-student',date:'2026-12-01',start:'10:00',end:'10:50',status:'planned',homework:'作业保留',acceptance:'验收保留'}],extraIncome:[]});
const changed = (s,to,n=1) => status.change(s,to,'合成测试备注','synthetic-event-'+n,'2026-11-12T04:00:0'+n+'.000Z');
function setup(base=data()) {
  let remote={data:core.clone(base),versions:{'students_synthetic-student':1},revision:1}, persisted, state;
  const requests=[];
  const options={load:()=>({base:core.clone(base),data:core.clone(base),versions:{...remote.versions},revision:1}),save:s=>{persisted=s;},onChange:s=>{state=s;},request:async input=>{requests.push(input);if(input.action==='push')remote=core.apply(remote,input.operations);return core.clone(remote);}};
  return {client:sync.create(options),options,requests,get remote(){return remote;},get persisted(){return persisted;},get state(){return state;}};
}
test('all state transitions preserve account, future courses, bindings and original histories',()=>{
  const original=data(), untouched=core.clone(original);let s=original.students[0];
  for(const [i,to] of ['paused','finished','active','leave','active'].entries()) {
    s=changed(s,to,i+1);assert.equal(s.stuStatus,to);assert.equal(s.stuStatusHistory.length,i+1);
    assert.deepEqual(s.lessonAccount,untouched.students[0].lessonAccount);assert.equal(s.studentBinding,'untouched');
    assert.equal(balance.statement(s,original.courses,'2026-11-12').remaining,2);
  }
  assert.deepEqual(original,untouched);assert.equal(status.change(s,'active','','noop','now'),s);
  assert.throws(()=>changed(s,'unknown'));assert.throws(()=>status.change(s,'paused','x'.repeat(201),'x','now'));
});
test('renewal is active only, inclusive at 2, with no fabricated unknown balance',()=>{
  for(const stuStatus of ['active','leave','paused','finished'])for(const n of [-1,0,2,2.5,null,NaN])assert.equal(status.needsRenewal({...student(),stuStatus},n),stuStatus==='active'&&Number.isFinite(n)&&n<=2);
  const legacy=student();delete legacy.stuStatus;assert.equal(status.needsRenewal(legacy,0),true);
});
test('only the student is pushed with existing ID/version; no other records are changed',async()=>{
  const f=setup(),next=f.client.getData(),before=core.clone(next);next.students[0]=changed(next.students[0],'finished');f.client.write(next);
  assert.equal(f.state,'pending');assert.equal(await f.client.sync(),true);assert.equal(f.state,'saved');
  const ops=f.requests.find(r=>r.action==='push').operations;assert.equal(ops.length,1);assert.equal(ops[0].kind,'students');assert.equal(ops[0].id,'synthetic-student');assert.equal(ops[0].version,1);
  assert.deepEqual(f.remote.data.courses,before.courses);assert.deepEqual(f.remote.data.students[0].lessonAccount,before.students[0].lessonAccount);
  assert.deepEqual(f.remote.data.students[0].stuStatusHistory,next.students[0].stuStatusHistory);
});
test('remote status and existing audit flow to desktop without a push',async()=>{
  const f=setup();f.remote.data.students[0]=changed(f.remote.data.students[0],'leave');
  await f.client.sync();assert.equal(f.client.getData().students[0].stuStatus,'leave');assert.equal(f.requests.length,1);assert.equal(f.state,'saved');
});
test('remote recharge/profile change merges with local state-only edit',async()=>{
  const f=setup(),next=f.client.getData();next.students[0]=changed(next.students[0],'paused');f.client.write(next);
  f.remote.data.students[0].lessonAccount.opening=10;f.remote.data.students[0].phone='synthetic-phone';f.remote.versions['students_synthetic-student']=2;
  assert.equal(await f.client.sync(),true);const saved=f.remote.data.students[0];assert.equal(saved.lessonAccount.opening,10);assert.equal(saved.phone,'synthetic-phone');assert.equal(saved.stuStatus,'paused');
});
for(const useLocal of [true,false])test('conflict survives writes/restart and resolves '+(useLocal?'local':'cloud')+' state preserving newest account and audit',async()=>{
  const f=setup(),next=f.client.getData();next.students[0]=changed(next.students[0],'paused');f.client.write(next);
  f.remote.data.students[0]=changed(f.remote.data.students[0],'finished',2);f.remote.data.students[0].lessonAccount.opening=20;f.remote.versions['students_synthetic-student']=2;
  assert.equal(await f.client.sync(),false);assert.equal(f.state,'conflict');assert.ok(f.persisted.pendingConflict);
  f.client.write(f.client.getData());assert.equal(f.state,'conflict');
  const restarted=sync.create({...f.options,load:()=>f.persisted});assert.equal(await restarted.sync(),false);assert.equal(restarted.conflicts().length,1);
  restarted.resolve(useLocal);assert.equal(f.state,'pending');await restarted.sync();assert.equal(f.state,'saved');
  const saved=f.remote.data.students[0];assert.equal(saved.stuStatus,useLocal?'paused':'finished');assert.equal(saved.lessonAccount.opening,20);
  assert.equal(saved.stuStatusHistory.find(e=>e.id==='synthetic-event-1').outcome,'discarded');assert.ok(saved.stuStatusHistory.some(e=>e.id==='synthetic-event-2'));
  if(useLocal)assert.ok(saved.stuStatusHistory.some(e=>e.from==='finished'&&e.to==='paused'));
});
test('failed push never emits saved; local data survives reload and retries',async()=>{
  const f=setup(),next=f.client.getData();next.students[0]=changed(next.students[0],'finished');
  const offline=sync.create({...f.options,request:async input=>{if(input.action==='push')throw new Error('synthetic offline');return core.clone(f.remote);}});
  offline.write(next);assert.equal(await offline.sync(),false);assert.equal(f.state,'error');assert.equal(f.persisted.data.students[0].stuStatus,'finished');
  const restarted=sync.create({...f.options,load:()=>f.persisted});assert.equal(await restarted.sync(),true);assert.equal(f.remote.data.students[0].stuStatus,'finished');
});
test('an incomplete response retains pending state rather than reporting success',async()=>{
  let state;const f=setup();const client=sync.create({...f.options,onChange:s=>{state=s;},request:async()=>({data:{students:[]},versions:{},revision:1})});
  assert.equal(await client.sync(),false);assert.equal(state,'error');
});
test('edit during in-flight push stays pending, then syncs the latest state',async()=>{
  const f=setup();let finish;const client=sync.create({...f.options,request:async input=>{if(input.action==='pull')return core.clone(f.remote);await new Promise(r=>{finish=r;});return core.apply(core.clone(f.remote),input.operations);}});
  const first=client.getData();first.students[0]=changed(first.students[0],'paused');client.write(first);const running=client.sync();await new Promise(r=>setImmediate(r));
  const next=client.getData();next.students[0]=changed(next.students[0],'finished',2);client.write(next);finish();assert.equal(await running,true);assert.equal(f.state,'pending');assert.equal(client.getData().students[0].stuStatus,'finished');assert.equal(client.dirty(),true);
});

test('a stale push acknowledgement cannot overwrite the draft or claim saved',async()=>{
  const f=setup();const client=sync.create({...f.options,request:async()=>core.clone(f.remote)});
  const next=client.getData();next.students[0]=changed(next.students[0],'paused');client.write(next);
  assert.equal(await client.sync(),false);assert.equal(f.state,'error');assert.equal(client.getData().students[0].stuStatus,'paused');assert.equal(client.dirty(),true);
});
