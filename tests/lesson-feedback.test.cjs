const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1].replace(/\ninit\(\);\s*$/, '');

function workspace() {
  const elements = new Map();
  const storage = new Map();
  const context = vm.createContext({
    localStorage: { setItem: (k,v) => storage.set(k,v) },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { innerHTML: '', value: '', style: {}, focus() {}, querySelectorAll: () => [] });
        return elements.get(id);
      },
      querySelectorAll: () => []
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run(`todayStr=()=> '2026-10-24'; closeAllModals=()=>{};
    markLocalUpdated=()=>{}; scheduleAutoBackup=()=>{}; showToast=()=>{};
    students=[{id:'s',name:'小明',level:'吉他一对一',note:'私人备注',phone:'13812345678'}];
    courses=[
      {id:'later',studentId:'s',date:'2026-10-24',start:'18:00',end:'19:00',status:'planned'},
      {id:'first',studentId:'s',date:'2026-10-24',start:'16:00',end:'17:00',status:'done',song:'小星星',focus:'和弦转换',note:'不公开'},
      {id:'absent',studentId:'s',date:'2026-10-24',start:'12:00',end:'13:00',status:'absent'},
      {id:'cancelled',studentId:'s',date:'2026-10-24',start:'12:00',end:'13:00',status:'cancelled'},
      {id:'other-day',studentId:'s',date:'2026-10-23',start:'12:00',end:'13:00',status:'done'},
      {id:'other-student',studentId:'x',date:'2026-10-24',start:'12:00',end:'13:00',status:'done'},
      {id:'trial',isTrial:true,studentId:'s',date:'2026-10-24',start:'12:00',end:'13:00',status:'done'}
    ];`);
  return { run, elements, storage };
}

test('daily records include every active lesson in time order and isolate student/date', () => {
  const { run } = workspace();
  assert.equal(run(`studentLessonsOnDate('s','2026-10-24').map(c=>c.id).join(',')`), 'first,later');
  assert.equal(run(`studentLessonsOnDate('s','2026-10-23').length`), 1);
  assert.equal(run(`studentLessonsOnDate('s','2026-10-25').length`), 0);
});

test('parent report supports old records without exposing notes or contact details', () => {
  const { run } = workspace();
  const report = JSON.parse(run('JSON.stringify(lessonReport(courses[1]))'));
  assert.equal(report.content, '小星星\n和弦转换');
  assert.equal(report.homework, '');
  assert.equal(report.time, '16:00–17:00');
  assert.doesNotMatch(JSON.stringify(report), /私人|不公开|13812345678|note|phone/);
  run(`courses[1].lessonContent=''; courses[1].homework='每天练习 10 分钟'`);
  assert.equal(run('lessonReport(courses[1]).content'), '');
});

test('detail defaults to today, escapes text and places homework above lesson content', () => {
  const { run, elements } = workspace();
  run(`courses[1].homework='<img src=x onerror=alert(1)>\\n慢练'; openStudentDetail('s')`);
  const detail = elements.get('studentLessons').innerHTML;
  assert.equal(elements.get('lessonDate').value, '2026-10-24');
  assert.equal((detail.match(/class="lesson-card"/g) || []).length, 2);
  assert.ok(detail.indexOf('作业重点') < detail.indexOf('上课内容'));
  assert.match(detail, /&lt;img/);
  assert.doesNotMatch(detail, /<img|私人备注|不公开/);
  run(`openStudentDetail('s','2026-10-25')`);
  assert.match(elements.get('studentLessons').innerHTML, /当天没有课程/);
});

test('saving feedback persists both fields and preserves the existing schedule and notes', () => {
  const { run, elements, storage } = workspace();
  run(`openStudentDetail('s'); openLessonRecord('first')`);
  assert.equal(elements.get('lessonContent').value, '小星星\n和弦转换');
  elements.get('lessonHomework').value = '  每天练习 10 分钟\n60 BPM  ';
  elements.get('lessonContent').value = '  前 8 小节  ';
  run('saveLessonRecord({preventDefault(){}})');
  const saved = JSON.parse(storage.get('wb_guitar_courses')).find(c => c.id === 'first');
  assert.equal(saved.homework, '每天练习 10 分钟\n60 BPM');
  assert.equal(saved.lessonContent, '前 8 小节');
  assert.equal(saved.note, '不公开');
  assert.equal(saved.start, '16:00');
  assert.equal(saved.status, 'done');
  assert.match(elements.get('studentLessons').innerHTML, /每天练习 10 分钟/);
});

