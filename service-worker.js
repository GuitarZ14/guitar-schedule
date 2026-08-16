/* 吉他教学工作台 — Service Worker
 * 作用：缓存应用外壳，支持离线打开；Google 字体走 stale-while-revalidate；
 *       JSONBin 备份接口始终走网络（不缓存，避免脏数据）。
 * 更新：改 CACHE 版本号即可让旧缓存失效。
 */
const CACHE = 'guitar-wb-v11';

// 应用外壳（缓存这些即可离线运行；任意文件缺失也不阻断安装）
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-150.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-310.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // 逐条缓存，单文件失败不影响整体安装
      return Promise.allSettled(SHELL.map((u) => cache.add(u)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;            // 只处理 GET
  const url = new URL(req.url);

  // JSONBin 备份/恢复：永远走网络，不缓存响应
  if (url.hostname.includes('jsonbin.io')) return;

  // Google 字体：先返回缓存，后台更新（stale-while-revalidate）
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 同源资源：index.html 走网络优先（确保更新即时生效）；其余走缓存优先
  if (url.origin === self.location.origin) {
    if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
      event.respondWith(networkFirstShell(req));
    } else {
      event.respondWith(cacheFirst(req));
    }
  }
});

function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
        }
        return res;
      })
      .catch(() => caches.match('./index.html'));   // 离线兜底
  });
}

/* index.html 专用：网络优先，确保更新即时生效；离线时降级到缓存 */
function networkFirstShell(req) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const cp = res.clone();
      caches.open(CACHE).then((c) => c.put(req, cp));   // 后台更新缓存
      return res;
    }
    throw new Error('network response not ok');
  }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')));
}

function staleWhileRevalidate(req) {
  return caches.match(req).then((cached) => {
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
        }
        return res;
      })
      .catch(() => cached);
    return cached || network;
  });
}

/* ===== 课程提醒：接收推送并展示通知 ===== */
self.addEventListener('push', function (event) {
  let payload = { title: '吉他教学工作台', body: '你有新的课程提醒', tag: 'guitar-remind' };
  try {
    if (event.data) {
      const d = event.data.json();
      payload = Object.assign(payload, d);
    }
  } catch (e) { /* 用默认文案 */ }

  const opts = {
    body: payload.body || '',
    tag: payload.tag || 'guitar-remind',
    // 防重复：同 tag 新通知替换旧通知；renotify:false 避免已存在时再次响铃
    renotify: false,
    data: { url: payload.url || './' },
    badge: './icons/icon-192.png',
    icon: './icons/icon-192.png',
    vibrate: [120, 80, 120]
  };
  if (payload.actions) opts.actions = payload.actions;

  event.waitUntil(self.registration.showNotification(payload.title || '课程提醒', opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cls) {
      for (const c of cls) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
