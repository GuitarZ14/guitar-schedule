const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = require('../teaching-lesson-balance');
const core = require('../teaching-core');
const sync = require('../teaching-sync');
const account = () => ({ asOf: '2026-11-01', opening: 4.5, entries: [
  { id:'r', type:'recharge', delta:2, date:'2026-11-02', note:'教师端充值', createdAt:'2026-11-02T08:00:00Z' },
  { id:'a', type:'adjustment', delta:-0.5, date:'2026-11-03', note:'教师端调整', createdAt:'2026-11-03T08:00:00Z' },
  { id:'future', type:'recharge', delta:10, date:'2026-12-01', note:'未来充值', createdAt:'2026-12-01T08:00:00Z' }
] });
const course = (id, props = {}) => ({ id, studentId:'s', date:'2026-11-04', start:'10:00', end:'10:50', status:'done', ...props });

test('package bills regular, online and home lessons, excluding trials, old/future and inactive lessons', () => {
  const student = { id:'s', totalHours:999, giftHours:99, lessonAccount:account() };
  const courses = [course('regular'), course('online',{courseCategory:'online'}), course('home',{courseCategory:'home'}),
    course('trial',{isTrial:true}), course('category-trial',{courseCategory:'trial'}), course('old',{date:'2026-10-31'}),
    course('future',{date:'2026-11-13'}), course('absent',{status:'absent'}), course('planned',{status:'planned'}),
    course('cancelled',{status:'cancelled'}), course('other',{studentId:'other'})];
  const before = JSON.stringify({student,courses});
  const b = model.statement(student,courses,'2026-11-12');
  assert.equal(b.remaining,3); assert.equal(b.deducted,3); assert.equal(b.recharged,2); assert.equal(b.adjusted,-0.5);
  assert.equal(b.entries.length,6); assert.ok(!b.entries.some(e=>e.id==='future'));
  assert.equal(JSON.stringify({student,courses}),before);
});
test('missing account never falls back to legacy hours; real zero and negative are preserved', () => {
  assert.equal(model.statement({id:'s',totalHours:50},[],'2026-11-12').remaining,null);
  const s = {id:'s',lessonAccount:{asOf:'2026-11-01',opening:0,entries:[]}};
  assert.equal(model.statement(s,[],'2026-11-12').remaining,0);
  assert.equal(model.statement(s,[course('one')],'2026-11-12').remaining,-1);
  s.lessonAccount.opening = '0'; assert.throws(()=>model.statement(s,[],'2026-11-12'));
});
test('course records use stable student ID and preserve hidden completed deductions', () => {
  const rows = model.studentCourses('s',[course('hidden',{hiddenFromTimetable:true}),course('x',{studentId:'x'}),course('t',{isTrial:true}),course('o',{courseCategory:'online'})],'2026-11-12');
  assert.deepEqual(rows.map(c=>c.id).sort(),['hidden','o']); assert.ok(rows.every(c=>c.counted));
});
test('legacy website types remain readable and canonical teacher category takes precedence', () => {
  const s={id:'s',lessonAccount:{asOf:'2026-11-01',opening:5,entries:[]}};
  assert.equal(model.statement(s,[course('o',{courseType:'online'}),course('t',{courseType:'trial'})],'2026-11-12').remaining,4);
  assert.equal(model.statement(s,[course('x',{courseType:'home',courseCategory:'unsupported'})],'2026-11-12').remaining,5);
  assert.equal(model.studentCourses('s',[course('t',{courseType:'trial'})],'2026-11-12').length,0);
});

