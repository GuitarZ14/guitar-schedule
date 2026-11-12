(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./teaching-core'), require('./teaching-student-status'));
  else root.TeachingSync = factory(root.TeachingCore, root.TeachingStudentStatus);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (core, status) {
  'use strict';
  const onlyStatus = (old, next) => old && next && core.same(status.withoutStatus(old), status.withoutStatus(next));
  function confirmsOperation(op, saved) {
    if (core.same(op.data, saved)) return true;
    if (!op.data || !saved || !['students', 'courses'].includes(op.kind)) return false;
    const field = op.kind === 'students' ? 'stuStatusHistory' : 'attendanceHistory';
    const expected = { ...op.data }, actual = { ...saved };
    const history = Array.isArray(expected[field]) ? expected[field] : [];
    const savedHistory = Array.isArray(actual[field]) ? actual[field] : [];
    delete expected[field]; delete actual[field];
    return core.same(expected, actual) && history.every(entry => savedHistory.some(item => core.same(entry, item)));
  }
  function merge(base, local, remote) {
    const result = core.merge(base, local, remote);
    // A state-only edit may merge with remote profile/package changes. A state
    // changed differently on both devices still requires an explicit decision.
    result.conflicts = result.conflicts.filter(c => {
      const old = base.students.find(s => s.id === c.id);
      if (c.kind !== 'students' || !old || !c.local || !c.remote) return true;
      let value;
      if (onlyStatus(old, c.local) && [status.current(old), status.current(c.local)].includes(status.current(c.remote))) value = { ...c.remote, stuStatus: status.current(c.local) };
      else if (onlyStatus(old, c.remote) && status.current(c.local) === status.current(old)) value = { ...c.local, stuStatus: status.current(c.remote) };
      if (!value) return true;
      value.stuStatusHistory = status.mergeHistory(c.local, c.remote);
      result.data.students = result.data.students.map(s => s.id === c.id ? value : s);
      return false;
    });
    return result;
  }
  function create(options) {
    const loaded = options.load();
    let state = loaded || { base: core.empty(), data: core.empty(), versions: {}, revision: 0 };
    let running = null, pendingConflict = loaded && loaded.pendingConflict || null;
    const emit = (value, detail) => options.onChange && options.onChange(value, detail);
    const persist = () => options.save(core.clone({ ...state, pendingConflict }));
    const hold = (remote, merged) => { pendingConflict = { remote, merged }; persist(); emit('conflict', merged.conflicts); };
    function valid(response) {
      if (!response || !response.data || !response.versions || !Number.isInteger(response.revision)) throw new Error('同步响应不完整');
      core.normalize(response.data);
      return response;
    }
    const api = {
      getData: () => core.clone(state.data),
      dirty: () => core.diff(state.base, state.data, state.versions).length > 0,
      write(data) {
        const next = core.normalize(data);
        // Teaching records may own published homework and financial history in other collections.
        // Do not allow legacy UI paths to stage a physical deletion for cloud sync.
        for (const kind of ['students', 'courses']) {
          const nextIds = new Set(next[kind].map(item => item.id));
          if (state.data[kind].some(item => !nextIds.has(item.id)))
            throw new Error('禁止直接删除学员或课程，请通过停课、结课、取消或隐藏保留历史');
        }
        state.data = next; persist(); emit(pendingConflict ? 'conflict' : 'pending', api.conflicts());
      },
      conflicts: () => pendingConflict && core.clone(merge(state.base, state.data, pendingConflict.remote.data).conflicts),
      resolve(useLocal) {
        if (!pendingConflict) return;
        const { remote } = pendingConflict;
        const latest = merge(state.base, state.data, remote.data);
        latest.conflicts.forEach(c => {
          let chosen = useLocal ? c.local : c.remote;
          const old = state.base.students.find(s => s.id === c.id);
          if (c.kind === 'students' && chosen && c.local && c.remote && onlyStatus(old, c.local)) {
            // Resolve only the requested state; always retain the newest cloud
            // account/profile. Keep rejected local attempts as such in history.
            const localHistory = status.history(c.local).map(entry => status.history(old).some(e => e.id === entry.id) ? entry : { ...entry, outcome: 'discarded' });
            chosen = { ...c.remote, stuStatusHistory: status.mergeHistory({stuStatusHistory:localHistory}, c.remote) };
            if (useLocal) chosen = status.change(chosen, status.current(c.local), '同步冲突：确认保留本机状态', 'resolve_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), new Date().toISOString());
          }
          if (c.kind === 'students' && chosen && c.remote) {
            chosen = { ...chosen };
            if (c.remote.lessonAccount) chosen.lessonAccount = core.clone(c.remote.lessonAccount);
            else delete chosen.lessonAccount;
          }
          latest.data[c.kind] = latest.data[c.kind].filter(x => x.id !== c.id);
          if (chosen) latest.data[c.kind].push(chosen);
        });
        state = { base: remote.data, data: latest.data, versions: remote.versions, revision: remote.revision };
        pendingConflict = null; persist(); emit(api.dirty() ? 'pending' : 'saved');
      },
      sync() {
        if (running) return running;
        if (pendingConflict) { emit('conflict', api.conflicts()); return Promise.resolve(false); }
        running = (async () => {
          emit('syncing');
          try {
            const remote = valid(await options.request({ action: 'pull' }));
            const merged = merge(state.base, state.data, remote.data);
            if (merged.conflicts.length) { hold(remote, merged); return false; }
            const localAtSend = core.clone(state.data);
            const sent = merged.data;
            const ops = core.diff(remote.data, sent, remote.versions);
            if (ops.some(op => ['students','courses'].includes(op.kind) && op.data == null))
              throw new Error('检测到待同步的物理删除记录，已阻止上传。请保留历史并从备份核对');
            const saved = ops.length ? valid(await options.request({ action: 'push', operations: ops })) : remote;
            if (ops.some(op => !confirmsOperation(op, saved.data[op.kind].find(x => x.id === op.id) || null))) throw new Error('云端返回结果未确认本次更改，本地修改已保留');
            // Only edits made while this request was running remain pending.
            const final = merge(localAtSend, state.data, saved.data);
            if (final.conflicts.length) { hold(saved, final); return false; }
            state = { base: saved.data, data: final.data, versions: saved.versions, revision: saved.revision };
            pendingConflict = null; persist(); emit(api.dirty() ? 'pending' : 'saved'); return true;
          } catch (e) { emit(e.code === 'CONFLICT' ? 'retry' : 'error', e); return false; }
          finally { running = null; }
        })();
        return running;
      },
    };
    return api;
  }
  return { create };
}));
