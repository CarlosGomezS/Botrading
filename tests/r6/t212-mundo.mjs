// Mundo de prueba: simulador de Trading 212 del proyecto + un PROXY delante que permite inyectar respuestas raras
// (200 con cuerpo vacío, etc.) en rutas concretas. No toca red real.
import http from "node:http";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { startMock } from "../mock-t212.mjs";
import { DEF, openAny } from "../../runner/real-cfg.mjs";

const RUNNER = new URL("../../runner", import.meta.url).pathname;
export const PW = "Prueba-Larga-2026!";

export async function world() {
  const mk = await startMock();
  const override = {};   // override[ruta] = { n: veces, status, body }
  const proxy = http.createServer((q, r) => {
    let body = ""; q.on("data", (c) => (body += c)); q.on("end", async () => {
      const u = new URL(q.url, "http://x"), p = u.pathname.replace("/api/v0", "");
      const ov = override[p];
      if (ov && ov.n > 0) { ov.n--; r.writeHead(ov.status || 200, { "Content-Type": "application/json" }); return r.end(ov.body ?? ""); }
      const rr = await fetch(`http://127.0.0.1:${mk.port}${q.url}`, { method: q.method, headers: { authorization: q.headers.authorization || "", "content-type": "application/json" }, body: body || undefined });
      const txt = await rr.text(); r.writeHead(rr.status, { "Content-Type": "application/json" }); r.end(txt);
    });
  });
  await new Promise((ok) => proxy.listen(0, "127.0.0.1", ok));
  const port = proxy.address().port;
  const dir = mkdtempSync(path.join(tmpdir(), "rev-t212-")), root = path.join(dir, "root"), run = path.join(root, "runner");
  mkdirSync(run, { recursive: true }); for (const f of ["real.mjs", "real-cfg.mjs"]) copyFileSync(path.join(RUNNER, f), path.join(run, f));
  let cfg = { ...DEF, on: 1, modo: "auto", limite: 100, minOrden: 10, maxPerdida: 20, acciones: 0, aceptoReal: 1 };
  const setCfg = (o) => { cfg = { ...cfg, ...o }; writeFileSync(path.join(root, "real-ajustes.json"), JSON.stringify(cfg)); }; setCfg({});
  let tgt = { d: "2026-10-01", w: { XLK: 1 / 3, XLE: 1 / 3, XLF: 1 / 3 }, bull: true };
  async function step(accion, now, extra = {}) {
    const S = { savedAt: 1, main: "sect", lastDate: new Date(Date.parse(now) - 864e5).toISOString().slice(0, 10), books: { sect: { cash: 0, pos: {}, trades: [], days: [{ d: "2026-10-01", eq: 500 }], tgt } } };
    writeFileSync(path.join(dir, "state.json"), JSON.stringify({ ls: { pb19: JSON.stringify(S) }, idb: {} }));
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, REAL_TEST: "1", REAL_NOW: now, T212_KEY: "k", T212_SECRET: "s", T212_BASE: `http://127.0.0.1:${port}/api/v0`, YH_BASE: `http://127.0.0.1:${mk.port}`, STOOQ_BASE: `http://127.0.0.1:${mk.port}`,
      LOCAL_DATA: path.join(dir, "state.json"), REAL_VIEW_PASS: PW, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: "", GITHUB_TOKEN: "", ...extra };
    if (existsSync(path.join(run, "real.json"))) env.LOCAL_REAL = path.join(run, "real.json");
    const out = await new Promise((ok) => execFile(process.execPath, ["real.mjs", accion], { cwd: run, env, timeout: 600000 }, (e, so, se) => ok({ code: e ? e.code || 1 : 0, so: String(so) + String(se) })));
    const R = existsSync(path.join(run, "real.json")) ? (await openAny(JSON.parse(readFileSync(path.join(run, "real.json"), "utf8")), [PW])).j : null;
    return { ...out, R, rep: R && R.reports[0] };
  }
  const posts = () => mk.calls.filter((c) => c.m === "POST");
  return { mk, K: mk.K, A: mk.A, override, step, setCfg, posts, close: async () => { await mk.close(); await new Promise((c) => proxy.close(c)); } };
}
