// v369 · 🐸 PRUEBA: hucha de 50 € en MEMECOINS de Bitvavo (solo datos, nunca toca dinero)
// Velas de 1 h de los últimos 2 años de las memecoins que cotizan en Bitvavo. Métodos agresivos de seguir subidas (sin apalancamiento):
//   A) RUPTURA: cierra por encima del máximo de N horas, con volumen ≥ m veces el normal y subida en 24 h ≥ r0
//   B) IMPULSO: ha subido ≥ th en L horas y está por encima de su media de E horas
// Salidas: stop fijo, stop que persigue el máximo, o tiempo máximo. Comisión 0,25 % por lado + diferencial 0,3 % ida y vuelta.
// Reglas de la hucha: empieza con 50 €; si llega a 100 €, lo que pase de 50 € se pasa a la Tortuga; si baja a 25 €, se para.
// Examen: gana en toda la historia, no pierde en ≥ 60 % de 24 tramos al azar (la mitad acaban hoy), no pierde > 10 % en los últimos
// 6 meses y sus vecinos (parámetros parecidos) también ganan en ≥ 60 %.
const MEMES = ["PEPE", "SHIB", "DOGE", "BONK", "WIF", "FLOKI", "BOME", "TURBO", "BRETT", "POPCAT", "MEW", "NEIRO", "PENGU", "TRUMP", "PNUT", "GOAT", "FARTCOIN", "MOG", "SPX", "DOGS", "MEME", "PEOPLE", "ACT", "MOODENG", "BABYDOGE", "CAT", "SNEK", "DEGEN", "TOSHI", "SUNDOG", "GIGA", "AI16Z", "MYRO", "SLERF", "WEN", "ELON", "LADYS", "BAN", "CHILLGUY", "HIPPO", "SPX6900", "VINE", "KEKIUS"];
const SIN_FRENO = process.env.SIN_FRENO === "1", FEE = 0.0025, SPREAD = 0.003, HORAS = 2 * 365 * 24, H = 3600e3;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) { for (let t = 0; t < 5; t++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); if (r.status === 429) await wait(3000 * (t + 1)); } catch (e) { await wait(1500 * (t + 1)); } } return null; }
async function datos() {
  const mk = (await get("https://api.bitvavo.com/v2/markets")) || [], hay = new Set(mk.filter((m) => m.status === "trading" && /-EUR$/.test(m.market)).map((m) => m.market.split("-")[0]));
  const lista = MEMES.filter((c) => hay.has(c)); console.log(`Memecoins en Bitvavo: ${lista.length} · ${lista.join(", ")}`);
  const fin = Math.floor(Date.now() / H) * H, ini = fin - HORAS * H, T = []; for (let t = ini; t < fin; t += H) T.push(t);
  const idx = new Map(T.map((t, i) => [t, i])), M = {};
  for (const c of lista) { const d = { O: new Float64Array(T.length).fill(NaN), Hi: new Float64Array(T.length).fill(NaN), Lo: new Float64Array(T.length).fill(NaN), C: new Float64Array(T.length).fill(NaN), V: new Float64Array(T.length).fill(0) };
    let end = fin, n = 0; while (end > ini) { const st = Math.max(ini, end - 1440 * H); const j = await get(`https://api.bitvavo.com/v2/${c}-EUR/candles?interval=1h&limit=1440&start=${st}&end=${end}`); if (!Array.isArray(j)) break;
      for (const k of j) { const i = idx.get(+k[0]); if (i == null) continue; d.O[i] = +k[1]; d.Hi[i] = +k[2]; d.Lo[i] = +k[3]; d.C[i] = +k[4]; d.V[i] = +k[5] * +k[4]; n++; } if (!j.length) break; end = st; await wait(80); }
    // horas sin operaciones: precio anterior, volumen 0
    let last = NaN; for (let i = 0; i < T.length; i++) { if (Number.isFinite(d.C[i])) last = d.C[i]; else if (Number.isFinite(last)) { d.O[i] = d.Hi[i] = d.Lo[i] = d.C[i] = last; } }
    if (n > 24 * 60) { M[c] = d; console.log(`  ${c}: ${n} velas (desde ${new Date(T[T.findIndex((_, i) => Number.isFinite(d.C[i]))]).toISOString().slice(0, 10)})`); } }
  // BTC-EUR solo como filtro de mercado (no se opera)
  const B = new Float64Array(T.length).fill(NaN); { let end = fin; while (end > ini) { const st = Math.max(ini, end - 1440 * H); const j = await get(`https://api.bitvavo.com/v2/BTC-EUR/candles?interval=1h&limit=1440&start=${st}&end=${end}`); if (!Array.isArray(j) || !j.length) break; for (const k of j) { const i = idx.get(+k[0]); if (i != null) B[i] = +k[4]; } end = st; await wait(80); } let l = NaN; for (let i = 0; i < T.length; i++) { if (Number.isFinite(B[i])) l = B[i]; else B[i] = l; } }
  return { T, M, U: Object.keys(M), B };
}
const ema = (C, n) => { const o = new Float64Array(C.length).fill(NaN), k = 2 / (n + 1); let e = NaN; for (let i = 0; i < C.length; i++) { if (!Number.isFinite(C[i])) continue; e = Number.isFinite(e) ? e + k * (C[i] - e) : C[i]; o[i] = e; } return o; };
function senal(D, g) { // Float32Array por cripto: fuerza de la señal (0 = nada)
  const out = {}; for (const c of D.U) { const d = D.M[c], N = d.C.length, s = new Float32Array(N);
    if (g.fam === "A") { const vm = new Float64Array(N); let sv = 0; for (let i = 0; i < N; i++) { sv += d.V[i]; if (i >= 48) sv -= d.V[i - 48]; vm[i] = i >= 48 ? sv / 48 : NaN; }
      for (let i = Math.max(g.N, 49); i < N; i++) { const c0 = d.C[i]; if (!Number.isFinite(c0) || !Number.isFinite(d.C[i - 24]) || !(d.V[i] > 0)) continue; let mx = -Infinity; for (let k = i - g.N; k < i; k++) if (d.Hi[k] > mx) mx = d.Hi[k];
        const r24 = c0 / d.C[i - 24] - 1; if (c0 > mx && (g.m === 0 || d.V[i] > g.m * vm[i - 1]) && r24 >= g.r0) s[i] = r24 + 0.001; } }
    else { const e = ema(d.C, g.E); for (let i = g.L; i < N; i++) { const c0 = d.C[i], c1 = d.C[i - g.L]; if (!Number.isFinite(c0) || !Number.isFinite(c1) || !(d.V[i] > 0)) continue; const r = c0 / c1 - 1; if (r >= g.th && c0 > e[i]) s[i] = r; } }
    out[c] = s; }
  // por hora: criptos con señal, de más fuerte a menos (se calcula una vez)
  const LS = new Array(D.T.length).fill(null); for (let i = 0; i < D.T.length; i++) { let l = null; for (const c of D.U) if (out[c][i] > 0) (l = l || []).push(c); if (l) LS[i] = l.sort((a, b) => out[b][i] - out[a][i]); }
  out.__LS = LS; return out;
}
// simula la hucha entre las horas i0 e i1
const BEMA = new Map();
function hucha(D, S, g, i0, i1) {
  const fb = g.fb || 0, cd = g.cd || 0; let be = null; if (fb) { if (!BEMA.has(fb)) BEMA.set(fb, ema(D.B, fb)); be = BEMA.get(fb); } let frio = -1;
  let cash = 50, banco = 0, pos = [], pico = 50, dd = 0, n = 0, gan = 0, parada = false; const U = D.U;
  const eqDe = (i) => cash + pos.reduce((a, p) => a + p.q * (Number.isFinite(D.M[p.c].C[i]) ? D.M[p.c].C[i] : p.px), 0);
  for (let i = i0; i <= i1; i++) {
    // salidas
    for (const p of pos.slice()) { const d = D.M[p.c], lo = d.Lo[i], hi = d.Hi[i], op = d.O[i]; if (!Number.isFinite(lo)) continue; let sal = null;
      const st = p.px * (1 - g.sl), tr = g.tr < 1 ? p.pk * (1 - g.tr) : -Infinity, lim = Math.max(st, tr);
      if (lo <= lim) sal = Math.min(op, lim); else if (i - p.i >= g.Hh || i === i1) sal = d.C[i];
      if (sal != null) { const v = p.q * sal * (1 - SPREAD / 2) * (1 - FEE); cash += v; n++; if (v > p.coste) gan++; else if (cd) frio = i + cd; pos = pos.filter((x) => x !== p); } else if (hi > p.pk) p.pk = hi; }
    const eq = eqDe(i); if (eq > pico) pico = eq; dd = Math.max(dd, 1 - eq / pico);
    if (!parada && !SIN_FRENO && eq <= 25) { for (const p of pos) cash += p.q * D.M[p.c].C[i] * (1 - SPREAD / 2) * (1 - FEE); pos = []; parada = true; }
    if (!parada && eq >= 100 && cash > 0) { const x = Math.min(cash, eq - 50); cash -= x; banco += x; pico = eqDe(i); }   // a la Tortuga
    if (parada || i === i1) continue;
    // entradas
    if (i < frio || (be && !(D.B[i] > be[i]))) continue;
    if (pos.length < g.k && S.__LS[i]) { const cands = S.__LS[i].filter((c) => !pos.some((p) => p.c === c));
      for (const c of cands) { if (pos.length >= g.k) break; const px = D.M[c].C[i] * (1 + SPREAD / 2), gasta = Math.min(cash, eq * g.f); if (gasta < 5) break; cash -= gasta; pos.push({ c, i, px, pk: px, q: (gasta * (1 - FEE)) / px, coste: gasta }); } }
  }
  const fin = cash + banco; return { ret: fin / 50 - 1, banco, dd, n, aciertos: n ? gan / n : 0, parada };
}
async function main() {
  const D = await datos(), n = D.T.length; if (D.U.length < 4) { console.log("Pocas memecoins con datos"); return; }
  const G = []; for (const N of [12, 24, 48, 72]) for (const m of [0, 2, 3]) for (const r0 of [0, 0.05, 0.1]) G.push({ fam: "A", N, m, r0 });
  for (const L of [24, 72, 168]) for (const th of [0.1, 0.2, 0.4]) for (const E of [50, 200]) G.push({ fam: "B", L, th, E });
  const X = []; for (const sl of [0.08, 0.12, 0.2]) for (const tr of [0.1, 0.15, 0.25, 1]) for (const Hh of [24, 72, 240]) for (const f of [0.5, 1]) for (const k of [1, 2]) X.push({ sl, tr, Hh, f, k });
  const TR = []; for (let q = 0; q < 24; q++) { const len = Math.round((90 + Math.random() * 275) * 24), fin = q < 12 ? n - 1 : 200 + len + Math.floor(Math.random() * Math.max(1, n - 1 - 200 - len)); TR.push([Math.max(200, fin - len), fin]); }
  const res = []; let k = 0;
  for (const g of G) { const S = senal(D, g); for (const x of X) { const p = { ...g, ...x }, a = hucha(D, S, p, 200, n - 1); k++; const r = { p, a };
      if (a.ret > 0 && a.n >= 20) { const ws = TR.map(([i0, i1]) => hucha(D, S, p, i0, i1)), rec = hucha(D, S, p, n - 1 - 182 * 24, n - 1); r.g = ws.filter((w) => w.ret >= 0).length / ws.length; r.rec = rec.ret; r.med = ws.map((w) => w.ret).sort((u, v) => u - v)[Math.floor(ws.length / 2)]; }
      res.push(r); } }
  const key = (p) => JSON.stringify(p), byK = new Map(res.map((r) => [key(r.p), r]));
  const vecinos = (p) => { const out = []; for (const r of res) { const q = r.p; if (q.fam !== p.fam) continue; let dif = 0; for (const z of Object.keys(p)) if (p[z] !== q[z]) dif++; if (dif === 1) out.push(r); } return out; };
  const pasa = res.filter((r) => r.g != null && r.g >= 0.6 && r.rec > -0.1).map((r) => { const v = vecinos(r.p); r.vec = v.length ? v.filter((z) => z.a.ret > 0).length / v.length : 0; return r; }).filter((r) => r.vec >= 0.6);
  const ord = (A) => A.sort((u, v) => Math.round(v.a.ret * 1000) - Math.round(u.a.ret * 1000) || u.a.dd - v.a.dd);
  const pc = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(0) + " %", desc = (p) => (p.fam === "A" ? `ruptura de ${p.N} h${p.m ? `, volumen ×${p.m}` : ""}${p.r0 ? `, +${p.r0 * 100} % en 24 h` : ""}` : `impulso +${p.th * 100} % en ${p.L} h sobre media ${p.E}`) + ` · stop −${p.sl * 100} %${p.tr < 1 ? ` · persigue −${p.tr * 100} %` : ""} · máx ${p.Hh} h · ${p.f === 1 ? "todo" : "la mitad"} por operación · hasta ${p.k} a la vez`;
  const ganan = res.filter((r) => r.a.ret > 0).length;
  if (SIN_FRENO) console.log("\n⚠️ SIN el freno de 25 €: aguanta hasta el final");
  console.log(`\nCombinaciones probadas: ${k} · ganan en la historia completa: ${ganan} (${Math.round((ganan / k) * 100)} %) · APRUEBAN el examen: ${pasa.length}`);
  for (const r of ord(pasa).slice(0, 8)) console.log(`✅ ${desc(r.p)}\n   historia ${pc(r.a.ret)} (a la Tortuga ${r.a.banco.toFixed(0)} €) · peor caída −${(r.a.dd * 100).toFixed(0)} % · ${r.a.n} operaciones · aciertos ${Math.round(r.a.aciertos * 100)} % · no pierde en ${Math.round(r.g * 100)} % de los tramos (tramo típico ${pc(r.med)}) · últimos 6 meses ${pc(r.rec)} · vecinos ${Math.round(r.vec * 100)} %${r.a.parada ? " · ⚠️ llegó a pararse" : ""}`);
  if (!pasa.length) for (const r of ord(res.filter((r) => r.g != null)).slice(0, 6)) console.log(`· ${desc(r.p)}\n   historia ${pc(r.a.ret)} · caída −${(r.a.dd * 100).toFixed(0)} % · ${r.a.n} op · no pierde en ${Math.round(r.g * 100)} % de los tramos · últimos 6 meses ${pc(r.rec)}${r.a.parada ? " · ⚠️ se paró" : ""}`);
  const paradas0 = res.filter((r) => r.a.parada).length;
  // v369 · 🤖 la IA estudia las que ganaron y propone variantes (mismas piezas + filtro de BTC, enfriamiento tras perder); se examinan igual
  if (process.env.GEMINI_KEY) try {
    const top = ord(res.filter((r) => r.a.ret > 0)).slice(0, 6).map((r) => ({ params: r.p, historia: +(r.a.ret * 100).toFixed(0), caida: +(r.a.dd * 100).toFixed(0), operaciones: r.a.n, aciertos: Math.round(r.a.aciertos * 100), no_pierde_en_tramos: r.g != null ? Math.round(r.g * 100) : null, ult6m: r.rec != null ? +(r.rec * 100).toFixed(0) : null, se_paro: r.a.parada }));
    const P = `Eres un trader cuantitativo. Hucha de 50 € en memecoins de Bitvavo (29 monedas, velas de 1 h, 2 años, solo compras, sin apalancamiento, comisión 0,25 % por lado + 0,3 % de diferencial ida y vuelta). Si la hucha llega a 100 € lo que pase de 50 € se guarda; si baja a 25 € se para.
De ${k} combinaciones, solo ${ganan} ganaron en la historia completa y el ${Math.round((paradas0 / k) * 100)} % acabaron parándose en 25 €. Las que ganaron (parecen suerte: luego caen fuerte):
${JSON.stringify(top)}
Estudia por qué ganaron y por qué fallan, y propone 24 VARIANTES para que sean robustas (que no pierdan en ≥ 60 % de tramos al azar de 3-12 meses ni en los últimos 6 meses).
Piezas permitidas: fam "A" (ruptura: N horas 6-240, m volumen 0-6, r0 subida mínima en 24 h 0-0.5) o fam "B" (impulso: L horas 6-336, th 0.03-1, E media 10-400); salidas: sl stop 0.03-0.4, tr persecución 0.05-0.5 o 1 = sin persecución, Hh horas máximas 4-480, f fracción por operación 0.2-1, k posiciones 1-3; filtros NUEVOS: fb = solo comprar si BTC está por encima de su media de fb horas (0 = sin filtro, o 24-500), cd = horas sin comprar tras una pérdida (0-168).
Responde SOLO JSON: {"analisis":"3-4 frases en castellano","variantes":[{"fam":"A","N":..,"m":..,"r0":..,"sl":..,"tr":..,"Hh":..,"f":..,"k":..,"fb":..,"cd":..}, ...]}`;
    const ml = await (await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": process.env.GEMINI_KEY } })).json();
    const MS = (ml.models || []).map((m) => m.name.replace("models/", "")).filter((n) => /gemini-[\d.]+-flash$/.test(n)).sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
    let J = null; for (const mo of [...MS.filter((x) => /3\.5/.test(x)), ...MS]) { for (let t = 0; t < 2 && !J; t++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mo}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_KEY }, signal: AbortSignal.timeout(150000), body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: P }] }], generationConfig: { responseMimeType: "application/json" } }) }); if (r.ok) { const j = await r.json(); J = JSON.parse(j.candidates[0].content.parts.map((x) => x.text).join("")); console.log(`\n🤖 IA (${mo})`); } else await wait(8000); } catch (e) {} } if (J) break; }
    if (J) { console.log("🤖 Análisis: " + String(J.analisis || "").slice(0, 800));
      const cl = (x, a, b) => Math.min(b, Math.max(a, +x || 0)), V = (J.variantes || []).slice(0, 30).map((v) => v.fam === "B" ? { fam: "B", L: Math.round(cl(v.L, 6, 336)), th: cl(v.th, 0.03, 1), E: Math.round(cl(v.E, 10, 400)) } : { fam: "A", N: Math.round(cl(v.N, 6, 240)), m: cl(v.m, 0, 6), r0: cl(v.r0, 0, 0.5) }).map((g, i) => { const v = J.variantes[i]; return { ...g, sl: cl(v.sl, 0.03, 0.4), tr: +v.tr >= 1 ? 1 : cl(v.tr, 0.05, 0.5), Hh: Math.round(cl(v.Hh, 4, 480)), f: cl(v.f, 0.2, 1), k: Math.round(cl(v.k, 1, 3)), fb: +v.fb ? Math.round(cl(v.fb, 24, 500)) : 0, cd: Math.round(cl(v.cd, 0, 168)) }; });
      const RI = []; for (const p of V) { const S = senal(D, p), a = hucha(D, S, p, 200, n - 1), ws = TR.map(([i0, i1]) => hucha(D, S, p, i0, i1)), rec = hucha(D, S, p, n - 1 - 182 * 24, n - 1); RI.push({ p, a, g: ws.filter((w) => w.ret >= 0).length / ws.length, rec: rec.ret }); }
      const okI = RI.filter((r) => r.a.ret > 0 && r.g >= 0.6 && r.rec > -0.1); console.log(`🤖 Variantes de la IA: ${RI.length} · ganan en la historia: ${RI.filter((r) => r.a.ret > 0).length} · APRUEBAN: ${okI.length}`);
      for (const r of ord(RI).slice(0, 8)) console.log(`${okI.includes(r) ? "✅" : "·"} ${desc(r.p)}${r.p.fb ? ` · solo con BTC sobre su media de ${r.p.fb} h` : ""}${r.p.cd ? ` · ${r.p.cd} h sin comprar tras perder` : ""}\n   historia ${pc(r.a.ret)} · caída −${(r.a.dd * 100).toFixed(0)} % · ${r.a.n} op · no pierde en ${Math.round(r.g * 100)} % de los tramos · últimos 6 meses ${pc(r.rec)}${r.a.parada ? " · ⚠️ se paró" : ""}`); }
    else console.log("🤖 La IA no respondió");
  } catch (e) { console.log("🤖 IA: " + e.message); }
  const paradas = res.filter((r) => r.a.parada).length; console.log(`\nSe quedaron en 25 € y se pararon: ${paradas} de ${k} (${Math.round((paradas / k) * 100)} %)`);
}
main().catch((e) => { console.log("error:", e.message); process.exit(1); });
