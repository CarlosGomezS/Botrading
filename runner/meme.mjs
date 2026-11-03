import { predecir, rasgos } from "./meme-ia.mjs";
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
const JUP = "https://lite-api.jup.ag", DS = "https://api.dexscreener.com", GT = "https://api.geckoterminal.com/api/v2", RC = "https://api.rugcheck.xyz/v1", GP = "https://api.gopluslabs.io/api/v1";
// v168 · REDES: el mismo terminal en Solana, Base y BNB Chain (cada una con su estado, su bola de aprendizaje y su rama: meme, meme-base, meme-bsc)
export const CHAINS = {
  solana: { id: "solana", nombre: "Solana", ds: "solana", gt: "solana", seg: "rugcheck", rama: "meme", fixFee: 0.08, gtTurno: 0, busca: ["pump", "sol", "meme", "cat", "dog", "ai"] },
  base: { id: "base", nombre: "Base", ds: "base", gt: "base", seg: "goplus", gp: 8453, rama: "meme-base", fixFee: 0.05, gtTurno: 1, busca: ["base", "based", "meme", "cat", "dog", "ai"] },
  bsc: { id: "bsc", nombre: "BNB Chain", ds: "bsc", gt: "bsc", seg: "goplus", gp: 56, rama: "meme-bsc", fixFee: 0.06, gtTurno: 2, busca: ["bnb", "bsc", "meme", "cat", "dog", "ai"] }
};
// palabras con las que se buscan monedas en DexScreener (rotan cada minuto: así van apareciendo cientos distintas)
const PALABRAS = ["pepe", "doge", "shib", "inu", "cat", "dog", "frog", "trump", "elon", "ai", "agent", "gpt", "moon", "pump", "meme", "baby", "king", "chad", "wojak", "bonk",
  "wif", "popcat", "giga", "sigma", "based", "cult", "degen", "ape", "monkey", "bear", "bull", "panda", "fish", "duck", "goat", "rocket", "gem", "coin", "token", "mog", "brett", "toshi", "floki", "kitty", "hamster", "penguin", "dragon", "tiger"];
