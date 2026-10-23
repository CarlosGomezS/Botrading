// Pruebas del vigilante intradía (v68): reglas de los métodos y actualización completa con un mercado sintético.
// Uso: node tests/vigilante.test.mjs
import fs from "fs"; import vm from "vm"; import test from "node:test"; import assert from "node:assert/strict";
import path from "path"; import { fileURLToPath } from "url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const code = html.match(/<script id="vigia-intradia">([\s\S]*?)<\/script>/)[1].replace(/try\{setTimeout\([\s\S]*$/, "");

test("regla de «acciones en juego»: solo compras, ruptura del rango, stop al 10 % del ATR", () => {
  const ctx = { Math, JSON, Object, Array, String, Number, isFinite, Infinity, Date, console }; vm.createContext(ctx);
  vm.runInContext(code + ";globalThis.T={viSip,viPrep,viSer,viRet,viNY,viUtc,VIM};", ctx); const T = ctx.T;
  assert.equal(JSON.stringify(T.viNY(Date.parse("2026-10-22T13:30:00Z"))), '{"d":"2026-10-22","m":0}');
  assert.equal(JSON.stringify(T.viNY(Date.parse("2026-01-15T14:30:00Z"))), '{"d":"2026-01-15","m":0}');
  assert.equal(new Date(T.viUtc("2026-11-02", 390)).toISOString(), "2026-11-02T21:00:00.000Z");
  const mk = (f) => { const x = T.viSer(); for (let i = 0; i < 390; i++) { const p = f(i); x.o[i] = p.o; x.c[i] = p.c; x.h[i] = Math.max(p.o, p.c) + 0.01; x.l[i] = Math.min(p.o, p.c) - 0.01; x.v[i] = 100; } return T.viPrep(x); };
  const univ = { f: {}, hv: {}, dly: {} }; for (const s of ["UP", "DN", "FLOP", "QUIET"]) { univ.f[s] = { o: 50, h: 51, l: 49, c: 50.5, v: s === "QUIET" ? 50 : 1000 }; univ.hv[s] = Array(14).fill(100); univ.dly[s] = { atr: 2, vol: 5e6 }; }
  const sd = {
    UP: mk((i) => ({ o: 50 + i * 0.02, c: 50 + (i + 1) * 0.02 })),            // sube todo el día: compra y vende al cierre con ganancia
    DN: mk((i) => ({ o: 50 - i * 0.02, c: 50 - (i + 1) * 0.02 })),            // la primera vela baja: NO opera (no hay cortos)
    FLOP: mk((i) => i < 10 ? { o: 50 + i * 0.05, c: 50 + (i + 1) * 0.05 } : { o: 50.5 - (i - 10) * 0.05, c: 50.5 - (i - 9) * 0.05 }), // rompe y se da la vuelta: stop
    QUIET: mk((i) => ({ o: 50 + i * 0.02, c: 50 + (i + 1) * 0.02 })),         // sin volumen raro: no la elige
  };
  const tr = T.viSip({ univ, sd }, 5), by = Object.fromEntries(tr.map((t) => [t.s, t]));
  assert.ok(!by.DN && !by.QUIET, "ni cortos ni acciones sin volumen raro"); assert.ok(tr.every((t) => t.side === 1));
  assert.equal(by.UP.outT, 390); assert.ok(by.UP.outPx > by.UP.inPx);
  assert.ok(Math.abs(by.FLOP.outPx - (by.FLOP.inPx - 0.2)) < 1e-9, "stop al 10 % del ATR (2 $ → 0,20 $)");
  assert.ok(tr.every((t) => t.w <= 0.05 + 1e-12), "máx. 5 % de la cuenta por acción");
  assert.ok(T.viRet([by.UP], true) < T.viRet([by.UP], false), "el cambio de divisa resta");
  const t60 = T.viSip({ univ, sd }, 60); assert.ok(t60.every((t) => t.inT >= 60), "con rango de 60 min no entra antes de las 10:30");
  assert.equal(Object.keys(T.VIM).length, 4);
});

