// v236 · 🟦 OKX EUROPA (licencia MiCA en Malta) para el dinero real. Comisión de contado (nivel más bajo, cuenta solo de contado): 0,20 %.
// Las cuentas europeas usan el dominio eea.okx.com (con www.okx.com la clave «no existe», error 50119).
// Firma: base64(HMAC-SHA256(timestamp ISO + método + ruta con consulta + cuerpo, secreto)) + frase de paso (passphrase) de la clave.
// Si una cripto no tiene par en euros pero sí en USDC, se pasa por USDC (EUR → USDC → cripto y al revés). Si no está en OKX, no se compra.
import { createHmac } from "node:crypto";

export const BASE = "https://eea.okx.com", FEE = 0.002;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), dec = (s) => { const t = String(s || "1"); return t.includes(".") ? t.split(".")[1].replace(/0+$/, "").length || 0 : 0; };
const abajo = (x, d) => { const f = 10 ** d; return Math.floor(x * f + 1e-9) / f; };

export function firma(secret, ts, method, ruta, body) { return createHmac("sha256", secret).update(ts + method + ruta + (body || "")).digest("base64"); }
export function cliente(key, secret, pass, fx = fetch) {
  return async function api(method, ruta, cuerpo) {
    const body = cuerpo ? JSON.stringify(cuerpo) : "", ts = new Date().toISOString();
    const r = await fx(BASE + ruta, { method, headers: { "OK-ACCESS-KEY": key, "OK-ACCESS-SIGN": firma(secret, ts, method, ruta, body), "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": pass, "Content-Type": "application/json" }, body: body || undefined, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    const d0 = j && Array.isArray(j.data) ? j.data[0] : null, sc = d0 && d0.sCode && d0.sCode !== "0" ? d0.sCode : null;
    if (!r.ok || (j && j.code && j.code !== "0") || sc) { const code = sc || (j && j.code) || r.status, msg = (d0 && d0.sMsg) || (j && j.msg) || ""; const e = new Error(`OKX ${r.status} · código ${code}${msg ? " · " + String(msg).slice(0, 80) : ""}`); e.status = r.status; e.code = code; throw e; }
    return j.data || [];
  };
}
// errores de clave (no se reintenta): 501xx = autenticación/permisos (50111 clave inválida, 50113 firma, 50105 frase de paso, 50119 no existe…)
export const errClave = (e) => e && (e.status === 401 || /^501\d\d$/.test(String(e.code)));

// v287 · 🟦 OKX CON SUS PROPIOS OJOS: precios y velas de 5 min DE OKX (públicos), en euros. Las criptos con par en USDC se pasan a euros con USDC-EUR.
// tick: { "SYM-EUR": { bid, ask, last, vq, ch24, sp } } con TODAS las criptos de OKX (también las que no están en Bitvavo)
export async function preciosOkx(I, fx = fetch) {
  const r = await fx(BASE + "/api/v5/market/tickers?instType=SPOT", { signal: AbortSignal.timeout(15000) }), j = await r.json(), d = j.data || [], by = {};
  for (const x of d) by[x.instId] = x; const u = by["USDC-EUR"], ue = u ? +u.bidPx || +u.last : 0, tick = {};
  for (const [b, x] of Object.entries(I || {})) { if (/^(USDC|USDT|EURC|EUR)$/.test(b)) continue; const par = x.EUR ? x.EUR.instId : x.USDC && ue > 0 ? x.USDC.instId : null, t = par && by[par]; if (!t) continue;
    const k = par.endsWith("-EUR") ? 1 : ue, bid = +t.bidPx * k, ask = +t.askPx * k, last = +t.last * k; if (!(bid > 0 && ask > 0)) continue;
    tick[b + "-EUR"] = { bid, ask, last, vq: (+t.volCcy24h || 0) * k, ch24: +t.open24h > 0 ? +t.last / +t.open24h - 1 : 0, sp: (ask - bid) / ((ask + bid) / 2), par, k }; }
  return { tick, ue };
}
// velas de 5 min de un par de OKX → [[t,o,h,l,c,v]] de antigua a reciente, en euros. Con caché en disco (cada vuelta es un proceso nuevo):
// la primera vez baja ~600 velas (300 + 3 páginas de 100) y después solo las últimas.
export async function velasOkx(par, k, cache, fx = fetch) {
  const get = async (u) => { const r = await fx(BASE + u, { signal: AbortSignal.timeout(12000) }); const j = await r.json(); if (j.code && j.code !== "0") throw new Error("OKX velas " + j.code); return j.data || []; };
  const conv = (a) => a.filter((x) => x[8] === "1" || x[8] == null).map((x) => [+x[0], +x[1] * k, +x[2] * k, +x[3] * k, +x[4] * k, +x[5]]);
  let c = (cache && cache[par]) || [];
  const nuevas = conv(await get(`/api/v5/market/candles?instId=${par}&bar=5m&limit=${c.length ? 50 : 300}`));
  if (!c.length || nuevas.length && c[c.length - 1][0] < nuevas[nuevas.length - 1][0] - 290 * 300e3) { c = nuevas.slice();
    for (let p = 0; p < 3 && c.length; p++) { const old = conv(await get(`/api/v5/market/history-candles?instId=${par}&bar=5m&limit=100&after=${Math.min(...c.map((x) => x[0]))}`)); if (!old.length) break; c = c.concat(old); } }
  else c = c.concat(nuevas);
  const m = new Map(); for (const x of c) m.set(x[0], x); c = [...m.values()].sort((a, b) => a[0] - b[0]).slice(-1000);
  if (cache) cache[par] = c; return c;
}
// v288 · 📚 FASE 2: HISTORIAL PROPIO DE OKX (90 días de velas de 5 min) para que los laboratorios de OKX aprendan con datos DE OKX.
// La API de OKX da el pasado de 100 en 100 velas, así que se guarda en disco (la máquina lo conserva entre tramos con la caché de GitHub)
// y se va completando: primero lo reciente de todas (para empezar ya) y luego hacia atrás hasta 90 días. Precios en la moneda del par (EUR o USDC).
const leerJ = async (f) => { try { const fs = await import("node:fs"); return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
const guardaJ = async (f, o) => { const fs = await import("node:fs"), path = await import("node:path"); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + ".tmp", JSON.stringify(o)); fs.renameSync(f + ".tmp", f); };
export async function mantenerHistoria(file, I, { dias = 90, hasta = Date.now() + 40 * 60e3, ritmo = 120, n = 40, fx = fetch, log = () => {}, margen = 60e3 } = {}) {
  const get = async (u) => { await sleep(ritmo); const r = await fx(BASE + u, { signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.code && j.code !== "0") { if (String(j.code) === "50011") await sleep(2000); throw new Error("OKX " + j.code); } return j.data || []; };
  const conv = (a) => a.filter((x) => x[8] === "1" || x[8] == null).map((x) => [+x[0], +x[1], +x[2], +x[3], +x[4], +x[5]]);
  const st = (await leerJ(file)) || { m: {} }; let ciclo = 0;
  while (Date.now() < hasta) {
    let PO = null; try { PO = await preciosOkx(I, fx); } catch (e) { await sleep(30e3); continue; }
    const lista = Object.keys(PO.tick).filter((m) => PO.tick[m].sp < 0.012).sort((a, b) => PO.tick[b].vq - PO.tick[a].vq).slice(0, n); if (PO.tick["BTC-EUR"] && !lista.includes("BTC-EUR")) lista.push("BTC-EUR");
    const desde = Date.now() - dias * 86400e3, ahora = Date.now();
    // 1) lo nuevo de todas (y lo reciente de las que acaban de entrar)
    for (const m of lista) { if (Date.now() > hasta) break; const par = PO.tick[m].par, x = st.m[m] || (st.m[m] = { par, c: [] }); x.par = par;
      try { let c = x.c, ult = c.length ? c[c.length - 1][0] : 0, nu = conv(await get(`/api/v5/market/candles?instId=${par}&bar=5m&limit=300`));
        let viejo = nu.length ? Math.min(...nu.map((y) => y[0])) : ahora;
        for (let p = 0; p < 40 && viejo > Math.max(ult, ahora - 3 * 86400e3); p++) { const o = conv(await get(`/api/v5/market/history-candles?instId=${par}&bar=5m&limit=100&after=${viejo}`)); if (!o.length) break; nu = nu.concat(o); viejo = Math.min(...o.map((y) => y[0])); }
        const mp = new Map(c.map((y) => [y[0], y])); for (const y of nu) mp.set(y[0], y); x.c = [...mp.values()].filter((y) => y[0] >= desde).sort((a, b) => a[0] - b[0]); x.t = ahora; } catch (e) {} }
    st.t = Date.now(); st.lista = lista; await guardaJ(file, st); log(`OKX historial: ${lista.length} criptos al día`);
    // 2) hacia atrás, de la que menos tenga a la que más, hasta 90 días (se guarda cada 4 criptos)
    let hechas = 0;
    for (const m of [...lista].sort((a, b) => (st.m[a] ? st.m[a].c.length : 0) - (st.m[b] ? st.m[b].c.length : 0))) { if (Date.now() > hasta - margen) break; const x = st.m[m]; if (!x || !x.c.length) continue;
      try { let viejo = x.c[0][0], add = []; for (let p = 0; p < 300 && viejo > desde && Date.now() < hasta - margen; p++) { const o = conv(await get(`/api/v5/market/history-candles?instId=${x.par}&bar=5m&limit=100&after=${viejo}`)); if (!o.length) { x.inicio = viejo; break; } add = add.concat(o); viejo = Math.min(...o.map((y) => y[0])); }
        if (add.length) { const mp = new Map(x.c.map((y) => [y[0], y])); for (const y of add) mp.set(y[0], y); x.c = [...mp.values()].filter((y) => y[0] >= desde).sort((a, b) => a[0] - b[0]); } } catch (e) {}
      if (++hechas % 4 === 0) { st.t = Date.now(); await guardaJ(file, st); } }
    for (const m of Object.keys(st.m)) if (!lista.includes(m) && Date.now() - (st.m[m].t || 0) > 3 * 86400e3) delete st.m[m];   // las que ya no están entre las elegidas, fuera a los 3 días
    st.t = Date.now(); await guardaJ(file, st); log(`OKX historial: vuelta ${++ciclo} · ${Object.values(st.m).map((x) => Math.round(x.c.length / 288)).join("/")} días`);
    await sleep(Math.max(0, Math.min(10 * 60e3, hasta - Date.now())));   // cada 10 min, lo nuevo
  }
  return st;
}
// historial guardado → mismo formato que la descarga de Bitvavo ({ paginas, m: { "SYM-EUR": velas en euros } }) para el laboratorio
export function rawDeHistoria(st, PO) {
  const m = {}; for (const [k, x] of Object.entries((st && st.m) || {})) { const t = PO.tick[k]; if (!t || !x.c || x.c.length < 600) continue; const f = x.par.endsWith("-EUR") ? 1 : PO.ue; if (!(f > 0)) continue; m[k] = x.c.filter((y) => y[0] + 300e3 <= Date.now()).map((y) => [y[0], y[1] * f, y[2] * f, y[3] * f, y[4] * f, y[5]]); }
  const L = Object.values(m).map((c) => c.length).sort((a, b) => a - b), med = L.length ? L[Math.floor(L.length / 2)] : 0;
  return { t: Date.now(), paginas: Math.max(0.6, Math.min(26, med / 1000)), m };
}
// lista de criptos al contado (pública): { BASE: { EUR: {instId, lot, min}, USDC: {...} } }
export async function instrumentos(fx = fetch) {
  const r = await fx(BASE + "/api/v5/public/instruments?instType=SPOT", { signal: AbortSignal.timeout(20000) }); const j = await r.json();
  const out = {}; for (const i of j.data || []) { if (i.state !== "live" || !["EUR", "USDC"].includes(i.quoteCcy)) continue; (out[i.baseCcy] || (out[i.baseCcy] = {}))[i.quoteCcy] = { instId: i.instId, lot: dec(i.lotSz), min: +i.minSz || 0 }; }
  return out;
}
// ¿se puede operar esta cripto (mercado de Bitvavo «X-EUR») en OKX? → la ruta: directa en EUR o pasando por USDC
export function ruta(I, m) { const b = String(m).replace(/-EUR$/, ""), x = I && I[b]; if (!x) return null; if (x.EUR) return { tipo: "eur", par: x.EUR }; if (x.USDC && I.USDC && I.USDC.EUR) return { tipo: "usdc", par: x.USDC, puente: I.USDC.EUR }; return null; }

// adaptador para el módulo de dinero real (misma forma que el de Bitvavo)
export function adaptador(api, I, tick = {}) {
  const orden = async (instId, side, sz, quote) => {
    const [o] = await api("POST", "/api/v5/trade/order", { instId, tdMode: "cash", side, ordType: "market", sz: String(sz), tgtCcy: quote ? "quote_ccy" : "base_ccy" });
    for (let i = 0; i < 6; i++) { await sleep(i ? 400 : 150); const [d] = await api("GET", `/api/v5/trade/order?instId=${instId}&ordId=${o.ordId}`); if (d && (d.state === "filled" || (+d.accFillSz > 0 && d.state !== "live" && d.state !== "partially_filled"))) {
      const fill = +d.accFillSz || 0, px = +d.avgPx || 0, fee = Math.abs(+d.fee || 0), base = instId.split("-")[0];
      return { fill, px, quote: fill * px, fee, feeCcy: d.feeCcy, base }; } }
    throw new Error("OKX: la orden no se completó a tiempo");
  };
  // compra con «eur» euros → { q (cripto neta), coste (€), fee (€ aprox.), px }
  async function comprar(m, eur) {
    const R = ruta(I, m); if (!R) throw new Error("no está en OKX");
    if (R.tipo === "eur") { const o = await orden(R.par.instId, "buy", eur.toFixed(2), true); const feeB = o.feeCcy === o.base ? o.fee : 0, feeE = o.feeCcy === "EUR" ? o.fee : o.fee * o.px; if (!(o.fill > 0)) throw new Error("la compra no se ejecutó"); return { q: o.fill - feeB, coste: o.quote + (o.feeCcy === "EUR" ? o.fee : 0), fee: feeE, px: o.px }; }
    const u = await orden(R.puente.instId, "buy", eur.toFixed(2), true), usdc = abajo(u.fill - (u.feeCcy === "USDC" ? u.fee : 0), 4);
    const o = await orden(R.par.instId, "buy", usdc.toFixed(4), true); const feeB = o.feeCcy === o.base ? o.fee : 0;
    return { q: o.fill - feeB, coste: u.quote + (u.feeCcy === "EUR" ? u.fee : 0), fee: (u.feeCcy === "EUR" ? u.fee : u.fee * u.px) + o.fee * (o.feeCcy === o.base ? o.px : 1) * u.px, px: (u.quote) / Math.max(1e-12, o.fill) };
  }
  // vende «q» cripto → { q (vendida), got (€ netos), fee (€ aprox.), px }
  async function vender(m, q) {
    const R = ruta(I, m); if (!R) throw new Error("no está en OKX");
    const sz = abajo(q, R.par.lot); if (!(sz > 0)) return { q: 0, got: 0, fee: 0 };
    const o = await orden(R.par.instId, "sell", sz.toFixed(R.par.lot), false);
    if (R.tipo === "eur") { const got = o.quote - (o.feeCcy === "EUR" ? o.fee : 0); return { q: o.fill, got, fee: o.fee, px: o.px }; }
    const usdc = abajo(o.quote - (o.feeCcy === "USDC" ? o.fee : 0), R.puente.lot); const u = await orden(R.puente.instId, "sell", usdc.toFixed(R.puente.lot), false);
    return { q: o.fill, got: u.quote - (u.feeCcy === "EUR" ? u.fee : 0), fee: u.fee + o.fee * u.px, px: (u.quote) / Math.max(1e-12, o.fill) };
  }
  // mínimo por orden en euros (aprox.: el mínimo de OKX en cripto × precio), y un suelo de 5 € para no hacer órdenes ridículas
  async function mercado(m) { const R = ruta(I, m), px = (tick[m] && (tick[m].ask || tick[m].bid)) || 0; return { min: Math.max(5, R ? R.par.min * px * 1.05 : 5) }; }
  async function saldoEur() { const [d] = await api("GET", "/api/v5/account/balance?ccy=EUR"); const x = d && (d.details || []).find((y) => y.ccy === "EUR"); return x ? +(x.availBal || x.cashBal) || 0 : 0; }
  // v278 · saldo REAL de todas las monedas de la cuenta (para reflejar exactamente lo que hay y vender lo que de verdad queda)
  async function saldos() { const [d] = await api("GET", "/api/v5/account/balance"); const o = {}; for (const x of (d && d.details) || []) { const q = +(x.cashBal || x.availBal || 0); if (q > 0) o[x.ccy] = q; } return o; }
  async function saldo(sym) { const o = await saldos(); return o[sym] || 0; }
  // v282 · precios de OKX (no de Bitvavo) en euros para valorar la cuenta igual que la app de OKX: par en EUR, o en USDC × USDC-EUR
  async function precios() { const d = await api("GET", "/api/v5/market/tickers?instType=SPOT"), eur = {}, usdc = {}; for (const x of d) { const [b, q] = String(x.instId).split("-"), px = +x.bidPx || +x.last || 0; if (!(px > 0)) continue; if (q === "EUR") eur[b] = px; else if (q === "USDC") usdc[b] = px; }
    const u = eur.USDC || 0; for (const [b, px] of Object.entries(usdc)) if (!eur[b] && u > 0) eur[b] = px * u; eur.EUR = 1; return eur; }
  // v282 · operaciones REALES de la cuenta (lo mismo que sale en «historial de órdenes» de OKX, últimos 3 meses)
  async function operaciones() { const out = [], P = await precios().catch(() => ({})), u = P.USDC || 1; let after = "";
    for (let i = 0; i < 5; i++) { const d = await api("GET", "/api/v5/trade/fills-history?instType=SPOT&limit=100" + (after ? "&after=" + after : "")); if (!d.length) break;
      for (const x of d) { const [b, q] = String(x.instId).split("-"); if (b === "USDC" || b === "USDT" || b === "EURC") continue; const k = q === "EUR" ? 1 : q === "USDC" ? u : 0; if (!k) continue;
        const sz = +x.fillSz || 0, px = (+x.fillPx || 0) * k, fee = Math.abs(+x.fee || 0), feeE = x.feeCcy === b ? fee * px : x.feeCcy === "EUR" ? fee : fee * k;
        out.push({ t: +x.ts, sym: b, side: x.side, q: sz - (x.side === "buy" && x.feeCcy === b ? fee : 0), eur: sz * px, fee: feeE }); }
      after = d[d.length - 1].billId; if (d.length < 100) break; }
    return out; }
  return { nombre: "OKX", fee: FEE, tiene: (m) => !!ruta(I, m), comprar, vender, mercado, saldoEur, saldos, saldo, precios, operaciones, errClave };
}
