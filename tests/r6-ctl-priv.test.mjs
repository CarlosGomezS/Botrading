// v1.0 · R6-10 · revisión independiente: el capital de dinero real y tus criptos («conservar») ya no se publican en claro en la rama pública bitvavo-ctl
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt } from "../runner/real-cfg.mjs";
import { abreCtl, cierraCtl, separa } from "../runner/ctl-priv.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PW = "clave-de-prueba";
const corre = (dir, cambio, extra = {}) => execFileSync("node", [path.join(ROOT, "runner/cripto-ctl.mjs")], { cwd: dir, env: { PATH: process.env.PATH, BV_LOCAL: dir, CAMBIO: JSON.stringify(cambio), ...extra }, stdio: "pipe" });
const publicado = (dir) => readFileSync(path.join(dir, readdirSync(dir).find((x) => x.startsWith("bitvavo-ctl__"))), "utf8");

test("R6-10 · cripto-ctl guarda el capital y tus criptos CIFRADOS (no en claro) y se pueden volver a leer con la contraseña", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bvctl-"));
  const enc = await encrypt(JSON.stringify({ capital: 4321, conservar: "BTC,SOL" }), PW);
  corre(dir, { cuenta: "bitvavo", on: true, enc }, { REAL_VIEW_PASS: PW });
  const txt = publicado(dir);
  assert.ok(!txt.includes("4321"), "el capital no puede aparecer en claro"); assert.ok(!/"SOL"/.test(txt), "tus criptos no pueden aparecer en claro");
  const c = await abreCtl(JSON.parse(txt), PW);
  assert.equal(c.cuentas.bitvavo.capital, 4321); assert.deepEqual(c.cuentas.bitvavo.conservar, ["BTC", "SOL"]); assert.equal(c.cuentas.bitvavo.on, true);
});

test("R6-10 · sin contraseña NO se escribe nada privado (ni en claro ni de ninguna forma)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bvctl-"));
  assert.throws(() => corre(dir, { cuenta: "bitvavo", capital: 4321 }));
  assert.ok(!readdirSync(dir).some((x) => x.startsWith("bitvavo-ctl__")), "no se publica nada");
});

test("R6-10 · un ctl.json antiguo con el capital en claro se sigue leyendo y al guardarlo desaparece del texto", async () => {
  const viejo = { copia: "mix", parado: false, capital: 77, cuentas: { okx: { on: true, capital: 555, conservar: ["ETH"] } } };
  const c = await abreCtl(viejo, PW); assert.equal(c.cuentas.okx.capital, 555);
  const pub = await cierraCtl(c, PW), txt = JSON.stringify(pub);
  assert.ok(!txt.includes("555") && !txt.includes("ETH") && !/"capital"/.test(txt));
  const de = await abreCtl(pub, PW); assert.equal(de.capital, 77); assert.equal(de.cuentas.okx.capital, 555); assert.equal(de.cuentas.okx.on, true);
});

test("R6-10 · sin poder descifrar, el bot no opera y al guardar conserva el «priv» que había sin tocarlo", async () => {
  const pub = await cierraCtl({ cuentas: { okx: { on: true, capital: 9 } } }, PW);
  const sin = await abreCtl(pub, "otra"); assert.equal(sin.privOk, false); assert.equal(sin.cuentas.okx.capital, undefined);
  const otra = await cierraCtl({ ...sin, parado: true }, "otra", pub.priv); assert.deepEqual(otra.priv, pub.priv); assert.equal(otra.parado, true);
  assert.deepEqual(separa({ a: 1 }).priv, { cuentas: {} });
});

test("R6-10 · la app manda el capital cifrado y el flujo tiene la contraseña para abrirlo", () => {
  const idx = readFileSync(path.join(ROOT, "index.html"), "utf8"), y = readFileSync(path.join(ROOT, ".github/workflows/cripto-ctl.yml"), "utf8");
  assert.match(idx, /inputs:\{cambio:JSON\.stringify\(await bvCambioCifrado\(cambio\)\)\}/);
  assert.match(idx, /o\.enc=await encrypt\(JSON\.stringify\(priv\),pw\)/);
  assert.match(y, /REAL_VIEW_PASS: \$\{\{ secrets\.REAL_VIEW_PASS \}\}/);
});
