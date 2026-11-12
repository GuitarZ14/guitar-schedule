'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const sync=require('../teaching-sync');
const course={id:'c1',studentId:'s1',date:'2026-11-01',start:'09:00',end:'10:00',status:'planned',attendanceHistory:[{from:'absent',to:'planned',at:'2026-11-01T00:00:00Z',source:'desktop'}]};
const base={data:{students:[{id:'s1',name:'合成学员'}],courses:[course],extraIncome:[]},versions:{courses_c1:1},revision:1};
function fixture(alter){
 let remote=structuredClone(base), events=[];
 const client=sync.create({load:()=>({base:structuredClone(base.data),data:structuredClone(base.data),versions:{...base.versions},revision:1}),save:()=>{},onChange:x=>events.push(x),request:async req=>{if(req.action==='push'){const submitted=req.operations[0].data;remote.data.courses[0]={...submitted,attendanceHistory:[...course.attendanceHistory,{from:'planned',to:'cancelled',at:'2026-11-02T00:00:00Z',source:'legacy-client'}]};remote.versions.courses_c1++;remote.revision++;if(alter)alter(remote);}return structuredClone(remote);}});
 return {client,events};
}
test('server preserves omitted history and desktop accepts the confirmed result',async()=>{
 const {client}=fixture();const data=client.getData();data.courses[0].status='cancelled';delete data.courses[0].attendanceHistory;client.write(data);
 assert.equal(await client.sync(),true);assert.equal(client.dirty(),false);assert.equal(client.getData().courses[0].attendanceHistory.length,2);
});
test('server changes to non-history fields remain unconfirmed',async()=>{
 const {client,events}=fixture(remote=>{remote.data.courses[0].start='08:00';});const data=client.getData();data.courses[0].status='cancelled';client.write(data);
 assert.equal(await client.sync(),false);assert.equal(client.dirty(),true);assert.equal(events.at(-1),'error');
});
