// v440 · 💶 SALDO EN VIVO de Bitvavo y OKX: cada 10 s lee lo que hay de verdad en cada cuenta (euros y cada cripto, con las claves de solo
// lectura/operar que ya usa el bot) y, si ha cambiado algo (un ingreso, una retirada, una compra o una venta), lo publica CIFRADO en la rama
// «saldo-vivo». La app lo lee cada 10 s y lo valora con los precios en directo. Nunca escribe importes en los registros públicos.
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cliente as cBv } from "./bitvavo-real.mjs";
import { cliente as cOkx } from "./okx.mjs";
import { encrypt } from "./real-cfg.mjs";
const env = (k) => (process.env[k] || "").trim(), REPO = env("GITHUB_REPOSITORY") || "CarlosGomezS/Botrading", TOKEN = env("GITHUB_TOKEN"), PW = env("REAL_VIEW_PASS");
const DUR = (+env("VIVO_SEG") || 27 * 60) * 1000, CADA = 10000, LATIDO = 5 * 60e3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), r2 = (x) => Math.round(x * 100) / 100;
const CTA = [];
if (env("BITVAVO_KEY") && env("BITVAVO_SECRET")) { const api = cBv(env("BITVAVO_KEY"), env("BITVAVO_SECRET"));
  CTA.push({ ex: "bitvavo", saldos: async () => { const b = await api("GET", "/balance"), o = {}; for (const x of Array.isArray(b) ? b : []) { const q = (+x.available || 0) + (+x.inOrder || 0); if (q > 0) o[x.symbol] = q; } return o; },
    precios: async () => { const r = await fetch("https://api.bitvavo.com/v2/ticker/price", { signal: AbortSignal.timeout(10000) }), j = await r.json(), o = { EUR: 1 }; for (const x of j || []) { const [b, q] = String(x.market).split("-"); if (q === "EUR" && +x.price > 0) o[b] = +x.price; } return o; } }); }
if (env("OKX_KEY") && env("OKX_SECRET") && env("OKX_PASSPHRASE")) { const api = cOkx(env("OKX_KEY"), env("OKX_SECRET"), env("OKX_PASSPHRASE"));
  CTA.push({ ex: "okx", saldos: async () => { const [d] = await api("GET", "/api/v5/account/balance"), o = {}; for (const x of (d && d.details) || []) { const q = +(x.cashBal || x.availBal || 0); if (q > 0) o[x.ccy] = q; } return o; },
    precios: async () => { const d = await api("GET", "/api/v5/market/tickers?instType=SPOT"), eur = { EUR: 1 }, usdc = {}; for (const x of d) { const [b, q] = String(x.instId).split("-"), px = +x.bidPx || +x.last || 0; if (!(px > 0)) continue; if (q === "EUR") eur[b] = px; else if (q === "USDC") usdc[b] = px; }
      const u = eur.USDC || 0; for (const [b, px] of Object.entries(usdc)) if (!eur[b] && u > 0) eur[b] = px * u; return eur; } }); }

async function publica(estado) {
  const out = { enc: 1, t: estado.t, ...(await encrypt(JSON.stringify(estado), PW)) };
  const pub = path.join(process.cwd(), ".pubvivo"); rmSync(pub, { recursive: true, force: true }); mkdirSync(pub); writeFileSync(path.join(pub, "saldo.json"), JSON.stringify(out));
  const g = (c) => execSync(`git -C "${pub}" ${c}`, { stdio: "pipe", encoding: "utf8" }); g("init -q -b saldo-vivo"); g('config user.name "bot-trading"'); g('config user.email "bot-trading@users.noreply.github.com"'); g("add saldo.json"); g('commit -q -m "saldo en vivo"');
  for (let i = 0; i < 3; i++) { try { g(`push -q -f https://x-access-token:${TOKEN}@github.com/${REPO}.git saldo-vivo`); return true; } catch (e) { await sleep(2000); } } return false;
}
async function main() {
  if (!CTA.length || !PW || !TOKEN) { console.log("Saldo en vivo: sin claves de exchange o sin REAL_VIEW_PASS; no hago nada."); return; }
  const fin = Date.now() + DUR, ult = {}; let firmaPub = "", tPub = 0, n = 0;
  while (Date.now() < fin) { const t0 = Date.now(), E = { t: new Date().toISOString(), cuentas: {} };
    for (const c of CTA) { try { const B = await c.saldos(); let P = ult[c.ex] && Date.now() - ult[c.ex].t < 60e3 ? ult[c.ex].P : null; if (!P) { P = await c.precios().catch(() => null); if (P) ult[c.ex] = { P, t: Date.now() }; }
        const act = []; let tot = +(B.EUR || 0); for (const [sym, q] of Object.entries(B)) { if (sym === "EUR") continue; const px = (P && P[sym]) || 0, v = q * px; tot += v; if (v >= 0.01 || !px) act.push({ sym, q, eur: r2(v), px }); }
        E.cuentas[c.ex] = { t: E.t, eur: r2(+(B.EUR || 0)), total: r2(tot), activos: act.sort((a, b) => b.eur - a.eur), q: B }; } catch (e) { E.cuentas[c.ex] = { err: String(e.message).slice(0, 60) }; } }
    const firma = JSON.stringify(Object.entries(E.cuentas).map(([k, v]) => [k, v.q ? Object.entries(v.q).map(([s, q]) => [s, +q.toPrecision(8)]).sort() : v.err]));
    if (firma !== firmaPub || Date.now() - tPub > LATIDO) { for (const v of Object.values(E.cuentas)) delete v.q; if (await publica(E)) { if (firmaPub && firma !== firmaPub) n++; firmaPub = firma; tPub = Date.now(); } }
    await sleep(Math.max(1000, CADA - (Date.now() - t0))); }
  console.log(`Saldo en vivo: terminado (${n} cambios detectados).`);
}
main().catch((e) => console.log("Saldo en vivo: error " + String(e.message).split("\n")[0].slice(0, 100)));
