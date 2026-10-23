// Trading 212 SIMULADO para las pruebas automáticas (mismos endpoints, campos y códigos que la API oficial v0:
// docs.trading212.com/api). Nunca toca tu cuenta: escucha solo en 127.0.0.1.
// Permite simular: ingresos y retiradas, posiciones tuyas, ventas a mano, órdenes que quedan pendientes, rechazos,
// desdoblamientos (split), errores de precisión de decimales y falta de efectivo. También sirve precios tipo Yahoo.
import http from "node:http";

export const INST = [
  ["QDVEd_EQ", "iShares S&P 500 Information Technology Sector (Acc)", "IE00B3WJKG14"], ["SXLId_EQ", "SPDR S&P U.S. Industrials Select Sector (Acc)", "IE00BWBXM724"],
  ["SXLUd_EQ", "SPDR S&P U.S. Utilities Select Sector (Acc)", "IE00BWBXMB69"], ["SXLEd_EQ", "SPDR S&P U.S. Energy Select Sector (Acc)", "IE00BWBXM492"],
  ["SXLVd_EQ", "SPDR S&P U.S. Health Care Select Sector (Acc)", "IE00BWBXM617"], ["SXLFd_EQ", "SPDR S&P U.S. Financials Select Sector (Acc)", "IE00BWBXM500"],
  ["SXLYd_EQ", "SPDR S&P U.S. Consumer Discretionary Select Sector (Acc)", "IE00BWBXM278"], ["SXLPd_EQ", "SPDR S&P U.S. Consumer Staples Select Sector (Acc)", "IE00BWBXM385"],
  ["SXLBd_EQ", "SPDR S&P U.S. Materials Select Sector (Acc)", "IE00BWBXM831"], ["SXLCd_EQ", "SPDR S&P U.S. Communication Services Select Sector (Acc)", "IE00BFWFPS09"],
  ["SXR8d_EQ", "iShares Core S&P 500 (Acc)", "IE00B5BMR087"], ["SXRVd_EQ", "iShares Nasdaq 100 (Acc)", "IE00B53SZB19"], ["VVSMd_EQ", "VanEck Semiconductor (Acc)", "IE00BMC38736"],
  ["ZPRRd_EQ", "SPDR Russell 2000 US Small Cap (Acc)", "IE00BJ38QD84"], ["QQQ3l_EQ", "WisdomTree Nasdaq-100 3x Daily Leveraged", "IE00BLRPRL42"],
].map(([t, n, i]) => ({ ticker: t, name: n, shortName: t.slice(0, 4), isin: i, currencyCode: "EUR", type: "ETF", extendedHours: false }));
export const PX0 = { QDVEd_EQ: 31.2, SXLId_EQ: 52.1, SXLUd_EQ: 41.7, SXLEd_EQ: 28.4, SXLVd_EQ: 39.5, SXLFd_EQ: 48.2, SXLYd_EQ: 55.6, SXLPd_EQ: 40.3, SXLBd_EQ: 37.8, SXLCd_EQ: 36.0, SXR8d_EQ: 610.5, SXRVd_EQ: 1120.3, VVSMd_EQ: 44.1, ZPRRd_EQ: 60.2, QQQ3l_EQ: 80 };

