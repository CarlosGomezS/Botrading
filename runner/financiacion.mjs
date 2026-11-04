// v224 · 💸 COBRAR LA FINANCIACIÓN (arbitraje «cash and carry», SOLO DINERO FICTICIO, con sus propios 100 €)
// En los futuros perpetuos (aquí, Hyperliquid) los que apuestan a que sube pagan cada hora una «financiación» a los que apuestan a
// que baja (cuando hay más gente comprada que vendida, que es lo normal en cripto). La jugada de los profesionales:
//   · comprar la cripto al contado en Bitvavo (en euros)    · y a la vez abrir un corto del MISMO tamaño en Hyperliquid
// Si la cripto sube, lo que gana el contado lo pierde el corto, y al revés: el precio da igual. Lo que queda es la financiación.
// Gana poco pero muy constante (5–30 % al año según el mercado). Riesgos: que la financiación se vuelva negativa (sale), los costes
// de entrar y salir (por eso solo entra si lo que espera cobrar en una semana los paga) y una subida enorme del precio (sale antes).
// La mitad del dinero va al contado y la otra mitad queda como garantía del corto (sin apalancamiento): la rentabilidad sobre el total
// es la mitad de la financiación.
const INFO = "https://api.hyperliquid.xyz/info";
export const FEE = 0.0025, HLFEE = 0.00045, START = 100, MAXPOS = 4, PARTE = 0.25, CADA_HIST = 3600e3;
export const MIN_ANUAL = 0.10;        // nunca entra por debajo de un 10 % anual de financiación media en 3 días
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, AN = 24 * 365;
export const moneda = (c) => String(c || "").replace(/^k(?=[A-Z])/, "").toUpperCase(), mult = (c) => (/^k[A-Z]/.test(c) ? 1000 : 1);

export function fresh(now = new Date()) {
  return { v: 1, start: START, cash: START, pos: {}, closed: [], log: [], eq: [], st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0, cobrado: 0 }, since: now.toISOString(), fr: {}, frAt: 0, ctx: {} };
}
const L = (F, now, ev, sym, txt) => { F.log.unshift({ t: now.toISOString(), ev, sym, txt }); F.log = F.log.slice(0, 200); };

// valor de una posición en euros si se cerrara ahora (contado vendido + garantía + resultado del corto + financiación cobrada)
export function valor(p, bid, mark, ue) {
  const spot = p.qs * bid * (1 - FEE), corto = (p.qp * (p.pp - mark) - p.qp * mark * HLFEE) * ue;
  return spot + p.col + corto + p.fund;
}
export function equity(F, tick, ctx, ue) {
  let e = F.cash; for (const p of Object.values(F.pos)) { const t = tick[p.m], c = ctx[p.coin]; e += valor(p, (t && t.bid) || p.lastBid || p.ps, (c && c.mark) || p.lastMark || p.pp, ue); } return e;
}
// coste de entrar y salir (por cada € de contado): comisiones de las 4 órdenes + el diferencial del contado
export const coste = (sp) => 2 * FEE + sp + 2 * HLFEE;
// estadística de la financiación (por hora) a partir del historial de Hyperliquid [{fundingRate, time}]
export function resumen(h, now) {
  const t = typeof now === "number" ? now : now.getTime(), v3 = h.filter((x) => t - x.time <= 72 * 3600e3).map((x) => +x.fundingRate), v1 = h.filter((x) => t - x.time <= 24 * 3600e3).map((x) => +x.fundingRate);
  const m = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  return { a3: m(v3), a1: m(v1), pos: v3.length ? v3.filter((x) => x > 0).length / v3.length : null, n: v3.length };
}
// ¿merece la pena entrar? Lo que cobraría en 14 días (con la media de 3 días) tiene que pagar con margen los costes de entrar y salir
export function merece(r, cur, sp) {
  if (!r || r.a3 == null || r.n < 48) return false;
  return r.a3 * AN >= MIN_ANUAL && r.a1 > 0 && cur > 0 && r.pos >= 0.8 && r.a3 * 24 * 14 >= coste(sp) * 1.2;   // en 2 semanas (lo normal es mantenerla semanas)
}
// ¿hay que salir? (la financiación se ha girado o ya no compensa, o el precio se ha disparado y el corto corre peligro)
export function salir(p, r, mark, now) {
  if (mark >= p.pp * 1.6) return "el precio se ha disparado un +60 %: se cierra por seguridad del corto";
  const h = (now.getTime() - Date.parse(p.t0)) / 3600e3;
  if (r && r.a1 != null && r.a1 < 0 && h >= 8) return "la financiación de las últimas 24 h es negativa (ahora pagaría en vez de cobrar)";
  if (r && r.a3 != null && r.a3 * AN < 0.04 && h >= 48) return "la financiación ha bajado de un 4 % anual: ya no compensa";
  return null;
}

