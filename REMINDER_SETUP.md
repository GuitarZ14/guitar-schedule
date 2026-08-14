# 课程提醒功能 · 部署与配置说明

> 功能：每天 **北京 09:00** 自动推送「当日」课程安排；**北京 21:00** 自动推送「次日」课程安排。
> 架构：纯前端（订阅 + 设置 UI + 开页兜底调度） + Service Worker（接收通知） + GitHub Actions 定时调度（cron 发送，关页后保底）。

## 📌 当前提交状态（2026-08-14）

- ✅ **已上线**：前端侧栏开关、Push 订阅、SW 接收通知、**开页兜底调度**（`setInterval` 命中 09:00/21:00 弹站内提醒 + 浏览器通知）、`pushSubs` 并入云端 bin。
- ⏳ **待补推**：`.github/workflows/daily-reminder.yml` + 推送脚本因当前 PAT 缺 `workflow` 权限被 GitHub 拒绝，**暂未提交**。文件已写好，留本地。
  待你在 GitHub 重新生成带 `workflow` scope 的 PAT 并更新本地 git 凭据后，再 `git add .github && git commit && git push`，即可启用「关页后也推送」。

## 🔑 关于 workflow 权限（必读）

推送 Actions 文件要求 Personal Access Token 勾选 **`workflow`** scope。若 push 报
`refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope`，
请重新生成 PAT 并勾选 `workflow`，更新本地凭据后重试。

---

## ⚠️ 必须先知道的约束

1. **Web Push 需要 VAPID 密钥对**（应用服务器密钥）。前端只放**公钥**（公开安全），**私钥**必须保密，仅存于 GitHub Secrets。
2. **推送依赖云端订阅列表**：用户在页面开启提醒后，订阅信息（endpoint + 密钥）会写入 JSONBin 的备份 bin 的 `pushSubs` 字段。推送脚本读取该 bin 的 `courses` + `pushSubs` 发送。
3. **接收端限制（浏览器机制，无法绕过）**：
   - 手机：把工作台「添加到主屏幕」装成 PWA 后，即使不打开也能收到（系统级推送）。
   - 桌面：Chrome/Edge 浏览器需保持运行（后台标签页即可）；完全关闭则收不到。
   - Safari/iOS：需 iOS 16.4+ 且以「已安装 PWA」形态运行才支持 Web Push。
4. **首次使用前必须**：① 已配置并启用云端同步（JSONBin）② 在侧栏「课程提醒」开关开启并允许通知权限 ③ 配置下方 GitHub Secrets。

---

## 一、生成 VAPID 密钥对

### 方式 A：用 web-push 命令行（推荐）
```bash
npm install -g web-push
web-push generate-vapid-keys
```
输出示例：
```
=======================================
Public Key:
BPl-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key:
hLl-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
=======================================
```

### 方式 B：在线生成
访问 https://vapidkeys.com 一键生成（注意：私钥会经过第三方，仅用于非敏感场景；本工作台数据已脱敏，可接受）。

---

## 二、配置 GitHub Secrets

进入仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加以下 5 个：

| Secret 名称 | 值 | 说明 |
|-------------|-----|------|
| `JSONBIN_KEY` | 你的 JSONBin X-Master-Key | 与页面「云端同步」配置同一个 key |
| `JSONBIN_BIN_ID` | 你的 JSONBin bin id | 与页面云端 bin 一致（在 JSONBin 后台查看） |
| `VAPID_PRIVATE_KEY` | 上面生成的**私钥**（PEM，含 `-----BEGIN PRIVATE KEY-----`） | 仅服务端用，绝不前端暴露 |
| `VAPID_PUBLIC_KEY_B64` | 上面生成的**公钥**，做 URL-safe base64（即原样，web-push 输出的 Public Key 已是 base64url） | 推送脚本构造 `Authorization` 头用 |
| `VAPID_SUBJECT` | `mailto:你的邮箱@example.com` 或 `https://你的站点` | VAPID 规范要求的 contact 字段 |

> **注意前端常量**：打开 `index.html` 搜索 `VAPID_PUBLIC_KEY`，把占位的
> `BPl-EhY8m7u6qZ0xK3nVqR4tWpY2sLk9MnBcDfGhJkLmNoPqRsTuVwXyZ0123456789`
> 替换为你的**真实公钥**（`web-push generate-vapid-keys` 输出的 Public Key）。

---

## 三、定时调度（已内置）

`.github/workflows/daily-reminder.yml` 已配置：
```yaml
- cron: '0 1 * * *'    # UTC 01:00 = 北京 09:00 → 当日课
- cron: '0 13 * * *'   # UTC 13:00 = 北京 21:00 → 次日课
```
GitHub Actions 的 cron 使用 **UTC**，已按北京时间换算。可在 **Actions** 标签页手动 `Run workflow` 测试。

---

## 四、测试流程

1. 部署最新 `index.html` + `service-worker.js` 到 GitHub Pages（已含提醒 UI 与 Push 接收）。
2. 手机/桌面打开页面 → 侧栏开「课程提醒」→ 允许通知 → 看到「已开启」提示。
3. 到 GitHub 仓库 **Actions → 课程提醒定时推送 → Run workflow** 手动触发一次。
4. 等待约 10~30 秒，设备应收到通知（内容为该日课程列表）。

---

## 五、去重与防遗漏逻辑

- **同设备去重**：`savePushSub` 按 `deviceId` 过滤，同一浏览器只保留最新订阅。
- **同日去重**：推送 payload 带 `tag: guitar-remind-YYYY-MM-DD` + `Topic`（安卓），同一天重复运行不会重复响铃。
- **课程为空跳过**：目标日期无课程时不发送，避免无效打扰。
- **时区明确**：服务端脚本用 `Intl` 以 `Asia/Shanghai` 计算目标日期，前端侧栏文案也标注北京时间，两端一致。

---

## 六、故障排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| 开启提醒报「请先配置云端同步」 | 未启用 JSONBin | 先到侧栏配置云端同步 key/bin |
| 收不到通知（桌面） | 浏览器完全关闭 | 保持浏览器运行（后台标签即可） |
| 收不到通知（iOS） | 未以 PWA 安装 / iOS < 16.4 | 添加到主屏幕并升级系统 |
| Actions 运行失败 | Secrets 缺漏 / VAPID 私钥格式错 | 检查 5 个 Secret 是否齐全，私钥是否含 PEM 头 |
| 前端 VAPID 报错 | `VAPID_PUBLIC_KEY` 未替换占位符 | 替换为真实公钥 |
