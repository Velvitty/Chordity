const fs = require('fs');
const Engine = require('../src/engine.js');
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const FPS = A.fps, O = A.O;
  // 1) 8분음표 단계 추적 결과의 간격 (30~50초)
  const bt = A.beatsTracked.filter(t => t > 29 && t < 51);
  console.log('8분 단계 비트 간격(s):', bt.slice(1).map((t, i) => (t - bt[i]).toFixed(3)).join(' '));
  // 2) 국소 템포: 8초 창 자기상관(0.35~0.55초 지연)으로 8분음표 주기
  const E = Float64Array.from(O);
  const loc = [];
  for (let c = 10; c < 215; c += 4) {
    const a = Math.round((c - 4) * FPS), b = Math.round((c + 4) * FPS);
    let best = 0, bl = 0;
    for (let lag = Math.round(0.36 * FPS); lag <= Math.round(0.52 * FPS); lag++) {
      let s = 0; for (let t = a; t + lag < b; t++) s += E[t] * E[t + lag]; if (s > best) { best = s; bl = lag; }
    }
    loc.push(c + 's:' + (60 * FPS / bl / 2).toFixed(1));
  }
  console.log('국소 템포(4분음표 BPM, 8초 창):', loc.join('  '));
  // 3) 추적된 비트 전체의 간격 분포 (4분 단계)
  const b4 = Array.from(A.beats), iv = b4.slice(1).map((t, i) => t - b4[i]);
  const med = [...iv].sort((x, y) => x - y)[iv.length >> 1];
  const bad = iv.map((d, i) => [i, d]).filter(([i, d]) => Math.abs(d / med - 1) > 0.12);
  console.log('4분 단계 간격 중앙값', med.toFixed(3), 's | 중앙값에서 12% 넘게 벗어난 간격', bad.length, '/', iv.length, ':', bad.map(([i, d]) => b4[i].toFixed(1) + 's→' + d.toFixed(2)).join(', '));
})();
