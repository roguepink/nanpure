// 確認用: jsc(Mac に最初から入っている JavaScript)で うごかす
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc engine.js tests/engine_test.js -- 200
var N = (typeof arguments !== 'undefined' && arguments[0]) ? +arguments[0] : 120;
var keys = {}, fails = 0, t0 = Date.now(), worst = 0, worstStage = 0, sumBlank = {}, symCount = {};
for (var s = 1; s <= N; s++) {
  var a = Date.now(), g = Sudoku.generate(s), ms = Date.now() - a;
  if (ms > worst) { worst = ms; worstStage = s; }
  var k = Sudoku.key(g.puzzle);
  if (keys[k]) { print('同じ面! stage ' + s + ' と ' + keys[k]); fails++; }
  keys[k] = s;
  var p = Sudoku.plan(s);
  if (g.blanks < p.blanks - 2) { print('空きが足りない stage ' + s + ' ' + g.blanks + '/' + p.blanks); }
  // 正しさ: 答えは 問題と一致し、ルールどおり
  var sol = g.solution.split('').map(Number), puz = g.puzzle.split('').map(Number);
  for (var i = 0; i < 81; i++) if (puz[i] && puz[i] !== sol[i]) { print('答えと ちがう'); fails++; }
  for (var u = 0; u < 27; u++) { var m = 0; Sudoku.UNITS[u].forEach(function (c) { m |= 1 << sol[c]; }); if (m !== 0x3fe) { print('答えが ルール違反'); fails++; } }
  // ヒントだけで 最後まで とけるか(ヒントで いつも 先へ進めるか)
  var b = puz.slice(), steps = 0;
  while (b.indexOf(0) >= 0) {
    var h = Sudoku.findHint(b, -1);
    if (!h) { if (g.level === 1) { print('ヒントが とまった stage ' + s); fails++; } break; }
    if (sol[h.cell] !== h.digit) { print('ヒントが まちがい stage ' + s); fails++; break; }
    b[h.cell] = h.digit; steps++;
  }
  symCount[g.sym] = (symCount[g.sym] || 0) + 1;
  if (s <= 8 || s % 20 === 0) print('stage ' + s + ' 空き ' + g.blanks + '/' + p.blanks + ' lv' + g.level + ' ' + g.sym + ' ' + ms + 'ms');
}
// 同じステージは いつも同じ問題か
var again = Sudoku.generate(37); if (again.puzzle !== Sudoku.generate(37).puzzle) { print('同じ番号で ちがう問題'); fails++; }
print('対称の形: ' + JSON.stringify(symCount));
print('いちばん 時間がかかった: stage ' + worstStage + ' ' + worst + 'ms / ぜんぶで ' + (Date.now() - t0) + 'ms');
print(fails ? 'NG ' + fails : 'OK ' + N + ' ステージ すべて 正しく、同じ面なし');
