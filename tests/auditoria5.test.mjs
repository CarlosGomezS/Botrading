// v1.0 · auditoría 5 (Gemini, proyecto completo) · cada prueba falla con el código anterior
// (la de «guardar antes de enviar» en Trading 212 está en engine.test.mjs: «G7-1 · guardado final fallido…»)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.GITHUB_REPOSITORY = "yo/repo"; process.env.GITHUB_TOKEN = "t";
const RL = await import("../runner/bitvavo-real.mjs");
const TG = await import("../runner/telegram.mjs");
const err = (msg, o = {}) => Object.assign(new Error(msg), o);

test("G7-2 · un error raro DESPUÉS de mandar la compra bloquea ese activo (antes, si no estaba en la lista, no)", () => {
  assert.equal(RL.esDudosa(err("Unexpected token < in JSON at position 0")), true, "respuesta mal formada");
  assert.equal(RL.esDudosa(err("Cannot read properties of undefined (reading 'filledAmount')")), true, "fallo nuestro al leer la respuesta");
  assert.equal(RL.esDudosa(err("connection reset by peer")), true);
  assert.equal(RL.esDudosa(err("OKX 200 · código 50001 · ocupado", { status: 200, code: "50001" })), true, "OKX ocupado: puede haberse hecho");
  assert.equal(RL.esDudosa(err("demasiadas peticiones", { status: 429 })), true);
});

test("G7-2 · los rechazos claros del exchange NO bloquean (se puede reintentar más tarde)", () => {
  assert.equal(RL.esDudosa(err("Bitvavo 400 · código 216 · saldo insuficiente", { status: 400, code: 216 })), false);
  assert.equal(RL.esDudosa(err("OKX 200 · código 51008 · saldo insuficiente", { status: 200, code: "51008" })), false);
  assert.equal(RL.esDudosa(err("no está en OKX")), false); assert.equal(RL.esDudosa(err("la compra no se ejecutó")), false);
  assert.equal(RL.esDudosa(null), false);
});

test("G7-2 · con el envoltorio: tras un error raro, la segunda compra de ese activo no se manda", async () => {
  const DUD = {}; let n = 0;
  const X = RL.conDudosas({ comprar: async () => { n++; throw err("Unexpected end of JSON input"); } }, DUD, Date.now());
  await assert.rejects(X.comprar("A-EUR", 10)); await assert.rejects(X.comprar("A-EUR", 10));
  assert.equal(n, 1, "solo se mandó una vez"); assert.ok(DUD["A-EUR"] && DUD["A-EUR"].compra, "queda bloqueada como compra dudosa");
});

test("G7-4 · /parar de Bitvavo/OKX: si GitHub responde 409 (otro guardado a la vez), relee el archivo y lo guarda con el sha nuevo", async () => {
  const puts = []; let get = 0;
  const F = async (url, o = {}) => {
    if ((o.method || "GET") === "GET") { get++; return { ok: true, json: async () => ({ sha: "sha" + get, content: Buffer.from(JSON.stringify({ copia: "mix", parado: false })).toString("base64") }) }; }
    const b = JSON.parse(o.body); puts.push(b); return b.sha === "sha1" ? { ok: false, status: 409 } : { ok: true, status: 200 };
  };
  assert.equal(await TG.bvCtl({ accion: "parar" }, F), true);
  assert.equal(puts.length, 2, "reintenta tras el 409"); assert.equal(puts[1].sha, "sha2", "con el sha releído");
  assert.equal(JSON.parse(Buffer.from(puts[1].content, "base64").toString()).parado, true);
});

test("G7-3 · la app no se recarga sola mientras tienes desplegado algo que abriste para leer", () => {
  const s = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(s, /if\(!busy&&!sigueLeyendo\(\)&&Date\.now\(\)-idleAt>10000/);
  assert.match(s, /function sigueLeyendo\(\)\{leyendo=leyendo\.filter\(function\(d\)\{return d\.isConnected&&d\.open\}\)/);
});