export const NOMEME = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);   // SOL, USDC y USDT: no son memecoins
const ARGS = process.argv.slice(2), CH = CHAINS[ARGS.find((x) => CHAINS[x])] || CHAINS.solana, RAPIDO = ARGS.includes("rapido");
export const R = {
  start: 100, size: 0.08,         // v167: prueba con 100 €, lo que piensas meter de verdad
  fixFee: 0.08,                    // € fijos por transacción en Solana: propina de prioridad/Jito y cuenta de la moneda (no dependen del tamaño)
  maxPos: 8, minScore: 70,
  ageMin: 30, ageMax: 72 * 60, mcapMin: 300e3, mcapMax: 20e6,                     // explorador
  liqMin: 40e3, vol1hMin: 50e3, top10Max: 25, devMax: 3, bundleMax: 10, pump1hMax: 80, lpLockMin: 90, // filtro
  stop: 0.06, trailOn: 0.12, trail: 0.15, maxHoldH: 24, rugLiq: 5000, cooldownH: 24, // riesgo
  fee: 0.005, slipMin: 0.01, slipMax: 0.12, failP: 0.05, failCost: 0.02,          // costes realistas
  rcPerRun: 45, gtPerRun: 10, smartUp: 0.5, smartMinList: 20
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
    try { const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "bot-trading-memes" }, signal: AbortSignal.timeout(15000) }); if (r.status === 429) { if (i === tries - 1) throw new Error("HTTP 429 (límite de peticiones)"); await sleep(2500 * (i + 1)); continue; } if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { if (i === tries - 1) throw e; await sleep(1200 * (i + 1)); }
  }
  return null;
}
export function freshState() {
  return { v: 5, start: R.start, cash: R.start, pos: {}, closed: [], log: [], line: 0, eq: [], seen: {}, cool: {}, young: {}, rc: {}, hold: {}, watch: {}, smart: {}, flow: [], ag: {},
    st: { seen: 0, killed: 0, scored: 0, trades: 0, wins: 0, losses: 0, fees: 0, failed: 0, rugs: 0, pnl: 0, stops: 0, worst: 0, best: 0 }, rk: {}, rate: [], nights: [], since: new Date().toISOString() };
}
export function bestPairs(pairs, chain = "solana") { const m = {}; for (const p of pairs || []) { if (!p || p.chainId !== chain || !p.baseToken) continue; const a = p.baseToken.address, l = +(p.liquidity && p.liquidity.usd) || 0; if (!m[a] || l > (+(m[a].liquidity && m[a].liquidity.usd) || 0)) m[a] = p; } return m; }

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
// ---- v168 · Base y BNB Chain: la seguridad sale de GoPlus (gratis): trampa que no deja vender (honeypot), mint, dueño oculto, impuestos,
// liquidez bloqueada, mayores poseedores y creador. No da «lanzamiento en bloque»: en esas redes esa regla no se puede aplicar (pasa sin dato)
const DEAD = new Set(["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"]);
export function gpInfo(r) {
  if (!r) return null;
  const f = (x) => +x || 0, b = (x) => x === "1" || x === 1;
  const mintOk = !b(r.is_honeypot) && !b(r.is_mintable) && !b(r.hidden_owner) && !b(r.can_take_back_ownership) && !b(r.owner_change_balance) && !b(r.transfer_pausable) && !b(r.cannot_sell_all) && !b(r.slippage_modifiable)
    && f(r.buy_tax) <= 0.01 && f(r.sell_tax) <= 0.01 && r.is_open_source !== "0";
  const lp = (r.lp_holders || []).reduce((t, h) => t + (b(h.is_locked) || DEAD.has(String(h.address || "").toLowerCase()) ? f(h.percent) : 0), 0) * 100;
  const top10 = (r.holders || []).filter((h) => !b(h.is_contract) && !b(h.is_locked) && !DEAD.has(String(h.address || "").toLowerCase())).slice(0, 10).reduce((t, h) => t + f(h.percent), 0) * 100;
  return { mintOk, lp, top10, dev: (f(r.creator_percent) + (r.owner_address && r.owner_address !== r.creator_address ? f(r.owner_percent) : 0)) * 100, devRug: b(r.honeypot_with_same_creator),
    bundle: 0, sinBloque: true, holders: f(r.holder_count), rugged: b(r.is_honeypot), insiders: 0, tax: Math.max(f(r.buy_tax), f(r.sell_tax)) };
}
// ---- v173 · lo que da Jupiter de cada moneda de Solana: «actividad real» (organic score: descuenta bots y volumen falso), traders, compradores reales y cambio de poseedores
export function jupInfo(x) {
  if (!x) return null; const h = x.stats1h || {};
  return { org: x.organicScore != null ? +x.organicScore : null, traders: h.numTraders != null ? +h.numTraders : null, organicBuyers: h.numOrganicBuyers != null ? +h.numOrganicBuyers : null, holderChg: h.holderChange != null ? +h.holderChange : null };
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
  const liq = +(p.liquidity && p.liquidity.usd) || 0, v1 = +(p.volume && p.volume.h1) || 0, ch1 = +(p.priceChange && p.priceChange.h1) || 0, ch6 = +(p.priceChange && p.priceChange.h6) || 0, e = est();
  if (e === "grandes") return { liq: liq >= Math.max(G.liqMin, 3e5), vol: v1 >= Math.max(G.vol1hMin, 1e5), pump: ch1 <= G.pump1hMax, mint: info ? (G.mint === 0 ? true : info.mintOk) : null,
    lp: info ? true : null, top10: info ? info.top10 <= Math.max(G.top10Max, 60) : null, dev: info ? info.dev <= Math.max(G.devMax, 10) : null, bundle: info ? true : null };
  if (e === "rebote") return { liq: liq >= G.liqMin, vol: v1 >= G.vol1hMin, pump: ch6 <= -15, mint: info ? (G.mint === 0 ? true : info.mintOk) : null, lp: info ? info.lp >= G.lpLockMin : null,
    top10: info ? info.top10 <= Math.max(G.top10Max, 40) : null, dev: info ? info.dev <= Math.max(G.devMax, 5) && !info.devRug : null, bundle: info ? info.bundle <= Math.max(G.bundleMax, 20) : null };
  return { liq: liq >= G.liqMin, vol: v1 >= G.vol1hMin, pump: ch1 <= G.pump1hMax,
    mint: info ? (G.mint === 0 ? true : info.mintOk) : null, lp: info ? info.lp >= G.lpLockMin : null, top10: info ? info.top10 <= G.top10Max : null,
    dev: info ? info.dev <= G.devMax && !info.devRug : null, bundle: info ? info.bundle <= G.bundleMax : null };
}
// v171 · ESTILOS: además del método del vídeo, la bola de aprendizaje prueba otras formas de ganar con memecoins
export const ESTILOS = {
  video: { n: "como el vídeo: monedas recién nacidas" },
  grandes: { n: "memecoins grandes en tendencia", age: [7 * 1440, 5 * 525600], mc: [20e6, 5e9] },
  rebote: { n: "rebote tras una caída fuerte", age: [1440, 5 * 525600], mc: [1e6, 1e9] },
  volumen: { n: "explosión de volumen", age: [60, 30 * 1440], mc: [5e5, 5e8] }
};
const est = () => ESTILOS[G.estilo] ? G.estilo : "video";
export function explorador(p, now) {
  const age = (now - (+p.pairCreatedAt || 0)) / 60000, mc = +(p.marketCap || p.fdv) || 0, E = ESTILOS[est()];
  const [a0, a1] = E.age || [G.ageMin, G.ageMax], [m0, m1] = E.mc || [G.mcapMin, G.mcapMax];
  if (!(+p.priceUsd > 0)) return "sin precio"; if (age < a0) return "joven"; if (age > a1) return "vieja"; if (mc < m0 || mc > m1) return "tamaño"; return null;
}
// ---- el analista: 6 señales de 0 a 100 y la nota final (la media) ----
// v181 · 🧠 modelo de IA en uso (lo entrena la bola en cada generación; solo se usa si acierta más que el azar)
export const ESC = [2, 3, 5];
let IA = null; export function setIA(m) { IA = m && m.listo && m.w ? m : null; } export const iaEnUso = () => IA;
export function analista(S, a, p, info, g, nowMs, j) {
  const ch1 = +(p.priceChange && p.priceChange.h1) || 0, ch5 = +(p.priceChange && p.priceChange.m5) || 0, liq = +(p.liquidity && p.liquidity.usd) || 1, mc = +(p.marketCap || p.fdv) || 1;
  const t = (p.txns && p.txns.h1) || {}, br = g && g.b + g.s > 0 ? g.b / Math.max(1, g.s) : (+t.buys || 0) / Math.max(1, +t.sells || 0);
  const ageH = Math.max(0.5, (nowMs - (+p.pairCreatedAt || nowMs)) / 3600e3), hp = S.hold[a];
  const hg = info && info.holders ? (hp && nowMs - hp.t > 10 * 60000 ? cl((info.holders / hp.n - 1) * 100 / ((nowMs - hp.t) / 3600e3), 0, 20) : cl(info.holders / ageH, 0, 300)) : 0.5;
  const nSmart = Object.keys(S.smart).length, sm = g ? g.buyers.filter((w) => S.smart[w]).length : 0;
  const ch6 = +(p.priceChange && p.priceChange.h6) || 0, ch24 = +(p.priceChange && p.priceChange.h24) || 0, v1 = +(p.volume && p.volume.h1) || 0, v24 = +(p.volume && p.volume.h24) || 0, surge = v24 > 0 ? v1 / (v24 / 24) : 1, e = est();
  const sig = { mom: Math.round(100 * (e === "grandes" ? 0.4 * cl(ch1, 0, 10) + 0.3 * cl(ch6, 0, 25) + 0.3 * cl(ch24, 0, 50) : e === "rebote" ? 0.5 * cl(-ch6, 15, 50) + 0.25 * cl(ch5, 0, 5) + 0.25 * cl(ch1, 0, 10) : e === "volumen" ? cl(ch1, 0, 30) : 0.7 * cl(ch1, 0, 40) + 0.3 * cl(ch5, 0, 8))), ub: j && j.traders != null ? Math.round(100 * cl(j.organicBuyers ?? j.traders, 0, 300)) : g ? Math.round(100 * cl(g.ub, 0, 150)) : Math.round(100 * cl(+t.buys || 0, 0, 250)) /* sin GeckoTerminal: aproximado con el nº de compras de la última hora (DexScreener) */, bs: Math.round(100 * cl(br, 1, 2)),
    hg: Math.round(100 * (j && j.holderChg != null ? cl(j.holderChg, 0, 10) : e === "video" ? hg : e === "volumen" ? cl(surge, 2, 6) : cl(surge, 1, 3))), lm: Math.round(100 * (e === "grandes" ? cl(liq / mc, 0.01, 0.08) : cl(liq / mc, 0.03, 0.15))), sw: nSmart < R.smartMinList ? 50 : Math.round(100 * cl(sm, 0, 3)) };
  if (IA) { const pr = predecir(IA, rasgos(p, info, nowMs, j)); if (pr != null) sig.ia = Math.round(100 * cl(pr, IA.base * 0.5, Math.min(0.95, Math.max(IA.base * 3, IA.base + 0.2)))); }
  const w = G.w || {}, ws = Object.keys(sig).reduce((t, k) => t + (w[k] ?? 1), 0) || 1;
  return { sig, sc: Math.round(Object.keys(sig).reduce((t, k) => t + (w[k] ?? 1) * sig[k], 0) / ws), sm, learning: nSmart < R.smartMinList };
}
// costes en uso: los realistas (R) o los «como el vídeo» (sin comisión, sin deslizamiento y sin órdenes fallidas)
export const IDEAL = { fee: 0, slipMin: 0, slipMax: 0, failP: 0, failCost: 0, fixFee: 0 };
let C = R;
// v164 · reglas en uso (genoma): las del vídeo (R) o las que el laboratorio de memes haya aprendido
export const VIDEO = { ageMin: R.ageMin, ageMax: R.ageMax, mcapMin: R.mcapMin, mcapMax: R.mcapMax, liqMin: R.liqMin, vol1hMin: R.vol1hMin, top10Max: R.top10Max, devMax: R.devMax, bundleMax: R.bundleMax, pump1hMax: R.pump1hMax, lpLockMin: R.lpLockMin, mint: 1, stop: R.stop, trailOn: R.trailOn, trail: R.trail, maxHoldH: R.maxHoldH, size: R.size, minScore: R.minScore, maxPos: R.maxPos, cooldownH: R.cooldownH, estilo: "video", tp: 0.5, tpFrac: 0, esc: 0, orgMin: 0, w: { mom: 1, ub: 1, bs: 1, hg: 1, lm: 1, sw: 1 } };
let G = VIDEO;
export function conGenoma(g, fn) { const p = G; G = { ...VIDEO, ...(g || {}) }; try { return fn(); } finally { G = p; } }
export const slip = (eur, liq) => C.slipMax <= 0 ? 0 : Math.min(C.slipMax, C.slipMin + eur / Math.max(1, liq));
export function equity(S, px) { let v = S.cash; for (const [a, p] of Object.entries(S.pos)) v += p.q * (px[a] != null ? px[a] : p.last); return v; }