export function startMock() {
  const K = { px: { ...PX0 }, yahooMult: {}, txs: [], mine: {}, sellByHand: {}, split: {}, reject: [], pendingMode: false, fillPending: false, precision: 3, down: false };
  const A = { cash: 0, pos: {}, pend: [], hist: [], txs: [], id: 1, done: {} };
  const calls = [];
  function fill(t, q, id, createdAt) {
    const px = K.px[t], v = q * px; A.cash -= v; const P = A.pos[t] || { q: 0, avg: px };
    if (q > 0) P.avg = (P.avg * P.q + px * q) / (P.q + q);
    P.q = +(P.q + q).toFixed(8); if (P.q <= 1e-9) delete A.pos[t]; else A.pos[t] = P;
    A.hist.unshift({ order: { id, ticker: t, status: "FILLED", filledQuantity: q, createdAt }, fill: { price: px, filledAt: new Date().toISOString(), walletImpact: { netValue: -v, fxRate: 1, taxes: [] } } });
  }
  function apply() {
    for (const d of K.txs) if (!A.done["tx" + d.ref]) { A.done["tx" + d.ref] = 1; A.txs.push(d); A.cash += d.type === "DEPOSIT" ? d.amount : -Math.abs(d.amount); }
    for (const [t, qq] of Object.entries(K.mine)) if (!A.done["mine" + t + qq]) { A.done["mine" + t + qq] = 1; const P = A.pos[t] || { q: 0, avg: K.px[t] }; P.avg = (P.avg * P.q + K.px[t] * qq) / (P.q + qq); P.q += qq; A.pos[t] = P; A.cash -= qq * K.px[t]; }
    for (const [t, qq] of Object.entries(K.sellByHand)) if (!A.done["hand" + t + qq]) { A.done["hand" + t + qq] = 1; if (A.pos[t]) { A.pos[t].q -= qq; A.cash += qq * K.px[t]; } }
    for (const [t, k] of Object.entries(K.split)) if (!A.done["split" + t + k]) { A.done["split" + t + k] = 1; if (A.pos[t]) { A.pos[t].q *= k; A.pos[t].avg /= k; K.px[t] /= k; } }
    if (K.fillPending) for (const o of A.pend.splice(0)) fill(o.ticker, o.quantity, o.id, o.createdAt);
  }
  const srv = http.createServer((q, r) => {
    let body = ""; q.on("data", (c) => (body += c)); q.on("end", () => {
      const u = new URL(q.url, "http://x"), p = u.pathname.replace("/api/v0", "");
      calls.push({ m: q.method, p: u.pathname + u.search, body });
      apply();
      const j = (o, c = 200) => { r.writeHead(c, { "Content-Type": "application/json" }); r.end(JSON.stringify(o)); };
      if (p.startsWith("/v8/finance/chart/")) { const s = decodeURIComponent(p.split("/").pop()); const t = Object.keys(K.px).find((k) => k.replace(/[a-z]_EQ$/, "") + ".DE" === s); return t ? j({ chart: { result: [{ meta: { regularMarketPrice: K.px[t] * (K.yahooMult[t] || 1), currency: "EUR" } }] } }) : j({}, 404); }
      if (p.startsWith("/q/l/")) { r.writeHead(404); return r.end(""); }
      if (K.down) return j({ e: "down" }, 503);
      if (!/^Basic /.test(q.headers.authorization || "")) return j({ code: "AuthenticationFailed" }, 401);
      const val = () => Object.entries(A.pos).reduce((t, [k, x]) => t + x.q * K.px[k], 0);
      if (p === "/equity/account/summary") return j({ id: 12345, currency: "EUR", cash: { availableToTrade: +A.cash.toFixed(2), reservedForOrders: +A.pend.reduce((t, o) => t + (o.quantity > 0 ? o.quantity * K.px[o.ticker] : 0), 0).toFixed(2), inPies: 0 }, investments: { currentValue: +val().toFixed(2) } });
      if (p === "/equity/positions") return j(Object.entries(A.pos).map(([k, x]) => { const i = INST.find((z) => z.ticker === k); return { instrument: { ticker: k, name: i.name, currency: "EUR", isin: i.isin }, quantity: x.q, quantityAvailableForTrading: x.q, averagePricePaid: x.avg, currentPrice: K.px[k], createdAt: "2026-10-20T10:00:00Z", walletImpact: { currency: "EUR", currentValue: +(x.q * K.px[k]).toFixed(2), totalCost: +(x.q * x.avg).toFixed(2), unrealizedProfitLoss: +(x.q * (K.px[k] - x.avg)).toFixed(2), fxImpact: 0 } }; }));
      if (p === "/equity/orders" && q.method === "GET") return j(A.pend.map((o) => ({ ...o, status: "NEW" })));
      if (p === "/equity/metadata/instruments") return j(INST);
      if (p === "/equity/history/transactions") return j({ items: A.txs.map((x) => ({ type: x.type, amount: x.amount, dateTime: x.at })), nextPagePath: null });
      if (p === "/equity/orders/market" && q.method === "POST") {
        const b = JSON.parse(body), px = K.px[b.ticker], v = b.quantity * px, id = A.id++;
        if (String(b.quantity).split(".")[1]?.length > K.precision) return j({ code: "QuantityPrecisionMismatch", message: `quantity precision ${K.precision}` }, 400);
        if (v > A.cash + 0.001) return j({ code: "InsufficientFreeForStocksException" }, 400);
        if (b.quantity < 0 && (!A.pos[b.ticker] || -b.quantity > A.pos[b.ticker].q + 1e-9)) return j({ code: "SellingEquityNotOwned" }, 400);
        if (K.reject.includes(b.ticker)) { A.hist.unshift({ order: { id, ticker: b.ticker, status: "REJECTED", filledQuantity: 0, createdAt: new Date().toISOString() } }); return j({ id, ticker: b.ticker, status: "REJECTED", quantity: b.quantity }); }
        const o = { id, ticker: b.ticker, quantity: b.quantity, createdAt: new Date().toISOString() };
        if (K.pendingMode) { A.pend.push(o); return j({ ...o, status: "NEW" }); }
        fill(b.ticker, b.quantity, id, o.createdAt); return j({ ...o, status: "NEW" });
      }
      if (/^\/equity\/orders\/\d+$/.test(p)) { const id = p.split("/").pop(), o = A.pend.find((x) => String(x.id) === id); if (o) return j({ ...o, status: "NEW" }); const h = A.hist.find((x) => String(x.order.id) === id && x.order.status === "REJECTED"); if (h) return j({ id: h.order.id, status: "REJECTED" }); return j({ code: "NotFound" }, 404); }
      if (p === "/equity/history/orders") { const tk = u.searchParams.get("ticker"); return j({ items: A.hist.filter((h) => !tk || h.order.ticker === tk).slice(0, +(u.searchParams.get("limit") || 50)) }); }
      j({ code: "NotFound", path: p }, 404);
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ port: srv.address().port, K, A, calls, close: () => new Promise((c) => srv.close(c)) })));
}
