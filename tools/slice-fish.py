# -*- coding: utf-8 -*-
"""
tools/slice-fish.py · 把 3x3 鱼图鉴截图切成 9 张透明贴图 + 一张图集

做三件事：
  1. 去背：图鉴背景是「浅绿格子 + 白色花纹」，用双参考色 + 边界泛洪判定背景。
     鱼的深色描边天然闭合，所以白色鳍/尾巴不会被误杀。
  2. 去杂质：只保留与鱼主体相交的连通块，剔除格子花纹、编号数字（低饱和灰块，固定在左下角）。
  3. 归一：等比缩放，长边占格子的 94%，输出 192px 方图，再拼成 3x3 图集。

用法：
  python tools/slice-fish.py <源图> [--cell 192] [--src-cell 390,503]

换了新素材图，只要改 ROWS / COLS / EXCLUDE 三处常量即可。
"""

import sys
import os
import json
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

# ---------------- 源图切片范围（原图 1170x2532，图鉴区 3 行） ----------------
ROWS = [(503, 1010), (1038, 1530), (1556, 2052)]
COLS = [(0, 390), (390, 780), (780, 1170)]

# 背景参考色：格子浅绿 + 白色花纹/分隔线
GREEN = np.array([220, 237, 218])
WHITE = np.array([248, 247, 240])

# 需要硬性抹掉的区域（源图截图自带的 UI 元素，不属于鱼）
# 第 9 格右下角有个截图悬浮圆钮，用圆形抹除，避免误伤鱼尾的直角缺口
# 圆心/半径为实测值，单位是「格子内像素坐标」
EXCLUDE = [
    (8, 'circle', 322, 427, 44),
]

CELL = 192
PAD = 0.94


def flood_from_edge(bg_like, iters=1600):
    """从图像边界向内泛洪，得到「与外界连通的背景」"""
    cur = np.zeros_like(bg_like)
    cur[0, :] = bg_like[0, :]
    cur[-1, :] = bg_like[-1, :]
    cur[:, 0] = bg_like[:, 0]
    cur[:, -1] = bg_like[:, -1]
    for _ in range(iters):
        nxt = cur.copy()
        nxt[1:, :] |= cur[:-1, :]
        nxt[:-1, :] |= cur[1:, :]
        nxt[:, 1:] |= cur[:, :-1]
        nxt[:, :-1] |= cur[:, 1:]
        nxt &= bg_like
        if nxt.sum() == cur.sum():
            break
        cur = nxt
    return cur


