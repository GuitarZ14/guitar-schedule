(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingStudentStatus = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const labels = { active: '在读', leave: '请假', paused: '停课', finished: '已结课' };
  const current = student => student.stuStatus || 'active';
  const history = student => Array.isArray(student.stuStatusHistory) ? student.stuStatusHistory : [];
  const needsRenewal = (student, remaining) => current(student) === 'active' && Number.isFinite(remaining) && remaining <= 2;
  function change(student, to, note, id, at) {
    if (!Object.hasOwnProperty.call(labels, to)) throw new Error('学员状态不正确');
    if (current(student) === to) return student;
    if (String(note || '').length > 200) throw new Error('状态备注最多 200 字');
    const next = { ...student, stuStatus: to, stuStatusHistory: [...history(student), {
      id, from: current(student), to, note: String(note || '').trim(), at, source: 'desktop'
    }] };
    if (JSON.stringify(next).length > 30000) throw new Error('学员历史记录接近容量上限，请先导出备份');
    return next;
  }
  function mergeHistory(a, b) {
    return [...new Map([...history(a), ...history(b)].map(x => [x.id, x])).values()]
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  function withoutStatus(student) {
    const copy = { ...student }; delete copy.stuStatus; delete copy.stuStatusHistory; return copy;
  }
  return { labels, current, history, needsRenewal, change, mergeHistory, withoutStatus };
}));
