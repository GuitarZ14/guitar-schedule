(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachingReminders = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // A caller must supply a freshly confirmed, fully synchronized snapshot.
  // This function never reads a browser backup or persists generated alerts.
  function balances(snapshot, calculate) {
    if (!snapshot || snapshot.fresh !== true || snapshot.syncState !== 'saved')
      return { available: false, low: [], uninitialized: [], unknown: [] };
    if (!Array.isArray(snapshot.students) || !Array.isArray(snapshot.courses) || typeof calculate !== 'function')
      throw new Error('提醒所需数据不完整');
    const low=[], uninitialized=[], unknown=[], ids=new Set();
    for (const student of snapshot.students) {
      if (!student || typeof student.id !== 'string' || !student.id || ids.has(student.id))
        throw new Error('学员身份不完整或重复，不能生成提醒');
      ids.add(student.id);
      try {
        const balance=calculate(student,snapshot.courses,snapshot.today);
        if (!balance || typeof balance.initialized !== 'boolean') unknown.push(student.id);
        else if (!balance.initialized) uninitialized.push(student.id);
        else if (!Number.isFinite(balance.remaining)) unknown.push(student.id);
        else if ((student.stuStatus || 'active') === 'active' && balance.remaining<=2) low.push(student.id);
      } catch (_) { unknown.push(student.id); }
    }
    return { available: true, low, uninitialized, unknown };
  }
  return { balances };
}));
