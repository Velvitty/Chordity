// 파워 코드 조건: 팝록·메탈의 파워 코드 정확도 vs 실제 녹음의 파워 코드 오판 수
const fs = require('fs'); const E = require('../src/engine.js'); const X = require('./stress.js'); const P = E._.P;
const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
(async () => {
  const songs = ['팝록', '메탈'].map(k => { const sp = X.CASES.find(c => c[0].startsWith(k))[1]; return [k, X.render(sp)]; });
  const AR = await E.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const AS = await Promise.all(songs.map(([k, S]) => E.analyze({ channels: [S.y], sampleRate: S.sr }, null)));
  for (const [tol, pen] of [[0.35, 12], [0.5, 6], [0.7, 6], [1.0, 4], [1.5, 3]]) {
    P.POWER_TOL = tol; P.POWER_PEN = pen; E._.clearCache();
    const real5 = E.buildTimeline(AR, {}).bars.reduce((a, b) => a + b.events.filter(e => /^[A-G][♯♭]?5/.test(e.label.text)).length, 0);
    const res = songs.map(([k, S], i) => { const T = E.buildTimeline(AS[i], {}); let ok = 0, tot = 0; for (const b of S.beats) { const tr = X.parseChordX(b.chord); if (tr.q !== '5') continue; tot++; const lab = X.labelAt(T, b.t + 0.2); if (lab && /^[A-G][♯♭]?5/.test(lab.text) && lab.root === (['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][tr.root] || '')) ok++; else if (lab && lab.text.includes('5')) ok++; } return `${k} 파워 코드 ${ok}/${tot}`; });
    console.log(`허용 ${tol} 감점 ${pen}: ${res.join(', ')} | 실제 녹음의 파워 코드 표기 ${real5}개`);
  }
})();
