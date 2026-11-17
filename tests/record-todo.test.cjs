'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\ninit\(\);\s*$/,'');
test('today record to-do follows mini-program lesson and student rules',()=>{
 const el={innerHTML:'',querySelectorAll:()=>[]};
 const ctx=vm.createContext({console,window:{},localStorage:{getItem:()=>null},document:{getElementById:()=>el,querySelectorAll:()=>[]}});
 vm.runInContext(source,ctx);
 vm.runInContext(`currentTab='week'; students=[{id:'s',name:'测试学员'}]; const day=todayStr(); courses=[
 {id:'todo',studentId:'s',date:day,start:'00:00',end:'00:01',status:'done'},
 {id:'filled',studentId:'s',date:day,start:'00:00',end:'00:01',status:'done',lessonContent:'已填写'},
 {id:'future',studentId:'s',date:day,start:'23:58',end:'23:59',status:'done'},
 {id:'absent',studentId:'s',date:day,start:'00:00',end:'00:01',status:'absent'},
 {id:'unknown',studentId:'missing',date:day,start:'00:00',end:'00:01',status:'done'},
 {id:'trial',isTrial:true,trialName:'体验学员',date:day,start:'00:00',end:'00:01',status:'done'}];renderToday();`,ctx);
 assert.match(el.innerHTML,/待填写课程记录（2）/);assert.match(el.innerHTML,/data-record="todo"/);assert.match(el.innerHTML,/data-record="trial"/);assert.doesNotMatch(el.innerHTML,/data-record="(?:filled|future|absent|unknown)"/);
});
