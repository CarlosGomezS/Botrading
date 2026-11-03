// v158 · 🪙 MEMES (SOLO DINERO FICTICIO): imita los bots «nocturnos» de memecoins de Solana que circulan por redes,
// pero con costes REALISTAS, para saber con números si ganan de verdad. Nunca toca dinero real ni Trading 212
// (Trading 212 no tiene memecoins). Datos públicos de DexScreener. Estado en la rama «meme» (meme.json): sin secretos ni importes reales
// (la cartera empieza con 500 de prueba; la app lo muestra a la escala de lo que has ingresado en Trading 212).
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO = process.env.GITHUB_REPOSITORY || "", TOKEN = process.env.GITHUB_TOKEN || "";
const DS = "https://api.dexscreener.com";
// reglas (como las del vídeo, con lo que publica DexScreener)
export const R = {
  start: 500, size: 0.08, maxPos: 8, minScore: 70,
  ageMin: 30, ageMax: 72 * 60,             // minutos
  mcapMin: 300e3, mcapMax: 20e6, liqMin: 40e3, vol1hMin: 50e3, pump1hMax: 80, buyRatioMin: 1.1, tx1hMin: 100, liqMcapMin: 0.03,
  stop: 0.06, trailOn: 0.12, trail: 0.15, maxHoldH: 24, rugLiq: 5000, cooldownH: 24,
  fee: 0.005,                              // por lado: comisión del DEX (~0,25 %) + prioridad/propinas de Solana
  slipMin: 0.01, slipMax: 0.12, failP: 0.05, failCost: 0.02 // órdenes que fallan (red saturada): cuestan una pequeña propina
};
const r2 = (x) => Math.round(x * 100) / 100;
const madrid = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function J(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "bot-trading-memes" }, signal: AbortSignal.timeout(15000) }); if (r.status === 429) { await sleep(3000 * (i + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
export function freshState() { return { v: 1, start: R.start, cash: R.start, pos: {}, closed: [], log: [], eq: [], seen: {}, cool: {}, st: { seen: 0, killed: 0, scored: 0, trades: 0, wins: 0, losses: 0, fees: 0, failed: 0, rugs: 0, pnl: 0 }, nights: [], since: new Date().toISOString() }; }

// elige, de cada moneda, el par con más liquidez
export function bestPairs(pairs) { const m = {}; for (const p of pairs || []) { if (!p || p.chainId !== "solana" || !p.baseToken) continue; const a = p.baseToken.address, l = +(p.liquidity && p.liquidity.usd) || 0; if (!m[a] || l > (+(m[a].liquidity && m[a].liquidity.usd) || 0)) m[a] = p; } return m; }

// las 8 reglas duras: devuelve el motivo del descarte o null si pasa
export function filtro(p, now) {
  const age = (now - (+p.pairCreatedAt || 0)) / 60000, mc = +(p.marketCap || p.fdv) || 0, liq = +(p.liquidity && p.liquidity.usd) || 0, v1 = +(p.volume && p.volume.h1) || 0,
    ch1 = +(p.priceChange && p.priceChange.h1) || 0, t = (p.txns && p.txns.h1) || {}, b = +t.buys || 0, s = +t.sells || 0;
  if (!(+p.priceUsd > 0)) return "sin precio";
  if (age < R.ageMin || age > R.ageMax) return "edad fuera de 30 min-72 h";
  if (mc < R.mcapMin || mc > R.mcapMax) return "tamaño fuera de 0,3-20 M$";
  if (liq < R.liqMin) return "liquidez < 40 k$";
  if (v1 < R.vol1hMin) return "volumen 1 h < 50 k$";
  if (ch1 > R.pump1hMax) return "ya subió > 80 % en 1 h";
  if (b + s < R.tx1hMin) return "pocas operaciones en 1 h";
  if (b < s * R.buyRatioMin) return "más ventas que compras";
  if (liq / mc < R.liqMcapMin) return "liquidez muy pequeña para su tamaño";
  return null;
}
// nota 0-100: impulso, presión compradora, volumen/liquidez y liquidez/tamaño
export function nota(p) {
  const cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  const ch1 = +(p.priceChange && p.priceChange.h1) || 0, ch5 = +(p.priceChange && p.priceChange.m5) || 0, t = (p.txns && p.txns.h1) || {}, br = (+t.buys || 0) / Math.max(1, +t.sells || 0),
    liq = +(p.liquidity && p.liquidity.usd) || 1, vl = (+(p.volume && p.volume.h1) || 0) / liq, lm = liq / Math.max(1, +(p.marketCap || p.fdv) || 1);
  return Math.round(25 * (0.7 * cl(ch1, 0, 40) + 0.3 * cl(ch5, 0, 8)) + 25 * cl(br, 1, 2) + 25 * cl(vl, 0.5, 3) + 25 * cl(lm, 0.03, 0.15));
}
export const slip = (eur, liq) => Math.min(R.slipMax, R.slipMin + eur / Math.max(1, liq));
export function equity(S, px) { let v = S.cash; for (const [a, p] of Object.entries(S.pos)) v += p.q * (px[a] != null ? px[a] : p.last); return v; }

function logE(S, now, ev, sym, txt) { S.log.unshift({ t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 400); }
function cerrar(S, a, now, px, liq, why, rug) {
  const p = S.pos[a]; const sl = rug ? 0 : slip(p.q * px, liq), got = rug ? 0 : p.q * px * (1 - sl) * (1 - R.fee), fee = rug ? 0 : p.q * px * (1 - sl) * R.fee + p.q * px * sl;
  const pnl = got - p.cost; S.cash += got; S.st.pnl += pnl; S.st.fees += fee; if (pnl >= 0) S.st.wins++; else S.st.losses++; if (rug) S.st.rugs++;
  S.closed.unshift({ sym: p.sym, a, url: p.url, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(got), pnl: r2(pnl), pc: r2((got / p.cost - 1) * 100), why, sc: p.sc }); S.closed = S.closed.slice(0, 1000);
  S.cool[a] = now.getTime(); delete S.pos[a];
  logE(S, now, pnl >= 0 ? "gana" : rug ? "hundida" : "pierde", p.sym, `${why} · ${pnl >= 0 ? "+" : ""}${r2(pnl)} (${r2((got / p.cost - 1) * 100)} %)`);
}

// una vuelta: vigila lo abierto, busca monedas nuevas, entra en las mejores. rnd y now se pueden fijar en las pruebas
export function paso(S, pairsByAddr, now = new Date(), rnd = Math.random) {
  const tnow = now.getTime(), px = {};
  // 1) lo abierto
  for (const [a, p] of Object.entries(S.pos)) {
    const q = pairsByAddr[a], liq = q ? +(q.liquidity && q.liquidity.usd) || 0 : 0, pr = q ? +q.priceUsd : 0;
    if (!q || !(pr > 0) || liq < R.rugLiq) { cerrar(S, a, now, 0, 0, "liquidez retirada o moneda desaparecida (rug)", true); continue; }
    px[a] = pr; p.last = pr; p.peak = Math.max(p.peak || p.px, pr); p.liq = liq;
    if (p.peak >= p.px * (1 + R.trailOn)) p.trailing = true;
    const ageH = (tnow - Date.parse(p.t0)) / 3600e3;
    if (pr <= p.px * (1 - R.stop)) cerrar(S, a, now, pr, liq, `stop −${R.stop * 100} %`);
    else if (p.trailing && pr <= p.peak * (1 - R.trail)) cerrar(S, a, now, pr, liq, `stop móvil (${R.trail * 100} % bajo el máximo)`);
    else if (ageH >= R.maxHoldH) cerrar(S, a, now, pr, liq, `tiempo máximo (${R.maxHoldH} h)`);
  }
  // 2) nuevas
  const cands = [];
  for (const [a, q] of Object.entries(pairsByAddr)) {
    if (S.pos[a]) continue;
    // se reexamina en cada vuelta (una moneda puede cumplir más tarde), pero en las cifras cuenta una sola vez
    let z = S.seen[a]; if (!z || typeof z !== "object") { z = S.seen[a] = { t: tnow, k: 0, s: 0 }; S.st.seen++; }
    const w = filtro(q, tnow); if (w) { if (!z.k) { z.k = 1; S.st.killed++; } continue; }
    if (S.cool[a] && tnow - S.cool[a] < R.cooldownH * 3600e3) continue;
    if (!z.s) { z.s = 1; S.st.scored++; } const sc = nota(q); if (sc >= R.minScore) cands.push({ a, q, sc });
  }
  cands.sort((x, y) => y.sc - x.sc);
  for (const { a, q, sc } of cands) {
    if (Object.keys(S.pos).length >= R.maxPos) break;
    const eq = equity(S, px), amt = Math.min(S.cash, eq * R.size), liq = +q.liquidity.usd, pr = +q.priceUsd;
    if (amt < 1) break;
    if (rnd() < R.failP) { S.cash -= R.failCost; S.st.failed++; S.st.fees += R.failCost; logE(S, now, "falla", q.baseToken.symbol, "la orden no entró (red saturada): se pierde la propina"); continue; }
    const sl = slip(amt, liq), fill = pr * (1 + sl), qn = amt * (1 - R.fee) / fill;
    S.cash -= amt; S.st.trades++; S.st.fees += amt * R.fee + amt * (1 - R.fee) * sl / (1 + sl);
    S.pos[a] = { sym: q.baseToken.symbol, name: q.baseToken.name, url: q.url, q: qn, px: pr, cost: amt, t0: now.toISOString(), peak: pr, last: pr, sc, liq };
    px[a] = pr;
    logE(S, now, "entra", q.baseToken.symbol, `nota ${sc} · ${r2(amt)} · deslizamiento ${r2(sl * 100)} %`);
  }
  // 3) limpieza y curva
  for (const [a, z] of Object.entries(S.seen)) if (tnow - (z && z.t || 0) > 4 * 86400e3) delete S.seen[a];
  for (const [a, t] of Object.entries(S.cool)) if (tnow - t > R.cooldownH * 3600e3) delete S.cool[a];
  const eq = equity(S, px);
  S.eq.push([now.toISOString(), r2(eq)]); if (S.eq.length > 3000) S.eq = S.eq.filter((_, i) => i % 2 === 0 || i > S.eq.length - 500);
  // 4) parte de cada día (hora de España): cerrado, abierto, comisiones y fallidas por separado
  const d = madrid(now).slice(0, 10);
  if (!S.day || S.day.d !== d) { if (S.day) S.nights.unshift({ ...S.day, eq1: S.lastEq }); S.nights = S.nights.slice(0, 120); S.day = { d, eq0: S.lastEq != null ? S.lastEq : eq, st0: { ...S.st } }; }
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
  const now = new Date();
  let S = await leerEstado(); if (!S || S.v !== 1) S = freshState();
  if (S.last && now - Date.parse(S.last) < 100e3) { console.log("Memes: la última vuelta fue hace menos de 100 s; nada que hacer."); return; }
  // monedas nuevas de Solana: perfiles recientes + promocionadas recientes, más las que ya tiene abiertas
  const addrs = new Set(Object.keys(S.pos));
  for (const u of ["/token-profiles/latest/v1", "/token-boosts/latest/v1"]) {
    try { const j = await J(DS + u); for (const x of Array.isArray(j) ? j : []) if (x && x.chainId === "solana" && x.tokenAddress) addrs.add(x.tokenAddress); } catch (e) { console.log("Memes: no pude leer " + u + ": " + e.message); }
  }
  const list = [...addrs], pairs = [];
  for (let i = 0; i < list.length; i += 30) { try { const j = await J(`${DS}/tokens/v1/solana/${list.slice(i, i + 30).join(",")}`); if (Array.isArray(j)) pairs.push(...j); } catch (e) { console.log("Memes: fallo leyendo precios: " + e.message); if (Object.keys(S.pos).length) { console.log("Memes: sin precios de lo abierto: no decido esta vuelta."); return; } } }
  const by = bestPairs(pairs);
  if (!Object.keys(by).length) { console.log("Memes: DexScreener no devolvió datos; se intenta en la siguiente vuelta."); return; }
  paso(S, by, now);
  publicar(S);
  console.log(`Memes: ${Object.keys(by).length} monedas leídas · saldo ${r2(S.lastEq)} · abiertas ${Object.keys(S.pos).length} · operaciones ${S.st.trades}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Memes: " + (e.message || e)); process.exit(0); });
