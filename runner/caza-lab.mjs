// v361 · 🧠 LABORATORIO DE CRIPTO DE MUCHAS OPERACIONES (Hyperliquid, solo datos). Aprende SOLO, sin ninguna IA externa:
//  · MEMORIA: guarda lo que ha probado (y cómo le fue) en caza-lab.json, en su propia rama; nunca repite una combinación ya probada.
//  · PESOS POR FAMILIA (aprendizaje por refuerzo sencillo, «bandido»): las familias de señales que más se acercan a aprobar se prueban más.
//  · MUTACIONES: cambia un poco las mejores «casi» (otro filtro, otra salida, otro stop, otra señal de confirmación).
//  · COMBINACIONES DE 2 SEÑALES: una señal decide y otra la confirma (las dos en el mismo sentido en las últimas horas).
//  · IDEAS NUEVAS: lee cada vez fuentes públicas de estudios de trading (arXiv, Alpha Architect, Quantpedia) y, por palabras clave, sube el
//    peso de las familias de las que más se publica.
// Examen (v365): ≥ 4 operaciones al día (v455: o ~2 por semana si es un método LENTO, de 2 a 7 días por operación); gana en la historia completa hasta hoy, en los últimos 6 meses y en ≥60 % de 16 tramos al azar (la mitad acaban hoy), con
// comisión + deslizamiento + financiación reales de Hyperliquid, caída < 30 % y factor de beneficio ≥ 1,15 / 1,10. v458: y al menos una de 2 variantes vecinas también gana.
import { datos, cartera } from "./caza-hl.mjs";
import { senales, FILTROS } from "./caza-hl2.mjs";
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
const env = (k) => (process.env[k] || "").trim(), REPO = env("GITHUB_REPOSITORY") || "CarlosGomezS/Botrading", TOKEN = env("GITHUB_TOKEN");
const RAMA = "caza-lab", ARCH = "caza-lab.json", PRUEBAS = +env("CAZA_N") || 1500;
const FUENTES = [["arXiv (finanzas cuantitativas)", "https://export.arxiv.org/api/query?search_query=cat:q-fin.TR+OR+cat:q-fin.PM&sortBy=submittedDate&sortOrder=descending&max_results=40"], ["Alpha Architect", "https://alphaarchitect.com/feed/"], ["Quantpedia", "https://quantpedia.com/feed/"]];
const CLAVES = { "RSI rebote": /mean.?revers|reversal|oversold|overbought|\bRSI\b/i, "Bollinger rebote": /mean.?revers|bollinger|reversal/i, "Bollinger ruptura": /breakout|bollinger|squeeze/i, "Donchian ruptura": /breakout|trend.?follow|donchian|turtle/i, "Cruce de medias": /moving.?average|trend.?follow|crossover/i, MACD: /\bMACD\b|trend.?follow|momentum/i, "VWAP rebote": /\bVWAP\b|intraday|execution/i, "Ruptura de volatilidad": /volatility|breakout|range/i, "Volatilidad, contra": /volatility|reversal/i, "Pico de volumen": /volume|order.?flow|liquidity/i, "Pico de volumen, contra": /volume|liquidity|reversal/i, "Sesión (hora UTC), a favor": /intraday|time.?of.?day|seasonal|overnight|session/i, "Sesión (hora UTC), contra": /intraday|time.?of.?day|seasonal|overnight|reversal/i, Supertrend: /trend.?follow|momentum|ATR/i, "Arbitraje contra BTC": /pairs|stat.*arb|cointegrat|relative.?value|cross.?section/i, "Financiación extrema, contra": /funding|carry|basis|perpetual|futures/i };
const sh = (c) => execSync(c, { stdio: "pipe", encoding: "utf8", maxBuffer: 1 << 28 });
const hs = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
async function memoria() { try { const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${RAMA}/${ARCH}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch (e) {} return null; }
async function ideas(prev) {
  const vistas = new Set((prev || []).map((x) => x.link)), out = (prev || []).slice();
  for (const [fuente, url] of FUENTES) { try { const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "bot-trading-lab" } }); if (!r.ok) continue; const x = await r.text();
    const items = [...x.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)].slice(0, 40); for (const m of items) { const b = m[0], tit = ((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\s+/g, " ").trim(), link = ((b.match(/<link[^>]*href="([^"]+)"/) || b.match(/<link>([\s\S]*?)<\/link>/) || b.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || "").trim(), fecha = ((b.match(/<(pubDate|published|updated)>([\s\S]*?)<\/\1>/) || [])[2] || "").trim(), txt = tit + " " + ((b.match(/<(description|summary)[^>]*>([\s\S]*?)<\/\1>/) || [])[2] || "");
      if (!tit || !link || vistas.has(link)) continue; vistas.add(link); const fams = Object.entries(CLAVES).filter(([, re]) => re.test(txt)).map(([f]) => f); out.unshift({ fuente, tit: tit.slice(0, 200), link, fecha: Date.parse(fecha) ? new Date(fecha).toISOString() : new Date().toISOString(), fams, visto: new Date().toISOString() }); } } catch (e) {} }
  return out.slice(0, 200);
}
export async function lab(log = console.log) {
  const M0 = (await memoria()) || {};
  // v456 · 🧊 CUARENTENA: un método que aprueba pasa 21 días en ficticio (precios reales, sin dinero) antes de poder usarse con dinero real.
  //   Exento: el que ya estaba operando con dinero real cuando se creó la cuarentena (el n.º 1 del podio en ese momento).
  const exentos = Array.isArray(M0.exentos) ? M0.exentos : ["q411nb"];   // q411nb = «Compresión Donchian + Z-Score + BTC Momentum», en uso con dinero real desde el 12/11/2026
  const mem = { probadas: M0.probadas || {}, pesos: M0.pesos || {}, casi: M0.casi || [], aprobadas: M0.aprobadas || [], rondas: (M0.rondas || 0) + 1, hist: M0.hist || [] };
  const ID = await ideas(M0.ideas); const recientes = ID.filter((x) => Date.now() - Date.parse(x.visto) < 30 * 864e5), menc = {}; for (const x of recientes) for (const f of x.fams) menc[f] = (menc[f] || 0) + 1;
  log(`🧠 Ronda ${mem.rondas} · memoria: ${Object.keys(mem.probadas).length} combinaciones ya probadas · ideas nuevas leídas: ${ID.length - (M0.ideas || []).length}`);
  const D = await datos(() => {}), { T, M, U } = D, n = T.length, corte = Math.floor(n * 0.6), mitad = Math.floor((corte + n) / 2);
  const TRAMOS = []; for (let q = 0; q < 16; q++) { const len = Math.round((30 + Math.random() * 150) * 24), fin = q < 8 ? n - 1 : 260 + len + Math.floor(Math.random() * Math.max(1, n - 1 - 260 - len)); TRAMOS.push([Math.max(260, fin - len), fin]); }   // v365 · nuevos en cada ronda
  const X = { btcUp: null, up: {}, vol: {}, volMed: {} }; { const { ema, atr } = await import("./caza-hl2.mjs"); const e = ema(M.BTC.C, 200); X.btcUp = Uint8Array.from(M.BTC.C, (c, i) => (c > e[i] ? 1 : 0)); for (const c of U) { const e2 = ema(M[c].C, 100); X.up[c] = Uint8Array.from(M[c].C, (x, i) => (x > e2[i] ? 1 : 0)); X.vol[c] = atr(M[c], 24); const s = [...X.vol[c].slice(250, corte)].filter(Number.isFinite).sort((a, b) => a - b); X.volMed[c] = s[Math.floor(s.length / 2)]; } }
  const S = senales(D);
  // v366 · 🤖 recetas del ayudante IA (Gemini): se añaden como señales extra; tienen que aprobar el mismo examen que todas
  let IA = []; try { const RX = await import("./ia-receta.mjs"); const j = await (await fetch(`https://raw.githubusercontent.com/${REPO}/ia-lab/ia-lab.json?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) })).json(); const FNk = Object.keys(FILTROS);
    IA = (((j && j.cripto && j.cripto.recetas) || []).map((r) => RX.validaReceta(r, FNk)).filter(Boolean)).slice(0, 150); for (const r of IA) S.push({ fam: "🤖 IA", p: { ia: r.id, n: r.nombre }, fn: RX.senalReceta(r), ia: r }); } catch (e) { IA = []; }
  if (IA.length) log(`🤖 Recetas del ayudante IA: ${IA.length}`);
  const iaIdx = new Map(S.map((x, j) => [x.ia ? x.ia.id : null, j]).filter(([k]) => k));
  const fixG = (g) => { if (!g) return null; const z = { ...g }; if (z.ia) { const j = iaIdx.get(z.ia); if (j == null) return null; z.a = j; } else if (S[z.a] && S[z.a].ia) return null; if (z.iab) { const j = iaIdx.get(z.iab); if (j == null) z.b = null; else z.b = j; } return z; };
  const marcaIA = (g) => { if (S[g.a] && S[g.a].ia) g.ia = S[g.a].ia.id; else delete g.ia; if (g.b != null && S[g.b] && S[g.b].ia) g.iab = S[g.b].ia.id; else delete g.iab; return g; };
  const FAM = [...new Set(S.map((s) => s.fam))], cache = new Map(), sig = (j) => { if (!cache.has(j)) { const o = {}; for (const c of U) { try { o[c] = S[j].fn(M[c], T, M.BTC); } catch (e) { o[c] = new Int8Array(n); } } cache.set(j, o); if (cache.size > 40) cache.delete(cache.keys().next().value); } return cache.get(j); };
  // peso de cada familia: lo cerca que se ha quedado de aprobar (mejor factor de beneficio en la prueba) + empujón por ideas recientes
  const peso = (f) => Math.max(0.2, (mem.pesos[f] || 1)) * (1 + 0.15 * Math.min(4, menc[f] || 0));
  const elige = () => { const tot = FAM.reduce((a, f) => a + peso(f), 0); let r = Math.random() * tot; for (const f of FAM) { r -= peso(f); if (r <= 0) return f; } return FAM[0]; };
  const idxDe = (f) => { const js = S.map((s, j) => (s.fam === f ? j : -1)).filter((j) => j >= 0); return js[Math.floor(Math.random() * js.length)]; };
  const FN = Object.keys(FILTROS), SAL = [1, 2, 4, 8, 16, 24, 48, 72, 120, 168], STP = [0, 0.02, 0.03, 0.05, 0.08];
  // v455 · 🐢 MÉTODOS LENTOS: si cada operación dura 2 días o más, basta con ~2 operaciones por semana (el resto del examen es el mismo, igual de exigente)
  const lento = (g) => g.h >= 48, minOps = (g) => (lento(g) ? 0.25 : 4), minOpsB = (g) => (lento(g) ? 0.15 : 3);
  const nuevo = () => ({ a: idxDe(elige()), b: Math.random() < 0.35 ? idxDe(elige()) : null, f: FN[Math.floor(Math.random() * FN.length)], h: SAL[Math.floor(Math.random() * SAL.length)], sl: STP[Math.floor(Math.random() * STP.length)] });
  const sinEco = (g) => { if (g.b === g.a) g.b = null; return g; };
  const muta = (g) => { const x = { ...g }, q = Math.floor(Math.random() * 5); if (q === 0) x.f = FN[Math.floor(Math.random() * FN.length)]; else if (q === 1) x.h = SAL[Math.floor(Math.random() * SAL.length)]; else if (q === 2) x.sl = STP[Math.floor(Math.random() * STP.length)]; else if (q === 3) x.b = Math.random() < 0.5 ? null : idxDe(elige()); else x.a = idxDe(S[x.a] ? S[x.a].fam : elige()); return sinEco(x); };
  const clave = (g) => `${S[g.a] && S[g.a].fam}${JSON.stringify(S[g.a] && S[g.a].p)}|${g.b != null && S[g.b] ? S[g.b].fam + JSON.stringify(S[g.b].p) : "-"}|${g.f}|${g.h}|${g.sl}`;
  const nomS = (x) => (x.ia ? `🤖 IA «${x.ia.nombre}»` : `${x.fam} ${JSON.stringify(x.p)}`);
  const nombre = (g) => `${nomS(S[g.a])}${g.b != null ? " + confirma " + nomS(S[g.b]) : ""} · ${g.f} · cada operación dura ${g.h} h · stop ${g.sl ? "−" + g.sl * 100 + " %" : "no"}`;
  const calidad = (x) => { const an = Math.pow(Math.max(0.0001, 1 + x.a.ret), 365 / Math.max(30, (n - 261) / 24)) - 1; return an - 0.8 * Math.abs(x.a.dd || 0); };   /* v457 · 0,8 */
  const evalua = (g) => { const A = sig(g.a), B = g.b != null ? sig(g.b) : null, f = FILTROS[g.f], ops = [];
    for (const c of U) { const a = A[c], b = B && B[c]; let lib = 0; for (let i = 260; i < n - 1; i++) { if (i < lib || !a[i]) continue; if (b) { let ok = false; for (let k = 0; k < 6 && !ok; k++) if (b[i - k] === a[i]) ok = true; if (!ok) continue; } if (!f(a[i], i, X, c)) continue; ops.push([i, c, a[i], i + g.h]); lib = i + g.h; } }
    // v365 · 🎲 TRAMOS AL AZAR (distintos en cada ronda) + regla estricta «hasta hoy»: la historia completa hasta hoy, los últimos 6 meses
    //   y 16 tramos de 1 a 6 meses (la mitad acaban HOY). Aprueba si gana en la historia completa, en los últimos 6 meses y en ≥60 % de los tramos.
    const a = cartera(ops, M, 260, n - 1, 5, g.sl), rec = cartera(ops, M, Math.max(260, n - 1 - 180 * 24), n - 1, 5, g.sl), r = { a, b: rec, t: null };
    // v453 · 🔒 FUERA DE MUESTRA: los últimos 90 días quedan «escondidos» para la búsqueda (la nota que guía qué probar y mutar sale solo de lo anterior)
    //   y sirven de examen final. 💸 COSTES DOBLES: además tiene que ganar pagando el doble de comisiones y deslizamiento.
    const HOLD = 90 * 24, cut = Math.max(300, n - 1 - HOLD), ais = cartera(ops, M, 260, cut, 5, g.sl), oos = cartera(ops, M, cut, n - 1, 5, g.sl), c2 = cartera(ops, M, 260, n - 1, 5, g.sl, 2);
    r.is = ais; r.o = { ret: oos.ret, pf: oos.pf, n: oos.n, dd: oos.dd }; r.c2 = { ret: c2.ret, pf: c2.pf };
    if (a.ret > 0 && a.opsDia >= minOpsB(g)) { const xs = []; for (const [i0, i1] of TRAMOS) { const z = cartera(ops, M, i0, i1, 5, g.sl); xs.push({ m: Math.pow(Math.max(0.01, 1 + z.ret), 720 / (i1 - i0)) - 1, dd: z.dd, ok: z.ret > 0 }); }
      const ms = xs.map((x) => x.m).sort((p, q) => p - q), dds = xs.map((x) => x.dd).sort((p, q) => q - p); r.t = { n: xs.length, g: xs.filter((x) => x.ok).length / xs.length, med: ms[Math.floor(ms.length / 2)], dd: dds[Math.floor(dds.length / 4)] }; }
    r.okA = a.opsDia >= minOps(g) && a.ret > 0 && a.pf >= 1.15 && a.dd < 0.3; r.okB = !!r.t && r.t.g >= 0.6 && rec.ret > 0 && rec.opsDia >= minOpsB(g);
    r.okC = oos.ret > 0 && oos.pf >= 1 && c2.ret > 0;   /* v453 · aprueba también fuera de muestra y con costes dobles */
    r.nota = ais.pf * (r.t ? 0.5 + r.t.g : 0.5) * (ais.opsDia >= minOps(g) ? 1 : 0.5); r.lento = lento(g); r.ops = ops; return r; };
  // v458 · 🧭 PRUEBA DE VECINOS (como en los ETF): una variante con la duración vecina y otra con el stop vecino; al menos una tiene que ganar
  //   también en toda la historia, en los 90 días ocultos y con costes dobles. Así no aprueban «islas» que solo funcionan con ese número exacto.
  const vecinos = (g) => { const iH = SAL.indexOf(g.h), iS = STP.indexOf(g.sl), out = [];
    out.push({ ...g, h: SAL[iH > 0 ? iH - 1 : iH + 1] ?? g.h }); out.push({ ...g, sl: STP[iS >= 0 && iS < STP.length - 1 ? iS + 1 : Math.max(0, iS - 1)] ?? g.sl }); return out; };
  const vecinosOk = (g) => { const res = vecinos(g).map((v) => { const r = evalua(v); return { h: v.h, sl: v.sl, ok: r.a.ret > 0 && r.o.ret > 0 && r.c2.ret > 0, ret: +(r.a.ret * 100).toFixed(1) }; }); return { ok: res.some((x) => x.ok), res }; };
  // candidatos: 30 % mutaciones de las «casi», 70 % nuevas (con los pesos aprendidos); nunca se repite una ya probada
  const cand = [], vistas = new Set(Object.keys(mem.probadas));
  // v366 · 🤖 como mucho el 15 % de la ronda son recetas de la IA (su propuesta tal cual + variaciones de filtro, salida y stop); el resto, como siempre
  if (IA.length) { const cupo = Math.floor(PRUEBAS * 0.15); for (let z = 0; z < cupo * 20 && cand.length < cupo; z++) { const r = IA[z < IA.length ? z : Math.floor(Math.random() * IA.length)], a = iaIdx.get(r.id); if (a == null) continue;
      const g = z < IA.length ? { a, b: null, f: r.filtro, h: r.salida_h, sl: r.stop } : muta({ a, b: null, f: r.filtro, h: r.salida_h, sl: r.stop }); if (g.a !== a && !(S[g.a] && S[g.a].ia)) g.a = a; marcaIA(g); const k = hs(clave(g)); if (vistas.has(k)) continue; vistas.add(k); cand.push(g); } }
  for (let z = 0; z < PRUEBAS * 20 && cand.length < PRUEBAS; z++) { const b0 = mem.casi.length && Math.random() < 0.3 ? mem.casi[Math.floor(Math.random() * mem.casi.length)].g : null, base = fixG(b0); const g = marcaIA(base && S[base.a] ? muta(base) : sinEco(nuevo())); if (g.a == null || !S[g.a]) continue; const k = hs(clave(g)); if (vistas.has(k)) continue; vistas.add(k); cand.push(g); }
  cand.sort((x, y) => x.a - y.a); const famStat = {}; let nOk = 0;
  for (const g of cand) { const r = evalua(g), k = hs(clave(g)), f = S[g.a].fam; mem.probadas[k] = +r.nota.toFixed(3); (famStat[f] = famStat[f] || []).push(r.nota);
    if (r.a.ret > 0 && r.t && r.t.g >= 0.5 && r.a.opsDia >= minOpsB(g)) { mem.casi.push({ g, n: nombre(g), nota: r.nota, a: r.a, b: r.b, t: r.t }); }
    if (r.okA && r.okB && r.okC && !mem.aprobadas.some((x) => x.k === k) && !vecinosOk(g).ok) { mem.casi.push({ g, n: nombre(g), nota: r.nota, a: r.a, b: r.b, t: r.t }); continue; }   /* v458 · sin vecinos que ganen: se queda en «casi» */
    if (r.okA && r.okB && r.okC) { nOk++; if (!mem.aprobadas.some((x) => x.k === k)) mem.aprobadas.push({ k, g, n: nombre(g), a: r.a, b: r.b, t: r.t, o: r.o, c2: r.c2, desde: new Date().toISOString() }); } }
  for (const [f, v] of Object.entries(famStat)) { const top = v.sort((a, b) => b - a).slice(0, 5), m = top.reduce((a, b) => a + b, 0) / top.length; mem.pesos[f] = +((mem.pesos[f] || 1) * 0.7 + 0.3 * Math.max(0.2, m)).toFixed(3); }
  mem.casi = mem.casi.sort((a, b) => b.nota - a.nota).filter((x, i, A) => A.findIndex((y) => y.n === x.n) === i).slice(0, 60);
  // las aprobadas se vuelven a examinar cada ronda con los datos nuevos: si dejan de aprobar, salen del podio
  mem.aprobadas = mem.aprobadas.filter((x) => { const g2 = fixG(x.g); if (!g2 || !S[g2.a]) return false; x.g = g2; const r = evalua(x.g); Object.assign(x, { a: r.a, b: r.b, t: r.t, o: r.o, c2: r.c2 });
    try { const t0 = Date.parse(x.desde), i0 = T.findIndex((t) => t >= t0), dias = (Date.now() - t0) / 864e5, z = i0 >= 0 && i0 < n - 1 ? cartera(r.ops, M, i0, n - 1, 5, x.g.sl) : { n: 0, ret: 0, pf: 0 }, min = lento(x.g) ? 4 : 8;
      x.cuar = { dias: +dias.toFixed(1), n: z.n, ret: +(+z.ret || 0).toFixed(4), pf: +(+z.pf || 0).toFixed(2), min, exento: exentos.includes(x.k) || undefined, ok: dias >= 21 && z.n >= min && z.ret > 0 }; } catch (e) { x.cuar = { dias: 0, n: 0, ret: 0, min: 8, ok: false }; }
    if (r.okA && r.okB && r.okC) { try { x.vec = vecinosOk(x.g); } catch (e) { x.vec = { ok: true, res: [] }; } if (!x.vec.ok) log(`  🧭 Sale del podio por la prueba de vecinos: ${x.n.slice(0, 80)}`); }
    return r.okA && r.okB && r.okC && (!x.vec || x.vec.ok); }).sort((a, b) => Math.round(calidad(b) * 1000) - Math.round(calidad(a) * 1000) || a.a.dd - b.a.dd);   /* v455 · ⚖️ por CALIDAD: ganancia al año − 0,8 × caída */   /* v365 · rentabilidad típica en los tramos → mejor en los últimos 6 meses → menos caída */
  for (const x of mem.aprobadas) x.nota = +calidad(x).toFixed(4);
  const ks = Object.keys(mem.probadas); if (ks.length > 40000) for (const k of ks.slice(0, ks.length - 40000)) delete mem.probadas[k];
  mem.hist.unshift({ t: new Date().toISOString(), probadas: cand.length, aprobadas: nOk, total: Object.keys(mem.probadas).length }); mem.hist = mem.hist.slice(0, 120);
  // v366 · 🤖 resultados de cada receta de la IA (el ayudante los lee para aprender qué ideas funcionan)
  const iaRes = M0.ia || {}; for (const g of cand) { if (!g.ia) continue; const k = hs(clave(g)), nt = mem.probadas[k]; if (nt == null) continue; const z = (iaRes[g.ia] = iaRes[g.ia] || { n: 0, nota: 0 }); z.n++; if (nt > z.nota) z.nota = nt; }
  for (const x of mem.casi) if (x.g && x.g.ia && iaRes[x.g.ia]) { const z = iaRes[x.g.ia]; z.casi = Math.max(z.casi || 0, 1); z.mejor = z.mejor || { historia: +(x.a.ret * 100).toFixed(1), ult6m: +(x.b.ret * 100).toFixed(1), tramos_ok: x.t ? x.t.g : null }; }
  for (const x of mem.aprobadas) if (x.g && x.g.ia && iaRes[x.g.ia]) iaRes[x.g.ia].aprobada = 1;
  const iaN = cand.filter((g) => g.ia).length, iaCasi = mem.casi.filter((x) => x.g && x.g.ia).length, iaOk = mem.aprobadas.filter((x) => x.g && x.g.ia).length;
  if (IA.length) log(`🤖 IA: ${IA.length} recetas · ${iaN} combinaciones probadas en esta ronda · ${iaCasi} entre las «casi» · ${iaOk} aprobadas`);
  const out = { v: 1, exentos, t: new Date().toISOString(), ia: iaRes, iaVista: { recetas: IA.length, probadas: iaN, casi: iaCasi, aprobadas: iaOk }, dias: Math.round(n / 24), criptos: U, ...mem, ideas: ID, podio: mem.aprobadas.slice(0, 3), mejoresCasi: mem.casi.slice(0, 5).map((x) => ({ n: x.n, a: x.a, b: x.b, t: x.t })), pesosVista: Object.fromEntries(FAM.map((f) => [f, +peso(f).toFixed(2)])) };
  log(`🧠 Probadas ahora ${cand.length} (en total ${Object.keys(mem.probadas).length}) · aprueban ${nOk} · en el podio ${out.podio.length} · familias con más peso: ${Object.entries(out.pesosVista).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, w]) => f + " " + w).join(", ")}`);
  // v364 · 🔔 Telegram solo cuando un método ENTRA en el podio
  try { const ant = new Set((M0.podio || []).map((x) => x.k)), nuevos = out.podio.map((x, i) => ({ x, i })).filter(({ x }) => !ant.has(x.k));
    if (nuevos.length) { const AV = await import("./avisos.mjs"); await AV.tg(nuevos.map(({ x, i }) => `🏆 Laboratorio de cripto (muchas operaciones): nuevo método en el podio, puesto ${i + 1}.º\n${x.n}\nEn los últimos 6 meses: ${(x.b.ret * 100).toFixed(1).replace(".", ",")} % · ${x.b.opsDia.toFixed(1).replace(".", ",")} operaciones al día · caída máxima ${(x.b.dd * 100).toFixed(1).replace(".", ",")} %`).join("\n\n") + "\n\nNo mueve dinero: antes de meterlo en Hyperliquid te lo preguntaré."); } } catch (e) { log("aviso del podio no enviado"); }
  out.podio.forEach((x, i) => log(`  🏆 ${i + 1}.º ${x.cuar ? (x.cuar.exento ? "[en uso, exento] " : x.cuar.ok ? "[listo para real] " : `[cuarentena día ${Math.floor(x.cuar.dias)} de 21, ${x.cuar.n} op.] `) : ""}${x.n} · últimos 6 meses ${(x.b.ret * 100).toFixed(1)} % (${x.b.opsDia.toFixed(1)} op/día, caída ${(x.b.dd * 100).toFixed(1)} %) · en el podio desde ${x.desde}`));
  mem.casi.slice(0, 3).forEach((x) => log(`  🟡 casi: ${x.n} · historia completa ${(x.a.ret * 100).toFixed(1)} % · últimos 6 meses ${(x.b.ret * 100).toFixed(1)} % · gana en ${x.t ? Math.round(x.t.g * 100) : "?"} % de los tramos`));
  return out;
}
async function guarda(out) {
  if (!TOKEN) { writeFileSync(ARCH, JSON.stringify(out)); console.log("Ejecución local: guardado en " + ARCH); return; }
  const pub = path.join(process.cwd(), ".pubcazalab"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, ARCH), JSON.stringify(out));
  const g = (c) => sh(`git -C "${pub}" ${c}`); g(`init -q -b ${RAMA}`); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add " + ARCH); g(`commit -q -m "laboratorio cripto ${out.t}"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git ${RAMA}`); console.log("Laboratorio de cripto guardado."); return; } catch (e) { await new Promise((r) => setTimeout(r, 4000)); } }
}
if (process.argv[1] && process.argv[1].endsWith("caza-lab.mjs")) lab().then(guarda).catch((e) => { console.log("Error: " + String(e.message).split("\n")[0].slice(0, 160)); process.exit(1); });
