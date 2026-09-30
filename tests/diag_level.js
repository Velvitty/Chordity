// 박 단계 판정 단서 비교: 합성 곡(정답 알고 있음) vs 실제 곡
const fs = require('fs');
const Engine = require('../src/engine.js');
const T = require('./testlib.js');
const FPS = Engine._.FPS, CAL = 0.0065;
function stats(A) {
  const b = A.beatsTracked, n = b.length;
  const sm = (arr, t) => { const c = Math.round((t - CAL) * FPS); let v = 0; for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < arr.length && arr[k] > v) v = arr[k]; return v; };
  const par = arr => { let e = 0, o = 0; for (let i = 0; i < n; i++) { const v = sm(arr, b[i]); if (i % 2) o += v; else e += v; } return [e, o]; };
  const [kE, kO] = par(A.drum.K), [sE, sO] = par(A.drum.Sn), [nE, nO] = par(A.nov);
  const d = (x, y) => (x - y) / (x + y + 1e-12);
  const sgn = kE >= kO ? 1 : -1;                        // 킥이 강한 쪽을 +로 맞춤
  const iv = []; for (let i = 1; i < n; i++) iv.push(b[i] - b[i - 1]); iv.sort((x, y) => x - y);
  return { bpm: 60 / iv[iv.length >> 1], r2: A.level.r2, dK: sgn * d(kE, kO), dSn: sgn * d(sE, sO), dNov: sgn * d(nE, nO), action: A.level.action };
}
(async () => {
  const rows = [];
  for (const [name, spec] of T.cases()) {
    const S = T.render(spec);
    const A = await Engine.analyze({ channels: [S.y], sampleRate: S.sr }, null);
    rows.push([name + ` (정답 ${spec.bpm})`, stats(A)]);
  }
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  rows.push(['세월이 가면 (실제 곡)', stats(A)]);
  for (const [nm, s] of rows) console.log(nm.padEnd(34), 'bpm', s.bpm.toFixed(1).padStart(6), '| r2', s.r2.toFixed(2), '| 킥 치우침', s.dK.toFixed(2).padStart(5), '| 스네어 같은쪽', s.dSn.toFixed(2).padStart(5), '| 화성변화 같은쪽', s.dNov.toFixed(2).padStart(5), '|', s.action);
  // 올바른 단계(÷2)에서의 해당 구간
  const TL = Engine.buildTimeline(A, { ops: ['d2'] });
  const txt = Engine.chartText(TL, { title: '÷2 적용' }).split('\n');
  console.log('\n÷2 적용 시: BPM', TL.bpm.toFixed(1), TL.meter.label, '| 불규칙 마디:', TL.bars.filter(b => !b.pickup && b.nBeats !== TL.meter.m).map(b => b.num + '(' + b.nBeats + '박)').join(', ') || '없음');
  console.log(txt.slice(0, 12).join('\n'));
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'A_song.json'), '');
})();
