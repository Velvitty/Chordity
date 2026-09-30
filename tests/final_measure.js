const { chromium } = require('playwright');
const fs = require('fs');
function extract(src, head) { const i = src.indexOf(head); if (i < 0) return ''; let k = src.indexOf('{', i), d = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { let e = j + 1; if (src[e] === ';') e++; return src.slice(i, e); } } } }
const lib = f => { const s = fs.readFileSync(f, 'utf-8'); return ['const PIANO', 'function synthPiano(m)', 'function makeRoomIR()', 'function buildPianoChain(out)'].map(h => extract(s, h)).filter(Boolean).join('\n'); };
(async () => {
  const browser = await chromium.launch(); const page = await (await browser.newContext()).newPage(); await page.goto('about:blank');
  const r = await page.evaluate(async ({ OLD, NEW }) => {
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    async function render(code, isNew, notes, slider) {
      const sr = 48000, ctx = new OfflineAudioContext(2, sr * 6, sr);
      const L = new Function('ctx', 'clamp', 'pianoTune', code + '\nreturn { synthPiano, makeRoomIR, buildPianoChain: typeof buildPianoChain !== "undefined" ? buildPianoChain : null };')(ctx, clamp, 0);
      const pg = ctx.createGain(); pg.gain.value = slider; pg.connect(ctx.destination);
      let bus; if (isNew) bus = L.buildPianoChain(pg); else { bus = ctx.createGain(); bus.connect(pg); const cv = ctx.createConvolver(), w = ctx.createGain(); cv.buffer = L.makeRoomIR(); w.gain.value = 0.22; bus.connect(cv); cv.connect(w); w.connect(pg); }
      notes.forEach((m, i) => { const b = L.synthPiano(m), s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = i === 0 ? 0.62 : 0.5 * Math.sqrt(3 / (notes.length - 1)); const p = ctx.createStereoPanner(); p.pan.value = clamp((m - 60) / 36, -0.5, 0.5); s.connect(g); g.connect(p); p.connect(bus); s.start(0.1); });
      const buf = await ctx.startRendering(), a = buf.getChannelData(0), c = buf.getChannelData(1);
      let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]), Math.abs(c[i]));
      const rms = (s0, s1) => { let e = 0, n = 0; for (let i = Math.round((0.1 + s0) * sr); i < Math.round((0.1 + s1) * sr); i++) { e += a[i] * a[i] + c[i] * c[i]; n += 2; } return 10 * Math.log10(e / n + 1e-20); };
      const env = []; for (let i = 0; i + 2400 <= a.length; i += 2400) { let e = 0; for (let j = i; j < i + 2400; j++) e += a[j] * a[j] + c[j] * c[j]; env.push(10 * Math.log10(e / 4800 + 1e-20)); }
      let im = 0; env.forEach((v, i) => { if (v > env[im]) im = i; });
      let t10 = 0; for (let i = im; i < env.length; i++) if (env[i] < env[im] - 10) { t10 = (i - im) * 0.05; break; }
      const r01 = rms(0, 1);
      return { r01, tail12: rms(1, 2) - r01, tail23: rms(2, 3) - r01, peak: 20 * Math.log10(pk), t10 };
    }
    const out = {};
    for (const [n, notes] of [['C', [48, 60, 64, 67]], ['G7', [43, 59, 62, 65, 67]], ['Am', [45, 57, 60, 64]]])
      out[n] = { old: await render(OLD, false, notes, 0.6), neu: await render(NEW, true, notes, 0.6), neuMax: await render(NEW, true, notes, 1.0) };
    return out;
  }, { OLD: lib('ui_old.js'), NEW: lib('../src/ui.js') });
  const f = x => (x >= 0 ? '+' : '') + x.toFixed(1);
  for (const [n, v] of Object.entries(r)) console.log(`${n.padEnd(3)} 첫 1초 RMS ${v.old.r01.toFixed(1)} → ${v.neu.r01.toFixed(1)} dBFS (${f(v.neu.r01 - v.old.r01)} dB, ×${Math.pow(10, (v.neu.r01 - v.old.r01) / 20).toFixed(2)}) | 꼬리 1–2s ${f(v.neu.tail12 - v.old.tail12)} dB, 2–3s ${f(v.neu.tail23 - v.old.tail23)} dB | T10 ${v.old.t10.toFixed(2)} → ${v.neu.t10.toFixed(2)}s (×${(v.neu.t10 / v.old.t10).toFixed(2)}) | 피크 기본 ${v.neu.peak.toFixed(1)}, 최대 볼륨 ${v.neuMax.peak.toFixed(1)} dBFS`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
