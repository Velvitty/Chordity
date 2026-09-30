// 화면: 끌어 둔 코드는 회색, 새로 친 코드는 검은 글자(패드 곡), 팝 곡은 마디 첫머리 회색 없음
const { chromium } = require('playwright'); const truth = require('./hold_truth.json');
(async () => {
  const b = await chromium.launch(); const errors = [];
  for (const [f, name] of [['hold.wav', '끌어 둔 코드(패드)'], ['pop97.wav', '팝 97']]) {
    const p = await (await b.newContext({ viewport: { width: 1180, height: 900 } })).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href);
    await p.setInputFiles('#file', { name: name + '.wav', mimeType: 'audio/wav', buffer: require('fs').readFileSync(f) });
    await p.waitForSelector('#app:not([hidden])', { timeout: 120000 });
    const r = await p.evaluate(() => [...document.querySelectorAll('.bar')].map(bar => { const c = bar.querySelector('.chord'); return c ? { t: c.textContent, g: c.classList.contains('tied'), off: parseFloat(c.style.left) } : null; }));
    if (name === '팝 97') { const g = r.filter(x => x && x.g && x.t !== 'N.C.'); console.log(`${name}: 마디 첫머리 회색 ${g.length}곳${g.length ? ' ' + g.map(x => x.t) : ''}`); }
    else {
      let ok = 0, bad = []; const row = [];
      truth.forEach((tr, i) => { const x = r[i]; if (!x || i === 0) return; const sameAsPrev = r[i - 1] && x.t === r[i - 1].t;
        if (!sameAsPrev) { row.push(`${i + 1}:${x.t}`); return; }                       // 코드가 바뀐 마디는 회색 대상이 아님
        const want = tr === '끎'; row.push(`${i + 1}:${x.t}${x.g ? '(회색)' : ''}[${tr}]`); if (x.g === want) ok++; else bad.push(`${i + 1}마디 ${x.t} ${tr}인데 ${x.g ? '회색' : '검정'}`); });
      console.log(`${name}: 같은 코드가 이어지는 마디 첫머리 ${ok + bad.length}곳 중 맞음 ${ok}, 틀림 ${bad.length ? bad : 0}\n  ${row.join(' ')}`);
    }
    await p.close();
  }
  console.log('오류', errors.length ? errors : '없음'); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
