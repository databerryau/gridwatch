// GRIDWATCH headless harness (Node, CommonJS). Not loaded by the game.
//
// Loads the inline <script> of index.html with a stub DOM and a seeded Math.random,
// and exposes the sim so scripted policies can drive tick() directly.
//
//   const {load} = require('./harness.js');
//   const G = load({seed: 42});            // fresh game instance, schedule() already called
//   const r = G.runToEnd(policy);           // policy(G) is called before every tick
//   // r = {black, grade, money, cmp, unserved, co2, worstDev, maxPrice, outT, t, endClock, ...}
//
// load({seed, file}): `file` defaults to ../index.html (the live game), or $GRIDWATCH_HTML.
// G.S (live state), G.F (fleet array; F[i].set / starting / on / out), G.FU (fleet by id),
// G.logs (array of {t, clock, cls, msg}), helpers G.hourNow(), G.demandF(h), G.solarClear(h),
// G.capE(u), G.minE(u), G.startUnit(id), G.stopUnit(id), G.callDR(), G.toggleDiesel(on).
// One tick = 0.2 sim-min = 100 ms real at 1x. Every load() is an isolated game (own closure
// and own seeded RNG), so many can run in one process and runs are deterministic per seed.
'use strict';
const fs = require('fs'), path = require('path');
const GAME = process.env.GRIDWATCH_HTML || path.join(__dirname, '..', 'index.html');

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function makeStub(){
  const fn=function(){return stub;};
  const stub=new Proxy(fn,{
    get(t,p){
      if(p===Symbol.toPrimitive)return ()=>0;
      if(p==='length')return 0;
      if(p==='then')return undefined;
      if(p==='children')return {length:0};
      if(p==='contains')return ()=>true;
      return stub;
    },
    set(){return true;},
    apply(){return stub;},
    construct(){return stub;},
  });
  return stub;
}

// Same ladder as endShift() in index.html (L576-584). Exported so tools can grade mid-run.
function gradeOf(S, black){
  const cmp=100*S.okTicks/Math.max(S.ticks,1);
  if(black)return 'F';
  if(S.unserved===0&&cmp>=97&&S.money>=8e6)return 'S';
  if(S.unserved<20&&cmp>=93&&S.money>=5.5e6)return 'A';
  if(S.unserved<100&&cmp>=86&&S.money>=3e6)return 'B';
  if(S.unserved<400&&cmp>=72&&S.money>0)return 'C';
  return 'D';
}

// Weather class of the day, fixed by schedule(): heatwave if w<.5, storm if .5-.8, else calm.
function weatherClass(G){
  const S=G.S;
  if(S.heat.t1>0)return 'heat';
  return S.ev.some(e=>/STORM/.test(e.fn.toString()))?'storm':'calm';
}

function load(opts={}){
  const file=opts.file||GAME;
  const html=fs.readFileSync(file,'utf8');
  const m=html.match(/<script>([\s\S]*)<\/script>/);
  if(!m)throw new Error('no inline <script> in '+file);
  // drop the trailing top-level first paint; rendering is stubbed out below
  const src=m[1].replace(/\ndraw\(\);ui\(\);\s*$/,'\n');
  const stub=makeStub();
  const rng=mulberry32(opts.seed==null?1:opts.seed);
  const M=Object.create(Math);M.random=rng;
  const logs=[];
  const doc={getElementById:()=>stub,createElement:()=>stub,querySelector:()=>stub,
    querySelectorAll:()=>[],addEventListener:()=>{},hidden:false};
  const win={devicePixelRatio:1,addEventListener:()=>{}};
  const exportsCode=`
;return {
  get S(){return S;}, F, FU, DTS, TUT,
  tick, schedule, freshState, tripUnit, icTrip, endShift, hourNow, demandF, demBase,
  solarClear, priceOf, capE, minE, clock, heatMod, tutGo,
  setDraw(f){draw=f;}, setUi(f){ui=f;}, setLog(f){log=f;}, setBeep(f){beep=f;},
  setRenderDock(f){renderDock=f;}, setEndShift(f){endShift=f;}, setTutTick(f){tutTick=f;},
  get tutStep(){return tutStep;},
};`;
  const factory=new Function('document','window','Math','setInterval','setTimeout',
    'requestAnimationFrame','localStorage','getComputedStyle',src+exportsCode);
  const G=factory(doc,win,M,()=>0,()=>0,()=>0,{getItem:()=>null,setItem:()=>{}},()=>stub);
  // silence rendering, capture log
  G.setDraw(()=>{});G.setUi(()=>{});G.setBeep(()=>{});G.setRenderDock(()=>{});
  G.setLog((cls,msg)=>logs.push({t:G.S.t,clock:G.clock(G.S.t),cls,msg}));
  G.logs=logs;
  G.file=file;G.seed=opts.seed==null?1:opts.seed;
  // capture end-of-shift result instead of writing the debrief DOM
  G.setEndShift(black=>{
    const S=G.S;S.over=true;S.run=false;
    const cmp=100*S.okTicks/Math.max(S.ticks,1);
    G.result={black,grade:gradeOf(S,black),money:S.money,rev:S.rev,fuel:S.fuel,pen:S.pen,cmp,
      unserved:S.unserved,co2:S.co2,worstDev:S.worstDev,maxPrice:S.maxPrice,
      outT:S.outT,t:S.t,endClock:G.clock(S.t)};
  });
  // restart() in the page re-runs freshState()+schedule(); the page's top level already ran
  // schedule(), so the event list is in place. Helpers mirroring the dock buttons:
  G.start=()=>{G.S.run=true;};
  G.startUnit=id=>{const u=G.FU[id];if(u.fault>0||u.on||u.starting>0)return false;
    if(id==='hyd'&&G.S.hydRes<=0)return false;
    u.starting=u.st;G.S.money-=u.startCost;G.S.fuel+=u.startCost;return true;};
  G.stopUnit=id=>{const u=G.FU[id];u.on=false;u.starting=0;};
  G.callDR=()=>{const S=G.S;if(S.dr.uses<=0||S.dr.left>0)return false;S.dr.uses--;S.dr.left=60;return true;};
  G.toggleDiesel=on=>{const S=G.S;if(on===S.rert.on)return;S.rert.on=on;S.rert.timer=on?20:0;};
  G.weather=()=>weatherClass(G);
  G.runToEnd=(policy,maxTicks=20000)=>{G.start();let n=0;
    while(!G.S.over&&n++<maxTicks){if(policy)policy(G);G.tick();}return G.result;};
  return G;
}
module.exports={load,mulberry32,gradeOf,weatherClass,GAME};

if(require.main===module){ // smoke test: do-nothing policy over a few seeds
  for(const seed of [1,2,3,4,5]){const G=load({seed});const r=G.runToEnd(null);
    console.log('seed',seed,G.weather().padEnd(5),r.grade,r.endClock,'$'+(r.money/1e6).toFixed(1)+'M',
      'cmp',r.cmp.toFixed(1)+'%','unserved',Math.round(r.unserved));}
}
