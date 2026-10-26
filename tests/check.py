#!/usr/bin/env python3
"""画面の確認(Mac の Chrome を 画面なし・音なしで 動かして、実際に タップして 写真を撮る)。
  ~/.local/venvs/ryokoshi/bin/python3 tests/check.py [--size 390x844]
_check/ に 写真が出る(Git に入れない)。コンソールのエラーも 一覧にする。"""
import functools, http.server, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

D = Path(__file__).resolve().parent.parent
OUT = D / '_check'; OUT.mkdir(exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
sizes = [sys.argv[sys.argv.index('--size') + 1]] if '--size' in sys.argv else ['390x844', '390x664', '375x560', '1024x768', '768x1024']

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(D))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(D))
srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/index.html#noinstall'
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True, args=['--mute-audio'])
    for size in sizes:
        w, h = map(int, size.split('x'))
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=w < 700)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'{size}: {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'{size}: {e}'))
        pg.goto(url); pg.wait_for_timeout(500)
        shot = lambda name: pg.screenshot(path=str(OUT / f'{size}-{name}.png'))
        shot('1home')
        pg.click('#btnGo'); pg.wait_for_timeout(400); shot('2play')
        # 正しい数字を 3つ、まちがいを 1つ
        for _ in range(3):
            pg.evaluate("() => { var i = cur.board.indexOf(0); select(i); input(+cur.solution[i]); }")
        pg.wait_for_timeout(200)
        pg.evaluate("() => { var i = cur.board.indexOf(0); select(i); input((+cur.solution[i]) % 9 + 1); }")
        pg.wait_for_timeout(150); shot('3wrong')
        pg.wait_for_timeout(1300)
        pg.click('#btnHint'); pg.wait_for_timeout(300); shot('4hint')
        pg.click('#btnMemo')
        pg.evaluate("() => { var i = cur.board.indexOf(0); select(i); [1,3,5,7,9].forEach(function(d){ if (cur.board[i]===0) input(d); }); }")
        pg.wait_for_timeout(200); shot('5memo')
        pg.click('#btnMemo')
        # 最後まで うめる → クリア
        pg.evaluate("() => { for (var i = 0; i < 81; i++) if (!cur.board[i]) { select(i); input(+cur.solution[i]); } }")
        pg.wait_for_timeout(2200); shot('6clear')
        pg.click('#btnNext'); pg.wait_for_timeout(400); shot('7stage2')
        pg.click('#playBack'); pg.wait_for_timeout(300); shot('8home2')
        pg.click('#btnMap'); pg.wait_for_timeout(400); shot('9map')
        pg.evaluate('() => startStage(60)'); pg.wait_for_timeout(400); shot('10stage60')
        ctx.close()
    b.close()
srv.shutdown()
print('エラー:', len(errors)); [print(' ', e) for e in errors]
print('写真:', OUT)
