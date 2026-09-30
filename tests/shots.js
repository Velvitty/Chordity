// README 용 스크린샷: 친근한 파일 이름으로 불러와 재생 중 화면을 촬영
const { chromium } = require('playwright');
const fs = require('fs');
const URL = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href;
const file = { name: '데모곡 (합성 음원).wav', mimeType: 'audio/wav', buffer: fs.readFileSync('test-pop97.wav') };
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  // 데스크톱, 밝은 테마
  const d = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, colorScheme: 'light' })).newPage();
  await d.goto(URL);
  await d.setInputFiles('#file', file);
  await d.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await d.click('#play');
  for (let i = 0; i < 5; i++) await d.keyboard.press('ArrowRight');
  await d.waitForTimeout(1250);
  console.log('after 5 rapid → :', await d.textContent('#where'));
  await d.keyboard.press('Space');
  await d.evaluate(() => window.scrollTo(0, 0));
  await d.waitForTimeout(300);
  await d.screenshot({ path: require('path').resolve(__dirname, '..', 'docs/screenshot-desktop.png') });
  // 모바일, 어두운 테마
  const m = await (await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })).newPage();
  await m.goto(URL);
  await m.setInputFiles('#file', file);
  await m.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await m.tap('#play');
  for (let i = 0; i < 4; i++) await m.keyboard.press('ArrowRight');
  await m.waitForTimeout(1500);
  await m.tap('#play');
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.waitForTimeout(300);
  await m.screenshot({ path: require('path').resolve(__dirname, '..', 'docs/screenshot-mobile.png') });
  await browser.close();
  console.log('shots ok');
})().catch(e => { console.error(e); process.exit(1); });
