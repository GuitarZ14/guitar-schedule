(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TeachingHomeworkModel = factory();
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
// V2.5 S2-B「布置作业」编辑器的纯数据层。
// 这一层不碰 wx / 网络，只负责把界面输入整理成 saveMixedDraft / publishMixed 的载荷，
// 并在提交前按服务端 mixed-model 的规则做同口径校验，避免把明显非法的数据发上去。
const MODES = [
  { key: 'staged', name: '分阶段作业', short: '分阶段' },
  { key: 'single', name: '单项作业', short: '单项' },
  { key: 'free', name: '自由练习', short: '自由练习' },
];
const MODE_NAMES = MODES.reduce((map, item) => { map[item.key] = item.name; return map; }, {});
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function uid(prefix) {
  return (prefix || 'a') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function text(value, limit) {
  const result = String(value == null ? '' : value).trim();
  return limit ? result.slice(0, limit) : result;
}
function integer(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}
// totalBars is the song's ending bar (range always starts at 1).
// Reject pasted ranges, exponents, hex, signs, and whitespace instead of
// silently coercing them through Number().
function endingBar(value) {
  const raw = String(value == null ? '' : value);
  if (!/^[1-9][0-9]{0,4}$/.test(raw)) return NaN;
  const number = Number(raw);
  return number <= 10000 ? number : NaN;
}
function validEndingBar(value) { return Number.isInteger(endingBar(value)); }
function emptyTask(id) {
  return { id: id || uid('t'), contentText: '', acceptanceCriteria: '', scheduledDate: '', suggestedMinutes: '', startBar: '', endBar: '' };
}
function emptyForm() {
  return { title: '', songId: '', songTitle: '', songVersion: '', trackingEnabled: false, totalBars: '', notes: '', bpm: '', targetCount: '', frequency: '' };
}
function createState(mode, idFactory) {
  const make = idFactory || (prefix => uid(prefix));
  return { mode: MODES.some(item => item.key === mode) ? mode : 'staged', form: emptyForm(), tasks: [emptyTask(make('t'))] };
}
function copyState(state) {
  return JSON.parse(JSON.stringify({ mode: state.mode, form: state.form, tasks: state.tasks }));
}
// 已填写的后续阶段不可随模式切换丢弃。
function switchMode(state, mode, idFactory) {
  if (!MODES.some(item => item.key === mode)) return { state: copyState(state), dropped: 0 };
  if (state.mode === 'staged' && mode !== 'staged' && (state.tasks || []).slice(1).some(task =>
    ['contentText', 'acceptanceCriteria', 'scheduledDate', 'suggestedMinutes', 'startBar', 'endBar'].some(key => text(task[key]) !== ''))) {
    return { state: copyState(state), dropped: 0, blocked: true };
  }
  const next = copyState(state);
  next.mode = mode;
  let dropped = 0;
  if (mode === 'staged') {
    if (!next.tasks.length) next.tasks.push(emptyTask(idFactory && idFactory('t')));
  } else if (next.tasks.length > 1) {
    dropped = next.tasks.length - 1;
    next.tasks = [next.tasks[0]];
  }
  if (!next.tasks.length) next.tasks = [emptyTask(idFactory && idFactory('t'))];
  if (mode !== 'staged') {
    next.form.trackingEnabled = false;
    if (state.mode === 'staged') {
      Object.assign(next.form, { totalBars: '', songId: '', songTitle: '', songVersion: '', interactiveRef: null });
      Object.assign(next.tasks[0], { scheduledDate: '', suggestedMinutes: '', startBar: '', endBar: '' });
    }
  }
  if (mode !== 'single') { next.form.bpm = ''; next.form.targetCount = ''; }
  if (mode !== 'free') next.form.frequency = '';
  return { state: next, dropped };
}
// 从服务端草稿恢复编辑器状态。
function applyAssignment(assignment) {
  const base = createState(assignment && assignment.mode);
  const source = assignment || {};
  const tasks = Array.isArray(source.tasks) && source.tasks.length ? source.tasks : [];
  return {
    mode: base.mode,
    form: {
      title: source.title || '',
      songId: source.songId || '',
      songTitle: source.songTitle || '',
      songVersion: source.songVersion ? String(source.songVersion) : '',
      ...(source.interactiveRef ? { interactiveRef: { scoreId: source.interactiveRef.scoreId, version: source.interactiveRef.version } } : {}),
      trackingEnabled: source.trackingEnabled === true,
      totalBars: source.totalBars == null ? '' : String(source.totalBars),
      notes: source.notes || '',
      bpm: source.bpm == null ? '' : String(source.bpm),
      targetCount: source.targetCount == null ? '' : String(source.targetCount),
      frequency: source.frequency || '',
    },
    tasks: (tasks.length ? tasks : [emptyTask()]).map(task => ({
      id: task.id,
      contentText: task.contentText || '',
      acceptanceCriteria: task.acceptanceCriteria || '',
      scheduledDate: task.scheduledDate || '',
      suggestedMinutes: task.suggestedMinutes == null ? '' : String(task.suggestedMinutes),
      startBar: task.startBar == null ? '' : String(task.startBar),
      endBar: task.endBar == null ? '' : String(task.endBar),
    })),
  };
}
// 提交前校验。draft 允许不完整，publish 必须有可验收的内容。
function validate(state, options) {
  const publish = !!(options && options.publish);
  const mode = state.mode, form = state.form || {}, tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const fail = message => { throw Object.assign(new Error(message), { code: 'INVALID' }); };
  const title = text(form.title);
  if (title.length > 200) fail('作业名称过长');
  if (publish && !title) fail('请填写作业名称');
  if (!tasks.length) fail('请至少填写一项练习内容');
  if (mode !== 'staged' && tasks.length > 1) fail('单项作业与自由练习只能有一项练习要求');
  if (form.trackingEnabled && mode !== 'staged') fail('只有分阶段作业可以跟踪小节');
  let totalBars = null;
  if (form.trackingEnabled) {
    totalBars = endingBar(form.totalBars);
    if (!Number.isInteger(totalBars)) fail('练习小节范围请填结束小节的整数（1–10000），如填 21 表示第 1–21 小节');
  }
  tasks.forEach((task, index) => {
    const label = mode === 'staged' ? '第 ' + (index + 1) + ' 阶段' : '练习要求';
    const content = text(task.contentText);
    if (content.length > 12000) fail(label + '内容过长');
    if (publish && !content) fail('请填写' + label + '的练习内容');
    if (publish && mode === 'single' && !text(task.acceptanceCriteria)) fail('单项作业发布前请填写验收标准');
    if (text(task.acceptanceCriteria).length > 3000) fail(label + '验收标准过长');
    const date = text(task.scheduledDate);
    if (date && (!DATE.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')))) fail(label + '的建议日期无效');
    const minutes = integer(task.suggestedMinutes);
    if (Number.isNaN(minutes)) fail(label + '的建议练习时间请填整数分钟');
    if (minutes != null && (minutes < 1 || minutes > 600)) fail(label + '的建议练习时间需在 1–600 分钟之间');
    const start = task.startBar == null || task.startBar === '' ? null : endingBar(task.startBar);
    const end = task.endBar == null || task.endBar === '' ? null : endingBar(task.endBar);
    if (Number.isNaN(start) || Number.isNaN(end)) fail(label + '的小节请填整数');
    if ((start == null) !== (end == null)) fail(label + '的小节范围需同时填写起始与结束');
    if (start != null) {
      if (!form.trackingEnabled) fail('未开启小节跟踪时不能填写小节范围');
      if (start < 1 || end < start) fail(label + '的小节起止范围无效');
      if (end > totalBars) fail(label + '结束于第 ' + end + ' 小节，超过练习小节范围 1–' + totalBars);
    }
  });
  const bpm = integer(form.bpm);
  if (mode === 'single') {
    if (Number.isNaN(bpm)) fail('BPM 请填整数');
    if (bpm != null && (bpm < 1 || bpm > 400)) fail('BPM 需在 1–400 之间');
    const count = integer(form.targetCount);
    if (Number.isNaN(count)) fail('目标次数请填整数');
    if (count != null && (count < 1 || count > 100000)) fail('目标次数无效');
  }
  if (text(form.notes).length > 2000) fail('作业说明不能超过 2000 字');
  if (text(form.frequency).length > 500) fail('练习频率过长');
  return true;
}
// 生成服务端载荷。lifecycle=draft 时允许不完整。
function buildAssignment(state, lifecycle, assignmentId) {
  const mode = state.mode, form = state.form || {};
  const draft = lifecycle !== 'published';
  const tracking = mode === 'staged' && form.trackingEnabled === true;
  const totalBars = tracking ? endingBar(form.totalBars) : null;
  const tasks = (state.tasks || []).map((task, index) => {
    const start = tracking ? endingBar(task.startBar) : null;
    const end = tracking ? endingBar(task.endBar) : null;
    return {
      id: task.id,
      order: index + 1,
      version: 1,
      contentText: text(task.contentText),
      acceptanceCriteria: text(task.acceptanceCriteria),
      scheduledDate: text(task.scheduledDate),
      suggestedMinutes: integer(task.suggestedMinutes),
      startBar: Number.isInteger(start) ? start : null,
      endBar: Number.isInteger(end) ? end : null,
    };
  });
  if (mode !== 'staged') tasks.splice(1);
  const songId = text(form.songId, 128);
  return {
    id: assignmentId,
    mode,
    title: text(form.title, 200),
    lifecycle: draft ? 'draft' : 'published',
    songId,
    songVersion: songId ? text(form.songVersion, 128) : '',
    ...(songId && form.interactiveRef ? { interactiveRef: { scoreId: text(form.interactiveRef.scoreId, 68), version: text(form.interactiveRef.version, 24) } } : {}),
    trackingEnabled: tracking,
    totalBars: tracking && Number.isInteger(totalBars) ? totalBars : null,
    category: '',
    frequency: mode === 'free' ? text(form.frequency, 500) : '',
    notes: text(form.notes, 2000),
    bpm: mode === 'single' && Number.isInteger(integer(form.bpm)) ? integer(form.bpm) : null,
    targetCount: mode === 'single' && Number.isInteger(integer(form.targetCount)) ? integer(form.targetCount) : null,
    tasks,
  };
}
// 课程详情卡片用的状态文案。
function statusOf(assignment) {
  if (!assignment) return '';
  if (assignment.lifecycle === 'draft') return '草稿';
  if (assignment.lifecycle === 'withdrawn') return '已撤回';
  return '已发布';
}
return { MODES, MODE_NAMES, DATE, uid, emptyTask, emptyForm, createState, copyState, switchMode, applyAssignment, validate, buildAssignment, statusOf, endingBar, validEndingBar };

}));
