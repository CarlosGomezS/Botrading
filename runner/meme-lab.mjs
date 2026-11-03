// v164 · 🧬 LABORATORIO DE MEMES («bola de aprendizaje»): una población de variantes de las reglas del vídeo opera A LA VEZ, con dinero
// ficticio (50 € cada una), los MISMOS datos en vivo y costes reales. Cada ~3 h se juzgan: las peores se archivan (nunca se borran) y nacen
// otras (mutaciones y cruces de las mejores, y alguna inventada de cero). Si una variante demuestra con muchas operaciones que es mejor que las
// reglas que usa el terminal, el terminal la adopta solo. La variante «vídeo» (las reglas originales) no se elimina nunca: es la referencia.
import { setIA, ESC, alarmaSalida, trailEf, costesDe, VOLATIL, R as R0, VIDEO, TURBO, TURBO_V, conGenoma, explorador, reglas, analista, equity, RULES, ESTILOS, NOMEME } from "./meme.mjs";
const ESTS = Object.keys(ESTILOS);

export const POP = 60, GEN_H = 0.25, MIN_N = 8, ADOPT_N = 30, BT_N = 20;
import { backtest } from "./meme-muestras.mjs";
import { entrenar } from "./meme-ia.mjs";
// rango de cada pieza del genoma [mín, máx, paso]
export const RANGOS = {
  ageMin: [5, 240, 5], ageMax: [120, 7 * 1440, 60], mcapMin: [50e3, 2e6, 50e3], mcapMax: [2e6, 100e6, 1e6],
  liqMin: [10e3, 150e3, 5e3], vol1hMin: [10e3, 300e3, 10e3], top10Max: [10, 50, 1], devMax: [1, 10, 0.5], bundleMax: [3, 30, 1],
  pump1hMax: [30, 300, 10], lpLockMin: [50, 100, 5], stop: [0.03, 0.25, 0.01], trailOn: [0.05, 0.5, 0.01], trail: [0.05, 0.4, 0.01], tp: [0.1, 1.5, 0.05], tpFrac: [0, 0.7, 0.05], esc: [0, 0.6, 0.05], alerta: [0, 1, 1], orgMin: [0, 80, 5],
  maxHoldH: [1, 72, 1], size: [0.03, 0.15, 0.01], minScore: [50, 90, 1]
};
// v174 · SIN TECHO: si las mejores variantes se pegan al borde de un rango, ese rango se ensancha solo (hasta unos límites de cordura)
export const DUROS = { ageMin: [1, 10080], ageMax: [30, 5 * 525600], mcapMin: [5e3, 1e9], mcapMax: [1e5, 1e11], liqMin: [1e3, 5e6], vol1hMin: [1e3, 1e7], top10Max: [3, 95], devMax: [0.1, 50],
  bundleMax: [0.5, 90], pump1hMax: [5, 2000], lpLockMin: [0, 100], stop: [0.01, 0.6], trailOn: [0.02, 3], trail: [0.02, 0.8], maxHoldH: [0.25, 720], size: [0.01, 0.3], minScore: [20, 99], tp: [0.03, 10], tpFrac: [0, 0.95], esc: [0, 0.9], alerta: [0, 1], orgMin: [0, 99] };
