// v1.0 · auditoría 2 (Gemini) · /parar de Telegram
import test from "node:test";
import assert from "node:assert/strict";
process.env.GITHUB_REPOSITORY = "yo/repo"; process.env.GITHUB_TOKEN = "t";
const TG = await import("../runner/telegram.mjs");

test("G4-1.3 · /parar solo se da por hecho si se ha guardado en TODOS los sitios (antes bastaba con uno)", () => {
  assert.equal(TG.todoGuardado("parar", true, false, true), false, "Bitvavo/OKX sin guardar → no dice «PARADO»");
  assert.equal(TG.todoGuardado("parar", true, true, false), false, "Hyperliquid sin parar → tampoco");
  assert.equal(TG.todoGuardado("parar", true, true, true), true); assert.equal(TG.todoGuardado("aprobar", true, false, false), true, "aprobar solo toca memes");
});

test("G4-1.3 · /parar también para Hyperliquid (lanza su flujo de ajustes con «parado») y reintenta si falla", async () => {
  const llamadas = []; let n = 0;
  const F = async (url, o) => { llamadas.push({ url, body: JSON.parse(o.body) }); return { status: ++n < 2 ? 500 : 204 }; };
  assert.equal(await TG.hlParar({ accion: "parar" }, F), true);
  assert.equal(llamadas.length, 2, "reintenta"); assert.match(llamadas[0].url, /workflows\/hl-ctl\.yml\/dispatches$/); assert.deepEqual(JSON.parse(llamadas[0].body.inputs.cambio), { estado: "parado" });
  assert.equal(await TG.hlParar({ accion: "seguir" }, async () => { throw new Error("no debe llamarse"); }), true, "/seguir no reanuda Hyperliquid solo");
});

test("G4-3 · candado de Telegram: si otro proceso ya está leyendo (etiqueta creada), este no lee; al terminar se suelta", async () => {
  process.env.GITHUB_SHA = "a".repeat(40); const vistas = []; let creada = false;
  const F = async (url, o = {}) => { vistas.push([o.method || "GET", url]); if (o.method === "POST") { if (creada) return { status: 422 }; creada = true; return { status: 201 }; } if (o.method === "DELETE") { creada = false; return { status: 204 }; } return { ok: true, json: async () => ({}) }; };
  const a = await TG.tgCandado(F), b = await TG.tgCandado(F);
  assert.equal(a.ok, true); assert.equal(b.ok, false, "el segundo no lee"); await a.suelta(); assert.equal((await TG.tgCandado(F)).ok, true, "suelto, el siguiente sí");
  assert.ok(vistas.some(([m, u]) => m === "POST" && /refs$/.test(u)));
});

test("G4-1.3 · en una copia de la app SIN Hyperliquid, /parar no se queda esperando por él", async () => {
  assert.equal(await TG.hlParar({ accion: "parar" }, async () => ({ status: 404 })), true);
});
