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
  const data = [];
  for (const [name, spec] of T.cases()) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    data.push({ name, spec, S, A });
  }
  const cfgs = [
    { s7: -0.4, beta: 30, g: 0.45 }, { s7: -0.3, beta: 25, g: 0.5 }, { s7: -0.5, beta: 30, g: 0.45 },
  ];
  for (const c of cfgs) {
    P.PRI.dom7 = c.s7; P.PRI.min7 = c.s7; P.PRI.maj7 = c.s7 - 0.2; P.BETA = c.beta; P.GAMMA = c.g; Engine._.clearCache();
    for (const vocab of ['basic', 'standard', 'extended']) {
      let ok = 0, tot = 0; const conf = {};
      for (const d of data) {
        const TL = Engine.buildTimeline(d.A, { vocab });
        const bs = 60 / d.spec.bpm;
        for (const b of d.S.beats) {
          const lab = labelAt(TL, b.t + 0.5 * bs); if (!lab) continue;
          const dd = T.parseDetected(lab.ascii), tr = T.parseChord(b.chord);
          let trq = tr.q; if (vocab === 'basic') trq = trq.startsWith('m') && trq !== 'maj7' ? 'm' : (trq === 'dim' ? 'dim' : '');
          if (vocab === 'basic' && (tr.q === 'sus4' || tr.q === 'dim')) continue;
          tot++;
          if (dd.root === tr.root && dd.q === trq) ok++; else { const k = b.chord + '→' + lab.ascii; conf[k] = (conf[k] || 0) + 1; }
        }
      }
      console.log(JSON.stringify(c), vocab.padEnd(9), (ok / tot * 100).toFixed(1) + '%', Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' x' + v).join(', '));
    }
  }
})();
