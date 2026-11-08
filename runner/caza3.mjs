// v315 · 🔎 CAZA RONDA 3 (objetivo: 3-4 operaciones al día que ganen con comisiones), solo dinero ficticio:
//  1) 🚀 momento entre criptos ESCALONADO: varias «tandas» que empiezan cada pocas horas, cada una con su parte del dinero → más operaciones con la misma ventaja
//  2) 🐋 financiación de Hyperliquid: comprar cuando los bajistas están amontonados (financiación muy negativa), evitar a los alcistas amontonados
//  3) se comprueba con DOS juegos de datos: las 12 criptos de Bitvavo (velas del examen largo) y las ~16 más líquidas de OKX (sus propias velas de 1 h)
// Se elige SOLO con los primeros 7 meses; cuenta si gana también en los 5 últimos y en el otro exchange.
import { existsSync, readFileSync } from "node:fs";
import { agrupa, prepara, cartera, FEES, CORTE } from "./caza.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function J(u, body, tries = 4) { for (let i = 0; ; i++) { try { const r = await fetch(u, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) } : { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (i >= tries - 1) throw e; await sleep(1500 * (i + 1)); } } }

async function okx1h(dias = 368) { const OK = await import("./okx.mjs"), PO = await OK.preciosOkx(await OK.instrumentos());
  const lista = Object.entries(PO.tickEx).filter(([m, x]) => m !== "USDC-EUR" && x.vq > 0 && x.sp < 0.01 && !/^(USDT|EURC|USDC)-/.test(m)).sort((a, b) => b[1].vq - a[1].vq).slice(0, 16), out = {}, desde = Date.now() - dias * 864e5;
  for (const [m, x] of lista) { try { let c = [], after = ""; for (let p = 0; p < 100; p++) { const j = await J(`${OK.BASE}/api/v5/market/history-candles?instId=${x.par}&bar=1H&limit=100${after ? "&after=" + after : ""}`); const d = (j && j.data) || []; if (!d.length) break;
        c = c.concat(d.map((y) => [+y[0], +y[1] * x.k, +y[2] * x.k, +y[3] * x.k, +y[4] * x.k, +y[5]])); after = Math.min(...d.map((y) => +y[0])); if (after < desde) break; await sleep(120); }
      c = [...new Map(c.map((y) => [y[0], y])).values()].filter((y) => y[0] >= desde && y[0] + 3600e3 <= Date.now()).sort((a, b) => a[0] - b[0]); if (c.length > 24 * 300) out[m] = c; } catch (e) {} }
  return out; }
async function funding(coins, desde) { const out = {}; for (const co of coins) { try { let t = desde, all = []; for (let p = 0; p < 40 && t < Date.now() - 3600e3; p++) { const j = await J("https://api.hyperliquid.xyz/info", { type: "fundingHistory", coin: co, startTime: t }); if (!Array.isArray(j) || !j.length) break; all = all.concat(j.map((x) => [x.time, +x.fundingRate])); const nt = j[j.length - 1].time + 1; if (nt <= t) break; t = nt; await sleep(250); }
      if (all.length > 24 * 200) out[co] = new Map(all.map(([tt, f]) => [Math.floor(tt / 3600e3) * 3600e3, f])); } catch (e) {} } return out; }

