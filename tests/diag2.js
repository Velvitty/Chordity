const Engine = require('../src/engine.js');
const T = require('./testlib.js');
(async () => {
  for (const [name, spec] of T.cases()) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    const b = A.beats, fps = A.fps;
    const std = a => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length) || 1; };
    const σl = std(A.fl), σm = std(A.fm), σh = std(A.fh);
    const P = new Float64Array(A.nF);
    for (let i = 0; i < A.nF; i++) P[i] = A.fl[i] / σl + Math.sqrt((A.fm[i] / σm) * (A.fh[i] / σh));
    const smax = (arr, t) => { const c = Math.round(t * fps); let v = 0; for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < arr.length && arr[k] > v) v = arr[k]; return v; };
    let on = 0, mid = 0, c = 0;
    for (let i = 0; i + 1 < b.length; i++) { on += smax(P, b[i]); mid += smax(P, 0.5 * (b[i] + b[i + 1])); c++; }
    // 박 쌍(짝수 인덱스 박 ↔ 다음 박) 비교: 두 배 템포 시 중간점에 스네어가 오는지
    console.log(name.padEnd(24), 'true', String(spec.bpm).padStart(3), ' est', (60 / ((b[b.length - 1] - b[0]) / (b.length - 1))).toFixed(1).padStart(6), ' P mid/on', (mid / on).toFixed(2));
  }
})();
