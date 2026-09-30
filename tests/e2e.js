// 실제 브라우저(헤드리스 크로미움)에서 전체 흐름 검증
const { chromium } = require('playwright');
const fs = require('fs');
const URL = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href;

function analyzeClicks(starts, truth) {
  // 음악 소스(길이 > 1초) 시작 정보로 클릭의 '곡 시각' 복원
  let music = null; const out = [];
  const pk = starts.filter(s => s.len < 1).map(s => s.peak);
  const pkMax = Math.max(...pk, 1e-9);
  for (const s of starts) {
    if (s.len > 10) { music = s; continue; }   // 곡 전체 버퍼 = 음악
    if (s.len >= 1) continue;                  // 피아노 음은 클릭이 아님
    if (!music) continue;
    out.push({ t: music.offset + (s.when - music.when), accent: s.peak > 0.85 * pkMax });
  }
  const mids = truth.beats.slice(0, -1).map((t, i) => (t + truth.beats[i + 1]) / 2);
  const near = (arr, t) => arr.reduce((b, x) => Math.abs(x - t) < Math.abs(b) ? x - t : b, 1e9);
  let onBeat = 0, offBeat = 0, other = 0, errs = [], accOk = 0, accTot = 0, accWrong = 0;
  for (const c of out) {
    const e = near(truth.beats, c.t), em = near(mids, c.t);
    if (Math.abs(e) < 0.035) { onBeat++; errs.push(e); } else if (Math.abs(em) < 0.035) offBeat++; else other++;
    const isDown = Math.abs(near(truth.down, c.t)) < 0.035;
    if (c.accent) { accTot++; if (isDown) accOk++; else accWrong++; }
  }
  const me = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length);
  return { clicks: out.length, onBeat, offBeat, other, meanErrMs: +(me * 1000).toFixed(1), maxErrMs: +(Math.max(0, ...errs.map(Math.abs)) * 1000).toFixed(1), accents: accTot, accentOnDownbeat: accOk, accentWrong: accWrong };
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctxB = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctxB.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    window.__starts = [];
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset) {
      let peak = 0;
      if (this.buffer && this.buffer.duration < 1) { const d = this.buffer.getChannelData(0); for (let i = 0; i < 300; i++) peak = Math.max(peak, Math.abs(d[i])); }
      window.__starts.push({ when, offset: offset || 0, len: this.buffer ? this.buffer.duration : 0, peak });
      return orig.apply(this, arguments);
    };
  });
  await page.goto(URL);
  await page.screenshot({ path: 'shot-1-empty.png' });

  // --- 1) 곡 불러오기 → 분석
  const truth = JSON.parse(fs.readFileSync('test-pop97.json'));
  const t0 = Date.now();
  await page.setInputFiles('#file', 'test-pop97.wav');
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  console.log('analysis wall time', ((Date.now() - t0) / 1000).toFixed(2), 's');
  const facts = await page.evaluate(() => {
    const g = id => document.getElementById(id).textContent;
    return { bpm: g('fBpm'), meter: g('fMeter'), key: g('fKey'), tune: g('fTune'), bars: g('fBars'), nBars: document.querySelectorAll('.bar').length,
      first: [...document.querySelectorAll('.bar')].slice(0, 9).map(b => b.getAttribute('aria-label')) };
  });
  console.log('facts', JSON.stringify(facts));

  // --- 2) 재생 + 여러 위치로 이동하며 클릭 수집
  await page.click('#play');
  await page.waitForTimeout(3500);
  const ui1 = await page.evaluate(() => ({ state: document.getElementById('play').getAttribute('aria-label'), now: document.getElementById('tNow').textContent, where: document.getElementById('where').textContent, cur: document.getElementById('cNow').textContent, next: document.getElementById('cNext').textContent, curBars: document.querySelectorAll('.bar.cur').length, hits: document.querySelectorAll('.slashes i.hit').length, ledsOn: document.querySelectorAll('#leds i.on').length, pauseIconVisible: !document.getElementById('icoPause').hasAttribute('hidden') }));
  console.log('during play', JSON.stringify(ui1));
  await page.screenshot({ path: 'shot-2-playing.png' });
  for (let k = 0; k < 4; k++) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(2500); }
  let starts = await page.evaluate(() => window.__starts.splice(0));
  console.log('clicks (auto)', JSON.stringify(analyzeClicks(starts, truth)));

  // --- 3) 메트로놈 끄기(M 키) → 클릭 없어야 함
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(1500);
  starts = await page.evaluate(() => window.__starts.splice(0));
  const mOff = await page.evaluate(() => document.getElementById('metro').getAttribute('aria-pressed'));
  console.log('metro after M:', mOff, ' clicks scheduled while off:', starts.filter(s => s.len < 1).length);
  await page.keyboard.press('KeyM');

  // --- 4) ½박 옮기기 → 모든 클릭이 엇박이어야 함, 한 번 더 → 원상 복귀
  await page.click('#adjust > summary');
  await page.click('[data-op="half"]');
  await page.waitForTimeout(2500);
  starts = await page.evaluate(() => window.__starts.splice(0));
  console.log('clicks after ½박', JSON.stringify(analyzeClicks(starts, truth)), ' applied:', await page.textContent('#applied'));
  await page.click('[data-op="half"]');
  await page.waitForTimeout(2500);
  starts = await page.evaluate(() => window.__starts.splice(0));
  console.log('clicks after ½박×2', JSON.stringify(analyzeClicks(starts, truth)));
  await page.click('#resetBtn');

  // --- 5) 마디 클릭 이동, 스페이스 정지
  await page.click('.bar[data-i="12"]');
  await page.waitForTimeout(800);
  const w = await page.textContent('#where');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const st = await page.getAttribute('#play', 'aria-label');
  console.log('after bar click:', w, ' after Space:', st);

  // --- 6) 가로 넘침, 텍스트 차트
  const txt = await page.inputValue('#txt');
  console.log('text chart:\n' + txt.split('\n').slice(0, 4).join('\n'));
  console.log('h-overflow desktop:', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));

  // 다크 테마 스크린샷
  await page.click('#themeSeg .opt[data-theme-opt="dark"]');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shot-3-dark.png' });
  await page.keyboard.press('Space');

  // --- 7) 다른 곡들: 못갖춘마디·N.C., 두 배 템포 자동 교정
  for (const f of ['test-pickup104', 'test-ballad68']) {
    const tr = JSON.parse(fs.readFileSync(f + '.json'));
    await page.evaluate(() => { window.__starts.length = 0; });
    await page.setInputFiles('#file2', f + '.wav');
    await page.waitForFunction(() => document.getElementById('busy').hidden && !document.getElementById('app').hidden, null, { timeout: 90000 });
    const fx = await page.evaluate(() => ({ bpm: document.getElementById('fBpm').textContent, bars: document.getElementById('fBars').textContent, first: [...document.querySelectorAll('.bar')].slice(0, 6).map(b => b.getAttribute('aria-label')) }));
    await page.keyboard.press('Home');
    await page.click('#play');
    await page.waitForTimeout(4000);
    for (let k = 0; k < 3; k++) { for (let j = 0; j < 4; j++) await page.keyboard.press('ArrowRight'); await page.waitForTimeout(2500); }
    await page.keyboard.press('Space');
    const s2 = await page.evaluate(() => window.__starts.splice(0));
    console.log(f, JSON.stringify(fx), '\n   clicks', JSON.stringify(analyzeClicks(s2, tr)));
    if (f === 'test-pickup104') { await page.keyboard.press('Home'); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'shot-4-pickup-dark.png' }); }
  }

  // --- 8) 모바일 폭
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  mp.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await mp.goto(URL);
  await mp.screenshot({ path: 'shot-5-mobile-empty.png' });
  await mp.setInputFiles('#file', 'test-pop97.wav');
  await mp.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await mp.tap('#play');
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: 'shot-6-mobile.png' });
  console.log('h-overflow mobile:', await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), ' bars per line:', await mp.evaluate(() => getComputedStyle(document.getElementById('chart')).getPropertyValue('--per')));

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
