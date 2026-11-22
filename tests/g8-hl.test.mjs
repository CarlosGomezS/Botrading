// v1.0 · G8 · auditoría de Gemini (proyecto completo, 22 nov)
process.env.GITHUB_TOKEN = "tok-de-prueba"; process.env.GITHUB_REPOSITORY = "prueba/repo"; process.env.GITHUB_SHA = "a".repeat(40);
process.env.REAL_VIEW_PASS = "clave-de-prueba"; process.env.HL_AGENT_KEY = "1".repeat(64); process.env.HL_WALLET = "0x" + "b".repeat(40);
import test from "node:test";
import assert from "node:assert/strict";
const { HL, mundo, conecta, silencio } = await import("./hl-mundo.mjs");

test("G8-1 · todas las firmas de una ronda llevan un nonce distinto y creciente, aunque el reloj no avance", async () => {
  const W = mundo({ eq: 1000, neto: 1000, px: { BTC: 100, ETH: 10 }, quiere: [{ c: "BTC", dir: 1 }, { c: "ETH", dir: 1 }] }); conecta(W);
  const nonces = []; HL.deps.firma = async (accion, nonce) => { nonces.push(nonce); return { r: "0x1", s: "0x2", v: 27 }; };
  const real = Date.now, fijo = real(); Date.now = () => fijo;   // el reloj «congelado»: todo en el mismo milisegundo
  try { await silencio(() => HL.ronda()); } finally { Date.now = real; }
  assert.ok(nonces.length >= 3, "abre y pone stops: varias firmas (" + nonces.length + ")");
  for (let i = 1; i < nonces.length; i++) assert.ok(nonces[i] > nonces[i - 1], `nonce ${i} no crece: ${nonces[i - 1]} → ${nonces[i]}`);
  assert.ok(HL.siguienteNonce(0) > nonces.at(-1), "y si el reloj retrocede, sigue creciendo");
});

test("G8-3 · si no se puede guardar el estado de la ronda, el proceso acaba en rojo (además del aviso)", async () => {
  const W = mundo({ eq: 1000, neto: 1000, px: { BTC: 100 }, quiere: [] }); conecta(W); W.guardarFalla = true;
  const antes = process.exitCode; process.exitCode = 0;
  try { await silencio(() => HL.ronda()); assert.equal(process.exitCode, 1); assert.ok(W.avisos.some((t) => /no he podido guardar el estado/.test(t))); }
  finally { process.exitCode = antes || 0; }
});
