// v1.0 · 🪙 CriptoBot (24/11/2026): la app es SOLO de cripto. Sin Trading 212 ni laboratorios de ETF/Acciones/Mixtos.
// (cada prueba falla con el código anterior)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
process.env.TELEGRAM_TOKEN = ""; process.env.GITHUB_TOKEN = "";
const hay = (f) => existsSync(new URL("../" + f, import.meta.url));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("🪙 no queda ningún proceso de Trading 212 ni del laboratorio de ETF", () => {
  for (const f of ["real", "real-pulso", "real-ajustes", "diag-t212", "laboratorio", "diario", "historico", "rebotes", "probar-avisos", "reiniciar"]) assert.ok(!hay(`.github/workflows/${f}.yml`), f + ".yml");
  for (const f of ["real", "diag-t212", "rebotes", "runner"]) assert.ok(!hay(`runner/${f}.mjs`), f + ".mjs");
  assert.ok(!hay("real-ajustes.json"));
  assert.doesNotMatch(readFileSync(new URL("../runner/vigia.sh", import.meta.url), "utf8"), /[^-]real\.yml|real-pulso|laboratorio\.yml|diario\.yml/);
});

test("🪙 la app se llama CriptoBot; la pestaña de cripto es «💶 Real» (se abre al entrar); el Laboratorio es SOLO de cripto; sin Ficticia ni Trading 212", () => {
  assert.match(html, /<title>CriptoBot<\/title>/); assert.doesNotMatch(html, /Bot Trading/);
  const s = html.match(/<script id="criptobot">([\s\S]*?)<\/script>/)[1];
  assert.match(s, /if\(t==="hoy"\|\|t==="real"\|\|b\.id==="rl-nav"\)b\.remove\(\)/); assert.match(s, /labCriptoHtml\(\)/); assert.match(s, /for\(const c of \[\.\.\.lab\.children\]\)if\(c!==d\)c\.hidden=true/);
  assert.match(s, /for\(const id of \["aj-real","aj-lab"\]\)/, "Ajustes sin Trading 212 ni laboratorio de ETF");
  assert.match(html, /const todo=\["tg","cripto","fin"\]/, "el asistente de claves ya no pide Trading 212");
  assert.doesNotMatch(html, /dispatch\(r,"real-ajustes\.yml"/, "guardar claves ya no lanza el flujo de Trading 212 (no existe)"); assert.match(s, /m\.innerHTML="<span>💶<\/span>Real"/); assert.match(s, /go\("memes"\)/);
  assert.match(html, /const SECS=\[\["parte","📰 Parte del día"\],\["graf","📈 Gráficas"\],\["err","⚠️ Errores"\],\["cripto","💶 Real \(cripto\)"\]/);
  assert.doesNotMatch(html, /caja\("🤖 ETF, Acciones y Mixtos"/);
});

test("🪙 Telegram: un botón antiguo de Trading 212 se contesta y NO bloquea un /parar que venga después", async () => {
  const T = await import("../runner/telegram.mjs"); const dicho = [], ctl = [];
  const ups = [{ update_id: 1, callback_query: { id: "q", from: { id: 5 }, data: "ap:abc", message: { chat: { id: 5 }, message_id: 9 } } }, { update_id: 2, message: { chat: { id: 5 }, from: { id: 5 }, text: "/parar" } }];
  await T.procesa(ups, { api: async () => ({}), say: async (c, t) => dicho.push(String(t)), memesCtl: async (o) => (ctl.push(o.accion), true), bvCtl: async () => true, CHAT: "5", USER: "" }).catch(() => {});
  assert.ok(dicho.some((t) => /era de Trading 212/.test(t))); assert.deepEqual(ctl, ["parar"], "el /parar se procesa");
});
