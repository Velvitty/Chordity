// README용: 같은 구간을 음이름·카멜롯·로마 숫자로 촬영(앱 코드는 그대로 사용)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 1000 }, colorScheme: 'light' })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#file', { name: '데모곡 (합성 음원).wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  for (const [key, file] of [['name', 'notation-name'], ['camelot', 'notation-camelot'], ['roman', 'notation-roman']]) {
    await page.click(`#notation [data-not="${key}"]`);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());   // 초점 테두리 없이
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
    const top = await page.$eval('.viewbar', el => el.getBoundingClientRect().top + window.scrollY);
    const bottom = await page.$eval('.chart .line:nth-child(3)', el => el.getBoundingClientRect().bottom + window.scrollY);
    await page.screenshot({ path: `${require('path').resolve(__dirname, '..', 'docs')}/${file}.png`, clip: { x: 40, y: top - 12, width: 1100, height: bottom - top + 14 }, fullPage: true });
    const txt = await page.evaluate(() => [...document.querySelectorAll('.chart .line')].slice(0, 3).map(l => [...l.querySelectorAll('.bar')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).join(' | ')).join('  //  '));
    console.log(key.padEnd(8), txt);
  }
  await page.click('#notation [data-not="name"]');
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
