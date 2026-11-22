// v1.0 · A2 · auditoría propia: una orden que tuvo que «esperar» (otra anterior de ese activo sin aclarar) no da la revisión por terminada.
// (Las compras ya se reintentaban porque «lo que falte» se compra siempre; el caso real es una VENTA de reducción que tuvo que esperar.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("A2 · R.applied solo se marca si ninguna orden quedó esperando, aplazada, omitida o con error", () => {
  const s = readFileSync(new URL("../runner/real.mjs", import.meta.url), "utf8");
  assert.match(s, /const espera = res\.filter\(\(x\) => x\.estado === "esperando"\);\n\s*if \(!bad\.length && !later\.length && !omit\.length && !espera\.length\) R\.applied = \{/);
  assert.match(s, /skip\("esperando",/, "las órdenes bloqueadas se marcan como «esperando»");
});
