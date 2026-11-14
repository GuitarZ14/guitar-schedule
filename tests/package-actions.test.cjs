'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../teaching-core');
const sync=require('../teaching-sync');
const lessons=require('../teaching-lesson-balance');
const pkg=require('../teaching-package-actions');
const student=(account)=>({id:'synthetic_student',name:'合成测试学员',stuStatus:'paused',phone:'TEST_ONLY',level:'木吉他',studentBinding:'unchanged',...(account?{lessonAccount:account}:{})});
const account=()=>({asOf:'2026-11-01',opening:4.5,entries:[]});
const course=(status='done')=>({id:'synthetic_course',studentId:'synthetic_student',date:'2026-11-06',start:'10:00',end:'10:50',status,instrument:'guitar',courseCategory:'regular',homework:'历史作业不可改',review:'教师验收不可改'});
const data=(a=account())=>({students:[student(a)],courses:[course()],extraIncome:[{id:'synthetic_income',date:'2026-11-06',amount:1,desc:'合成数据'}]});
const now='2026-11-12T10:00:00.000Z',day='2026-11-12';
const input=(mode,amount,note='模拟购买课包',id='synthetic_transaction')=>({studentId:'synthetic_student',mode,amount,note,requestId:id});
function setup(options={}) {
 const base=options.base||data();
 let remote={data:core.clone(base),versions:{},revision:0};
 // Establish initial immutable server snapshot/version using synthetic data.
 remote=core.apply(remote,base.students.map(s=>({kind:'students',id:s.id,version:0,data:s})).concat(
 base.courses.map(c=>({kind:'courses',id:c.id,version:0,data:c})),
 base.extraIncome.map(x=>({kind:'extraIncome',id:x.id,version:0,data:x}))));
 let persisted,states=[],calls=[],throwAfterPush=false,throwBeforePush=false;
 const request=async msg=>{
  calls.push(core.clone(msg));
  if(msg.action==='pull')return core.clone(remote);
  if(throwBeforePush) throw Error('network disconnected');
  remote=core.apply(remote,msg.operations);
  if(throwAfterPush)throw Error('response lost after save');
  return core.clone(remote);
 };
 const client=sync.create({load:()=>({base:core.clone(remote.data),data:core.clone(remote.data),versions:{...remote.versions},revision:remote.revision}),save:v=>{persisted=v;},onChange:v=>states.push(v),request});
 const writer=pkg.create({connected:()=>options.connected!==false,client:()=>client,request,today:()=>day,now:()=>now});
 const current=()=>client.getData().students[0];
 const make=(mode,amount,note,id)=>({...input(mode,amount,note,id),expectedAccount:current().lessonAccount||null,expectedRemaining:lessons.statement(current(),client.getData().courses,day).remaining});
 return {client,writer,make,remote:()=>remote,calls,states,persisted:()=>persisted,failBefore:v=>{throwBeforePush=v;},failAfter:v=>{throwAfterPush=v;}};
}
test('initialization is single-use, nonnegative, precise and preserves historic student fields',async()=>{
 const f=setup({base:data(null)}),req=f.make('init','10','期初复核','init_one');
 const result=await f.writer.commit(req);
 assert.equal(result.status,'saved');assert.equal(result.before,null);assert.equal(result.after,9);
 assert.equal(f.remote().data.students[0].lessonAccount.opening,10);
 assert.equal(f.remote().data.students[0].lessonAccount.openingNote,'期初复核');
 assert.equal(f.remote().data.students[0].stuStatus,'paused');
 assert.equal(f.remote().data.students[0].studentBinding,'unchanged');
 assert.deepEqual(f.remote().data.courses,[course()]);assert.equal(f.remote().data.extraIncome.length,1);
 assert.equal(f.calls.filter(c=>c.action==='push').length,1);
 assert.deepEqual(f.calls.find(c=>c.action==='push').operations.map(o=>o.kind),['students']);
 await assert.rejects(()=>f.writer.commit(f.make('init','10','', 'init_two')),/已经初始化/);
});
test('recharge and adjustment append immutable 0.5 step entries with unique ids, no duplicated lessons',async()=>{
 const f=setup();
 const one=await f.writer.commit(f.make('recharge','10','新购10节','transaction_1'));
 assert.equal(one.status,'saved');assert.equal(one.before,3.5);assert.equal(one.after,13.5);
 const two=await f.writer.commit(f.make('adjustment','-0.5','更正误差','transaction_2'));
 assert.equal(two.status,'saved');assert.equal(two.after,13);assert.equal(f.remote().data.students[0].lessonAccount.entries.length,2);
 assert.deepEqual(f.remote().data.students[0].lessonAccount.entries.map(e=>e.id),['transaction_1','transaction_2']);
 assert.equal(f.remote().data.courses[0].homework,'历史作业不可改');
 assert.equal(f.remote().data.courses[0].review,'教师验收不可改');
 assert.equal(f.remote().data.students[0].stuStatus,'paused');
 await assert.rejects(()=>f.writer.commit(f.make('adjustment','0','试验零值','newid')),/有效课时/);
 assert.throws(()=>pkg.plan(f.client.getData().students[0],input('recharge','-1'),{date:day,at:now,id:'newid'}),/有效课时/);
 assert.throws(()=>pkg.plan(f.client.getData().students[0],input('recharge','0.2'),{date:day,at:now,id:'newid'}),/有效课时/);
 assert.throws(()=>pkg.plan(f.client.getData().students[0],input('recharge','2','x'),{date:day,at:now,id:'newid'}),/调整原因/);
 assert.throws(()=>pkg.plan(f.client.getData().students[0],input('recharge','2','有效理由','transaction_1'),{date:day,at:now,id:'transaction_1'}),/操作编号已存在/);
});
test('offline connection rejects before staging any local package mutation',async()=>{
 const f=setup({connected:false});
 await assert.rejects(()=>f.writer.commit(f.make('recharge','2','购买续费','t1')),/连接/);
 assert.equal(f.client.dirty(),false);
 assert.equal(f.calls.length,0);
});
test('stale UI account or balance never submits without user reconfirmation',async()=>{
 const f=setup(),stale=f.make('recharge','2','购买续费','t1');
 const changed=f.client.getData();changed.students[0].lessonAccount.opening=5.5;f.client.write(changed);
 await assert.rejects(()=>f.writer.commit(stale),/未同步修改/);
 assert.equal(f.calls.length,0);
});
test('fresh cloud validation catches another device recharge before browser writes',async()=>{
 const f=setup(),stale=f.make('recharge','2','购买续费','t1');
 const server=f.remote();const changed={...server.data.students[0],lessonAccount:{...account(),entries:[{id:'mobile_1',type:'recharge',delta:2,date:day,note:'手机端购买',createdAt:now}]}};
 server.data.students[0]=changed;server.versions['students_synthetic_student']++;
 await assert.rejects(()=>f.writer.commit(stale),/课包刚刚发生变动|课时余额已变化|刚更新/);
 assert.equal(f.calls.filter(c=>c.action==='push').length,0);
 assert.equal(f.client.dirty(),false);
});
test('inflight duplicate action is rejected; one successful push only',async()=>{
 const f=setup();const r=f.make('recharge','2','新购课包','once');
 let resolvePull;
 const originalSync=f.client.sync.bind(f.client);
 // serial writer lock is exercised by a synthetic stalled initial cloud sync.
 f.client.sync=()=>new Promise(resolve=>{resolvePull=resolve;});
 const p=f.writer.commit(r);await Promise.resolve();
 await assert.rejects(()=>f.writer.commit(r),/正在提交/);
 resolvePull(true); // next calls use original sync
 f.client.sync=originalSync;
 const result=await p;
 assert.equal(result.status,'saved');
 assert.equal(f.remote().data.students[0].lessonAccount.entries.length,1);
});
test('lost acknowledgement after server acceptance stays pending and sync retries same ID once',async()=>{
 const f=setup(),r=f.make('recharge','2','新购课包','lost_response');
 f.failAfter(true);
 const result=await f.writer.commit(r);
 assert.equal(result.status,'pending');assert.equal(f.client.dirty(),true);
 assert.equal(f.remote().data.students[0].lessonAccount.entries.length,1);
 f.failAfter(false);
 assert.equal(await f.client.sync(),true);
 assert.equal(f.remote().data.students[0].lessonAccount.entries.length,1);
 assert.equal(f.client.dirty(),false);
});
test('push failure without server acceptance stays pending but never reports success',async()=>{
 const f=setup(),r=f.make('recharge','1','新购课包','offline_after_stage');
 f.failBefore(true);
 const result=await f.writer.commit(r);
 assert.equal(result.status,'pending');assert.equal(f.client.dirty(),true);
 assert.equal(f.remote().data.students[0].lessonAccount.entries.length,0);
 f.failBefore(false);assert.equal(await f.client.sync(),true);
 assert.equal(f.remote().data.students[0].lessonAccount.entries.length,1);
});
test('already dirty or conflicting student state blocks duplicate charges before new write',async()=>{
 const f=setup(),r=f.make('recharge','1','新购课包','local_draft');
 const changed=f.client.getData();changed.students[0].note='本地尚未同步';f.client.write(changed);
 await assert.rejects(()=>f.writer.commit(r),/未同步/);
 assert.equal(f.calls.length,0);
});
test('website scripts contain verified controls, cloud gating and bumped PWA cache',()=>{
 const fs=require('node:fs');
 const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
 assert(read('teaching-balances.js').includes('data-package-action="recharge"'));
 assert(read('teaching-balances.js').includes('data-package-action="adjustment"'));
 assert(read('teaching-balances.js').includes('data-package-action="init"'));
 assert(read('teaching-desktop.js').includes('lastState === \'saved\''));
 assert(read('index.html').includes('./teaching-package-actions.js?v=20261112-package-v1'));
 assert(read('service-worker.js').includes('./teaching-package-dialog.js?v=20261112-package-v1'));
 assert(read('service-worker.js').includes('guitar-wb-v67-quick-select-v1'));
});

