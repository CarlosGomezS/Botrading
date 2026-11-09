// Descarga velas de 1 minuto de Bitvavo (API pública) y las guarda en CSV: Timestamp,Open,High,Low,Close,Volume
import { writeFileSync } from "node:fs";
const DIAS = +(process.env.DIAS || 365), MERC = (process.env.MERCADOS || "BTC-EUR,ETH-EUR").split(",");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const m of MERC) {
  const fin = Date.now(), ini = fin - DIAS * 864e5, filas = new Map(); let end = fin, n = 0;
  while (end > ini) {
    const start = Math.max(ini, end - 1440 * 60e3);
    let j = null;
    for (let t = 0; t < 6 && !j; t++) { try { const r = await fetch(`https://api.bitvavo.com/v2/${m}/candles?interval=1m&limit=1440&start=${start}&end=${end}`); if (r.ok) j = await r.json(); else await wait(2000 * (t + 1)); } catch { await wait(2000 * (t + 1)); } }
    if (!Array.isArray(j)) { console.log(m, "fallo en", new Date(end).toISOString()); break; }
    for (const c of j) filas.set(c[0], c);
    end = start; n++; if (n % 30 === 0) console.log(m, new Date(end).toISOString().slice(0, 10), filas.size);
    await wait(120);
  }
  const L = [...filas.values()].sort((a, b) => a[0] - b[0]).map((c) => `${new Date(c[0]).toISOString()},${c[1]},${c[2]},${c[3]},${c[4]},${c[5]}`);
  writeFileSync(`out/${m.replace("-", "_").toLowerCase()}_1m_bitvavo.csv`, "Timestamp,Open,High,Low,Close,Volume\n" + L.join("\n") + "\n");
  console.log(m, "velas:", L.length, "desde", L[0]?.slice(0, 16), "hasta", L.at(-1)?.slice(0, 16));
}
