# 吉他教学工作台 · UI 修改提示词速查表

> **用途**：任何 UI / 视觉 / 交互修改需求，先按本表写清提示词，再让模型落地，可大幅减少反复修改。
> **维护规则**：每次完善新功能前先读此文件；发现新的易踩坑场景，追加到对应分类。
> **最后更新**：2026-08-14

---

## 通用三要素（任何 UI 需求都必须写清）

1. **容器上下文** —— 这个元素爹是谁、爹有多宽 / 什么定位（如「在 `<td class="num">` 窄单元格内」「绝对定位浮层」「移动端底部抽屉」）
2. **硬约束清单** —— 哪些行为绝对不允许（如「绝不竖堆」「不引外部库」「不折行」）
3. **输出格式** —— 给 CSS 片段 / JS 片段 / 整函数，改哪几个函数，是否动 HTML 结构

---

## 全局铁律（本项目不可违背）

- 纯内联 CSS/JS，**禁用任何外部 CDN / 字体 / 图表库**
- 图标用**内联 SVG path**，禁用 emoji 当图标
- 主题只改 `:root` 令牌，不写死颜色
- 移动端断点 `<860px`（桌面侧栏 + 顶栏 → 移动端抽屉 + 底部 Tab）
- 数据存 localStorage（key 前缀 `wb_`）；云端走 JSONBin，现已改为显式备份/恢复（非后台自动同步）
- 发布双轨：GitHub Pages（正式 `guitarz14.github.io/guitar-schedule`）为主，CloudStudio（`.app.workbuddy.link`）为备份预览

---

## ① 表格单元格内浮层（tooltip / popover）✅ 已踩坑

**上下文**：浮层在 `<td class="num">` 窄单元格内，且为 `position:absolute`。

**约束**：
① 每个日期/项须为独立行内元素（独立 `<span>`，不拼成单字符串）
② 浮层宽度由内容决定、不被 td 压窄
③ 文本不折行
④ 仅改 CSS + `renderStats` 中生成逻辑，不动其他功能/PWA/学员分色

**正解（核心：`width:max-content` 突破 td 宽度约束）**：
```css
.stat-tip .stat-tip-box{
  position:absolute; bottom:calc(100% + 6px); left:50%;
  transform:translateX(-50%);
  width:max-content;        /* ← 关键：宽度由内容决定，突破 td 约束 */
  max-width:420px;
  background:var(--text); color:var(--glass);
  padding:10px 14px; border-radius:10px; z-index:100; pointer-events:none;
}
.stat-tip:hover .stat-tip-box{
  display:inline-flex !important;   /* shrink-to-fit + 覆盖 display:none */
  flex-wrap:wrap; gap:5px 10px; justify-content:center; align-items:center;
}
.stat-tip .stat-tip-box span{ white-space:nowrap; display:inline-block; }
```

**一句话根因**：绝对定位浮层嵌在窄 `td` 内 → 浏览器以 td 宽度为初始包含块参考 → flex 容器被压极窄 → 子项全 wrap 竖堆。只有 `width:max-content` 能根治。

---

## ② 移动端响应式（侧栏 → 底栏）

**上下文**：桌面 `.sidebar`（左固定）+ `.topbar`（标题行 + 控制条）；`<860px` 时侧栏变抽屉、底部 `.bottomnav` 出现、`.topbar-inner` 纵向堆叠。

**约束**：
① 窄屏单列堆叠
② 触控区 ≥42px（儿童向 ≥50px）
③ 输入框字号 ≥16px（防 iOS 自动放大页面）
④ 表格窄屏可横向滚动或卡片化
⑤ 适配 iPhone 底部安全区 `padding-bottom: env(safe-area-inset-bottom)`

**正解**：在现有 `@media(max-width:860px){...}` 块内追加；侧栏宽 `min(280px,84vw)` + `overflow-y:auto`；表格包 `.panel{overflow-x:auto}`；底部导航留出安全区 padding。

