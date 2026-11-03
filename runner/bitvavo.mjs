// v198 · 🇪🇺 BITVAVO (SOLO DINERO FICTICIO): criptos contra euros en un exchange europeo regulado (MiCA, aprobado en España).
// Costes bajos (0,25 % por orden + la mitad del diferencial compra/venta), así que tiene sentido hacer muchas compras y ventas.
// Cada minuto: precios de todos los mercados en euros (1 petición) y velas de 5 min de los más líquidos; el terminal compra cuando
// sus reglas (el «genoma») ven una oportunidad y vende con stop, venta parcial, stop móvil y tiempo máximo.
// 🧠 APRENDE SOLO: cada 30 min descarga ~3,5 días de velas de 5 min de los 40 mercados más líquidos y prueba al momento cientos
// de reglas distintas con los costes reales; cada regla se puntúa con su PEOR mitad (días antiguos y recientes por separado).
// El terminal adopta la mejor solo si gana en las dos mitades; si ninguna gana, opera en «modo prueba» (compras a la mitad).
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const API = "https://api.bitvavo.com/v2", REPO = process.env.GITHUB_REPOSITORY || "", TOKEN = process.env.GITHUB_TOKEN || "";
const RAMA = "bitvavo", RAMA_H = "bitvavo-hist";
export const FEE = 0.0025, START = 100, MIN_VOL = 2e5, MAX_MKT = 50, HIST_MKT = 40, GEN_MIN = 10, POP = 60, ESTS = ["tendencia", "rebote", "ruptura", "media"];   // v205 · aprende cada 10 min, con 7 días y 4 estilos
export const NO = /^(USDC|USDT|EURC|EURT|DAI|PYUSD|TUSD|FDUSD|USDE|EURI|XAUT|PAXG)-/;   // estables y oro: no se mueven
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cl = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- reglas (genoma). Estilos: «tendencia» (sube con fuerza y sin pasarse) o «rebote» (cayó mucho y empieza a girarse)
export const BASE = { estilo: "tendencia", m15Min: 0.002, m60Min: 0.006, m60Max: 0.05, m240Min: -0.01, ema: 1, hlMin: 0.5, volMin: 1.2, pullMax: 0.03,
  stop: 0.025, tp: 0.03, tpFrac: 0.5, trailOn: 0.015, trail: 0.012, maxHoldH: 6, size: 0.15, maxPos: 6, cooldownH: 1 };
export const RANG = { m15Min: [-0.01, 0.01], m60Min: [-0.02, 0.03], m60Max: [0.01, 0.12], m240Min: [-0.15, 0.03], hlMin: [0, 1], volMin: [0.5, 4], pullMax: [0.005, 0.1],
  stop: [0.008, 0.08], tp: [0.006, 0.12], tpFrac: [0, 0.8], trailOn: [0.004, 0.06], trail: [0.003, 0.05], maxHoldH: [0.5, 48], size: [0.05, 0.25], cooldownH: [0.25, 12] };
export function aleatorio(rnd = Math.random) { const g = { ...BASE, estilo: ESTS[Math.floor(rnd() * ESTS.length)], ema: rnd() < 0.7 ? 1 : 0 }; for (const [k, [a, b]] of Object.entries(RANG)) g[k] = r4(a + rnd() * (b - a)); return g; }
export function mutar(p, rnd = Math.random) {
  const g = { ...p }, ks = Object.keys(RANG), n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const k = ks[Math.floor(rnd() * ks.length)], [a, b] = RANG[k]; g[k] = r4(cl(g[k] + (rnd() - 0.5) * (b - a) * 0.3, a, b)); }
  if (rnd() < 0.1) g.estilo = ESTS[Math.floor(rnd() * ESTS.length)]; if (rnd() < 0.08) g.ema = g.ema ? 0 : 1; return g;
}
export function cruzar(a, b, rnd = Math.random) { const g = {}; for (const k of Object.keys(BASE)) g[k] = rnd() < 0.5 ? a[k] : b[k]; return g; }
export const gkey = (g) => JSON.stringify(Object.keys(BASE).map((k) => (typeof g[k] === "number" ? r4(g[k]) : g[k])));

