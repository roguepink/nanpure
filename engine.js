'use strict';
/* ナンプレの問題を作る・とく・ヒントを出す しくみ(画面とは別)。
   - ステージ番号から いつも同じ問題が できる(番号ごとに ちがう「たね」を使う)
   - 数字のない マスの並びは、左右・上下・点対称などの「きれいな形」
   - 人が 理づめで とける問題だけを使う(あてずっぽうが いらない = 答えは 1つだけ)
   画面の index.html からも、確認用の tests/ からも使う。 */
var Sudoku = (function () {
  var ROW = [], COL = [], BOX = [], UNITS = [], PEERS = [], CELL_UNITS = [];
  (function init() {
    var i, r, c, u;
    for (i = 0; i < 81; i++) { r = Math.floor(i / 9); c = i % 9; ROW[i] = r; COL[i] = c; BOX[i] = Math.floor(r / 3) * 3 + Math.floor(c / 3); }
    for (u = 0; u < 27; u++) UNITS.push([]);
    for (i = 0; i < 81; i++) { UNITS[ROW[i]].push(i); UNITS[9 + COL[i]].push(i); UNITS[18 + BOX[i]].push(i); CELL_UNITS[i] = [ROW[i], 9 + COL[i], 18 + BOX[i]]; }
    for (i = 0; i < 81; i++) {
      var p = [];
      for (var j = 0; j < 81; j++) if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
      PEERS[i] = p;
    }
  })();

  var ALL = 0x3fe; // 1〜9 のビット
  function bitCount(m) { var n = 0; while (m) { m &= m - 1; n++; } return n; }
  function lowDigit(m) { for (var d = 1; d <= 9; d++) if (m & (1 << d)) return d; return 0; }

  /* たねから 決まった順の 乱数(どの端末でも 同じ並びになる) */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function hash32(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }

  /* すべて うまった 正しい盤面を 1つ作る */
  function fullGrid(rand) {
    var g = new Array(81).fill(0);
    var rowM = new Array(9).fill(0), colM = new Array(9).fill(0), boxM = new Array(9).fill(0);
    var orders = [];
    for (var i = 0; i < 81; i++) orders.push(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand));
    function fill(i) {
      if (i === 81) return true;
      var r = ROW[i], c = COL[i], b = BOX[i], used = rowM[r] | colM[c] | boxM[b], o = orders[i];
      for (var k = 0; k < 9; k++) {
        var d = o[k], bit = 1 << d;
        if (used & bit) continue;
        g[i] = d; rowM[r] |= bit; colM[c] |= bit; boxM[b] |= bit;
        if (fill(i + 1)) return true;
        rowM[r] &= ~bit; colM[c] &= ~bit; boxM[b] &= ~bit;
      }
      g[i] = 0;
      return false;
    }
    fill(0);
    return g;
  }

  /* 答えの数を数える(limit まで)。最後の念のための確かめに使う */
  function countSolutions(grid, limit) {
    var g = grid.slice(), count = 0;
    var rowM = new Array(9).fill(0), colM = new Array(9).fill(0), boxM = new Array(9).fill(0);
    for (var i = 0; i < 81; i++) if (g[i]) { var bit = 1 << g[i]; rowM[ROW[i]] |= bit; colM[COL[i]] |= bit; boxM[BOX[i]] |= bit; }
    function rec() {
      var best = -1, bestM = 0, bestN = 10;
      for (var i = 0; i < 81; i++) if (!g[i]) {
        var m = ALL & ~(rowM[ROW[i]] | colM[COL[i]] | boxM[BOX[i]]), n = bitCount(m);
        if (n === 0) return;
        if (n < bestN) { best = i; bestM = m; bestN = n; if (n === 1) break; }
      }
      if (best < 0) { count++; return; }
      for (var d = 1; d <= 9 && count < limit; d++) {
        var bit = 1 << d;
        if (!(bestM & bit)) continue;
        g[best] = d; rowM[ROW[best]] |= bit; colM[COL[best]] |= bit; boxM[BOX[best]] |= bit;
        rec();
        g[best] = 0; rowM[ROW[best]] &= ~bit; colM[COL[best]] &= ~bit; boxM[BOX[best]] &= ~bit;
      }
    }
    rec();
    return count;
  }

  /* 人と同じ 理づめで とく。
     level 1: 「ここには この数字しか入らない」「この列で この数字が入るのは ここだけ」
     level 2: そのうえ 候補のしぼりこみ(ブロックと列の かさなり・2つ組)
     もどり値: { solved, grid, hard }(hard = level 2 の手を 使ったか) */
  function logicSolve(grid, level) {
    var g = grid.slice(), cand = new Array(81), hard = false, i, d, u;
    for (i = 0; i < 81; i++) cand[i] = g[i] ? 0 : ALL;
    for (i = 0; i < 81; i++) if (g[i]) elim(i, g[i]);
    function elim(i, dd) { var bit = ~(1 << dd), p = PEERS[i]; for (var k = 0; k < 20; k++) cand[p[k]] &= bit; }
    function place(i, dd) { g[i] = dd; cand[i] = 0; elim(i, dd); }
    var left = 0;
    for (i = 0; i < 81; i++) if (!g[i]) left++;
    while (left > 0) {
      var progress = false;
      for (i = 0; i < 81; i++) {
        if (g[i]) continue;
        if (cand[i] === 0) return { solved: false, grid: g, hard: hard, broken: true };
        if (bitCount(cand[i]) === 1) { place(i, lowDigit(cand[i])); left--; progress = true; }
      }
      if (progress) continue;
      for (u = 0; u < 27 && !progress; u++) {
        var cells = UNITS[u];
        for (d = 1; d <= 9; d++) {
          var bit = 1 << d, where = -1, n = 0, done = false;
          for (var k = 0; k < 9; k++) { var c = cells[k]; if (g[c] === d) { done = true; break; } if (cand[c] & bit) { n++; where = c; } }
          if (done) continue;
          if (n === 0) return { solved: false, grid: g, hard: hard, broken: true };
          if (n === 1) { place(where, d); left--; progress = true; }
        }
      }
      if (progress) continue;
      if (level >= 2 && (lockedCandidates() || nakedPairs())) { hard = true; continue; }
      break;
    }
    return { solved: left === 0, grid: g, hard: hard };

    function lockedCandidates() {
      var changed = false;
      for (var b = 0; b < 9; b++) for (var dd = 1; dd <= 9; dd++) {
        var bit = 1 << dd, rows = {}, cols = {}, nr = 0, nc = 0, cells = UNITS[18 + b], rr = -1, cc = -1;
        for (var k = 0; k < 9; k++) { var c = cells[k]; if (cand[c] & bit) { if (!rows[ROW[c]]) { rows[ROW[c]] = 1; nr++; rr = ROW[c]; } if (!cols[COL[c]]) { cols[COL[c]] = 1; nc++; cc = COL[c]; } } }
        if (nr === 1) UNITS[rr].forEach(function (c) { if (BOX[c] !== b && (cand[c] & bit)) { cand[c] &= ~bit; changed = true; } });
        if (nc === 1) UNITS[9 + cc].forEach(function (c) { if (BOX[c] !== b && (cand[c] & bit)) { cand[c] &= ~bit; changed = true; } });
      }
      for (var line = 0; line < 18; line++) for (var d2 = 1; d2 <= 9; d2++) {
        var bit2 = 1 << d2, boxes = {}, nb = 0, bb = -1;
        UNITS[line].forEach(function (c) { if ((cand[c] & bit2) && !boxes[BOX[c]]) { boxes[BOX[c]] = 1; nb++; bb = BOX[c]; } });
        if (nb === 1) UNITS[18 + bb].forEach(function (c) {
          var inLine = line < 9 ? ROW[c] === line : COL[c] === line - 9;
          if (!inLine && (cand[c] & bit2)) { cand[c] &= ~bit2; changed = true; }
        });
      }
      return changed;
    }
    function nakedPairs() {
      var changed = false;
      for (var uu = 0; uu < 27; uu++) {
        var cells = UNITS[uu];
        for (var a = 0; a < 9; a++) {
          var ma = cand[cells[a]];
          if (bitCount(ma) !== 2) continue;
          for (var b = a + 1; b < 9; b++) if (cand[cells[b]] === ma) {
            for (var k = 0; k < 9; k++) if (k !== a && k !== b && (cand[cells[k]] & ma)) { cand[cells[k]] &= ~ma; changed = true; }
          }
        }
      }
      return changed;
    }
  }

  /* きれいな形(対称)の 組み合わせ。同じ組のマスは、いっしょに 空ける */
  // 見た目が いちばん ととのう 点対称を 多めに。ななめ対称は 形が わかりにくいので 使わない
  var SYMS = ['rot180', 'rot180', 'rot180', 'mirrorLR', 'mirrorUD', 'rot90', 'both'];
  function orbits(sym) {
    var seen = {}, list = [];
    for (var i = 0; i < 81; i++) {
      if (seen[i]) continue;
      var r = ROW[i], c = COL[i], set = [[r, c]];
      if (sym === 'rot180') set.push([8 - r, 8 - c]);
      else if (sym === 'mirrorLR') set.push([r, 8 - c]);
      else if (sym === 'mirrorUD') set.push([8 - r, c]);
      else if (sym === 'rot90') set.push([c, 8 - r], [8 - r, 8 - c], [8 - c, r]);
      else if (sym === 'diag') set.push([c, r]);
      else if (sym === 'both') set.push([r, 8 - c], [8 - r, c], [8 - r, 8 - c]);
      var o = [];
      set.forEach(function (p) { var j = p[0] * 9 + p[1]; if (!seen[j]) { seen[j] = 1; o.push(j); } });
      list.push(o);
    }
    return list;
  }

  /* ステージごとの むずかしさ。はじめは とても やさしく、少しずつ 空きマスを ふやす */
  function plan(stage) {
    var s = Math.max(1, stage | 0), blanks, level = 1, minBox = 2;
    if (s <= 1) blanks = 16;
    else if (s <= 5) blanks = 16 + (s - 1) * 4;            // 20, 24, 28, 32
    else if (s <= 20) blanks = 32 + Math.round((s - 5) * 0.9);   // 〜45
    else if (s <= 50) blanks = 45 + Math.floor((s - 20) / 4);    // 〜52
    else if (s <= 80) blanks = 52 + Math.floor((s - 50) / 10);   // 〜55
    else { blanks = 54 + (s % 3); level = 2; }
    if (s > 60) level = 2;
    var label = s <= 5 ? 'とても やさしい' : s <= 20 ? 'やさしい' : s <= 50 ? 'ふつう' : 'ちょっと むずかしい';
    return { blanks: blanks, level: level, minBox: minBox, label: label };
  }

  function tryMake(rand, p) {
    var sol = fullGrid(rand);
    var sym = SYMS[Math.floor(rand() * SYMS.length)];
    var puz = sol.slice(), blanks = 0, boxGivens = new Array(9).fill(9);
    var orbs = shuffle(orbits(sym), rand);
    for (var k = 0; k < orbs.length && blanks < p.blanks; k++) {
      var o = orbs[k];
      if (blanks + o.length > p.blanks + 1) continue;
      var ok = true, cnt = {};
      o.forEach(function (j) { cnt[BOX[j]] = (cnt[BOX[j]] || 0) + 1; });
      for (var b in cnt) if (boxGivens[b] - cnt[b] < p.minBox) ok = false;
      if (!ok) continue;
      o.forEach(function (j) { puz[j] = 0; });
      if (logicSolve(puz, p.level).solved) {
        blanks += o.length;
        for (var b2 in cnt) boxGivens[b2] -= cnt[b2];
      } else o.forEach(function (j) { puz[j] = sol[j]; });
    }
    return { puzzle: puz, solution: sol, blanks: blanks, sym: sym };
  }

  /* ステージ番号(と、ぶつかったとき用の variant)から 問題を作る */
  function generate(stage, variant) {
    var p = plan(stage), best = null;
    for (var attempt = 0; attempt < 12; attempt++) {
      var rand = rng(hash32('nanpure:' + stage + ':' + (variant || 0) + ':' + attempt));
      var m = tryMake(rand, p);
      if (!best || Math.abs(m.blanks - p.blanks) < Math.abs(best.blanks - p.blanks)) best = m;
      if (m.blanks >= p.blanks - 1) break;
    }
    if (countSolutions(best.puzzle, 2) !== 1) throw new Error('答えが1つでない問題ができた: stage ' + stage);
    return {
      stage: stage, variant: variant || 0, puzzle: best.puzzle.join(''), solution: best.solution.join(''),
      blanks: best.blanks, sym: best.sym, level: p.level, label: p.label
    };
  }

  /* 同じ面かどうかを見る印(数字の入れかえだけの ちがいも 同じとみなす) */
  function key(puzzleStr) {
    var map = {}, next = 1, out = '';
    for (var i = 0; i < 81; i++) {
      var ch = puzzleStr[i];
      if (ch === '0') { out += '0'; continue; }
      if (!map[ch]) map[ch] = String(next++);
      out += map[ch];
    }
    return hash32(out).toString(36) + hash32('x' + out).toString(36);
  }

  /* ヒント: いまの盤面(正しい数字だけ)で、理づめで すぐ 決まる マスを 1つさがす。
     prefer に マス番号を わたすと、そのマスを先に しらべる。
     もどり値: { cell, digit, kind: 'cell'|'row'|'col'|'box', unit } */
  function findHint(board, prefer) {
    var cand = new Array(81), i, u, d;
    for (i = 0; i < 81; i++) {
      if (board[i]) { cand[i] = 0; continue; }
      var used = 0, p = PEERS[i];
      for (var k = 0; k < 20; k++) if (board[p[k]]) used |= 1 << board[p[k]];
      cand[i] = ALL & ~used;
    }
    function hiddenFor(cell) {
      var us = CELL_UNITS[cell];
      for (var a = 0; a < 3; a++) {
        var uu = us[a], cells = UNITS[uu];
        for (var dd = 1; dd <= 9; dd++) {
          if (!(cand[cell] & (1 << dd))) continue;
          var n = 0;
          for (var k = 0; k < 9; k++) if (cand[cells[k]] & (1 << dd)) n++;
          if (n === 1) return { cell: cell, digit: dd, kind: uu < 9 ? 'row' : uu < 18 ? 'col' : 'box', unit: uu };
        }
      }
      return null;
    }
    if (prefer != null && prefer >= 0 && !board[prefer]) {
      var h = hiddenFor(prefer);
      if (h) return h;
      if (bitCount(cand[prefer]) === 1) return { cell: prefer, digit: lowDigit(cand[prefer]), kind: 'cell', unit: -1 };
    }
    // ブロック → よこ → たて の順に「ここしか入らない」をさがす(いちばん 見つけやすい)
    var order = [];
    for (u = 18; u < 27; u++) order.push(u);
    for (u = 0; u < 18; u++) order.push(u);
    for (var oi = 0; oi < order.length; oi++) {
      u = order[oi];
      var cells = UNITS[u];
      for (d = 1; d <= 9; d++) {
        var n = 0, where = -1;
        for (var k2 = 0; k2 < 9; k2++) if (cand[cells[k2]] & (1 << d)) { n++; where = cells[k2]; }
        if (n === 1) return { cell: where, digit: d, kind: u < 9 ? 'row' : u < 18 ? 'col' : 'box', unit: u };
      }
    }
    for (i = 0; i < 81; i++) if (!board[i] && bitCount(cand[i]) === 1) return { cell: i, digit: lowDigit(cand[i]), kind: 'cell', unit: -1 };
    return null;
  }

  return {
    ROW: ROW, COL: COL, BOX: BOX, UNITS: UNITS, PEERS: PEERS,
    generate: generate, plan: plan, logicSolve: logicSolve, countSolutions: countSolutions,
    key: key, findHint: findHint, rng: rng, hash32: hash32
  };
})();
if (typeof module !== 'undefined') module.exports = Sudoku;
