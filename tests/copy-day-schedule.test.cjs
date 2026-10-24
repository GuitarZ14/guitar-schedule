const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\ninit\(\);\s*$/, '');

function workspace() {
  const elements = new Map();
  const saved = [];
  const context = vm.createContext({
    console,
    alert() {},
    localStorage: { setItem: (key,value) => saved.push([key,value]) },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
          hidden:false,textContent:'',focus(){},classList:{toggle(){}},querySelectorAll:()=>[]
        });
        return elements.get(id);
      },
      querySelectorAll: () => []
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run(`markLocalUpdated=()=>{};scheduleAutoBackup=()=>{};render=()=>{};showToast=()=>{};
    students=[{id:'a',name:'甲'},{id:'b',name:'乙'}];
    courses=[
      {id:'1',studentId:'a',date:'2026-10-24',start:'09:30',end:'10:20',status:'done',lessonContent:'和弦练习',homework:'每天十分钟',note:'私密',song:'旧曲目',focus:'旧重点'},
      {id:'2',studentId:'b',date:'2026-10-24',start:'14:00',end:'14:50',status:'absent',lessonContent:'节奏练习',homework:'节拍器',note:'备注'},
      {id:'3',isTrial:true,trialName:'体验生',date:'2026-10-24',start:'16:00',end:'16:50',status:'planned',lessonContent:'试课'},
      {id:'4',studentId:'a',date:'2026-10-24',start:'18:00',end:'18:50',status:'cancelled',lessonContent:'取消课程'}
    ];`);
  return { run, elements };
}

test('copy preview clearly shows source, target, count and reset rules', () => {
  const { run, elements } = workspace();
  run(`openCopyDayModal('2026-10-24')`);
  assert.equal(elements.get('copyDayModal').hidden, false);
  assert.equal(elements.get('copyDayRange').textContent, '10月24日 周六 → 10月31日 周六');
  assert.equal(elements.get('copyDayCount').textContent, '共 3 节课');
  assert.match(html, /状态统一为「待上」/);
  assert.match(html, /上课重点为空/);
  assert.match(html, /作业总结为空/);
  assert.match(html, /私人备注为空/);
});

test('copy keeps only learner identity and time, resetting all lesson data', () => {
  const { run } = workspace();
  const result = JSON.parse(run(`JSON.stringify(copyDaySchedule('2026-10-24'))`));
  assert.deepEqual(result, {count:3,skipped:0,target:'2026-10-31'});
  const copied = JSON.parse(run(`JSON.stringify(courses.filter(c=>c.date==='2026-10-31'))`));
  assert.equal(copied.length, 3);
  assert.deepEqual(copied.map(c=>[c.start,c.end]), [['09:30','10:20'],['14:00','14:50'],['16:00','16:50']]);
  assert.equal(copied[0].studentId, 'a');
  assert.equal(copied[1].studentId, 'b');
  assert.equal(copied[2].isTrial, true);
  assert.equal(copied[2].trialName, '体验生');
  copied.forEach(c => {
    assert.equal(c.status, 'planned');
    assert.equal(c.lessonContent, '');
    assert.equal(c.homework, '');
    assert.equal(c.note, '');
    assert.equal(c.song, '');
    assert.equal(c.focus, '');
  });
  assert.equal(copied.some(c=>c.start==='18:00'), false, 'cancelled source courses are not copied');
});

test('existing target lessons are skipped without overwriting their data', () => {
  const { run } = workspace();
  run(`courses.push({id:'existing',studentId:'a',date:'2026-10-31',start:'09:30',end:'10:20',status:'done',lessonContent:'保留'})`);
  const result = JSON.parse(run(`JSON.stringify(copyDaySchedule('2026-10-24'))`));
  assert.deepEqual(result, {count:2,skipped:1,target:'2026-10-31'});
  assert.equal(run(`courses.find(c=>c.id==='existing').lessonContent`), '保留');
  assert.equal(run(`courses.find(c=>c.id==='existing').status`), 'done');
});

test('week action is renamed to copy schedule and explains its scope', () => {
  assert.match(html, />复制排课<\/button>/);
  assert.match(html, /只复制学员和上课时间到下周/);
  assert.doesNotMatch(html, />复制本日<\/button>/);
});
