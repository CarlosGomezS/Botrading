// v220 · 👑 LOS MEJORES TRADERS DEL MUNDO, EN DIRECTO: en Hyperliquid todas las posiciones son públicas en la cadena (no se pueden falsificar).
// Cada 6 h se lee su ranking y se eligen los ~40 que más ganan este mes (con ganancias también en el total, cuenta ≥ 500.000 $ y sin ser
// creadores de mercado de alta frecuencia). Cada 3 min se mira qué tienen abierto. Para cada cripto sale una «señal de los mejores»:
// de −1 (todos cortos) a +1 (todos largos), ponderada por el tamaño de sus posiciones. La IA de Bitvavo aprende SOLA si seguirles gana dinero.
const INFO = "https://api.hyperliquid.xyz/info", LB = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
export const TOP_N = 40, CADA_POS = 3 * 60000, CADA_TOP = 6 * 3600e3;
const r3 = (x) => Math.round(x * 1000) / 1000;
// nombre de Hyperliquid → nombre de Bitvavo (kPEPE = 1.000 PEPE, etc.)
export const moneda = (c) => String(c || "").replace(/^k(?=[A-Z])/, "").toUpperCase();
export function elegir(rows, n = TOP_N) {
  const w = (x, k) => { const p = (x.windowPerformances || []).find((v) => v[0] === k); return p ? p[1] : { pnl: 0, roi: 0, vlm: 0 }; };
  return rows.map((x) => ({ a: x.ethAddress, av: +x.accountValue || 0, mes: +w(x, "month").pnl || 0, roiMes: +w(x, "month").roi || 0, total: +w(x, "allTime").pnl || 0, vlm: +w(x, "month").vlm || 0, nombre: x.displayName || null }))
    .filter((x) => x.av >= 5e5 && x.mes > 0 && x.total > 0 && x.vlm / Math.max(1, x.av) < 300)
    .sort((a, b) => b.mes - a.mes).slice(0, n);
}
// posiciones → señal por cripto
export function senal(posiciones) {
  const S = {};
  for (const ps of posiciones) for (const p of ps || []) {
    const c = moneda(p.coin), v = +p.positionValue || 0, lado = +p.szi > 0 ? 1 : -1; if (!c || !(v > 0)) continue;
    const o = S[c] || (S[c] = { net: 0, abs: 0, nl: 0, ns: 0 }); o.net += lado * v; o.abs += v; if (lado > 0) o.nl++; else o.ns++;
  }
  const out = {}; for (const [c, o] of Object.entries(S)) out[c] = { s: r3(o.net / o.abs), nl: o.nl, ns: o.ns, v: Math.round(o.abs) }; return out;
}
export async function actualizar(HL, now = Date.now(), fx = fetch) {
  HL = HL || {}; const t = typeof now === "number" ? now : now.getTime();
  if (!HL.top || !HL.topAt || t - HL.topAt >= CADA_TOP) {
    try { const r = await fx(LB, { signal: AbortSignal.timeout(30000) }); const j = await r.json(); const top = elegir(j.leaderboardRows || j); if (top.length >= 10) { HL.top = top; HL.topAt = t; } } catch (e) { HL.err = "ranking: " + String(e.message).slice(0, 40); }
  }
  if (HL.top && (!HL.at || t - HL.at >= CADA_POS)) {
    const pos = []; let ok = 0;
    for (let i = 0; i < HL.top.length; i += 8) await Promise.all(HL.top.slice(i, i + 8).map(async (u) => { try { const r = await fx(INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "clearinghouseState", user: u.a }), signal: AbortSignal.timeout(10000) }); const j = await r.json(); pos.push((j.assetPositions || []).map((x) => x.position)); ok++; } catch (e) {} }));
    if (ok >= 5) { const prev = HL.snap || {}; HL.prev = prev; HL.snap = senal(pos); HL.at = t; HL.ok = ok; delete HL.err; }
  }
  return HL;
}
// historial (cada 10 min, 7 días) para que la IA pueda aprender del pasado
export function anotar(hist, snap, t, quedan = 7 * 86400e3) {
  hist = hist || {}; for (const [c, o] of Object.entries(snap || {})) (hist[c] || (hist[c] = [])).push([t, o.s]);
  for (const c of Object.keys(hist)) { hist[c] = hist[c].filter((x) => t - x[0] <= quedan); if (!hist[c].length) delete hist[c]; } return hist;
}
// valor de la señal en un momento dado (el último anotado antes, si no tiene más de 40 min)
export function enMomento(serie, t) {
  if (!serie || !serie.length) return null; let lo = 0, hi = serie.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m][0] <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  return k >= 0 && t - serie[k][0] <= 40 * 60000 ? serie[k][1] : null;
}
