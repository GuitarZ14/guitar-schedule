/* Regression guards for unsaved schedule forms. Run: node --test tests/draft-guards.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const desktop = fs.readFileSync(path.join(__dirname, '..', 'teaching-desktop.js'), 'utf8');

function extract(name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(html);
  if (!match) throw new Error('Missing function: ' + name);
  const start = html.indexOf('{', match.index);
  let depth = 0;
  for (let pos = start; pos < html.length; pos++) {
    if (html[pos] === '{') depth++;
    if (html[pos] === '}' && --depth === 0) return html.slice(match.index, pos + 1);
  }
  throw new Error('Unterminated function: ' + name);
}
function courseFields() {
  const ids = ['fStudent','fTrialName','fDate','fStart','fEnd','fNote','fHomework','fLessonContent'];
  const fields = Object.fromEntries(ids.map(id => [id, { value: 'typed-'+id }]));
  fields.coursePrivateNote = {open:true};
  fields.courseModalTitle = {textContent:'复制课程'};
  fields.courseFormBody = {scrollTop:120};
  return {fields, document:{getElementById:id=>fields[id]}, ids};
}

test('course draft keeps all text, dates, status, scroll and original revision', () => {
  const {fields, document} = courseFields();
  const capture = new Function('document','getRadio','courseFormType','editingCourseBaseline',
    extract('snapshotEditable') + extract('captureCourseDraft') + 'return captureCourseDraft;'
  )(document, () => 'done', 'regular', {id:'course-1', note:'old'});
  const draft = capture();
  assert.equal(draft.values.fHomework,'typed-fHomework');
  assert.equal(draft.values.fLessonContent,'typed-fLessonContent');
  assert.equal(draft.values.fDate,'typed-fDate');
  assert.equal(draft.status,'done');
  assert.equal(draft.originalCourse.note,'old');
  assert.equal(draft.scroll,120);
  for (const field of Object.values(fields)) if ('value' in field) field.value='';
  fields.coursePrivateNote.open=false;
  const returning = new Function('document','draft',
    "let pendingCourseDraft=draft, editingCourseId='course-1', editingCourseBaseline=null;" +
    'function openCourseModal(){} function setCourseType(){} function setRadio(){} function updateCourseDurDisplay(){}' +
    extract('returnToCourseDraft') +
    'return {run:returnToCourseDraft, baseline:()=>editingCourseBaseline};'
  )(document,draft);
  returning.run('new-student-id');
  assert.equal(fields.fHomework.value,'typed-fHomework');
  assert.equal(fields.fLessonContent.value,'typed-fLessonContent');
  assert.equal(fields.fStudent.value,'new-student-id');
  assert.equal(fields.coursePrivateNote.open,true);
  assert.equal(fields.courseFormBody.scrollTop,120);
  assert.equal(returning.baseline().note,'old');
});

test('concurrent remote edit requires explicit approval; deletion blocks save', () => {
  let promptCount=0,alertCount=0,approval=false;
  const window = {
    TeachingCore:{same:(a,b)=>JSON.stringify(a)===JSON.stringify(b)},
    confirm:()=>{ promptCount++; return approval; }
  };
  const allow = new Function('window','alert', extract('allowOverwrite')+'return allowOverwrite;')(
    window,()=>{alertCount++}
  );
  const original={id:'course-1',note:'first'};
  assert.equal(allow('课程',original,{...original}),true);
  assert.equal(promptCount,0);
  assert.equal(allow('课程',original,{...original,note:'changed'}),false);
  assert.equal(promptCount,1);
  approval=true;
  assert.equal(allow('课程',original,{...original,note:'changed'}),true);
  assert.equal(allow('课程',original,null),false);
  assert.equal(alertCount,1);
});

test('repeated-course weekday changes retain the same time input nodes and values', () => {
  const rows=[];
  const container={
    get firstChild(){return rows[0]||null},
    querySelectorAll:()=>rows.slice(),
    querySelector:sel=>rows.find(row=>row.dataset.day===(sel.match(/"(\d+)"/)||[])[1])||null,
    insertBefore:(row,next)=>{
      const index=next?rows.indexOf(next):-1;
      rows.splice(index<0?rows.length:index,0,row);
    }
  };
  function row() {
    return {
      dataset:{},
      get nextSibling(){return rows[rows.indexOf(this)+1]||null},
      remove(){const index=rows.indexOf(this);if(index>=0)rows.splice(index,1)},
      set innerHTML(value){this.html=value;this.start={value:'16:00'};this.end={value:'17:00'}},
      querySelector(name){return name==='.dt-start'?this.start:this.end}
    };
  }
  const checks=Array.from({length:7},(_,i)=>({checked:i===0||i===3,value:String(i)}));
  const document={
    getElementById:()=>container, querySelectorAll:()=>checks, createElement:()=>row()
  };
  const sync=new Function('document','DAY_NAMES','DEFAULT_COURSE_DURATION','addMinutes',
    extract('syncDayTimes')+'return syncDayTimes;'
  )(document,['一','二','三','四','五','六','日'],60,()=> '17:00');
  sync();
  const first=rows[0];first.start.value='09:30';first.end.value='10:45';
  checks[2].checked=true;sync();
  assert.equal(rows[0],first);
  assert.equal(first.start.value,'09:30');
  assert.equal(first.end.value,'10:45');
  assert.deepEqual(rows.map(row=>row.dataset.day),['0','2','3']);
  checks[3].checked=false;sync();
  assert.deepEqual(rows.map(row=>row.dataset.day),['0','2']);
});

test('background refresh avoids unnecessary rerenders and IME interruption', () => {
  assert.match(desktop,/core\.diff\(snapshot\(\), data, \{\}\)\.length === 0/);
  assert.match(desktop,/if \(composing\) deferredRender = true/);
  assert.match(html,/if\(oldSearch && stuSearchComposing\) return;/);
  assert.match(html,/searchStart!==null && searchEnd!==null/);
});

test('salary and income forms retain unsaved drafts across real sync updates', () => {
  assert.match(html,/salaryRenderedMonth===ym/);
  assert.match(html,/hoursEdited:previousView\.querySelector/);
  assert.match(html,/if\(draft && draft\.hoursEdited\)/);
  assert.match(html,/renderSalary\(\{clearDraft:true\}\)/);
  assert.match(html,/incomeEditBaselines\.set/);
  assert.match(html,/allowOverwrite\('额外收入'/);
});

test('version upgrade no longer automatically reloads a typing user', () => {
  assert.doesNotMatch(html,/location\.reload\(true\);\s*\/\/ 强制重载/);
  assert.match(html,/Promise\.all\(keys\.map\(k => caches\.delete\(k\)\)\)/);
});
