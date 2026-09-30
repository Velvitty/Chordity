const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  for (const [name, spec] of T.cases()) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const b = A.beats, fps = A.fps;
    const std = a => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length) || 1; };
    const σl = std(A.fl), σm = std(A.fm), σh = std(A.fh);
    const SN = new Float64Array(A.nF), KL = new Float64Array(A.nF);
    for (let i = 0; i < A.nF; i++) { SN[i] = Math.sqrt((A.fm[i] / σm) * (A.fh[i] / σh)); KL[i] = A.fl[i] / σl; }
    const smax = (arr, t) => { const c = Math.round(t * fps); let v = 0; for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < arr.length && arr[k] > v) v = arr[k]; return v; };
    let sOn = 0, sMid = 0, kOn = 0, kMid = 0;
    for (let i = 0; i + 1 < b.length; i++) { const m = 0.5 * (b[i] + b[i + 1]); sOn += smax(SN, b[i]); sMid += smax(SN, m); kOn += smax(KL, b[i]); kMid += smax(KL, m); }
    console.log(name.padEnd(24), 'true', String(spec.bpm).padStart(3), ' est', A.tempo.bpm.toFixed(1).padStart(6), ' snare mid/on', (sMid / sOn).toFixed(2), ' kick on/mid', (kOn / Math.max(1e-9, kMid)).toFixed(2));
  }
})();
