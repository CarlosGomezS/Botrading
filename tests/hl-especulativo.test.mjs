// v1.0 · 🎲 modo especulativo de Hyperliquid (26/11/2026): sin método aprobado, sigue a la vez a los 3 mejores «casi aprobados»
import test from "node:test";
test.afterEach(() => { process.exitCode = 0; });
import assert from "node:assert/strict";
process.env.GITHUB_TOKEN = "tok-de-prueba"; process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_SHA = "a".repeat(40);
process.env.REAL_VIEW_PASS = "clave-de-prueba"; process.env.HL_AGENT_KEY = "1".repeat(64); process.env.HL_WALLET = "0x" + "b".repeat(40);
const { HL, mundo, conecta, abiertas, silencio } = await import("./hl-mundo.mjs");
const { decrypt } = await import("../runner/real-cfg.mjs");

const casi = (n, ret, extra = {}) => ({ g: { a: 1, b: 2, f: "sin filtro", h: 24, sl: 0.03, n }, n, a: { ret: 0.5 }, b: { ret, n: 60, pf: 1.6, dd: 0.1 }, ...extra });

test("elige hasta 3 casi aprobados de IDEAS distintas, los que más ganaron en la parte oculta", () => {
  const L = [casi("Idea A + confirma X", 0.2), casi("Idea A + confirma Y", 0.25), casi("Idea B", 0.15), casi("Idea C", 0.1), casi("Idea D", 0.3)];
  const E = HL.eligeEspeculativos(L);
  assert.deepEqual(E.map((x) => x.n), ["Idea D", "Idea A + confirma Y", "Idea B"]);
  assert.ok(E.every((x) => x.k.startsWith("esp:") && x.esp === 1));
});
test("descarta los que perdieron en la parte oculta, con pocas operaciones o con caídas enormes", () => {
  const E = HL.eligeEspeculativos([casi("Pierde", -0.1), casi("Pocas", 0.3, { b: { ret: 0.3, n: 10, pf: 2, dd: 0.1 } }), casi("Caída", 0.3, { b: { ret: 0.3, n: 60, pf: 2, dd: 0.5 } }), casi("Bien", 0.12)]);
  assert.deepEqual(E.map((x) => x.n), ["Bien"]);
});
test("ajuste esp: se guarda solo si es sí/no; por defecto apagado", () => {
  assert.equal(HL.validaCtl({}).esp, false);
  assert.equal(HL.validaCtl({ esp: true }).esp, true);
  assert.equal(HL.validaCtl({ esp: "sí" }, { ...HL.CTL0, esp: true }).esp, true);
  assert.equal(HL.ctlCompleto({ estado: "on", uso: 100, plazas: 0, freno: 0.5, puesto: 1, esp: true }), true);
});
test("cada posición abierta guarda la duración y el stop del método que dio SU señal", async () => {
  const W = mundo({ quiere: [{ c: "BTC", dir: 1, g: { h: 12, sl: 0.03 }, k: "esp:a" }, { c: "ETH", dir: 1, g: { h: 72, sl: 0 }, k: "esp:b" }] }); conecta(W);
  await silencio(() => HL.ronda());
  assert.equal(abiertas(W).length, 2);
  const S = JSON.parse(await decrypt(W.guardado, process.env.REAL_VIEW_PASS));
  assert.equal(S.pm.BTC.h, 12); assert.equal(S.pm.BTC.sl, 0.03); assert.equal(S.pm.BTC.k, "esp:a");
  assert.equal(S.pm.ETH.h, 72); assert.equal(S.pm.ETH.k, "esp:b");
});
test("app: botón del modo especulativo y se guarda como sí/no", async () => {
  const H = (await import("node:fs")).readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(H, /ch\("esp","true","🎲 Sí"/); assert.match(H, /key==="esp"\?v==="true"/);
});
