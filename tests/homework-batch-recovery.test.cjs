'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {scan}=require(process.env.INDEX_SOURCE || '../teaching-homework-index');
const courses=Array.from({length:28},(_,i)=>({id:'c'+i,studentId:'s',date:'2026-11-18'}));
const response=ids=>({courses:ids.map(courseId=>({courseId,plan:null}))});
test('slow read batches split and cover every course without fabricating empty results',async()=>{
 const seen=[];
 const r=await scan(courses,async ({courseIds})=>{
  if(courseIds.length>14)throw Object.assign(Error('cloud timeout'),{code:'UNAVAILABLE'});
  seen.push(...courseIds);return response(courseIds);
 });
 assert.equal(r.errors,0);assert.equal(r.checked,28);assert.equal(new Set(seen).size,28);
});
test('permanent outage is bounded and still reports incomplete results',async()=>{
 let calls=0;
 const r=await scan(courses,async()=>{calls++;throw Object.assign(Error('cloud down'),{code:'UNAVAILABLE'});});
 assert(calls<=7);assert(r.errors>0);assert(r.rows.every(r=>r.batchFailure));
 assert(r.rows.every(r=>r.error.includes('UNAVAILABLE')));
});
test('permission and response-contract failures are never retried',async()=>{
 for(const fn of [()=>{throw Object.assign(Error('no access'),{code:'FORBIDDEN'});},()=>({courses:[]})]){
  let calls=0;const r=await scan(courses,async()=>{calls++;return fn();});
  assert.equal(calls,1);assert.equal(r.errors,1);
 }
});
test('leaving page during a failed request does not start recovery requests',async()=>{
 let alive=true,calls=0;
 const r=await scan(courses,async()=>{calls++;alive=false;throw Object.assign(Error('timeout'),{code:'TIMEOUT'});},null,()=>alive);
 assert.equal(calls,1);assert.equal(r.errors,0);
});
function desktop(){
 const node=()=>({style:{},setAttribute(){},prepend(){},after(){}});
 const fixture={state:'syncing',dirty:false,conflict:false,swapped:false,syncs:0,sends:0};
 const window={TeachingCore:{},TeachingPackageActions:{create:()=>({})},addEventListener(){}};
 const ctx={window,document:{hidden:false,createElement:node,querySelector:node,addEventListener(){}},navigator:{onLine:true},
  saveStudents(){},saveCourses(){},saveExtraIncome(){},localStorage:{getItem:()=>null},setInterval(){},setTimeout,clearTimeout,AbortController,
  fetch:async()=>{fixture.sends++;return {ok:true,json:async()=>({ok:true,courses:[]})};}};
 const file=process.env.DESKTOP_SOURCE || path.join(__dirname,'../teaching-desktop.js');
 const source=fs.readFileSync(file,'utf8').replace('  window.TeachingDesktopHomework = {',`  window.setup = (f) => {
    connection={endpoint:'https://synthetic.invalid',token:'synthetic'};
    client={dirty:()=>f.dirty,conflicts:()=>f.conflict,sync:async()=>{
      f.syncs++;if(f.swapped)connection={endpoint:'https://other.invalid'};
      lastState='saved';lastSavedAt=Date.now();return true;
    }};lastState=f.state;lastSavedAt=Date.now();
  };
  window.TeachingDesktopHomework = {`);
 vm.runInNewContext(source,ctx);window.setup(fixture);
 return {fixture,api:window.TeachingDesktopHomework,setup:()=>window.setup(fixture)};
}
test('queued read waits for background sync while writes stay blocked',async()=>{
 const {fixture:f,api,setup}=desktop();
 await api.request({action:'teacherCoursePlans',courseIds:['c']});
 assert.equal(f.syncs,1);assert.equal(f.sends,1);
 f.state='syncing';setup();await assert.rejects(api.request({action:'saveMixedDraft'}),/完成同步/);
 assert.equal(f.sends,1);
});
test('dirty/conflicting or changed connection cannot be bypassed by read recovery',async()=>{
 for(const flags of [{dirty:true},{conflict:true},{swapped:true}]){
  const {fixture:f,api,setup}=desktop();Object.assign(f,flags);setup();
  await assert.rejects(api.request({action:'teacherCoursePlans',courseIds:['c']}));assert.equal(f.sends,0);
 }
});

test('381/1000/5000-course scans retain full coverage and bounded request concurrency',async()=>{
 for(const count of [381,1000,5000]){
  const list=Array.from({length:count},(_,i)=>({id:'load'+i,studentId:'s',date:'2026-11-18'}));
  let running=0,max=0;const seen=new Set();
  const r=await scan(list,async({courseIds})=>{running++;max=Math.max(max,running);
   await new Promise(resolve=>setImmediate(resolve));courseIds.forEach(id=>seen.add(id));running--;return response(courseIds);});
  assert.equal(r.errors,0);assert.equal(r.checked,count);assert.equal(seen.size,count);assert(max<=2);
 }
});
