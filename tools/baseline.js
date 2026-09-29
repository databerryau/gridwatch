// GRIDWATCH baseline: runs the scripted policies over seeds 1..N against the current build
// and prints a markdown report. Not loaded by the game.
//
//   node tools/baseline.js            # seeds 1-100 against ../index.html
//   node tools/baseline.js 20         # quick run, seeds 1-20
//   GRIDWATCH_HTML=path/to/copy.html node tools/baseline.js   # measure a patched copy
//
// Output is deterministic for a given build, seed range and policy set (every harness
// instance has its own seeded RNG). The only machine-dependent lines are in section 5.
'use strict';
const fs=require('fs'), crypto=require('crypto');
const H=require('./harness.js');
const P=require('./policies.js');

const N=Math.max(1,parseInt(process.argv[2],10)||100);
const SEEDS=Array.from({length:N},(_,i)=>i+1);
const POLICIES=[
  ['doNothing',P.doNothing],
  ['reactiveOnly',()=>P.reactiveOnly()],
  ['competent',()=>P.competent()],
  ['competentClassic',()=>P.competentClassic()],
];
const WEATHERS=['heat','storm','calm'];
const TICK_2100=Math.round((21-4)*60/0.2); // tick index at which the clock reads 21:00

// ---------- small stats helpers ----------
const sorted=a=>[...a].sort((x,y)=>x-y);
const pct=(a,p)=>{if(!a.length)return NaN;const s=sorted(a);return s[Math.floor(p*(s.length-1))];};
const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(a.length,1);
const clockOf=t=>{const m=Math.floor(240+t),h=Math.floor(m/60)%24;return String(h).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const realMin=t=>(t/0.2*0.1/60); // sim-min -> real minutes at 1x (1 tick = 0.2 sim-min = 0.1 s)
const tally=rs=>{const g={S:0,A:0,B:0,C:0,D:0,F:0};rs.forEach(r=>g[r.grade]++);
  return Object.entries(g).filter(([,v])=>v).map(([k,v])=>k+v).join(' ')||'-';};

// ---------- one instrumented run ----------
function run(seed,mk,{bound=false}={}){
  const G=H.load({seed});const pol=mk();const S=G.S;
  const weather=G.weather();
  G.start();
  let g21=null,alive21=false,lastMin=-1,shortMin=0,worst=Infinity,shortNoOut=0;
  const win=[];let short15=false;
  while(!S.over&&S.ticks<20000){
    if(pol)pol(G);
    G.tick();
    if(g21===null&&S.ticks===TICK_2100){alive21=!S.over;g21=S.over?G.result.grade:H.gradeOf(S,false);}
    if(bound&&!S.over){
      const mi=Math.floor(S.t+1e-9);
      if(mi>lastMin){lastMin=mi;
        // Optimistic supply bound: every unit not in protection lockout at its derated
        // capacity (ignoring start times, ramps, min-gen and water), IC 800 unless faulted,
        // battery 500, diesel 300, DR 350 (all at once, no energy/use limits), plus the
        // wind and solar available this minute.
        const h=G.hourNow();
        const fixed=500+300+350+1200*S.wind+G.solarClear(h)*S.cloud;
        const units=G.F.reduce((a,u)=>a+(u.fault>0?0:G.capE(u)),0);
        const b=units+(S.ic.fault>0?0:800)+fixed;
        const m=b-S.demand;
        if(m<worst)worst=m;
        if(m<0)shortMin++;
        win.push(m);if(win.length>15)win.shift();
        if(win.length===15&&win.reduce((a,x)=>a+x,0)/15<0)short15=true;
        // same bound if no unit or IC outage had happened (tripped machines/units back at full)
        const noOut=G.F.reduce((a,u)=>a+u.cap*u.derate,0)+800+fixed;
        if(noOut<S.demand)shortNoOut++;
      }
    }
  }
  const r=Object.assign({seed,weather},G.result);
  r.g21=g21===null?r.grade:g21; // ended before 21:00 (black) -> 21:00 grade is the final F
  r.alive21=alive21;
  if(bound){r.shortMin=shortMin;r.worstMargin=worst;r.short15=short15;r.shortNoOut=shortNoOut;}
  return r;
}

// ---------- reference contingency ----------
// From balance at 04:00 (t=0): zero the demand noise, re-balance with hydro so supply equals
// served load, then trip one Mt Hazel machine exactly as tripUnit() does for the coal
// station (availF .75, output x.75). No player action afterwards. The first-swing nadir is
// taken over the first 15 real s (= 30 sim-min: the economy clock keeps running at 120x, so
// the morning demand ramp starts to pull frequency down again later in the window).
function refContingency(seed){
  const G=H.load({seed});const S=G.S,U=G.FU;
  G.start();S.noise=0;G.tick();
  const gap=S.served-S.supply;U.hyd.out+=gap;U.hyd.set=U.hyd.out;S.freq=50;S.dev=0;
  const M0=S.M;const before=U.coal.out;
  U.coal.availF=.75;U.coal.subFault=120;U.coal.out*=.75;
  const after=U.coal.out,lost=before-after;
  let exit=null,ufls=null,nadir=50,nadirAt=0,back=null,rampBack5=null,M1=null;
  for(let k=1;k<=600&&!S.over;k++){
    G.tick();
    if(k===1)M1=S.M; // read while the machine is still out (it is repaired on tick 600)
    if(k<=150&&S.freq<nadir){nadir=S.freq;nadirAt=k;}
    if(k===50)rampBack5=U.coal.out-after;
    if(exit===null&&Math.abs(S.dev)>0.15)exit=k;
    if(exit!==null&&back===null&&Math.abs(S.dev)<=0.15)back=k;
    if(ufls===null&&S.ufls>0)ufls=k;
  }
  return {seed,lost,M0,M1,exit:exit===null?null:exit/10,nadir,nadirAt:nadirAt/10,
    ufls:ufls===null?null:ufls/10,back:back===null?null:back/10,rampBack5};
}

// ---------- main ----------
const html=fs.readFileSync(H.GAME);
const blob=crypto.createHash('sha1').update('blob '+html.length+'\0').update(html).digest('hex');
const out=[];
const p=s=>out.push(s);
p('# GRIDWATCH baseline');
p('');
p('Build: `'+(process.env.GRIDWATCH_HTML?H.GAME:'index.html')+'` (git blob '+blob.slice(0,10)+', '+html.length+' bytes). Seeds 1-'+N+'. Command: `node tools/baseline.js'+(N!==100?' '+N:'')+'`.');
p('');

const results={};
for(const [name,mk] of POLICIES)results[name]=SEEDS.map(s=>run(s,mk,{bound:name==='competentClassic'}));
const wx=WEATHERS.map(w=>w+' '+results.competent.filter(r=>r.weather===w).length).join(', ');

p('## 1. Policy outcomes (current build)');
p('');
p('Weather class is fixed by the seed ('+wx+'). "In band" = 49.85-50.15 Hz. Black time = clock when the grid went black (real minutes at 1x in brackets).');
p('');
p('| Policy | Grades, all | Heat | Storm | Calm | Median in-band % | Mean unserved MWh | Blackouts | Black time p10 / p50 / p90 | Final grade = grade at 21:00 |');
p('|---|---|---|---|---|---|---|---|---|---|');
for(const [name] of POLICIES){
  const rs=results[name];
  const by=w=>tally(rs.filter(r=>r.weather===w));
  const blk=rs.filter(r=>r.black).map(r=>r.t);
  const bt=blk.length?[.1,.5,.9].map(q=>{const t=pct(blk,q);return clockOf(t)+' ('+realMin(t).toFixed(1)+')';}).join(' / '):'-';
  const same=rs.filter(r=>r.g21===r.grade).length;
  const alive=rs.filter(r=>r.alive21);
  const sameAlive=alive.filter(r=>r.g21===r.grade).length;
  p('| '+name+' | '+tally(rs)+' | '+by('heat')+' | '+by('storm')+' | '+by('calm')+' | '+pct(rs.map(r=>r.cmp),.5).toFixed(1)+
    ' | '+Math.round(mean(rs.map(r=>r.unserved))).toLocaleString('en-US')+' | '+blk.length+' | '+bt+
    ' | '+same+'/'+rs.length+(alive.length?' ('+sameAlive+'/'+alive.length+' of runs alive at 21:00)':' (none alive at 21:00)')+' |');
}
p('');

p('## 2. Optimistic supply bound (along the competentClassic run)');
p('');
p('Bound = every unit not in protection lockout at heat-derated capacity (no start, ramp, min-gen or water limits) + IC 800 (0 while faulted) + battery 500 + diesel 300 + DR 350, all simultaneously and all day, + wind and solar available that minute. "Short" = bound < demand at one or more whole sim-minutes; on such a day no player could have avoided load shedding. Measured along the competentClassic run because unit trips, IC trips and weather noise in the current build depend on play (shared random stream); that policy keeps units below the 96% overheat threshold, so its outages are the scheduled ones. "15-min" uses the 15-minute rolling mean of the margin (the method used in the balance review). "No outages" counts every unit and the IC at full derated capacity all day.');
p('');
p('| Weather | Days | Short at some minute | Share | Short on 15-min mean | Short even with no outages | Short minutes, median of short days | Worst 1-min margin MW p10 / p50 / p90 |');
p('|---|---|---|---|---|---|---|---|');
for(const w of [...WEATHERS,'all']){
  const rs=results.competentClassic.filter(r=>w==='all'||r.weather===w);
  const sh=rs.filter(r=>r.shortMin>0);
  const wm=rs.map(r=>r.worstMargin);
  p('| '+w+' | '+rs.length+' | '+sh.length+' | '+(100*sh.length/rs.length).toFixed(0)+'% | '+rs.filter(r=>r.short15).length+' | '+rs.filter(r=>r.shortNoOut>0).length+' | '+(sh.length?pct(sh.map(r=>r.shortMin),.5):'-')+
    ' | '+[.1,.5,.9].map(q=>Math.round(pct(wm,q))).join(' / ')+' |');
}
p('');

p('## 3. Reference contingency: one Mt Hazel machine trips at 04:00 from balance, no player action');
p('');
const rc=SEEDS.map(refContingency);
const col=(k,d=1)=>{const v=rc.map(r=>r[k]).filter(x=>x!==null);return v.length?[.1,.5,.9].map(q=>pct(v,q).toFixed(d)).join(' / '):'never';};
p('| Measure | p10 / median / p90 over seeds |');
p('|---|---|');
p('| Output lost at the trip (MW) | '+col('lost',0)+' |');
p('| Inertia readout S.M before -> after trip | '+col('M0',0)+' -> '+col('M1',0)+' |');
p('| Time from trip to leaving the 49.85-50.15 Hz band, real s | '+col('exit')+' ('+rc.filter(r=>r.exit!==null).length+'/'+rc.length+' seeds exit) |');
p('| First-swing nadir (min over first 15 real s), Hz | '+col('nadir',3)+' |');
p('| Time to that nadir, real s | '+col('nadirAt')+' |');
p('| Tripped station output regained in the first 5 real s by its own ramp (MW) | '+col('rampBack5',0)+' |');
p('| Back inside the band, real s after trip | '+col('back')+' ('+rc.filter(r=>r.back!==null).length+'/'+rc.length+' seeds) |');
p('| UFLS reached within 60 s | '+rc.filter(r=>r.ufls!==null).length+'/'+rc.length+' seeds |');
p('');

p('## 4. Determinism');
p('');
let det=true;
for(const [name,mk] of POLICIES)for(const s of SEEDS.slice(0,3)){
  const a=JSON.stringify(run(s,mk)),b=JSON.stringify(run(s,mk));if(a!==b){det=false;p('- MISMATCH '+name+' seed '+s);}
}
p('- Re-running seeds 1-3 under every policy gives byte-identical results: **'+(det?'yes':'NO')+'**.');
p('');

p('## 5. Sim cost on this machine (machine-dependent)');
p('');
{
  const ts=[];
  for(const s of SEEDS.slice(0,20)){const G=H.load({seed:s});G.start();
    for(let k=0;k<200;k++)G.tick(); // warm-up
    const t0=process.hrtime.bigint();let n=0;while(!G.S.over&&n<1500){G.tick();n++;}
    ts.push(Number(process.hrtime.bigint()-t0)/1000/n);}
  const tc=[];
  for(const s of SEEDS.slice(0,20)){const G=H.load({seed:s});const t0=process.hrtime.bigint();G.runToEnd(P.competent());
    tc.push(Number(process.hrtime.bigint()-t0)/1e6);}
  p('- `tick()` alone (render stubbed), median of 20 seeds: '+pct(ts,.5).toFixed(1)+' us per tick (p90 '+pct(ts,.9).toFixed(1)+').');
  p('- Whole 24 h shift (7,200 ticks) with the competent policy: median '+pct(tc,.5).toFixed(0)+' ms.');
  p('- Node '+process.version+'.');
}
console.log(out.join('\n'));
