(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./teaching-core'));
  else root.TeachingSync = factory(root.TeachingCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';
  function create(options) {
    let state = options.load() || { base: core.empty(), data: core.empty(), versions: {}, revision: 0 };
    let running = null, pendingConflict = null;
    const emit = (status, detail) => options.onChange && options.onChange(status, detail);
    const persist = () => options.save(core.clone(state));
    const api = {
      getData: () => core.clone(state.data),
      dirty: () => core.diff(state.base, state.data, state.versions).length > 0,
      write(data) { state.data = core.normalize(data); persist(); emit('pending'); },
      conflicts: () => pendingConflict && core.clone(pendingConflict.merged.conflicts),
      resolve(useLocal) {
        if (!pendingConflict) return;
        const { remote } = pendingConflict;
        // 冲突期间仍可能编辑；重新合并最新草稿，再应用明确选择。
        const latest = core.merge(state.base, state.data, remote.data);
        if (!useLocal) latest.conflicts.forEach(c => {
          latest.data[c.kind] = latest.data[c.kind].filter(x => x.id !== c.id);
          if (c.remote) latest.data[c.kind].push(c.remote);
        });
        state = { base: remote.data, data: latest.data, versions: remote.versions, revision: remote.revision };
        pendingConflict = null; persist(); emit(api.dirty() ? 'pending' : 'saved');
      },
      sync() {
        if (running) return running;
        if (pendingConflict) return Promise.resolve(false);
        running = (async () => {
          emit('syncing');
          try {
            const remote = await options.request({ action: 'pull' });
            if (!remote || !remote.data || !remote.versions || !Number.isInteger(remote.revision)) throw new Error('同步响应不完整');
            const merged = core.merge(state.base, state.data, remote.data);
            if (merged.conflicts.length) { pendingConflict = { remote, merged }; emit('conflict', merged.conflicts); return false; }
            const localAtSend = core.clone(state.data);
            const sent = merged.data;
            const ops = core.diff(remote.data, sent, remote.versions);
            const saved = ops.length ? await options.request({ action: 'push', operations: ops }) : remote;
            // 请求期间新增的修改保留；不让同步返回值覆盖尚未上传的编辑。
            // state.data 尚未包含 pull 带来的变化，按旧本地草稿作基准保留并发编辑。
            const final = core.merge(localAtSend, state.data, saved.data);
            if (final.conflicts.length) { pendingConflict = { remote: saved, merged: final }; emit('conflict', final.conflicts); return false; }
            state = { base: saved.data, data: final.data, versions: saved.versions, revision: saved.revision };
            persist(); emit(api.dirty() ? 'pending' : 'saved'); return true;
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
