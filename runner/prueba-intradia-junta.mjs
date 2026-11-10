import { readdirSync, readFileSync } from "node:fs";
const R = []; for (const f of readdirSync("res", { recursive: true })) if (String(f).endsWith(".json")) R.push(...JSON.parse(readFileSync("res/" + f, "utf8")));
const P = (x) => (x * 100).toFixed(1) + "%";
console.log("filas", R.length, "monedas", new Set(R.map((r) => r.ex + r.c)).size);
for (const ex of ["bitvavo", "okx"]) for (const m of ["1-reversion15m", "2-ruptura1H", "3-vwapNY"]) { const X = R.filter((r) => r.ex === ex && r.met === m && r.n >= 10);
  const pos = X.filter((r) => r.ret > 0), ambos = X.filter((r) => r.ret > 0 && r.ret6m > 0 && r.dd < 0.3), med = X.map((r) => r.ret).sort((a, b) => a - b)[Math.floor(X.length / 2)];
  console.log(`== ${ex} ${m}: monedas con >=10 ops ${X.length} · ganan 12m ${pos.length} · ganan 12m y 6m con caida<30% ${ambos.length} · mediana ${P(med || 0)}`);
  for (const r of ambos.sort((a, b) => b.ret - a.ret).slice(0, 12)) console.log(`   ${r.c.padEnd(8)} ops ${r.n} acierto ${P(r.gan)} 12m ${P(r.ret)} caida ${P(r.dd)} 6m ${P(r.ret6m)} (${r.n6m}) mantener ${P(r.bh)}`); }