function L(S, now, ev, sym, txt) { S.line = (S.line || 0) + 1; S.log.unshift({ n: S.line, t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 500); }
function cerrar(S, a, now, px, liq, why, ev, rug) {
  const p = S.pos[a]; const sl = rug ? 0 : slip(p.q * px, liq), gross = p.q * px, got = rug ? 0 : Math.max(0, gross * (1 - sl) * (1 - C.fee) - (C.fixFee || 0)), fee = rug ? 0 : gross - got;
  const gotT = got + (p.gotPart || 0), pnl = gotT - p.cost; S.cash += got; S.st.pnl += pnl - (p.pnlPart || 0); S.st.fees += fee; if (pnl >= 0) S.st.wins++; else S.st.losses++; if (rug) S.st.rugs++; if (ev === "STOP") S.st.stops++;
  S.st.worst = Math.min(S.st.worst || 0, pnl); S.st.best = Math.max(S.st.best || 0, pnl);
  S.closed.unshift({ sym: p.sym, a, url: p.url, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(gotT), pnl: r2(pnl), pc: r2((gotT / p.cost - 1) * 100), why: p.gotPart ? why + " (tras vender parte con ganancia)" : why, sc: p.sc, h: (p.h || []).slice(-120), px0: p.px, peak: p.peak, out: px }); S.closed = S.closed.slice(0, 600);
  S.cool[a] = now.getTime(); delete S.pos[a];
  S.ag.risk = { sym: p.sym, txt: why, t: now.toISOString() };
  L(S, now, ev, p.sym, why); L(S, now, pnl >= 0 ? "WIN" : "LOSS", p.sym, `${pnl >= 0 ? "+" : ""}${r2(pnl)} · ${r2((gotT / p.cost - 1) * 100)} %`);
}

// una vuelta completa: riesgo vigila lo abierto → explorador → filtro → analista → ejecutor → registro. ext = {rc:{a:info}, gt:{a:info}}
// RIESGO: vigila lo abierto (stop, stop móvil, tiempo máximo y rug). También se usa sola, cada ~20 s, entre vuelta y vuelta
export function riesgo(S, by, now = new Date(), costs, genome) {
  const prevC = C, prevG = G; C = costs ? { ...R, ...costs } : R; G = { ...VIDEO, ...(genome || S.genome || {}) };
  try {
  const tnow = now.getTime(), px = {};
  for (const [a, p] of Object.entries(S.pos)) {
    const q = by[a], liq = q ? +(q.liquidity && q.liquidity.usd) || 0 : 0, pr = q ? +q.priceUsd : 0;
    if (!q || !(pr > 0) || liq < R.rugLiq) { cerrar(S, a, now, 0, 0, "liquidez retirada o moneda desaparecida", "RUG", true); continue; }
    px[a] = pr; p.last = pr; p.peak = Math.max(p.peak || p.px, pr); p.liq = liq; p.h = (p.h || []); p.h.push([now.toISOString(), pr]); p.h = p.h.slice(-200);
    if (!p.trailing && p.peak >= p.px * (1 + G.trailOn)) { p.trailing = true; L(S, now, "TRAIL", p.sym, `+${G.trailOn * 100} % alcanzado · stop móvil activado`); }
    // v173 · venta parcial: al llegar a +tp se vende una parte y el resto sigue con su stop móvil (asegura ganancia sin cortar la subida)
    if (G.tpFrac > 0 && !p.tp1 && pr >= p.px * (1 + G.tp)) {
      const qv = p.q * G.tpFrac, gross = qv * pr, sl = slip(gross, liq), got = Math.max(0, gross * (1 - sl) * (1 - C.fee) - (C.fixFee || 0)), pnlP = got - p.cost * G.tpFrac;
      S.cash += got; S.st.fees += gross - got; S.st.pnl += pnlP; p.q -= qv; p.gotPart = (p.gotPart || 0) + got; p.pnlPart = (p.pnlPart || 0) + pnlP; p.tp1 = 1;
      L(S, now, "TP", p.sym, `+${Math.round(G.tp * 100)} %: vende el ${Math.round(G.tpFrac * 100)} % · asegura ${pnlP >= 0 ? "+" : ""}${r2(pnlP)}`);
    }
    // v182 · 🪜 escalera de ganancias: en ×2, ×3 y ×5 vende otra parte de lo que queda (en memecoins un pico se puede hundir en segundos)
    while (G.esc > 0 && (p.esc || 0) < ESC.length && pr >= p.px * ESC[p.esc || 0]) {
      const fr = G.esc, qv = p.q * fr, gross = qv * pr, sl = slip(gross, liq), got = Math.max(0, gross * (1 - sl) * (1 - C.fee) - (C.fixFee || 0)), cb = p.cost * qv / (p.qIni || (p.tp1 ? p.q / Math.max(0.05, 1 - G.tpFrac) : p.q)), pnlP = got - cb;
      S.cash += got; S.st.fees += gross - got; S.st.pnl += pnlP; p.q -= qv; p.gotPart = (p.gotPart || 0) + got; p.pnlPart = (p.pnlPart || 0) + pnlP;
      L(S, now, "TP", p.sym, `×${ESC[p.esc || 0]}: vende otro ${Math.round(fr * 100)} % de lo que queda · asegura ${pnlP >= 0 ? "+" : ""}${r2(pnlP)}`); p.esc = (p.esc || 0) + 1;
    }
    const ageH = (tnow - Date.parse(p.t0)) / 3600e3;
    if (pr <= p.px * (1 - G.stop)) cerrar(S, a, now, pr, liq, `stop −${G.stop * 100} %`, "STOP");
    else if (p.trailing && pr <= p.peak * (1 - G.trail)) cerrar(S, a, now, pr, liq, `stop móvil (${G.trail * 100} % bajo el máximo)`, "EXIT");
    else if (ageH >= G.maxHoldH) cerrar(S, a, now, pr, liq, `tiempo máximo (${G.maxHoldH} h)`, "EXIT");
  }
  return px;
  } finally { C = prevC; G = prevG; }
}

export function paso(S, by, now = new Date(), rnd = Math.random, ext = {}, costs, genome) {
  const prevC = C, prevG = G; C = costs ? { ...R, ...costs } : R; G = { ...VIDEO, ...(genome || S.genome || {}) };
  try {
  const tnow = now.getTime(), RCI = ext.rc || {}, GTI = ext.gt || {};
  S.rk = S.rk || {}; S.ag = S.ag || {}; S.flow = S.flow || [];
  const px = riesgo(S, by, now, costs, G);
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
    if (S.pos[a] || NOMEME.has(a)) continue;
    let z = S.seen[a]; const first = !z || typeof z !== "object"; if (first) z = S.seen[a] = { t: tnow, k: 0, s: 0 };
    const ex = explorador(q, tnow);
    // v165 · se siguen vigilando (hasta 72 h) las que aún son muy jóvenes o pequeñas pero están vivas: pueden crecer y cumplir más tarde
    if (ex) { const mc = +(q.marketCap || q.fdv) || 0, lq = +(q.liquidity && q.liquidity.usd) || 0, ageM = (tnow - (+q.pairCreatedAt || tnow)) / 60000;
      if ((ex === "joven" || (ex === "tamaño" && mc < G.mcapMin)) && ageM < 72 * 60 && (ageM < 60 || (mc >= 30e3 && lq >= 5e3))) S.young[a] = S.young[a] || tnow; else delete S.young[a]; continue; }
    delete S.young[a];
    if (!z.f) { z.f = 1; S.st.seen++; nNew++; S.flow.unshift({ a, sym: q.baseToken.symbol, age: Math.round((tnow - q.pairCreatedAt) / 60000), mc: +(q.marketCap || q.fdv) || 0, t: now.toISOString() }); S.flow = S.flow.slice(0, 12); }
    if (S.cool[a] && tnow - S.cool[a] < G.cooldownH * 3600e3) continue;
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
    const g = GTI[a] || null, jx = (ext.jup || {})[a] || null;
    if (G.orgMin > 0 && jx && jx.org != null && jx.org < G.orgMin) { if (!z.o) { z.o = 1; L(S, now, "KILL", q.baseToken.symbol, `actividad real baja (Jupiter ${Math.round(jx.org)} < ${G.orgMin})`); } continue; }
    const an = analista(S, a, q, info, g, tnow, jx);
    if (info && info.holders) S.hold[a] = S.hold[a] && tnow - S.hold[a].t < 10 * 60000 ? S.hold[a] : { n: info.holders, t: tnow };
    if (!z.s) { z.s = 1; S.st.scored++; L(S, now, "SCORE", q.baseToken.symbol, `${an.sc}${an.sc >= G.minScore ? " → ejecutor" : " · por debajo de 70: descartada"}`); }
    S.ag.analyst = { sym: q.baseToken.symbol, sc: an.sc, sig: an.sig, learning: an.learning, t: now.toISOString() };
    if (g && g.buyers.length && !S.watch[a]) S.watch[a] = { sym: q.baseToken.symbol, px: +q.priceUsd, t: tnow, b: g.buyers.slice(0, 40) };
    if (an.sc >= G.minScore) cands.push({ a, q, sc: an.sc, sig: an.sig });
  }
  // EJECUTOR
  cands.sort((x, y) => y.sc - x.sc);
  for (const { a, q, sc, sig } of cands) {
    if (Object.keys(S.pos).length >= G.maxPos) break;
    const eq = equity(S, px), amt = Math.min(S.cash, eq * G.size), liq = +q.liquidity.usd, pr = +q.priceUsd;
    if (amt < 1) break;
    if (C.failP > 0 && rnd() < C.failP) { S.cash -= C.failCost; S.st.failed++; S.st.fees += C.failCost; L(S, now, "FAIL", q.baseToken.symbol, "la orden no entró (red saturada): se pierde la propina"); continue; }
    const sl = slip(amt, liq), fill = pr * (1 + sl), qn = Math.max(0, amt * (1 - C.fee) - (C.fixFee || 0)) / fill;
    if (amt <= (C.fixFee || 0) * 4) break;   // una compra tan pequeña que los costes fijos se la comerían
    S.cash -= amt; S.st.trades++; S.st.fees += amt - qn * pr;
    S.pos[a] = { sym: q.baseToken.symbol, name: q.baseToken.name, url: q.url, q: qn, qIni: qn, px: pr, cost: amt, t0: now.toISOString(), peak: pr, last: pr, sc, sig, liq, h: [[now.toISOString(), pr]] };
    px[a] = pr; S.ag.exec = { sym: q.baseToken.symbol, amt: r2(amt), t: now.toISOString() };
    L(S, now, "ENTER", q.baseToken.symbol, `${r2(amt)} · ${Math.round(G.size * 100)} % · deslizamiento ${r2(sl * 100)} % · stop −${G.stop * 100} % puesto`);
  }
  // limpieza, curva, ritmo y parte del día
  for (const [a, z] of Object.entries(S.seen)) if (tnow - (z && z.t || 0) > 4 * 86400e3) { delete S.seen[a]; delete S.hold[a]; delete S.rc[a]; }
  for (const [a, t] of Object.entries(S.cool)) if (tnow - t > G.cooldownH * 3600e3) delete S.cool[a];
  for (const [a, t] of Object.entries(S.young)) if (tnow - t > 72 * 3600e3) delete S.young[a];
  { const e = Object.entries(S.young); if (e.length > 3000) S.young = Object.fromEntries(e.sort((x, y) => y[1] - x[1]).slice(0, 3000)); }
  const eq = equity(S, px);
  S.eq.push([now.toISOString(), r2(eq)]); if (S.eq.length > 3000) S.eq = S.eq.filter((_, i) => i % 2 === 0 || i > S.eq.length - 500);
  S.rate = (S.rate || []).concat([[tnow, nNew]]).filter((x) => tnow - x[0] <= 3600e3);
  const d = madrid(now).slice(0, 10);
  if (!S.day || S.day.d !== d) { if (S.day) S.nights.unshift({ ...S.day, eq1: S.lastEq, st1: { ...S.st } }); S.nights = S.nights.slice(0, 120); S.day = { d, eq0: S.lastEq != null ? S.lastEq : eq, st0: { ...S.st } }; }
  S.lastEq = r2(eq); S.last = now.toISOString();
  return S;
  } finally { C = prevC; G = prevG; }
}

