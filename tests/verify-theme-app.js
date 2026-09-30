// 실제 앱·도움말의 테마 선택 막대 UI 검증
const { chromium } = require('playwright');
const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PAGES = [['앱', require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'chordity.html')).href], ['도움말', require('url').pathToFileURL(require('path').resolve(__dirname, '..', 'information.html')).href]];
(async () => {
  const b = await chromium.launch(); let pass = 0, fail = 0; const out = [];
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
  const measure = p => p.evaluate(() => {
    const seg = document.getElementById('themeSeg'), th = seg.querySelector('.thumb'), opts = [...seg.querySelectorAll('.opt')], cs = e => getComputedStyle(e);
    const sel = opts.find(o => o.getAttribute('aria-checked') === 'true'), un = opts.find(o => o !== sel);
    const tr = th.getBoundingClientRect(), sr = sel.getBoundingClientRect(), sep = parseFloat(cs(sel).borderLeftWidth) || 0;
    const off = Math.max(...opts.map(o => { const br = o.getBoundingClientRect(), s2 = parseFloat(cs(o).borderLeftWidth) || 0; let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
      o.querySelectorAll('svg *').forEach(n => { const q = n.getBoundingClientRect(); L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); });
      return Math.max(Math.abs((L + R) / 2 - (br.left + s2 + (br.width - s2) / 2)), Math.abs((T + B) / 2 - (br.top + br.height / 2))); }));
    const bodyBg = cs(document.body).backgroundColor, rootBg = cs(document.documentElement).backgroundColor, bg = bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : rootBg;
    const hdr = seg.parentElement.getBoundingClientRect(), brand = document.querySelector('.brand').getBoundingClientRect(), segR = seg.getBoundingClientRect();
    return { sel: sel.dataset.themeOpt, theme: document.documentElement.dataset.theme || '', bg, thumb: cs(th).backgroundColor, selIcon: cs(sel).color, unIcon: cs(un).color,
      align: Math.max(Math.abs(tr.left - (sr.left + sep)), Math.abs(tr.right - sr.right), Math.abs(tr.top - sr.top), Math.abs(tr.bottom - sr.bottom)), off,
      overflow: document.documentElement.scrollWidth - innerWidth, inView: segR.right <= innerWidth + 0.5 && segR.left >= 0, sameRow: Math.abs((segR.top + segR.bottom) / 2 - (brand.top + brand.bottom) / 2) < 8,
      saved: (() => { try { return (JSON.parse(localStorage.getItem('chordity-prefs-v1') || '{}').theme) ?? '(없음)'; } catch (e) { return '?'; } })() };
  });
  for (const [pname, url] of PAGES) for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 800 }, colorScheme: scheme }), p = await ctx.newPage();
    await p.goto(url); await p.waitForTimeout(300);
    for (const v of ['', 'light', 'dark', '']) {
      await p.click(`#themeSeg .opt[data-theme-opt="${v}"]`); await p.waitForTimeout(350);
      const r = await measure(p), eff = v || scheme, tag = `${pname} 시스템 ${scheme === 'light' ? '밝게' : '어둡게'}·${v === '' ? '시스템' : v === 'light' ? '밝게' : '어둡게'}`;
      const c1 = cr(r.thumb, r.bg), c2 = cr(r.selIcon, r.thumb), c3 = cr(r.unIcon, r.bg);
      ok(r.sel === v && r.theme === v, `${tag}: 선택 ${r.sel}, 적용 ${r.theme}`);
      ok((eff === 'dark') === (lum(r.bg) < 0.2), `${tag}: 배경 ${r.bg}가 ${eff} 테마가 아님`);
      ok(r.saved === v || (v === '' && r.saved === '(없음)'), `${tag}: 저장값 ${r.saved}`);   // 시스템은 '고정한 테마 없음'
      ok(c1 >= 3 && c2 >= 3 && c3 >= 3, `${tag}: 명암비 ${c1.toFixed(1)}/${c2.toFixed(1)}/${c3.toFixed(1)}`);
      ok(r.align <= 0.5 && r.off <= 0.6, `${tag}: 바탕 어긋남 ${r.align.toFixed(2)}px, 아이콘 중심 오차 ${r.off.toFixed(2)}px`);
      out.push(`${tag}: 명암 ${c1.toFixed(1)}:1, 바탕 어긋남 ${r.align.toFixed(2)}px, 아이콘 오차 ${r.off.toFixed(2)}px`);
    }
    await p.click('#themeSeg .opt[data-theme-opt="dark"]'); await p.waitForTimeout(200); await p.reload(); await p.waitForTimeout(300);
    const rr = await measure(p); ok(rr.sel === 'dark' && rr.theme === 'dark', `${pname}: 새로 고친 뒤 선택 ${rr.sel}`);
    await p.click('#themeSeg .opt[data-theme-opt=""]'); await p.waitForTimeout(200);
    await p.emulateMedia({ colorScheme: scheme === 'light' ? 'dark' : 'light' }); await p.waitForTimeout(250);
    const rs = await measure(p); ok((scheme === 'light') === (lum(rs.bg) < 0.2), `${pname}: 시스템 칸일 때 기기 테마를 바꾸면 따라감(${rs.bg})`);
    await ctx.close();
  }
  // 움직임 시간(앱): 시스템 → 밝게(한 칸), 밝게 → 시스템을 거쳐 어둡게(두 칸)
  const ctx = await b.newContext({ viewport: { width: 1180, height: 800 }, colorScheme: 'light' }), p = await ctx.newPage();
  await p.goto(PAGES[0][1]); await p.waitForTimeout(300);
  const timeMove = async v => p.evaluate(async vv => {
    const th = document.querySelector('#themeSeg .thumb'), X = () => new DOMMatrix(getComputedStyle(th).transform).m41;
    const target = document.querySelector(`#themeSeg .opt[data-theme-opt="${vv}"]`);
    const x0 = X(); target.click(); const t0 = performance.now(); let last = X(), tEnd = null;
    await new Promise(res => { const f = () => { const x = X(); if (Math.abs(x - last) > 0.01) tEnd = performance.now(); last = x; if (performance.now() - t0 < 400) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { ms: tEnd ? Math.round(tEnd - t0) : 0, moved: Math.abs(last - x0).toFixed(1) };
  }, v);
  const m1 = await timeMove('light'); await p.waitForTimeout(150); const m2 = await timeMove('');
  await p.waitForTimeout(150); const m3 = await timeMove('dark'); await p.waitForTimeout(150); const m4 = await timeMove('');
  ok(m1.ms >= 50 && m1.ms <= 120, `한 칸 이동 시간 ${m1.ms}ms`); ok(m4.ms >= 75 && m4.ms <= 150, `두 칸 이동 시간 ${m4.ms}ms`);
  await p.focus('#themeSeg .opt[aria-checked="true"]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200);
  const kb = await p.evaluate(() => [document.querySelector('#themeSeg .opt[aria-checked="true"]').dataset.themeOpt, document.activeElement.dataset.themeOpt]);
  ok(kb[0] === 'light' && kb[1] === 'light', `방향키: 선택 ${kb[0]}, 포커스 ${kb[1]}`);
  await p.emulateMedia({ reducedMotion: 'reduce' }); const m5 = await timeMove('dark');
  ok(m5.ms <= 20, `동작 줄이기에서 이동 시간 ${m5.ms}ms`);
  out.push(`움직임: 한 칸 ${m1.ms}ms, 두 칸 ${m4.ms}ms(요청 80ms·104ms), 동작 줄이기 ${m5.ms}ms | 방향키 이동 ${kb.join('/')}`);
  await ctx.close();
  // 모바일 머리 막대
  for (const [pname, url] of PAGES) for (const w of [360, 375, 390]) {
    const c2 = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2 }), q = await c2.newPage(); await q.goto(url); await q.waitForTimeout(300);
    const r = await measure(q); ok(r.overflow <= 0 && r.inView && r.sameRow, `${pname} ${w}px: 넘침 ${r.overflow}, 화면 안 ${r.inView}, 한 줄 ${r.sameRow}`);
    if (w === 360) await q.screenshot({ path: `${require('os').tmpdir()}/hdr-${pname === '앱' ? 'app' : 'info'}-360.png`, clip: { x: 0, y: 0, width: 360, height: 70 } });
    out.push(`${pname} ${w}px: 가로 넘침 ${r.overflow}px, 막대 화면 안 ${r.inView}, 로고와 한 줄 ${r.sameRow}`);
    await c2.close();
  }
  for (const [pname, url] of PAGES) for (const scheme of ['light', 'dark']) { const c3 = await b.newContext({ viewport: { width: 1180, height: 800 }, colorScheme: scheme }), q = await c3.newPage(); await q.goto(url); await q.waitForTimeout(300); await q.screenshot({ path: `${require('os').tmpdir()}/hdr-${pname === '앱' ? 'app' : 'info'}-${scheme}.png`, clip: { x: 0, y: 0, width: 1180, height: 70 } }); await c3.close(); }
  console.log(out.join('\n')); console.log(`UI 검증: 통과 ${pass}, 실패 ${fail}`); await b.close();
  if (fail) process.exitCode = 1;   // 실패하면 종료 코드 1(npm 사슬이 멈춤)
})().catch(e => { console.error('FAIL', e); process.exit(1); });
