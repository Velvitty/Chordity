// 코드 연주 검증: 예약된 피아노 음의 음높이를 버퍼에서 직접 추정해 정답 코드와 대조
const { chromium } = require('playwright');
const T = require('./testlib.js');
const URL = require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chord-chart.html')).href;
const [, spec] = T.cases().find(c => c[0] === 'pop 97');
const R = T.render(spec);
const beatsT = R.beats.map(b => b.t);
const changes = R.beats.filter((b, i) => i === 0 || b.chord !== R.beats[i - 1].chord).map(b => b.t);
const chordAt = t => { let k = 0; for (let i = 0; i < R.beats.length; i++) if (R.beats[i].t <= t + 1e-6) k = i; return R.beats[k].chord; };
const pc = x => ((x % 12) + 12) % 12;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__log = []; window.__bufs = []; const ids = new Map();
    window.__long = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { }
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset) {
      const b = this.buffer; let id = -1;
      if (b) { if (!ids.has(b)) { ids.set(b, window.__bufs.length); window.__bufs.push(b); } id = ids.get(b); }
      window.__log.push({ when, offset: offset || 0, len: b ? b.duration : 0, id, ct: this.context.currentTime });
      return orig.apply(this, arguments);
    };
  });
  await page.goto(URL);
  const fileBuf = require('fs').readFileSync('test-pop97.wav');
  await page.setInputFiles('#file', { name: '데모곡.wav', mimeType: 'audio/wav', buffer: fileBuf });
  await page.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  await page.waitForTimeout(2500);                       // 미리 합성 끝날 시간
  const warmLong = await page.evaluate(() => window.__long.splice(0));
  const ui = await page.evaluate(() => ({
    piano: document.getElementById('pianoBtn').getAttribute('aria-pressed'),
    sliders: [...document.querySelectorAll('.vols-wide [data-vol]')].map(i => i.dataset.vol + '=' + i.value),
    mode: document.getElementById('selPianoMode').value,
  }));
  console.log('UI', JSON.stringify(ui), ' longtasks after load (ms):', warmLong.map(x => Math.round(x)).join(','));

  // 1) '코드가 바뀔 때' 모드: 처음부터 재생 + 마디 건너뛰기(코드 중간 재시작 포함)
  await page.click('#play');
  await page.waitForTimeout(6000);
  for (let k = 0; k < 3; k++) { for (let j = 0; j < 3; j++) await page.keyboard.press('ArrowRight'); await page.waitForTimeout(3000); }
  // 코드 한가운데로 이동(파형 클릭) → 지금 코드가 곧바로 울려야 함
  const box = await page.$eval('#overview', el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const tMid = 1.2 + 16 * 4 * 60 / 97 + 1.3 * 60 / 97;   // 17마디 두 번째 박 중간쯤
  await page.mouse.click(box.x + box.w * tMid / (R.y.length / R.sr), box.y + box.h / 2);
  await page.waitForTimeout(2500);
  await page.click('#play');
  const longPlay = await page.evaluate(() => window.__long.splice(0));

  // 음높이 추정(자기상관) — 페이지 안에서
  const pitches = await page.evaluate(() => window.__bufs.map(b => {
    if (b.duration < 1 || b.duration > 10) return null;
    const d = b.getChannelData(0), sr = b.sampleRate, s0 = Math.round(0.05 * sr), N = 4096;
    let pk = 0, nan = false; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; if (v !== v) nan = true; }
    const lo = Math.floor(sr / 1100), hi = Math.ceil(sr / 30), r = new Float64Array(hi + 2);
    for (let L = lo; L <= hi + 1; L++) { let a = 0, e1 = 0, e2 = 0; for (let i = 0; i < N; i++) { const x = d[s0 + i], y = d[s0 + i + L]; a += x * y; e1 += x * x; e2 += y * y; } r[L] = a / Math.sqrt(e1 * e2 + 1e-12); }
    let M = 0; for (let L = lo + 1; L <= hi; L++) if (r[L] > M) M = r[L];
    let T0 = 0; for (let L = lo + 1; L <= hi; L++) if (r[L] >= 0.9 * M && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { T0 = L; break; }
    const den = r[T0 - 1] - 2 * r[T0] + r[T0 + 1], fr = den < 0 ? 0.5 * (r[T0 - 1] - r[T0 + 1]) / den : 0;
    const f0 = sr / (T0 + fr);
    return { f0, midi: Math.round(69 + 12 * Math.log2(f0 / 440)), cents: Math.round(100 * (69 + 12 * Math.log2(f0 / 440) - Math.round(69 + 12 * Math.log2(f0 / 440)))), peak: +pk.toFixed(3), nan, dur: +b.duration.toFixed(2) };
  }));
  const log = await page.evaluate(() => window.__log.splice(0));

  function strikesFrom(log) {
    let music = null; const groups = new Map();
    for (const s of log) {
      if (s.len > 10) { music = s; continue; }
      if (!music || !pitches[s.id]) continue;
      const t = music.offset + (s.when - music.when);
      const key = Math.round(t * 1000);
      if (!groups.has(key)) groups.set(key, { t, notes: [], restart: Math.abs(t - music.offset) < 0.08 && s.when - music.when < 0.08 });
      groups.get(key).notes.push(pitches[s.id].midi);
    }
    return [...groups.values()].sort((a, b) => a.t - b.t);
  }
  function judge(strikes, label) {
    let ok = 0, bassOk = 0, onChange = 0, restarts = 0, errs = [], bad = [];
    for (const g of strikes) {
      const notes = g.notes.slice().sort((a, b) => a - b);
      const truth = T.parseChord(chordAt(g.t + 0.05));
      const got = new Set(notes.map(pc)), want = new Set(truth.pcs);
      const same = got.size === want.size && [...want].every(x => got.has(x));
      if (same) ok++; else bad.push(g.t.toFixed(2) + 's ' + chordAt(g.t + 0.05) + ' got ' + notes.join(','));
      if (pc(notes[0]) === truth.bass) bassOk++;
      if (g.restart) { restarts++; continue; }
      const e = changes.reduce((b, x) => Math.abs(x - g.t) < Math.abs(b) ? x - g.t : b, 1e9);
      const eb = beatsT.reduce((b, x) => Math.abs(x - g.t) < Math.abs(b) ? x - g.t : b, 1e9);
      if (Math.abs(e) < 0.035) { onChange++; errs.push(e); } else errs.push(eb);
    }
    const me = errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length), mx = Math.max(0, ...errs.map(Math.abs));
    console.log(`${label}: strikes ${strikes.length} (restart ${restarts}) | chord pcs ok ${ok}/${strikes.length} | bass ok ${bassOk}/${strikes.length} | on true change ${onChange}/${strikes.length - restarts} | timing mean ${(me * 1000).toFixed(1)} max ${(mx * 1000).toFixed(1)} ms`);
    if (bad.length) console.log('   mismatches:', bad.slice(0, 5).join(' ; '));
  }
  const S1 = strikesFrom(log);
  judge(S1, 'mode change');
  console.log('   first strikes:', S1.slice(0, 7).map(g => g.t.toFixed(2) + ':' + g.notes.slice().sort((a, b) => a - b).join('/')).join('  '));
  const restartS = S1.filter(g => g.restart).map(g => g.t.toFixed(2) + 's ' + chordAt(g.t + 0.05));
  console.log('   restart strikes:', restartS.join(', '));
  const pv = pitches.filter(Boolean);
  console.log('   synthesized notes:', pv.length, ' pitch err (cent) max', Math.max(...pv.map(p => Math.abs(p.cents))), ' peak max', Math.max(...pv.map(p => p.peak)), ' NaN', pv.some(p => p.nan), ' dur', [...new Set(pv.map(p => p.dur))].join('/'));
  console.log('   longtasks during playback (ms):', longPlay.map(x => Math.round(x)).join(',') || 'none');

  // 2) '마디마다 다시' 모드
  await page.click('#adjust > summary');
  await page.selectOption('#selPianoMode', 'bar');
  await page.keyboard.press('Home'); await page.click('#play'); await page.waitForTimeout(7000); await page.click('#play');
  const S2 = strikesFrom(await page.evaluate(() => window.__log.splice(0)));
  const downs = R.beats.filter(b => b.pos % 4 === 0).map(b => b.t);
  const onDown = S2.filter(g => downs.some(d => Math.abs(d - g.t) < 0.035)).length;
  judge(S2, 'mode bar   ');
  console.log('   strikes on downbeats:', onDown, '(C in bars 1 & 2 each re-struck?)', S2.slice(0, 4).map(g => g.t.toFixed(2)).join(', '));
  // 3) '박마다'
  await page.selectOption('#selPianoMode', 'beat');
  await page.keyboard.press('Home'); await page.click('#play'); await page.waitForTimeout(4000); await page.click('#play');
  const S3 = strikesFrom(await page.evaluate(() => window.__log.splice(0)));
  judge(S3, 'mode beat  ');
  await page.selectOption('#selPianoMode', 'change');
  // 4) P 키로 끄기 → 피아노 음 없어야 함, 메트로놈은 계속
  await page.keyboard.press('Home'); await page.click('#play');
  await page.keyboard.press('KeyP'); await page.waitForTimeout(2500);
  const L4 = await page.evaluate(() => window.__log.splice(0));
  await page.click('#play');
  const pianoAfterOff = L4.filter(s => pitches[s.id] && s.when > L4.find(x => x.len > 10).when + 0.3).length;
  console.log('P off →', await page.getAttribute('#pianoBtn', 'aria-pressed'), ' piano notes scheduled after off:', pianoAfterOff, ' clicks:', L4.filter(s => s.len < 0.1).length);
  await page.keyboard.press('KeyP');
  // 5) 레이아웃
  const lay = await page.evaluate(() => ({ tp: Math.round(document.getElementById('transport').getBoundingClientRect().height), over: document.documentElement.scrollWidth - document.documentElement.clientWidth, rows: [...new Set([...document.querySelectorAll('#transport .play, #transport .vols-wide, #transport .toggles')].map(e => Math.round(e.getBoundingClientRect().top)))] }));
  console.log('desktop transport', JSON.stringify(lay));
  const mp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  mp.on('pageerror', e => errors.push('mobile: ' + e.message));
  await mp.goto(URL);
  await mp.setInputFiles('#file', { name: '데모곡.wav', mimeType: 'audio/wav', buffer: fileBuf });
  await mp.waitForSelector('#app:not([hidden])', { timeout: 90000 });
  const ml = await mp.evaluate(() => ({ tp: Math.round(document.getElementById('transport').getBoundingClientRect().height), over: document.documentElement.scrollWidth - document.documentElement.clientWidth, narrow: [...document.querySelectorAll('.vols-narrow label')].map(l => Math.round(l.getBoundingClientRect().width)) }));
  console.log('mobile transport', JSON.stringify(ml));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