// ---- rasgos de cada vela de 5 min (iguales en el backtest y en vivo). c = [[t, o, h, l, c, v], …] de antigua a reciente
export function rasgos(c) {
  const n = c.length, cs = c.map((x) => x[4]), out = new Array(n).fill(null); let e = cs[0]; const k = 2 / 21;
  for (let i = 0; i < n; i++) {
    e = cs[i] * k + e * (1 - k); if (i < 48) continue;
    const ch = (j) => cs[i] / cs[i - j] - 1, w = cs.slice(i - 11, i + 1), m1 = Math.min(...w.slice(0, 4)), m2 = Math.min(...w.slice(4, 8)), m3 = Math.min(...w.slice(8));
    let va = 0; for (let j = i - 47; j <= i - 4; j++) va += c[j][5]; va /= 44; const vr = (c[i][5] + c[i - 1][5] + c[i - 2][5]) / 3 / Math.max(1e-9, va);
    const mx = Math.max(...cs.slice(i - 23, i + 1)), mxPrev = Math.max(...cs.slice(Math.max(0, i - 287), i - 2));
    out[i] = { m15: ch(3), m60: ch(12), m240: ch(48), sobre: cs[i] > e ? 1 : 0, hl: (m2 > m1 ? 0.5 : 0) + (m3 > m2 ? 0.5 : 0), vol: vr, pull: 1 - cs[i] / mx, rompe: cs[i] / mxPrev - 1 };
  }
  return out;
}
export function entra(g, f) {
  if (!f) return false;
  // ruptura: supera el máximo de las últimas ~24 h con volumen; media: en tendencia de fondo, compra una bajada corta
  if (g.estilo === "ruptura") return f.rompe > 0 && f.rompe <= Math.max(0.004, g.pullMax) && f.vol >= g.volMin && f.m60 >= g.m60Min && f.m60 <= g.m60Max;
  if (g.estilo === "media") return f.m240 >= Math.max(0, g.m240Min) && f.m15 <= -Math.abs(g.m15Min) - 0.003 && f.pull >= 0.008 && f.pull <= g.pullMax + 0.02 && (!g.ema || !f.sobre);
  if (g.estilo === "rebote") return f.m240 <= -Math.abs(g.m240Min) - 0.03 && f.m15 >= Math.max(0.001, g.m15Min) && f.vol >= g.volMin && f.pull >= 0.02;
  return f.m15 >= g.m15Min && f.m60 >= g.m60Min && f.m60 <= g.m60Max && f.m240 >= g.m240Min && (!g.ema || f.sobre) && f.hl >= g.hlMin && f.vol >= g.volMin && f.pull <= g.pullMax;
}
// ---- backtest de un genoma sobre las velas de varios mercados (con comisión y diferencial)
export function backtest(g, H, desde = 0, hasta = Infinity) {
  const rs = [];
  for (const m of Object.values(H.m || {})) {
    const c = m.c, F = m.f, sp = m.sp || 0.001; let pos = null, cool = 0;
    for (let i = 48; i < c.length; i++) {
      const t = c[i][0]; if (t < desde || t >= hasta) { if (pos && t >= hasta) { rs.push(pos.cob + pos.q * c[i][4] * (1 - sp / 2) * (1 - FEE) - 1); pos = null; } continue; }
      if (pos) {
        const [, , h, l, cc] = c[i]; pos.peak = Math.max(pos.peak, h); const ven = (px) => pos.q * px * (1 - sp / 2) * (1 - FEE);
        if (g.tpFrac > 0 && !pos.tp && h >= pos.px * (1 + g.tp)) { pos.cob += pos.q * g.tpFrac * pos.px * (1 + g.tp) * (1 - sp / 2) * (1 - FEE); pos.q *= 1 - g.tpFrac; pos.tp = 1; }
        let out = null;
        if (l <= pos.px * (1 - g.stop)) out = Math.min(c[i][1], pos.px * (1 - g.stop));
        else if (pos.peak >= pos.px * (1 + g.trailOn) && l <= pos.peak * (1 - g.trail)) out = Math.min(c[i][1], pos.peak * (1 - g.trail));
        else if ((t - pos.t) / 3600e3 >= g.maxHoldH) out = cc;
        if (out != null) { rs.push(pos.cob + ven(out) - 1); pos = null; cool = t + g.cooldownH * 3600e3; }
        continue;
      }
      if (t >= cool && entra(g, F[i]) && i + 1 < c.length) { const px = c[i + 1][1] * (1 + sp / 2); pos = { px, q: (1 - FEE) / px, cob: 0, peak: px, t: c[i + 1][0] }; i++; }
    }
  }
  const n = rs.length; if (!n) return { n: 0 };
  const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(Math.max(1e-12, rs.reduce((a, b) => a + (b - m) ** 2, 0) / n));
  let gw = 0, gl = 0, w = 0; for (const x of rs) { if (x > 0) { gw += x; w++; } else gl -= x; }
  return { n, win: r2(w / n * 100), med: r4(m * 100), pf: gl > 0 ? r2(gw / gl) : gw > 0 ? 99 : 0, t: r2(m / (sd / Math.sqrt(n))) };
}
export function robusta(g, H) {
  const ts = Object.values(H.m || {}).flatMap((m) => m.c.slice(48).map((x) => x[0])).sort((a, b) => a - b); if (!ts.length) return { s: -99 };
  const corte = ts[Math.floor(ts.length / 2)], a = backtest(g, H, 0, corte), b = backtest(g, H, corte);
  if (!(a.n >= 10 && b.n >= 10)) return { s: -99, a, b };
  return { s: r2(Math.min(a.t, b.t) + Math.min(a.med, b.med) * 2), a, b, ok: a.med > 0 && b.med > 0 && a.pf > 1.15 && b.pf > 1.15 };
}

