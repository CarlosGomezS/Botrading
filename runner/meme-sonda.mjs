// sonda temporal: enseña la forma de las respuestas de RugCheck y GeckoTerminal para una moneda nueva (sin secretos)
const J = async (u) => { const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "bot-trading-memes" } }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, t: t.slice(0, 300) }; } };
const shape = (o, d = 0) => { if (Array.isArray(o)) return o.length ? [shape(o[0], d + 1), "len=" + o.length] : []; if (o && typeof o === "object") { if (d > 3) return "{…}"; const r = {}; for (const [k, v] of Object.entries(o)) r[k] = shape(v, d + 1); return r; } return typeof o === "string" ? (o.length > 40 ? "str" : o) : o; };
const p = await J("https://api.dexscreener.com/token-profiles/latest/v1");
const sol = (p.j || []).filter((x) => x.chainId === "solana").map((x) => x.tokenAddress);
const pr = await J(`https://api.dexscreener.com/tokens/v1/solana/${sol.slice(0, 10).join(",")}`);
const pair = (pr.j || []).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
console.log("PAIR", pair && pair.baseToken.address, pair && pair.pairAddress, pair && pair.dexId);
const rc = await J(`https://api.rugcheck.xyz/v1/tokens/${pair.baseToken.address}/report`);
console.log("RUGCHECK status", rc.s); console.log(JSON.stringify(shape(rc.j || rc.t)).slice(0, 6000));
console.log("RISKS", JSON.stringify((rc.j && rc.j.risks) || []).slice(0, 1500));
const rs = await J(`https://api.rugcheck.xyz/v1/tokens/${pair.baseToken.address}/report/summary`);
console.log("SUMMARY status", rs.s, JSON.stringify(shape(rs.j || rs.t)).slice(0, 1500));
const gt = await J(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair.pairAddress}/trades`);
console.log("GECKO status", gt.s, JSON.stringify(shape(gt.j || gt.t)).slice(0, 2000));
