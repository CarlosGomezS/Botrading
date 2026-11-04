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
// v225 · tres submodos, cada uno con sus 100 €: «gar» = garantía del corto por cada € al contado (1 = sin apalancamiento;
// 0,34 = corto ×3: con el mismo dinero cobra más financiación, pero hay que salir antes si el precio se dispara)
export const PERF = {
  cons: { nombre: "🛡️ Conservador", parte: 0.25, maxpos: 4, gar: 1, dias: 14, min: 0.10, sube: 0.6, txt: "sin apalancamiento; solo si en 2 semanas cobra los costes con margen" },
  turbo: { nombre: "⚡ Turbo ×3", parte: 0.3, maxpos: 5, gar: 0.34, dias: 10, min: 0.12, sube: 0.2, txt: "corto ×3: con el mismo dinero cobra ~1,5 veces más; sale si el precio sube un 20 %" },
  amplio: { nombre: "🌐 Amplio", parte: 0.125, maxpos: 8, gar: 1, dias: 21, min: 0.08, sube: 0.6, txt: "hasta 8 criptos más pequeñas cada una, acepta financiaciones algo más bajas: más repartido" } };
const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4, AN = 24 * 365;
export const moneda = (c) => String(c || "").replace(/^k(?=[A-Z])/, "").toUpperCase(), mult = (c) => (/^k[A-Z]/.test(c) ? 1000 : 1);

