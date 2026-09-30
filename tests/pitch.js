// 피아노 음의 기본 부분음 주파수를 정밀 측정(골쳐 스캔)해 곡 튜닝과 비교
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => {
    window.__bufs = new Set();
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () { if (this.buffer && this.buffer.duration > 1 && this.buffer.duration < 10) window.__bufs.add(this.buffer); return orig.apply(this, arguments); };
  });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chord-chart.html')).href);
  await page.setInputFiles('#file', { name: 'x.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await page.click('#play'); await page.waitForTimeout(3000);
  for (let j = 0; j < 8; j++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900); }
  await page.click('#play');
  const tune = await page.textContent('#fTune'), tuneTitle = await page.getAttribute('#fTune', 'title');
  const res = await page.evaluate(() => [...window.__bufs].map(b => {
    const d = b.getChannelData(0), sr = b.sampleRate, s0 = Math.round(0.08 * sr), N = Math.round(0.6 * sr);
    // 대략 f0: 자기상관
    const lo = Math.floor(sr / 1100), hi = Math.ceil(sr / 30); let bestL = lo, bestR = -1, M = 0; const r = [];
    for (let L = lo; L <= hi + 1; L++) { let a = 0, e1 = 0, e2 = 0; for (let i = 0; i < 4096; i++) { const x = d[s0 + i], y = d[s0 + i + L]; a += x * y; e1 += x * x; e2 += y * y; } r[L] = a / Math.sqrt(e1 * e2 + 1e-12); if (L > lo && r[L] > M) M = r[L]; }
    for (let L = lo + 1; L <= hi; L++) if (r[L] >= 0.9 * M && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { bestL = L; break; }
    const fr = sr / bestL;
    // 정밀: 해닝 창 골쳐로 ±3% 범위 스캔
    let bf = fr, bm = -1;
    for (let f = fr * 0.97; f <= fr * 1.03; f += fr * 0.0002) {
      const w = 2 * Math.PI * f / sr; let re = 0, im = 0;
      for (let i = 0; i < N; i++) { const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N), x = d[s0 + i] * h; re += x * Math.cos(w * i); im -= x * Math.sin(w * i); }
      const mg = re * re + im * im; if (mg > bm) { bm = mg; bf = f; }
    }
    const midiF = 69 + 12 * Math.log2(bf / 440), m = Math.round(midiF);
    return { m, cents: +((midiF - m) * 100).toFixed(1) };
  }));
  res.sort((a, b) => a.m - b.m);
  console.log('곡 기준음:', tune, tuneTitle);
  console.log('피아노 기본 부분음 편차(cent, 440 기준):', res.map(r => r.m + ':' + r.cents).join('  '));
  const c = res.map(r => r.cents); console.log('평균', (c.reduce((a, b) => a + b, 0) / c.length).toFixed(1), '범위', Math.min(...c), '~', Math.max(...c));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
