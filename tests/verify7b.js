// 어긋남 자세히: 곡별 한 박 이름/늦음/정답에 없는 바뀜, 마디 안 위치, 예
const E = require('../src/engine.js'), T = require('./testlib.js'), X = require('./stress.js');
const songs = T.cases().map(([n, s]) => [n, s, T.render]).concat(X.CASES.map(([n, s]) => [n, s, X.render]));
(async () => {
  const posE = {}, posL = {}; const rows = [];
  for (const [name, spec, R] of songs) {
    const S = R(spec), A = await E.analyze({ channels: [S.y], sampleRate: S.sr }, null), TL = E.buildTimeline(A, {});
    const db = Array.from(TL.beats);
    const di = t => { let best = -1, bd = 0.07; db.forEach((d, i) => { if (Math.abs(d - t) < bd) { bd = Math.abs(d - t); best = i; } }); return best; };
    const truthCh = new Map(); S.beats.forEach((b, i) => { if (i > 0 && b.chord !== S.beats[i - 1].chord && b.chord !== 'N') { const j = di(b.t); if (j >= 0) truthCh.set(j, S.beats[i - 1].chord + '→' + b.chord); } });
    const det = new Map();
    TL.bars.forEach(bar => bar.events.forEach(ev => { const beat = bar.startBeat + Math.floor(ev.off + 1e-9); if (!ev.tied && beat > 0 && !ev.label.nc) det.set(beat, { lab: ev.label.text, bar: bar.num, pos: Math.floor(ev.off) + 1, n: bar.nBeats }); }));
    let e = 0, l = 0, o = 0; const ex = [];
    for (const [j, d] of det) {
      if (truthCh.has(j)) continue;
      if (truthCh.has(j + 1)) { e++; posE[d.pos + '/' + d.n] = (posE[d.pos + '/' + d.n] || 0) + 1; if (ex.length < 2) ex.push(`${d.bar}마디 ${d.pos}박 ${d.lab}(정답은 다음 박 ${truthCh.get(j + 1)})`); }
      else if (truthCh.has(j - 1)) { l++; posL[d.pos + '/' + d.n] = (posL[d.pos + '/' + d.n] || 0) + 1; if (ex.length < 2) ex.push(`${d.bar}마디 ${d.pos}박 ${d.lab}(정답은 앞 박 ${truthCh.get(j - 1)})`); }
      else o++;
    }
    if (e + l + o) rows.push(`${name.slice(0, 22).padEnd(22)} 이름 ${e} 늦음 ${l} 없는 바뀜 ${o} | ${ex.join(' / ')}`);
  }
  console.log(rows.join('\n'));
  console.log('한 박 이르게 적힌 자리(마디 안 박/마디 길이):', JSON.stringify(posE), '| 늦게:', JSON.stringify(posL));
})();
