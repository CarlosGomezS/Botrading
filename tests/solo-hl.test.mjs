// v1.0 · 💧 la app es SOLO de Hyperliquid (27/11/2026)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const H = readFileSync(new URL("../index.html", import.meta.url), "utf8"), WF = (f) => new URL("../.github/workflows/" + f, import.meta.url);

test("menú de 4 pantallas: Real, Laboratorio, Informes y Ajustes (todo de Hyperliquid)", () => {
  assert.match(H, /const TABS=\[\["hxreal","💧","Real"\],\["hxlab","🤖","Laboratorio"\],\["hxinf","📋","Informes"\],\["hxaj","⚙️","Ajustes"\]\]/);
  for (const f of ["function real\\(\\)", "function lab\\(\\)", "function informes\\(\\)", "function ajustes\\(\\)"]) assert.match(H, new RegExp(f));
});
test("Real en vivo: valor, ganado, libre y por posición largo/corto, entrada, precio ahora, stop, cierre y método", () => {
  for (const t of ["En vivo", "ganado", "Libre", "▲ LARGO", "▼ CORTO", "entró ", "ahora <b", "🛑 ", "⏱ cierra", "🧪 "]) assert.ok(H.includes(t), t);
  assert.match(H, /hlI\(\{type:"clearinghouseState",user:w\}\),hlI\(\{type:"allMids"\}\),hlI\(\{type:"frontendOpenOrders",user:w\}\)/);
  assert.match(H, /\},5000\);/);
});
test("Laboratorio: podio de 3 y los 10 siguientes", () => { assert.match(H, /Los 10 siguientes/); assert.match(H, /\.slice\(0,10\)/); assert.match(H, /pod=apr\.slice\(0,3\)/); });
test("Informes: qué hace, errores y estado (claves y procesos)", () => {
  assert.match(H, /\[\["act","📜 Actividad"\],\["err","❌ Errores"\],\["ok","✅ Estado"\]\]/);
  for (const k of ["HL_WALLET", "HL_AGENT_KEY", "TELEGRAM_TOKEN", "TELEGRAM_CHAT", "REAL_VIEW_PASS"]) assert.ok(H.includes('["' + k + '"'), k);
});
test("ajuste de recarga en la app (sí/no) y se guarda como sí/no", () => { assert.match(H, /data-hlset="recarga:'\+v\+'"/); assert.match(H, /key==="esp"\|\|key==="recarga"\?v==="true"/); });
test("el bot ya no ejecuta Bitvavo ni OKX y sus flujos se han borrado", () => {
  const Y = readFileSync(WF("meme.yml"), "utf8"); assert.doesNotMatch(Y, /node runner\/bitvavo\.mjs/); assert.doesNotMatch(Y, /BITVAVO_KEY|OKX_KEY/);
  for (const f of ["cripto-ctl.yml", "cripto-lab.yml", "examen-largo.yml", "memes-bv.yml", "caza.yml", "velas-1m.yml"]) assert.ok(!existsSync(WF(f)), f);
  const V = readFileSync(new URL("../runner/vigia.sh", import.meta.url), "utf8"); assert.doesNotMatch(V, /bitvavo\.json/);
});