def components(fg):
    """四连通标记，按面积从大到小返回"""
    h, w = fg.shape
    seen = np.zeros_like(fg)
    out = []
    for y in range(h):
        for x in range(w):
            if not fg[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            n = 0
            mask = np.zeros_like(fg)
            x0 = x1 = x
            y0 = y1 = y
            while q:
                cy, cx = q.popleft()
                n += 1
                mask[cy, cx] = True
                if cx < x0: x0 = cx
                if cx > x1: x1 = cx
                if cy < y0: y0 = cy
                if cy > y1: y1 = cy
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            out.append({'n': n, 'box': (x0, y0, x1, y1), 'mask': mask})
    out.sort(key=lambda d: -d['n'])
    return out


def cut_cell(cell, idx):
    for spec in EXCLUDE:
        if spec[0] != idx:
            continue
        _, _kind, cx, cy, r = spec
        h, w, _ = cell.shape
        yy, xx = np.ogrid[:h, :w]
        hit = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
        cell[hit] = GREEN  # 涂成背景色，后续判定会当成背景

    dg = np.abs(cell - GREEN).max(axis=2)
    dw = np.abs(cell - WHITE).max(axis=2)
    fg = ~flood_from_edge((dg < 26) | (dw < 16))

    cs = components(fg)
    if not cs:
        raise RuntimeError('cell %d 没找到前景' % (idx + 1))
    main = cs[0]
    mx0, my0, mx1, my1 = main['box']
    keep = main['mask'].copy()

    for c in cs[1:]:
        bx0, by0, bx1, by1 = c['box']
        cx = (bx0 + bx1) / 2.0
        cy = (by0 + by1) / 2.0
        pix = cell[c['mask']]
        sat = float(np.mean(pix.max(axis=1) - pix.min(axis=1)))
        # 编号数字：低饱和灰块，固定在格子左下角
        if sat < 12 and cx < 130 and cy > 365 and c['n'] > 150:
            continue
        # 保留与鱼主体包围盒相交的分离块（断开的鳍尖、水滴装饰）
        if min(bx1, mx1) - max(bx0, mx0) > 0 and min(by1, my1) - max(by0, my0) > 0:
            keep |= c['mask']

    alpha = np.where(keep, 255, 0).astype(np.uint8)
    img = Image.fromarray(np.dstack([cell.astype(np.uint8), alpha]), 'RGBA')
    img.putalpha(img.split()[3].filter(ImageFilter.GaussianBlur(0.6)))
    img = img.crop(img.getbbox())

    w, h = img.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    target = int(CELL * PAD)
    canvas = canvas.resize((target, target), Image.LANCZOS)

    tile = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    tile.paste(canvas, ((CELL - target) // 2, (CELL - target) // 2), canvas)
    return tile, {'w': w, 'h': h, 'aspect': round(w / h, 3)}


def main():
    src = sys.argv[1]
    assets_dir = os.path.join(os.path.dirname(__file__), '..', 'assets')
    os.makedirs(assets_dir, exist_ok=True)
    # 单张图只给人看，放 tools 下（tools 整个目录不进小游戏包，省包体）
    preview_dir = os.path.join(os.path.dirname(__file__), '_fish')
    os.makedirs(preview_dir, exist_ok=True)

    a = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
    tiles = []
    meta = {}
    for i in range(9):
        y0, y1 = ROWS[i // 3]
        x0, x1 = COLS[i % 3]
        tile, info = cut_cell(a[y0:y1, x0:x1].copy(), i)
        tile.save(os.path.join(preview_dir, 'fish%d.png' % (i + 1)))
        tiles.append(tile)
        meta[i + 1] = info
        print('fish%d  %dx%d  aspect %.2f' % (i + 1, info['w'], info['h'], info['aspect']))

    atlas = Image.new('RGBA', (CELL * 3, CELL * 3), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        atlas.paste(t, ((i % 3) * CELL, (i // 3) * CELL))
    atlas_path = os.path.join(assets_dir, 'fish-atlas.png')
    atlas.save(atlas_path, optimize=True)
    print('atlas %s  %dx%d  %dKB' % (atlas_path, CELL * 3, CELL * 3,
                                     os.path.getsize(atlas_path) // 1024))

    # 视觉体量归一化：把每条鱼的不透明像素数拉齐到平均值。
    # 素材里圆胖的鱼（金团、粉鲤）天然占画面大，细长的斗鱼看着小，
    # 不修正的话同缸鱼体型差得离谱。sizeScale 在此基础上再拉档次。
    areas = []
    for t in tiles:
        a = np.asarray(t)[:, :, 3]
        areas.append(max(1, int((a > 24).sum())))
    ref = sum(areas) / float(len(areas))
    volume = [round((ref / a) ** 0.5, 3) for a in areas]

    meta['volume'] = volume
    json.dump(meta, open(os.path.join(assets_dir, 'fish-meta.json'), 'w'), indent=1)

    vol_path = os.path.join(assets_dir, 'fish-volume.js')
    with open(vol_path, 'w', encoding='utf-8') as fh:
        fh.write('/* 自动生成，请勿手改：python tools/slice-fish.py\n'
                 ' * 视觉体量系数，把九宫格里每条鱼的画面占比拉齐到同一水平 */\n')
        fh.write('module.exports = ' + json.dumps(volume) + ';\n')
    print('volume', volume)


if __name__ == '__main__':
    main()
