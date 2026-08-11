#!/usr/bin/env python3
# 生成吉他教学工作台 PWA 图标（PNG，多尺寸）。
# 设计：靛紫 #6C5CE7 圆角底 + 白色吉他描边标记（与 icon.svg / 侧栏品牌一致）。
# 依赖：Pillow（已自带：python3 -c "import PIL"）。运行：python3 gen_icons.py
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons")
os.makedirs(OUT, exist_ok=True)

VIOLET = (108, 92, 231, 255)
WHITE = (255, 255, 255, 255)

# 24x24 视图坐标下的吉他标记（描边），与 SVG 完全一致
CIRCLES = [(7, 17, 3.0), (17, 9, 2.5)]
LINES = [((10, 17), (17, 9)), ((19, 7), (21, 5))]

SIZES = [16, 32, 48, 72, 96, 128, 144, 150, 152, 180, 192, 256, 310, 384, 512]


def draw_icon(size, maskable=False):
    SS = 4                       # 超采样倍数，保证缩小时清晰
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        # 全出血方块 + 标记缩到安全区(60%)，保证被圆形遮罩裁切后仍完整
        d.rectangle([0, 0, S, S], fill=VIOLET)
        G = S * 0.60
        radius = 0
    else:
        d.rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=VIOLET)
        G = S * 0.64
        radius = int(S * 0.22)

    off = (S - G) / 2
    f = G / 24.0
    cx = lambda x: off + x * f
    cy = lambda y: off + y * f
    lw = max(1, int(2.4 * f))

    for (x, y, r) in CIRCLES:
        d.ellipse([cx(x - r), cy(y - r), cx(x + r), cy(y + r)], outline=WHITE, width=lw)
    for (a, b) in LINES:
        d.line([cx(a[0]), cy(a[1]), cx(b[0]), cy(b[1])], fill=WHITE, width=lw)

    out = img.resize((size, size), Image.LANCZOS)
    return out


def main():
    for s in SIZES:
        draw_icon(s, False).save(os.path.join(OUT, f"icon-{s}.png"))
    draw_icon(512, True).save(os.path.join(OUT, "icon-maskable-512.png"))
    # 兼容 iOS 旧版 apple-touch-icon 常用 180
    print("生成完成：", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
