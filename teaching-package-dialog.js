(function () {
  'use strict';
  const model = window.TeachingPackageActions;
  const lessons = window.TeachingLessonBalance;
  const titles = { init:'初始化课时', recharge:'充值课时', adjustment:'调整课时' };
  const fmt = n => (n == null ? '待初始化' : String(n) + ' 节');
  function open(id, mode) {
    if (!Object.hasOwnProperty.call(titles, mode)) return;
    if (document.querySelector('.package-dialog[open]')) return;
    const student = students.find(s => s.id === id);
    if (!student) return;
    const balance = window.TeachingBalanceView.balance(student);
    if (balance.unavailable) return window.alert('请先完成 GuitarBuddy 云端同步并核对课包，再进行操作。');
    if (!window.TeachingDesktopPackages || !window.TeachingDesktopPackages.ready())
      return window.alert('课时操作需要已连接并且已同步的 GuitarBuddy。请先处理待同步修改或冲突。');
    if (mode === 'init' && student.lessonAccount) return window.alert('该学员已经初始化，请使用调整课时。');
    if (mode !== 'init' && !student.lessonAccount) return window.alert('请先为该学员初始化课时。');
    const expectedAccount = student.lessonAccount ? JSON.parse(JSON.stringify(student.lessonAccount)) : null;
    const expectedRemaining = balance.remaining;
    const dialog = document.createElement('dialog');
    dialog.className = 'package-dialog status-dialog';
    dialog.setAttribute('aria-label', titles[mode]);
    dialog.innerHTML = '<header class="package-dialog-header"><span class="package-icon">' + (mode === 'recharge' ? '＋' : mode === 'adjustment' ? '⇄' : '◇') + '</span><div><h3>' + titles[mode] + '</h3><p>学员：' + esc(student.name) + ' · 现有余额：' + esc(fmt(expectedRemaining)) + '</p></div></header>'
      + '<div class="package-form"><label>课时数量 <small>（支持 0.5 节）</small><input data-package-amount type="number" inputmode="decimal" step="0.5"'
      + (mode === 'adjustment' ? ' placeholder="例如：-1 或 2"' : mode === 'init' ? ' min="0" placeholder="11月1日上课前余额"' : ' min="0.5" placeholder="例如：10"') + ' required></label>'
      + '<label>' + (mode === 'init' ? '初始化备注（选填）' : '操作原因（必填，至少 2 个字）')
      + '<textarea data-package-note rows="2" maxlength="200" placeholder="' + (mode === 'init' ? '例如：11月1日的确认余额' : mode === 'recharge' ? '例如：新购10节课包' : '例如：更正课时统计') + '"></textarea></label>'
      + '<p class="package-hint">' + (mode === 'init' ? '初始化仅能进行一次，不能覆盖已有课包。基准为 2026-11-01 上课前余额。'
        : mode === 'recharge' ? '充值增加余额，自动记录时间及原因；不得重复提交。'
        : '调整可以增加或扣减，保留原流水；错误请通过反向调整修正。') + '</p></div>'
      + '<div class="package-preview" hidden></div><p class="package-error" role="alert"></p>'
      + '<div class="status-actions package-actions"><button type="button" data-package-cancel>取消</button>'
      + '<button type="button" class="primary" data-package-next>下一步 · 核对课时</button></div>';
    document.body.append(dialog);
    const form = dialog.querySelector('.package-form');
    const preview = dialog.querySelector('.package-preview');
    const actions = dialog.querySelector('.package-actions');
    const error = dialog.querySelector('.package-error');
    const amountField = dialog.querySelector('[data-package-amount]');
    const noteField = dialog.querySelector('[data-package-note]');
    let busy = false;
    let quote = null;
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    function close() { if (!busy) dialog.close(); }
    dialog.querySelector('[data-package-cancel]').onclick = close;
    dialog.querySelector('[data-package-next]').onclick = () => {
      error.textContent = '';
      try {
        const amountText = amountField.value.trim();
        quote = { mode, amount: amountText, note: noteField.value };
        const planned = model.plan(student, quote, {
          id:'pkg_preview_only', date:todayStr(), at:new Date().toISOString()
        });
        const nextBalance = lessons.statement(planned, courses, todayStr()).remaining;
        const sign = mode === 'init' ? '期初余额' : mode === 'recharge' ? '充值' : '调整';
        preview.innerHTML = '<h4>请确认本次课时变更</h4><p><b>' + esc(student.name) + '</b> · ' + titles[mode] + '</p>'
          + '<div class="package-comparison"><span>当前：' + esc(fmt(expectedRemaining)) + '</span><span>→</span><b>预计：' + esc(fmt(nextBalance)) + '</b></div>'
          + '<p>' + sign + '：' + esc(String(Number(amountText))) + ' 节</p>'
          + (quote.note.trim() ? '<p>原因：' + esc(quote.note.trim()) + '</p>' : '')
          + '<p class="package-hint">只在云端确认保存后提示操作成功。若出现同步失败或冲突，请先核对课时流水，切勿再次提交。</p>';
        form.hidden = true; preview.hidden = false;
        actions.innerHTML = '<button type="button" data-package-back>返回修改</button><button type="button" class="primary" data-package-submit>确认并同步</button>';
        actions.querySelector('[data-package-back]').onclick = () => {
          preview.hidden = true; form.hidden = false; quote = null;
          actions.innerHTML = '<button type="button" data-package-cancel>取消</button><button type="button" class="primary" data-package-next>下一步 · 核对课时</button>';
          actions.querySelector('[data-package-cancel]').onclick = close;
          actions.querySelector('[data-package-next]').onclick = () => { /* rebound below */ };
          // Preserve the same dialog with its fields, then reattach the existing handler.
          actions.querySelector('[data-package-next]').onclick = nextStep;
        };
        actions.querySelector('[data-package-submit]').onclick = submit;
      } catch (e) { error.textContent = e.message; }
    };
    const nextStep = dialog.querySelector('[data-package-next]').onclick;
    async function submit() {
      if (busy || !quote) return;
      busy = true; error.textContent = '';
      const submitButton = actions.querySelector('[data-package-submit]');
      const backButton = actions.querySelector('[data-package-back]');
      submitButton.disabled = true; backButton.disabled = true;
      submitButton.textContent = '正在与 GuitarBuddy 同步…';
      try {
        const requestId = 'pkg_' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
          Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,12));
        const result = await window.TeachingDesktopPackages.commit({
          ...quote, studentId: id, expectedAccount, expectedRemaining, requestId
        });
        preview.innerHTML = result.status === 'saved' ?
          '<div class="package-result good"><span class="package-result-icon">✓</span><h4>操作成功 · 已同步</h4>'
            + '<p>已为 ' + esc(student.name) + ' ' + esc(titles[mode]) + '</p><p>' + esc(fmt(result.before))
            + ' → <b>' + esc(fmt(result.after)) + '</b></p><small>课时流水已写入 GuitarBuddy，历史课程和学员状态保持不变。</small></div>' :
          '<div class="package-result pending"><h4>本机已保存 · 云端尚未确认</h4><p>' + esc(result.message) + '</p>'
            + '<p>请核对两端余额和流水后再决定是否需要新操作。</p></div>';
      } catch (e) {
        error.textContent = '本次未发起充值：' + e.message;
        busy = false;
        submitButton.disabled = false; backButton.disabled = false;
        submitButton.textContent = '重新核对并确认';
        return;
      }
      busy = false;
      actions.innerHTML = '<button type="button" class="primary" data-package-done>完成</button>';
      actions.querySelector('[data-package-done]').onclick = close;
    }
    dialog.showModal();
    amountField.focus();
  }
  window.TeachingPackageDialog = { open };
}());
