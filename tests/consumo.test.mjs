// v1.0 · 🪶 consumo mínimo de GitHub Actions: GitHub bloqueó la copia (24/11/2026) por usarlo como un servidor encendido todo el día
// (cada prueba falla con el código anterior, en el que tres flujos se relanzaban a sí mismos en cadena las 24 horas)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const WF = (f) => readFileSync(new URL("../.github/workflows/" + f, import.meta.url), "utf8");

test("🪶 ningún flujo se relanza a sí mismo en cadena (antes: bot de cripto, valor en directo y laboratorio, las 24 h)", () => {
  for (const f of readdirSync(new URL("../.github/workflows/", import.meta.url)).filter((x) => x.endsWith(".yml"))) {
    const y = WF(f); assert.ok(!new RegExp(`actions/workflows/${f.replace(".", "\\.")}/dispatches`).test(y) && !/R="repos\/\$\{\{ github\.repository \}\}\/actions\/workflows\/[^"]*"[\s\S]*\$R\/dispatches/.test(y), f + " se relanza a sí mismo");
  }
});

test("🪶 horarios: cada 15 min el bot de cripto, el valor en directo solo con bolsa abierta (y cada 3 h el resto), laboratorios 4 al día, examen largo 1 al día", () => {
  assert.match(WF("meme.yml"), /cron: "2,17,32,47 \* \* \* \*"/); assert.doesNotMatch(WF("meme.yml"), /28\*60|saldo-vivo/);
  assert.match(WF("real-pulso.yml"), /cron: "\*\/15 7-20 \* \* 1-5"/); assert.match(WF("real-pulso.yml"), /cron: "5 \*\/3 \* \* \*"/);
  assert.match(WF("laboratorio.yml"), /cron: "23 3,8,13,18 \* \* \*"/);
  assert.match(WF("caza-lab.yml"), /cron: "23 1,7,13,19 \* \* \*"/); assert.match(WF("ia-lab.yml"), /cron: "3 2,8,14,20 \* \* \*"/);
  assert.match(WF("examen-largo.yml"), /cron: "41 5 \* \* \*"/); assert.match(WF("vigilante.yml"), /cron: "53 \* \* \* \*"/);
  assert.match(WF("telegram.yml"), /cron: "\*\/5 \* \* \* \*"/, "el botón de parar sigue cada 5 min");
});

test("🪶 el vigilante no relanza cadenas: solo lo que lleva mucho más que su horario sin hacerse", () => {
  const v = readFileSync(new URL("../runner/vigia.sh", import.meta.url), "utf8");
  assert.match(v, /"\$age" -ge 420 \] && ! busy laboratorio\.yml/); assert.match(v, /"\$age" -ge 240 \] && ! busy real-pulso\.yml/);
  assert.match(v, /"\$age" -ge 40 \] && ! busy meme\.yml/); assert.match(v, /"examen-largo\.yml:1560" "ia-lab\.yml:420" "caza-lab\.yml:420"/);
});
