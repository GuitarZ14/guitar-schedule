'use strict';
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const port=8786;
 const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:require('node:path').resolve(__dirname,'..'),stdio:'ignore'});
 let browser=null;
 try{
  for(let i=0;i<35;i++){try{if((await fetch('http://127.0.0.1:'+port+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,120));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
   const errors=[];
   page.on('dialog',dialog=>dialog.accept());
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:'+port+'/')?route.continue():route.abort());
   await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
   await page.evaluate(()=>{
    students.push({id:'cw-student',name:'集成测试学员'});
    courses.push({id:'cw-old',studentId:'cw-student',date:'2026-11-13',start:'16:00',end:'16:50',courseType:'regular',status:'done',instrument:'guitar'});
    courses.push({id:'cw-current',studentId:'cw-student',date:'2026-11-20',start:'17:50',end:'18:40',courseType:'regular',status:'done',instrument:'guitar',lessonContent:'和弦转换'});
    window.__writes=[];
    window.__plan={revision:0,lessonId:'cw-current',teachingStudentId:'cw-student',assignments:[],publishedProgress:{assignments:[]}};
    TeachingDesktopHomework.ready=()=>true;
    TeachingDesktopHomework.scope=async()=> 'isolated-test-workspace';
    TeachingDesktopHomework.request=async(input)=>{
     if(input.action==='teacherCoursePlan')return {plan:window.__plan};
     if(input.action==='saveMixedDraft'){
      window.__writes.push(input);
      window.__plan={...window.__plan,revision:window.__plan.revision+1,assignments:[{...input.assignment,id:input.assignmentId,lifecycle:'draft'}]};
      return {revision:window.__plan.revision};
     }
     if(input.action==='teacherSheetCatalog')return {songs:[],nextCursor:null};
     throw Error('Unexpected mock action '+input.action);
    };
    openCourseModal('cw-current');
   });
   assert.match(await page.locator('#courseWorkspaceContext').innerText(),/集成测试学员/);
   const modal=page.locator('#courseModal');
   assert(await modal.isVisible(),'course modal must be visible');
   await page.locator('[data-course-tab=homework]').click();
   await page.locator('#courseHomeworkMain [data-task=contentText]').first().waitFor({state:'visible',timeout:8000});
   await page.locator('#courseHomeworkMain [data-task=contentText]').first().fill('和弦转换 60 BPM');
   await page.locator('#courseHomeworkMain [data-task=acceptanceCriteria]').first().fill('连续完成八次');
   await page.locator('#courseHomeworkMain [data-copy="0"]').click();
   assert.equal(await page.locator('#courseHomeworkMain [data-task=contentText]').count(),2);
   await page.locator('#courseHomeworkMain [data-task=contentText]').nth(1).fill('练习前八小节');
   await page.locator('#courseHomeworkMain [data-task=acceptanceCriteria]').nth(1).fill('连续完整两遍');
   await page.locator('#courseHomeworkMain [data-save]').click();
   await page.waitForFunction(()=>window.__writes.length===1,{timeout:7000});
   assert.equal(await page.evaluate(()=>window.__writes[0].assignment.tasks.length),2);
   await page.locator('#courseHomeworkMain [data-assignment]').first().waitFor({state:'visible',timeout:8000});
   await page.locator('#courseHomeworkMain [data-assignment]').first().click();
   await page.locator('#courseHomeworkMain [data-cancel]').waitFor({state:'visible'});
   await page.locator('#courseHomeworkMain [data-cancel]').click();
   await page.locator('#courseHomeworkMain [data-assignment]').first().waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelectorAll('#courseHomeworkMain [data-task=contentText]').length===0,null,{timeout:3500});
   assert.equal(await page.locator('#courseHomeworkMain [data-task=contentText]').count(),0,'back must close editor');
   await page.locator('[data-course-tab=course]').click();
   await page.locator('#coursePrev').click();
   assert.match(await page.locator('#courseWorkspaceContext').innerText(),/2026[/-]11[/-]13/);
   await page.locator('#courseNext').click();
   assert.match(await page.locator('#courseWorkspaceContext').innerText(),/2026[/-]11[/-]20/);
   assert(await page.locator('#fLessonContent').isVisible(),'Lesson focus should be visible without expanding details');
   assert.equal(await page.locator('#coursePrivateNote').evaluate(x=>x.open),false,'Private note should remain collapsed');
   const lessonBelowSummary=await page.evaluate(()=>document.querySelector('.cw-summary-card').compareDocumentPosition(document.querySelector('.cw-lesson-focus-card')) & Node.DOCUMENT_POSITION_FOLLOWING);
   assert(lessonBelowSummary,'Lesson focus card follows homework summary');
   await page.locator('#fLessonContent').fill('尚未保存的上课内容');
   await page.locator('[data-course-tab=homework]').click();
   await page.locator('#courseHomeworkMain [data-save-first]').waitFor({state:'visible'});
   assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,'page horizontal overflow');
   assert.deepEqual(errors,[],'page errors');
   console.log('PASS course workspace integrated browser '+width+'px');
   await page.close();
  }
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