function view() {
  const listeners = {};
  const ctx = vm.createContext({ window:{ addEventListener:(key,fn)=>listeners[key]=fn, TeachingLessonBalance:model },
    students:[{id:'s',name:'甲',lessonAccount:{asOf:'2026-11-01',opening:0,entries:[]}}, {id:'u',name:'乙',totalHours:99}],
    courses:[], todayStr:()=> '2026-11-12', esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'), currentTab:'week',
    Date, renderEdit:()=>assert.fail('must not redraw another page') });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../teaching-balances.js'),'utf8'),ctx);
  return {ctx, ui:ctx.window.TeachingBalanceView, state:state=>listeners['teaching-sync-state']({detail:{state}})};
}
test('disconnected/loading/error/conflict show unknown; confirmed zero is low; uninitialized stays distinct', () => {
  const {ctx,ui,state} = view();
  for (const s of ['disconnected','syncing','error','conflict']) { state(s); assert.equal(ui.balance(ctx.students[0]).remaining,null); assert.ok(!ui.cell(ui.balance(ctx.students[0])).includes('h-low')); }
  state('saved'); assert.equal(ui.balance(ctx.students[0]).remaining,0); assert.ok(ui.cell(ui.balance(ctx.students[0])).includes('h-low'));
  assert.equal(ui.balance(ctx.students[1]).remainingText,'待初始化');
  state('syncing'); assert.equal(ui.balance(ctx.students[0]).remaining,0);
  state('error'); assert.equal(ui.balance(ctx.students[0]).remaining,null);
  state('disconnected'); state('syncing'); assert.equal(ui.balance(ctx.students[0]).remaining,null);
});
test('overview separates known low and uninitialized accounts; invalid data is unknown', () => {
  const {ctx,ui,state} = view(); state('saved');
  assert.match(ui.overview(),/待续费学员<\/span><b>1<\/b>/); assert.match(ui.overview(),/课时未初始化<\/span><b>1<\/b>/);
  ctx.students[0].lessonAccount.opening = 'bad';
  assert.equal(ui.balance(ctx.students[0]).remainingText,'课包数据待核验');
  assert.match(ui.overview(),/待续费学员<\/span><b>—<\/b>/);
});
test('view refresh reflects recharge and course changes without writing account data', () => {
  const {ctx,ui,state} = view(); state('saved');
  ctx.students[0].lessonAccount.opening = 5; ctx.courses.push(course('c'));
  const before=JSON.stringify(ctx.students); assert.equal(ui.balance(ctx.students[0]).remaining,4);
  ctx.courses[0].status='cancelled'; assert.equal(ui.balance(ctx.students[0]).remaining,5);
  assert.equal(JSON.stringify(ctx.students),before);
});
test('periodic sync status refreshes balances without rebuilding an active search form', () => {
  const {ctx,state}=view(); let summary='';
  ctx.currentTab='edit';
  ctx.document={getElementById:id=>id==='balanceOverview'?{set innerHTML(value){summary=value;}}:null,querySelectorAll:()=>[]};
  state('saved'); assert.match(summary,/待续费学员/);
  state('syncing'); assert.match(summary,/正在同步/);
  state('error'); assert.match(summary,/同步失败/);
});
test('ordinary pull emits no push, preserves lessonAccount and all other records', async () => {
  const data = {students:[{id:'s',name:'甲',lessonAccount:account()}],courses:[course('c')],extraIncome:[]};
  const calls=[]; let saved;
  const client=sync.create({load:()=>({base:core.clone(data),data:core.clone(data),versions:{},revision:7}),save:s=>saved=s,
    request:async input=>{calls.push(input.action);return {data:core.clone(data),versions:{},revision:7};}});
  assert.equal(await client.sync(),true); assert.deepEqual(calls,['pull']); assert.deepEqual(saved.data,data);
  const before=core.clone(data); data.students[0].note='资料更新';
  assert.deepEqual(core.diff(before,data,{})[0].data.lessonAccount,account());
});
test('concurrent teacher recharge is a conflict rather than overwritten by stale desktop profile', () => {
  const base={students:[{id:'s',name:'甲',lessonAccount:account()}],courses:[],extraIncome:[]};
  const local=core.clone(base), remote=core.clone(base);
  local.students[0].note='电脑草稿'; remote.students[0].lessonAccount.opening=8;
  const merged=core.merge(base,local,remote); assert.equal(merged.conflicts.length,1);
  assert.equal(merged.conflicts[0].remote.lessonAccount.opening,8);
});
