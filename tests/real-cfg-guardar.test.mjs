// v1.0 · auditoría 2 (Gemini) · guardar ajustes de Trading 212 sin pisar los anteriores
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const RC = await import("../runner/real-cfg.mjs"), CLI = new URL("../runner/real-cfg.mjs", import.meta.url).pathname;
const corre = (file, env) => spawnSync(process.execPath, [CLI, file], { env: { ...process.env, ...env }, encoding: "utf8" });

test("G4-2.1 · si los ajustes guardados no se pueden descifrar, NO se guarda nada (antes volvían a los de fábrica)", async () => {
  const d = mkdtempSync(path.join(tmpdir(), "cfg-")), f = path.join(d, "real-ajustes.json");
  writeFileSync(f, JSON.stringify({ enc: 1, v: 1, ...(await RC.encrypt(JSON.stringify({ limite: 777 }), "vieja")) })); const antes = readFileSync(f, "utf8");
  const r = corre(f, { REAL_VIEW_PASS: "nueva", REAL_VIEW_PASS_OLD: "", REAL_JSON: JSON.stringify({ metodo: "sect" }) });
  assert.notEqual(r.status, 0, "falla"); assert.match(r.stderr, /no guardo nada/); assert.equal(readFileSync(f, "utf8"), antes, "el archivo no se toca");
  const r2 = corre(f, { REAL_VIEW_PASS: "nueva", REAL_VIEW_PASS_OLD: "vieja", REAL_JSON: JSON.stringify({}) }); assert.equal(r2.status, 0, r2.stderr);
  const g = JSON.parse(await RC.decrypt(JSON.parse(readFileSync(f, "utf8")), "nueva")); assert.equal(g.limite, 777, "con la contraseña anterior sí se leen y se conservan");
  const f2 = path.join(d, "nuevo.json"), r3 = corre(f2, { REAL_VIEW_PASS: "nueva", REAL_JSON: "{}" }); assert.equal(r3.status, 0, "sin ajustes previos se parte de cero");
});