test('a local edit during the confirmation pull is never overwritten by a stale ledger snapshot',async()=>{
 const seed=data(),remote=core.apply({data:core.empty(),versions:{},revision:0},
  [...seed.students.map(s=>({kind:'students',id:s.id,version:0,data:s})),
   ...seed.courses.map(c=>({kind:'courses',id:c.id,version:0,data:c})),
   ...seed.extraIncome.map(x=>({kind:'extraIncome',id:x.id,version:0,data:x}))]);
 let calls=0,client;
 const request=async msg=>{
   if(msg.action==='push')assert.fail('must never push a stale transaction');
   calls++;
   if(calls===2){
     const next=client.getData();next.students[0].note='another local edit';client.write(next);
   }
   return core.clone(remote);
 };
 client=sync.create({load:()=>({base:core.clone(remote.data),data:core.clone(remote.data),versions:core.clone(remote.versions),revision:remote.revision}),save(){},request});
 const writer=pkg.create({connected:()=>true,client:()=>client,request,today:()=>day,now:()=>now});
 const original=client.getData();
 await assert.rejects(()=>writer.commit({...input('recharge','2','新购课包','no_overwrite'),expectedAccount:original.students[0].lessonAccount,expectedRemaining:3.5}),/本机数据在确认期间发生变化/);
 assert.equal(client.getData().students[0].note,'another local edit');
 assert.equal(client.getData().students[0].lessonAccount.entries.length,0);
});
test('package conflicts require a manual cloud-ledger decision; never silently keep local stale account',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../teaching-desktop.js'),'utf8');
 assert(source.includes('b.disabled = accountConflict && useLocal'));
 assert(source.includes('请先导出本机备份并逐条核对余额'));
 assert(source.includes('采用云端会舍弃本机未同步的课包修改'));
});