async function post(body, fx) { const r = await fx(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

// una vuelta (cada minuto). tick: precios de Bitvavo { "BTC-EUR": {bid, ask, sp, vq} }; ue: euros por dólar (USDC-EUR)
export async function vuelta(F, tick, ue, now = new Date(), fx = fetch) {
  if (!F || F.v !== 1) { F = fresh(now); L(F, now, "INFO", "", "💸 empieza «Cobrar financiación» con 100 € ficticios: contado en Bitvavo + corto del mismo tamaño en Hyperliquid"); }
  if (!(ue > 0)) { F.err = "sin cambio euro/dólar"; return F; }
  const t = now.getTime();
  // 1) financiación y precio de todos los perpetuos (una petición)
  let ctx = {}; try {
    const [meta, cs] = await post({ type: "metaAndAssetCtxs" }, fx);
    meta.universe.forEach((u, i) => { const c = cs[i]; if (!c || u.isDelisted) return; ctx[u.name] = { f: +c.funding, mark: +c.markPx, vol: +c.dayNtlVlm || 0, oi: (+c.openInterest || 0) * (+c.markPx || 0) }; });
  } catch (e) { F.err = "Hyperliquid: " + String(e.message).slice(0, 40); return F; }
  if (Object.keys(ctx).length < 20) { F.err = "Hyperliquid sin datos"; return F; }
  delete F.err;
  // 2) cobrar la financiación desde la última vuelta (se paga cada hora; aquí se reparte por minutos)
  const dt = F.at ? Math.min(2, Math.max(0, (t - F.at) / 3600e3)) : 0; F.at = t;
  for (const p of Object.values(F.pos)) { const c = ctx[p.coin]; if (!c) continue; const g = p.qp * c.mark * c.f * dt * ue; p.fund += g; F.st.cobrado += g; p.lastMark = c.mark; const tb = tick[p.m]; if (tb) p.lastBid = tb.bid; }
  // 3) candidatas: están en los dos sitios, con liquidez de sobra
  const cand = Object.entries(ctx).map(([coin, c]) => ({ coin, c, m: moneda(coin) + "-EUR" })).filter((x) => tick[x.m] && tick[x.m].sp < 0.006 && tick[x.m].vq >= 2e5 && x.c.vol >= 2e6 && x.c.mark > 0);
  // historial de la financiación (3 días) cada hora: de las abiertas y de las 30 que más pagan ahora
  if (t - (F.frAt || 0) >= CADA_HIST) {
    const quiero = [...new Set([...Object.values(F.pos).map((p) => p.coin), ...cand.slice().sort((a, b) => b.c.f - a.c.f).slice(0, 30).map((x) => x.coin)])], nuevo = {};
    let i = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < quiero.length) { const coin = quiero[i++]; try { const h = await post({ type: "fundingHistory", coin, startTime: t - 72 * 3600e3 }, fx); if (Array.isArray(h)) nuevo[coin] = resumen(h, t); } catch (e) {} } }));
    if (Object.keys(nuevo).length) { F.fr = nuevo; F.frAt = t; }
  }
  // 4) salidas
  for (const [k, p] of Object.entries(F.pos)) {
    const c = ctx[p.coin], tb = tick[p.m]; if (!c || !tb) continue; const por = salir(p, F.fr[p.coin], c.mark, now); if (!por) continue;
    const v = valor(p, tb.bid, c.mark, ue), pnl = v - p.cost; F.cash += v; F.st.pnl += pnl; F.st.fees += p.qs * tb.bid * FEE + p.qp * c.mark * HLFEE * ue; if (pnl >= 0) F.st.wins++; else F.st.losses++;
    F.closed.unshift({ m: p.m, sym: p.sym, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(v), pnl: r2(pnl), pc: r2((v / p.cost - 1) * 100), fund: r2(p.fund), why: por }); F.closed = F.closed.slice(0, 300);
    delete F.pos[k]; L(F, now, pnl >= 0 ? "WIN" : "LOSS", p.sym, `${pnl >= 0 ? "+" : ""}${r2(pnl)} € (financiación cobrada ${r2(p.fund)} €) · ${por}`);
  }
  // 5) entradas: las que más pagan, si lo que cobrarían en una semana paga los costes con margen
  const eq = equity(F, tick, ctx, ue);
  const buenas = cand.filter((x) => !Object.values(F.pos).some((p) => p.coin === x.coin) && merece(F.fr[x.coin], x.c.f, tick[x.m].sp)).sort((a, b) => F.fr[b.coin].a3 - F.fr[a.coin].a3);
  for (const x of buenas) {
    if (Object.keys(F.pos).length >= MAXPOS) break;
    const N = Math.min(F.cash / 2, eq * PARTE / 2); if (N < 5) break;   // N al contado y N de garantía para el corto
    const tb = tick[x.m], ask = tb.ask, qs = N * (1 - FEE) / ask, qp = qs / mult(x.coin), pp = x.c.mark, feeHL = qp * pp * HLFEE * ue;
    F.cash -= 2 * N; F.st.trades++; F.st.fees += N * FEE + feeHL;
    const r = F.fr[x.coin];
    F.pos[x.coin] = { coin: x.coin, m: x.m, sym: moneda(x.coin), qs, ps: ask, qp, pp, col: N - feeHL, cost: 2 * N, fund: 0, t0: now.toISOString(), a3: r4(r.a3 * AN), lastBid: tb.bid, lastMark: pp };
    L(F, now, "ENTER", moneda(x.coin), `${r2(N)} € al contado + corto de ${r2(N)} € · financiación media 3 días: ${r2(r.a3 * AN * 100)} % al año (${r2(r.pos * 100)} % de las horas a favor)`);
  }
  // 6) lo que se ve en la pantalla
  F.ctx = Object.fromEntries(Object.values(F.pos).map((p) => [p.coin, { f: ctx[p.coin] ? ctx[p.coin].f : null, mark: ctx[p.coin] ? ctx[p.coin].mark : null }]));
  F.top = cand.filter((x) => F.fr[x.coin]).map((x) => { const r = F.fr[x.coin]; return { sym: moneda(x.coin), coin: x.coin, ahora: r4(x.c.f * AN * 100), a3: r4(r.a3 * AN * 100), a1: r4(r.a1 * AN * 100), pos: Math.round(r.pos * 100), sp: r2(tick[x.m].sp * 100), ok: merece(r, x.c.f, tick[x.m].sp), dentro: !!F.pos[x.coin] }; }).sort((a, b) => b.a3 - a.a3).slice(0, 12);
  const e2 = equity(F, tick, ctx, ue); F.eq.push([now.toISOString(), r2(e2)]); if (F.eq.length > 3000) F.eq = F.eq.filter((_, i) => i % 2 === 0 || i > F.eq.length - 500);
  F.lastEq = r2(e2); F.last = now.toISOString(); F.ue = ue;
  return F;
}
