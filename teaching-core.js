(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KINDS = ['students', 'courses', 'extraIncome'];
  const STATUS = { planned: '待上', done: '已上', absent: '已请假', cancelled: '取消' };
  const INSTRUMENTS = ['guitar', 'bass', 'ukulele'];
  const INSTRUMENT_NAMES = { guitar: '吉他', bass: '电贝斯', ukulele: '尤克里里' };
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  const same = (a, b) => canonical(a) === canonical(b);
  const key = (kind, id) => kind + '_' + id;
  function empty() { return { students: [], courses: [], extraIncome: [] }; }
  function fail(message, code) { const e = new Error(message); e.code = code || 'INVALID'; throw e; }
  function dateValid(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T12:00:00');
    return !isNaN(d) && dateString(d) === s;
  }
  function dateString(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return dateString(d); }
  function monday(s) { const d = new Date(s + 'T12:00:00'); return addDays(s, -(d.getDay() + 6) % 7); }
  function duration(c) {
    const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const n = minutes(c.end) - minutes(c.start);
    return n < 0 ? n + 1440 : n;
  }
  function validate(kind, item) {
    if (!KINDS.includes(kind) || !item || typeof item !== 'object' || Array.isArray(item)) fail('记录格式不正确');
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)) fail('记录 ID 不正确');
    if (JSON.stringify(item).length > 30000) fail('单条记录内容过长');
    if (kind === 'students') {
      if (typeof item.name !== 'string' || !item.name.trim()) fail('请填写学员姓名');
      ['totalHours', 'giftHours'].forEach(k => { if (item[k] != null && (typeof item[k] !== 'number' || !Number.isFinite(item[k]) || item[k] < 0)) fail('总课时和赠课需为非负数'); });
    }
    if (kind === 'courses') {
      if (!dateValid(item.date)) fail('请选择有效的上课日期');
      if (![item.start, item.end].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || duration(item) === 0) fail('请填写有效的起止时间，时长不能为零');
      if (item.isTrial ? !String(item.trialName || '').trim() : !String(item.studentId || '').trim()) fail(item.isTrial ? '请填写体验课学员姓名' : '请选择学员');
      if (!Object.hasOwnProperty.call(STATUS, item.status)) fail('课程状态不正确');
      if (item.instrument && !INSTRUMENTS.includes(item.instrument)) fail('乐器类型不正确');
    }
    if (kind === 'extraIncome' && (!dateValid(item.date) || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 || !String(item.desc || '').trim())) fail('请填写收入说明、有效日期和大于零的金额');
    return item;
  }
  function normalize(data) {
    const out = empty();
    KINDS.forEach(kind => {
      if (!Array.isArray(data && data[kind])) fail('备份缺少 ' + kind + ' 数组');
      const ids = new Set();
      out[kind] = data[kind].map(item => {
        validate(kind, item);
        if (ids.has(item.id)) fail('存在重复记录 ID：' + item.id);
        ids.add(item.id); return clone(item);
      });
    });
    return out;
  }
  function index(list) { return new Map((list || []).map(item => [item.id, item])); }
  function diff(base, data, versions) {
    const ops = [];
    KINDS.forEach(kind => {
      const a = index(base[kind]), b = index(data[kind]);
      new Set([...a.keys(), ...b.keys()]).forEach(id => {
        if (!same(a.get(id), b.get(id))) ops.push({ kind, id, version: (versions || {})[key(kind, id)] || 0, data: b.get(id) || null });
      });
    });
    return ops;
  }
  function merge(base, local, remote) {
    const data = empty(), conflicts = [];
    KINDS.forEach(kind => {
      const a = index(base[kind]), b = index(local[kind]), c = index(remote[kind]);
      new Set([...a.keys(), ...b.keys(), ...c.keys()]).forEach(id => {
        const old = a.get(id), mine = b.get(id), theirs = c.get(id);
        let value;
        if (same(mine, old)) value = theirs;
        else if (same(theirs, old) || same(mine, theirs)) value = mine;
        else { conflicts.push({ kind, id, local: mine || null, remote: theirs || null }); value = mine; }
        if (value) data[kind].push(clone(value));
      });
    });
    return { data, conflicts };
  }
  function apply(snapshot, operations) {
    if (!Array.isArray(operations) || operations.length > 1000) fail('一次最多同步 1000 条记录');
    const next = clone(snapshot), seen = new Set();
    operations.forEach(op => {
      if (!KINDS.includes(op.kind) || typeof op.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(op.id) || !Number.isInteger(op.version) || op.version < 0) fail('同步请求不正确');
      const k = key(op.kind, op.id);
      if (seen.has(k)) fail('同一批次包含重复记录');
      seen.add(k);
      const list = next.data[op.kind], old = list.find(x => x.id === op.id);
      if (same(old || null, op.data)) return;
      if ((next.versions[k] || 0) !== op.version) fail('此记录已在另一台设备修改，请处理冲突后重试', 'CONFLICT');
      if (op.data) { if (op.data.id !== op.id) fail('记录 ID 不一致'); validate(op.kind, op.data); }
      next.data[op.kind] = list.filter(x => x.id !== op.id);
      if (op.data) next.data[op.kind].push(clone(op.data));
      next.versions[k] = (next.versions[k] || 0) + 1;
    });
    const duplicates = new Set();
    next.data.courses.forEach(c => {
      const k = [c.date, c.start, c.end, c.isTrial ? 'trial:' + c.trialName : c.studentId].join('|');
      if (duplicates.has(k)) fail('同一学员存在完全相同的课程，请勿重复排课');
      duplicates.add(k);
    });
    if (!same(next, snapshot)) next.revision = snapshot.revision + 1;
    return next;
  }
  function name(c, students) { const s = students.find(x => x.id === c.studentId); return c.isTrial ? c.trialName : s ? s.name : '已删学员'; }
  function content(c) { return c.lessonContent != null ? c.lessonContent : [c.song, c.focus].filter(Boolean).join('\n'); }
  function monthReport(data, month, today) {
    const map = new Map(); let minutes = 0, count = 0;
    data.courses.filter(c => c.date.slice(0, 7) === month && c.status === 'done').forEach(c => {
      const id = c.isTrial ? 'T|' + c.trialName : c.studentId;
      if (!map.has(id)) map.set(id, { id, name: name(c, data.students), count: 0, minutes: 0, dates: [] });
      const row = map.get(id); row.count++; row.minutes += duration(c); row.dates.push(c.date);
      minutes += duration(c); count++;
    });
    const extra = data.extraIncome.filter(x => (x.date || '').slice(0, 7) === month).reduce((n, x) => n + x.amount, 0);
    data.courses.filter(c => c.date.slice(0, 7) === month && c.status === 'absent').forEach(c => {
      const id = c.isTrial ? 'T|' + c.trialName : c.studentId;
      if (!map.has(id)) map.set(id, { id, name: name(c, data.students), count: 0, minutes: 0, dates: [] });
    });
    // 沿用电脑工资规则：按已上常规课节数结算；当前月排除未来日期，体验课不计工资。
    const salaryCount = data.courses.filter(c => c.date.slice(0, 7) === month && c.status === 'done' && !c.isTrial && (month !== today.slice(0, 7) || c.date <= today)).length;
    const overtime = Math.max(0, salaryCount - 66) * 90;
    return { rows: [...map.values()], minutes, hours: Number((minutes / 60).toFixed(2)), count, salaryCount, extra, base: 5500, overtime, salary: 5500 + overtime + extra };
  }
  return { KINDS, STATUS, INSTRUMENTS, INSTRUMENT_NAMES, clone, same, key, empty, dateValid, dateString, addDays, monday, duration, validate, normalize, diff, merge, apply, name, content, monthReport };
}));