export function aplicarRangos(L) { for (const [k, r] of Object.entries((L && L.rangos) || {})) if (RANGOS[k] && Array.isArray(r)) { RANGOS[k][0] = r[0]; RANGOS[k][1] = r[1]; } }
export function ensanchar(L, best, now) {
  const ev = []; L.rangos = L.rangos || {};
  for (const k of Object.keys(RANGOS)) {
    const [a, b, st] = RANGOS[k], span = b - a, [da, db] = DUROS[k] || [a, b], vs = best.map((v) => +((v.g || {})[k] ?? VIDEO[k]));
    if (vs.filter((x) => x <= a + st * 0.5).length >= 2 && a > da) { RANGOS[k][0] = Math.max(da, a - span * 0.25); ev.push(`${NOMBRES[k] || k}: ahora prueba desde ${r2(RANGOS[k][0])}`); }
    if (vs.filter((x) => x >= b - st * 0.5).length >= 2 && b < db) { RANGOS[k][1] = Math.min(db, b + span * 0.25); ev.push(`${NOMBRES[k] || k}: ahora prueba hasta ${r2(RANGOS[k][1])}`); }
    L.rangos[k] = [RANGOS[k][0], RANGOS[k][1]];
  }
  for (const t of ev) { L.log.unshift({ t: now.toISOString(), k: "amplia", txt: "📐 " + t }); }
  L.log = L.log.slice(0, 200); return ev.length;
}
export const NOMBRES = { ageMin: "edad mínima (min)", ageMax: "edad máxima (min)", mcapMin: "tamaño mínimo ($)", mcapMax: "tamaño máximo ($)", liqMin: "liquidez mínima ($)", vol1hMin: "volumen 1 h mínimo ($)",
  top10Max: "top 10 máx. (%)", devMax: "creador máx. (%)", bundleMax: "bloque máx. (%)", pump1hMax: "subida 1 h máx. (%)", lpLockMin: "LP bloqueada mín. (%)", stop: "stop", trailOn: "activa el móvil en", trail: "móvil bajo el máximo",
  maxHoldH: "tiempo máximo (h)", size: "tamaño de cada compra", minScore: "nota mínima", tp: "venta parcial en", tpFrac: "parte que vende", esc: "escalera (parte que vende en ×2, ×3 y ×5)", alerta: "salida inteligente (alarmas de desplome)", orgMin: "actividad real mínima (Jupiter)", mint: "exige mint/freeze revocados", w: "pesos de la nota" };
const r2 = (x) => Math.round(x * 100) / 100;
const snap = (k, v) => { const [a, b, st] = RANGOS[k]; return Math.max(a, Math.min(b, Math.round(v / st) * st)); };
const SIG = ["mom", "ub", "bs", "hg", "lm", "sw", "ia", "gr"];
export const gkey = (g) => JSON.stringify(Object.keys(RANGOS).map((k) => g[k]).concat([g.mint, g.estilo || "video", SIG.map((k) => r2((g.w || {})[k] ?? 1))]));

