// v1.0 · R8 · las ideas nuevas del laboratorio de Hyperliquid (de estudios) NO miran al futuro: cambiar solo los datos posteriores no cambia ninguna señal anterior
import test from "node:test";
import assert from "node:assert/strict";
import { senales } from "../runner/caza-hl2.mjs";
const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function serie(seed, n) { const r = rng(seed), C = new Float64Array(n), Hi = new Float64Array(n), Lo = new Float64Array(n), V = new Float64Array(n), F = new Float64Array(n); let p = 100;
  for (let i = 0; i < n; i++) { const g = (r() - 0.5) * (i % 97 === 0 ? 0.2 : 0.02); p *= Math.exp(g); C[i] = p; Hi[i] = p * (1 + r() * 0.01); Lo[i] = p * (1 - r() * 0.01); V[i] = 1000 * (1 + (i % 89 === 0 ? 8 : r())); F[i] = (r() - 0.5) * 0.0004; }
  return { C, Hi, Lo, V, F }; }
const NUEVAS = ["Primeras horas predicen el final del día", "Giro tras liquidaciones", "BTC manda, la cripto sigue", "Ruptura del rango de Asia", "Tendencia en tres plazos", "Rebote tras un día extremo"];
test("R8 · las 6 familias nuevas existen, van al final y no miran al futuro", () => {
  const n = 1600, T = Array.from({ length: n }, (_, i) => Date.UTC(2026, 0, 1) + i * 3600e3), B = serie(1, n), d = serie(2, n);
  const S = senales({}), fams = new Set(S.map((s) => s.fam));
  for (const f of NUEVAS) assert.ok(fams.has(f), "falta " + f);
  const primera = S.findIndex((s) => NUEVAS.includes(s.fam)); assert.ok(S.slice(primera).every((s) => NUEVAS.includes(s.fam)), "las nuevas van al final (no mueven las antiguas)");
  let senalesVistas = 0;
  for (const s of S.filter((x) => NUEVAS.includes(x.fam))) {
    const o = s.fn(d, T, B); senalesVistas += o.reduce((a, x) => a + (x ? 1 : 0), 0);
    for (const j of [800, 1000, 1200, 1400]) {
      const d2 = { C: d.C.slice(), Hi: d.Hi.slice(), Lo: d.Lo.slice(), V: d.V.slice(), F: d.F.slice() }, B2 = { C: B.C.slice(), Hi: B.Hi.slice(), Lo: B.Lo.slice(), V: B.V.slice(), F: B.F.slice() };
      for (let i = j + 1; i < n; i++) { for (const z of [d2, B2]) { z.C[i] *= 1.7; z.Hi[i] *= 1.9; z.Lo[i] *= 0.6; z.V[i] *= 9; z.F[i] = -z.F[i]; } }
      const o2 = s.fn(d2, T, B2); for (let i = 0; i <= j; i++) assert.equal(o2[i], o[i], `${s.fam} ${JSON.stringify(s.p)}: la señal de la hora ${i} cambia si cambio lo posterior a ${j}`);
    }
  }
  assert.ok(senalesVistas > 0, "las familias nuevas generan alguna señal");
});
