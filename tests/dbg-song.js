const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chord-chart.html')).href);
  const canMp3 = await page.evaluate(() => new Audio().canPlayType('audio/mpeg'));
  console.log('canPlayType(audio/mpeg):', JSON.stringify(canMp3));
  await page.setInputFiles('#file', require('path').join(__dirname, 'assets', 'song.mp3'));
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => ({ busy: !document.getElementById('busy').hidden, stage: document.getElementById('stage').textContent, pct: document.getElementById('pct').textContent, err: document.getElementById('err').hidden ? '' : document.getElementById('err').textContent, app: !document.getElementById('app').hidden }));
    console.log(JSON.stringify(st));
    if (st.app || st.err) break;
  }
  await browser.close();
})();
