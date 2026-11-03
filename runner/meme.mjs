// v159 · 🪙 MEMES · TERMINAL (SOLO DINERO FICTICIO): imita el «Grok Bot Terminal» de memecoins de Solana que circula por redes,
// con sus 6 agentes (explorador, filtro, analista, ejecutor, riesgo y registro), sus 8 reglas duras y su nota de 6 señales,
// pero con costes REALISTAS para saber con números si gana de verdad. Nunca toca dinero real ni Trading 212 (no tiene memecoins).
// Fuentes públicas y gratuitas: DexScreener (monedas y precios), GeckoTerminal (piscinas nuevas, tendencias y operaciones con cartera)
// y RugCheck (autoridades, liquidez bloqueada, poseedores, creador, redes de insiders). Estado en la rama «meme» (meme.json):
// sin secretos ni importes reales (empieza con 500 de prueba; la app lo muestra a la escala de lo que has ingresado en Trading 212).
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO = process.env.GITHUB_REPOSITORY || "", TOKEN = process.env.GITHUB_TOKEN || "";
const DS = "https://api.dexscreener.com", GT = "https://api.geckoterminal.com/api/v2", RC = "https://api.rugcheck.xyz/v1";
export const R = {
  start: 500, size: 0.08, maxPos: 8, minScore: 70,
  ageMin: 30, ageMax: 72 * 60, mcapMin: 300e3, mcapMax: 20e6,                     // explorador
  liqMin: 40e3, vol1hMin: 50e3, top10Max: 25, devMax: 3, bundleMax: 10, pump1hMax: 80, lpLockMin: 90, // filtro
  stop: 0.06, trailOn: 0.12, trail: 0.15, maxHoldH: 24, rugLiq: 5000, cooldownH: 24, // riesgo
  fee: 0.005, slipMin: 0.01, slipMax: 0.12, failP: 0.05, failCost: 0.02,          // costes realistas
  rcPerRun: 14, gtPerRun: 10, smartUp: 0.5, smartMinList: 20
};
// las 8 reglas duras, en el orden de la pantalla del vídeo
export const RULES = [
  ["mint", "mint / freeze revocados"], ["lp", "LP quemada o bloqueada"], ["liq", "liquidez ≥ 40 k$"], ["vol", "volumen 1 h ≥ 50 k$"],
  ["top10", "top 10 poseedores ≤ 25 %"], ["dev", "creador ≤ 3 % · sin rugs"], ["bundle", "lanzamiento en bloque ≤ 10 %"], ["pump", "subida 1 h ≤ 80 %"]
];
export const SIGS = [["mom", "impulso"], ["ub", "compradores únicos"], ["bs", "compras / ventas"], ["hg", "crecimiento de poseedores"], ["lm", "liquidez / tamaño"], ["sw", "carteras listas"]];
const r2 = (x) => Math.round(x * 100) / 100;
const cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
const madrid = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(Math.round(n));

async function J(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "bot-trading-memes" }, signal: AbortSignal.timeout(15000) }); if (r.status === 429) { await sleep(2500 * (i + 1)); continue; } if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { if (i === tries - 1) throw e; await sleep(1200 * (i + 1)); }
  }
  return null;
}
export function freshState() {
  return { v: 3, start: R.start, cash: R.start, pos: {}, closed: [], log: [], line: 0, eq: [], seen: {}, cool: {}, young: {}, rc: {}, hold: {}, watch: {}, smart: {}, flow: [], ag: {},
    st: { seen: 0, killed: 0, scored: 0, trades: 0, wins: 0, losses: 0, fees: 0, failed: 0, rugs: 0, pnl: 0, stops: 0, worst: 0, best: 0 }, rk: {}, rate: [], nights: [], since: new Date().toISOString() };
}
export function bestPairs(pairs) { const m = {}; for (const p of pairs || []) { if (!p || p.chainId !== "solana" || !p.baseToken) continue; const a = p.baseToken.address, l = +(p.liquidity && p.liquidity.usd) || 0; if (!m[a] || l > (+(m[a].liquidity && m[a].liquidity.usd) || 0)) m[a] = p; } return m; }

