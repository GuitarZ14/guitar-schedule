/* GuitarBuddy 教师同步；保留现有课表的业务页面和本地存储键。 */
(function () {
  'use strict';
  const core = window.TeachingCore;
  const CONNECTION = 'gb_teaching_connection';
  const DEFAULT_ENDPOINT = 'https://cloud1-d8g72uobwdbbdb2eb-1452920132.ap-shanghai.app.tcloudbase.com/teaching';
  const CACHE = 'gb_teaching_sync_v1';
  let client = null, connection = null, timer = null, conflictOpen = false;
  const snapshot = () => ({ students, courses, extraIncome: loadExtraIncome() });
  const label = document.createElement('span');
  label.style.cssText = 'display:block;font-size:12px;line-height:1.5;margin:6px 0;';
  label.setAttribute('aria-live', 'polite');
  const button = document.createElement('button');
  button.id = 'btnTeachingConnect'; button.type = 'button'; button.textContent = '连接 GuitarBuddy';
  document.querySelector('.data-tools .acts').prepend(button, label);
  const conflictButton = document.createElement('button');
  conflictButton.type = 'button'; conflictButton.textContent = '处理同步冲突'; conflictButton.hidden = true;
  conflictButton.onclick = () => { if (client && client.conflicts()) resolveConflicts(client.conflicts()); };
  label.after(conflictButton);

  function status(text) { label.textContent = text; }
  async function request(input, config = connection) {
    const response = await fetch(config.endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.ok) { const e = new Error(result.error || '同步服务请求失败'); e.code = result.code; throw e; }
    return result;
  }
  let composing = false, deferredRender = false;
  document.addEventListener('compositionstart', () => { composing = true; }, true);
  document.addEventListener('compositionend', () => {
    composing = false;
    if (deferredRender) {
      deferredRender = false;
      setTimeout(() => render(), 0);
    }
  }, true);
  function apply(data) {
    // A successful periodic pull is not itself a data change. Never redraw active forms
    // unless the remote records actually differ from local records (order independent).
    if (core.diff(snapshot(), data, {}).length === 0) return;
    students = data.students; courses = data.courses;
    localStorage.setItem(STORE.students, JSON.stringify(students));
    localStorage.setItem(STORE.courses, JSON.stringify(courses));
    localStorage.setItem(EXTRA_INCOME_KEY, JSON.stringify(data.extraIncome));
    if (composing) deferredRender = true;
    else render();
  }
  function toggleLegacy() {
    ['btnCloudBackup', 'btnCloudRestore', 'cloudStatus'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !!connection; });
    const toggle = document.getElementById('remindToggle');
    if (connection && toggle) {
      toggle.disabled = true;
      document.getElementById('remindSub').textContent = '原提醒使用旧备份数据；教师端订阅提醒待配置';
    }
    button.textContent = connection ? 'GuitarBuddy 连接设置' : '连接 GuitarBuddy';
  }
  function start(initial) {
    const config = { ...connection };
    let instance;
    instance = window.TeachingSync.create({
      request: input => request(input, config),
      load: () => initial || (() => { const saved = JSON.parse(localStorage.getItem(CACHE) || 'null'); return saved ? { ...saved, data: snapshot() } : { base: core.empty(), data: snapshot(), versions: {}, revision: 0 }; })(),
      save: state => { if (client === instance) localStorage.setItem(CACHE, JSON.stringify(state)); },
      onChange: (state, detail) => {
        if (client !== instance) return;
        const labels = { syncing: '正在与教师端同步…', pending: '本地已保存 · 待同步', saved: '教师端与电脑已同步', retry: '检测到新版本，正在重新检查', conflict: '同一记录在两端修改，请处理冲突', error: '同步失败 · 本地修改已保留' };
        status(labels[state] || state);
        if (state === 'saved' || state === 'pending') apply(client.getData());
        if (state === 'error') label.textContent += '：' + detail.message;
        if (state === 'retry') setTimeout(flush, 300);
        conflictButton.hidden = state !== 'conflict';
        if (state === 'conflict') resolveConflicts(detail);
      },
    });
    client = instance;
    toggleLegacy(); flush();
  }
  async function flush() {
    if (!client || document.hidden) return;
    const ok = await client.sync();
    if (ok && client.dirty()) schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 500); }
  function changed() {
    if (!client) return;
    try { client.write(snapshot()); schedule(); }
    catch (e) { status('本地已保存，但不能同步：' + e.message); }
  }
  function dialog(title) {
    const d = document.createElement('dialog');
    d.style.cssText = 'max-width:520px;width:calc(100% - 32px);border:1px solid #dfd9cc;border-radius:16px;padding:24px;color:#392e24;background:#fffdf8;';
    const h = document.createElement('h3'); h.textContent = title; d.append(h);
    const close = document.createElement('button'); close.textContent = '关闭'; close.type = 'button'; close.style.marginTop = '18px'; close.onclick = () => d.close();
    document.body.append(d); d.addEventListener('close', () => d.remove(), { once: true });
    return { d, close };
  }
  function resolveConflicts(conflicts) {
    if (conflictOpen) return; conflictOpen = true;
    const { d, close } = dialog('同一记录在两端修改');
    const explain = document.createElement('p'); explain.textContent = '请比较以下记录。选择会应用于本次列出的全部冲突，其他记录正常合并。'; d.append(explain);
    const describe = x => x ? JSON.stringify(x, null, 2) : '已删除';
    conflicts.forEach(c => {
      const h = document.createElement('h4'); h.textContent = c.kind + ' / ' + c.id;
      const pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;';
      pre.textContent = '本机：\n' + describe(c.local) + '\n\n云端：\n' + describe(c.remote); d.append(h, pre);
    });
    [true, false].forEach(useLocal => { const b = document.createElement('button'); b.textContent = useLocal ? '保留本机版本' : '采用云端版本'; b.onclick = () => { client.resolve(useLocal); d.close(); flush(); }; b.style.marginRight = '10px'; d.append(b); });
    close.textContent = '稍后处理'; d.append(close); d.addEventListener('close', () => { conflictOpen = false; }, { once: true }); d.showModal();
  }
  button.onclick = () => {
    const { d, close } = dialog('连接 GuitarBuddy 教师端');
    const text = document.createElement('p'); text.textContent = '在小程序「教师小天地 → 设置」生成连接口令。首次连接前请导出当前课表备份。'; d.append(text);
    function input(title, type, value) { const l = document.createElement('label'); l.textContent = title; l.style.display = 'block'; l.style.margin = '12px 0'; const i = document.createElement('input'); i.type = type; i.value = value || ''; i.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:6px;'; l.append(i); d.append(l); return i; }
    const endpoint = input('教学云函数 HTTPS 地址', 'url', connection && connection.endpoint || DEFAULT_ENDPOINT);
    const token = input('电脑连接口令', 'password', ''); token.autocomplete = 'off';
    const mode = document.createElement('select');
    [['cloud', '使用教师端数据（替换本机数据）'], ['merge', '将电脑数据合并到教师端']].forEach(([value, name]) => { const option = document.createElement('option'); option.value = value; option.textContent = name; mode.append(option); });
    mode.style.cssText = 'width:100%;padding:10px;margin:12px 0;'; d.append(mode);
    const feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); d.append(feedback);
    const connect = document.createElement('button'); connect.textContent = '连接并预览数据量'; connect.type = 'button';
    connect.onclick = async () => {
      connect.disabled = true;
      try {
        const url = new URL(endpoint.value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('请填写有效的 HTTPS 云函数地址');
        const config = { endpoint: url.href, token: token.value.trim() };
        if (!/^[a-f0-9]{64}$/.test(config.token)) throw new Error('连接口令格式不正确');
        const remote = await request({ action: 'pull' }, config);
        const current = core.normalize(snapshot());
        const counts = '电脑：' + current.students.length + ' 名学员、' + current.courses.length + ' 节课、' + current.extraIncome.length + ' 笔收入。\n教师端：' + remote.data.students.length + ' 名学员、' + remote.data.courses.length + ' 节课、' + remote.data.extraIncome.length + ' 笔收入。';
        if (!window.confirm(counts + '\n\n' + (mode.value === 'cloud' ? '使用教师端数据替换本机？' : '将电脑数据合并上传？同一记录冲突时会再次提示。'))) return;
        connection = config;
        const initial = mode.value === 'cloud' ? { base: remote.data, data: remote.data, versions: remote.versions, revision: remote.revision } : { base: core.empty(), data: current, versions: {}, revision: 0 };
        localStorage.setItem(CONNECTION, JSON.stringify(connection)); localStorage.setItem(CACHE, JSON.stringify(initial));
        if (mode.value === 'cloud') apply(remote.data);
        start(initial); d.close();
      } catch (e) { feedback.textContent = e.message; }
      finally { connect.disabled = false; }
    };
    d.append(connect);
    if (connection) {
      const disconnect = document.createElement('button'); disconnect.textContent = '断开本机连接'; disconnect.type = 'button'; disconnect.style.margin = '12px';
      disconnect.onclick = () => { if (!window.confirm('断开连接？本地数据保留，未同步修改请先导出备份。')) return; client = null; connection = null; localStorage.removeItem(CONNECTION); localStorage.removeItem(CACHE); clearTimeout(timer); toggleLegacy(); status('已断开，本地数据保留；刷新页面可重新使用原云备份'); d.close(); };
      d.append(disconnect);
    }
    d.append(close); d.showModal();
  };
  const originalSaveStudents = saveStudents, originalSaveCourses = saveCourses, originalSaveIncome = saveExtraIncome;
  saveStudents = function () { originalSaveStudents(); changed(); };
  saveCourses = function () { originalSaveCourses(); changed(); };
  saveExtraIncome = function (records) { originalSaveIncome(records); changed(); };
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
  setInterval(flush, 15000);
  try { connection = JSON.parse(localStorage.getItem(CONNECTION) || 'null'); if (connection) start(); }
  catch (e) { status('连接配置无法读取，请重新连接'); }
}());