test('image text wrapping preserves explicit newlines, empty lines and emoji', () => {
  const { run } = workspace();
  const result = JSON.parse(run(`JSON.stringify(wrapLessonText({measureText:s=>({width:Array.from(s).length*10})},'甲乙丙\\n\\n😀丁',20))`));
  assert.deepEqual(result, ['甲乙','丙','','😀丁']);
});

test('course editor loads feedback, preserves custom records and clears feedback for a new course', () => {
  const { run, elements } = workspace();
  run(`setRadio=()=>{}; courses[1].homework='慢练'; courses[1].lessonContent='独立课堂记录'; openCourseModal('first')`);
  assert.equal(elements.get('fHomework').value, '慢练');
  assert.equal(elements.get('fLessonContent').value, '独立课堂记录');
  run(`courses[1].lessonContent='小星星\\n和弦转换\\n补充进度'; fillCourseFeedback(courses[1])`);
  assert.equal(elements.get('fLessonContent').value, '小星星\n和弦转换\n补充进度');
  run('delete courses[1].lessonContent; fillCourseFeedback(courses[1])');
  assert.equal(elements.get('fLessonContent').value, '小星星\n和弦转换');
  run('openCourseModal(null)');
  assert.equal(elements.get('fHomework').value, '');
  assert.equal(elements.get('fLessonContent').value, '');
});

test('selecting or copying textarea content cannot close the course modal through the backdrop', () => {
  const { run } = workspace();
  assert.equal(run(`
    var backdropHandlers={};
    var modal={hidden:false,addEventListener:(type,handler)=>backdropHandlers[type]=handler};
    var textarea={};
    bindBackdropClose(modal);
    backdropHandlers.pointerdown({target:textarea});
    backdropHandlers.click({target:modal});
    modal.hidden
  `), false);
  assert.equal(run(`
    backdropHandlers.pointerdown({target:modal});
    backdropHandlers.click({target:modal});
    modal.hidden
  `), true);
});

test('save-and-share persists current form changes before opening the correct course preview', () => {
  const { run, elements, storage } = workspace();
  run(`setRadio=()=>{}; getRadio=()=> 'done'; render=()=>{};
    var shared=[]; openLessonShare=(id,from)=>shared.push([id,from]);
    courses[1].lessonContent='独立课堂记录'; openCourseModal('first')`);
  elements.get('fHomework').value = '每天 10 分钟';
  elements.get('fLessonContent').value = '新曲目\n新的技巧\n独立课堂记录';
  run('saveCourseAndShare()');
  const saved = JSON.parse(storage.get('wb_guitar_courses')).find(c => c.id === 'first');
  assert.equal(saved.homework, '每天 10 分钟');
  assert.equal(saved.lessonContent, '新曲目\n新的技巧\n独立课堂记录');
  assert.equal(saved.note, '不公开');
  assert.equal(run('JSON.stringify(shared)'), '[["first",true]]');
  run(`fillCourseFeedback(courses[1])`);
  assert.equal(elements.get('fLessonContent').value, '新曲目\n新的技巧\n独立课堂记录');
});

test('clearing unified content stays empty after saving, reopening and copying', () => {
  const { run, elements } = workspace();
  run(`setRadio=()=>{}; getRadio=()=> 'done'; render=()=>{}; openCourseModal('first')`);
  elements.get('fLessonContent').value = '';
  run(`saveCourse(); openCourseModal('first')`);
  assert.equal(elements.get('fLessonContent').value, '');
  assert.equal(run('lessonReport(courses[1]).content'), '');
  run(`openCourseModalAsCopy('first')`);
  assert.equal(elements.get('fLessonContent').value, '');
});

test('invalid or duplicate courses cannot save or open a sharing preview', () => {
  const { run, elements, storage } = workspace();
  run(`setRadio=()=>{}; getRadio=()=> 'done'; render=()=>{}; alert=()=>{};
    var shared=[]; openLessonShare=(id,from)=>shared.push([id,from]); openCourseModal('first')`);
  elements.get('fDate').value = '';
  run('saveCourseAndShare()');
  assert.equal(storage.has('wb_guitar_courses'), false);
  elements.get('fDate').value = '2026-10-24';
  run('editingCourseId=null; saveCourseAndShare()');
  assert.equal(storage.has('wb_guitar_courses'), false);
  assert.equal(run('shared.length'), 0);
});

test('trial course sharing uses its own student name and does not expose private notes', () => {
  const { run } = workspace();
  const report = JSON.parse(run(`JSON.stringify(lessonReport({isTrial:true,trialName:'体验学员',date:'2026-10-24',start:'10:00',end:'10:50',song:'试弹',note:'私密备注'}))`));
  assert.equal(report.name, '体验学员');
  assert.equal(report.type, '体验课');
  assert.equal(report.content, '试弹');
  assert.doesNotMatch(JSON.stringify(report), /私密备注/);
});
