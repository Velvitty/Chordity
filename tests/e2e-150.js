// 1.5.0 화면 확인: 버전, 7/4 판정, 코드 밖 베이스 표기, 로마 숫자·카멜롯 표기, 오류 없음
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errors = [];
  for (const [file, name] of [['odd74.wav', '7/4 록'], ['slash.wav', '코드 밖 베이스']]) {
    const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: name + '.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync(file) });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    const r = await p.evaluate(() => ({ ver: document.querySelector('.brand .ver').textContent, facts: document.querySelector('#fMeter') ? document.querySelector('#fMeter').textContent : [...document.querySelectorAll('.facts b, .facts span')].map(e => e.textContent).join(' ').slice(0, 80), bars: [...document.querySelectorAll('.bar')].slice(0, 4).map(b => [...b.querySelectorAll('.chord')].map(c => c.textContent).join(' ')).join(' | ') }));
    let extra = '';
    for (const mode of ['roman', 'camelot']) { await p.click(`#notation [data-not="${mode}"]`); extra += ` ${mode}: ` + await p.evaluate(() => [...document.querySelectorAll('.bar')].slice(0, 4).map(b => [...b.querySelectorAll('.chord')].map(c => c.textContent).join(' ')).join(' | ')); }
    console.log(`${name}: 버전 ${r.ver} | 박자 ${r.facts} | ${r.bars} |${extra}`);
  }
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
