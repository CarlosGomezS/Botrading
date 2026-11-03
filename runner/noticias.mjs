// v208 · 📰 NOTICIAS EN SEGUNDOS (SOLO DINERO FICTICIO): mira sin parar los anuncios de nuevas criptos de los grandes exchanges
// (Upbit y Binance cada 3 s; OKX y KuCoin cada 10 s; Coinbase, Bithumb y Bitvavo cada 30 s). Si anuncian una cripto que se puede
// comprar en Bitvavo (en euros), la «compra» con dinero ficticio al precio real del libro y la vende con su stop, su objetivo o su tiempo.
// 🧠 APRENDE: de CADA anuncio (se compre o no) apunta cómo se movió el precio a 1, 5, 15, 30 y 60 min; con eso decide para cada fuente
// cuánto tiempo conviene mantener y si merece la pena operarla (solo opera fuentes cuya media, ya con costes, sea positiva).
// Llega SEGUNDOS tarde (no milisegundos): se pierde el primer salto; la prueba en ficticio dirá si aun así da dinero.
import { exec } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const REPO = process.env.GITHUB_REPOSITORY || "", TOKEN = process.env.GITHUB_TOKEN || "", RAMA = "noticias", BV = "https://api.bitvavo.com/v2";
export const FEE = 0.0025, START = 100, SIZE = 0.2, HZ = [1, 5, 15, 30, 60], STOP = 0.06;
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (bot-trading)", Accept: "application/json" };
async function J(u) { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
// símbolos entre paréntesis, p. ej. «Binance Will List Foo (FOO)» → FOO
// v213 · también «GRVT/USD» o «IRYS/USDT» (así titula OKX)
export const simbolos = (t) => [...new Set([...String(t || "").matchAll(/\(([A-Z0-9]{2,12})\)/g)].map((m) => m[1]).concat([...String(t || "").matchAll(/\b([A-Z0-9]{2,12})\/(?:USDT|USDC|USD|EUR)\b/g)].map((m) => m[1])))].filter((s) => !/^(USDT|USDC|USD|EUR|KRW|BTC|ETH|SPOT|UTC|KST|AM|PM)$/.test(s));
const esListado = (t) => /list|listing|launch|신규|거래지원/i.test(t) && !/delist|종료|remove|removal|suspen|migration|swap|airdrop|futures|perpetual|margin|collateral|tokenized|bstocks|stock/i.test(t);
// cada fuente devuelve [{ id, sym, titulo }]
export const FUENTES = {
  // v209 · Upbit y Binance cada medio segundo (cada fuente en su propio bucle, en paralelo; si una fuente se queja, espera más y vuelve a bajar)
  // v210 · Upbit bloquea su web de anuncios a los servidores de la nube (403), así que se vigila su lista de mercados (api.upbit.com, sí responde
  // cada medio segundo): en cuanto abre un mercado nuevo (KRW, BTC o USDT) es la señal
  upbit: { cada: 0.5, n: "Upbit (Corea)", leer: async () => { const j = await J("https://api.upbit.com/v1/market/all?isDetails=false"); return (j || []).map((x) => ({ id: "u" + x.market, sym: String(x.market).split("-")[1], titulo: "Upbit abre el mercado " + x.market + (x.english_name ? " (" + x.english_name + ")" : "") })); } },
  binance: { cada: 2, n: "Binance",   // v211 · a 0,5 s Binance responde 429 (demasiadas peticiones desde la nube): cada 2 s
 leer: async () => { const j = await J("https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=10"); const a = ((j.data && j.data.catalogs && j.data.catalogs[0] && j.data.catalogs[0].articles) || []); return a.filter((x) => esListado(x.title)).flatMap((x) => simbolos(x.title).map((s) => ({ id: "b" + x.id + s, sym: s, titulo: x.title, pub: +x.releaseDate || null }))); } },
  okx: { cada: 2, n: "OKX", leer: async () => { const j = await J("https://www.okx.com/api/v5/support/announcements?annType=announcements-new-listings"); const d = ((j.data && j.data[0] && j.data[0].details) || []); return d.filter((x) => esListado(x.title)).flatMap((x) => simbolos(x.title).map((s) => ({ id: "o" + x.pTime + s, sym: s, titulo: x.title, pub: +x.pTime || null }))); } },
  kucoin: { cada: 2, n: "KuCoin", leer: async () => { const j = await J("https://api.kucoin.com/api/v3/announcements?annType=new-listings&pageSize=10"); return ((j.data && j.data.items) || []).filter((x) => esListado(x.annTitle)).flatMap((x) => simbolos(x.annTitle).map((s) => ({ id: "k" + x.annId + s, sym: s, titulo: x.annTitle, pub: +x.cTime || null }))); } },
  coinbase: { cada: 10, n: "Coinbase", leer: async () => { const j = await J("https://api.exchange.coinbase.com/products"); return (j || []).map((x) => ({ id: "c" + x.base_currency, sym: x.base_currency, titulo: "Coinbase abre " + x.id })); } },
  bithumb: { cada: 10, n: "Bithumb (Corea)", leer: async () => { const j = await J("https://api.bithumb.com/public/ticker/ALL_KRW"); return Object.keys((j && j.data) || {}).filter((k) => k !== "date").map((k) => ({ id: "h" + k, sym: k, titulo: "Bithumb abre " + k + "/KRW" })); } }
};
// v213 · más exchanges que abren mercados nuevos a menudo (más anuncios = aprende antes): MEXC, Gate y Kraken, cada 30 s
Object.assign(FUENTES, {
  mexc: { cada: 30, n: "MEXC", leer: async () => { const j = await J("https://api.mexc.com/api/v3/defaultSymbols"); return ((j && j.data) || []).filter((x) => /USDT$/.test(x)).map((x) => ({ id: "m" + x, sym: x.replace(/USDT$/, ""), titulo: "MEXC abre " + x })); } },
  gate: { cada: 30, n: "Gate", leer: async () => { const j = await J("https://api.gateio.ws/api/v4/spot/currency_pairs"); return (j || []).filter((x) => x.quote === "USDT" && x.trade_status === "tradable").map((x) => ({ id: "g" + x.id, sym: x.base, titulo: "Gate abre " + x.id, pub: x.buy_start ? x.buy_start * 1000 : null })); } },
  kraken: { cada: 30, n: "Kraken", leer: async () => { const j = await J("https://api.kraken.com/0/public/AssetPairs"); return Object.values((j && j.result) || {}).filter((x) => /EUR$|USD$/.test(x.wsname || "")).map((x) => ({ id: "r" + x.wsname, sym: String(x.wsname).split("/")[0].replace(/^XBT$/, "BTC"), titulo: "Kraken abre " + x.wsname })); } }
});
export function fresh(now = new Date()) { return { v: 1, start: START, cash: START, pos: {}, closed: [], log: [], eq: [], st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0 }, seen: {}, ev: [], fuentes: {}, since: now.toISOString() }; }
const L = (S, now, ev, sym, txt) => { S.log.unshift({ t: now.toISOString(), ev, sym, txt }); S.log = S.log.slice(0, 200); };
// lo aprendido por fuente: media del cambio de precio a cada horizonte (ya con costes de entrar y salir) → mejor tiempo y si se opera
export function aprendido(S) {
  const out = {};
  for (const f of Object.keys(FUENTES)) {
    const evs = S.ev.filter((e) => e.f === f && e.r), m = {};
    for (const h of HZ) { const xs = evs.map((e) => e.r[h]).filter((x) => x != null); if (xs.length) m[h] = { n: xs.length, med: r2(xs.reduce((a, b) => a + b, 0) / xs.length * 100 - 2 * FEE * 100 - 0.2) }; }
    const best = HZ.filter((h) => m[h] && m[h].n >= 3).sort((a, b) => m[b].med - m[a].med)[0];
    out[f] = { m, mejorMin: best || 15, opera: best ? m[best].med > 0 : true /* sin datos: prueba */, n: evs.length };
  }
  return out;
}
async function libro(m) { const j = await J(`${BV}/ticker/book?market=${m}`); return { bid: +j.bid, ask: +j.ask }; }
export function comprar(S, m, sym, f, ask, now, minutos) {
  const amt = Math.min(S.cash, (S.cash + Object.values(S.pos).reduce((t, p) => t + p.q * (p.last || p.px), 0)) * SIZE); if (amt < 2 || S.pos[m]) return false;
  const q = amt * (1 - FEE) / ask; S.cash -= amt; S.st.trades++; S.st.fees += amt * FEE;
  S.pos[m] = { sym, f, q, px: ask, cost: amt, t0: now.toISOString(), peak: ask, last: ask, hasta: now.getTime() + minutos * 60000, h: [[now.toISOString(), ask]] };
  L(S, now, "ENTER", sym, `${r2(amt)} € · anuncio de ${FUENTES[f] ? FUENTES[f].n : f} · mantiene hasta ${minutos} min`); return true;
}
export function vigilar(S, m, bid, now) {
  const p = S.pos[m]; if (!p || !(bid > 0)) return; p.last = bid; p.peak = Math.max(p.peak, bid); p.h.push([now.toISOString(), bid]); p.h = p.h.slice(-120);
  let why = null; if (bid <= p.px * (1 - STOP)) why = `stop −${STOP * 100} %`; else if (p.peak >= p.px * 1.08 && bid <= p.peak * 0.95) why = "stop móvil (5 % bajo el máximo)"; else if (now.getTime() >= p.hasta) why = "tiempo cumplido";
  if (!why) return;
  const got = p.q * bid * (1 - FEE), pnl = got - p.cost; S.cash += got; S.st.pnl += pnl; S.st.fees += p.q * bid * FEE; if (pnl >= 0) S.st.wins++; else S.st.losses++;
  S.closed.unshift({ m, sym: p.sym, f: p.f, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(got), pnl: r2(pnl), pc: r2((got / p.cost - 1) * 100), why, h: p.h.slice(-60) }); S.closed = S.closed.slice(0, 300);
  delete S.pos[m]; L(S, now, pnl >= 0 ? "WIN" : "LOSS", p.sym, `${pnl >= 0 ? "+" : ""}${r2(pnl)} € · ${r2((got / p.cost - 1) * 100)} % · ${why}`);
}
async function leer(f, rama) {
  if (!REPO || !TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${f}?ref=${rama}`, { headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github.raw+json" } });
  if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return await r.json();
}
async function publicar(S) {   // sin bloquear: mientras se guarda, las fuentes se siguen leyendo cada medio segundo
  const out = JSON.stringify(S); if (!REPO || !TOKEN) { writeFileSync("noticias.json", out); return; }
  const pub = path.join(process.cwd(), ".pub-noticias"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "noticias.json"), out);
  const g = (c) => new Promise((ok, ko) => exec(`git -C "${pub}" ${c}`, (e) => (e ? ko(e) : ok())));
  try { await g("init -q -b x"); await g('config user.name "bot-trading"'); await g('config user.email "bot-trading@users.noreply.github.com"'); await g("add -A"); await g(`commit -q -m "noticias ${new Date().toISOString()}"`); } catch (e) { return; }
  for (let i = 0; i < 3; i++) { try { await g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git HEAD:${RAMA}`); return; } catch (e) { if (i === 2) console.log("Noticias: no pude guardar"); } }
}

