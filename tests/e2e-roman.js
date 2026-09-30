// 로마 숫자 표기 전환 확인(실제 곡)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#file', { name: '세월이 가면.mp3', mimeType: 'audio/mpeg', buffer: require('fs').readFileSync(require('path').join(__dirname, 'assets', 'song.mp3')) });
  await page.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  await page.click('#adjust > summary');
  await page.click('#notation [data-not="roman"]');
  await page.click('#play'); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    bars: [...document.querySelectorAll('.bar')].slice(1, 11).map(b => [...b.querySelectorAll('.chord')].map(c => c.textContent).join(' ')).join(' | '),
    aria: document.querySelector('.bar[data-i="3"]').getAttribute('aria-label'),
    key: document.getElementById('fKey').textContent, pill: document.querySelector('.keychg').textContent,
    now: document.getElementById('cNow').textContent + ' → ' + document.getElementById('cNext').textContent,
    applied: document.getElementById('appliedSum').textContent,
    stacked: document.querySelectorAll('.chord .fig').length, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    txt: document.getElementById('txt').value.split('\n').slice(0, 3).join('\n'),
  }));
  await page.click('#play');
  console.log(JSON.stringify(r, null, 1));
  // 전조 구간과 자리바꿈 숫자가 있는 줄을 촬영
  await page.$eval('.keychg', el => el.closest('.line').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const y = await page.$eval('.keychg', el => el.closest('.line').getBoundingClientRect().top);
  await page.screenshot({ path: require('path').resolve(__dirname, 'shot-roman.png'), clip: { x: 0, y: Math.max(0, y - 200), width: 1180, height: 420 } });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400); await page.$eval('.keychg', el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await page.screenshot({ path: require('path').resolve(__dirname, 'shot-roman-m.png') }); console.log('휴대폰 가로 넘침:', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)); await page.setViewportSize({ width: 1180, height: 900 }); await page.click('#notation [data-not="name"]');
  console.log('음이름으로 복귀:', await page.evaluate(() => [...document.querySelectorAll('.bar')][2].textContent.replace(/\s+/g, ' ').trim()), '| errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