export function aleatorio(rnd = Math.random) {
  const g = { ...VIDEO, w: {} };
  for (const k of Object.keys(RANGOS)) { const [a, b] = RANGOS[k]; g[k] = snap(k, a + rnd() * (b - a)); }
  if (g.mcapMax <= g.mcapMin) g.mcapMax = snap("mcapMax", g.mcapMin * 4); if (g.ageMax <= g.ageMin) g.ageMax = snap("ageMax", g.ageMin + 600);
  g.mint = rnd() < 0.85 ? 1 : 0; for (const k of SIG) g.w[k] = r2(rnd() * 2);
  g.estilo = ESTS[Math.floor(rnd() * ESTS.length)];
  return g;
}
export function mutar(p, rnd = Math.random) {
  const g = { ...p, w: { ...(p.w || {}) } }, ks = Object.keys(RANGOS), n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const k = ks[Math.floor(rnd() * ks.length)], [a, b] = RANGOS[k]; g[k] = snap(k, g[k] + (rnd() - 0.5) * (b - a) * 0.3); }
  if (rnd() < 0.3) { const k = SIG[Math.floor(rnd() * SIG.length)]; g.w[k] = r2(Math.max(0, Math.min(2, (g.w[k] ?? 1) + (rnd() - 0.5)))); }
  if (rnd() < 0.05) g.mint = g.mint ? 0 : 1;
  if (rnd() < 0.08) g.estilo = ESTS[Math.floor(rnd() * ESTS.length)];
  if (g.mcapMax <= g.mcapMin) g.mcapMax = snap("mcapMax", g.mcapMin * 4); if (g.ageMax <= g.ageMin) g.ageMax = snap("ageMax", g.ageMin + 600);
  return g;
}
export function cruzar(a, b, rnd = Math.random) {
  const g = { ...VIDEO, w: {} };
  for (const k of Object.keys(RANGOS)) g[k] = rnd() < 0.5 ? a[k] : b[k];
  g.mint = rnd() < 0.5 ? a.mint : b.mint; g.estilo = rnd() < 0.5 ? a.estilo || "video" : b.estilo || "video"; for (const k of SIG) g.w[k] = rnd() < 0.5 ? (a.w || {})[k] ?? 1 : (b.w || {})[k] ?? 1;
  if (g.mcapMax <= g.mcapMin) g.mcapMax = snap("mcapMax", g.mcapMin * 4); if (g.ageMax <= g.ageMin) g.ageMax = snap("ageMax", g.ageMin + 600);
  return g;
}
export function nuevaVar(id, g, now, gen, why) { return { id, g, gen, born: now.toISOString(), why, cash: R.start, pos: {}, cool: {}, closed: [], n: 0, s1: 0, s2: 0, w: 0, pnl: 0, fees: 0, rugs: 0, peak: R.start, dd: 0, eq: [], lastEq: R.start }; }
export function freshLab(now = new Date()) {
  const L = { v: 3, gen: 0, nextId: 1, since: now.toISOString(), lastGen: now.toISOString(), pop: [], arch: [], log: [], adopt: [] };
  L.pop.push(nuevaVar("v0", { ...VIDEO }, now, 0, "las reglas del vídeo (referencia, no se elimina)"));
  const seen = new Set([gkey(VIDEO)]); let i = 1, guard = 0;
  while (L.pop.length < POP && guard++ < 500) { const otro = ["grandes", "rebote", "volumen"][i % 3], g = i < 6 ? mutar(VIDEO) : { ...(i < 13 ? mutar(VIDEO) : aleatorio()), estilo: otro }, k = gkey(g); if (seen.has(k)) continue; seen.add(k); L.pop.push(nuevaVar("v" + L.nextId++, g, now, 0, i < 6 ? "variante de las reglas del vídeo" : "estilo: " + ESTILOS[otro].n)); i++; }
  return L;
}
// nota de cada variante: la «t» de sus operaciones (media del % por operación ÷ su error), castigada si se hunde mucho
export function fitnessVivo(V) {
  if (V.n < MIN_N) return null;
  const m = V.s1 / V.n, sd = Math.sqrt(Math.max(1e-9, V.s2 / V.n - m * m)), t = m / (sd / Math.sqrt(V.n));
  return r2(t - (V.dd < -0.5 ? 2 : V.dd < -0.35 ? 1 : 0));
}
// v176 · nota = la de sus operaciones en vivo (ficticias) y la de su prueba sobre las muestras ya vividas, a partes iguales si hay de las dos
export function fitness(V) {
  const a = fitnessVivo(V), b = V.bt && V.bt.n >= BT_N ? V.bt.t : null;
  return a == null ? b : b == null ? a : r2((a + b) / 2);
}
let R = R0;   // v191 · costes de la variante en curso (las de «volátiles» pagan los de Jupiter en monedas líquidas)
const slipR = (eur, liq) => Math.min(R.slipMax, R.slipMin + eur / Math.max(1, liq));

