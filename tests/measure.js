// 실제 앱의 합성 함수와 소리 경로를 OfflineAudioContext로 렌더링해 음량·지속을 측정
const { chromium } = require('playwright');
const fs = require('fs');
function extract(src, head) {           // 함수/객체 선언을 중괄호 짝으로 잘라냄
  const i = src.indexOf(head); if (i < 0) return '';
  let k = src.indexOf('{', i), d = 0;
  for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { let e = j + 1; if (src[e] === ';') e++; return src.slice(i, e); } } }
}
function lib(file) {
  const s = fs.readFileSync(file, 'utf-8');
  return ['const PIANO', 'function synthPiano(m)', 'function makeRoomIR()', 'function buildPianoChain(out)'].map(h => extract(s, h)).join('\n');
}
const OLD = lib('ui_old.js'), NEW = lib('../src/ui.js');
const makeup = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto('about:blank');
  const out = await page.evaluate(async ({ OLD, NEW, makeup }) => {
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    async function render(code, isNew, notes, slider, holdSec, withMaster) {
      const sr = 48000, dur = 7;
      const ctx = new OfflineAudioContext(2, sr * dur, sr);
      const pianoTune = 0;
      const L = new Function('ctx', 'clamp', 'pianoTune', code + '\nreturn { synthPiano, makeRoomIR, PIANO: typeof PIANO !== "undefined" ? PIANO : null, buildPianoChain: typeof buildPianoChain !== "undefined" ? buildPianoChain : null };')(ctx, clamp, pianoTune);
      if (isNew && makeup) L.PIANO.makeup = +makeup;
      let dest = ctx.destination;
      if (withMaster) { const m = ctx.createDynamicsCompressor(); m.threshold.value = -1; m.knee.value = 0; m.ratio.value = 20; m.attack.value = 0.001; m.release.value = 0.1; m.connect(ctx.destination); dest = m; }
      const pg = ctx.createGain(); pg.gain.value = slider; pg.connect(dest);
      let bus;
      if (isNew) bus = L.buildPianoChain(pg);
      else { bus = ctx.createGain(); bus.connect(pg); const cv = ctx.createConvolver(), w = ctx.createGain(); cv.buffer = L.makeRoomIR(); w.gain.value = 0.22; bus.connect(cv); cv.connect(w); w.connect(pg); }
      const rel = isNew ? L.PIANO.release : 0.06, t0 = 0.1, endAt = t0 + holdSec;
      notes.forEach((m, i) => {
        const b = L.synthPiano(m), src = ctx.createBufferSource(); src.buffer = b;
        const g = ctx.createGain(), vel = i === 0 ? 0.62 : 0.5 * Math.sqrt(3 / (notes.length - 1)); g.gain.value = vel;
        const p = ctx.createStereoPanner(); p.pan.value = clamp((m - 60) / 36, -0.5, 0.5);
        src.connect(g); g.connect(p); p.connect(bus); src.start(t0);
        if (endAt < t0 + b.duration) { g.gain.setValueAtTime(vel, endAt); g.gain.setTargetAtTime(0, endAt, rel); }
      });
      const buf = await ctx.startRendering();
      const a = buf.getChannelData(0), c = buf.getChannelData(1), W = Math.round(0.05 * sr);
      let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]), Math.abs(c[i]));
      const env = []; for (let i = 0; i + W <= a.length; i += W) { let e = 0; for (let j = i; j < i + W; j++) e += a[j] * a[j] + c[j] * c[j]; env.push(10 * Math.log10(e / (2 * W) + 1e-20)); }
      let im = 0; env.forEach((v, i) => { if (v > env[im]) im = i; });
      const tDrop = d => { for (let i = im; i < env.length; i++) if (env[i] < env[im] - d) return +((i - im) * 0.05).toFixed(2); return '>' + ((env.length - im) * 0.05).toFixed(1); };
      const rms = (s0, s1) => { let e = 0, n = 0; for (let i = Math.round((t0 + s0) * sr); i < Math.round((t0 + s1) * sr); i++) { e += a[i] * a[i] + c[i] * c[i]; n += 2; } return +(10 * Math.log10(e / n + 1e-20)).toFixed(1); };
      return { rms01: rms(0, 1), rms12: rms(1, 2), rms23: rms(2, 3), peak: +(20 * Math.log10(pk)).toFixed(1), T10: tDrop(10), T20: tDrop(20), T30: tDrop(30) };
    }
    const chords = { 'C (48/60/64/67)': [48, 60, 64, 67], 'G7 (43/59/62/65/67)': [43, 59, 62, 65, 67] };
    const res = [];
    for (const [name, notes] of Object.entries(chords)) {
      for (const [ver, code, isNew] of [['이전', OLD, false], ['새로', NEW, true]]) {
        res.push({ chord: name, ver, slider: 0.6, ...(await render(code, isNew, notes, 0.6, 6.5, false)) });
        const hi = await render(code, isNew, notes, 1.0, 6.5, false);
        res.push({ chord: name, ver, slider: 1.0, peak_pre_master: hi.peak, rms01: hi.rms01 });
      }
    }
    return res;
  }, { OLD, NEW, makeup });
  for (const r of out) console.log(JSON.stringify(r));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