**提示词模板**：
```
在 <860px 断点下，把 [X] 改为单列 / 抽屉 / 底部 Tab，
触控目标 ≥42px，输入框字号 16px，[表格] 允许横向滚动。
仅改 CSS 媒体查询，不动结构和 JS 逻辑。
```

---

## ③ 弹窗 / 抽屉（`.modal` + `.sheet`）

**上下文**：`.modal` 全屏遮罩 + `.sheet` 居中卡片（移动端底部吸附弹出）；现有 5 个 modal：`courseModal / studentModal / repeatModal / confirmModal / cloudConfigModal`。

**约束**：
① 遮罩纯半透明、**无 blur**（全局已 `*{backdrop-filter:none !important}`）
② 表单 `<label><span class="lab">…</span><input/></label>` 竖排；`.twocol` 两列布局
③ 移动端 `.sheet` 底部吸附、顶部圆角（`@media min-width:640px` 时居中）
④ 按钮三态：`ghost`（次）/ `primary`（主）/ `danger`（危险）

**正解**：新增表单字段 → 复制现有 `label` 结构；样式复用 `.lab / .twocol`；勿加渐变/阴影发光/毛玻璃。

---

## ④ 内联 SVG 图表（柱状 / 环 / 饼 / 折线）

**上下文**：图表由 `svgBars()`（月度分布柱状）等函数用 `viewBox` + 手写 `<rect>/<circle>/<path>` 生成，拼进 `innerHTML`。

**约束**：
① 绝不引 Chart.js / D3 等库
② `preserveAspectRatio="xMidYMid meet"` 自适应
③ 配色用 `studentColor()` 或语义令牌（`--green/--blue/--warn`）
④ 少数据时 viewBox 宽度不小于 300，防过度放大

**正解**：仿 `svgBars()` —— `data.map()` 生成 SVG 字符串 → `viewBox="0 0 W h"` → 拼入 `innerHTML`。

---

## ⑤ 主题换肤（令牌优先）

**上下文**：所有颜色来自 `:root` 令牌（`--primary / --glass / --glass-border / --line / --text / --primary-soft` 等）；页面背景在 `body`。

**约束**：
① 只改 `:root` 令牌 + 少数显式 `background/border`
② 不动 HTML / JS / 结构
③ 保留学员 12 分色 `STUDENT_PALETTE`（功能性，非 UI 主题）
④ 同步更新 `<meta name="theme-color" content="...">`

**正解（燕麦米色参考值）**：
```
--glass:#FDFBF6;  --glass-border:#E7DFD0;  --line:#EAE2D2;
--primary:#BD855C;  --primary-d:#8C5733;  --primary-soft:#F4ECDF;
body background:#F3EDE1;  theme-color:#BD855C;
```
**演进脉络**：液态玻璃 → 简约线性(靛蓝) → 暖白 → 燕麦米色（全部令牌换肤，零结构改动）。

---

## ⑥ 颜色 / 语义约束（国内习惯）

**约束**：
① 支出红 / 收入绿（与欧美相反）
② 货币统一 `¥`
③ 日期 `YYYY-MM-DD` 或 `M月D日`
④ 缺课状态用柔和瓦蓝 `--blue:#6E8AA3`（非亮蓝 `#3B9DF7`）

**提示词**：`把[工资/收入]数字标绿、[支出]标红，前缀加 ¥，不要出现 emoji 图标。`

---

## ⑦ 新增数据列 / 字段（renderStats 类表格）

**上下文**：明细报表由 `renderStats()` + `monthMap()` 生成；CSV 导出在 `exportCsv()`（表头+行在 ~1368 行 `rows.push([...])`）。

**约束**：
① 改 `monthMap()` 聚合逻辑
② 同步改 `renderStats()` 表格渲染
③ 同步改 `exportCsv()` 表头与数据行
④ 若 KPI 卡片引用需同步
⑤ 不破坏 `parseYMD / dur / fmtMin` 工具函数

**提示词**：
```
在明细报表加「[新列]」：从 courses 按 [筛选条件] 聚合，
在 monthMap 计算、renderStats 表格渲染、exportCsv 表头+行三处同步添加，
不影响其他列与学员分色。
```

