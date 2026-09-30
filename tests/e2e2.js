const { chromium } = require('playwright');
const fs = require('fs');
const URL = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chord-chart.html')).href;
const truth = JSON.parse(fs.readFileSync('test-pop97.json'));
const mids = truth.beats.slice(0, -1).map((t, i) => (t + truth.beats[i + 1]) / 2);
const near = (arr, t) => arr.reduce((b, x) => Math.abs(x - t) < Math.abs(b) ? x - t : b, 1e9);
// 전체 로그에서 [from, to) 구간의 클릭을 곡 시각으로 (직전 음악 시작 기준)
function clicksIn(log, from) {
  let music = null; const out = [];
  const pkMax = Math.max(...log.filter(s => s.len < 1).map(s => s.peak), 1e-9);
  log.forEach((s, i) => {
    if (s.len > 10) { music = s; return; }
    if (s.len >= 1) return;
    if (i < from || !music) return;
    out.push({ t: music.offset + (s.when - music.when), accent: s.peak > 0.85 * pkMax });
  });
  return out;
}
function summarize(cl) {
  let on = 0, off = 0, other = 0, e = [], accDown = 0, acc = 0, accBeat2 = 0;
  for (const c of cl) {
    const a = near(truth.beats, c.t), b = near(mids, c.t);
    if (Math.abs(a) < 0.035) { on++; e.push(a); } else if (Math.abs(b) < 0.035) { off++; e.push(b); } else other++;
    if (c.accent) { acc++; if (Math.abs(near(truth.down, c.t)) < 0.035) accDown++; else if (Math.abs(near(truth.down.map(t => t + 60 / 97), c.t)) < 0.05) accBeat2++; }
  }
  const m = e.reduce((x, y) => x + y, 0) / Math.max(1, e.length);
  const iv = []; for (let i = 1; i < cl.length; i++) iv.push(cl[i].t - cl[i - 1].t);
  const medIv = iv.sort((x, y) => x - y)[iv.length >> 1] || 0;
  return `clicks ${cl.length}  on ${on}  off ${off}  other ${other}  meanErr ${(m * 1000).toFixed(1)}ms  medInterval ${(medIv * 1000).toFixed(0)}ms (beat ${(60000 / 97).toFixed(0)})  accents ${acc} (downbeat ${accDown}, beat2 ${accBeat2})`;
}
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__log = [];
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset) {
      let peak = 0;
      if (this.buffer && this.buffer.duration < 1) { const d = this.buffer.getChannelData(0); for (let i = 0; i < 300; i++) peak = Math.max(peak, Math.abs(d[i])); }
      window.__log.push({ when, offset: offset || 0, len: this.buffer ? this.buffer.duration : 0, peak });
      return orig.apply(this, arguments);
    };
  });
  await page.goto(URL);
  await page.setInputFiles('#file', 'test-pop97.wav');
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await page.click('#adjust > summary');
  const mark = () => page.evaluate(() => window.__log.length);
  const grab = async from => clicksIn(await page.evaluate(() => window.__log), from);
  async function phase(label, action, ms = 3500) {
    await page.click('#play'); // 재생 시작
    await page.keyboard.press('Home');
    if (action) await action();
    const m0 = await mark();
    await page.waitForTimeout(ms);
    const cl = await grab(m0);
    await page.click('#play'); // 정지
    console.log(label.padEnd(26), summarize(cl), ' | applied:', (await page.textContent('#applied')).trim());
  }
  await phase('기본', null);
  await phase('½박 옮기기', () => page.click('[data-op="half"]'));
  await phase('½박 한 번 더(원상 복귀)', () => page.click('[data-op="half"]'));
  await page.click('#resetBtn');
  await phase('×2', () => page.click('[data-op="x2"]'));
  await phase('×2 후 ÷2', () => page.click('[data-op="d2"]'));
  await page.click('#resetBtn');
  await phase('첫 박 한 박 늦추기', () => page.click('#dsNext'));
  await page.click('#resetBtn');
  // 클릭 타이밍 +30 ms
  await page.$eval('#rOffset', el => { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await phase('클릭 타이밍 +30ms', null);
  console.log('offset label:', await page.textContent('#offTxt'), ' slider width px:', await page.$eval('#rOffset', el => el.getBoundingClientRect().width));
  await page.$eval('#rOffset', el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  // 박자 강제 3
  await page.selectOption('#selMeter', '3');
  console.log('meter 3 →', await page.textContent('#fMeter'), 'bars', await page.textContent('#fBars'), ' first bar beats:', await page.$$eval('.bar', bs => bs.slice(0, 3).map(b => b.querySelectorAll('.slashes i').length)));
  await page.selectOption('#selMeter', 'auto');
  // ½박 해상도, 확장 코드
  await page.selectOption('#selRes', '2');
  console.log('res ½ → half marks in bar 1:', await page.$$eval('.bar', bs => bs[0].querySelectorAll('.slashes i.off').length));
  await page.selectOption('#selRes', '1');
  await page.screenshot({ path: 'shot-7-adjust.png', clip: { x: 0, y: 280, width: 1180, height: 520 } });

  // 모바일 재촬영 + 볼륨 동기화 + 트랜스포트 높이
  const mp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  mp.on('pageerror', e => errors.push('mobile: ' + e.message));
  await mp.goto(URL);
  await mp.setInputFiles('#file', 'test-pop97.wav');
  await mp.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await mp.tap('#play');
  await mp.waitForTimeout(2000);
  await mp.evaluate(() => window.scrollTo(0, 700));
  await mp.waitForTimeout(700);
  await mp.screenshot({ path: 'shot-8-mobile-scrolled.png' });
  const tpH = await mp.$eval('#transport', el => el.getBoundingClientRect().height);
  await mp.$eval('.vols-narrow [data-vol="click"]', el => { el.value = '0.3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const synced = await mp.$eval('.vols-wide [data-vol="click"]', el => el.value);
  console.log('mobile transport height', tpH.toFixed(0), 'px of 844;  volume sync →', synced, '; h-overflow', await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