// ---- estado
export function fresh(now = new Date()) {
  return { v: 1, start: START, cash: START, pos: {}, closed: [], log: [], eq: [], cool: {}, st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0 }, since: now.toISOString(),
    genome: { ...BASE }, genomeId: "base", prueba: true, lab: { gen: 0, lastGen: null, pop: [], log: [], adopt: [] } };
}
const L = (S, now, ev, sym, txt) => { S.log.unshift({ t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 200); };
const equity = (S, px) => S.cash + Object.entries(S.pos).reduce((t, [m, p]) => t + p.q * ((px[m] && px[m].bid) || p.last || p.px), 0);
function cerrar(S, m, now, bid, why) {
  const p = S.pos[m], got = p.q * bid * (1 - FEE), gotT = got + (p.cob || 0), pnl = gotT - p.cost;
  S.cash += got; S.st.pnl += pnl; S.st.fees += p.q * bid * FEE; if (pnl >= 0) S.st.wins++; else S.st.losses++;
  S.closed.unshift({ m, sym: m.replace("-EUR", ""), t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(gotT), pnl: r2(pnl), pc: r2((gotT / p.cost - 1) * 100), why: p.cob ? why + " (tras vender parte con ganancia)" : why, h: (p.h || []).slice(-120), px0: p.px, peak: p.peak, out: bid });
  S.closed = S.closed.slice(0, 500); S.cool[m] = now.getTime(); delete S.pos[m];
  L(S, now, pnl >= 0 ? "WIN" : "LOSS", m.replace("-EUR", ""), `${pnl >= 0 ? "+" : ""}${r2(pnl)} € · ${r2((gotT / p.cost - 1) * 100)} % · ${why}`);
}
// una vuelta: vigila lo abierto y compra lo que diga el genoma
export function paso(S, tick, F, now = new Date()) {
  const g = { ...BASE, ...S.genome }, tnow = now.getTime(), px = tick;
  for (const [m, p] of Object.entries(S.pos)) {
    const t = tick[m]; if (!t || !(t.bid > 0)) continue; const bid = t.bid;
    p.last = bid; p.peak = Math.max(p.peak, bid); p.h = (p.h || []).concat([[now.toISOString(), bid]]).slice(-200);
    if (g.tpFrac > 0 && !p.tp && bid >= p.px * (1 + g.tp)) { const qv = p.q * g.tpFrac, got = qv * bid * (1 - FEE); S.cash += got; p.cob = (p.cob || 0) + got; p.q -= qv; p.tp = 1; S.st.fees += qv * bid * FEE; L(S, now, "TP", m.replace("-EUR", ""), `+${r2(g.tp * 100)} %: vende el ${Math.round(g.tpFrac * 100)} %`); }
    if (bid <= p.px * (1 - g.stop)) cerrar(S, m, now, bid, `stop −${r2(g.stop * 100)} %`);
    else if (p.peak >= p.px * (1 + g.trailOn) && bid <= p.peak * (1 - g.trail)) cerrar(S, m, now, bid, `stop móvil (${r2(g.trail * 100)} % bajo el máximo)`);
    else if ((tnow - Date.parse(p.t0)) / 3600e3 >= g.maxHoldH) cerrar(S, m, now, bid, `tiempo máximo (${g.maxHoldH} h)`);
  }
  if (!F) return;
  const cand = Object.entries(F).filter(([m, f]) => !S.pos[m] && !(S.cool[m] && tnow - S.cool[m] < g.cooldownH * 3600e3) && entra(g, f) && tick[m] && tick[m].ask > 0)
    .sort((a, b) => b[1].m60 - a[1].m60);
  for (const [m, f] of cand) {
    if (Object.keys(S.pos).length >= g.maxPos) break;
    const eq = equity(S, tick), amt = Math.min(S.cash, eq * g.size * (S.prueba ? 0.5 : 1)); if (amt < 2) break;
    const ask = tick[m].ask, q = amt * (1 - FEE) / ask; S.cash -= amt; S.st.trades++; S.st.fees += amt * FEE;
    S.pos[m] = { sym: m.replace("-EUR", ""), q, px: ask, cost: amt, t0: now.toISOString(), peak: ask, last: ask, h: [[now.toISOString(), ask]], f: { m15: r4(f.m15), m60: r4(f.m60), m240: r4(f.m240), vol: r2(f.vol) } };
    L(S, now, "ENTER", m.replace("-EUR", ""), `${r2(amt)} € · sube ${r2(f.m60 * 100)} % en 1 h · volumen ×${r2(f.vol)}${S.prueba ? " · modo prueba (mitad)" : ""}`);
  }
}
// ---- laboratorio: búsqueda dirigida con backtest robusto
export function evolucionar(S, H, now = new Date(), rnd = Math.random, budgetMs = 20e3) {
  const B = S.lab; B.gen++; B.lastGen = now.toISOString(); const t0 = Date.now(), ev = (txt) => { B.log.unshift({ t: now.toISOString(), txt }); B.log = B.log.slice(0, 120); };
  for (const v of B.pop) Object.assign(v, robustaV(v.g, H));
  if (!B.pop.some((v) => v.id === "base")) B.pop.push({ id: "base", g: { ...BASE }, born: now.toISOString(), why: "reglas de partida", ...robustaV(BASE, H) });
  const top = B.pop.slice().sort((a, b) => b.s - a.s).slice(0, 8), seen = new Set(B.pop.map((v) => gkey(v.g))), cand = [];
  for (let i = 0; i < 2000 && Date.now() - t0 < budgetMs; i++) {
    const r = rnd(); let g, why;
    if (r < 0.5 && top.length) { const p = top[Math.floor(rnd() * top.length)]; g = mutar(p.g, rnd); why = "mutación de " + p.id; }
    else if (r < 0.7 && top.length > 1) { const a = top[Math.floor(rnd() * top.length)], b = top[Math.floor(rnd() * top.length)]; if (a === b) continue; g = cruzar(a.g, b.g, rnd); why = `cruce de ${a.id} y ${b.id}`; }
    else { g = aleatorio(rnd); why = "inventada"; }
    const k = gkey(g); if (seen.has(k)) continue; seen.add(k); cand.push({ g, why, ...robustaV(g, H) });
  }
  const todos = B.pop.concat(cand.map((c) => ({ id: "b" + (B.next = (B.next || 0) + 1), g: c.g, born: now.toISOString(), why: c.why, s: c.s, ok: c.ok, a: c.a, b: c.b })))
    .sort((a, b) => b.s - a.s);
  const keep = todos.filter((v) => v.id === "base" || v.id === S.genomeId).concat(todos.filter((v) => v.id !== "base" && v.id !== S.genomeId)).slice(0, POP);
  const nuevos = keep.filter((v) => !B.pop.includes(v)).length; B.pop = keep; B.probadas = cand.length;
  ev(`🔬 generación ${B.gen}: ${cand.length} reglas probadas en ${Object.keys(H.m || {}).length} mercados · entran ${nuevos} nuevas`);
  // adopción: la mejor que gane en las DOS mitades; si ninguna, la mejor en «modo prueba»
  const best = B.pop.slice().sort((a, b) => b.s - a.s)[0], ganadora = B.pop.filter((v) => v.ok).sort((a, b) => b.s - a.s)[0];
  const elegida = ganadora || best;
  if (elegida && (elegida.id !== S.genomeId || S.prueba !== !ganadora)) {
    S.genome = { ...elegida.g }; S.genomeId = elegida.id; S.prueba = !ganadora;
    B.adopt.unshift({ t: now.toISOString(), id: elegida.id, s: elegida.s, ok: !!ganadora }); B.adopt = B.adopt.slice(0, 50);
    ev(ganadora ? `🏆 adopta ${elegida.id}: gana en los días antiguos (${elegida.a.med} % de media, ${elegida.a.n} ops) y en los recientes (${elegida.b.med} %, ${elegida.b.n} ops)` : `🧪 ninguna regla gana aún en las dos mitades: usa la mejor (${elegida.id}) en modo prueba, con compras a la mitad`);
  }
  return { gen: B.gen, probadas: cand.length };
}
function robustaV(g, H) { const r = robusta(g, H); return { s: r.s, ok: !!r.ok, a: r.a || null, b: r.b || null }; }

// ---- red
async function J(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "bot-trading" }, signal: AbortSignal.timeout(15000) }); if (r.status === 429) { await sleep(2000 * (i + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { if (i === tries - 1) throw e; await sleep(1000 * (i + 1)); }
  }
  return null;
}
async function enParalelo(xs, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const x = xs[i++]; await fn(x); } })); }
const velas = (j) => (Array.isArray(j) ? j.map((x) => [+x[0], +x[1], +x[2], +x[3], +x[4], +x[5]]).filter((x) => x[4] > 0).sort((a, b) => a[0] - b[0]) : []);
async function leer(f, rama) {
  if (!REPO || !TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=${rama}`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null; if (!r.ok) throw new Error("no pude leer " + f + " (HTTP " + r.status + ")"); return await r.json();
}
function publicar(f, obj, rama) {
  const out = JSON.stringify(obj); if (!REPO || !TOKEN) { writeFileSync(f, out); return; }
  const pub = path.join(process.cwd(), ".pub-" + rama); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, f), out);
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g("init -q -b x"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add -A"); g(`commit -q -m "${rama} ${new Date().toISOString()}"`);
  for (let i = 0; i < 3; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${rama}`); return; } catch (e) { if (i === 2) console.log("Bitvavo: no pude guardar " + f); } }
}

