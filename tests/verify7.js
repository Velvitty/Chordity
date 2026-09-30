// 합성곡(정답 있음): ① 마디 첫머리 회색(이어짐)인데 실제로는 새로 친 코드 ② 코드가 바뀌는 박이 정답과 어긋난 곳
const E = require('../src/engine.js'), T = require('./testlib.js'), X = require('./stress.js');
if (process.env.OFF) { E._.P.RESTRIKE = false; E._.P.EDGE_ATTACK = false; }
const songs = T.cases().map(([n, s]) => [n, s, T.render]).concat(X.CASES.map(([n, s]) => [n, s, X.render]));
(async () => {
  let tiedAll = 0, barStarts = 0, early = 0, late = 0, other = 0, changesTruth = 0, hit = 0; const ex = [];
  for (const [name, spec, R] of songs) {
    const S = R(spec), A = await E.analyze({ channels: [S.y], sampleRate: S.sr }, null), TL = E.buildTimeline(A, {});
    const tb = S.beats.map(b => b.t), db = Array.from(TL.beats);
    const di = t => { let best = -1, bd = 0.07; db.forEach((d, i) => { if (Math.abs(d - t) < bd) { bd = Math.abs(d - t); best = i; } }); return best; };
    // 정답: 코드가 바뀌는 박(검출 박 번호로)
    const truthCh = new Set(); S.beats.forEach((b, i) => { if (i > 0 && b.chord !== S.beats[i - 1].chord && b.chord !== 'N') { const j = di(b.t); if (j >= 0) truthCh.add(j); } });
    // 검출: 코드가 바뀌는 박(정수 박 위치만), 마디 첫머리 이어짐
    const detCh = new Set(); let prevLab = null;
    TL.bars.forEach(bar => bar.events.forEach(ev => {
      const beat = bar.startBeat + Math.floor(ev.off + 1e-9);
      if (ev.off === 0 && bar.startBeat > 0 && !ev.label.nc) { barStarts++; if (ev.tied) { tiedAll++; if (ex.length < 12) ex.push(`${name}: ${bar.num}마디 ${ev.label.text}`); } }
      if (beat > 0 && !ev.label.nc && ev.label.text !== prevLab) detCh.add(beat);   // 코드가 실제로 달라진 곳만 '바뀜'
      prevLab = ev.label.text;
    }));
    for (const j of detCh) { if (truthCh.has(j)) { hit++; continue; } if (truthCh.has(j + 1)) early++; else if (truthCh.has(j - 1)) late++; else other++; }
    changesTruth += truthCh.size;
  }
  console.log(`① 마디 첫머리(코드 있음) ${barStarts}곳 중 회색(이어짐) ${tiedAll}곳 — 시험곡은 마디마다 새로 치므로 모두 '새로 쳤는데 회색' | 예: ${ex.join(' / ')}`);
  console.log(`② 정답의 코드 바뀜 ${changesTruth}곳 | 검출 바뀜 중 정답과 같은 박 ${hit}, 한 박 이름 ${early}, 한 박 늦음 ${late}, 그 밖(정답에 없는 바뀜) ${other}`);
})();
