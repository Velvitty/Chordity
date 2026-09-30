// 간격 일관성 강도(tightness) 실험: 실제 곡의 박 규칙성·정박 강세, 합성 곡 정확도
const fs = require('fs');
const Engine = require('../src/engine.js');
const T = require('./testlib.js');
const { P } = Engine._;
function beatMetrics(A) {
  const b = Array.from(A.beats), iv = b.slice(1).map((t, i) => t - b[i]), med = [...iv].sort((x, y) => x - y)[iv.length >> 1];
  const S = A.S, FPS = A.fps, sm = t => { const c = Math.round((t - 0.0065) * FPS); let v = 0; for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < S.length && S[k] > v) v = S[k]; return v; };
  let on = 0, off = 0, badW = 0;
  for (let i = 0; i + 1 < b.length; i++) { on += sm(b[i]); off += sm((b[i] + b[i + 1]) / 2); }
  for (let i = 0; i + 12 < b.length; i += 6) { let o1 = 0, o2 = 0; for (let k = i; k < i + 12; k++) { o1 += sm(b[k]); o2 += sm((b[k] + b[k + 1]) / 2); } if (o2 >= o1) badW++; }
  const dev = iv.map(d => Math.abs(d / med - 1));
  return { bpm: 60 / med, dev12: dev.filter(x => x > 0.12).length, dev6: dev.filter(x => x > 0.06).length, n: iv.length, onoff: on / off, badW };
}
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const cases = T.cases().filter(c => ['pop 97', 'ballad 4/4 68 drift', 'hiphop 88', 'solo piano 72', 'ballad 12/8 58', 'dance 124'].includes(c[0]));
  const rendered = cases.map(([nm, sp]) => [nm, sp, T.render(sp)]);
  for (const tight of [100, 200, 400, 800]) {
    P.TIGHT = tight;
    const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
    const TL = Engine.buildTimeline(A, {});
    const m = beatMetrics(A);
    const irr = TL.bars.filter((x, k) => !x.pickup && x.nBeats !== TL.meter.m && k < TL.bars.length - 1).length;
    let syn = [];
    for (const [nm, sp, S] of rendered) {
      const A2 = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
      const truth = S.beats.map(x => x.t); let hit = 0, err = 0;
      for (const tb of truth) { let best = 9; for (const d of A2.beats) if (Math.abs(d - tb) < Math.abs(best)) best = d - tb; if (Math.abs(best) < 0.035) { hit++; err += Math.abs(best); } }
      syn.push(nm.split(' ')[0] + (nm.includes('drift') ? '(흔들림)' : nm.includes('12/8') ? '12/8' : '') + ' ' + hit + '/' + truth.length + ' ' + (err / hit * 1000).toFixed(1) + 'ms');
    }
    console.log(`tight ${String(tight).padStart(3)} | 실제 곡: 간격 6% 초과 ${m.dev6}/${m.n}, 12% 초과 ${m.dev12} | 정박/반박 강세 ${m.onoff.toFixed(2)} | 반박이 더 강한 구간 ${m.badW} | 불규칙 마디 ${irr} || 합성(35ms 이내): ${syn.join(', ')}`);
  }
  P.TIGHT = 100;
})();
