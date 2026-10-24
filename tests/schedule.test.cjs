const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\ninit\(\);\s*$/, '');

function workspace() {
  const elements = new Map();
  const context = vm.createContext({
    console,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
          innerHTML: '', hidden: false, classList: { toggle() {} }, querySelectorAll: () => []
        });
        return elements.get(id);
      }
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run(`weekStart='2026-10-19'; dayCursor='2026-10-24';
    students=[{id:'a',name:'甲'},{id:'b',name:'乙'}];
    courses=[
      {id:'1',studentId:'a',date:'2026-10-19',start:'09:00',end:'10:00',status:'done'},
      {id:'2',studentId:'a',date:'2026-10-24',start:'23:30',end:'00:30',status:'planned'},
      {id:'3',studentId:'b',date:'2026-10-24',start:'10:00',end:'11:00',status:'absent'},
      {id:'4',studentId:'b',date:'2026-10-24',start:'12:00',end:'13:00',status:'cancelled'},
      {id:'5',studentId:'a',date:'2026-10-26',start:'09:00',end:'10:00',status:'planned'}
    ];`);
  return { run, elements };
}

test('weekly overview respects date boundaries, statuses and overnight duration', () => {
  const { run, elements } = workspace();
  run('renderWorkspaceSummary()');
  const result = elements.get('workspaceSummary').innerHTML;
  assert.match(result, /<b>3<small>节/);
  assert.match(result, /已完成<\/span><b>1<small>节/);
  assert.match(result, /<b>2<small>小时/);
});

test('daily view and student filter share the same overview scope', () => {
  const { run, elements } = workspace();
  run("viewMode='day'; filterStudent='a'; renderWorkspaceSummary()");
  assert.match(elements.get('workspaceSummary').innerHTML, /当日课程<\/span><b>1/);
  assert.match(elements.get('workspaceSummary').innerHTML, /已完成<\/span><b>0/);
  run("filterStudent='b'; renderWorkspaceSummary()");
  assert.match(elements.get('workspaceSummary').innerHTML, /<b>0<small>小时/);
  run("currentTab='edit'; renderWorkspaceSummary()");
  assert.equal(elements.get('workspaceSummary').hidden, true);
  assert.equal(elements.get('todayBar').hidden, true);
});

test('today action list keeps older courses collapsed and escapes course labels', () => {
  const { run, elements } = workspace();
  run(`todayStr=()=> '2026-10-24';
    courses.push({id:'6',studentId:'a',date:'2026-10-20',start:'09:00',end:'10:00',status:'planned'});
    renderToday()`);
  const result = elements.get('todayBar').innerHTML;
  assert.match(result, /1 节待上/);
  assert.match(result, /<details class="overdue-list"><summary>/);
  assert.doesNotMatch(result, /<details[^>]*\sopen/);
  assert.equal((result.match(/data-done=/g) || []).length, 2);
  run(`students[0].name='<script>alert(1)</script>'`);
  assert.match(run('courseCardHTML(courses[1])'), /&lt;script&gt;/);
  assert.match(run('courseCardHTML(courses[1])'), /tabindex="0"/);
});

test('monthly report preserves completed, absent and trial course grouping', () => {
  const { run } = workspace();
  run(`courses.push({id:'trial',isTrial:true,trialName:'甲',date:'2026-10-24',start:'14:00',end:'14:30',status:'done'});`);
  const map = JSON.parse(run("JSON.stringify(monthMap('2026-10'))"));
  assert.deepEqual(map.a, { count: 1, min: 60, absent: 0 });
  assert.deepEqual(map.b, { count: 0, min: 0, absent: 1 });
  assert.deepEqual(map['T|甲'], { count: 1, min: 30, absent: 0 });
  assert.equal(Object.keys(JSON.parse(run("JSON.stringify(monthMap('2026-11'))"))).length, 0);
});

test('duration chart shows zero time accurately and escapes student names', () => {
  const { run } = workspace();
  run(`students[0].name='<b>甲</b>'`);
  const chart = run("svgBars(monthMap('2026-10'))");
  assert.match(chart, /width:0%/);
  assert.match(chart, /width:100%/);
  assert.match(chart, /&lt;b&gt;甲&lt;\/b&gt;/);
  assert.doesNotMatch(chart, /NaN|Infinity/);
});

test('monthly lesson dates can be expanded by click or keyboard', () => {
  const { run, elements } = workspace();
  run("currentMonth='2026-10'; renderStats()");
  const report = elements.get('view-stats').innerHTML;
  assert.match(report, /<details class="stat-dates"><summary aria-label="查看甲的上课日期">/);
  assert.match(report, /10月19号/);
  assert.doesNotMatch(report, /10月24号/);
});
