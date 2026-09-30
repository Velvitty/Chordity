const Engine = require('../src/engine.js');
const T = require('./testlib.js');
const { P } = Engine._;
function labelAt(TL, t) {
  const b = TL.beats; if (t < b[0]) return null;
  let lo = 0, hi = b.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (b[mid] <= t) lo = mid; else hi = mid - 1; }
  const j = lo, bar = TL.bars[TL.barOfBeat[j]];
  const iv = j + 1 < b.length ? b[j + 1] - b[j] : b[j] - b[j - 1];
  const off = (j - bar.startBeat) + (t - b[j]) / iv;
  let ev = bar.events[0]; for (const e of bar.events) if (e.off <= off + 1e-9) ev = e;
  return ev.label;
}
(async () => {
  const cases = T.cases();
  const data = [];
  for (const [name, spec] of cases) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    data.push({ name, spec, S, A });
  }
  function evalAll(verbose) {
    let ok = 0, tot = 0, miss7 = 0, false7 = 0, n7 = 0, nTri = 0, okBass = 0;
    for (const d of data) {
      const TL = Engine.buildTimeline(d.A, {});
      const beatSec = 60 / d.spec.bpm;
      for (const b of d.S.beats) {
        const lab = labelAt(TL, b.t + 0.5 * (b.t === d.S.beats[d.S.beats.length-1].t ? beatSec : beatSec));
        if (!lab) continue;
        const dd = T.parseDetected(lab.ascii), tr = T.parseChord(b.chord);
        tot++;
        const is7 = /7/.test(tr.q), det7 = /7/.test(dd.q);
        if (is7) n7++; else nTri++;
        if (is7 && !det7) miss7++;
        if (!is7 && det7) false7++;
        if (dd.root === tr.root && dd.q === tr.q) { ok++; if (dd.bass === tr.bass) okBass++; }
      }
    }
    return { acc: ok / tot, exact: okBass / tot, miss7: miss7 / n7, false7: false7 / nTri };
  }
  console.log('baseline', evalAll());
  const res = [];
  for (const s7 of [-1.0, -0.7, -0.5, -0.3, 0]) for (const beta of [15, 20, 30]) for (const g of [0.45, 0.6, 0.8]) {
    P.PRI.dom7 = s7; P.PRI.min7 = s7; P.PRI.maj7 = s7 - 0.2; P.BETA = beta; P.GAMMA = g; Engine._.clearCache();
    const r = evalAll();
    res.push({ s7, beta, g, ...r });
  }
  res.sort((a, b) => b.acc - a.acc);
  for (const r of res.slice(0, 15)) console.log(JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v]))));
})();
