#!/usr/bin/env python3
"""画像をドット絵の敵スプライトに変換する (public/english-quest/pixelize.html と同じ処理)。
使い方: python3 scripts/pixelize.py 入力.png 出力.png [サイズ=48] [色数=16] [背景しきい値=40]
出力を public/english-quest/monsters/ に置き、monsters.json に追記するとゲームに出ます。"""
import sys
from collections import deque
from PIL import Image

def main(src, dst, n=48, k=16, tol=40):
    im = Image.open(src).convert('RGBA')
    sc = min(n / im.width, n / im.height); tw, th = max(1, round(im.width * sc)), max(1, round(im.height * sc))
    sq = Image.new('RGBA', (n, n), (0, 0, 0, 0)); sq.paste(im.resize((tw, th), Image.LANCZOS), ((n - tw) // 2, n - th))
    px = sq.load()
    corners = [px[x, y][:3] for x, y in ((0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1)) if px[x, y][3] > 200]
    if len(corners) >= 2 and tol > 0:
        bg = [sum(c[i] for c in corners) / len(corners) for i in range(3)]
        near = lambda x, y: px[x, y][3] > 0 and sum((px[x, y][i] - bg[i]) ** 2 for i in range(3)) ** .5 < tol
        q = deque([(x, 0) for x in range(n)] + [(x, n - 1) for x in range(n)] + [(0, y) for y in range(n)] + [(n - 1, y) for y in range(n)]); seen = set()
        while q:
            x, y = q.popleft()
            if not (0 <= x < n and 0 <= y < n) or (x, y) in seen or not near(x, y): continue
            seen.add((x, y)); px[x, y] = (0, 0, 0, 0); q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    alpha = sq.getchannel('A').point(lambda a: 255 if a > 100 else 0)
    rgb = sq.convert('RGB').quantize(colors=k, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB'); rgb.putalpha(alpha)
    out = Image.new('RGBA', (n + 2, n + 2), (0, 0, 0, 0)); out.paste(rgb, (1, 1)); o, r = out.load(), out.copy().load()
    for y in range(n + 2):
        for x in range(n + 2):
            if r[x, y][3]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < n + 2 and 0 <= yy < n + 2 and r[xx, yy][3] == 255:
                    c = r[xx, yy]; o[x, y] = (int(c[0] * .3), int(c[1] * .3), int(c[2] * .3), 255); break
    out.save(dst)

if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    main(a[0], a[1], *(int(v) for v in a[2:5]))
