// 엔진 전체 회귀 테스트 (Node 전용)
const Engine = require('../src/engine.js');
const T = require('./testlib.js');
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
  const only = process.argv[2];
  for (const [name, spec] of T.cases()) {
    if (only && !name.includes(only)) continue;
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const TL = Engine.buildTimeline(A, {});
    const truth = S.beats.map(b => b.t), det = Array.from(TL.beats);
    let hits = 0, off = 0, errs = [];
    for (const tb of truth) { let best = Infinity; for (const d of det) if (Math.abs(d - tb) < Math.abs(best)) best = d - tb; if (Math.abs(best) < 0.07) { hits++; errs.push(best); } }
    for (let i = 0; i + 1 < truth.length; i++) { const m = 0.5 * (truth[i] + truth[i + 1]); if (det.some(d => Math.abs(d - m) < 0.07)) off++; }
    const me = errs.reduce((a, e) => a + e, 0) / Math.max(1, errs.length), mae = errs.reduce((a, e) => a + Math.abs(e), 0) / Math.max(1, errs.length);
    const trueDown = S.beats.filter(b => b.pos % spec.meter === 0).map(b => b.t);
    const detDown = TL.bars.filter(b => !b.pickup).map(b => b.t0);
    let dh = 0; for (const td of trueDown) if (detDown.some(d => Math.abs(d - td) < 0.07)) dh++;
    const extraDown = detDown.filter(d => !trueDown.some(td => Math.abs(d - td) < 0.07) && d > truth[0] - 0.05 && d < truth[truth.length - 1] + 0.05).length;
    let ok = 0, tot = 0, ncOK = 0, ncTot = 0; const conf = {};
    for (const b of S.beats) {
      const lab = labelAt(TL, b.t + 30 / spec.bpm); if (!lab) continue;
      if (b.chord === 'N') { ncTot++; if (lab.nc) ncOK++; else { const k = 'N→' + lab.ascii; conf[k] = (conf[k] || 0) + 1; } continue; }
      const dd = T.parseDetected(lab.ascii), tr = T.parseChord(b.chord); tot++;
      if (dd.root === tr.root && dd.q === tr.q && dd.bass === tr.bass) ok++; else { const k = b.chord + '→' + lab.ascii; conf[k] = (conf[k] || 0) + 1; }
    }
    const lv = A.level;
    console.log(`${name.padEnd(26)} bpm ${TL.bpm.toFixed(1).padStart(5)}/${spec.bpm}  beats ${hits}/${truth.length} off ${off}  err ${(me * 1000).toFixed(1)}±${(mae * 1000).toFixed(1)}ms  ${TL.meter.label}  down ${dh}/${trueDown.length}${extraDown ? ' extra ' + extraDown : ''}  chords ${(ok / tot * 100).toFixed(1)}%${ncTot ? ` NC ${ncOK}/${ncTot}` : ''}  [${lv.action} r2 ${lv.r2.toFixed(2)} sn ${lv.snareMidOn.toFixed(2)}${A.phase.flipped ? ' FLIP' : ''}] ${(A.elapsed).toFixed(2)}s`);
    const cs = Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (cs.length) console.log('      ', cs.map(([k, v]) => k + ' x' + v).join(', '));
  }
})();