test("actualización completa: rehace el año, guarda el día en curso y no repite", async () => {
// --- generador de mercado sintético ---
function rng(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}}
const SYMS=["SPY","QQQ","TQQQ",...Array.from({length:30},(_,i)=>"S"+i)];
const base={SPY:500,QQQ:450,TQQQ:70};SYMS.forEach((s,i)=>{if(!base[s])base[s]=20+i*3});
const dayN=s=>Math.floor(Date.parse(s)/864e5),dayS=n=>new Date(n*864e5).toISOString().slice(0,10);
function nthSun(y,m,n){const w=new Date(Date.UTC(y,m,1)).getUTCDay();return 1+((7-w)%7)+7*(n-1)}
function off(ms){const y=new Date(ms).getUTCFullYear(),a=Date.UTC(y,2,nthSun(y,2,2),7),b=Date.UTC(y,10,nthSun(y,10,1),6);return ms>=a&&ms<b?-4:-5}
const NOW=Date.parse("2026-10-23T18:45:00Z");
const cache={};
function dayBars(s,d){const k=s+d;if(cache[k])return cache[k];const r=rng(dayN(d)*97+s.split("").reduce((a,c)=>a+c.charCodeAt(0)*7,0));const lev=s==="TQQQ"?3:1;
 let p=base[s]*(1+0.0003*(dayN(d)-dayN("2025-01-01")))*(0.98+0.04*r());const out=[];const drift=(r()-0.5)*0.002;
 for(let m=-60;m<450;m++){const t=Date.parse(d+"T00:00:00Z")+(570+m)*60000;const utc=t-off(t+6*36e5)*36e5;const ch=(r()-0.5)*0.002*lev+drift*lev/390;const o=p;p=p*(1+ch);const h=Math.max(o,p)*(1+r()*0.0005),l=Math.min(o,p)*(1-r()*0.0005);out.push({t:new Date(utc).toISOString(),o,h,l,c:p,v:Math.round(1000+r()*5000*(m<5?(s==="S3"?20:3):1))})}
 return cache[k]=out}
const isTD=d=>{const w=new Date(d+"T12:00:00Z").getUTCDay();return w>0&&w<6&&d!=="2025-12-25"&&d!=="2026-07-03"};
let calls=0;
async function fetch(u){calls++;const q=new URL(u).searchParams,syms=q.get("symbols").split(","),tf=q.get("timeframe"),a=Date.parse(q.get("start")),b=Math.min(Date.parse(q.get("end")),NOW-15*60000);
 if(q.get("feed")==="sip"&&Date.parse(q.get("end"))>NOW-15*60000)return{ok:false,status:403,text:async()=>JSON.stringify({message:"subscription does not permit querying recent SIP data"})};
 const bars={};for(let n=Math.floor(a/864e5)-1;n<=Math.floor(b/864e5)+1;n++){const d=dayS(n);if(!isTD(d))continue;for(const s of syms){let B=dayBars(s,d).filter(x=>{const t=Date.parse(x.t);return t>=a&&t<=b});if(tf==="5Min"){const z=dayBars(s,d);const st=z.findIndex(x=>{const t=Date.parse(x.t);return t>=a});if(st<0)continue;const g=z.slice(st,st+5);if(!g.length||Date.parse(g[0].t)>b)continue;B=[{t:g[0].t,o:g[0].o,h:Math.max(...g.map(x=>x.h)),l:Math.min(...g.map(x=>x.l)),c:g[g.length-1].c,v:g.reduce((t,x)=>t+x.v,0)}]}if(B.length)(bars[s]=bars[s]||[]).push(...B)}}
 return{ok:true,status:200,text:async()=>JSON.stringify({bars,next_page_token:null})}}
const H={};for(const s of SYMS.slice(3)){const r=[];for(let n=dayN("2024-06-01");n<=dayN("2026-10-23");n++){const d=dayS(n);if(!isTD(d))continue;const p=base[s];r.push([n,p,p*1.03,p*0.97,p,2e6])}H[s]={r}}

  const ctx={console,Date:class extends Date{constructor(...a){super(...(a.length?a:[NOW]))}static now(){return NOW}static parse(x){return Date.parse(x)}static UTC(...a){return Date.UTC(...a)}},
   setTimeout:(f)=>f(),fetch,Math,JSON,Object,Array,String,Number,isFinite,Infinity,URL,encodeURIComponent,Promise,Error,
   S:{},save:async()=>{},hG:()=>H,MOM_UNI:SYMS.slice(3),readKeys:()=>({al:"id:sec"}),dayN,dayS,fd:d=>d,E:n=>n.toFixed(2)+" €",esc:x=>String(x),START:500,mask:x=>x,T0:()=>"2026-10-23",dl:()=>{},
   document:{getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null},localStorage:{getItem:()=>null,setItem:()=>{}},window:{}};
  vm.createContext(ctx); vm.runInContext(code + "\n;globalThis.__t={viUpdate,viStats,viSummaryTxt,viMd,VIM};", ctx); const T = ctx.__t;
  const r = await T.viUpdate({ budget: 1e12 }); const VX = ctx.S.vix;
  assert.equal(r.err, null); assert.ok(r.backfill); assert.ok(VX.days.length > 240 && VX.days.length < 270, "≈ un año de días de bolsa: " + VX.days.length);
  assert.equal(VX.days.at(-1).d, "2026-10-22"); assert.equal(VX.hoy.d, "2026-10-23"); assert.equal(VX.feed, "sip");
  for (const k of Object.keys(T.VIM)) assert.ok(VX.days.at(-1).r[k], "el método " + k + " tiene resultado");
  const st = T.viStats(VX); assert.ok(st.m.sip5.n > 300, "acciones en juego opera: " + st.m.sip5.n); assert.ok(isFinite(st.spy));
  assert.ok(JSON.stringify(VX).length < 400000, "estado pequeño");
  calls = 0; const r2 = await T.viUpdate({ budget: 1e12 }); assert.equal(r2.nuevos.length, 0); assert.ok(calls <= 6, "la 2.ª pasada solo pide lo de hoy: " + calls);
  assert.match(T.viSummaryTxt(VX), /Vigilante intradía/); assert.match(T.viMd(), /\| 1 \|/);
});