// «como el vídeo»: las MISMAS decisiones y datos, pero sin comisiones, sin deslizamiento y sin órdenes fallidas (comparte las carteras listas)
export function pasoIdeal(S, by, now, ext) {
  let I = S.ideal; if (!I || I.v !== S.v) { I = S.ideal = freshState(); I.since = S.since; }
  I.smart = S.smart; I.hold = S.hold; I.watch = {}; I.rc = {};
  try { paso(I, by, now, () => 1, ext, IDEAL, VIDEO); } finally { delete I.smart; delete I.hold; delete I.watch; delete I.rc; }
  I.log = (I.log || []).slice(0, 60); I.closed = (I.closed || []).slice(0, 300); I.flow = []; I.nights = (I.nights || []).slice(0, 60);
  for (const p of Object.values(I.pos || {})) p.h = (p.h || []).slice(-60);
  return I;
}
// v179 · ⚡ TURBO: cuenta ficticia aparte, con costes reales, que opera MUCHO más (reglas más anchas y salidas rápidas).
// Mismas fuentes y mismas comprobaciones de seguridad; no toca el dinero real (que sigue con las reglas del terminal principal).
export const TURBO = { ...VIDEO, estilo: "video", ageMin: 5, ageMax: 14 * 1440, mcapMin: 50e3, mcapMax: 100e6, liqMin: 15e3, vol1hMin: 10e3, pump1hMax: 400,
  top10Max: 40, devMax: 10, bundleMax: 30, lpLockMin: 80, mint: 1, stop: 0.1, trailOn: 0.08, trail: 0.1, maxHoldH: 4, size: 0.05, minScore: 45, maxPos: 15, cooldownH: 3, tp: 0.25, tpFrac: 0.5, esc: 0.35, orgMin: 0 };
