// 실제 녹음: 스위치를 하나씩 끄고 템포·박자·첫 박·앞부분 코드 비교
const fs = require('fs'); const Engine = require('../src/engine.js'); const P = Engine._.P;
const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
const FL = ['TEMPO300', 'WALK_DOUBLE', 'TEMPO_HMM', 'METERS_EXT', 'VARIANTS', 'POWER', 'SLASH2', 'INV_SMOOTH'];
(async () => {
  for (const off of [null, ...FL, 'ALL']) {
    for (const k of FL) P[k] = !(off === 'ALL' || off === k);
    const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
    const TL = Engine.buildTimeline(A, {});
    const bars = TL.bars.slice(0, 6).map(b => b.events.map(e => e.label.text).join(' ')).join(' | ');
    console.log(`${(off ? off + ' 끔' : '모두 켬').padEnd(16)} ${TL.bpm.toFixed(1)} ${TL.meter.label} 대비 ${TL.meter.alt ? TL.meter.alt.map(r => r.m + ':' + r.contrast.toFixed(2)).join(' ') : ''} 첫박 ${TL.bars[1] ? TL.bars[1].t0.toFixed(2) : ''} 비트 ${TL.beats.length} | ${bars}`);
  }
})();
