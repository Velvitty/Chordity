// 1.7.0: 서서히 느려지는 구간의 육각형 틀, 도착 알약, 재생 위치에 따른 틀 안 글자
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
  await p.setInputFiles('#file', { name: '느려지는 발라드.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync('rit.wav') });
  await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
  const st = await p.evaluate(() => {
    const bars = [...document.querySelectorAll('.bar')];
    const pieces = bars.map((b2, i) => b2.querySelector('.ramp') ? (i + 1) + (b2.querySelector('.ramp.rs') ? 'S' : '') + (b2.querySelector('.ramp.re') ? 'E' : '') : null).filter(Boolean);
    return { pieces: pieces.join(' '), texts: [...document.querySelectorAll('.ramp .rt')].map(t => t.textContent).join('|'), pills: bars.map((b2, i) => [...b2.querySelectorAll('.tempochg')].map(x => x.textContent + '@' + (i + 1))).flat().join(' '),
      info: [...document.querySelectorAll('#info dt')].map((d, k) => d.textContent + ': ' + document.querySelectorAll('#info dd')[k].textContent).filter(x => /템포 변화/.test(x)).join(''),
      txt: document.getElementById('txt').value.split('\n').filter(l => /서서히/.test(l)).join('') };
  });
  console.log(`틀 조각: ${st.pieces} | 틀 글자: ${st.texts} | 흰 알약: ${st.pills}\n${st.info}\n텍스트 차트: ${st.txt.trim()}`);
  let live = '';
  for (const bar of [15, 18, 5]) { await p.click(`.bar[data-i="${bar}"]`); await p.waitForTimeout(250); live += ` ${bar + 1}마디→[${await p.textContent('.ramp .rt')}] 위쪽 ${await p.textContent('#fBpm')};`; }
  console.log('재생 위치:' + live);
  await p.click('.bar[data-i="14"]'); await p.waitForTimeout(250);
  await p.$eval('.bar[data-i="12"]', el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(250);
  const y = await p.$eval('.bar[data-i="10"]', el => el.getBoundingClientRect().top);
  await p.screenshot({ path: 'shot-ramp.png', clip: { x: 40, y: Math.max(0, y - 16), width: 1100, height: 290 } });
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
