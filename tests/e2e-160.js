// 1.6.0: 박자 변화·템포 표시·재생 중 BPM
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errors = [];
  for (const [file, name] of [['meterchg.wav', '변박 팝'], ['tempojump.wav', '템포 급변']]) {
    const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: name + '.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync(file) });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    const r = await p.evaluate(() => ({
      bpm: document.getElementById('fBpm').textContent, meter: document.getElementById('fMeter').textContent,
      pills: [...document.querySelectorAll('.bar')].map((b2, i) => [...b2.querySelectorAll('.keychg, .tempochg')].map(x => (x.className === 'tempochg' ? '흰' : '검') + ':' + x.textContent + '@' + (i + 1))).flat().join(' '),
      tags: document.querySelectorAll('.bar .tag').length,
      info: [...document.querySelectorAll('#info dt')].map((d, k) => d.textContent + ': ' + document.querySelectorAll('#info dd')[k].textContent).filter(x => /박자 변화|템포 변화/.test(x)).join(' / '),
      txt: document.getElementById('txt').value.split('\n').filter(l => /^#|\[/.test(l)).join(' | '),
    }));
    let live = '';
    if (name === '템포 급변') {                            // 재생 위치를 16마디, 5마디로 옮겨 상단 BPM 확인
      for (const bar of [16, 5]) { await p.click(`.bar[data-i="${bar - 1}"]`); await p.waitForTimeout(250); live += ` ${bar}마디→${await p.textContent('#fBpm')}`; }
    }
    console.log(`${name}: BPM ${r.bpm} | 박자 ${r.meter} | 이름표 ${r.pills} | 3박표시 ${r.tags} | ${r.info} | ${r.txt}${live ? ' | 재생 위치 BPM' + live : ''}`);
    if (name === '변박 팝') { await p.$eval('.bar[data-i="8"]', el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(250); const y = await p.$eval('.bar[data-i="8"]', el => el.getBoundingClientRect().top); await p.screenshot({ path: 'shot-160.png', clip: { x: 40, y: Math.max(0, y - 110), width: 1100, height: 240 } }); }
  }
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