async function main() {
  const fin = Date.now() + (+process.argv[2] || 27) * 60000;
  let S = null; try { S = await leer("noticias.json", RAMA); } catch (e) { console.log("Noticias: " + e.message); }
  if (!S || S.v !== 1) { S = fresh(); L(S, new Date(), "INFO", "", "📰 empieza «noticias en segundos» con 100 € ficticios"); }
  let mercados = new Set(), cambio = true; S.aprendido = aprendido(S);
  const bvMercados = async () => { try { const j = await J(`${BV}/markets`); const s = new Set(); for (const x of j) if (x.quote === "EUR" && x.status === "trading") s.add(x.base); if (s.size) mercados = s; } catch (e) {} };
  await bvMercados();
  // 1) un bucle por fuente, todos a la vez
  const bucle = async (f, F) => {
    let espera = F.cada * 1000, n = 0, ms = 0;
    while (Date.now() < fin) {
      const t0 = Date.now(); let items = null;
      try { items = await F.leer(); espera = Math.max(F.cada * 1000, espera * 0.8); n++; ms += Date.now() - t0; S.fuentes[f] = { ok: true, t: new Date().toISOString(), n: items.length, cadaMs: Math.round(espera), respMs: Math.round(ms / n), lecturas: n }; }
      catch (e) { espera = Math.min(30000, espera * 2); S.fuentes[f] = { ok: false, t: new Date().toISOString(), err: String(e.message).slice(0, 40), cadaMs: Math.round(espera) }; }
      if (items) {
        const vistos = S.seen[f] || (S.seen[f] = {}), primera = !Object.keys(vistos).length, now = new Date(), t = now.getTime();
        for (const it of items) {
          if (vistos[it.id]) continue; vistos[it.id] = t; if (primera) continue;   // la primera vez solo se apunta lo que ya había
          const m = it.sym + "-EUR", hay = mercados.has(it.sym), A = S.aprendido[f] || { opera: true, mejorMin: 15 };
          const e = { t, f, sym: it.sym, titulo: String(it.titulo).slice(0, 120), bitvavo: hay, p0: null, r: {}, retraso: it.pub ? Math.max(0, Math.round((t - it.pub) / 100) / 10) : null };
          if (hay) { try { const b = await libro(m); e.p0 = b.ask; e.compraMs = Date.now() - t; if (A.opera && b.ask > 0) comprar(S, m, it.sym, f, b.ask, new Date(), A.mejorMin); } catch (er) {} }
          S.ev.unshift(e); S.ev = S.ev.slice(0, 400); cambio = true;
          L(S, now, "NEWS", it.sym, `${F.n}: ${e.titulo}${e.retraso != null ? ` · visto ${e.retraso} s después de publicarse` : ""}${hay ? "" : " · no está en Bitvavo"}`);
        }
        const ks = Object.entries(vistos); if (ks.length > 3000) S.seen[f] = Object.fromEntries(ks.sort((a, b) => b[1] - a[1]).slice(0, 2500));
      }
      await sleep(Math.max(0, espera - (Date.now() - t0)));
    }
  };
  // 2) precios: lo abierto cada 2 s y lo que se sigue para aprender
  const precios = async () => {
    while (Date.now() < fin) {
      const now = new Date(), t = now.getTime();
      for (const m of Object.keys(S.pos)) { try { const b = await libro(m); vigilar(S, m, b.bid, now); cambio = true; } catch (er) {} }
      for (const e of S.ev.filter((e) => e.p0 && t - e.t <= 61 * 60000 && HZ.some((h) => e.r[h] == null && t - e.t >= h * 60000))) { try { const b = await libro(e.sym + "-EUR"); for (const h of HZ) if (e.r[h] == null && t - e.t >= h * 60000) { e.r[h] = r4(b.bid / e.p0 - 1); cambio = true; } } catch (er) {} }
      S.aprendido = aprendido(S); await sleep(2000);
    }
  };
  // 3) guardar cada minuto y repasar los mercados de Bitvavo cada 10 min
  const guardar = async () => {
    let k = 0;
    while (Date.now() < fin) {
      await sleep(60000); if (++k % 10 === 0) await bvMercados();
      const eq = S.cash + Object.values(S.pos).reduce((a, p) => a + p.q * (p.last || p.px), 0); S.lastEq = r2(eq); S.last = new Date().toISOString(); S.eq.push([S.last, S.lastEq]); S.eq = S.eq.slice(-2000);
      await publicar(S); cambio = false;
    }
  };
  await Promise.all([...Object.entries(FUENTES).map(([f, F]) => bucle(f, F)), precios(), guardar()]);
  S.last = new Date().toISOString(); await publicar(S); console.log(`Noticias: ${S.ev.length} anuncios vistos · ${S.st.trades} operaciones · saldo ${S.lastEq ?? S.cash} €`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log("Noticias: " + (e.message || e)); process.exit(0); });