// estrategias sobre velas de 1 h, todas de cartera; devuelven operaciones y las «plazas» (dinero repartido)
function estrategias(D, FU) { const ms = Object.keys(D), out = [], btc = D["BTC-EUR"], ts = [...new Set(ms.flatMap((m) => D[m].T))].sort((a, b) => a - b), idx = Object.fromEntries(ms.map((m) => [m, new Map(D[m].T.map((t, i) => [t, i]))]));
  const ret = (m, t, L) => { const i = idx[m].get(t); if (i == null || i < L) return null; return D[m].C[i] / D[m].C[i - L] - 1; };
  const btcUp = (t) => { const i = btc && idx["BTC-EUR"].get(t); return i != null && btc.C[i] > btc.e50[i]; };
  const fr = (m, t, n = 8) => { const F = FU[m.split("-")[0]]; if (!F) return null; let s = 0, k = 0; for (let h = 0; h < n; h++) { const v = F.get(t - h * 3600e3); if (v != null) { s += v; k++; } } return k ? s / k : null; };
  // tandas escalonadas: la tanda j decide en las horas ≡ j·H/S (mód H); cada tanda tiene top plazas → plazas totales S·top
  const gen = (fam, p, H, S, pick) => { const tr = [], paso = Math.max(1, Math.round(H / S)); for (let k = 210; k < ts.length - H - 1; k += paso) { const t = ts[k]; for (const m of pick(t)) { const i = idx[m].get(t); if (i == null || i + 1 + H >= D[m].C.length) continue; tr.push([D[m].T[i + 1], D[m].T[i + H] + 1, D[m].C[i + H] / D[m].O[i + 1] - 1]); } } out.push({ fam, p, tr, slots: S * p.top }); };
  for (const L of [6, 12, 24]) for (const H of [6, 12, 24]) for (const S of [1, 2, 3, 4, 6]) for (const top of [1, 2]) for (const min of [0, 0.02, 0.04]) for (const filtro of [false, true]) {
    if (S > H) continue; const sel = (t) => (filtro && !btcUp(t) ? [] : ms.map((m) => [m, ret(m, t, L)]).filter((x) => x[1] != null && x[1] > min).sort((a, b) => b[1] - a[1]).slice(0, top).map((x) => x[0]));
    gen("🚀 momento escalonado", { L, H, S, top, min, filtro }, H, S, sel);
    // + Hyperliquid: igual, pero descarta las que tienen a los alcistas amontonados (financiación alta)
    if (Object.keys(FU).length) for (const fmax of [0.00002, 0.00005]) gen("🚀🐋 momento sin alcistas amontonados", { L, H, S, top, min, filtro, fmax }, H, S, (t) => (filtro && !btcUp(t) ? [] : ms.map((m) => [m, ret(m, t, L), fr(m, t)]).filter((x) => x[1] != null && x[1] > min && x[2] != null && x[2] < fmax).sort((a, b) => b[1] - a[1]).slice(0, top).map((x) => x[0])));
  }
  // 🐋 bajistas amontonados: compra las de financiación más negativa (squeeze), mantiene H
  if (Object.keys(FU).length) for (const H of [4, 8, 12, 24]) for (const S of [1, 2, 4]) for (const top of [1, 2]) for (const fmin of [0, -0.00002, -0.00005]) for (const filtro of [false, true]) { if (S > H) continue;
    gen("🐋 bajistas amontonados (squeeze)", { H, S, top, fmin, filtro }, H, S, (t) => (filtro && !btcUp(t) ? [] : ms.map((m) => [m, fr(m, t)]).filter((x) => x[1] != null && x[1] < fmin).sort((a, b) => a[1] - b[1]).slice(0, top).map((x) => x[0]))); }
  return out; }

export const aprueba3 = (r) => r.opsDia >= 3 && r.ret > 0 && r.pf >= 1.15 && r.dd < 30;
function evalua(D, FU, nombre) { const ms = Object.keys(D), t0 = Math.max(...ms.map((m) => D[m].T[0])), t1 = Math.min(...ms.map((m) => D[m].T[D[m].T.length - 1])), corte = t0 + (t1 - t0) * CORTE, res = [];
  for (const E of estrategias(D, FU)) { const key = E.fam + JSON.stringify(E.p); for (const [fn, fee] of Object.entries(FEES)) { if (nombre === "bitvavo" && /OKX/.test(fn)) continue; if (nombre === "okx" && /Bitvavo/.test(fn)) continue;   /* Hyperliquid se prueba con los dos juegos de datos */
      const a = cartera(E.tr, fee, t0, corte, E.slots), b = cartera(E.tr, fee, corte, t1 + 1, E.slots); res.push({ key, fam: E.fam, p: E.p, fee: fn, a, b }); } }
  return { t0, t1, corte, res }; }

