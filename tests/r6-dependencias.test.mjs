// v1.0 · R6-13 · las librerías que se instalan en flujos con claves no pueden traer versiones nuevas sin control ni ejecutar código al instalarse
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const W = new URL("../.github/workflows/", import.meta.url);
test("R6-13 · toda instalación de npm en los flujos fija la fecha de las versiones (--before) y, donde hay claves, sin scripts de instalación", () => {
  for (const f of readdirSync(W).filter((x) => x.endsWith(".yml"))) {
    for (const l of readFileSync(new URL(f, W), "utf8").split("\n").filter((l) => /npm (i|install)\b/.test(l) && !/^\s*#/.test(l))) {
      assert.match(l, /--before=\d{4}-\d{2}-\d{2}/, `${f}: npm sin --before → ${l.trim().slice(0, 90)}`);
      if (/ethers|libsodium/.test(l)) assert.match(l, /--ignore-scripts/, `${f}: con claves y sin --ignore-scripts`);
    }
  }
});
