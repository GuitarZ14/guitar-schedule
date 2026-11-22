/* Swiss 主题配套交互：学员档案改为右侧抽屉。
   只做「打开 / 关闭」这一件事，不触碰 select、bind 或任何业务数据；
   删除本文件并移除 index.html 里的引用即可回滚到常驻两栏。 */
(function () {
  'use strict';
  if (window.__swissStudentDrawer) return;
  window.__swissStudentDrawer = true;

  var lastTrigger = null;
  var closeBtn = null;

  function panel() { return document.querySelector('#balanceDetail .balance-detail'); }
  function isOpen() { return document.body.classList.contains('sw-drawer-open'); }

  function mountClose() {
    if (closeBtn && document.contains(closeBtn)) return closeBtn;
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sw-drawer-close';
    closeBtn.setAttribute('aria-label', '关闭学员档案');
    closeBtn.title = '关闭（Esc）';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    });
    document.body.appendChild(closeBtn);
    return closeBtn;
  }

  function open(trigger) {
    // 面板尚未渲染（还没进过学员页）时不打开，避免弹出空抽屉
    if (!panel()) return;
    var wasOpen = isOpen();
    document.body.classList.add('sw-drawer-open');
    if (trigger) lastTrigger = trigger;
    var btn = mountClose();
    if (!wasOpen && btn) {
      requestAnimationFrame(function () {
        if (document.contains(btn)) btn.focus({ preventScroll: true });
      });
    }
  }

  function close(restoreFocus) {
    if (!isOpen()) return;
    document.body.classList.remove('sw-drawer-open');
    if (restoreFocus && lastTrigger && document.contains(lastTrigger)) {
      try { lastTrigger.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  // 捕获阶段先于业务绑定执行：点学员先开抽屉，点别处先收抽屉，互不干扰
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.sw-drawer-close')) return;
    var trigger = t.closest('[data-stu-view]');
    if (trigger) { open(trigger); return; }
    if (t.closest('#balanceDetail')) return;
    if (t.closest('[data-tab]')) { close(false); return; }
    if (isOpen()) close(false);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation();
    close(true);
  }, true);

  // 切走学员页会隐藏 #view-edit，此时必须清掉打开态，否则关闭按钮会留在屏幕上
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) close(false);
  });
}());
