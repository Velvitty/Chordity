// 카멜롯 표기 전환 확인(실제 곡)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#file', { name: '세월이 가면.mp3', mimeType: 'audio/mpeg', buffer: require('fs').readFileSync(require('path').join(__dirname, 'assets', 'song.mp3')) });
  await page.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  const snap = () => page.evaluate(() => ({
    key: document.getElementById('fKey').textContent,
    bars: [...document.querySelectorAll('.bar')].slice(1, 5).map(b => [...b.querySelectorAll('.chord')].map(c => c.textContent).join(' ')).join(' | '),
    pill: (document.querySelector('.keychg') || {}).textContent,
    aria: document.querySelector('.bar[data-i="2"]').getAttribute('aria-label'),
    applied: document.getElementById('appliedSum').textContent || '(없음)',
    info: [...document.querySelectorAll('#info dt')].map((d, i) => d.textContent + ': ' + document.querySelectorAll('#info dd')[i].textContent).filter(x => /조성 변화|카멜롯/.test(x)).join(' / '),
    txt: document.getElementById('txt').value.split('\n').filter((l, i) => i < 3 || l.includes('박부터')).join('\n'),
  }));
  const a = await snap();
  await page.click('#adjust > summary');
  await page.selectOption('#selNotation', 'camelot');
  await page.click('#play'); await page.waitForTimeout(1500);
  const b = await snap();
  const nowNext = await page.evaluate(() => document.getElementById('cNow').textContent + ' / 다음 ' + document.getElementById('cNext').textContent);
  await page.click('#play');
  for (const [lbl, x] of [['음이름', a], ['카멜롯', b]]) { console.log(`--- ${lbl}\n조성: ${x.key}\n마디 1~4: ${x.bars}\n전조 이름표: ${x.pill} | 마디 2 읽기: ${x.aria}\n적용 중: ${x.applied}\n정보: ${x.info}\n${x.txt}`); }
  console.log('재생 중 지금/다음:', nowNext);
  await page.$eval('.keychg', el => el.closest('.line').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const y = await page.$eval('.keychg', el => el.closest('.line').getBoundingClientRect().top);
  await page.screenshot({ path: require('path').resolve(__dirname, 'shot-cam.png'), clip: { x: 0, y: Math.max(0, y - 110), width: 1180, height: 330 } });
  await page.click('#resetPrefsBtn');
  console.log('설정 기본값으로 →', await page.evaluate(() => document.getElementById('selNotation').value + ' | ' + document.getElementById('fKey').textContent + ' | ' + [...document.querySelectorAll('.bar')][1].textContent.replace(/\s+/g, ' ').trim()));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