export function fresh(now = new Date()) {
  return { v: 1, start: START, cash: START, pos: {}, closed: [], log: [], eq: [], st: { trades: 0, wins: 0, losses: 0, fees: 0, pnl: 0, cobrado: 0 }, since: now.toISOString(), ctx: {} };
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
export function merece(r, cur, sp, P = PERF.cons) {
  if (!r || r.a3 == null || r.n < 48) return false;
  return r.a3 * AN >= P.min && r.a1 > 0 && cur > 0 && r.pos >= 0.8 && r.a3 * 24 * P.dias >= coste(sp) * 1.2;   // en «dias» días (lo normal es mantenerla semanas)
}
// v226 · 🧠 APRENDE SOLA: cada hora repasa los últimos 14 días de financiación (hora a hora) de las ~30 criptos que más pagan y
// simula su propia regla con distintos umbrales (financiación mínima al año y en cuántos días tiene que pagar los costes).
// Se queda con los que más habrían ganado ya con costes, y solo si ganan en las DOS mitades de esos días. Si ni la regla de
// partida habría ganado, deja de abrir posiciones (la misma regla estricta que el resto).
export const BUSCA = { cons: { min: [0.08, 0.1, 0.15, 0.2], dias: [10, 14, 21] }, turbo: { min: [0.1, 0.15, 0.2, 0.3], dias: [5, 7, 10] }, amplio: { min: [0.05, 0.08, 0.1, 0.12], dias: [14, 21, 30] } };
export function simular(series, spOf, P, q) {
  const ev = []; let n = 0;   // [momento (0–1), € por € usado]: lo cobrado cuenta en la hora en que se cobra; cada coste, cuando se paga
  for (const [coin, r] of Object.entries(series || {})) {
    if (r.length < 120) continue; const cst = coste(spOf(coin)) / (1 + P.gar), L = r.length; let h0 = -1, cool = -1;
    const med = (a, b) => { let x = 0; for (let i = a; i < b; i++) x += r[i]; return x / (b - a); };
    for (let h = 72; h < L; h++) {
      const a3 = med(h - 72, h), a1 = med(h - 24, h);
      if (h0 >= 0) { ev.push([h / L, r[h] / (1 + P.gar)]); if ((h - h0 >= 8 && a1 < 0) || (h - h0 >= 48 && a3 * AN < 0.04)) { ev.push([h / L, -cst / 2]); h0 = -1; cool = h + 24; } continue; }
      if (h < cool) continue; let pos = 0; for (let i = h - 72; i < h; i++) if (r[i] > 0) pos++;
      if (a3 * AN >= q.min && a1 > 0 && r[h - 1] > 0 && pos / 72 >= 0.8 && a3 * 24 * q.dias >= coste(spOf(coin)) * 1.2) { h0 = h; n++; ev.push([h / L, -cst / 2]); }
    }
    if (h0 >= 0) ev.push([1 - 1e-9, -cst / 2]);   // las que siguen abiertas pagan su salida al final
  }
  const sum = (a, b) => r4(ev.filter((x) => x[0] >= a && x[0] < b).reduce((s, x) => s + x[1], 0) * 100);
  return { n, tot: sum(0, 2), a: { tot: sum(0, 0.5) }, b: { tot: sum(0.5, 2) } };
}
export function aprender(series, spOf, k) {
  const P = PERF[k], B = BUSCA[k]; let best = null; const base = simular(series, spOf, P, P);
  for (const min of B.min) for (const dias of B.dias) { const r = simular(series, spOf, P, { min, dias }), ok = r.n >= 2 && r.a.tot > 0 && r.b.tot > 0, s = ok ? Math.min(r.a.tot, r.b.tot) : -99 + r.tot / 1e3; if (!best || s > best.s) best = { min, dias, ...r, ok, s }; }
  return { ...best, base: { n: base.n, tot: base.tot }, pausa: !best.ok && base.n >= 3 && base.tot < 0, t: new Date().toISOString() };
}
// ¿hay que salir? (la financiación se ha girado o ya no compensa, o el precio se ha disparado y el corto corre peligro)
export function salir(p, r, mark, now, P = PERF.cons) {
  if (mark >= p.pp * (1 + P.sube)) return `el precio se ha disparado un +${Math.round(P.sube * 100)} %: se cierra por seguridad del corto`;
  const h = (now.getTime() - Date.parse(p.t0)) / 3600e3;
  if (r && r.a1 != null && r.a1 < 0 && h >= 8) return "la financiación de las últimas 24 h es negativa (ahora pagaría en vez de cobrar)";
  if (r && r.a3 != null && r.a3 * AN < 0.04 && h >= 48) return "la financiación ha bajado de un 4 % anual: ya no compensa";
  return null;
}

async function post(body, fx) { const r = await fx(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

// datos compartidos por los tres submodos (una sola lectura de Hyperliquid por minuto; el historial, cada hora)
export async function datos(D, tick, now = new Date(), fx = fetch, monedas = []) {
  D = D || {}; const t = now.getTime(), ctx = {};
  try {
    const [meta, cs] = await post({ type: "metaAndAssetCtxs" }, fx);
    meta.universe.forEach((u, i) => { const c = cs[i]; if (!c || u.isDelisted) return; ctx[u.name] = { f: +c.funding, mark: +c.markPx, vol: +c.dayNtlVlm || 0, oi: (+c.openInterest || 0) * (+c.markPx || 0) }; });
  } catch (e) { D.err = "Hyperliquid: " + String(e.message).slice(0, 40); D.ctx = null; return D; }
  if (Object.keys(ctx).length < 20) { D.err = "Hyperliquid sin datos"; D.ctx = null; return D; }
  delete D.err; D.ctx = ctx;
  // candidatas: están en los dos sitios, con liquidez de sobra
  D.cand = Object.entries(ctx).map(([coin, c]) => ({ coin, m: moneda(coin) + "-EUR" })).filter((x) => tick[x.m] && tick[x.m].sp < 0.006 && tick[x.m].vq >= 2e5 && ctx[x.coin].vol >= 2e6 && ctx[x.coin].mark > 0).map((x) => x.coin);
  // historial de la financiación (3 días) cada hora: de las abiertas y de las 30 que más pagan ahora
  if (t - (D.frAt || 0) >= CADA_HIST) {
    const quiero = [...new Set([...monedas, ...D.cand.slice().sort((a, b) => ctx[b].f - ctx[a].f).slice(0, 30)])], nuevo = {}, serie = {}; delete D.series;
    let i = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < quiero.length) { const coin = quiero[i++]; try { const h = await post({ type: "fundingHistory", coin, startTime: t - 14 * 86400e3 }, fx); if (Array.isArray(h)) { nuevo[coin] = resumen(h, t); serie[coin] = h.slice().sort((a, b) => a.time - b.time).map((x) => +x.fundingRate); } } catch (e) {} } }));
    if (Object.keys(nuevo).length) { D.fr = nuevo; D.frAt = t; D.series = serie; }
  }
  D.fr = D.fr || {}; return D;
}
// una vuelta de una cuenta (cada minuto). tick: precios de Bitvavo { "BTC-EUR": {bid, ask, sp, vq} }; ue: euros por dólar (USDC-EUR)
export function vuelta(F, D, tick, ue, now = new Date(), P0 = PERF.cons) {
  // usa los umbrales aprendidos (si ganaron en las dos mitades); si no, los de partida
  const P = F && F.apr && F.apr.ok ? { ...P0, min: F.apr.min, dias: F.apr.dias } : P0;
  if (!F || F.v !== 1) { F = fresh(now); L(F, now, "INFO", "", `💸 empieza «Cobrar financiación» ${P.nombre} con 100 € ficticios: ${P.txt}`); }
  if (!(ue > 0)) { F.err = "sin cambio euro/dólar"; return F; }
  if (!D || !D.ctx) { F.err = (D && D.err) || "sin datos de Hyperliquid"; return F; }
  delete F.err; const t = now.getTime(), ctx = D.ctx, fr = D.fr || {};
  // cobrar la financiación desde la última vuelta (se paga cada hora; aquí se reparte por minutos)
  const dt = F.at ? Math.min(2, Math.max(0, (t - F.at) / 3600e3)) : 0; F.at = t;
  for (const p of Object.values(F.pos)) { const c = ctx[p.coin]; if (!c) continue; const g = p.qp * c.mark * c.f * dt * ue; p.fund += g; F.st.cobrado += g; p.lastMark = c.mark; const tb = tick[p.m]; if (tb) p.lastBid = tb.bid; }
  const cand = (D.cand || []).map((coin) => ({ coin, c: ctx[coin], m: moneda(coin) + "-EUR" })).filter((x) => x.c && tick[x.m]);
  // 4) salidas
  for (const [k, p] of Object.entries(F.pos)) {
    const c = ctx[p.coin], tb = tick[p.m]; if (!c || !tb) continue; const por = salir(p, fr[p.coin], c.mark, now, P); if (!por) continue;
    const v = valor(p, tb.bid, c.mark, ue), pnl = v - p.cost; F.cash += v; F.st.pnl += pnl; F.st.fees += p.qs * tb.bid * FEE + p.qp * c.mark * HLFEE * ue; if (pnl >= 0) F.st.wins++; else F.st.losses++;
    F.closed.unshift({ m: p.m, sym: p.sym, t0: p.t0, t1: now.toISOString(), cost: r2(p.cost), got: r2(v), pnl: r2(pnl), pc: r2((v / p.cost - 1) * 100), fund: r2(p.fund), why: por }); F.closed = F.closed.slice(0, 300);
    delete F.pos[k]; F.cool = F.cool || {}; F.cool[p.coin] = t; L(F, now, pnl >= 0 ? "WIN" : "LOSS", p.sym, `${pnl >= 0 ? "+" : ""}${r2(pnl)} € (financiación cobrada ${r2(p.fund)} €) · ${por}`);
  }
  // 5) entradas: las que más pagan, si lo que cobrarían en una semana paga los costes con margen
  const eq = equity(F, tick, ctx, ue);
  const buenas = F.apr && F.apr.pausa ? [] : cand.filter((x) => !Object.values(F.pos).some((p) => p.coin === x.coin) && !(F.cool && t - (F.cool[x.coin] || 0) < 24 * 3600e3) && merece(fr[x.coin], x.c.f, tick[x.m].sp, P)).sort((a, b) => fr[b.coin].a3 - fr[a.coin].a3);
  for (const x of buenas) {
    if (Object.keys(F.pos).length >= P.maxpos) break;
    const N = Math.min(F.cash, eq * P.parte) / (1 + P.gar); if (N < 5) break;   // N al contado y N × gar de garantía para el corto
    const tb = tick[x.m], ask = tb.ask, qs = N * (1 - FEE) / ask, qp = qs / mult(x.coin), pp = x.c.mark, feeHL = qp * pp * HLFEE * ue;
    F.cash -= N * (1 + P.gar); F.st.trades++; F.st.fees += N * FEE + feeHL;
    const r = fr[x.coin];
    F.pos[x.coin] = { coin: x.coin, m: x.m, sym: moneda(x.coin), qs, ps: ask, qp, pp, col: N * P.gar - feeHL, cost: N * (1 + P.gar), fund: 0, t0: now.toISOString(), a3: r4(r.a3 * AN), lastBid: tb.bid, lastMark: pp };
    L(F, now, "ENTER", moneda(x.coin), `${r2(N)} € al contado + corto de ${r2(N)} €${P.gar < 1 ? ` (garantía ${r2(N * P.gar)} €)` : ""} · financiación media 3 días: ${r2(r.a3 * AN * 100)} % al año (${r2(r.pos * 100)} % de las horas a favor)`);
  }
  // 6) lo que se ve en la pantalla
  F.ctx = Object.fromEntries(Object.values(F.pos).map((p) => [p.coin, { f: ctx[p.coin] ? ctx[p.coin].f : null, mark: ctx[p.coin] ? ctx[p.coin].mark : null }]));
  F.top = cand.filter((x) => fr[x.coin]).map((x) => { const r = fr[x.coin]; return { sym: moneda(x.coin), coin: x.coin, ahora: r4(x.c.f * AN * 100), a3: r4(r.a3 * AN * 100), a1: r4(r.a1 * AN * 100), pos: Math.round(r.pos * 100), sp: r2(tick[x.m].sp * 100), ok: merece(r, x.c.f, tick[x.m].sp, P), dentro: !!F.pos[x.coin] }; }).sort((a, b) => b.a3 - a.a3).slice(0, 12);
  const e2 = equity(F, tick, ctx, ue); F.eq.push([now.toISOString(), r2(e2)]); if (F.eq.length > 3000) F.eq = F.eq.filter((_, i) => i % 2 === 0 || i > F.eq.length - 500);
  F.lastEq = r2(e2); F.last = now.toISOString(); F.ue = ue;
  return F;
}
