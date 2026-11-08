// v317 · comprobación de las DOS estrategias que van a dinero real, con el tamaño real de cada compra (plazas) y sus comisiones
import { existsSync, readFileSync } from "node:fs";
import { agrupa, prepara, cartera, CORTE } from "./caza.mjs";
import { okx1h, funding, estrategias } from "./caza3.mjs";
const FILE = (process.env.LARGO_DIR || "/tmp/largo") + "/raw.json";
const raw = JSON.parse(readFileSync(FILE, "utf8")), DB = {}; for (const [m, c] of Object.entries(raw.m)) if (c && c.length > 50000) DB[m] = prepara(agrupa(c, 60));
const okc = await okx1h(), DO = {}; for (const [m, c] of Object.entries(okc)) DO[m] = prepara(c);
const FU = await funding([...new Set([...Object.keys(DB), ...Object.keys(DO)].map((m) => m.split("-")[0]))], Date.now() - 370 * 864e5);
const prueba = (nombre, D, fam, p, fees, plazas) => { const E = estrategias(D, FU).find((e) => e.fam === fam && JSON.stringify(e.p) === JSON.stringify(p)); if (!E) return console.log("no encontrada", nombre);
  const ms = Object.keys(D), t0 = Math.max(...ms.map((m) => D[m].T[0])), t1 = Math.min(...ms.map((m) => D[m].T[D[m].T.length - 1])), corte = t0 + (t1 - t0) * CORTE;
  for (const [fn, fee] of Object.entries(fees)) for (const k of plazas) { const a = cartera(E.tr, fee, t0, corte, k), b = cartera(E.tr, fee, corte, t1 + 1, k), c = cartera(E.tr, fee, t0, t1 + 1, k);
    console.log(`✔ ${nombre} · ${fn} · ${k} plazas (cada compra 1/${k}): entreno ${a.ret} % (${a.opsDia}/día, PF ${a.pf}, caída ${a.dd} %) · prueba ${b.ret} % (${b.opsDia}/día, PF ${b.pf}, caída ${b.dd} %) · AÑO ${c.ret} % caída ${c.dd} %`); } };
// OKX: 6 h, sin alcistas amontonados (la del +4,8 % / +7 %)
for (const [n, D] of [["OKX datos OKX", DO], ["OKX datos Bitvavo", DB]]) prueba(n, D, "🚀🐋 momento sin alcistas amontonados", { L: 6, H: 6, S: 6, top: 2, min: 0.04, filtro: false, fmax: 0.00002 }, { "0,10 %": 0.001 }, [2, 3, 4, 6, 12]);
// Bitvavo: 12 h, top 1, ≥ 2 % (la del +14 % / +44 % con límite)
for (const [n, D] of [["Bitvavo datos Bitvavo", DB], ["Bitvavo datos OKX", DO]]) prueba(n, D, "🚀 momento escalonado", { L: 12, H: 12, S: 1, top: 1, min: 0.02, filtro: false }, { "límite 0,15 %": 0.0015, "mercado 0,25 %": 0.0025 }, [1, 2, 4]);