---

## ⑧ 图标（纯 SVG，禁 emoji）

**约束**：所有图标用
`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="..."/></svg>`
内联 path；绝不写 emoji 当图标。

**正解**：复制现有按钮里的 SVG 结构改 `path d` 即可。

---

## ⑨ 交互按钮可见性（浅色主题禁隐形按钮）✅ 已踩坑

**上下文**：燕麦米色浅底（`--glass:#FDFBF6` / 页面 `#F3EDE1`）+ 交互控件（编辑/操作类小按钮）。

**坑（2026-08-15）**：编辑按钮做成 `26×26px` 圆形 + `color:var(--muted)` 灰色 + 无边框无背景的纯 SVG 图标 → 在浅底上肉眼几乎不可见；代码已部署、功能正常，但用户反复说"看不到"，排查多轮才定位为**视觉对比度**而非缓存/部署问题。

**约束**：
① 功能性按钮**禁止**「无边框 + 低对比度灰 + 纯图标 + 小尺寸（<32px）」组合
② 交互控件至少满足其一：带**文字标签** / 带**边框+浅背景** / 高对比主色
③ 浅色主题下按钮文字色用 `var(--primary)`（主色），不用 `var(--muted)`

**正解（可见药丸按钮）**：
```css
.act-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
  border:1px solid var(--line);border-radius:var(--r-sm);
  background:rgba(255,255,255,0.6);color:var(--primary);
  font-size:12px;font-weight:500;cursor:pointer;}
.act-btn:hover{background:var(--primary-soft);border-color:var(--primary);}
```
```html
<button class="act-btn"><svg …></svg>编辑</button>  <!-- 图标 + 文字，必可见 -->
```

---

## 提交 / 部署检查清单（每次改完必做）

1. 改 CSS/JS → **升级 `service-worker.js` 的 `CACHE` 版本号**（如 `guitar-wb-v3` → `v4`）+ **同步 `index.html` 的 `APP_VERSION` 哨兵**
2. `node --check` 提取 script 验证语法（本项目 2 个 script 块）
3. `git push origin main` → GitHub Pages；`workbuddy_cloudstudio_deploy` → 备份预览
4. 交付时提醒用户**强制刷新（`Cmd+Shift+R` / `Ctrl+Shift+R`）** 清旧 SW 缓存
5. **部署后三层验证（缺一不可）**：
   - ① 部署成功：`curl` 线上源码确认含新功能关键字 + `APP_VERSION` 已升
   - ② 真实渲染：真实浏览器打开 / 截图确认页面正常加载
   - ③ 视觉可见：确认新增 UI 元素**看得见**（对比度/尺寸达标），而非仅"HTML 存在"
   - 注意：同沙箱反复重部署破不了 SW `cacheFirst` 死循环 → 用 `unpublish` + 全新 deploy 换 URL

---

## 历史踩坑记录

| 日期 | 场景 | 坑 | 正解 |
|------|------|----|------|
| 2026-08-15 | 编辑按钮看不到 | 纯灰图标按钮在浅底不可见，误判为 SW 缓存死循环，多轮排查 | 改带文字+边框+主色的可见药丸按钮；验证分三层（部署/渲染/可见） |
| 2026-08-15 | CloudStudio 强制刷新无新功能 | 旧沙箱早期 SW 陷入 `cacheFirst` 死循环，同沙箱重部署无效 | `unpublish` 旧沙箱 + 全新 `deploy` 换 URL |
| 2026-08-14 | tooltip 横向排列 | `flex-wrap` + 独立 span 仍竖堆（td 压窄浮层） | `width:max-content` 突破 td 约束 |
| 2026-08-14 | 强制刷新旧布局残留 | SW `cacheFirst` 返回旧 index.html | CACHE 升级 + index.html `networkFirst` + APP_VERSION 哨兵 + updatefound 提示 |
| 2026-08-12 | 主题换肤 | 旧 `rgba()` 主色残留（蓝紫） | 全量 grep 替换 + `theme-color` meta 同步 |