// ---- lo que se saca de RugCheck ----
export function rcInfo(rc) {
  if (!rc) return null;
  const tok = rc.token || {}, sup = +tok.supply || 0, ka = rc.knownAccounts || {}, mk = rc.markets || [];
  const pools = new Set(); for (const m of mk) { for (const k of ["liquidityAAccount", "liquidityBAccount"]) { const o = m[k] && m[k].owner; if (o) pools.add(o); } if (m.pubkey) pools.add(m.pubkey); }
  for (const [k, v] of Object.entries(ka)) if (v && /AMM|LOCKER|POOL/i.test(v.type || "")) pools.add(k);
  const th = (rc.topHolders || []).filter((h) => !pools.has(h.owner) && !pools.has(h.address)).slice(0, 10);
  const top10 = th.reduce((t, h) => t + (+h.pct || 0), 0);
  let lpw = 0, lpl = 0; for (const m of mk) { const lp = m.lp || {}, w = (+lp.quoteUSD || 0) + (+lp.baseUSD || 0) || 1; lpw += w; lpl += w * (+lp.lpLockedPct || 0); }
  const lp = mk.length ? lpl / lpw : 0;
  const dev = sup > 0 ? (+rc.creatorBalance || 0) / sup * 100 : 0;
  const risks = (rc.risks || []).map((x) => String(x.name || "") + " " + String(x.description || ""));
  const devRug = risks.some((t) => /rug/i.test(t) && /creator|dev|previous|history/i.test(t)) || (rc.creatorTokens || []).some((x) => x && (x.rugged || x.isRugged));
  const bundle = sup > 0 ? (rc.insiderNetworks || []).reduce((t, n) => t + (+n.currentHolding || 0), 0) / sup * 100 : 0;
  return { mintOk: !rc.mintAuthority && !rc.freezeAuthority && !tok.mintAuthority && !tok.freezeAuthority, lp, top10, dev, devRug, bundle, holders: +rc.totalHolders || 0, rugged: !!rc.rugged, insiders: +rc.graphInsidersDetected || 0 };
}
// ---- lo que se saca de las operaciones de GeckoTerminal (cada una con su cartera) ----
export function gtInfo(trades, nowMs) {
  if (!Array.isArray(trades)) return null;
  const h = trades.map((x) => x && x.attributes).filter(Boolean).filter((a) => nowMs - Date.parse(a.block_timestamp) <= 3600e3);
  const buyers = new Set(), sellers = new Set(); let b = 0, s = 0;
  for (const a of h) { if (a.kind === "buy") { b++; buyers.add(a.tx_from_address); } else { s++; sellers.add(a.tx_from_address); } }
  return { buyers: [...buyers], ub: buyers.size, us: sellers.size, b, s };
}

// ---- las 8 reglas: cada una dice si pasa (true), falla (false) o falta el dato (null) ----
export function reglas(p, info) {
  const liq = +(p.liquidity && p.liquidity.usd) || 0, v1 = +(p.volume && p.volume.h1) || 0, ch1 = +(p.priceChange && p.priceChange.h1) || 0;
  return { liq: liq >= R.liqMin, vol: v1 >= R.vol1hMin, pump: ch1 <= R.pump1hMax,
    mint: info ? info.mintOk : null, lp: info ? info.lp >= R.lpLockMin : null, top10: info ? info.top10 <= R.top10Max : null,
    dev: info ? info.dev <= R.devMax && !info.devRug : null, bundle: info ? info.bundle <= R.bundleMax : null };
}
export function explorador(p, now) {
  const age = (now - (+p.pairCreatedAt || 0)) / 60000, mc = +(p.marketCap || p.fdv) || 0;
  if (!(+p.priceUsd > 0)) return "sin precio"; if (age < R.ageMin) return "joven"; if (age > R.ageMax) return "vieja"; if (mc < R.mcapMin || mc > R.mcapMax) return "tamaño"; return null;
}
// ---- el analista: 6 señales de 0 a 100 y la nota final (la media) ----
export function analista(S, a, p, info, g, nowMs) {
  const ch1 = +(p.priceChange && p.priceChange.h1) || 0, ch5 = +(p.priceChange && p.priceChange.m5) || 0, liq = +(p.liquidity && p.liquidity.usd) || 1, mc = +(p.marketCap || p.fdv) || 1;
  const t = (p.txns && p.txns.h1) || {}, br = g && g.b + g.s > 0 ? g.b / Math.max(1, g.s) : (+t.buys || 0) / Math.max(1, +t.sells || 0);
  const ageH = Math.max(0.5, (nowMs - (+p.pairCreatedAt || nowMs)) / 3600e3), hp = S.hold[a];
  const hg = info && info.holders ? (hp && nowMs - hp.t > 10 * 60000 ? cl((info.holders / hp.n - 1) * 100 / ((nowMs - hp.t) / 3600e3), 0, 20) : cl(info.holders / ageH, 0, 300)) : 0.5;
  const nSmart = Object.keys(S.smart).length, sm = g ? g.buyers.filter((w) => S.smart[w]).length : 0;
  const sig = { mom: Math.round(100 * (0.7 * cl(ch1, 0, 40) + 0.3 * cl(ch5, 0, 8))), ub: g ? Math.round(100 * cl(g.ub, 0, 150)) : 50, bs: Math.round(100 * cl(br, 1, 2)),
    hg: Math.round(100 * hg), lm: Math.round(100 * cl(liq / mc, 0.03, 0.15)), sw: nSmart < R.smartMinList ? 50 : Math.round(100 * cl(sm, 0, 3)) };
  return { sig, sc: Math.round(Object.values(sig).reduce((x, y) => x + y, 0) / 6), sm, learning: nSmart < R.smartMinList };
}
export const slip = (eur, liq) => Math.min(R.slipMax, R.slipMin + eur / Math.max(1, liq));
export function equity(S, px) { let v = S.cash; for (const [a, p] of Object.entries(S.pos)) v += p.q * (px[a] != null ? px[a] : p.last); return v; }