export const turboG = (S) => (S.turboGenome ? { ...VIDEO, ...S.turboGenome } : TURBO);
export function pasoTurbo(S, by, now, ext) {
  let T = S.turbo; if (!T || T.v !== S.v) { T = S.turbo = freshState(); }
  T.smart = S.smart; T.hold = S.hold; T.watch = {}; T.rc = {};
  try { paso(T, by, now, Math.random, ext, null, turboG(S)); T.genomeId = S.turboGenomeId || "vt"; } finally { delete T.smart; delete T.hold; delete T.watch; delete T.rc; }
  T.log = (T.log || []).slice(0, 120); T.closed = (T.closed || []).slice(0, 400); T.flow = []; T.nights = (T.nights || []).slice(0, 60); T.seen = Object.fromEntries(Object.entries(T.seen || {}).slice(-3000));
  for (const p of Object.values(T.pos || {})) p.h = (p.h || []).slice(-60);
  T.lastEq = r2(equity(T, {})); return T;
}
// vuelta rápida: solo precios de lo abierto y el riesgo (para que los stops salten antes)
export function rapido(S, by, now) {
  riesgo(S, by, now);
  if (S.ideal) { const I = S.ideal; riesgo(I, by, now, IDEAL, VIDEO); I.lastEq = r2(equity(I, {})); }
  if (S.turbo) { const T = S.turbo; riesgo(T, by, now, null, turboG(S)); T.lastEq = r2(equity(T, {})); }
  S.lastEq = r2(equity(S, {})); S.lastQ = now.toISOString();
}

