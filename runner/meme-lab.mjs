// v164 · 🧬 LABORATORIO DE MEMES («bola de aprendizaje»): una población de variantes de las reglas del vídeo opera A LA VEZ, con dinero
// ficticio (50 € cada una), los MISMOS datos en vivo y costes reales. Cada ~3 h se juzgan: las peores se archivan (nunca se borran) y nacen
// otras (mutaciones y cruces de las mejores, y alguna inventada de cero). Si una variante demuestra con muchas operaciones que es mejor que las
// reglas que usa el terminal, el terminal la adopta solo. La variante «vídeo» (las reglas originales) no se elimina nunca: es la referencia.
import { R, VIDEO, conGenoma, explorador, reglas, analista, equity, RULES, ESTILOS } from "./meme.mjs";
const ESTS = Object.keys(ESTILOS);

export const POP = 30, GEN_H = 2, MIN_N = 8, ADOPT_N = 30;
// rango de cada pieza del genoma [mín, máx, paso]
export const RANGOS = {
  ageMin: [5, 240, 5], ageMax: [120, 7 * 1440, 60], mcapMin: [50e3, 2e6, 50e3], mcapMax: [2e6, 100e6, 1e6],
  liqMin: [10e3, 150e3, 5e3], vol1hMin: [10e3, 300e3, 10e3], top10Max: [10, 50, 1], devMax: [1, 10, 0.5], bundleMax: [3, 30, 1],
  pump1hMax: [30, 300, 10], lpLockMin: [50, 100, 5], stop: [0.03, 0.25, 0.01], trailOn: [0.05, 0.5, 0.01], trail: [0.05, 0.4, 0.01], tp: [0.1, 1.5, 0.05], tpFrac: [0, 0.7, 0.05], orgMin: [0, 80, 5],
  maxHoldH: [1, 72, 1], size: [0.03, 0.15, 0.01], minScore: [50, 90, 1]
};
export const NOMBRES = { ageMin: "edad mínima (min)", ageMax: "edad máxima (min)", mcapMin: "tamaño mínimo ($)", mcapMax: "tamaño máximo ($)", liqMin: "liquidez mínima ($)", vol1hMin: "volumen 1 h mínimo ($)",
  top10Max: "top 10 máx. (%)", devMax: "creador máx. (%)", bundleMax: "bloque máx. (%)", pump1hMax: "subida 1 h máx. (%)", lpLockMin: "LP bloqueada mín. (%)", stop: "stop", trailOn: "activa el móvil en", trail: "móvil bajo el máximo",
  maxHoldH: "tiempo máximo (h)", size: "tamaño de cada compra", minScore: "nota mínima", tp: "venta parcial en", tpFrac: "parte que vende", orgMin: "actividad real mínima (Jupiter)", mint: "exige mint/freeze revocados", w: "pesos de la nota" };
const r2 = (x) => Math.round(x * 100) / 100;
const snap = (k, v) => { const [a, b, st] = RANGOS[k]; return Math.max(a, Math.min(b, Math.round(v / st) * st)); };
const SIG = ["mom", "ub", "bs", "hg", "lm", "sw"];
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
export function fitness(V) {
  if (V.n < MIN_N) return null;
  const m = V.s1 / V.n, sd = Math.sqrt(Math.max(1e-9, V.s2 / V.n - m * m)), t = m / (sd / Math.sqrt(V.n));
  return r2(t - (V.dd < -0.5 ? 2 : V.dd < -0.35 ? 1 : 0));
}
const slipR = (eur, liq) => Math.min(R.slipMax, R.slipMin + eur / Math.max(1, liq));

