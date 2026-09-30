const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  for (const [name, spec] of T.cases()) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const b = A.beats, fps = A.fps;
    const sl = Math.max(1e-9, ...[0].map(() => 0));
    const std = a => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length) || 1; };
    const σl = std(A.fl), σm = std(A.fm), σh = std(A.fh);
    const P = new Float64Array(A.nF);
    for (let i = 0; i < A.nF; i++) P[i] = A.fl[i] / σl + Math.sqrt((A.fm[i] / σm) * (A.fh[i] / σh));
    const smax = (arr, t) => { const c = Math.round(t * fps); let v = 0; for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < arr.length && arr[k] > v) v = arr[k]; return v; };
    const par = (arr) => { let e = 0, o = 0, ce = 0, co = 0; for (let i = 0; i < b.length; i++) { const v = smax(arr, b[i]); if (i % 2) { o += v; co++; } else { e += v; ce++; } } e /= ce; o /= co; return Math.max(e, o) / Math.max(1e-9, Math.min(e, o)); };
    const trueB = spec.bpm;
    console.log(name.padEnd(24), 'true', String(trueB).padStart(3), ' est', A.tempo.bpm.toFixed(1).padStart(6), ' O', par(A.O).toFixed(2), ' P', par(P).toFixed(2), ' fl', par(A.fl).toFixed(2), ' cands', A.tempo.cands.map(c => c.bpm.toFixed(0) + ':' + c.rel.toFixed(2)).join(' '));
  }
})();
