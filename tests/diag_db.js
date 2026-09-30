const fs = require('fs');
const Engine = require('../src/engine.js');
const NM = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const TL = Engine.buildTimeline(A, {});
  const top = (arr, i, k) => { const v = Array.from(arr.slice(i * 12, i * 12 + 12)); const s = v.reduce((a, b) => a + b, 0) || 1; return v.map((x, q) => [q, x / s]).sort((a, b) => b[1] - a[1]).slice(0, k); };
  console.log(' t(s)  pos  z      prelim   final        bass(비율)   treble 상위4');
  for (let i = 0; i < TL.beats.length; i++) {
    const t = TL.beats[i]; if (t < 26 || t > 52) continue;
    const bar = TL.bars[TL.barOfBeat[i]], off = i - bar.startBeat;
    const ev = bar.events.filter(e => e.off <= off + 1e-9).pop();
    const bs = top(TL.dbg.bass, i, 2), tr = top(TL.dbg.treb, i, 4);
    console.log(t.toFixed(2).padStart(6), String(TL.pos[i]).padStart(3), (TL.dbg.z[i] >= 0 ? ' ' : '') + TL.dbg.z[i].toFixed(2), ' ', TL.dbg.lab0[i].padEnd(8), (ev.label.text + (off === 0 ? ` [${bar.num}마디${bar.nBeats !== 4 ? ' ' + bar.nBeats + '박' : ''}]` : '')).padEnd(18), bs.map(([q, x]) => NM[q] + Math.round(x * 100)).join(' ').padEnd(12), tr.map(([q, x]) => NM[q] + Math.round(x * 100)).join(' '));
  }
  // 변박 사전 확률에 따른 불규칙 마디 수
  for (const eps of [3e-4, 1e-5, 1e-6, 1e-8]) {
    Engine._.P.DB_EPS = eps;
    const T2 = Engine.buildTimeline(A, {});
    const irr = T2.bars.filter((b, k) => !b.pickup && b.nBeats !== T2.meter.m && k < T2.bars.length - 1);
    console.log('eps', eps, '→ 불규칙 마디', irr.length, irr.map(b => b.num + '(' + b.nBeats + '박 @' + b.t0.toFixed(1) + 's)').join(', '), '| 대비도', T2.meter.contrast.toFixed(2));
  }
  Engine._.P.DB_EPS = 3e-4;
})();
