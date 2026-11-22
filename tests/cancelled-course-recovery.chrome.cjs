'use strict';
/* 误取消课程 → 恢复链路（回归 2026-11-22 用户报障：取消后重新录入被「重复录入」拦住）
 * 运行：node tests/cancelled-course-recovery.chrome.cjs
 * 需要 127.0.0.1:8773 已服务本目录（同其它 .chrome.cjs）。
 */
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1440,height:940},serviceWorkers:'block'});
  const alerts=[];
  p.on('dialog',d=>{ alerts.push(d.message()); d.accept(); });
  await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8773/')?r.continue():r.abort());
  await p.goto('http://127.0.0.1:8773/');
  await p.evaluate(()=>{
    students=[{id:'s1',name:'郑洁',color:'#B07A3F',level:'吉他初阶弹唱',stuStatus:'active',balance:10}];
    courses=[{id:'c1',studentId:'s1',date:'2026-11-17',start:'17:30',end:'18:20',status:'cancelled',instrument:'guitar',courseType:'regular'}];
    weekStart=mondayOf('2026-11-17'); currentTab='week'; viewMode='week'; render();
  });

  // 1) 取消的课不画进格子，但必须出现在「已取消」列表里
  assert.equal(await p.locator('.ccard').count(),0,'已取消的课不应画进周课表格子');
  assert.equal(await p.locator('.schedule-cancelled').count(),1,'应出现「已取消的课程」折叠区');

  // 2) 已取消记录不再拦住同一时段重新录入
  assert.equal(await p.evaluate(()=>!!findDuplicateCourse('s1','2026-11-17','17:30','18:20',null,'')),false,
    '取消记录不应判重');
  assert.equal(await p.evaluate(()=>!!findDuplicateCourse('s1','2026-11-17','17:30','18:20','c1','')),false,
    '编辑自身也不应判重');

  // 3) 从折叠区点开 → 改回「待上课」→ 保存 → 课程回到课表
  await p.locator('[data-open-cancelled]').click();
  assert.equal(await p.locator('#courseModal').isVisible(),true,'点开应弹出课程弹窗');
  assert.equal(await p.evaluate(()=>document.querySelector('input[name="fStatus"][value="cancelled"]').checked),true,
    '弹窗应回填当前状态（取消）');
  await p.evaluate(()=>{ document.querySelector('input[name="fStatus"][value="planned"]').checked=true; });
  await p.locator('#courseSave').click();
  await p.waitForTimeout(150);
  assert.equal(await p.locator('.ccard').count(),1,'恢复后课程应回到周课表');
  assert.equal(await p.locator('.schedule-cancelled').count(),0,'已取消列表应清空');
  const state=await p.evaluate(()=>courses.find(c=>c.id==='c1'));
  assert.equal(state.status,'planned','状态应改回待上课');
  assert.equal(state.date,'2026-11-17');
  assert.equal(state.start,'17:30');
  assert.equal(alerts.length,0,'正常恢复不应弹任何提示：'+alerts.join('|'));

  // 4) 另开一条：同名字同时间新增（取消记录仍在）不再被拦，能真正存进数据
  await p.evaluate(()=>{
    courses.push({id:'c9',studentId:'s1',date:'2026-11-18',start:'10:00',end:'10:50',status:'cancelled',instrument:'guitar'});
    weekStart=mondayOf('2026-11-18'); render();
    openCourseModal(null);
    document.getElementById('fStudent').value='s1';
    document.getElementById('fDate').value='2026-11-18';
    document.getElementById('fStart').value='10:00';
    document.getElementById('fEnd').value='10:50';
    document.querySelector('input[name="fStatus"][value="planned"]').checked=true;
    saveCourse();
  });
  assert.equal(alerts.length,0,'同时间仅有一条取消记录时，新增不应被拦：'+alerts.join('|'));
  assert.equal(await p.evaluate(()=>courses.filter(c=>c.date==='2026-11-18'&&c.status==='planned').length),1,
    '新的待上课程应已入库');
  console.log('PASS 误取消恢复 + 取消后重新录入（1440px）');
  await p.close();
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
