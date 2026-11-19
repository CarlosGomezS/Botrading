// v1.0 · 🔒 las acciones de GitHub que ejecutan los bots van fijadas por su código exacto (no por una etiqueta que se puede mover)
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
test("workflows · cada «uses:» va fijado a un commit de 40 caracteres", () => {
  const dir = new URL("../.github/workflows/", import.meta.url), malas = [];
  for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) for (const [i, l] of readFileSync(new URL(f, dir), "utf8").split("\n").entries()) {
    const m = l.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/); if (m && !/@[0-9a-f]{40}$/.test(m[1])) malas.push(`${f}:${i + 1} ${m[1]}`); }
  assert.deepEqual(malas, []);
});
