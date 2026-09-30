// 실제 곡의 로마 숫자(곡 전체에 일반적으로 적용되는지 확인)
const fs = require('fs'); const Engine = require('../src/engine.js');
(async () => {
  const raw = fs.readFileSync(require('path').join(__dirname, 'assets', 'song.f32')); const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  const A = await Engine.analyze({ channels: [L, R], sampleRate: 44100 }, null);
  const TL = Engine.buildTimeline(A, {});
  console.log('조성:', TL.keys.map(k => k.name + '@' + k.barNum + '마디').join(' → '));
  const show = (a, b) => TL.bars.slice(a, b).map(bar => `${String(bar.num).padStart(2)}: ${bar.events.map(e => e.label.text + '=' + e.label.rn.text).join('  ')}`).join('\n');
  console.log(show(1, 11)); console.log('...'); console.log(show(42, 50));
  const all = []; TL.bars.forEach(b => b.events.forEach(e => all.push(e.label.rn.text)));
  const kinds = {}; all.forEach(x => { const k = x.includes('/') ? '부속화음' : /^[♭♯]/.test(x) ? '차용·반음계' : /(65|43|42|64|6)$/.test(x) ? '자리바꿈' : '기본'; kinds[k] = (kinds[k] || 0) + 1; });
  console.log('곡 전체', all.length, '개 코드의 표기 종류:', JSON.stringify(kinds));
  console.log('\n' + Engine.chartText(TL, { title: '세월이 가면', notation: 'roman' }).split('\n').slice(0, 4).join('\n'));
})();
