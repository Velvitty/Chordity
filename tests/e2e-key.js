// 실제 곡으로 전조 표시 확인(브라우저)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.setInputFiles('#file', { name: '세월이 가면.mp3', mimeType: 'audio/mpeg', buffer: require('fs').readFileSync(require('path').join(__dirname, 'assets', 'song.mp3')) });
  await page.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  const r = await page.evaluate(() => ({
    key: document.getElementById('fKey').textContent, keyTitle: document.getElementById('fKey').title,
    pills: [...document.querySelectorAll('.keychg')].map(p => p.textContent + ' @ ' + p.closest('.bar').getAttribute('aria-label')),
    info: [...document.querySelectorAll('#info dt')].map((d, i) => d.textContent + ': ' + document.querySelectorAll('#info dd')[i].textContent).filter(x => x.startsWith('조성')),
  }));
  console.log(JSON.stringify(r, null, 1));
  const txt = await page.inputValue('#txt');
  console.log(txt.split('\n').filter(l => l.includes('박부터') || l.startsWith('#')).join('\n'));
  await page.$eval('.keychg', el => el.closest('.line').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const box = await page.$eval('.keychg', el => { const r = el.closest('.line').getBoundingClientRect(); return { y: r.top }; });
  await page.screenshot({ path: require('path').resolve(__dirname, 'shot-key.png'), clip: { x: 0, y: Math.max(0, box.y - 110), width: 1180, height: 330 } });
  // 어두운 테마, 휴대폰 폭에서도 표시 확인
  await page.click('#themeSeg .opt[data-theme-opt="dark"]'); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  await page.$eval('.keychg', el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  await page.screenshot({ path: require('path').resolve(__dirname, 'shot-key-mobile.png') });
  console.log('가로 넘침(휴대폰):', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '| errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