// una vuelta de una variante (con costes reales). info y g vienen ya calculados del terminal (los mismos datos para todas)
export function pasoVar(V, by, now, ext, smart, hold, rnd = Math.random) {
  R = costesDe({ ...VIDEO, ...V.g }); try { return pasoVar0(V, by, now, ext, smart, hold, rnd); } finally { R = R0; }
}
function pasoVar0(V, by, now, ext, smart, hold, rnd) {
  return conGenoma(V.g, () => {
    const G = { ...VIDEO, ...V.g }, tnow = now.getTime(), px = {}, RCI = ext.rc || {}, GTI = ext.gt || {};
    const cerrar = (a, pr, liq, why, rug) => {
      const p = V.pos[a], sl = rug ? 0 : slipR(p.q * pr, liq), gross = p.q * pr, got = rug ? 0 : Math.max(0, gross * (1 - sl) * (1 - R.fee) - R.fixFee);
      const gotT = got + (p.gp || 0), pnl = gotT - p.cost, pc = gotT / p.cost - 1; V.cash += got; V.fees += rug ? 0 : gross - got; V.pnl += pnl; V.n++; V.s1 += pc; V.s2 += pc * pc; if (pnl > 0) V.w++; if (rug) V.rugs++;
      V.closed.unshift({ sym: p.sym, t1: now.toISOString(), pc: r2(pc * 100), pnl: r2(pnl), why }); V.closed = V.closed.slice(0, 60); V.cool[a] = tnow; delete V.pos[a];
    };
    for (const [a, p] of Object.entries(V.pos)) {
      const q = by[a], liq = q ? +(q.liquidity && q.liquidity.usd) || 0 : 0, pr = q ? +q.priceUsd : 0;
      if (!q || !(pr > 0) || liq < R.rugLiq) { if (!q && !ext.full) continue; cerrar(a, 0, 0, "rug", true); continue; }
      px[a] = pr; p.peak = Math.max(p.peak, pr); p.last = pr;
      if (p.peak >= p.px * (1 + G.trailOn)) p.tr = 1;
      if (G.tpFrac > 0 && !p.tp1 && pr >= p.px * (1 + G.tp)) { const qv = p.q * G.tpFrac, gross = qv * pr, g2 = Math.max(0, gross * (1 - slipR(gross, liq)) * (1 - R.fee) - R.fixFee); V.cash += g2; V.fees += gross - g2; p.q -= qv; p.gp = (p.gp || 0) + g2; p.tp1 = 1; }
      while (G.esc > 0 && (p.esc || 0) < ESC.length && pr >= p.px * ESC[p.esc || 0]) { const qv = p.q * G.esc, gross = qv * pr, g2 = Math.max(0, gross * (1 - slipR(gross, liq)) * (1 - R.fee) - R.fixFee); V.cash += g2; V.fees += gross - g2; p.q -= qv; p.gp = (p.gp || 0) + g2; p.esc = (p.esc || 0) + 1; }
      const al = alarmaSalida(G, p, q, liq, pr);
      if (pr <= p.px * (1 - G.stop)) cerrar(a, pr, liq, "stop");
      else if (al) cerrar(a, pr, liq, "alarma");
      else if (p.tr && pr <= p.peak * (1 - trailEf(G, p, pr))) cerrar(a, pr, liq, "móvil");
      else if ((tnow - Date.parse(p.t0)) / 3600e3 >= G.maxHoldH) cerrar(a, pr, liq, "tiempo");
    }
    if (ext.full) {
      const S0 = { smart: smart || {}, hold: hold || {} }, cands = [];
      for (const [a, q] of Object.entries(by)) {
        if (V.pos[a] || NOMEME.has(a) || explorador(q, tnow)) continue; if (V.cool[a] && tnow - V.cool[a] < G.cooldownH * 3600e3) continue;
        const info = RCI[a] || null, rr = reglas(q, info); if (!info || info.rugged || RULES.some(([k]) => rr[k] !== true)) continue;
        const jx = (ext.jup || {})[a] || null; if (G.orgMin > 0 && jx && jx.org != null && jx.org < G.orgMin) continue;
        const an = analista(S0, a, q, info, GTI[a] || null, tnow, jx); if (an.sc >= G.minScore) cands.push({ a, q, sc: an.sc });
      }
      cands.sort((x, y) => y.sc - x.sc);
      for (const { a, q, sc } of cands) {
        if (Object.keys(V.pos).length >= G.maxPos) break;
        const amt = Math.min(V.cash, equity(V, px) * G.size), liq = +q.liquidity.usd, pr = +q.priceUsd; if (amt <= R.fixFee * 4) break;
        if (rnd() < R.failP) { V.cash -= R.failCost; V.fees += R.failCost; continue; }
        const sl = slipR(amt, liq), qn = Math.max(0, amt * (1 - R.fee) - R.fixFee) / (pr * (1 + sl));
        V.cash -= amt; V.fees += amt - qn * pr; V.pos[a] = { sym: q.baseToken.symbol, q: qn, px: pr, cost: amt, t0: now.toISOString(), peak: pr, last: pr, sc }; px[a] = pr;
      }
      for (const [a, t] of Object.entries(V.cool)) if (tnow - t > G.cooldownH * 3600e3) delete V.cool[a];
    }
    const eq = equity(V, px); V.lastEq = r2(eq); V.peak = Math.max(V.peak, eq); V.dd = Math.min(V.dd, eq / V.peak - 1);
    if (!V.eq.length || tnow - Date.parse(V.eq[V.eq.length - 1][0]) >= 10 * 60000) { V.eq.push([now.toISOString(), r2(eq)]); V.eq = V.eq.slice(-300); }
    return V;
  });
}
// lo más laxo de toda la población: para saber de qué monedas hay que pedir datos a RugCheck y GeckoTerminal
export function laxo(L) {
  const gs = [VIDEO, ...L.pop.map((v) => ({ ...VIDEO, ...v.g }))], E = gs.map((g) => ESTILOS[g.estilo] || {});
  return { ageMin: Math.min(...gs.map((g) => g.ageMin), ...E.filter((e) => e.age).map((e) => e.age[0])), ageMax: Math.max(...gs.map((g) => g.ageMax), ...E.filter((e) => e.age).map((e) => e.age[1])), mcapMin: Math.min(...gs.map((g) => g.mcapMin), ...E.filter((e) => e.mc).map((e) => e.mc[0])), mcapMax: Math.max(...gs.map((g) => g.mcapMax), ...E.filter((e) => e.mc).map((e) => e.mc[1])),
    liqMin: Math.min(...gs.map((g) => g.liqMin)), vol1hMin: Math.min(...gs.map((g) => g.vol1hMin)), pump1hMax: Math.max(...gs.map((g) => g.pump1hMax)) };
}
// SELECCIÓN (cada GEN_H horas): se archivan las peores, nacen nuevas y, si hay una claramente mejor con muchas operaciones, el terminal la adopta
export function evolucionar(L, S, now = new Date(), rnd = Math.random, M = null) {
  if (now - Date.parse(L.lastGen) < GEN_H * 3600e3) return null;
  L.lastGen = now.toISOString(); L.gen++;
  const ev = (txt, k) => { L.log.unshift({ t: now.toISOString(), k, txt }); L.log = L.log.slice(0, 200); };
  // v180 · ⚡ el Turbo también aprende: su punto de partida vive en la bola («vt», no se elimina) y de él nacen variantes activas
  { const vt = L.pop.find((v) => v.id === "vt"); if (vt && vt.tv !== TURBO_V) { L.pop = L.pop.filter((v) => v !== vt); ev("vt se renueva con las reglas del Turbo 2", "sale"); } }
  if (!L.pop.some((v) => v.id === "vv")) { const v = nuevaVar("vv", { ...VOLATIL }, now, L.gen, "reglas de Volátiles (referencia, no se elimina)"); L.pop.push(v); ev("vv nace (reglas de Volátiles: criptos grandes y líquidas)", "nace"); }
  if (!L.pop.some((v) => v.id === "vt")) { { const v = nuevaVar("vt", { ...TURBO }, now, L.gen, "reglas del Turbo (referencia, no se elimina)"); v.tv = TURBO_V; L.pop.push(v); } ev("vt nace (reglas del Turbo: punto de partida de las variantes con mucha actividad)", "nace"); }
  if (M) { try { L.ia = entrenar(M, now); setIA(L.ia); if (L.ia.listo) ev(`🧠 la IA se reentrena con ${L.ia.n} casos: acierta ${Math.round(L.ia.auc * 100)} de 100 al ordenar buenas y malas (50 = azar)`, "ia"); } catch (e) {} }
  if (M) { for (const v of L.pop) v.bt = backtest({ ...VIDEO, ...v.g }, M); L.muestras = (M.hechas || []).length; L.historia = (M.hist || []).length; L.lecciones = (M.lecc || []).length; L.siguiendo = Object.keys(M.abiertas || {}).length; }
  for (const v of L.pop) v.fit = fitness(v);
  try { ensanchar(L, L.pop.filter((v) => v.fit != null && v.fit > 0).sort((a, b) => b.fit - a.fit).slice(0, 5), now); } catch (e) {}
  const ageH = (v) => (now - Date.parse(v.born)) / 3600e3;
  const ranked = L.pop.slice().sort((a, b) => (b.fit ?? -99) - (a.fit ?? -99) || b.lastEq - a.lastEq);
  // fuera: las peores con pruebas suficientes, y las que en 48 h casi no operan (reglas tan duras que no sirven)
  const out = ranked.filter((v) => v.id !== "v0" && v.id !== "vt" && v.id !== "vv" && ((v.fit != null && v.fit < 0 && ranked.indexOf(v) >= POP * 0.6) || (ageH(v) > 48 && v.n < 3))).slice(-Math.ceil(POP * 0.35));
  for (const v of out) { L.arch.unshift({ id: v.id, g: v.g, gen: v.gen, born: v.born, out: now.toISOString(), n: v.n, fit: v.fit, ret: r2((v.lastEq / R.start - 1) * 100), win: v.n ? Math.round(v.w / v.n * 100) : null, why: v.n < 3 ? "casi no opera" : "de las peores" }); ev(`${v.id} se archiva (${v.n < 3 ? "casi no opera" : "nota " + v.fit}) · ${r2((v.lastEq / R.start - 1) * 100)} %`, "sale"); }
  L.arch = L.arch.slice(0, 20000); /* el archivo no se borra: hasta 20.000 variantes */ L.pop = L.pop.filter((v) => !out.includes(v));
  const top = ranked.filter((v) => !out.includes(v) && v.fit != null && v.fit > 0).slice(0, 5), seen = new Set(L.pop.map((v) => gkey(v.g)));
  let guard = 0;
  // v188 · 🔬 BÚSQUEDA DIRIGIDA: antes de dejar nacer a nadie, prueba al momento cientos de candidatas (mutaciones de las mejores,
  // cruces, variantes del vídeo y del Turbo, e inventadas) sobre todos los casos, y solo nacen las mejores. Para no engañarse,
  // cada candidata se puntúa con su PEOR mitad: la nota en los casos antiguos y en los recientes por separado (tiene que funcionar en las dos).
  if (M && L.pop.length < POP) {
    const t0s = [...(M.hechas || []), ...(M.hist || []), ...(M.lecc || [])].map((x) => x.t0).sort((a, b) => a - b), corte = t0s[Math.floor(t0s.length / 2)] || 0;
    const parte = (f) => ({ hechas: (M.hechas || []).filter(f), hist: (M.hist || []).filter(f), lecc: (M.lecc || []).filter(f) }), Mv = parte((x) => x.t0 < corte), Mn = parte((x) => x.t0 >= corte);
    const robusta = (g) => { const a = backtest({ ...VIDEO, ...g }, Mv), b = backtest({ ...VIDEO, ...g }, Mn); return a.n >= 8 && b.n >= 8 ? Math.min(a.t, b.t) + Math.min(a.med, b.med) / 10 : -99; };
    const cand = [], vistos = new Set(seen), t1 = Date.now(), padres = top.length ? top : ranked.slice(0, 5);
    for (let i = 0; i < 1500 && Date.now() - t1 < 12e3; i++) {
      const r = rnd(); let g, why;
      if (r < 0.45 && padres.length) { const p = padres[Math.floor(rnd() * padres.length)]; g = mutar(p.g); why = "búsqueda: mutación de " + p.id; }
      else if (r < 0.6 && padres.length > 1) { const a = padres[Math.floor(rnd() * padres.length)], b = padres[Math.floor(rnd() * padres.length)]; if (a === b) continue; g = cruzar(a.g, b.g); why = "búsqueda: cruce de " + a.id + " y " + b.id; }
      else if (r < 0.8) { const x = rnd(), base = x < 0.35 ? TURBO : x < 0.7 ? VOLATIL : VIDEO; g = mutar(mutar(base)); if (base === VOLATIL) g.estilo = "volatil"; why = base === TURBO ? "búsqueda: variante del Turbo" : base === VOLATIL ? "búsqueda: variante de Volátiles" : "búsqueda: variante del vídeo"; }
      else { g = aleatorio(); why = "búsqueda: inventada"; }
      const k = gkey(g); if (vistos.has(k)) continue; vistos.add(k); cand.push({ g, why, s: robusta(g) });
    }
    cand.sort((a, b) => b.s - a.s); L.busqueda = { probadas: cand.length, mejor: cand.length ? r2(cand[0].s) : null, t: now.toISOString() };
    for (const c of cand.slice(0, Math.max(0, Math.ceil((POP - L.pop.length) * 0.7)))) { if (c.s <= -99) break; seen.add(gkey(c.g)); const v = nuevaVar("v" + L.nextId++, c.g, now, L.gen, c.why); v.bt = backtest({ ...VIDEO, ...c.g }, M); v.fit = fitness(v); v.rob = r2(c.s); L.pop.push(v); ev(`${v.id} nace (${c.why}) · elegida entre ${cand.length} probadas · en los casos: ${v.bt.n} operaciones, ${v.bt.med >= 0 ? "+" : ""}${v.bt.med} % de media`, "nace"); }
    if (cand.length) ev(`🔬 búsqueda: ${cand.length} reglas probadas al momento; nacen las mejores`, "ia");
  }
  while (L.pop.length < POP && guard++ < 200) {
    const r = rnd(); let g, why;
    if (top.length && r < 0.5) { const p = top[Math.floor(rnd() * top.length)]; g = mutar(p.g); why = "mutación de " + p.id; }
    else if (top.length > 1 && r < 0.8) { const a = top[Math.floor(rnd() * top.length)], b = top[Math.floor(rnd() * top.length)]; if (a === b) continue; g = cruzar(a.g, b.g); why = "cruce de " + a.id + " y " + b.id; }
    else { const inv = rnd() < 0.5; const tb = !inv && rnd() < 0.5; g = inv ? aleatorio() : mutar(tb ? TURBO : VIDEO); why = inv ? "inventada de cero" : tb ? "variante del Turbo" : "variante de las reglas del vídeo"; }
    const k = gkey(g); if (seen.has(k)) continue; seen.add(k);
    const v = nuevaVar("v" + L.nextId++, g, now, L.gen, why); if (M) { v.bt = backtest({ ...VIDEO, ...g }, M); v.fit = fitness(v); } L.pop.push(v); ev(`${v.id} nace (${why})${v.bt && v.bt.n ? ` · en las muestras: ${v.bt.n} operaciones, ${v.bt.med >= 0 ? "+" : ""}${v.bt.med} % de media` : ""}`, "nace");
  }
  if (S.genomeId) { const u = L.pop.find((v) => v.id === S.genomeId); if (u) S.genomePrueba = { bt: u.bt || null, n: u.n, med: u.n ? r2(u.s1 / u.n * 100) : null, t: now.toISOString() }; }
  // ¿adopta el terminal otras reglas? Solo con muchas operaciones y claramente mejor que las que usa ahora
  const btOk = (v) => v.bt && v.bt.n >= 60 && v.bt.pf > 1.3 && v.bt.med > 0 && v.bt.t >= 2 && v.n >= 10 && v.s1 > 0;
  const champ = ranked.find((v) => (v.n >= ADOPT_N && v.fit != null && v.fit >= 2 && v.s1 / v.n > 0) || btOk(v));
  const curKey = gkey({ ...VIDEO, ...(S.genome || {}) }), cur = L.pop.find((v) => gkey({ ...VIDEO, ...v.g }) === curKey);
  const PLAZO = Date.parse("2026-11-10T08:00:00Z"), mejor = ranked.find((v) => v.fit != null && v.fit > 0 && ((v.bt && v.bt.n >= 20) || v.n >= MIN_N));
  if (!champ && !S.genomeId && now.getTime() >= PLAZO - 6 * 3600e3 && mejor && mejor.id !== "v0") { S.genome = { ...mejor.g }; S.genomeId = mejor.id; S.genomePrueba = { bt: mejor.bt || null, n: mejor.n, med: mejor.n ? r2(mejor.s1 / mejor.n * 100) : null, t: now.toISOString() }; L.adopt.unshift({ t: now.toISOString(), id: mejor.id, fit: mejor.fit, n: mejor.n, plazo: true }); ev(`🗓️ se acerca tu plazo: el terminal adopta las mejores reglas que hay (${mejor.id}, nota ${mejor.fit})`, "adopta"); }
  if (champ && gkey({ ...VIDEO, ...champ.g }) !== curKey && (!cur || cur.fit == null || champ.fit > cur.fit + 0.5)) {
    S.genome = { ...champ.g }; S.genomeId = champ.id; S.genomePrueba = { bt: champ.bt || null, n: champ.n, med: champ.n ? r2(champ.s1 / champ.n * 100) : null, t: now.toISOString() }; L.adopt.unshift({ t: now.toISOString(), id: champ.id, fit: champ.fit, n: champ.n }); L.adopt = L.adopt.slice(0, 50);
    ev(`🏆 el terminal adopta las reglas de ${champ.id} (nota ${champ.fit} con ${champ.n} operaciones)`, "adopta");
  }
  // ⚡ el Turbo adopta la mejor variante MUY activa (≥ 8 operaciones al día y ≥ 20 en total) que gane de verdad y supere a la que usa
  const diaria = (v) => v.n / Math.max(0.5, ageH(v) / 24), tCur = L.pop.find((v) => v.id === (S.turboGenomeId || "vt"));
  const tChamp = ranked.find((v) => v.n >= 20 && diaria(v) >= 8 && v.fit != null && v.fit >= 1 && v.s1 > 0);
  if (tChamp && tChamp.id !== (S.turboGenomeId || "vt") && (!tCur || tCur.fit == null || tChamp.fit > tCur.fit + 0.3)) {
    S.turboGenome = { ...tChamp.g }; S.turboGenomeId = tChamp.id; S.turboAdopt = (S.turboAdopt || []).concat([{ t: now.toISOString(), id: tChamp.id, fit: tChamp.fit, n: tChamp.n }]).slice(-20);
    ev(`⚡ el Turbo adopta las reglas de ${tChamp.id} (nota ${tChamp.fit}, ${tChamp.n} operaciones, ${Math.round(diaria(tChamp))} al día)`, "adopta");
  }
  // 🌪️ Volátiles adopta la mejor variante de su estilo que opere a menudo (≥ 4 al día, ≥ 15 en total) y gane
  const vCur = L.pop.find((v) => v.id === (S.volatGenomeId || "vv")), vChamp = ranked.find((v) => (v.g.estilo === "volatil") && v.n >= 15 && diaria(v) >= 4 && v.fit != null && v.fit >= 1 && v.s1 > 0);
  if (vChamp && vChamp.id !== (S.volatGenomeId || "vv") && (!vCur || vCur.fit == null || vChamp.fit > vCur.fit + 0.3)) { S.volatGenome = { ...vChamp.g }; S.volatGenomeId = vChamp.id; ev(`🌪️ Volátiles adopta las reglas de ${vChamp.id} (nota ${vChamp.fit}, ${vChamp.n} operaciones)`, "adopta"); }
  return { gen: L.gen, out: out.length };
}
// lo que va aprendiendo: en qué se diferencian las 5 mejores de las reglas del vídeo
export function aprendido(L) {
  const best = L.pop.filter((v) => v.fit != null).sort((a, b) => b.fit - a.fit).slice(0, 5); if (best.length < 2) return [];
  const out = [];
  for (const k of Object.keys(RANGOS)) { const vs = best.map((v) => +v.g[k]).sort((a, b) => a - b), med = vs[Math.floor(vs.length / 2)], base = VIDEO[k], [a, b] = RANGOS[k], d = (med - base) / (b - a); if (Math.abs(d) >= 0.08) out.push({ k, n: NOMBRES[k], base, med, d: r2(d) }); }
  return out.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
}
