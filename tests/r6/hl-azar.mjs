// Mundo de mentira para correr el laboratorio REAL de Hyperliquid (runner/caza-lab.mjs → lab()) sin red, con precios de PURO AZAR
// (paseo aleatorio sin tendencia, financiación 0). Ningún método puede tener ventaja real en estos datos.
const H = 3600e3;
const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const gauss = (r) => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export const COINS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "SUI", "AVAX", "LINK", "ADA", "LTC", "BNB", "TRX", "DOT", "NEAR", "APT", "ARB", "OP", "INJ", "TIA", "SEI", "WIF", "ENA", "AAVE", "UNI"];
export function mundo(seed = 1) {
  const fin = Math.floor(Date.now() / H) * H, ini = fin - 540 * 864e5 - 30 * 864e5, r = rng(seed), K = {};
  const nh = Math.round((fin - ini) / H), fac = new Float64Array(nh); for (let i = 0; i < nh; i++) fac[i] = 0.006 * gauss(r);
  COINS.forEach((c, j) => { const vol = 0.004 + 0.006 * r(), beta = j === 0 ? 1 : 0.5 + r(); let p = 10 + 100 * r(); const a = [];
    for (let i = 0; i < nh; i++) { const t = ini + i * H, o = p, ret = (j === 0 ? fac[i] - 0.5 * 0.006 ** 2 : beta * fac[i] + vol * gauss(r) - 0.5 * ((beta * 0.006) ** 2 + vol ** 2)); p = p * Math.exp(ret);   /* martingala: E[p(t+1)] = p(t), sin deriva a favor de largos ni de cortos */ const hi = Math.max(o, p) * (1 + Math.abs(0.002 * gauss(r))), lo = Math.min(o, p) * (1 - Math.abs(0.002 * gauss(r)));
      a.push({ t, o, h: hi, l: lo, c: p, v: 1000 + 1000 * r() }); }
    K[c] = a; });
  const st = { lab: null, vistas: null };
  const j = (x, s = 200) => ({ ok: s < 400, status: s, json: async () => x, text: async () => JSON.stringify(x), arrayBuffer: async () => x });
  const fetch = async (url, init = {}) => { const u = String(url), body = init.body ? JSON.parse(init.body) : null;
    if (u.includes("/caza-lab/caza-lab.json")) return st.lab ? j(JSON.parse(JSON.stringify(st.lab))) : j({}, 404);
    if (u.includes("/caza-lab/caza-vistas.bin")) return st.vistas ? j(st.vistas.buffer.slice(st.vistas.byteOffset, st.vistas.byteOffset + st.vistas.length)) : j({}, 404);
    if (u.includes("/ia-lab/ia-lab.json")) return j({});
    if (u.includes("okx.com")) return j({ data: [] });
    if (u.includes("api.hyperliquid.xyz/info")) {
      if (body.type === "metaAndAssetCtxs") return j([{ universe: COINS.map((c) => ({ name: c })) }, COINS.map((c, i) => ({ dayNtlVlm: String(1e9 - i * 1e6) }))]);
      if (body.type === "candleSnapshot") { const { coin, startTime, endTime } = body.req; return j(K[coin].filter((x) => x.t >= startTime && x.t < endTime).map((x) => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v }))); }
      if (body.type === "fundingHistory") { const out = []; for (let t = Math.ceil(body.startTime / H) * H; t < fin; t += H) out.push({ time: t, fundingRate: "0" }); return j(out); }
    }
    throw new Error("sin red en la prueba: " + u.slice(0, 60)); };
  return { st, fetch };
}
