// v1.0 · auditoría 2 (Gemini) · bitvavo.mjs: guardado y orden de la vuelta
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const SRC = readFileSync(new URL("../runner/bitvavo.mjs", import.meta.url), "utf8");

test("G4-1.4 · si no se puede guardar el estado real o tus ajustes, se LANZA el error (antes se tragaba)", async () => {
  process.env.GITHUB_REPOSITORY = "nadie/no-existe"; process.env.GITHUB_TOKEN = "x"; delete process.env.BV_LOCAL;
  const cwd = process.cwd(), d = mkdtempSync(path.join(tmpdir(), "pub-")); process.chdir(d);
  try { const B = await import("../runner/bitvavo.mjs?g=" + Date.now());
    assert.ok(B.RAMAS_CRITICAS.has("bitvavo-ctl") && B.RAMAS_CRITICAS.has("bitvavo-real") && B.RAMAS_CRITICAS.has("okx-real"));
    assert.throws(() => B.publicar("ctl.json", { parado: true }, "bitvavo-ctl"), /no he podido guardar ctl\.json/);
    assert.doesNotThrow(() => B.publicar("bitvavo.json", { x: 1 }, "bitvavo"), "lo ficticio no corta nada");
  } finally { process.chdir(cwd); }
});

test("G4-1.4 · el dinero real va al PRINCIPIO de la vuelta (ya no se salta por vuelta larga) y su fallo se cuenta", () => {
  const i = SRC.indexOf("await RL.paso("), j = SRC.indexOf("Señales ahora (OKX:"), k = SRC.indexOf("tortJob");
  assert.ok(i > 0 && i < j && i < k, "antes de los laboratorios y de recalcular las Tortugas");
  assert.equal(SRC.split("await RL.paso(").length - 1, 1, "una sola vez"); assert.ok(!/vuelta larga, espera a la siguiente/.test(SRC));
  assert.match(SRC, /if \(REAL_FALLO\) process\.exitCode = 1/);
});
