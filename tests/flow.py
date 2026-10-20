#!/usr/bin/env python3
"""本当の指の操作(タップ)で、はじめから 2面 クリアするまでを 通しで 確かめる。音は消して 動かす。
  ~/.local/venvs/ryokoshi/bin/python3 tests/flow.py"""
import functools, http.server, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

D = Path(__file__).resolve().parent.parent
OUT = D / '_check'; OUT.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(D)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/'
errors, fails = [], []
def check(cond, msg):
    print(('OK  ' if cond else 'NG  ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True, args=['--mute-audio'])
    ctx = b.new_context(viewport={'width': 390, 'height': 664}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(400)
    check(pg.inner_text('#goMain') == 'はじめる', 'はじめての人には「はじめる」')
    pg.tap('#btnGo'); pg.wait_for_timeout(300)
    check(pg.is_visible('#board'), 'ボタン1つで 盤が出る')
    for stage in (1, 2):
        n = 0
        while True:
            st = pg.evaluate("() => ({ i: cur.board.indexOf(0), sol: cur.solution, done: cur.done })")
            if st['i'] < 0 or st['done']: break
            i = st['i']; right = int(st['sol'][i])
            pg.tap(f'.c[data-i="{i}"]')
            if n == 2:   # 1回だけ わざと まちがえる
                wrong = right % 9 + 1
                pg.tap(f'.num[data-d="{wrong}"]')
                check(pg.evaluate(f"() => cur.board[{i}]") == 0, 'まちがいは 入らない')
                check('bad' in pg.get_attribute(f'.c[data-i="{i}"]', 'class'), 'まちがいは 赤く出る')
                pg.wait_for_timeout(1200)
                check('bad' not in pg.get_attribute(f'.c[data-i="{i}"]', 'class'), 'まちがいは 少しで 消える')
            if n == 4 and stage == 1:   # とちゅうで 読みこみなおしても つづきから
                pg.reload(); pg.wait_for_timeout(400)
                check(pg.inner_text('#goMain') == 'つづける', '閉じても「つづける」')
                pg.tap('#btnGo'); pg.wait_for_timeout(300)
                check(pg.evaluate("() => cur.mistakes") == 1, 'つづきから(まちがいの数も 覚えている)')
                pg.tap(f'.c[data-i="{i}"]')
            pg.tap(f'.num[data-d="{right}"]')
            n += 1
        pg.wait_for_timeout(1500)
        check(pg.is_visible('#clear'), f'ステージ {stage} クリア画面')
        if stage == 1:
            pg.screenshot(path=str(OUT / 'flow-clear.png'))
            pg.tap('#btnNext'); pg.wait_for_timeout(300)
            check(pg.evaluate("() => cur.stage") == 2, 'つぎの ステージへ 進む')
    s = pg.evaluate("() => JSON.parse(localStorage.getItem('nanpure-v1'))")
    check(s['unlocked'] == 3 and s['cleared']['1'] == 2 and s['cleared']['2'] == 2, '進みぐあいが 保存される(★2 ずつ)')
    pg.tap('#btnHome'); pg.wait_for_timeout(300)
    check(pg.inner_text('#goSub') == 'ステージ 3', 'はじめの画面は「ステージ 3」')
    # 同じ面が 出ないか(ステージ 1〜40 を この画面の しくみで 作って くらべる)
    r = pg.evaluate("""() => { var seen = {}, dup = 0; for (var s = 1; s <= 40; s++) { var g = makePuzzle(s); if (seen[g.puzzle]) dup++; seen[g.puzzle] = 1; } return dup; }""")
    check(r == 0, '40面 作っても 同じ面なし')
    # 時間: 一番重い面でも すぐ出るか
    ms = pg.evaluate("() => { var t = performance.now(); for (var s = 100; s < 120; s++) Sudoku.generate(s); return (performance.now() - t) / 20; }")
    check(ms < 100, f'1面を作る時間 {ms:.1f}ms')
    b.close()
srv.shutdown()
print('コンソールのエラー:', errors or 'なし')
print('結果:', 'ぜんぶ OK' if not fails and not errors else f'NG {len(fails)}')
