// Exchange falso (adaptador con la misma forma que bitvavoEx/OKX.adaptador), todo en memoria. Sin red.
export function fakeEx(px, opts = {}) {
  const S = { px, eur: opts.eur ?? 100, bal: {}, compras: [], ventas: [], stops: {}, nStop: 0, botBuys: [] };
  const sym = (m) => m.split("-")[0];
  const X = {
    nombre: opts.nombre || "Bitvavo", fee: 0.0025, tiene: () => true, errClave: () => false,
    async mercado() { return { min: 5, dec: 8 }; },
    async saldoEur() { return S.eur; },
    async saldos() { const o = { EUR: S.eur }; for (const [k, q] of Object.entries(S.bal)) if (q > 1e-12) o[k] = q; return o; },
    async saldo(s) { return S.bal[s] || 0; },
    async comprar(m, eur) { const p = S.px[m], q = (eur / p) * (1 - 0.0025); S.eur -= eur; S.bal[sym(m)] = (S.bal[sym(m)] || 0) + q; S.compras.push({ m, eur }); S.botBuys.push({ sym: sym(m), q, t: Date.now() }); return { q, coste: eur, fee: eur * 0.0025, px: eur / q }; },
    async vender(m, q) { const p = S.px[m]; S.bal[sym(m)] -= q; const got = q * p * (1 - 0.0025); S.eur += got; S.ventas.push({ m, q }); return { q, got, fee: q * p * 0.0025, px: p }; },
    async ponStop(m, q, p) { const id = "S" + ++S.nStop; S.stops[id] = { m, q, px: p }; return id; },
    async quitaStop(m, id) { delete S.stops[id]; },
    async estadoStop(m, id) { const s = S.stops[id]; return s ? { activo: true, q: s.q, lado: "sell", px: s.px } : { activo: false, q: 0 }; },
    async operaciones() { return []; },
    async comprasBot(s) { return S.botBuys.filter((b) => b.sym === s).reduce((a, b) => a + b.q, 0); },   // el exchange SÍ sabe qué compró el bot (operatorId)
    async estadoOrden() { return { final: true, lleno: 0 }; },
    async abiertas() { return 0; },
  };
  return { S, X };
}
export const tk = (px) => Object.fromEntries(Object.entries(px).map(([m, p]) => [m, { bid: p * 0.999, ask: p * 1.001, sp: 0.002 }]));
export const T = (min) => new Date(Date.UTC(2026, 10, 4, 12, min));
export const clon = (o) => JSON.parse(JSON.stringify(o));
