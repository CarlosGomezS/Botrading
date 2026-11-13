// Hyperliquid y GitHub DE MENTIRA para probar el bot real (sin dinero, sin red). Lo usan las pruebas de hl-real (con y sin token de GitHub).
// OJO: importarlo con import() DESPUÉS de fijar las variables de entorno (el módulo del bot las lee al cargarse).
export const HL = await import("../runner/hl-real.mjs");
const { encrypt } = await import("../runner/real-cfg.mjs");
export const H = 3600e3;

// ---------- el mundo de mentira ----------
export function mundo(o = {}) {
  const W = { eq: o.eq ?? 100, neto: o.neto ?? 100, px: { BTC: 100, ETH: 10, SOL: 5, ...(o.px || {}) }, pos: {}, stops: [], oid: 1, fills: [], ordenes: [], refs: new Set(), guardado: null, avisos: [],
    ctl: o.ctl === undefined ? { estado: "on", uso: 100, plazas: 5, freno: 0.35, puesto: 1 } : o.ctl, ctlFallo: o.ctlFallo || null, refsFallo: !!o.refsFallo,
    falloStop: o.falloStop || 0, stopIncompleto: o.stopIncompleto || 0, fillsRoto: !!o.fillsRoto, estadoRoto: !!o.estadoRoto, guardarFalla: !!o.guardarFalla, ledgerFallo: !!o.ledgerFallo, rompeTrasCierre: !!o.rompeTrasCierre, cancelFalla: o.cancelFalla || 0, marcasFallo: !!o.marcasFallo, ordenesFallo: !!o.ordenesFallo, borrarFalla: !!o.borrarFalla, pagRepetida: o.pagRepetida || 0, pagFallo: o.pagFallo || 0, pagRed: o.pagRed || 0, lab: o.lab || null, falloCierre: new Set(o.falloCierre || []), parcial: o.parcial || 0, timeoutAbrir: !!o.timeoutAbrir, quiere: o.quiere || [] };
  for (const p of o.pos || []) { W.pos[p.c] = { szi: p.szi, entryPx: p.px ?? W.px[p.c] }; W.fills.push({ coin: p.c, dir: p.szi > 0 ? "Open Long" : "Open Short", time: Date.now() - (p.edadH ?? 1) * H, px: p.px ?? W.px[p.c], sz: Math.abs(p.szi) }); }
  for (const s of o.stops || []) W.stops.push({ coin: s.c, oid: W.oid++, ...(s.side ? { side: s.side } : {}), sz: String(s.sz), origSz: String(s.sz), triggerPx: String(s.trig), isTrigger: !s.limite, orderType: s.limite ? "Limit" : s.tipo || "Stop Market", reduceOnly: s.noReduce ? false : true });
  // v466 · con posiciones de partida, el bot ya tenía su estado (salvo que la prueba diga lo contrario)
  if ((o.pos || []).length && !o.sinEstado) W.estadoIni = { pm: Object.fromEntries(o.pos.map((p) => [p.c, { h: 168, sl: 0.08, k: "m1" }])) };
  const coins = Object.keys(W.px), j = (x, st = 200) => ({ ok: st < 400, status: st, json: async () => x, text: async () => JSON.stringify(x) });
  W.fetch = async (url, init = {}) => {
    const u = String(url), body = init.body ? JSON.parse(init.body) : null;
    if (u.includes("raw.githubusercontent.com") && u.includes("/hl-ctl/")) { if (W.ctlFallo === "red") throw new Error("fetch failed"); if (W.ctlFallo) return j({}, W.ctlFallo); return W.ctl ? j(W.ctl) : j({}, 404); }
    if (u.includes("raw.githubusercontent.com") && u.includes("/hl-real/")) { if (W.estadoRoto) return j({}, 500); if (!W.guardado && W.estadoIni) W.guardado = { enc: 1, t: new Date(Date.now() - 2 * H).toISOString(), ...(await encrypt(JSON.stringify(W.estadoIni), process.env.REAL_VIEW_PASS)) }; return W.guardado ? j(W.guardado) : j({}, 404); }
    if (u.includes("/caza-lab/caza-lab.json")) return W.lab ? j(W.lab) : j({}, 404);
    if (u.includes("/ia-lab/ia-lab.json")) return j({});
    if (u.includes("/contents/hl-real.json")) return W.guardado ? j({ t: W.guardado.t }) : j({}, 404);
    if (u.endsWith("/git/refs") && init.method === "POST") { if (W.refsFallo) return j({}, 500); if (W.refs.has(body.ref)) return j({ message: "Reference already exists" }, 422); W.refs.add(body.ref); return j({ ref: body.ref }, 201); }
    if (u.includes("/git/matching-refs/")) { if (W.marcasFallo && u.includes("hl-freno")) return j({}, 500); const q = u.split("/git/matching-refs/")[1], pre = "refs/" + q.split("?")[0], pg = +((q.match(/[?&]page=(\d+)/) || [])[1] || 1), pp = +((q.match(/per_page=(\d+)/) || [])[1] || 1e9); if (W.pagFallo && pg === W.pagFallo) return j({ message: "error interno" }, 500); if (W.pagRed && pg === W.pagRed) throw new Error("fetch failed");
      const pgR = W.pagRepetida && pg >= 2 ? 1 : pg; W.paginas = (W.paginas || []).concat(pg); return j([...W.refs].filter((r) => r.startsWith(pre)).sort().slice((pgR - 1) * pp, pgR * pp).map((ref) => ({ ref }))); }
    if (u.includes("/git/ref/tags/")) return W.refs.has("refs/" + u.slice(u.indexOf("/git/ref/") + 9)) ? j({}) : j({}, 404);
    if (init.method === "DELETE" && u.includes("/git/refs/") && W.borrarFalla) return j({}, 500);
    if (init.method === "DELETE" && u.includes("/git/refs/")) { W.refs.delete(u.slice(u.indexOf("refs/"))); return j({}, 204); }
    if (u.endsWith("/info")) {
      const pos = () => Object.entries(W.pos).filter(([, p]) => p.szi !== 0).map(([c, p]) => ({ position: { coin: c, szi: String(p.szi), entryPx: String(p.entryPx), unrealizedPnl: String((W.px[c] - p.entryPx) * p.szi), positionValue: String(Math.abs(p.szi) * W.px[c]) } }));
      switch (body.type) {
        case "meta": return j({ universe: coins.map((c) => ({ name: c, szDecimals: 3 })) });
        case "clearinghouseState": if (W.chRoto) return j({}, 500); return j({ marginSummary: { accountValue: String(W.eq) }, assetPositions: pos() });
        case "allMids": return j(Object.fromEntries(coins.map((c) => [c, String(W.px[c])])));
        case "userNonFundingLedgerUpdates": if (W.ledgerFallo) return j({}, 500); return j([{ delta: { type: "deposit", usdc: String(W.neto) } }]);
        case "userFills": if (W.fillsRoto) return j({}, 500); return j(W.fills);
        case "extraAgents": return j([{ address: "0x" + "c".repeat(40), validUntil: Date.now() + 100 * 864e5 }]);
        case "frontendOpenOrders": if (W.ordenesFallo) return j({}, 500); return j(W.stops);
        default: return j([]);
      }
    }
    if (u.endsWith("/exchange")) {
      const a = body.action;
      if (a.type === "cancel") { if (W.cancelFalla > 0) { W.cancelFalla--; return j({ status: "ok", response: { type: "cancel", data: { statuses: a.cancels.map(() => "success") } } }); }   // dice «success» pero no cancela
        for (const x of a.cancels) W.stops = W.stops.filter((s) => s.oid !== x.o); return j({ status: "ok", response: { type: "cancel", data: { statuses: a.cancels.map(() => "success") } } }); }
      const o2 = a.orders[0], c = coins[o2.a], sz = +o2.s, compra = o2.b;
      W.ordenes.push({ c, compra, sz, reduce: !!o2.r, stop: !!o2.t.trigger, trig: o2.t.trigger ? +o2.t.trigger.triggerPx : null, px: +o2.p });
      if (o2.t.trigger && W.stopIncompleto > 0) { W.stopIncompleto--; return j({ status: "ok", response: { type: "order" } }); }
      if (o2.t.trigger) { if (W.falloStop > 0) { W.falloStop--; return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "rechazada (prueba)" }] } } }); }
        W.stops.push({ coin: c, oid: W.oid++, side: compra ? "B" : "A", sz: String(sz), origSz: String(sz), triggerPx: o2.t.trigger.triggerPx, isTrigger: true, orderType: "Stop Market", reduceOnly: !!o2.r }); return j({ status: "ok", response: { type: "order", data: { statuses: ["waitingForTrigger"] } } }); }
      if (o2.r) { if (W.falloCierre.has(c)) return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "sin liquidez (prueba)" }] } } });
        const p = W.pos[c]; if (!p || !p.szi) return j({ status: "ok", response: { type: "order", data: { statuses: [{ error: "nada que reducir" }] } } });
        if (W.rompeTrasCierre) W.chRoto = true; const q = +(Math.min(sz, Math.abs(p.szi)) * (W.cierreParcial || 1)).toFixed(6); p.szi = p.szi > 0 ? p.szi - q : p.szi + q; if (Math.abs(p.szi) < 1e-9) delete W.pos[c]; W.fills.push({ coin: c, dir: "Close", time: Date.now(), px: W.px[c], sz: q, closedPnl: "0", fee: "0" });
        return j({ status: "ok", response: { type: "order", data: { statuses: [{ filled: { totalSz: String(q), avgPx: String(W.px[c] * (1 + (W.slipFill || 0) * (compra ? 1 : -1))) } }] } } }); }
      if (W.timeoutAbrir) { const p = W.pos[c] || (W.pos[c] = { szi: 0, entryPx: W.px[c] }); p.szi += compra ? sz : -sz; throw new Error("The operation was aborted due to timeout"); }   // la orden SÍ entra, pero la respuesta se pierde
      const q = W.parcial ? +(sz * W.parcial).toFixed(3) : sz, p = W.pos[c] || (W.pos[c] = { szi: 0, entryPx: W.px[c] }); p.szi += compra ? q : -q; p.entryPx = W.px[c];
      W.fills.push({ coin: c, dir: compra ? "Open Long" : "Open Short", time: Date.now(), px: W.px[c], sz: q });
      return j({ status: "ok", response: { type: "order", data: { statuses: [{ filled: { totalSz: String(q), avgPx: String(W.px[c] * (1 + (W.slipFill || 0) * (compra ? 1 : -1))) } }] } } });
    }
    throw new Error("URL no esperada en la prueba: " + u);
  };
  return W;
}
export function conecta(W) {
  Object.assign(HL.deps, { fetch: W.fetch, firma: async () => ({ r: "0x1", s: "0x2", v: 27 }), direccion: async () => "0x" + "c".repeat(40), espera: async () => {},
    aviso: async (t) => { W.avisos.push(t); }, guardar: async (estado) => { if (W.guardarFalla) return false; W.guardado = { enc: 1, t: new Date().toISOString(), ...(await encrypt(JSON.stringify(estado), process.env.REAL_VIEW_PASS)) }; },
    metodo: async () => ({ x: { g: { h: 168, sl: 0.08 }, n: "método de prueba", k: "m1" }, IA: [], U: Object.keys(W.px) }), senales: async () => ({ quiere: W.quiere }) });
}
export const abiertas = (W) => Object.entries(W.pos).filter(([, p]) => p.szi).map(([c, p]) => ({ c, szi: +p.szi.toFixed(6) }));
export const aperturas = (W) => W.ordenes.filter((o) => !o.reduce && !o.stop);
export const silencio = async (f) => { const l = console.log; console.log = () => {}; try { return await f(); } finally { console.log = l; } };
export const otraHora = async (W) => { for (const r of [...W.refs]) if (r.includes("hl-lock-")) W.refs.delete(r); if (W.guardado) W.guardado.t = new Date(Date.now() - 2 * H).toISOString(); await silencio(() => HL.ronda()); };
