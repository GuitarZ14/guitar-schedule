(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./teaching-core'), require('./teaching-lesson-balance'));
  else root.TeachingPackageActions = factory(root.TeachingCore, root.TeachingLessonBalance);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (core, lessons) {
  'use strict';
  const MODES = { init: '初始化课时', recharge: '充值课时', adjustment: '调整课时' };
  function plan(student, input, context) {
    if (!student || !student.id) throw new Error('未找到学员，请重新选择');
    const mode = input && input.mode;
    if (!Object.hasOwnProperty.call(MODES, mode)) throw new Error('课包操作类型不正确');
    const amount = Number(input.amount);
    const raw = String(input.amount == null ? '' : input.amount).trim();
    if (!raw || !lessons.amountOK(amount) || (mode !== 'adjustment' && amount < 0) ||
        (mode !== 'init' && amount === 0)) throw new Error('请输入有效课时，支持 0.5 节；充值必须大于零，调整不能为零');
    const note = String(input.note || '').trim();
    if (note.length > 200 || (mode !== 'init' && note.length < 2))
      throw new Error('充值或调整原因至少 2 个字，最多 200 字');
    const had = !!student.lessonAccount;
    if (mode === 'init' && had) throw new Error('课包已经初始化，不能再次初始化；请使用课时调整');
    if (mode !== 'init' && !had) throw new Error('请先初始化课时');
    const at = context.at;
    const date = context.date;
    const id = context.id;
    let account;
    if (mode === 'init') {
      account = { asOf: lessons.START, opening: amount, entries: [] };
      if (note) account.openingNote = note;
      account.initializedAt = at;
    } else {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id || '')) throw new Error('课时流水编号不正确');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < lessons.START)
        throw new Error('课时日期不正确');
      account = core.clone(student.lessonAccount);
      lessons.validateAccount(account);
      if (account.entries.some(entry => entry.id === id)) throw new Error('该操作编号已存在，请先核对流水，不能重复充值');
      account.entries.push({ id, type: mode, delta: amount, date, note, createdAt: at });
    }
    lessons.validateAccount(account);
    const next = { ...student, lessonAccount: account };
    core.validate('students', next);
    return next;
  }
  function create(options) {
    let busy = false;
    async function commit(input) {
      if (busy) throw new Error('正在提交上一笔课时操作，请不要重复点击');
      busy = true;
      let staged = false;
      try {
        if (!options.connected()) throw new Error('请先连接 GuitarBuddy 教师端，课时不支持离线充值');
        const client = options.client();
        if (!client || client.dirty() || client.conflicts())
          throw new Error('存在未同步修改或冲突，必须先完成同步并核对课时，不能重复操作');
        // Pull the freshest known state before building a financial ledger entry.
        if (!await client.sync() || client.dirty() || client.conflicts())
          throw new Error('无法确认云端最新课时，请检查同步状态后重试');
        const data = client.getData();
        const s = data.students.find(x => x.id === input.studentId);
        if (!s) throw new Error('学员不存在，未生成课时操作');
        if (!core.same(s.lessonAccount || null, input.expectedAccount || null))
          throw new Error('课包刚刚发生变动，请重新打开并核对余额后再确认');
        const before = lessons.statement(s, data.courses, options.today()).remaining;
        if (before !== input.expectedRemaining) throw new Error('课时余额已变化，请重新确认后操作');
        const remote = await options.request({ action: 'pull' });
        if (!remote || !remote.data || !Array.isArray(remote.data.students))
          throw new Error('云端课包校验响应不完整，未修改数据');
        const cloudStudent = remote.data.students.find(x => x.id === s.id);
        if (!cloudStudent || !core.same(cloudStudent, s))
          throw new Error('其他设备刚更新了该学员，请同步最新记录后重新操作');
        // Another browser action may occur while the explicit cloud preflight is awaited.
        // Never overwrite those changes with an earlier snapshot.
        if (client.dirty() || client.conflicts() || !core.same(client.getData(), data))
          throw new Error('本机数据在确认期间发生变化，请重新核对后再操作');
        const prepared = plan(s, input, { at: options.now(), date: options.today(), id: input.requestId });
        const after = lessons.statement(prepared, data.courses, options.today()).remaining;
        const next = core.clone(data);
        next.students = next.students.map(x => x.id === s.id ? prepared : x);
        // A persistence failure may happen after client state changes; fail closed.
        staged = true;
        client.write(next);
        let sent = await client.sync();
        if (sent && client.dirty() && !client.conflicts()) sent = await client.sync();
        const settled = client.getData().students.find(x => x.id === s.id);
        const recorded = !!settled && (input.mode === 'init' ? !!settled.lessonAccount :
          !!settled.lessonAccount && settled.lessonAccount.entries.some(e => e.id === input.requestId));
        if (!sent || client.dirty() || client.conflicts() || !recorded)
          return { status: 'pending', message: '本机已保存这笔操作，但云端尚未确认。请等待同步并检查流水，不要再次充值。' };
        return { status: 'saved', before, after, mode: input.mode, amount: Number(input.amount) };
      } catch (e) {
        if (staged) return { status: 'pending', message: '这笔操作已保存在本机，但未确认云端保存：' + e.message + '。请先核对同步与流水，不要重复提交。' };
        throw e;
      } finally { busy = false; }
    }
    return { commit, isBusy: () => busy };
  }
  return { MODES, plan, create };
}));
