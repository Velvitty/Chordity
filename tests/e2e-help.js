// 맨 아래 안내 → 도움말 페이지 연동과 도움말 페이지 동작 확인
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; const watch = p => { p.on('pageerror', e => errors.push(p.url().split('/').pop() + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
  watch(page);
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  const foot = await page.$eval('footer.disclaimer a', a => ({ text: a.textContent.trim(), href: a.getAttribute('href'), target: a.target, visible: a.getBoundingClientRect().height > 0, atBottom: Math.round(document.documentElement.scrollHeight - (a.getBoundingClientRect().bottom + scrollY)) }));
  console.log('맨 아래 안내(첫 화면):', JSON.stringify(foot)); await page.screenshot({ path: require('path').resolve(__dirname, 'shot-app-foot.png') });
  await page.setInputFiles('#file', { name: '데모곡.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('test-pop97.wav') });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  console.log('분석 정보 안 연결:', await page.$eval('.infohelp a', a => a.textContent + ' → ' + a.getAttribute('href')));
  // 안내 문구를 누르면 새 탭으로 도움말의 "실수할 수 있는 이유" 절이 열림
  const [help] = await Promise.all([ctx.waitForEvent('page'), page.click('footer.disclaimer a')]);
  watch(help);
  await help.waitForLoadState('load'); await help.waitForTimeout(500);
  const h = await help.evaluate(() => {
    const maths = [...document.querySelectorAll('math')];
    const blocks = maths.filter(m => m.getAttribute('display') === 'block');
    const acc = document.getElementById('accuracy').getBoundingClientRect().top;
    const broken = [...document.querySelectorAll('#toc a')].filter(a => !document.getElementById(a.getAttribute('href').slice(1))).length;
    const zero = maths.filter(m => m.getBoundingClientRect().width < 4 || m.getBoundingClientRect().height < 4).length;
    return { url: location.pathname.split('/').pop() + location.hash, title: document.title, h1: document.querySelector('h1').textContent, math: maths.length, block: blocks.length, zeroSize: zero, mathmlSupported: blocks[0].getBoundingClientRect().height > 20, accuracyTop: Math.round(acc), tocBroken: broken, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, appLink: document.querySelector('.top .btn').getAttribute('href') };
  });
  console.log('도움말:', JSON.stringify(h));
  // 스크롤 위치 표시
  await help.evaluate(() => document.getElementById('m-chord').scrollIntoView()); await help.waitForTimeout(300);
  console.log('수식 절로 스크롤 → 목차 표시:', await help.$eval('#toc a[aria-current="true"]', a => a.textContent));
  // 찾기
  await help.fill('#q', '크로마');
  const f1 = await help.evaluate(() => ({ blocks: document.querySelectorAll('.doc .block:not([hidden])').length, sections: [...document.querySelectorAll('.doc section.topic')].filter(s => !s.hidden).map(s => s.querySelector('h2').textContent), toc: document.querySelectorAll('#toc li:not([hidden])').length }));
  console.log('찾기 "크로마":', JSON.stringify(f1));
  await help.fill('#q', '존재하지않는말'); console.log('없는 말:', await help.$eval('#noresult', e => !e.hidden));
  await help.fill('#q', ''); console.log('지우면 모두 복귀:', await help.evaluate(() => document.querySelectorAll('.doc .block[hidden], .doc section[hidden]').length === 0));
  await help.evaluate(() => scrollTo(0, 0));
  await help.screenshot({ path: require('path').resolve(__dirname, 'shot-help-top.png') });
  await help.evaluate(() => document.getElementById('m-onset').scrollIntoView()); await help.waitForTimeout(300);
  await help.screenshot({ path: require('path').resolve(__dirname, 'shot-help-math.png') });
  await help.click('#themeBtn'); console.log('테마 전환:', await help.evaluate(() => document.documentElement.dataset.theme));
  await help.evaluate(() => document.getElementById('mistakes').scrollIntoView()); await help.waitForTimeout(300);
  await help.screenshot({ path: require('path').resolve(__dirname, 'shot-help-dark.png') });
  await help.click('#themeBtn');
  await help.setViewportSize({ width: 390, height: 844 }); await help.evaluate(() => scrollTo(0, 0)); await help.waitForTimeout(400);
  console.log('휴대폰: 가로 넘침', await help.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '| 목차 접힘', await help.$eval('#tocbox', d => !d.open));
  await help.screenshot({ path: require('path').resolve(__dirname, 'shot-help-mobile.png') });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
