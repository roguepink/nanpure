#!/usr/bin/env python3
"""アイコン4種と LINE の紹介画像(ogp.jpg)を作る(明るい クリーム色 + ナンプレの盤 + ねこ)。
  ~/.local/venvs/ryokoshi/bin/python3 tools/make_art.py
字は OFL の「RocknRoll One」、絵文字は Mac の Apple Color Emoji。"""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

D = Path(__file__).resolve().parent.parent
FONT = os.path.expanduser('~/.cache/line-play-game/RocknRollOne-Regular.ttf')
EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'
CREAM1, CREAM2 = (255, 250, 241), (255, 231, 196)
NAVY, BLUE, YELLOW, GREEN, WHITE = (51, 56, 107), (39, 102, 214), (255, 214, 92), (31, 154, 90), (255, 255, 255)


def bg(w, h):
    img = Image.new('RGB', (w, h)); px = img.load()
    for y in range(h):
        for x in range(w):
            t = min(1, ((x / w - .5) ** 2 + (y / h) ** 2) ** .5 / 1.1)
            px[x, y] = tuple(int(CREAM1[i] * (1 - t) + CREAM2[i] * t) for i in range(3))
    return img


def emoji(ch, size):
    f = ImageFont.truetype(EMOJI, 160)
    im = Image.new('RGBA', (200, 200), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((100, 100), ch, font=f, embedded_color=True, anchor='mm')
    return im.crop(im.getbbox()).resize((size, size), Image.LANCZOS)


def board(n, cell, digits, sel=None, cat=None, thick=None, font_scale=.62, blue=()):
    """n×n の盤を描く。digits は 行ごとの文字列(' ' はあき)"""
    thick = thick or max(3, cell // 14); thin = max(1, cell // 40)
    size = n * cell + 2 * thick
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([0, 0, size - 1, size - 1], radius=cell // 4, fill=NAVY)
    f = ImageFont.truetype(FONT, int(cell * font_scale))
    box = 3 if n == 9 else n
    for r in range(n):
        for c in range(n):
            x0 = thick + c * cell + (thin if c % box else 0) + (thick if c % box == 0 and c else 0)
            y0 = thick + r * cell + (thin if r % box else 0) + (thick if r % box == 0 and r else 0)
            x1 = thick + (c + 1) * cell - 1; y1 = thick + (r + 1) * cell - 1
            fill = YELLOW if sel == (r, c) else WHITE
            rad = cell // 5 if n == 3 else 0
            dr.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=fill) if rad else dr.rectangle([x0, y0, x1, y1], fill=fill)
            ch = digits[r][c]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + cell * .03
            if cat == (r, c):
                e = emoji('🐱', int(cell * .78)); im.alpha_composite(e, (int(cx - e.width / 2), int(cy - e.height / 2)))
            elif ch != ' ':
                dr.text((cx, cy), ch, font=f, fill=BLUE if (r, c) in blue else NAVY, anchor='mm')
    return im


def shadow(im, off):
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    a = im.split()[3].point(lambda v: 40 if v else 0)
    sh.putalpha(a)
    out = Image.new('RGBA', (im.width, im.height + off), (0, 0, 0, 0))
    out.alpha_composite(sh, (0, off)); out.alpha_composite(im, (0, 0))
    return out


def icon(size, pad):
    img = bg(size, size).convert('RGBA')
    inner = int(size * (1 - 2 * pad))
    cell = int(inner / 3.15)
    b = shadow(board(3, cell, ['123', '4 6', '789'], sel=(1, 1), cat=(1, 1), font_scale=.6), max(2, size // 60))
    img.alpha_composite(b, ((size - b.width) // 2, (size - b.height) // 2 + size // 80))
    return img.convert('RGB')


def ogp():
    W, H = 1200, 630
    img = bg(W, H).convert('RGBA')
    # 本物の問題(このアプリが作った 点対称の面)に、ユーザーが入れた数字を 少し(青)
    puz = '060100350000420980008570000002050008530000029700010500000035800043081000057002090'
    sol = '264198357375426981918573462492357618531864729786219534129735846643981275857642193'
    mine = {(0, 0), (1, 3), (2, 0), (3, 1), (6, 8), (7, 1), (8, 7)}
    rows = [''.join(puz[r * 9 + c] if puz[r * 9 + c] != '0' else (sol[r * 9 + c] if (r, c) in mine else ' ') for c in range(9)) for r in range(9)]
    b = shadow(board(9, 56, rows, sel=(4, 4), blue=mine), 8)
    bx, by = 70, (H - b.height) // 2 + 22
    img.alpha_composite(b, (bx, by))
    cat = emoji('🐱', 120)
    img.alpha_composite(cat, (bx + b.width - 70, by - 88))
    dr = ImageDraw.Draw(img)
    f1, f2, f3, f4 = (ImageFont.truetype(FONT, s) for s in (58, 118, 34, 30))
    x = 680
    dr.text((x, 120), 'やさしい', font=f1, fill=NAVY)
    dr.text((x - 6, 190), 'ナンプレ', font=f2, fill=NAVY)
    pill = '広告なし・登録なし・無料'
    tw = dr.textlength(pill, font=f3)
    dr.rounded_rectangle([x, 352, x + tw + 48, 352 + 66], radius=33, fill=GREEN)
    dr.text((x + 24, 352 + 33), pill, font=f3, fill=WHITE, anchor='lm')
    dr.text((x, 450), 'ねこと いっしょに', font=f4, fill=(107, 111, 143))
    dr.text((x, 494), '1面ずつ たのしく とこう', font=f4, fill=(107, 111, 143))
    img.convert('RGB').save(D / 'ogp.jpg', quality=88, optimize=True)


icon(512, .08).save(D / 'icon-512.png', optimize=True)
icon(512, .08).resize((192, 192), Image.LANCZOS).save(D / 'icon-192.png', optimize=True)
icon(512, .2).save(D / 'maskable-512.png', optimize=True)
icon(512, .08).resize((180, 180), Image.LANCZOS).save(D / 'apple-touch-icon.png', optimize=True)
ogp()
print('作った: icon-192/512, maskable-512, apple-touch-icon, ogp.jpg')
