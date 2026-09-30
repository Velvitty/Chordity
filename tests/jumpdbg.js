const Engine = require('../src/engine.js'); const X = require('./stress.js'); const FPS = Engine._.FPS;
(async () => {
  const S = X.render(X.CASES.find(c => c[0].startsWith('템포 급변'))[1]);
  const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
  const tau = A.tempo.tau; Engine._.localTempo(A.O, tau);
  const d = Engine._.localTempo.dbg, bpm = l => (60 * FPS / l).toFixed(0);
  console.log('τ', tau.toFixed(1), 'lo', d.lo, '경로(4창마다 BPM):', d.path.filter((_, w) => w % 4 === 0).map(p => bpm(d.lo + p)).join(' '));
  for (const w of [20, 40, 45]) { const sc = d.S[w]; if (!sc) continue; const best = [...sc].map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([v, j]) => bpm(d.lo - 1 + j) + ':' + v.toFixed(2)); const at = Math.round(tau) - d.lo + 1; console.log(`창 ${w}: 상위 ${best.join(' ')}  원래 템포 점수 ${sc[at].toFixed(2)}`); }
})();
