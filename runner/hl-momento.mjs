// v316 · 🧪 HYPERLIQUID · «MOMENTO SIN ALCISTAS AMONTONADOS» EN DIRECTO CON DINERO FICTICIO (1.000 $ de mentira, precios reales).
// El método que aprobó la caza (entreno y prueba) con las comisiones de Hyperliquid:
//  · cada hora decide una de 6 tandas escalonadas (6 plazas, 1/6 del dinero cada una)
//  · compra la cripto que más ha subido en 12 h (≥ +4 %), solo si BTC está por encima de su media de 50 h,
//    y solo si la financiación media de las últimas 8 h es < 0,005 %/h (los alcistas NO están amontonados)
//  · la vende 6 horas después
// Costes: 0,045 % de comisión a mercado + 0,05 % de deslizamiento en cada orden, y la financiación de cada hora (si se está comprado y es positiva, se paga).
// Nunca envía órdenes: es la prueba de 2 semanas antes de decidir si va con dinero real.
const INFO = "https://api.hyperliquid.xyz/info";
export const P = { L: 12, H: 6, plazas: 6, min: 0.04, fmax: 0.00005, fee: 0.00045, slip: 0.0005, universo: 12, inicio: 1000 };
const r2 = (x) => Math.round(x * 100) / 100;
async function post(body, fx) { const r = await fx(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

// las criptos más negociadas de Hyperliquid (sin las «k» de mil unidades raras ni las que casi no se mueven)
export function universo(meta, ctxs, n = P.universo) { return meta.universe.map((u, i) => ({ c: u.name, vol: +ctxs[i].dayNtlVlm || 0, px: +ctxs[i].markPx || 0, f: +ctxs[i].funding || 0, del: !!u.isDelisted }))
  .filter((x) => !x.del && x.px > 0 && x.vol > 0).sort((a, b) => b.vol - a.vol).slice(0, n); }

const ema = (x, n) => { const k = 2 / (n + 1); let e = x[0]; for (let i = 1; i < x.length; i++) e += k * (x[i] - e); return e; };
// decisión de esta hora con las velas de 1 h CERRADAS (c: { cripto: [[t, cierre], ...] }) y la financiación media de 8 h (f: { cripto: tasa })
export function elige(c, f, p = P) { const btc = c.BTC; if (!btc || btc.length < 51) return { cual: null, motivo: "sin velas de BTC" };
  const cb = btc.map((x) => x[1]); if (!(cb[cb.length - 1] > ema(cb.slice(-120), 50))) return { cual: null, motivo: "BTC por debajo de su media de 50 h" };
  const cand = Object.entries(c).filter(([, v]) => v.length > p.L).map(([k, v]) => ({ k, r: v[v.length - 1][1] / v[v.length - 1 - p.L][1] - 1, f: f[k] })).filter((x) => x.r > p.min).sort((a, b) => b.r - a.r);
  if (!cand.length) return { cual: null, motivo: `ninguna sube más de un ${p.min * 100} % en ${p.L} h` };
  const ok = cand.find((x) => x.f != null && x.f < p.fmax); if (!ok) return { cual: null, motivo: `las que suben (${cand.slice(0, 3).map((x) => x.k).join(", ")}) tienen a los alcistas amontonados` };
  return { cual: ok.k, r: ok.r, f: ok.f, motivo: `${ok.k} sube un ${r2(ok.r * 100)} % en ${p.L} h y su financiación es normal` }; }

// un paso (cada minuto): marca precios, cobra/paga financiación por hora, cierra las de 6 h y, si empieza una hora nueva, decide
export async function paso(Z, now = Date.now(), fx = fetch, log = () => {}) {
  Z = Z || { t0: now, eq: P.inicio, cash: P.inicio, pos: [], cerradas: [], decisiones: [], st: { n: 0, gan: 0, fees: 0, fund: 0 } };
  const [meta, ctxs] = await post({ type: "metaAndAssetCtxs" }, fx), U = universo(meta, ctxs), px = Object.fromEntries(meta.universe.map((u, i) => [u.name, +ctxs[i].markPx || 0])), fNow = Object.fromEntries(meta.universe.map((u, i) => [u.name, +ctxs[i].funding || 0]));
  const hora = Math.floor(now / 3600e3) * 3600e3;
  // financiación: una vez por hora y posición (si es positiva, el comprado paga)
  for (const p of Z.pos) if ((p.fAt || p.t0) < hora && px[p.c] > 0) { const pago = p.q * px[p.c] * (fNow[p.c] || 0); Z.cash -= pago; p.fund = (p.fund || 0) + pago; Z.st.fund += pago; p.fAt = hora; }
  // cierres a las 6 h
  for (const p of Z.pos.filter((p) => now - p.t0 >= P.H * 3600e3 && px[p.c] > 0)) { const sal = px[p.c] * (1 - P.slip), bruto = p.q * sal, fee = bruto * P.fee; Z.cash += bruto - fee; Z.st.fees += fee; const pnl = bruto - fee - p.coste - (p.fund || 0); Z.st.n++; if (pnl > 0) Z.st.gan++;
    Z.cerradas.unshift({ c: p.c, t0: p.t0, t1: now, px0: p.px, px1: sal, coste: r2(p.coste), pnl: r2(pnl), pc: r2((pnl / p.coste) * 100) }); Z.cerradas = Z.cerradas.slice(0, 300); log(`🧪🐋 Hyperliquid (ficticio): vende ${p.c} a las 6 h · ${pnl >= 0 ? "+" : ""}${r2((pnl / p.coste) * 100)} %`); }
  Z.pos = Z.pos.filter((p) => !(now - p.t0 >= P.H * 3600e3 && px[p.c] > 0));
  // decisión de la hora (con velas cerradas)
  if (Z.ultHora !== hora) { Z.ultHora = hora; const c = {}, f = {};
    await Promise.all(U.map(async (u) => { try { const v = await post({ type: "candleSnapshot", req: { coin: u.c, interval: "1h", startTime: hora - 130 * 3600e3, endTime: hora - 1 } }, fx); c[u.c] = v.filter((x) => +x.T < hora + 1).map((x) => [+x.t, +x.c]);
      const fh = await post({ type: "fundingHistory", coin: u.c, startTime: hora - 8 * 3600e3 }, fx); f[u.c] = fh.length ? fh.reduce((s, x) => s + +x.fundingRate, 0) / fh.length : fNow[u.c]; } catch (e) {} }));
    if (!c.BTC) try { const v = await post({ type: "candleSnapshot", req: { coin: "BTC", interval: "1h", startTime: hora - 130 * 3600e3, endTime: hora - 1 } }, fx); c.BTC = v.map((x) => [+x.t, +x.c]); } catch (e) {}
    const d = elige(c, f); Z.decisiones.unshift({ t: hora, ...d }); Z.decisiones = Z.decisiones.slice(0, 72);
    const eq0 = Z.cash + Z.pos.reduce((s, p) => s + p.q * (px[p.c] || p.px), 0);
    if (d.cual && px[d.cual] > 0 && Z.pos.length < P.plazas) { const eur = Math.min(eq0 / P.plazas, Z.cash); if (eur > 1) { const ent = px[d.cual] * (1 + P.slip), fee = eur * P.fee; Z.cash -= eur; Z.st.fees += fee; Z.pos.push({ c: d.cual, t0: now, px: ent, q: (eur - fee) / ent, coste: eur, fAt: hora }); log(`🧪🐋 Hyperliquid (ficticio): compra ${d.cual} (${d.motivo}); la vende en 6 h`); } }
    else log(`🧪🐋 Hyperliquid (ficticio): esta hora no compra · ${d.motivo}`); }
  Z.eq = r2(Z.cash + Z.pos.reduce((s, p) => s + p.q * (px[p.c] || p.px), 0)); Z.t = now;
  if (!Z.curva || !Z.curva.length || now - Z.curva[Z.curva.length - 1][0] >= 3600e3) Z.curva = (Z.curva || []).concat([[now, Z.eq]]).slice(-24 * 60);
  return Z; }
export function resumen(Z) { if (!Z) return null; const dias = Math.max(1 / 24, (Z.t - Z.t0) / 864e5);
  return { desde: new Date(Z.t0).toISOString(), dias: r2(dias), eq: Z.eq, pc: r2((Z.eq / P.inicio - 1) * 100), ops: Z.st.n, opsDia: r2(Z.st.n / dias), aciertos: Z.st.n ? Math.round((Z.st.gan / Z.st.n) * 100) : 0, abiertas: Z.pos.map((p) => p.c), ultima: Z.decisiones[0] || null }; }
