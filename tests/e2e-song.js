// "곡 따라" 타건: 실제 재생 중 피아노 음 시작 시각을 가로채 기록(끌어 둔 코드 패드 곡, 3마디부터 약 3.8마디)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errors = []; let failed = false;
  // 3마디부터: 3마디 G(침), 4마디 G(같은 코드를 새로 침), 5마디 Am(침) — 곡 따라는 0·1·2마디 뒤, 코드가 바뀔 때는 0·2마디 뒤
  const WANT = { song: [0, 1, 2], change: [0, 2] };
  for (const mode of ['song', 'change']) {
    const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => {
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when, ...rest) { (window.__st = window.__st || []).push({ when: when || this.context.currentTime, dur: this.buffer ? this.buffer.duration : 0 }); return orig.call(this, when, ...rest); };
    });
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: 'hold.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('hold.wav') });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    const def = await p.evaluate(m => { const s = document.getElementById('selPianoMode'); const d = s.value; s.value = m; s.dispatchEvent(new Event('change', { bubbles: true })); return d; }, mode);
    const barDur = await p.evaluate(() => { const b0 = document.querySelector('.bar[data-i="2"]'), b1 = document.querySelector('.bar[data-i="3"]'); return 0; });
    await p.click('.bar[data-i="2"]'); await p.waitForTimeout(200);
    const tStart = await p.evaluate(() => { window.__st = []; return performance.now(); });
    await p.keyboard.press('Space'); await p.waitForTimeout(13000); await p.keyboard.press('Space');
    const st = await p.evaluate(() => window.__st);
    const groups = {};
    for (const x of st) { if (x.dur < 0.5 || x.dur > 60) continue; const k = x.when.toFixed(2); groups[k] = (groups[k] || 0) + 1; }
    const strikes = Object.keys(groups).filter(k => groups[k] >= 3).map(Number).sort((a, c) => a - c);
    const rel = strikes.map(t => ((t - strikes[0]) / (60 / 70 * 4)).toFixed(2));      // 첫 타건부터 몇 마디 뒤(70 BPM, 4박)
    console.log(`${mode === 'song' ? '곡 따라' : '코드가 바뀔 때'}: 기본값 ${def} | 타건 ${strikes.length}번, 첫 타건부터 마디 수 [${rel.join(', ')}]`);
    if (def !== 'song' || rel.length !== WANT[mode].length || rel.some((x, i) => Math.abs(x - WANT[mode][i]) > 0.1)) { failed = true; console.log(`  ✗ 기대 [${WANT[mode].join(', ')}], 기본값 song`); }
    await p.close();
  }
  console.log('오류', errors.length ? errors : '없음'); await b.close();
  if (failed || errors.length) process.exitCode = 1;   // 실패하면 종료 코드 1(npm 사슬이 멈춤)
})().catch(e => { console.error('FAIL', e); process.exit(1); });
