// v1.0 · R6-6 y R6-11 · revisión independiente de Hyperliquid
process.env.GITHUB_TOKEN = "tok-de-prueba"; process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_SHA = "a".repeat(40);
process.env.REAL_VIEW_PASS = "clave-de-prueba"; process.env.HL_AGENT_KEY = "1".repeat(64); process.env.HL_WALLET = "0x" + "b".repeat(40);
import test from "node:test";
import assert from "node:assert/strict";
const { HL, mundo, conecta, silencio, otraHora } = await import("./hl-mundo.mjs");
const { decrypt } = await import("../runner/real-cfg.mjs");
const estadoDe = async (W) => JSON.parse(await decrypt(W.guardado, process.env.REAL_VIEW_PASS));
const escena = () => mundo({ eq: 1000, neto: 1000, px: { DOGE: 1, XRP: 2 },
  pos: [{ c: "BTC", szi: 1.5 }, { c: "ETH", szi: 15 }, { c: "SOL", szi: 30 }, { c: "DOGE", szi: 150 }],
  stops: [{ c: "BTC", side: "A", sz: 1.5, trig: 92 }, { c: "ETH", side: "A", sz: 15, trig: 9.2 }, { c: "SOL", side: "A", sz: 30, trig: 4.6 }, { c: "DOGE", side: "A", sz: 150, trig: 0.92 }],
  quiere: [{ c: "BTC", dir: 1 }, { c: "ETH", dir: 1 }, { c: "SOL", dir: 1 }, { c: "DOGE", dir: 1 }, { c: "XRP", dir: 1 }],
  timeoutAbrir: true });

test("R6-6 · con plazas ocupadas por señales que siguen, la posición nueva cuya respuesta se pierde queda con su stop", async () => {
  const W = escena(); conecta(W); await silencio(() => HL.ronda());
  assert.ok(W.pos.XRP && W.pos.XRP.szi > 0, "la orden de XRP entró");
  assert.equal(W.stops.filter((s) => s.coin === "XRP").length, 1, "XRP debe tener stop");
});
test("R6-6 · y en la ronda siguiente la gestiona el bot", async () => {
  const W = escena(); conecta(W); await silencio(() => HL.ronda()); W.timeoutAbrir = false; W.quiere = []; await otraHora(W);
  const S = await estadoDe(W);
  assert.ok(S.pm.XRP, "XRP es del bot; ajenasPos=" + JSON.stringify(S.ajenasPos));
  assert.equal(W.stops.filter((s) => s.coin === "XRP").length, 1);
});
test("R6-11 · cambiar USDC de Spot por otra cripto no es una pérdida: el freno no salta", async () => {
  const W = mundo({ eq: 300, neto: 1000, pos: [{ c: "BTC", szi: 1 }], stops: [{ c: "BTC", side: "A", sz: 1, trig: 92 }] }); W.spot = 0;
  W.spotOtros = [{ coin: "HYPE", total: "20", hold: "0", entryNtl: "700" }];
  conecta(W); await silencio(() => HL.ronda());
  assert.ok(W.pos.BTC && W.pos.BTC.szi === 1, "BTC no debe cerrarse");
});
test("R6-11 · CONTROL: si de verdad falta el dinero, el freno sí salta", async () => {
  const W = mundo({ eq: 300, neto: 1000, pos: [{ c: "BTC", szi: 1 }], stops: [{ c: "BTC", side: "A", sz: 1, trig: 92 }] }); W.spot = 0;
  conecta(W); await silencio(() => HL.ronda());
  assert.ok(!(W.pos.BTC && W.pos.BTC.szi === 1), "con 300 de 1000 el freno cierra");
});
