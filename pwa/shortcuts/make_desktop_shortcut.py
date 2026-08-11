#!/usr/bin/env python3
# 在「电脑桌面」一键创建本工作台的快捷方式 / 伪应用。
# 支持：Windows(.url) / macOS(.app) / Linux(.desktop)
# 用法：python3 make_desktop_shortcut.py
import os
import sys
import platform

APP_NAME = "吉他教学工作台"
URL = "https://guitarz14.github.io/guitar-schedule/"
DESKTOP = os.path.join(os.path.expanduser("~"), "Desktop")


def make_windows():
    path = os.path.join(DESKTOP, APP_NAME + ".url")
    with open(path, "w", encoding="utf-8") as f:
        f.write("[InternetShortcut]\n")
        f.write("URL=" + URL + "\n")
        f.write("IconFile=" + URL + "icons/icon-192.png\n")
        f.write("IconIndex=0\n")
    return path


def make_macos():
    app = os.path.join(DESKTOP, APP_NAME + ".app")
    macos = os.path.join(app, "Contents", "MacOS")
    os.makedirs(macos, exist_ok=True)
    # 启动脚本：用默认浏览器打开站点
    launcher = os.path.join(macos, "app")
    with open(launcher, "w", encoding="utf-8") as f:
        f.write("#!/bin/bash\n")
        f.write('open "%s"\n' % URL)
    os.chmod(launcher, 0o755)
    # 最小化 Info.plist（让系统把它当应用）
    plist = os.path.join(app, "Contents", "Info.plist")
    with open(plist, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<plist version="1.0"><dict>\n')
        f.write("  <key>CFBundleName</key><string>%s</string>\n" % APP_NAME)
        f.write("  <key>CFBundleDisplayName</key><string>%s</string>\n" % APP_NAME)
        f.write("  <key>CFBundleIdentifier</key><string>com.guitar.workbench</string>\n")
        f.write("  <key>CFBundleVersion</key><string>1.0</string>\n")
        f.write("  <key>CFBundlePackageType</key><string>APPL</string>\n")
        f.write("  <key>CFBundleExecutable</key><string>app</string>\n")
        f.write("</dict></plist>\n")
    return app


def make_linux():
    path = os.path.join(DESKTOP, APP_NAME + ".desktop")
    with open(path, "w", encoding="utf-8") as f:
        f.write("[Desktop Entry]\n")
        f.write("Version=1.0\n")
        f.write("Type=Application\n")
        f.write("Name=%s\n" % APP_NAME)
        f.write("Comment=吉他课程表 / 学员管理 / 课时统计\n")
        f.write('Exec=xdg-open "%s"\n' % URL)
        f.write("Terminal=false\n")
        f.write("Categories=Education;\n")
    os.chmod(path, 0o755)
    return path


def main():
    os.makedirs(DESKTOP, exist_ok=True)
    sys_name = platform.system()
    if sys_name == "Windows":
        print("已创建：", make_windows())
    elif sys_name == "Darwin":
        print("已创建：", make_macos())
        print("提示：macOS Sonoma 及以上可直接用 Safari「文件 → 添加到 Dock」做成真正的 Web App。")
    elif sys_name == "Linux":
        print("已创建：", make_linux())
    else:
        print("未知系统：", sys_name)
    print("\n若想获得「可安装应用」（独立窗口、离线、任务栏图标），"
          "推荐用浏览器自带安装：Chrome/Edge 地址栏右侧「安装 / 安装应用」。")
    print("部署链接：", URL)


if __name__ == "__main__":
    main()
