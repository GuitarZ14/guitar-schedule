/* Student package queries remain read-only; status changes use the existing student sync. */
(function () {
  'use strict';
  let syncState = 'disconnected', verified = false, syncedAt = null;
  let selectedId = null, tab = 'ledger';
  const labels = { disconnected: '未连接 GuitarBuddy', syncing: '正在同步', error: '同步失败', conflict: '待处理同步冲突', retry: '正在重新同步', pending: '本地更改待同步', saved: '与 GuitarBuddy 同步' };
  function readable() { return verified && ['saved', 'pending', 'syncing'].includes(syncState); }
  function balance(student) {
    if (!readable()) return { initialized: false, remaining: null, remainingText: labels[syncState] || '待同步', unavailable: true };
    try { return { ...window.TeachingLessonBalance.statement(student, courses, todayStr()), studentStatus: student.stuStatus || 'active' }; }
    catch (e) { return { initialized: false, remaining: null, remainingText: '课包数据待核验', unavailable: true }; }
  }
  function cell(b) {
    if (b.remaining == null) return '<span class="balance-unknown">' + esc(b.remainingText) + '</span>';
    const low = (!b.studentStatus || b.studentStatus === 'active') && b.remaining <= 2;
    return '<b class="' + (low ? 'h-low' : 'h-ok') + '">' + b.remaining + '</b><small> 节</small>' + (low ? '<span class="h-tip">建议续费</span>' : '');
  }
  function overview() {
    const active = students.filter(s => !s.stuStatus || s.stuStatus === 'active');
    const accounts = active.map(balance);
    const complete = readable() && accounts.every(b => !b.unavailable);
    const metric = (label, value, hint) => '<div class="balance-metric"><span>' + label + '</span><b>' + value + '</b><small>' + hint + '</small></div>';
    return '<section class="balance-overview" aria-label="学员课时概览">' + metric('在读学员', active.length, '人')
      + metric('待续费学员', complete ? accounts.filter(b => b.remaining != null && b.remaining <= 2).length : '—', '剩余 ≤ 2 节')
      + metric('课时未初始化', complete ? accounts.filter(b => !b.initialized).length : '—', '在读学员') + '</section>'
      + '<p class="balance-sync" role="status">' + esc(labels[syncState] || '待同步')
      + (syncedAt ? ' · 最近同步 ' + esc(syncedAt) : '') + ' · 课包余额截至今天，与所选统计月份无关</p>'
      + '<div id="teachingReminders" aria-label="待处理提醒"></div>';
  }
  function detail() {
    const s = students.find(s => s.id === selectedId);
    if (!s) return '<aside class="balance-detail"><div class="empty">选择学员查看课包与记录</div></aside>';
    const b = balance(s);
    const packageReady = !!(window.TeachingDesktopPackages && window.TeachingDesktopPackages.ready());
    const packageHint = b.unavailable ? '课包状态尚未确认，暂不可操作' : packageReady ? '操作前核对余额，云端确认后才会显示成功' : '请先完成 GuitarBuddy 同步，再进行课包操作';
    const packageActions = '<div class="package-quick-actions" aria-label="课包管理">' + (!b.initialized
      ? '<button type="button" class="primary" data-package-action="init"' + (!packageReady || b.unavailable ? ' disabled' : '') + '>◇ 初始化课时</button>'
      : '<button type="button" class="primary" data-package-action="recharge"' + (!packageReady || b.unavailable ? ' disabled' : '') + '>＋ 充值课时</button>'
        + '<button type="button" data-package-action="adjustment"' + (!packageReady || b.unavailable ? ' disabled' : '') + '>⇄ 调整课时</button>')
      + '</div><p class="package-quick-hint">' + esc(packageHint) + '</p>';
    let body = '';
    if (tab === 'ledger') {
      body = b.unavailable || !b.initialized ? '<div class="empty">' + esc(b.remainingText) + (b.unavailable ? '，请检查教师端连接。' : '，点击上方「初始化课时」设置期初余额。') + '</div>'
        : '<div class="balance-breakdown"><span>11月1日期初 <b>' + b.openingText + '</b></span><span>充值 <b>+' + b.recharged + '</b></span><span>调整 <b>' + b.adjusted + '</b></span><span>已上扣课 <b>−' + b.deducted + '</b></span></div>'
          + '<ol class="balance-ledger">' + b.entries.map(e => '<li><div><b>' + esc(e.label) + '</b><strong class="' + (e.delta < 0 ? 'h-low' : 'h-ok') + '">' + (e.delta > 0 ? '+' : '') + e.delta + '</strong></div><time>' + esc(e.date) + '</time><p>' + esc(e.note) + '</p></li>').join('') + '</ol>';
    } else if (tab === 'courses') {
      const list = window.TeachingLessonBalance.studentCourses(s.id, courses, todayStr());
      body = '<button type="button" class="tbtn" id="balanceLessonFeedback">查看课后记录与分享</button>'
        + (list.length ? '<ol class="balance-ledger">' + list.map(c => '<li><div><b>' + esc(c.date) + '</b><span>' + esc(c.statusLabel) + '</span></div><p>' + esc(c.timeText + ' · ' + courseKindName(c) + ' · ' + c.classText) + '</p><small>' + (c.counted ? '计入课包扣减 1 节' : '不计入当前课包扣减') + '</small></li>').join('') + '</ol>' : '<div class="empty">暂无课程记录</div>');
    } else if (tab === 'growth' || tab === 'binding') {
      body = '<div id="studentInsights" role="status">正在准备只读资料…</div>';
    } else if (tab === 'history') {
      body = window.TeachingStudentStatusView.historyHtml(s);
    } else {
      body = '<dl class="balance-profile">' + [['课程类型', s.level], ['状态', (STU_STATUS[s.stuStatus] || STU_STATUS.active).txt], ['联系电话', s.phone], ['老师', s.teacher], ['备注', s.note]].map(([k,v]) => '<div><dt>' + k + '</dt><dd>' + esc(v || '—') + '</dd></div>').join('') + '</dl>';
    }
    const insightTab=tab==='growth'||tab==='binding';
    return '<aside class="balance-detail" aria-label="学员详情"><header><span class="page-kicker">STUDENT PROFILE</span><h3>' + esc(s.name) + '</h3><span>' + esc(s.level || '吉他学员') + '</span></header>'
      + (insightTab ? '' : window.TeachingStudentStatusView.summary(s, syncState)
      + '<div class="balance-hero"><span>剩余课时</span><div>' + cell(b) + '</div><small>与 GuitarBuddy 使用同一份课包流水；未确认同步时禁止修改。</small></div>'
      + packageActions)
      + '<div class="balance-tabs" role="tablist" aria-label="学员详情分类">' + [['ledger','课时流水'],['courses','课程记录'],['profile','基本资料'],['growth','成长档案'],['binding','绑定状态'],['history','状态历史']].map(([key,label]) => '<button type="button" role="tab" data-balance-tab="' + key + '" aria-selected="' + (tab === key) + '">' + label + '</button>').join('') + '</div>'
      + '<div class="balance-body" role="tabpanel" aria-label="' + ({ledger:'课时流水',courses:'课程记录',profile:'基本资料',growth:'成长档案',binding:'绑定状态',history:'状态历史'})[tab] + '">' + body + '</div></aside>';
  }
  function bind(resetScroll) {
    const host = document.getElementById('balanceDetail');
    if (!host) return;
    const scroll = !resetScroll && host.querySelector('.balance-body')?.scrollTop || 0;
    const focusedTab = host.contains(document.activeElement) && document.activeElement.dataset.balanceTab;
    if (!students.some(s => s.id === selectedId)) selectedId = students[0] && students[0].id;
    host.innerHTML = detail();
    const body = host.querySelector('.balance-body');
    if (body) body.scrollTop = scroll;
    if ((tab === 'growth' || tab === 'binding') && window.TeachingStudentDetail) window.TeachingStudentDetail.mount(host.querySelector('#studentInsights'), students.find(s=>s.id===selectedId), courses, tab);
    const reminder=document.getElementById('teachingReminders');
    if(reminder && window.TeachingStudentDetail) window.TeachingStudentDetail.mountReminder(reminder,students,courses,syncState,todayStr());
    document.querySelectorAll('[data-balance-student]').forEach(el => {
      el.classList.toggle('balance-selected', el.dataset.balanceStudent === selectedId);
    });
    host.querySelectorAll('[data-balance-tab]').forEach(el => {
      el.onclick = () => { tab = el.dataset.balanceTab; bind(true); };
      if (el.dataset.balanceTab === focusedTab) el.focus({preventScroll:true});
    });
    const picker = host.querySelector('[data-student-status]');
    if (picker) picker.onchange = () => { const to = picker.value; picker.value = students.find(s => s.id === selectedId)?.stuStatus || 'active'; window.TeachingStudentStatusView.open(selectedId, to); };
    host.querySelectorAll('[data-package-action]').forEach(button => {
      button.onclick = () => { if (!button.disabled) window.TeachingPackageDialog.open(selectedId, button.dataset.packageAction); };
    });
    const feedback = document.getElementById('balanceLessonFeedback');
    if (feedback) feedback.onclick = () => openStudentDetail(selectedId);
  }
  function select(id) { selectedId = id; tab = 'ledger'; bind(true); }
  window.addEventListener('teaching-sync-state', event => {
    syncState = event.detail.state;
    if (syncState === 'saved') { verified = true; syncedAt = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}); }
    if (syncState === 'disconnected') { verified = false; syncedAt = null; }
    if (currentTab === 'edit') {
      // Periodic status changes must not rebuild the search field or the whole table.
      const summary = document.getElementById('balanceOverview');
      if (summary) summary.innerHTML = overview();
      document.querySelectorAll('[data-balance-student]').forEach(row => {
        const student = students.find(s => s.id === row.dataset.balanceStudent);
        const target = row.querySelector('.balance-cell');
        if (student && target) target.innerHTML = cell(balance(student));
      });
      bind();
    }
  });
  window.TeachingBalanceView = { balance, cell, overview, bind, select };
}());