// una vuelta de una variante (con costes reales). info y g vienen ya calculados del terminal (los mismos datos para todas)
export function pasoVar(V, by, now, ext, smart, hold, rnd = Math.random) {
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
      if (pr <= p.px * (1 - G.stop)) cerrar(a, pr, liq, "stop");
      else if (p.tr && pr <= p.peak * (1 - G.trail)) cerrar(a, pr, liq, "móvil");
      else if ((tnow - Date.parse(p.t0)) / 3600e3 >= G.maxHoldH) cerrar(a, pr, liq, "tiempo");
    }
    if (ext.full) {
      const S0 = { smart: smart || {}, hold: hold || {} }, cands = [];
      for (const [a, q] of Object.entries(by)) {
        if (V.pos[a] || explorador(q, tnow)) continue; if (V.cool[a] && tnow - V.cool[a] < G.cooldownH * 3600e3) continue;
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
export function evolucionar(L, S, now = new Date(), rnd = Math.random) {
  if (now - Date.parse(L.lastGen) < GEN_H * 3600e3) return null;
  L.lastGen = now.toISOString(); L.gen++;
  const ev = (txt, k) => { L.log.unshift({ t: now.toISOString(), k, txt }); L.log = L.log.slice(0, 200); };
  for (const v of L.pop) v.fit = fitness(v);
  const ageH = (v) => (now - Date.parse(v.born)) / 3600e3;
  const ranked = L.pop.slice().sort((a, b) => (b.fit ?? -99) - (a.fit ?? -99) || b.lastEq - a.lastEq);
  // fuera: las peores con pruebas suficientes, y las que en 48 h casi no operan (reglas tan duras que no sirven)
  const out = ranked.filter((v) => v.id !== "v0" && ((v.fit != null && v.fit < 0 && ranked.indexOf(v) >= POP * 0.6) || (ageH(v) > 48 && v.n < 3))).slice(-Math.ceil(POP * 0.25));
  for (const v of out) { L.arch.unshift({ id: v.id, g: v.g, gen: v.gen, born: v.born, out: now.toISOString(), n: v.n, fit: v.fit, ret: r2((v.lastEq / R.start - 1) * 100), win: v.n ? Math.round(v.w / v.n * 100) : null, why: v.n < 3 ? "casi no opera" : "de las peores" }); ev(`${v.id} se archiva (${v.n < 3 ? "casi no opera" : "nota " + v.fit}) · ${r2((v.lastEq / R.start - 1) * 100)} %`, "sale"); }
  L.arch = L.arch.slice(0, 3000); L.pop = L.pop.filter((v) => !out.includes(v));
  const top = ranked.filter((v) => !out.includes(v) && v.fit != null && v.fit > 0).slice(0, 5), seen = new Set(L.pop.map((v) => gkey(v.g)));
  let guard = 0;
  while (L.pop.length < POP && guard++ < 200) {
    const r = rnd(); let g, why;
    if (top.length && r < 0.5) { const p = top[Math.floor(rnd() * top.length)]; g = mutar(p.g); why = "mutación de " + p.id; }
    else if (top.length > 1 && r < 0.8) { const a = top[Math.floor(rnd() * top.length)], b = top[Math.floor(rnd() * top.length)]; if (a === b) continue; g = cruzar(a.g, b.g); why = "cruce de " + a.id + " y " + b.id; }
    else { const inv = rnd() < 0.5; g = inv ? aleatorio() : mutar(VIDEO); why = inv ? "inventada de cero" : "variante de las reglas del vídeo"; }
    const k = gkey(g); if (seen.has(k)) continue; seen.add(k);
    const v = nuevaVar("v" + L.nextId++, g, now, L.gen, why); L.pop.push(v); ev(`${v.id} nace (${why})`, "nace");
  }
  // ¿adopta el terminal otras reglas? Solo con muchas operaciones y claramente mejor que las que usa ahora
  const champ = ranked.find((v) => v.n >= ADOPT_N && v.fit != null && v.fit >= 2 && v.s1 / v.n > 0);
  const curKey = gkey({ ...VIDEO, ...(S.genome || {}) }), cur = L.pop.find((v) => gkey({ ...VIDEO, ...v.g }) === curKey);
  if (champ && gkey({ ...VIDEO, ...champ.g }) !== curKey && (!cur || cur.fit == null || champ.fit > cur.fit + 0.5)) {
    S.genome = { ...champ.g }; S.genomeId = champ.id; L.adopt.unshift({ t: now.toISOString(), id: champ.id, fit: champ.fit, n: champ.n }); L.adopt = L.adopt.slice(0, 50);
    ev(`🏆 el terminal adopta las reglas de ${champ.id} (nota ${champ.fit} con ${champ.n} operaciones)`, "adopta");
  }
  return { gen: L.gen, out: out.length };
}
// lo que va aprendiendo: en qué se diferencian las 5 mejores de las reglas del vídeo
export function aprendido(L) {
  const best = L.pop.filter((v) => v.fit != null).sort((a, b) => b.fit - a.fit).slice(0, 5); if (best.length < 2) return [];
  const out = [];
  for (const k of Object.keys(RANGOS)) { const vs = best.map((v) => +v.g[k]).sort((a, b) => a - b), med = vs[Math.floor(vs.length / 2)], base = VIDEO[k], [a, b] = RANGOS[k], d = (med - base) / (b - a); if (Math.abs(d) >= 0.08) out.push({ k, n: NOMBRES[k], base, med, d: r2(d) }); }
  return out.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
}