(async () => {
  const FILE = (process.env.LARGO_DIR || "/tmp/largo") + "/raw.json"; if (!existsSync(FILE)) throw new Error("sin el año de velas (caché del examen largo)");
  const raw = JSON.parse(readFileSync(FILE, "utf8")), DB = {}; for (const [m, c] of Object.entries(raw.m)) if (c && c.length > 50000) DB[m] = prepara(agrupa(c, 60));
  console.log(`🔎 Ronda 3 · Bitvavo: ${Object.keys(DB).length} criptos (velas de 1 h)`);
  const okc = await okx1h(); const DO = {}; for (const [m, c] of Object.entries(okc)) DO[m] = prepara(c); console.log(`🔎 Ronda 3 · OKX: ${Object.keys(DO).length} criptos con 1 año de velas de 1 h`);
  const coins = [...new Set([...Object.keys(DB), ...Object.keys(DO)].map((m) => m.split("-")[0]))], FU = await funding(coins, Date.now() - 370 * 864e5); console.log(`🔎 Ronda 3 · Hyperliquid: financiación de ${Object.keys(FU).length} criptos`);
  const RB = evalua(DB, FU, "bitvavo"), RO = Object.keys(DO).length >= 6 ? evalua(DO, FU, "okx") : { res: [] };
  console.log(`🔎 ${RB.res.length + RO.res.length} pruebas · entreno hasta ${new Date(RB.corte).toISOString().slice(0, 10)}`);
  const P = (o) => Object.entries(o).filter(([, v]) => v !== false && v !== 0).map(([k, v]) => `${k}=${v}`).join(" "), out = { t: new Date().toISOString(), v: 315, porFee: {} };
  for (const [nombre, R] of [["Bitvavo", RB], ["OKX", RO]]) for (const fn of Object.keys(FEES).filter((f) => f.startsWith(nombre) || f.startsWith("Hyperliquid"))) { const r = R.res.filter((x) => x.fee === fn);
    // elección honesta: las 10 mejores del ENTRENO (con ≥ 3/día); se mira cómo les va en la prueba
    const sel = r.filter((x) => x.a.opsDia >= 3 && x.a.dd < 30).sort((x, y) => y.a.ret - x.a.ret).slice(0, 10), okAB = r.filter((x) => aprueba3(x.a) && aprueba3(x.b));
    console.log(`\n💶 ${fn} · datos de ${nombre}: ${r.length} probadas · aprueban entreno ${r.filter((x) => aprueba3(x.a)).length} · aprueban ENTRENO Y PRUEBA ${okAB.length}`);
    for (const x of sel) console.log(`   ${aprueba3(x.b) ? "✅" : "❌"} ${x.fam} ${P(x.p)} · entreno ${x.a.ret} % (${x.a.opsDia}/día, PF ${x.a.pf}, caída ${x.a.dd} %) → prueba ${x.b.ret} % (${x.b.opsDia}/día, PF ${x.b.pf}, caída ${x.b.dd} %)`);
    out.porFee[fn + " · " + nombre] = { probadas: r.length, okA: r.filter((x) => aprueba3(x.a)).length, okAB: okAB.length, top: sel.map((x) => ({ fam: x.fam, p: x.p, a: x.a, b: x.b, ok: aprueba3(x.b) })) }; }
  // ¿lo que aprueba en un exchange aprueba también en el otro?
  const ambos = RB.res.filter((x) => aprueba3(x.a) && aprueba3(x.b)).filter((x) => RO.res.some((y) => y.key === x.key && aprueba3(y.a) && aprueba3(y.b))).map((x) => x.key);
  console.log(`\n🔎 Aprueban entreno y prueba en Bitvavo Y en OKX: ${[...new Set(ambos)].length}${ambos.length ? " → " + [...new Set(ambos)].slice(0, 6).join(" | ") : ""}`);
  out.ambos = [...new Set(ambos)];
  const B = await import("./bitvavo.mjs"); B.publicar("caza3.json", out, "caza"); await sleep(3000);
})().catch((e) => { console.log("Caza 3: " + e.message); process.exit(1); });
