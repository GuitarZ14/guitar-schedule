# 部署到 GitHub Pages（可直接 git push）

本目录已是完整的静态站点（单文件应用 + PWA 外壳），可直接推送到 GitHub Pages。
站点全部使用**相对路径**（`start_url: "./"`、`scope: "./"`、`icons/...`、`service-worker.js` 均为相对引用），
因此无论挂在 `https://<user>.github.io/<repo>/`（项目页，带子路径）还是自定义域名根目录，都能正确工作。

---

## 方法一：分支直接发布（最省事，push 即更新）

1. 在 GitHub 新建一个**公开**仓库（如 `guitar-workbench`），**不要**勾选自动生成 README。
2. 在本目录执行（已为你 `git init` + 首次提交，直接接下面两条即可）：

   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git branch -M main
   git push -u origin main
   ```

3. 仓库 **Settings → Pages → Build and deployment → Source** 选 **「Deploy from a branch」**，
   Branch 选 `main`、目录选 `/ (root)`，点 Save。
4. 等约 1 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

之后每次改完代码，`git add -A && git commit -m "..." && git push` 即自动更新。

---

## 方法二：GitHub Actions 自动部署（推荐，push 即构建发布）

本目录已包含 `.github/workflows/pages.yml`，push 到 `main` 会自动构建并发布。

1. 同样先 `git remote add` + `git push -u origin main`（见上）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **「GitHub Actions」**。
3. 推送后到 **Actions** 标签页看部署进度，完成后站点即上线（同上的链接）。

> 两种方法二选一：选了 Actions，就不要用「Deploy from a branch」，否则会以 Actions 为准。

---

## 已包含的配套文件

| 文件 | 作用 |
|---|---|
| `.nojekyll` | 关闭 Jekyll 处理，避免文件被误解析/忽略（预构建静态站必加） |
| `.gitignore` | 忽略 `.DS_Store` / `__pycache__` / 本地密钥等 |
| `.github/workflows/pages.yml` | 方法二的自动部署工作流 |
| `manifest.webmanifest` / `service-worker.js` / `icons/` | PWA 外壳，已相对路径化 |

---

## 可选：自定义域名

1. 在仓库放一个 `CNAME` 文件，内容为你的域名（如 `guitar.example.com`），提交推送。
2. 在域名 DNS 加一条 `CNAME` 指向 `<你的用户名>.github.io`。
3. Settings → Pages → Custom domain 填写并保存（GitHub 会自动签发 HTTPS 证书）。
   > 上线后建议把 `manifest.webmanifest` 里的 `start_url`/`scope` 保持 `"./"` 即可，无需改绝对地址。

---

## 注意事项

- **首次启用 PWA / Service Worker 必须 HTTPS**：GitHub Pages 默认就是 HTTPS，满足；`file://` 双击打开不会启用 PWA（正常）。
- **数据隔离**：课程数据存在浏览器 `localStorage`（按设备/域名独立）。换设备或多端同步仍靠页面里的「云端备份/恢复」（JSONBin）。GitHub Pages 与 CloudStudio 是两套独立部署，数据不互通——首次在某域名打开后用 JSONBin 备份一次再恢复即可。
- **桌面快捷方式指向的链接**：`pwa/shortcuts/` 里的 `.url` 与 `make_desktop_shortcut.py` 默认写的是 CloudStudio 链接；
  若改用 GitHub Pages，请把它俩里的 URL 改成你的 `https://<user>.github.io/<repo>/` 再生成快捷方式。
- **验证**：Chrome 打开站点 → F12 → Lighthouse → 勾选「Progressive Web App」，应全部通过（可安装 + 离线可交互）。