// v165 · varias peticiones a la vez (con un tope) para que la vuelta quepa en un minuto
async function enParalelo(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } })); return out; }
async function leerArchivo(f, rama = CH.rama) {
  if (!REPO || !TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=${rama}`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null; if (!r.ok) throw new Error("no pude leer " + f + " (HTTP " + r.status + ")");
  return await r.json();
}
// se publican juntos (un solo commit en la rama «meme»): el terminal y su laboratorio
// v176 · las muestras van en su propia rama (meme-mue, meme-base-mue, meme-bsc-mue): solo se guardan en la vuelta completa
function publicarMue(M) {
  if (!REPO || !TOKEN || !M) return;
  const pub = path.join(process.cwd(), ".pubmue-" + CH.id); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "meme-muestras.json"), JSON.stringify(M));
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g("init -q -b mue"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add -A"); g(`commit -q -m "muestras ${new Date().toISOString()}"`);
  for (let i = 0; i < 3; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${CH.rama}-mue`); return; } catch (e) { if (i === 2) console.log("Memes: no pude guardar las muestras"); } }
}
function publicar(S, LB, M) {
  const out = JSON.stringify(S); writeFileSync("meme.json", out); if (LB) writeFileSync("meme-lab.json", JSON.stringify(LB));
  if (!REPO || !TOKEN) { console.log("Ejecución local: guardado en meme.json"); return; }
  const pub = path.join(process.cwd(), ".pubmeme-" + CH.id); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "meme.json"), out);
  if (LB) writeFileSync(path.join(pub, "meme-lab.json"), JSON.stringify(LB));
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe" });
  g("init -q -b meme"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add -A"); g(`commit -q -m "memes ${new Date().toISOString()}"`);
  for (let i = 0; i < 4; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${CH.rama}`); return; } catch (e) { if (i === 3) throw new Error("no pude guardar meme.json"); } }
}

// v175 · 💶 dinero real (solo Solana): copia al terminal con tu cartera del bot si lo has aprobado (runner/meme-real.mjs)
async function dineroReal(S, by, now, rapidoV) {
  if (CH.id !== "solana" || !process.env.REAL_VIEW_PASS) return;
  try {
    if (!S.eurUsd || now - Date.parse(S.eurUsd.t) > 6 * 3600e3) { const j = await J("https://api.frankfurter.app/latest?from=EUR&to=USD", 2).catch(() => null); if (j && j.rates && +j.rates.USD > 0) S.eurUsd = { v: +j.rates.USD, t: now.toISOString() }; }
    const sol = by["So11111111111111111111111111111111111111112"]; if (sol && +sol.priceUsd > 0) S.solUsd = +sol.priceUsd;
    if (rapidoV && !S.realAbierto) return;   // en la vuelta rápida solo si hay algo abierto con dinero real
    const MR = await import("./meme-real.mjs"), RS = await MR.pasoReal(S, by, now, S.eurUsd ? S.eurUsd.v : 1.08);
    S.realAbierto = !!(RS && Object.keys(RS.pos || {}).length); S.realEstado = RS ? RS.estado : null;
  } catch (e) { console.log("Memes real: " + String(e.message || e).slice(0, 120)); }
}
let MUE = null;   // muestras de esta red (se cargan al empezar y se guardan con cada vuelta)
async function main() {
  const now = new Date(), tnow = now.getTime(), t0 = Date.now(), LBm = await import("./meme-lab.mjs");
  R.fixFee = CH.fixFee;
  let S = await leerArchivo("meme.json"); if (!S || S.v !== 5) { const old = S; S = freshState(); L(S, now, "INFO", "", `empieza de cero en ${CH.nombre} con 100 € (lo que piensas meter de verdad) y sus costes fijos`); }
  S.chain = CH.id; S.chainNombre = CH.nombre;
  let LB = null; try { LB = await leerArchivo("meme-lab.json"); } catch (e) { console.log("Memes: " + e.message); return; }
  if (!LB || LB.v !== 3 || (S.genomeId && !LB.pop.some((v) => v.id === S.genomeId) && false)) { LB = LBm.freshLab(now); L(S, now, "INFO", "", `🧬 nace el laboratorio de memes: ${LB.pop.length} variantes de las reglas compiten en ficticio`); }
  setIA(LB.ia);
  LBm.aplicarRangos(LB);
  const MS = await import("./meme-muestras.mjs"); try { MUE = RAPIDO ? null : await leerArchivo("meme-muestras.json", CH.rama + "-mue"); } catch (e) { console.log("Memes: " + e.message); return; } if (!RAPIDO && (!MUE || MUE.v !== 1)) MUE = MS.freshM();   // v174 · los rangos que la bola ya haya ensanchado
  const varOpen = () => LB.pop.flatMap((v) => Object.keys(v.pos || {}));
  if (RAPIDO) {
    const open = [...new Set([...(CH.id === "solana" && S.realAbierto ? ["So11111111111111111111111111111111111111112"] : []), ...Object.keys(S.pos || {}), ...Object.keys((S.ideal && S.ideal.pos) || {}), ...Object.keys((S.turbo && S.turbo.pos) || {}), ...varOpen()])];
    if (!open.length) { console.log("Memes (rápido): nada abierto."); return; }
    const pairs = []; for (let i = 0; i < open.length; i += 30) { const j = await J(`${DS}/tokens/v1/${CH.ds}/${open.slice(i, i + 30).join(",")}`); if (Array.isArray(j)) pairs.push(...j); }
    const by = bestPairs(pairs, CH.ds); if (!Object.keys(by).length) { console.log("Memes (rápido): sin precios."); return; }
    for (const a of open) if (!by[a]) { console.log("Memes (rápido): falta el precio de alguna; espero a la vuelta completa."); return; }
    rapido(S, by, now);
    for (const v of LB.pop) LBm.pasoVar(v, by, now, { full: false });
    await dineroReal(S, by, now, true);
    publicar(S, LB);
    console.log(`Memes (rápido): ${open.length} abiertas vigiladas · saldo ${r2(S.lastEq)}`); return;
  }
  if (S.last && tnow - Date.parse(S.last) < 40e3) { console.log("Memes: la última vuelta fue hace menos de 40 s; nada que hacer."); return; }
  // EXPLORADOR: todas las fuentes de monedas nuevas de Solana (y todo lo que tenga abierto cualquiera: terminal, «como el vídeo» y variantes)
  const addrs = new Set([...Object.keys(S.pos), ...Object.keys((S.ideal && S.ideal.pos) || {}), ...Object.keys((S.turbo && S.turbo.pos) || {}), ...varOpen(), ...Object.keys(S.young || {}), ...Object.keys(S.watch || {})]);
  const add = (x) => { if (x && typeof x === "string" && x.length > 30) addrs.add(x); };
  // v165 · más fuentes, rotando cada minuto (GeckoTerminal admite ~30 peticiones por minuto): nuevas, tendencia de 1 h/6 h/24 h y las de más volumen
  const GTL = [];
  for (const d of ["5m", "1h", "6h", "24h"]) for (const pg of [1, 2, 3]) GTL.push(`${GT}/networks/${CH.gt}/trending_pools?duration=${d}&page=${pg}`);
  for (const pg of [1, 2, 3, 4, 5]) GTL.push(`${GT}/networks/${CH.gt}/new_pools?page=${pg}`);
  for (const pg of [1, 2, 3]) GTL.push(`${GT}/networks/${CH.gt}/pools?sort=h24_volume_usd_desc&page=${pg}`, `${GT}/networks/${CH.gt}/pools?sort=h24_tx_count_desc&page=${pg}`);
  const rot = Math.floor(tnow / 60000), otras = GTL.filter((u) => !/new_pools\?page=[123]$/.test(u)), gtU = [rot % 2 ? `${GT}/networks/${CH.gt}/new_pools?page=1` : otras[Math.floor(rot / 2) % otras.length]];   // v170 · una lista por red y minuto (nuevas o tendencia, alternando): las 3 redes caben en el límite de GeckoTerminal   // v165 · GitHub comparte IP: GeckoTerminal limita mucho; listas solo un minuto de cada dos y el resto para las operaciones   // 5 listas + 10 operaciones < 30 peticiones/min de GeckoTerminal
  const srcs = [DS + "/token-profiles/latest/v1", DS + "/token-boosts/latest/v1", DS + "/token-boosts/top/v1", ...PALABRAS.concat(CH.busca).filter((_, i, A) => (i + rot * 8) % A.length < 8).map((q) => `${DS}/latest/dex/search?q=${encodeURIComponent(q)}`)];   // v170 · 8 búsquedas distintas por minuto (DexScreener admite 300/min)
  await enParalelo(srcs, 5, async (u) => { const j = await J(u, 2); const arr = Array.isArray(j) ? j : (j && j.pairs) || []; for (const x of arr) if (x && x.chainId === CH.ds) add(x.tokenAddress || (x.baseToken && x.baseToken.address)); });
  // v172 · Solana: listas de Jupiter (gratis, sin clave): las más negociadas, en tendencia y con más actividad real de 5 min a 24 h, y las recién creadas.
  // Dan cientos de monedas por minuto dentro del rango del vídeo (el explorador del vídeo ve ~3 pares nuevos por minuto)
  if (CH.id === "solana") {
    const JL = []; for (const c of ["toptrending", "toptraded", "toporganicscore"]) for (const iv of ["5m", "1h", "6h", "24h"]) JL.push(`${JUP}/tokens/v2/${c}/${iv}?limit=100`);
    const jupU = [`${JUP}/tokens/v2/recent`, ...Array.from({ length: 3 }, (_, i) => JL[(rot * 3 + i) % JL.length])];
    let nj = 0; S.jupc = S.jupc || {}; await enParalelo(jupU, 4, async (u) => { const j = await J(u, 2); for (const x of Array.isArray(j) ? j : []) { const a = x && (x.id || x.address || x.mint); if (a) { add(a); nj++; const ji = jupInfo(x); if (ji) S.jupc[a] = { t: tnow, i: ji }; } } });
    S.jupN = nj;
  }
  await enParalelo(gtU, 4, async (u) => { const j = await J(u, 2); for (const x of (j && j.data) || []) { const id = x.relationships && x.relationships.base_token && x.relationships.base_token.data && x.relationships.base_token.data.id; if (id) add(id.replace(new RegExp("^" + CH.gt + "_"), "")); } });
  // primero lo abierto y lo recién encontrado; las «jóvenes» que se vuelven a mirar, como mucho 200
  const must = new Set([...(CH.id === "solana" ? ["So11111111111111111111111111111111111111112"] : []), ...Object.keys(S.pos), ...Object.keys((S.ideal && S.ideal.pos) || {}), ...Object.keys((S.turbo && S.turbo.pos) || {}), ...varOpen()]);
  const young = Object.entries(S.young || {}).sort((a, b) => b[1] - a[1]).slice(0, 1200).map((x) => x[0]).concat(Object.keys((MUE && MUE.abiertas) || {}));
  const list = [...new Set([...must, ...[...addrs].filter((a) => !(S.young || {})[a]), ...young])].slice(0, 2400), pairs = [];
  const batches = []; for (let i = 0; i < list.length; i += 30) batches.push(list.slice(i, i + 30));
  let fallo = false;
  await enParalelo(batches, 6, async (b) => { try { const j = await J(`${DS}/tokens/v1/${CH.ds}/${b.join(",")}`); if (Array.isArray(j)) pairs.push(...j); } catch (e) { if (b.some((a) => must.has(a))) fallo = true; } });
  if (fallo) { console.log("Memes: faltan precios de algo abierto: no decido esta vuelta."); return; }
  const by = bestPairs(pairs, CH.ds);
  if (!Object.keys(by).length) { console.log("Memes: sin datos de DexScreener; se intenta en la siguiente vuelta."); return; }
  // FILTRO (datos de cadena): RugCheck para las que pasan lo barato con las reglas MÁS LAXAS de toda la población (caché de 30 min)
  const lx = (() => { const x = LBm.laxo(LB); return { ...x, ageMin: Math.min(x.ageMin, TURBO.ageMin), ageMax: Math.max(x.ageMax, TURBO.ageMax), mcapMin: Math.min(x.mcapMin, TURBO.mcapMin), mcapMax: Math.max(x.mcapMax, TURBO.mcapMax), liqMin: Math.min(x.liqMin, TURBO.liqMin), vol1hMin: Math.min(x.vol1hMin, TURBO.vol1hMin), pump1hMax: Math.max(x.pump1hMax, TURBO.pump1hMax) }; })(), ext = { rc: {}, gt: {} }, pre = [];
  const mot = {}; conGenoma(lx, () => { for (const [a, q] of Object.entries(by)) { if (S.pos[a]) continue; const ex = explorador(q, tnow); if (ex) { mot[ex] = (mot[ex] || 0) + 1; continue; } const rr = reglas(q, null); if (rr.liq && rr.vol && rr.pump) pre.push([a, q]); else { const k = !rr.liq ? "liquidez" : !rr.vol ? "volumen" : "subida"; mot[k] = (mot[k] || 0) + 1; } } });
  pre.sort((x, y) => (+(y[1].volume && y[1].volume.h1) || 0) - (+(x[1].volume && x[1].volume.h1) || 0));
  let nrc = 0; const pide = [];
  for (const [a, q] of pre) { const c = S.rc[a], vieja = tnow - (+q.pairCreatedAt || tnow) > 2 * 86400e3; if (c && tnow - c.t < (vieja ? 6 * 3600e3 : 30 * 60000)) ext.rc[a] = c.i; else if (pide.length < R.rcPerRun) pide.push(a); }
  let rcOk = 0, rcErr = 0, rcLate = 0; const tPre = Date.now() - t0;
  if (CH.seg === "rugcheck") await enParalelo(pide, 4, async (a) => { if (Date.now() - t0 > 45e3) { rcLate++; return; } nrc++; try { const j = await J(`${RC}/tokens/${a}/report`, 2); if (j) { const i = rcInfo(j); S.rc[a] = { t: tnow, i }; ext.rc[a] = i; rcOk++; } else rcErr++; } catch (e) { rcErr++; S.rcLastErr = String(e.message || e).slice(0, 80); } });
  else { const lotes = []; for (let i = 0; i < pide.length; i += 10) lotes.push(pide.slice(i, i + 10));
    await enParalelo(lotes, 2, async (lo) => { if (Date.now() - t0 > 45e3) { rcLate += lo.length; return; } nrc += lo.length; try { const j = await J(`${GP}/token_security/${CH.gp}?contract_addresses=${lo.join(",")}`, 2); const res = (j && j.result) || {}; for (const a of lo) { const r = res[a.toLowerCase()]; if (r) { const i = gpInfo(r); S.rc[a] = { t: tnow, i }; ext.rc[a] = i; rcOk++; } else rcErr++; } if (j && j.code !== 1 && j.message) S.rcLastErr = String(j.message).slice(0, 80); } catch (e) { rcErr += lo.length; S.rcLastErr = String(e.message || e).slice(0, 80); } }); }
  if (CH.id === "solana") {
    S.jupc = S.jupc || {}; ext.jup = {};
    for (const [a, c] of Object.entries(S.jupc)) { if (tnow - c.t > 20 * 60000) delete S.jupc[a]; else if (tnow - c.t < 3 * 60000) ext.jup[a] = c.i; }
    const faltan = pre.map(([a]) => a).filter((a) => !ext.jup[a]).slice(0, 100);
    if (faltan.length) { try { const j = await J(`${JUP}/tokens/v2/search?query=${faltan.join(",")}`, 2); for (const x of Array.isArray(j) ? j : []) { const a = x && x.id, ji = jupInfo(x); if (a && ji) { S.jupc[a] = { t: tnow, i: ji }; ext.jup[a] = ji; } } } catch (e) { S.jupErr = String(e.message || e).slice(0, 60); } }
  }
  // ANALISTA: operaciones con cartera de GeckoTerminal para las que tienen datos de RugCheck y no son rug (primero las de más volumen)
  let ngt = 0;
  const pasaTerm = (a, q) => conGenoma(S.genome, () => { const i = ext.rc[a], rr = reglas(q, i); return i && !RULES.some(([k]) => rr[k] !== true); });
  const preGT = pre.filter(([a, q]) => pasaTerm(a, q)).concat(pre.filter(([a, q]) => !pasaTerm(a, q)));
  const pideGT = preGT.filter(([a]) => { const i = ext.rc[a]; return i && !i.rugged; }).slice(0, CH.id === "solana" ? 4 : 3);
  let gtOk = 0; S.gtc = S.gtc || {};
  for (const [a, c] of Object.entries(S.gtc)) { if (tnow - c.t > 15 * 60000) delete S.gtc[a]; else if (tnow - c.t < 4 * 60000) ext.gt[a] = c.g; }   // operaciones de GeckoTerminal: se reutilizan 4 min
  await enParalelo(pideGT.filter(([a]) => !ext.gt[a]), 2, async ([a, q]) => { if (Date.now() - t0 > 52e3) return; ngt++; let j = null; try { j = await J(`${GT}/networks/${CH.gt}/pools/${q.pairAddress}/trades`, 3); } catch (e) { S.gtErr = String(e.message || e).slice(0, 60); } if (!j) S.gtErr = S.gtErr || "404 (piscina no encontrada)"; if (j && j.data) { const g = gtInfo(j.data, tnow); ext.gt[a] = g; S.gtc[a] = { t: tnow, g: { ...g, buyers: g.buyers.slice(0, 150) } }; gtOk++; } });
  S.diag = { hist: S.histN || 0, histErr: S.histErr || null, t: now.toISOString(), jupiter: CH.id === "solana" ? S.jupN || 0 : undefined, monedas: Object.keys(by).length, candidatas: pre.length, motivos: mot, laxo: lx, rcPedidas: pide.length, rcOk, rcErr, rcTarde: rcLate, rcErrMsg: S.rcLastErr || null, gt: ngt, gtOk, gtErr: S.gtErr || null, sPrevias: Math.round(tPre / 1000), s: Math.round((Date.now() - t0) / 1000) };
  try { MS.registrar(MUE, pre, by, ext, now); } catch (e) { console.log("Memes: muestras: " + e.message); }
  // v178 · 📚 historia: 2 monedas por minuto (ya comprobadas en seguridad) → hasta 40 casos cada una con sus velas de 5 min de ~3 días
  try {
    MUE.histHechas = MUE.histHechas || {}; for (const [a, t] of Object.entries(MUE.histHechas)) if (tnow - t > 24 * 3600e3) delete MUE.histHechas[a];
    const cola = Object.keys(S.rc || {}).filter((a) => by[a] && by[a].pairAddress && !MUE.histHechas[a] && !NOMEME.has(a)).sort((x, y) => (+(by[y].volume && by[y].volume.h24) || 0) - (+(by[x].volume && by[x].volume.h24) || 0)).slice(0, 2);
    let nh = 0;
    for (const a of cola) {
      if (Date.now() - t0 > 62e3) break;
      const q = by[a]; let j = null; try { j = await J(`${GT}/networks/${CH.gt}/pools/${q.pairAddress}/ohlcv/minute?aggregate=5&limit=1000&currency=usd`, 2); } catch (e) { S.histErr = String(e.message).slice(0, 60); MUE.histHechas[a] = tnow - 23 * 3600e3; break; }
      const velas = j && j.data && j.data.attributes && j.data.attributes.ohlcv_list, casos = MS.casosHistoria(a, q, S.rc[a].i, (ext.jup || {})[a] || null, velas);
      MS.anadirHistoria(MUE, casos); MUE.histHechas[a] = tnow; nh += casos.length; await sleep(800);
    }
    S.histN = (MUE.hist || []).length; S.histNuevos = nh;
  } catch (e) { console.log("Memes: historia: " + e.message); }
  paso(S, by, now, Math.random, ext);
  pasoIdeal(S, by, now, ext);
  try { pasoTurbo(S, by, now, ext); } catch (e) { console.log("Memes: turbo: " + e.message); }
  for (const v of LB.pop) LBm.pasoVar(v, by, now, { ...ext, full: true }, S.smart, S.hold);
  const evo = LBm.evolucionar(LB, S, now, Math.random, MUE); if (evo) L(S, now, "INFO", "", `🧬 generación ${evo.gen}: se archivan ${evo.out} variantes y nacen otras`);
  if (S.genomeId && S.genomeAt !== S.genomeId) { S.genomeAt = S.genomeId; L(S, now, "INFO", "", `🏆 el terminal pasa a usar las reglas aprendidas de ${S.genomeId}`); }
  await dineroReal(S, by, now, false);
  publicar(S, LB);
  publicarMue(MUE);
  console.log(`Memes: ${Object.keys(by).length} monedas · RugCheck ${nrc} · GeckoTerminal ${ngt} · saldo ${r2(S.lastEq)} · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades} · variantes ${LB.pop.length} (gen ${LB.gen}) · ${Math.round((Date.now() - t0) / 1000)} s`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Memes: " + (e.message || e)); process.exit(0); });
