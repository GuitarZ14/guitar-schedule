# 吉他教学工作台 · PWA 安装与打包方案

把现有的单页工作台变成「可安装的渐进式 Web 应用（PWA）」：既能离线打开，又能像原生 App 一样钉在电脑桌面 / 手机主屏幕。

---

## 一、本目录已生成的文件

```
Class Schedule Card/
├── index.html              # 主应用（已注入 manifest / theme-color / apple-touch-icon / SW 注册）
├── manifest.webmanifest    # PWA 清单（名称、图标、显示模式、起始页、快捷方式）
├── service-worker.js       # Service Worker（离线缓存 + Google 字体 SWR；JSONBin 走网络）
├── icon.svg                # 图标源文件（靛紫底 + 白色吉他标记）
├── gen_icons.py            # 用 Pillow 重新生成所有尺寸 PNG 的脚本
├── icons/                  # 多尺寸 PNG（16~512，含 maskable / apple-touch 180）
│   ├── icon-16.png ... icon-512.png
│   └── icon-maskable-512.png
└── pwa/
    ├── README.md           # 本文
    └── shortcuts/
        ├── GuitarWorkbench.url     # Windows 桌面快捷方式（双击即用浏览器打开）
        └── make_desktop_shortcut.py # 跨平台一键在桌面生成快捷方式 / 伪应用
```

> PWA 必须「多文件」，`manifest` 与 `service-worker.js` 无法内联进单个 HTML。
> 这是有意为之：核心应用仍是单文件 HTML，PWA 外壳是额外静态资源。

---

## 二、先验证（部署后做一次）

打开部署链接，按 F12：

1. **Application → Manifest**：能正确解析名称 / 图标，无报错。
2. **Application → Service Workers**：状态 `activated and is running`，Scope 为网站根。
3. **Lighthouse → Progressive Web App**：应全部通过（可安装 + 离线可交互）。
4. 地址栏右侧出现「安装」图标（Chrome/Edge）。

若 SW 未注册成功：先确认站点为 **HTTPS**（正式部署地址 **GitHub Pages** `https://guitarz14.github.io/guitar-schedule/` 已是 https ✓）；
再看 Console 是否报 `service-worker.js` 404 或 MIME 错误——这通常是静态服务器未正确返回 `.js`，
此时可换用任意静态托管（CloudStudio 分享链接作为备用部署 / Vercel / Netlify）重新部署整套文件。

> **部署约定**：GitHub Pages（`guitarz14.github.io/guitar-schedule`）为正式地址，桌面快捷方式与 PWA 安装均指向它；CloudStudio 链接仅作备用。两者数据不互通，更新功能只需 `git push`，链接不变、打开即最新。

---

## 三、电脑桌面（Windows / macOS / Linux）

### 方案 A：浏览器「安装为应用」（最推荐，跨平台）
- **Chrome / Edge**：地址栏右侧点「安装 / 安装应用（⊕）」→ 确认。会生成一个独立窗口应用，
  可钉到任务栏 / 程序坞，并支持离线。
- **macOS Sonoma 及以上**：用 **Safari** 打开 → 菜单「文件 → 添加到 Dock」，即为真正的 Web App。

### 方案 B：一键桌面快捷方式（无需浏览器安装）
运行脚本，会在你的「桌面」生成对应文件：

```bash
cd "Class Schedule Card"
python3 pwa/shortcuts/make_desktop_shortcut.py
```

- **Windows** → 生成 `吉他教学工作台.url`（双击用默认浏览器打开）。
- **macOS** → 生成 `吉他教学工作台.app`（双击用默认浏览器打开 URL，可拖进程序坞）。
- **Linux** → 生成 `吉他教学工作台.desktop`（xdg 桌面项）。

### 方案 C：Windows 现成文件
直接把 `pwa/shortcuts/GuitarWorkbench.url` 复制到桌面即可（右键「创建快捷方式」亦可）。

---

## 四、手机（iOS / Android）

### iOS（Safari）
1. 用 Safari 打开部署链接。
2. 点底部「分享」按钮（▢↑）。
3. 下滑选 **「添加到主屏幕」**。
4. 命名后「添加」——桌面出现带图标的 App，离线也能打开（已缓存外壳）。
> 已配置 `<link rel="apple-touch-icon" href="./icons/icon-180.png">` 与
> `apple-mobile-web-app-capable`，主屏图标与全屏体验最佳。

### Android（Chrome / Edge）
1. 打开链接，浏览器会自动弹出「安装应用」横幅；或点菜单「安装应用 / Add to Home screen」。
2. 确认后生成主屏图标，以独立窗口运行，支持离线。
> 由 `manifest.webmanifest`（含 192/512 + maskable 图标）+ `service-worker.js` 自动满足可安装条件。

### 离线说明
首次联网打开后，外壳（HTML/图标）与 Google 字体即被缓存；之后断网仍可打开并查看已加载内容。
课程数据存在浏览器 localStorage（同设备），云端备份/恢复需联网（已对 `jsonbin.io` 走网络、不缓存）。

---

## 五、打包成「可上架」的安装包（可选）

若需要提交应用商店或分发 `.apk` / `.msix`：

- **Android（APK / TWA）**：用 [PWABuilder](https://www.pwabuilder.com/) 输入部署链接，
  一键生成 Android TWA 包（或已签名 APK）。本地也可用 `bubblewrap`：
  ```bash
  npx @pwabuilder/pwabuilder -i "部署链接" -p android
  ```
- **Windows（MSIX）**：同样用 PWABuilder 选 Windows 平台生成 MSIX，可侧载或上架 Microsoft Store。
- **iOS（App Store）**：苹果不支持将 PWA 直接上架。标准做法是「添加到主屏幕」（见上）。
  若必须进 App Store，可用 [Capacitor](https://capacitorjs.com/) 把本站点包成 iOS 工程再提交。

---

## 六、更新与缓存失效

改了 `index.html` 或 `service-worker.js` 后，只要把 `service-worker.js` 顶部的
缓存名 `CACHE = 'guitar-wb-v1'` 改成 `v2`（任意新值）并重新部署，
旧缓存会在下次激活时自动清理，用户拿到最新版本。

---

## 七、已知限制

- `service-worker.js` / `manifest.webmanifest` 必须由**同源 HTTPS** 提供；`file://` 双击打开 HTML 不会启用 PWA（属正常）。
- 个别精简版静态托管可能不返回正确的 `.webmanifest` / `.js` MIME，导致安装失败；换标准静态托管即可。
- iOS 主屏图标在旧版本仅认 PNG（`icon-180.png` 已满足）；SVG 图标作为补充，用于 Android/Chrome。
