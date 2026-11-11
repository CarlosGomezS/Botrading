// v422 · Copia las claves COMUNES (datos de precios e IA) de este repositorio a otro tuyo (otra copia de la app).
// Nunca copia claves personales (Trading 212, Bitvavo, OKX, Telegram, contraseña de la cartera). En el registro solo salen NOMBRES.
import sodium from "libsodium-wrappers";
const COMUNES = ["ALPACA_KEY", "TWELVEDATA_KEY", "POLYGON_KEY", "ALPHAVANTAGE_KEY", "FMP_KEY", "GEMINI_KEY", "GROQ_KEY", "OPENROUTER_KEY"];
const TOK = (process.env.DESTINO_TOKEN || "").trim(), DEST = (process.env.DESTINO || "").trim();
if (!TOK) { console.log("❌ Falta DESTINO_TOKEN (el token de GitHub con acceso al repositorio de destino)."); process.exit(1); }
if (!/^[\w.-]+\/[\w.-]+$/.test(DEST)) { console.log("❌ Repositorio de destino no válido."); process.exit(1); }
await sodium.ready;
const H = { Authorization: "Bearer " + TOK, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, B = `https://api.github.com/repos/${DEST}/actions/secrets`;
const pk = await fetch(B + "/public-key", { headers: H });
if (!pk.ok) { console.log(`❌ El token no puede leer la clave pública de ${DEST} (HTTP ${pk.status}): necesita acceso a ese repositorio con «Secrets: Read and write».`); process.exit(1); }
const { key, key_id } = await pk.json(), K = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
let ok = 0, ko = 0;
for (const n of COMUNES) { const v = (process.env[n] || "").trim(); if (!v) { console.log(`· ${n}: no la tienes puesta, se salta`); continue; }
  const enc = sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(v), K), sodium.base64_variants.ORIGINAL);
  const r = await fetch(`${B}/${n}`, { method: "PUT", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ encrypted_value: enc, key_id }) });
  if (r.status === 201 || r.status === 204) { ok++; console.log(`✔ ${n} copiada a ${DEST}`); } else { ko++; console.log(`✖ ${n}: HTTP ${r.status}`); } }
console.log(`Hecho: ${ok} copiadas${ko ? `, ${ko} con error` : ""}.`); if (ko && !ok) process.exit(1);
