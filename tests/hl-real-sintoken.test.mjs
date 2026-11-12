// v470 · 🧪 el bot real de Hyperliquid SIN token de GitHub: nada puede darse por bueno (ni leer el freno, ni limpiarlo, ni el candado) y NO se abre nada.
// (archivo aparte porque el bot lee el token al cargarse; aquí se carga sin él)
import test from "node:test";
import assert from "node:assert/strict";
delete process.env.GITHUB_TOKEN;
process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_SHA = "a".repeat(40); process.env.REAL_VIEW_PASS = "clave-de-prueba";
process.env.HL_AGENT_KEY = "1".repeat(64); process.env.HL_WALLET = "0x" + "b".repeat(40);
const { HL, mundo, conecta, aperturas, silencio } = await import("./hl-mundo.mjs");
test("sin token de GitHub: leer las marcas del freno, limpiarlas y el candado son FALLOS (no éxitos)", async () => {
  const W = mundo({}); conecta(W); let llamadas = 0; const f0 = HL.deps.fetch; HL.deps.fetch = async (...a) => { llamadas++; return f0(...a); };
  try { assert.equal((await HL.marcasFreno()).ok, false); assert.equal(await HL.limpiaMarcasFreno(Date.now()), false); const c = await HL.candado("2026111219"); assert.equal(c.ok, false); assert.ok(!c.ocupado);
    assert.equal(await HL.ponMarcaFreno(new Date().toISOString()), false); assert.equal(llamadas, 0, "ni siquiera se intenta hablar con GitHub"); } finally { HL.deps.fetch = f0; }
});
test("sin token de GitHub: con señales y todo lo demás bien, NO abre nada (y lo abierto sigue protegido)", async () => {
  const W = mundo({ quiere: [{ c: "ETH", dir: 1 }], pos: [{ c: "BTC", szi: -0.1 }] }); conecta(W); await silencio(() => HL.ronda());
  assert.equal(aperturas(W).length, 0); assert.equal(W.stops.filter((s) => s.coin === "BTC").length, 1, "la posición abierta tiene su stop");
});