async function main() {
  const now = new Date(), t0 = Date.now();
  let S = null; try { S = await leer("bitvavo.json", RAMA); } catch (e) { console.log("Bitvavo: " + e.message); return; }
  if (!S || S.v !== 1) { S = fresh(now); L(S, now, "INFO", "", "🇪🇺 empieza Bitvavo con 100 € ficticios: criptos contra euros, costes del 0,25 %"); }
  // 1) precios de todo (una petición)
  const T = await J(`${API}/ticker/24h`); if (!Array.isArray(T)) { console.log("Bitvavo: sin precios"); return; }
  const tick = {}, uni = [];
  for (const x of T) { if (!/-EUR$/.test(x.market) || NO.test(x.market)) continue; const bid = +x.bid, ask = +x.ask, vq = +x.volumeQuote || 0; if (!(bid > 0 && ask > 0)) continue; tick[x.market] = { bid, ask, last: +x.last, vq, ch24: +x.open > 0 ? +x.last / +x.open - 1 : 0, sp: (ask - bid) / ((ask + bid) / 2) }; if (vq >= MIN_VOL && tick[x.market].sp < 0.01) uni.push(x.market); }
  uni.sort((a, b) => tick[b].vq - tick[a].vq); const U = uni.slice(0, MAX_MKT);
  // 2) velas de 5 min de los mercados líquidos (y de lo abierto) → rasgos
  const F = {}, quiero = [...new Set([...U, ...Object.keys(S.pos)])];
  await enParalelo(quiero, 8, async (m) => { try { const c = velas(await J(`${API}/${m}/candles?interval=5m&limit=80`, 2)); const f = rasgos(c); F[m] = f[f.length - 1]; } catch (e) { S.err = String(e.message).slice(0, 60); } });
  paso(S, tick, F, now);
  // 3) laboratorio cada 30 min
  let H = null;
  if (!S.lab.lastGen || now - Date.parse(S.lab.lastGen) >= GEN_MIN * 60000) {
    H = { m: {} }; const hm = U.slice(0, HIST_MKT);
    // 7 días: dos tandas de 1.000 velas de 5 min por mercado
    await enParalelo(hm, 6, async (m) => { try { const c1 = velas(await J(`${API}/${m}/candles?interval=5m&limit=1000`, 2)); const c0 = c1.length ? velas(await J(`${API}/${m}/candles?interval=5m&limit=1000&end=${c1[0][0] - 1}`, 2)) : []; const c = c0.concat(c1); if (c.length > 300) H.m[m] = { c, f: rasgos(c), sp: tick[m].sp }; } catch (e) {} });
    if (Object.keys(H.m).length >= 10) { const evo = evolucionar(S, H, now, Math.random, Math.max(5e3, 45e3 - (Date.now() - t0))); L(S, now, "INFO", "", `🔬 generación ${evo.gen}: ${evo.probadas} reglas probadas en ${Object.keys(H.m).length} mercados`); }
  }
  const eq = equity(S, tick); S.eq.push([now.toISOString(), r2(eq)]); if (S.eq.length > 3000) S.eq = S.eq.filter((_, i) => i % 2 === 0 || i > S.eq.length - 500);
  S.lastEq = r2(eq); S.last = now.toISOString(); S.diag = { mercados: Object.keys(tick).length, liquidos: U.length, velas: Object.keys(F).length, t: now.toISOString(), seg: Math.round((Date.now() - t0) / 1000) };
  S.top = U.slice(0, 12).map((m) => ({ m, sym: m.replace("-EUR", ""), px: tick[m].last, ch24: r2(tick[m].ch24 * 100), f: F[m] ? { m60: r2(F[m].m60 * 100), vol: r2(F[m].vol), ok: entra({ ...BASE, ...S.genome }, F[m]) } : null }));
  for (const v of S.lab.pop) { delete v.c; }
  // 🔔 avisos por Telegram cuando algo es MUY efectivo
  try {
    const AV = await import("./avisos.mjs"); S.av = S.av || {}; const msgs = AV.avisosCuenta(S.av, "bv", "🇪🇺 Bitvavo", S, now, { med: 1, big: 5 });
    const ad = (S.lab.adopt || [])[0]; if (ad && ad.ok && now - Date.parse(ad.t) < 3 * 60000) { const m = AV.avisoReglas(S.av, "bv-adopta:" + ad.id, `🏆 Bitvavo ha encontrado reglas que GANAN tanto en los días antiguos como en los recientes (${ad.id}). Deja el modo prueba y opera con ellas (dinero ficticio).`, now); if (m) msgs.push(m); }
    for (const m of msgs.slice(0, 4)) await AV.tg(m);
  } catch (e) { console.log("Bitvavo: avisos no enviados"); }
  publicar("bitvavo.json", S, RAMA);
  console.log(`Bitvavo: ${U.length} mercados · saldo ${S.lastEq} € · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades} · gen ${S.lab.gen} · ${S.diag.seg} s`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Bitvavo: " + (e.message || e)); process.exit(0); });
