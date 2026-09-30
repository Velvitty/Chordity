// 차트 위 코드 표기 선택 막대 확인
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#file', { name: '데모곡.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  const st = () => page.evaluate(() => ({
    checked: [...document.querySelectorAll('#notation [data-not]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.textContent).join(),
    bar2: [...document.querySelectorAll('.bar')][4].textContent.replace(/\s+/g, ' ').trim(),
    panelHasSelect: !!document.querySelector('#adjust select[id="selNotation"]'),
    applied: document.getElementById('appliedSum').textContent || '(없음)',
    visibleWithoutPanel: document.getElementById('notation').getBoundingClientRect().height > 0 && !document.getElementById('adjust').open,
    where: document.querySelector('.bar[data-i="0"]') ? 'ok' : '',
  }));
  console.log('처음       ', JSON.stringify(await st()));
  await page.click('#notation [data-not="camelot"]'); console.log('카멜롯 클릭', JSON.stringify(await st()));
  await page.click('#notation [data-not="roman"]'); console.log('로마 클릭  ', JSON.stringify(await st()));
  // 키보드: 선택된 버튼에서 ← 로 카멜롯, End 로 로마 숫자. 이때 재생 위치(마디)는 바뀌지 않아야 함
  const posBefore = await page.textContent('#where');
  await page.focus('#notation [data-not="roman"]'); await page.keyboard.press('ArrowLeft');
  console.log('← 키       ', JSON.stringify(await st()), '| 포커스:', await page.evaluate(() => document.activeElement.textContent), '| 마디 위치 그대로:', posBefore === await page.textContent('#where'));
  await page.keyboard.press('End'); console.log('End 키     ', (await st()).checked);
  // 설정 기본값으로 눌러도 표기는 유지
  await page.click('#adjust > summary'); await page.selectOption('#selVocab', 'extended'); await page.click('#resetPrefsBtn');
  console.log('설정 기본값으로 뒤:', (await st()).checked, '| 적용 중:', (await st()).applied);
  const p2 = await ctx.newPage(); await p2.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  console.log('다시 열면 저장된 표기:', await p2.evaluate(() => [...document.querySelectorAll('#notation [data-not]')].find(b => b.getAttribute('aria-checked') === 'true').textContent));
  await page.click('#notation [data-not="name"]');
  await page.click('#adjust > summary');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  const y = await page.$eval('.viewbar', el => el.getBoundingClientRect().top);
  await page.screenshot({ path: require('path').resolve(__dirname, 'shot-seg.png'), clip: { x: 0, y: Math.max(0, y - 140), width: 1180, height: 330 } });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  console.log('휴대폰 가로 넘침:', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '| 막대 폭:', await page.$eval('#notation', el => Math.round(el.getBoundingClientRect().width)), '| errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