function L(S, now, ev, sym, txt) { S.line = (S.line || 0) + 1; S.log.unshift({ n: S.line, t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 500); }
function cerrar(S, a, now, px, liq, why, ev, rug) {
  const p = S.pos[a]; const sl = rug ? 0 : slip(p.q * px, liq), gross = p.q * px, got = rug ? 0 : gross * (1 - sl) * (1 - R.fee), fee = rug ? 0 : gross - got;
  const pnl = got - p.cost; S.cash += got; S.st.pnl += pnl; S.st.fees += fee; if (pnl >= 0) S.st.wins++; else S.st.losses++; if (rug) S.st.rugs++; if (ev === "STOP") S.st.stops++;
  S.st.worst = Math.min(S.st.worst || 0, pnl); S.st.best = Math.max(S.st.best || 0, pnl);
  S.closed.unshift({ sym: p.sym, a, url: p.url, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(got), pnl: r2(pnl), pc: r2((got / p.cost - 1) * 100), why, sc: p.sc, h: (p.h || []).slice(-120), px0: p.px, peak: p.peak, out: px }); S.closed = S.closed.slice(0, 600);
  S.cool[a] = now.getTime(); delete S.pos[a];
  S.ag.risk = { sym: p.sym, txt: why, t: now.toISOString() };
  L(S, now, ev, p.sym, why); L(S, now, pnl >= 0 ? "WIN" : "LOSS", p.sym, `${pnl >= 0 ? "+" : ""}${r2(pnl)} · ${r2((got / p.cost - 1) * 100)} %`);
}

// una vuelta completa: riesgo vigila lo abierto → explorador → filtro → analista → ejecutor → registro. ext = {rc:{a:info}, gt:{a:info}}
export function paso(S, by, now = new Date(), rnd = Math.random, ext = {}) {
  const tnow = now.getTime(), px = {}, RCI = ext.rc || {}, GTI = ext.gt || {};
  S.rk = S.rk || {}; S.ag = S.ag || {}; S.flow = S.flow || [];
  // RIESGO: lo abierto
  for (const [a, p] of Object.entries(S.pos)) {
    const q = by[a], liq = q ? +(q.liquidity && q.liquidity.usd) || 0 : 0, pr = q ? +q.priceUsd : 0;
    if (!q || !(pr > 0) || liq < R.rugLiq) { cerrar(S, a, now, 0, 0, "liquidez retirada o moneda desaparecida", "RUG", true); continue; }
    px[a] = pr; p.last = pr; p.peak = Math.max(p.peak || p.px, pr); p.liq = liq; p.h = (p.h || []); p.h.push([now.toISOString(), pr]); p.h = p.h.slice(-200);
    if (!p.trailing && p.peak >= p.px * (1 + R.trailOn)) { p.trailing = true; L(S, now, "TRAIL", p.sym, `+${R.trailOn * 100} % alcanzado · stop móvil activado`); }
    const ageH = (tnow - Date.parse(p.t0)) / 3600e3;
    if (pr <= p.px * (1 - R.stop)) cerrar(S, a, now, pr, liq, `stop −${R.stop * 100} %`, "STOP");
    else if (p.trailing && pr <= p.peak * (1 - R.trail)) cerrar(S, a, now, pr, liq, `stop móvil (${R.trail * 100} % bajo el máximo)`, "EXIT");
    else if (ageH >= R.maxHoldH) cerrar(S, a, now, pr, liq, `tiempo máximo (${R.maxHoldH} h)`, "EXIT");
  }
  // carteras listas: quien compró pronto en una moneda que luego subió un 50 % entra en la lista (aprende solo)
  for (const [a, w] of Object.entries(S.watch || {})) {
    const q = by[a], pr = q ? +q.priceUsd : 0;
    if (pr > 0 && pr >= w.px * (1 + R.smartUp)) { for (const b of w.b) S.smart[b] = (S.smart[b] || 0) + 1; L(S, now, "LEARN", w.sym, `+${Math.round((pr / w.px - 1) * 100)} %: ${w.b.length} carteras pasan a «listas»`); delete S.watch[a]; }
    else if (tnow - w.t > 24 * 3600e3) delete S.watch[a];
  }
  { const e = Object.entries(S.smart); if (e.length > 5000) S.smart = Object.fromEntries(e.sort((x, y) => y[1] - x[1]).slice(0, 4000)); }
  // EXPLORADOR → FILTRO → ANALISTA
  const cands = []; let nNew = 0;
  for (const [a, q] of Object.entries(by)) {
    if (S.pos[a]) continue;
    let z = S.seen[a]; const first = !z || typeof z !== "object"; if (first) z = S.seen[a] = { t: tnow, k: 0, s: 0 };
    const ex = explorador(q, tnow);
    if (ex) { if (ex === "joven") S.young[a] = S.young[a] || tnow; else delete S.young[a]; continue; }
    delete S.young[a];
    if (!z.f) { z.f = 1; S.st.seen++; nNew++; S.flow.unshift({ a, sym: q.baseToken.symbol, age: Math.round((tnow - q.pairCreatedAt) / 60000), mc: +(q.marketCap || q.fdv) || 0, t: now.toISOString() }); S.flow = S.flow.slice(0, 12); }
    if (S.cool[a] && tnow - S.cool[a] < R.cooldownH * 3600e3) continue;
    const info = RCI[a] || null, rr = reglas(q, info), fails = RULES.filter(([k]) => rr[k] === false).map(([k]) => k), miss = RULES.filter(([k]) => rr[k] == null).map(([k]) => k);
    if (info && info.rugged) fails.unshift("lp");
    if (fails.length) {
      if (!z.k) { z.k = 1; S.st.killed++; for (const k of fails) S.rk[k] = (S.rk[k] || 0) + 1; L(S, now, "KILL", q.baseToken.symbol, RULES.find((x) => x[0] === fails[0])[1] + (fails.length > 1 ? ` (+${fails.length - 1})` : "")); }
      S.ag.filter = { sym: q.baseToken.symbol, rule: RULES.findIndex((x) => x[0] === fails[0]) + 1, ok: false, t: now.toISOString() };
      continue;
    }
    if (miss.length) continue;   // falta RugCheck: se mira en la siguiente vuelta
    if (!z.p) { z.p = 1; L(S, now, "PASS", q.baseToken.symbol, "8/8 reglas → analista"); }
    S.ag.filter = { sym: q.baseToken.symbol, rule: 8, ok: true, t: now.toISOString() };
    const g = GTI[a] || null, an = analista(S, a, q, info, g, tnow);
    if (info && info.holders) S.hold[a] = S.hold[a] && tnow - S.hold[a].t < 10 * 60000 ? S.hold[a] : { n: info.holders, t: tnow };
    if (!z.s) { z.s = 1; S.st.scored++; L(S, now, "SCORE", q.baseToken.symbol, `${an.sc}${an.sc >= R.minScore ? " → ejecutor" : " · por debajo de 70: descartada"}`); }
    S.ag.analyst = { sym: q.baseToken.symbol, sc: an.sc, sig: an.sig, learning: an.learning, t: now.toISOString() };
    if (g && g.buyers.length && !S.watch[a]) S.watch[a] = { sym: q.baseToken.symbol, px: +q.priceUsd, t: tnow, b: g.buyers.slice(0, 40) };
    if (an.sc >= R.minScore) cands.push({ a, q, sc: an.sc, sig: an.sig });
  }
  // EJECUTOR
  cands.sort((x, y) => y.sc - x.sc);
  for (const { a, q, sc, sig } of cands) {
    if (Object.keys(S.pos).length >= R.maxPos) break;
    const eq = equity(S, px), amt = Math.min(S.cash, eq * R.size), liq = +q.liquidity.usd, pr = +q.priceUsd;
    if (amt < 1) break;
    if (rnd() < R.failP) { S.cash -= R.failCost; S.st.failed++; S.st.fees += R.failCost; L(S, now, "FAIL", q.baseToken.symbol, "la orden no entró (red saturada): se pierde la propina"); continue; }
    const sl = slip(amt, liq), fill = pr * (1 + sl), qn = amt * (1 - R.fee) / fill;
    S.cash -= amt; S.st.trades++; S.st.fees += amt - qn * pr;
    S.pos[a] = { sym: q.baseToken.symbol, name: q.baseToken.name, url: q.url, q: qn, px: pr, cost: amt, t0: now.toISOString(), peak: pr, last: pr, sc, sig, liq, h: [[now.toISOString(), pr]] };
    px[a] = pr; S.ag.exec = { sym: q.baseToken.symbol, amt: r2(amt), t: now.toISOString() };
    L(S, now, "ENTER", q.baseToken.symbol, `${r2(amt)} · ${Math.round(R.size * 100)} % · deslizamiento ${r2(sl * 100)} % · stop −${R.stop * 100} % puesto`);
  }
  // limpieza, curva, ritmo y parte del día
  for (const [a, z] of Object.entries(S.seen)) if (tnow - (z && z.t || 0) > 4 * 86400e3) { delete S.seen[a]; delete S.hold[a]; delete S.rc[a]; }
  for (const [a, t] of Object.entries(S.cool)) if (tnow - t > R.cooldownH * 3600e3) delete S.cool[a];
  for (const [a, t] of Object.entries(S.young)) if (tnow - t > 3 * 3600e3) delete S.young[a];
  const eq = equity(S, px);
  S.eq.push([now.toISOString(), r2(eq)]); if (S.eq.length > 3000) S.eq = S.eq.filter((_, i) => i % 2 === 0 || i > S.eq.length - 500);
  S.rate = (S.rate || []).concat([[tnow, nNew]]).filter((x) => tnow - x[0] <= 3600e3);
  const d = madrid(now).slice(0, 10);
  if (!S.day || S.day.d !== d) { if (S.day) S.nights.unshift({ ...S.day, eq1: S.lastEq, st1: { ...S.st } }); S.nights = S.nights.slice(0, 120); S.day = { d, eq0: S.lastEq != null ? S.lastEq : eq, st0: { ...S.st } }; }
  S.lastEq = r2(eq); S.last = now.toISOString();
  return S;
}

async function leerEstado() {
  if (!REPO || !TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/meme.json?ref=meme`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null; if (!r.ok) throw new Error("no pude leer meme.json (HTTP " + r.status + ")");
  return await r.json();
}
function publicar(S) {
  const out = JSON.stringify(S); writeFileSync("meme.json", out);
  if (!REPO || !TOKEN) { console.log("Ejecución local: guardado en meme.json"); return; }
  const pub = path.join(process.cwd(), ".pubmeme"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "meme.json"), out);
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g("init -q -b meme"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add meme.json"); g(`commit -q -m "memes ${new Date().toISOString()}"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git meme`); return; } catch (e) { if (i === 3) throw new Error("no pude guardar meme.json"); } }
}

async function main() {
  const now = new Date(), tnow = now.getTime(), t0 = Date.now();
  let S = await leerEstado(); if (!S || S.v !== 3) { const old = S; S = freshState(); if (old && old.since) L(S, now, "INFO", "", "versión nueva del terminal: empieza de cero con las 8 reglas reales"); }
  if (S.last && tnow - Date.parse(S.last) < 40e3) { console.log("Memes: la última vuelta fue hace menos de 40 s; nada que hacer."); return; }
  // EXPLORADOR: todas las fuentes de monedas nuevas de Solana
  const addrs = new Set([...Object.keys(S.pos), ...Object.keys(S.young || {}), ...Object.keys(S.watch || {})]);
  const add = (x) => { if (x && typeof x === "string" && x.length > 30) addrs.add(x); };
  for (const u of [DS + "/token-profiles/latest/v1", DS + "/token-boosts/latest/v1", DS + "/token-boosts/top/v1"]) { try { const j = await J(u); for (const x of Array.isArray(j) ? j : []) if (x && x.chainId === "solana") add(x.tokenAddress); } catch (e) { console.log("Memes: " + u + ": " + e.message); } }
  for (const u of [GT + "/networks/solana/new_pools?page=1", GT + "/networks/solana/new_pools?page=2", GT + "/networks/solana/trending_pools?page=1"]) { try { const j = await J(u); for (const x of (j && j.data) || []) { const id = x.relationships && x.relationships.base_token && x.relationships.base_token.data && x.relationships.base_token.data.id; if (id) add(id.replace(/^solana_/, "")); } } catch (e) { console.log("Memes: " + u + ": " + e.message); } }
  const list = [...addrs].slice(0, 600), pairs = [];
  for (let i = 0; i < list.length; i += 30) { try { const j = await J(`${DS}/tokens/v1/solana/${list.slice(i, i + 30).join(",")}`); if (Array.isArray(j)) pairs.push(...j); } catch (e) { console.log("Memes: precios: " + e.message); if (Object.keys(S.pos).length) { console.log("Memes: sin precios de lo abierto: no decido esta vuelta."); return; } } }
  const by = bestPairs(pairs);
  if (!Object.keys(by).length) { console.log("Memes: sin datos de DexScreener; se intenta en la siguiente vuelta."); return; }
  // FILTRO (datos de cadena): RugCheck solo para las que pasan lo barato, con caché de 30 min
  const ext = { rc: {}, gt: {} }, pre = [];
  for (const [a, q] of Object.entries(by)) { if (S.pos[a] || explorador(q, tnow)) continue; if (S.cool[a] && tnow - S.cool[a] < R.cooldownH * 3600e3) continue; const rr = reglas(q, null); if (rr.liq && rr.vol && rr.pump) pre.push([a, q]); }
  pre.sort((x, y) => (+(y[1].volume && y[1].volume.h1) || 0) - (+(x[1].volume && x[1].volume.h1) || 0));
  let nrc = 0;
  for (const [a] of pre) {
    const c = S.rc[a]; if (c && tnow - c.t < 30 * 60000) { ext.rc[a] = c.i; continue; }
    if (nrc >= R.rcPerRun || Date.now() - t0 > 55e3) continue;
    try { const j = await J(`${RC}/tokens/${a}/report`, 2); nrc++; if (j) { const i = rcInfo(j); S.rc[a] = { t: tnow, i }; ext.rc[a] = i; } } catch (e) { nrc++; }
    await sleep(350);
  }
  // ANALISTA: operaciones con cartera (compradores únicos y carteras listas) de GeckoTerminal para las que pasan las 8 reglas
  let ngt = 0;
  for (const [a, q] of pre) {
    const i = ext.rc[a]; if (!i) continue; const rr = reglas(q, i); if (RULES.some(([k]) => rr[k] === false) || i.rugged) continue;
    if (ngt >= R.gtPerRun || Date.now() - t0 > 70e3) break;
    try { const j = await J(`${GT}/networks/solana/pools/${q.pairAddress}/trades`, 2); ngt++; if (j && j.data) ext.gt[a] = gtInfo(j.data, tnow); } catch (e) { ngt++; }
    await sleep(300);
  }
  paso(S, by, now, Math.random, ext);
  publicar(S);
  console.log(`Memes: ${Object.keys(by).length} monedas · RugCheck ${nrc} · GeckoTerminal ${ngt} · saldo ${r2(S.lastEq)} · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades} · ${Math.round((Date.now() - t0) / 1000)} s`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Memes: " + (e.message || e)); process.exit(0); });
