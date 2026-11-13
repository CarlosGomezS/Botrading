import test from "node:test";
import assert from "node:assert/strict";
import * as HP from "../runner/hl-momento.mjs";

// Hyperliquid de mentira: BTC sube suave, SOL sube fuerte (+6 % en 12 h), ETH plano; financiación normal salvo DOGE (alcistas amontonados)
function fx(px, fund = {}) { return async (u, o) => { const b = JSON.parse(o.body); let j;
  if (b.type === "metaAndAssetCtxs") j = [{ universe: Object.keys(px).map((name) => ({ name })) }, Object.keys(px).map((k) => ({ markPx: String(px[k].now), dayNtlVlm: "1000000", funding: String(fund[k] || 0.00001) }))];
  else if (b.type === "candleSnapshot") { const k = b.req.coin, n = 130; j = Array.from({ length: n }, (_, i) => { const t = b.req.startTime + i * 3600e3; return { t, T: t + 3600e3 - 1, c: String(px[k].f(i, n)) }; }); }
  else if (b.type === "fundingHistory") j = [{ fundingRate: String(fund[b.coin] || 0.00001) }];
  return { ok: true, json: async () => j }; }; }
const px = { BTC: { now: 100, f: (i) => 90 + i * 0.1 }, ETH: { now: 10, f: () => 10 }, SOL: { now: 106, f: (i, n) => (i < n - 12 ? 100 : 100 + (i - (n - 13)) * 0.5) }, DOGE: { now: 120, f: (i, n) => (i < n - 12 ? 100 : 100 + (i - (n - 13)) * 2) } };

test("Hyperliquid ficticio: compra la que más sube SIN alcistas amontonados y la vende a las 6 h con costes", async () => {
  const T = Date.UTC(2026, 10, 8, 10, 1); let Z = await HP.paso(null, T, fx(px, { DOGE: 0.0002 }));
  assert.equal(Z.pos.length, 1); assert.equal(Z.pos[0].c, "SOL", "DOGE sube más pero tiene a los alcistas amontonados: " + JSON.stringify(Z.decisiones[0]));
  Z = await HP.paso(Z, T + 5 * 60e3, fx(px, { DOGE: 0.0002 })); assert.equal(Z.pos.length, 1, "en la misma hora no vuelve a decidir");
  const px2 = { ...px, SOL: { ...px.SOL, now: 110 } }; Z = await HP.paso(Z, T + 6 * 3600e3 + 60e3, fx(px2, { DOGE: 0.0002 }));
  assert.equal(Z.cerradas.length, 1); assert.ok(Z.cerradas[0].pc > 0 && Z.cerradas[0].pc < 110 / 106 * 100 - 100, "gana, pero menos que la subida por costes: " + Z.cerradas[0].pc);
  const r = HP.resumen(Z); assert.equal(r.ops, 1); assert.ok(r.eq > 1000);
});
test("Hyperliquid ficticio: con BTC a la baja no compra", () => {
  const c = { BTC: Array.from({ length: 120 }, (_, i) => [i, 200 - i]), SOL: Array.from({ length: 120 }, (_, i) => [i, i < 100 ? 100 : 120]) };
  const d = HP.elige(c, { SOL: 0 }); assert.equal(d.cual, null); assert.match(d.motivo, /BTC/);
});
test("v479 · H-16: el Hyperliquid ficticio no escribe nombres de criptos ni resultados en el registro (que es público)", async () => {
  const L = [], T = Date.UTC(2026, 10, 8, 10, 1); let Z = await HP.paso(null, T, fx(px, { DOGE: 0.0002 }), (x) => L.push(x));
  const px2 = { ...px, SOL: { ...px.SOL, now: 110 } }; Z = await HP.paso(Z, T + 6 * 3600e3 + 60e3, fx(px2, { DOGE: 0.0002 }), (x) => L.push(x));
  assert.ok(L.length >= 2, "escribe algo: " + L.join(" | ")); for (const l of L) { assert.ok(!/\b(BTC|ETH|SOL|DOGE)\b/.test(l), "sin criptos: " + l); assert.ok(!/%/.test(l), "sin resultados: " + l); }
});
