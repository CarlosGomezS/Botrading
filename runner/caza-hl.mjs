// v358 · 🧪 CAZA EN HYPERLIQUID (solo con datos, nunca toca dinero): busca un método de MUCHAS operaciones al día que gane con los costes reales
// de Hyperliquid. Novedad frente a las cazas anteriores: en Hyperliquid se puede ir CORTO (ganar cuando baja), así que cada familia prueba
// las dos direcciones, y se cobra/paga la FINANCIACIÓN de cada hora con la tasa real de cada cripto.
// Costes: 0,045 % de comisión a mercado + 0,05 % de deslizamiento en cada orden (entrar y salir) + financiación por hora.
// Validación: se elige con el 60 % más antiguo de los datos (entreno) y solo vale si también gana en el 40 % más reciente (prueba), con
// ≥ 3 operaciones al día, factor de beneficio ≥ 1,15, caída < 30 % y si sus vecinos (parámetros parecidos) también ganan.
const INFO = "https://api.hyperliquid.xyz/info";
const COST = 0.00045 + 0.0005, N_COINS = 24, H = 3600e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(body) { for (let i = 0; i < 5; i++) { try { const r = await fetch(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); if (r.status === 429) { await sleep(5000 * (i + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (i === 4) throw e; await sleep(3000 * (i + 1)); } } }

async function datos(log) {
  const [meta, ctxs] = await post({ type: "metaAndAssetCtxs" });
  const U = meta.universe.map((u, i) => ({ c: u.name, v: +ctxs[i].dayNtlVlm || 0, d: !!u.isDelisted })).filter((x) => !x.d && x.v > 0).sort((a, b) => b.v - a.v).slice(0, N_COINS).map((x) => x.c);
  const fin = Math.floor(Date.now() / H) * H, ini = fin - 540 * 864e5, D = {};
  for (const c of U) {
    const k = new Map();
    for (let t = ini; t < fin; t += 4000 * H) { const r = await post({ type: "candleSnapshot", req: { coin: c, interval: "1h", startTime: t, endTime: Math.min(fin, t + 4000 * H) } }); for (const x of r || []) k.set(+x.t, +x.c); await sleep(250); }
    const f = new Map(); let t = ini;
    for (let g = 0; g < 40 && t < fin; g++) { const r = await post({ type: "fundingHistory", coin: c, startTime: t }); if (!r || !r.length) break; for (const x of r) f.set(Math.floor(+x.time / H) * H, +x.fundingRate); const last = +r[r.length - 1].time; if (last <= t) break; t = last + 1; await sleep(250); }
    D[c] = { k, f }; log(`  ${c}: ${k.size} velas de 1 h · ${f.size} horas de financiación`);
  }
  const T = []; for (let t = ini; t < fin; t += H) T.push(t);
  const out = {}; for (const c of U) { const C = new Float64Array(T.length), F = new Float64Array(T.length); let last = NaN; T.forEach((t, i) => { const x = D[c].k.get(t); if (x > 0) last = x; C[i] = last; F[i] = D[c].f.get(t) || 0; }); out[c] = { C, F }; }
  return { T, M: out, U };
}

// Simulación de cartera: plazas iguales; cada operación [i0, coin, dir, i1] ocupa una plaza de i0 a i1 (horas). Se paga comisión+deslizamiento al
// entrar y al salir, y cada hora la financiación (dir=+1 comprado paga si la tasa es positiva; dir=-1 corto la cobra).
function cartera(ops, M, i0, i1, plazas) {
  const ev = ops.filter((o) => o[0] >= i0 && o[0] < i1).sort((a, b) => a[0] - b[0]);
  let eq = 1, pico = 1, dd = 0, n = 0, gan = 0, per = 0, libres = plazas; const abiertas = [];
  const cierra = (o) => { const d = M[o[1]], p0 = d.C[o[0]], p1 = d.C[Math.min(o[3], d.C.length - 1)]; if (!(p0 > 0 && p1 > 0)) return 0; let r = o[2] * (p1 / p0 - 1); for (let i = o[0]; i < o[3] && i < d.F.length; i++) r -= o[2] * d.F[i]; return r - 2 * COST; };
  for (const o of ev) {
    for (let j = abiertas.length - 1; j >= 0; j--) if (abiertas[j][3] <= o[0]) { const r = cierra(abiertas[j]); eq += r / plazas * eq0(abiertas[j]); r > 0 ? (gan += r) : (per -= r); n++; abiertas.splice(j, 1); libres++; pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
    if (libres > 0 && !abiertas.some((a) => a[1] === o[1])) { o.eqIn = eq; abiertas.push(o); libres--; }
  }
  for (const a of abiertas) { const r = cierra(a); eq += r / plazas * eq0(a); r > 0 ? (gan += r) : (per -= r); n++; }
  function eq0(o) { return o.eqIn || 1; }
  const dias = (i1 - i0) / 24; return { ret: eq - 1, dd, n, opsDia: n / dias, pf: per > 0 ? gan / per : gan > 0 ? 9 : 0 };
}

const ret = (C, i, L) => C[i - L] > 0 ? C[i] / C[i - L] - 1 : null;
const media = (C, i, n) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += C[k]; return s / n; };
// FAMILIAS (todas generan operaciones a partir de datos CERRADOS en la hora i; entran al cierre de i)
function familias() {
  const F = [];
  // 1) momento en las dos direcciones: cada hora, la que más se ha movido en L horas; a favor si el régimen de BTC acompaña; mantiene Hh
  for (const L of [6, 12, 24]) for (const Hh of [3, 6, 12]) for (const min of [0.02, 0.04, 0.06]) for (const lado of ["ambos", "largo", "corto"]) for (const fil of [0, 1])
    F.push({ fam: "momento", p: { L, Hh, min, lado, fil }, gen: ({ T, M, U }) => { const o = [], B = M.BTC.C; for (let i = 220; i < T.length - 1; i++) { const up = B[i] > media(B, i, 50); let best = null; for (const c of U) { const r = ret(M[c].C, i, L); if (r == null) continue; if (!best || Math.abs(r) > Math.abs(best.r)) best = { c, r }; } if (!best || Math.abs(best.r) < min) continue; const dir = best.r > 0 ? 1 : -1; if (lado === "largo" && dir < 0 || lado === "corto" && dir > 0) continue; if (fil && (dir > 0) !== up) continue; const f8 = M[best.c].F.slice(i - 8, i).reduce((a, b) => a + b, 0) / 8; if (dir > 0 && f8 > 0.00005 || dir < 0 && f8 < -0.00005) continue; o.push([i, best.c, dir, i + Hh]); } return o; } });
  // 2) vuelta a la media: va CONTRA el movimiento más fuerte de L horas (las subidas/caídas exageradas se corrigen); mantiene Hh
  for (const L of [3, 6, 12, 24]) for (const Hh of [2, 4, 8]) for (const min of [0.03, 0.05, 0.08]) for (const fil of [0, 1])
    F.push({ fam: "vuelta", p: { L, Hh, min, fil }, gen: ({ T, M, U }) => { const o = [], B = M.BTC.C; for (let i = 220; i < T.length - 1; i++) { const up = B[i] > media(B, i, 200); let best = null; for (const c of U) { const r = ret(M[c].C, i, L); if (r == null) continue; if (!best || Math.abs(r) > Math.abs(best.r)) best = { c, r }; } if (!best || Math.abs(best.r) < min) continue; const dir = best.r > 0 ? -1 : 1; if (fil && (dir > 0) !== up) continue; o.push([i, best.c, dir, i + Hh]); } return o; } });
  // 3) ruptura de canal en cada cripto, en las dos direcciones (máximo/mínimo de N horas), sale a las Hh horas
  for (const N of [24, 48, 96]) for (const Hh of [6, 12, 24]) for (const fil of [0, 1])
    F.push({ fam: "ruptura", p: { N, Hh, fil }, gen: ({ T, M, U }) => { const o = [], B = M.BTC.C; for (const c of U) { const C = M[c].C; let ult = -1e9; for (let i = 220; i < T.length - 1; i++) { if (i - ult < Hh) continue; let hi = -1e18, lo = 1e18; for (let k = i - N; k < i; k++) { hi = Math.max(hi, C[k]); lo = Math.min(lo, C[k]); } let dir = C[i] > hi ? 1 : C[i] < lo ? -1 : 0; if (!dir) continue; if (fil && (dir > 0) !== (B[i] > media(B, i, 200))) continue; o.push([i, c, dir, i + Hh]); ult = i; } } return o; } });
  // 4) largo-corto neutral: cada R horas compra las k que más suben en L horas y vende en corto las k que más bajan (o al revés: «contra»)
  for (const L of [6, 24, 72]) for (const R of [4, 8, 24]) for (const k of [2, 3]) for (const sen of ["a favor", "contra"])
    F.push({ fam: "neutral", p: { L, R, k, sen }, plazas: 2 * k, gen: ({ T, M, U }) => { const o = []; for (let i = 220; i < T.length - 1; i += R) { const r = U.map((c) => ({ c, r: ret(M[c].C, i, L) })).filter((x) => x.r != null).sort((a, b) => b.r - a.r); if (r.length < 2 * k) continue; const s = sen === "a favor" ? 1 : -1; for (const x of r.slice(0, k)) o.push([i, x.c, s, i + R]); for (const x of r.slice(-k)) o.push([i, x.c, -s, i + R]); } return o; } });
  // 5) cobrar la financiación: cada 8 h, corto en las k con la tasa más alta (los alcistas pagan) y largo en las k con la más negativa
  for (const k of [1, 2, 3]) for (const R of [8, 24]) for (const umbral of [0.00002, 0.00005, 0.0001])
    F.push({ fam: "financiación", p: { k, R, umbral }, plazas: 2 * k, gen: ({ T, M, U }) => { const o = []; for (let i = 220; i < T.length - 1; i += R) { const f = U.map((c) => ({ c, f: M[c].F.slice(i - 8, i).reduce((a, b) => a + b, 0) / 8 })).sort((a, b) => b.f - a.f); for (const x of f.slice(0, k)) if (x.f > umbral) o.push([i, x.c, -1, i + R]); for (const x of f.slice(-k)) if (x.f < -umbral) o.push([i, x.c, 1, i + R]); } return o; } });
  return F;
}

export async function caza(log = console.log) {
  log("Descargando velas de 1 h y financiación de Hyperliquid (últimos 540 días)…");
  const D = await datos(log), n = D.T.length, corte = Math.floor(n * 0.6), F = familias(), R = [];
  log(`Datos: ${D.U.length} criptos · ${Math.round(n / 24)} días · entreno hasta el ${new Date(D.T[corte]).toISOString().slice(0, 10)} · ${F.length} variantes`);
  for (const f of F) { let ops; try { ops = f.gen(D); } catch (e) { continue; } const pl = f.plazas || 4; const a = cartera(ops, D.M, 220, corte, pl), b = cartera(ops, D.M, corte, n - 1, pl), t = cartera(ops, D.M, 220, n - 1, pl); R.push({ fam: f.fam, p: f.p, a, b, t, okA: a.opsDia >= 3 && a.ret > 0 && a.pf >= 1.15 && a.dd < 0.3, okB: b.ret > 0 && b.pf >= 1.1 && b.dd < 0.3 }); }
  // vecinos: misma familia, parámetros que difieren en uno solo → también deben ganar en la prueba
  const k = (x) => JSON.stringify(x.p), vec = (x) => R.filter((y) => y.fam === x.fam && y !== x && Object.keys(x.p).filter((q) => x.p[q] !== y.p[q]).length === 1);
  for (const x of R) { const v = vec(x); x.vecOk = v.length ? v.filter((y) => y.b.ret > 0).length / v.length : 0; }
  const ok = R.filter((x) => x.okA && x.okB && x.vecOk >= 0.6).sort((a, b) => b.b.ret - a.b.ret);
  const P = (x) => (x * 100).toFixed(1) + " %", fila = (x) => `${x.fam} ${k(x)} · entreno ${P(x.a.ret)} (${x.a.opsDia.toFixed(1)} op/día, PF ${x.a.pf.toFixed(2)}, caída ${P(x.a.dd)}) · prueba ${P(x.b.ret)} (PF ${x.b.pf.toFixed(2)}, caída ${P(x.b.dd)}) · vecinos ${Math.round(x.vecOk * 100)} %`;
  log(`\nAPROBADAS (entreno + prueba + vecinos): ${ok.length} de ${R.length}`); ok.slice(0, 12).forEach((x) => log("  ✅ " + fila(x)));
  for (const fam of [...new Set(R.map((x) => x.fam))]) { const m = R.filter((x) => x.fam === fam && x.a.opsDia >= 3).sort((a, b) => b.a.ret - a.a.ret)[0]; if (m) log(`  mejor de «${fam}» en entreno: ${fila(m)}`); }
  return { ok, R };
}
if (process.argv[1] && process.argv[1].endsWith("caza-hl.mjs")) caza().catch((e) => { console.log("Error: " + e.message); process.exit(1); });
