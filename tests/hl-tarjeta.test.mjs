// v1.0 · la tarjeta de arriba de Hyperliquid tiene que enseñar lo MISMO que el panel (el saldo en vivo si se tiene)
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { crea, declaracion } from "./etf-lab-carga.mjs";

test("Hyperliquid · la tarjeta usa el saldo en vivo de la misma cartera; si no lo hay, el guardado por el bot", () => {
  const { hlTarjeta } = crea(["hlTarjeta"]).__X, R = { w: "a", eq: 61.45, neto: 58 };
  assert.equal(hlTarjeta(R, { w: "a", eq: 115.82 }).eq, 115.82, "con el depósito ya hecho, arriba también 115,82");
  assert.equal(hlTarjeta(R, { w: "a", eq: 115.82 }).neto, 58, "lo demás no cambia");
  assert.equal(hlTarjeta(R, null).eq, 61.45); assert.equal(hlTarjeta(R, { w: "b", eq: 9 }).eq, 61.45, "otra cartera no vale");
  assert.equal(hlTarjeta(R, { w: "a", eq: null }).eq, 61.45); assert.equal(hlTarjeta(null, { w: "a", eq: 1 }), null);
});

test("Hyperliquid · la fila de arriba (Bitvavo · OKX · Hyperliquid) pasa por hlTarjeta", () => {
  assert.match(declaracion("bvExchanges").txt, /H=hlTarjeta\(\(MM\.hlX\|\|\{\}\)\.R,MM\.hlV\)/);
});

test("Hyperliquid · con Bitvavo u OKX en pantalla se refresca solo la cifra de la tarjeta", async () => {
  const sp = { textContent: "$61,45" }, MM = {};
  const ctx = crea(["hlVivoTarjeta"], { MM, hlInfo: async () => ({ marginSummary: { accountValue: "115.82" }, assetPositions: [] }), document: { querySelector: () => sp } });
  await ctx.__X.hlVivoTarjeta({ w: "a" }, "a");
  assert.equal(MM.hlV.eq, 115.82); assert.equal(MM.hlV.w, "a"); assert.equal(sp.textContent, "$115,82"); assert.equal(MM.hlVB, 0);
  const ctx2 = crea(["hlVivoTarjeta"], { MM: {}, hlInfo: async () => ({ marginSummary: {} }), document: { querySelector: () => sp } });
  sp.textContent = "$61,45"; await ctx2.__X.hlVivoTarjeta({ w: "a" }, "a"); assert.equal(sp.textContent, "$61,45", "un saldo raro no se pinta");
});

test("Hyperliquid · al cargar los datos se pide ya el saldo en vivo (sin esperar 10 s)", () => {
  assert.match(declaracion("bvRealLoad").txt || "", /finally\{MM\.bvBusy=false;[\s\S]*setTimeout\(\(\)=>\{try\{hlVivo\(\)\}catch\(e\)\{\}\},400\)/);
});

const HAY_BOT = existsSync(new URL("../runner/hl-real.mjs", import.meta.url));   // (la copia sin bot de Hyperliquid no lo tiene)
test("Hyperliquid · la app calcula lo ingresado IGUAL que el bot (también los ingresos por traspaso)", { skip: !HAY_BOT }, async () => {
  process.env.HL_WALLET ??= "0x" + "b".repeat(40);
  const BOT = await import("../runner/hl-real.mjs"), { hlNeto } = crea(["hlUsdc", "hlNeto"]).__X, YO = "0x" + "b".repeat(40), O = "0x" + "c".repeat(40);
  const L = (d) => ({ delta: d }), casos = [
    [L({ type: "deposit", usdc: "57.995289" }), L({ type: "send", user: O, destination: YO, token: "USDC", amount: "54.38" })],
    [L({ type: "deposit", usdc: "58" }), L({ type: "withdraw", usdc: "8" }), L({ type: "accountClassTransfer", usdc: "5", toPerp: true })],
    [L({ type: "spotTransfer", user: O, destination: YO, token: "PURR", amount: "9", usdcValue: "9" }), L({ type: "internalTransfer", user: YO, destination: O, usdc: "3" }), L({ type: "subAccountTransfer", user: O, destination: YO, usdc: "4" })]];
  for (const c of casos) assert.equal(hlNeto(c, YO), BOT.netoIngresado(c, YO));
  assert.equal(Math.round(hlNeto(casos[0], YO) * 100) / 100, 112.38);
});
