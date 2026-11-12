/* Student state changes use the existing teacher workspace and never edit courses/accounts. */
(function () {
  'use strict';
  const model = window.TeachingStudentStatus;
  const name = state => model.labels[state] || state;
  function summary(student, syncState) {
    const state = model.current(student);
    return '<section class="student-status" aria-label="学习状态"><div><span class="lab">学习状态</span><span class="stu-tag ' + (STU_STATUS[state]?.cls || '') + '">' + esc(name(state)) + '</span></div>'
      + '<label class="status-picker">调整状态<select data-student-status="' + esc(student.id) + '" aria-label="调整学习状态">'
      + Object.entries(model.labels).map(([key, label]) => '<option value="' + key + '"' + (state === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>'
      + '<p>' + (state === 'active' ? '剩余课时 ≤ 2 节时提醒续费' : esc(name(state)) + ' · 不提醒续费，剩余课时保留') + '</p>'
      + '<small role="status">' + ({saved:'已与 GuitarBuddy 同步',syncing:'同步中',pending:'本地已保存 · 待同步',error:'同步失败 · 本地修改已保留',conflict:'存在冲突 · 尚未同步',retry:'正在重新检查云端版本',disconnected:'仅保存在本机 · 未连接 GuitarBuddy'})[syncState] + '</small></section>';
  }
  function historyHtml(student) {
    const entries = model.history(student).slice().reverse();
    return '<p class="status-history-hint">记录工作台的状态变更。旧记录及未提供审计信息的教师端变更，不补写操作时间。</p>' + (entries.length ? '<ol class="balance-ledger">' + entries.map(e => '<li><div><b>' + esc(name(e.from)) + ' → ' + esc(name(e.to)) + '</b><span>' + (e.outcome === 'discarded' ? '冲突未采用' : '电脑端操作') + '</span></div><time>' + esc(new Date(e.at).toLocaleString('zh-CN', {hour12:false})) + '</time><p>' + esc(e.note || '未填写备注') + '</p></li>').join('') + '</ol>' : '<div class="empty">暂无状态变更记录</div>');
  }
  function open(id, to) {
    const initial = students.find(s => s.id === id);
    if (!initial || model.current(initial) === to) return;
    document.querySelectorAll('.status-dialog:not([open])').forEach(dialog => dialog.remove());
    const from = model.current(initial);
    const d = document.createElement('dialog'); d.className = 'status-dialog';
    d.setAttribute('aria-labelledby', 'statusDialogTitle');
    const future = courses.filter(c => c.studentId === id && c.status === 'planned' && c.date >= todayStr()).length;
    d.innerHTML = '<h3 id="statusDialogTitle">确认' + (to === 'active' ? '恢复在读' : '改为' + esc(name(to))) + '？</h3>'
      + '<p><b>' + esc(initial.name) + '</b>：' + esc(name(from)) + ' → ' + esc(name(to)) + '</p>'
      + '<p>' + (to === 'active' ? '恢复后，将按真实剩余课时重新判断续费提醒。' : '将停止续费提醒，剩余课时与历史记录完整保留。') + '</p>'
      + (future ? '<p class="status-future">还有 ' + future + ' 节今天及未来的待上课程，请检查安排；本次不会自动取消课程。</p>' : '')
      + '<label>变更备注 <small>（选填）</small><textarea id="statusNote" maxlength="200" rows="3" placeholder="例如：暂时停课，之后再联系"></textarea></label>'
      + '<p class="status-error" role="alert"></p><div class="status-actions"><button type="button" data-status-cancel>取消</button><button type="button" class="primary" data-status-confirm>确认变更</button></div>';
    document.body.append(d);
    const returnFocus = document.querySelector('[data-student-status="' + CSS.escape(id) + '"]');
    d.addEventListener('close', () => { d.remove(); returnFocus?.focus(); }, {once:true});
    d.querySelector('[data-status-cancel]').onclick = () => { d.close(); d.remove(); };
    d.querySelector('[data-status-confirm]').onclick = () => {
      const index = students.findIndex(s => s.id === id);
      const latest = students[index];
      const error = d.querySelector('.status-error');
      if (!latest || model.current(latest) !== from) { error.textContent = '学员状态已在另一处变更，请取消并核对最新状态后再操作。'; return; }
      try {
        const next = model.change(latest, to, d.querySelector('#statusNote').value, uid(), new Date().toISOString());
        window.TeachingCore.validate('students', next);
        students[index] = next;
        try { saveStudents(); } catch (e) { students[index] = latest; throw e; }
        d.close(); d.remove(); render();
        document.querySelector('[data-student-status="' + CSS.escape(id) + '"]')?.focus();
      } catch (e) { error.textContent = '未能保存：' + e.message; }
    };
    d.showModal(); d.querySelector('[data-status-cancel]').focus();
  }
  window.TeachingStudentStatusView = { summary, historyHtml, open };
}());
