// Scripted dispatcher policies for the headless harness (Node, CommonJS). Not loaded by the game.
//
// A policy factory returns policy(G), called once before every tick (100 ms real). Policies
// ACT only through the same levers as the dock (setpoints, start/stop, DR, diesel, IC,
// battery, curtailment) and READ only what the v2 screen shows the player. The information
// barrier is written down in observe() below; the competent policy reads the weather outlook
// through it instead of the hidden weather-regime state.
//
//   doNothing()      no input at all
//   reactiveOnly()   chases frequency with hydro + battery, walks coal/CCGT behind, never
//                    starts plant (the "engaged but incomplete" player)
//   competent()      ramp-aware economic dispatch of the whole fleet every tick, commitment
//                    from the forecast net load, water plan, battery saved for the peak,
//                    pre-emptive diesel/DR, and on announced heatwave days a peak plan.
//                    Adapted from the balance lens's ctl() with its best-scoring preset
//                    ("heatE": most S+A grades and best mean grade over seeds 1-100).
//   competentClassic()  the balance lens's reference ctl({}) (report numbers S28 A3 B1 C6 D56 F6),
//                    also routed through observe(); kept for comparison with the reports.
'use strict';
const DTS=0.2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// ---------------------------------------------------------------------------------------
// What a player can see on the v2 screen, and where. Everything a policy reads should be
// derivable from this list; anything else in G.S (windMu/cloudMu regime means, u.hot, the
// event list, heat.t0/t1 before the announcement, noise) is hidden.
//   clock, frequency, demand, price, inertia        header / gauge / charts
//   unit on/starting/out/set/fault/derate/avail     dock + map lamps
//   unit ramp, start time, min, cost                manual + dock
//   wind % and cloud % (current)                    weather readout (mWx)
//   wind outlook = 1200*windMu                      dashed renewable forecast line on the demand chart
//   demand forecast demandF(h)                      dashed demand line (includes the heat uplift
//                                                   only once the heatwave is announced)
//   clear-sky solar solarClear(h)                   solar part of the forecast line
//   cloud outlook                                   log: "cloud band ... ~20 min out",
//                                                   "Cloud front overhead ... ~30%", "Skies clearing",
//                                                   "HEATWAVE ... Skies clear"
//   battery SoC, hydro water, IC flow/fault, DR/diesel status, UFLS stage, log lines
function cloudOutlook(G){
  // Reconstruct the cloud regime a reader of the event log would expect, as a function of
  // the future hour. Returns {now, at(h)}.
  let mu=0.92, frontAt=null;
  for(const l of G.logs){
    if(/cloud band moving over/.test(l.msg)){frontAt=(240+l.t+20)/60;}
    else if(/Cloud front overhead/.test(l.msg)){mu=0.32;frontAt=null;}
    else if(/Skies clearing/.test(l.msg)){mu=0.92;}
    else if(/HEATWAVE CONDITIONS/.test(l.msg)){mu=Math.max(mu,0.98);}
  }
  return {now:mu, at:h=>(frontAt!=null&&h>=frontAt)?0.32:mu};
}
function observe(G){
  const S=G.S;
  return {
    hour:G.hourNow(), t:S.t, freqDev:S.dev, demand:S.demand, price:S.price,
    wind:S.wind, cloud:S.cloud, windOutlookMW:1200*S.windMu,
    cloudOutlook:cloudOutlook(G), heatAnnounced:S.heat.ann,
    battSoc:S.batt.soc, battE:S.batt.e, hydRes:S.hydRes, ic:{flow:S.ic.flow,set:S.ic.set,fault:S.ic.fault>0},
    ufls:S.ufls, drActive:S.dr.left>0, drUses:S.dr.uses, dieselOn:S.rert.on, dieselOut:S.rert.out,
  };
}

function doNothing(){return null;}

// Chase frequency with hydro/battery (fast) and walk coal/CCGT behind; never start plant.
function reactiveOnly(cfg={}){
  const every=cfg.every||1;let n=0;
  return G=>{if(n++%every)return;const S=G.S,U=G.FU;
    const d=S.dev;
    if(U.hyd.on)U.hyd.set=clamp(U.hyd.out-d*1500*every*0.2,0,950);
    S.batt.set=clamp(-d*3000,-500,500);
    const hx=U.hyd.on?U.hyd.out-450:0;
    for(const u of [U.coal,U.ccgt])if(u.on)u.set=clamp(u.out+Math.sign(hx)*u.ramp*DTS*every-d*800,G.minE(u),G.capE(u));
  };
}

// General controller (balance lens ctl(), weather outlook routed through observe()).
function ctl(cfg={}){
  cfg=Object.assign({
    every:1, K:2500, hydVal:170, waterKeep:5200, hotCap:0.955, waterFloor:true,
    batt:'peak', ic:'econ', icFixed:250,
    commit:true, reserve:700, lead:20, decommit:true, commitAll:false,
    noHydro:false, emergency:true, curtail:true, spamDR:false, dieselAlways:false,
    postTrip:true, costs:null, reserveMode:'fixed', targetMargin:0.08,
  },cfg);
  let n=0;const st={onSince:{},dieselT:-1};
  const order=['ccgt','gta','gtb'];
  return G=>{
    const S=G.S,U=G.FU,F=G.F,h=G.hourNow();
    if(n===0){
      if(cfg.noHydro){U.hyd.on=false;U.hyd.out=0;}
      if(cfg.commitAll)for(const id of ['gta','gtb'])G.startUnit(id);
      if(cfg.dieselAlways)G.toggleDiesel(true);
    }
    if(n++%cfg.every)return;
    const k=cfg.every;
    const O=observe(G);
    // ---------- interconnector ----------
    let icSet=S.ic.set;
    const margUnitCost=()=>{let c=0;for(const u of F)if(u.on&&u.out>G.minE(u)+5&&u.id!=='hyd')c=Math.max(c,u.cost);return c;};
    if(cfg.ic==='fixed')icSet=cfg.icFixed;
    else if(cfg.ic==='zero')icSet=0;
    else if(cfg.ic==='maxImport')icSet=800;
    else if(cfg.ic==='maxExport')icSet=-800;
    else if(cfg.ic==='econ'){
      const mc=margUnitCost();
      const coalHead=U.coal.on?G.capE(U.coal)-U.coal.out:0;
      if(mc>58)icSet=Math.min(800,S.ic.set+20*k);
      else if(mc<=40&&coalHead>100)icSet=Math.max(-800,S.ic.set-10*k);
    }
    S.ic.set=icSet;
    const icNext=O.ic.fault?0:S.ic.flow+clamp(clamp(icSet,-800,800)-S.ic.flow,-S.ic.ramp*DTS,S.ic.ramp*DTS);
    // ---------- forecast (player-visible outlooks only) ----------
    const windMuObs=O.windOutlookMW/1200;
    const wFc=hh=>{const lead=(hh-h)*60;return 1200*(windMuObs+(O.wind-windMuObs)*Math.exp(-lead/50));};
    const sFc=hh=>{const mu=O.cloudOutlook.at(hh);return G.solarClear(hh)*(mu+(O.cloud-mu)*Math.exp(-(hh-h)*60/20));};
    const battAvail=O.battSoc>150?Math.min(500,O.battSoc*2):0;
    const netReq=hh=>G.demandF(hh)-sFc(hh)-wFc(hh)-(O.ic.fault?0:Math.max(0,icSet));
    const commitCap=()=>F.reduce((a,u)=>a+((u.on||u.starting>0)&&!(u.id==='hyd'&&O.hydRes<300)?G.capE(u)*(u.id==='hyd'&&O.hydRes<1500?0.3:1):0),0);
    // ---------- commitment ----------
    if(cfg.commit&&!cfg.commitAll){
      for(const id of order){const u=U[id];if(u.on||u.starting>0||u.fault>0)continue;
        let mx=-1e9;for(let x=0;x<=u.st+cfg.lead;x+=5)mx=Math.max(mx,netReq(h+x/60));
        const res=cfg.reserveMode==='withhold'?mx*cfg.targetMargin:cfg.reserve;
        if(mx+res>commitCap()+battAvail*0.5){G.startUnit(id);st.onSince[id]=S.t;break;}
      }
      if(cfg.decommit){
        for(const id of ['gtb','gta','ccgt']){const u=U[id];if(!u.on)continue;
          if(S.t-(st.onSince[id]||0)<90)continue;
          let mx=-1e9;for(let x=0;x<=150;x+=10)mx=Math.max(mx,netReq(h+x/60));
          const res=cfg.reserveMode==='withhold'?mx*cfg.targetMargin:cfg.reserve;
          if(mx+res+G.capE(u)+250<commitCap()+battAvail*0.5){G.stopUnit(id);break;}
        }
      }
    }
    if(!cfg.noHydro&&!U.hyd.on&&!U.hyd.starting&&!U.hyd.fault&&O.hydRes>300)G.startUnit('hyd');
    if(cfg.commitAll){for(const id of ['ccgt','gta','gtb','hyd'])if(!U[id].on&&!U[id].starting&&!U[id].fault&&!(id==='hyd'&&cfg.noHydro))G.startUnit(id);}
    if(cfg.postTrip){ // any unit (or the IC) in fault and a peaker free -> start it
      const tripped=F.some(u=>u.fault>0||u.subFault>0)||O.ic.fault;
      if(tripped)for(const id of order){const u=U[id];if(!u.on&&!u.starting&&!u.fault){G.startUnit(id);st.onSince[id]=S.t;break;}}
    }
    // ---------- battery plan ----------
    const B=S.batt;let bPlan=0,bInED=false,bCost=cfg.bCost||200;
    if(cfg.batt==='peak'){
      if(h>=9.5&&h<15.5&&B.soc<B.e*0.97){const hrs=Math.max(15.5-h,0.3);bPlan=-clamp((B.e*0.97-B.soc)/hrs,0,350);}
      else if(h>=16.5&&h<22)bInED=true;
    }else if(cfg.batt==='arb'){
      if(O.price<70&&B.soc<B.e*0.97)bPlan=-300;else if(O.price>150){bInED=true;bCost=60;}
    }else if(cfg.batt==='drain'){bInED=true;bCost=0;}
    // ---------- dispatch ----------
    const shed=O.demand*[0,.05,.12,.21][O.ufls];
    const dr=O.drActive?350:0;
    const served=O.demand*(1+.022*O.freqDev)-shed-dr;
    const windAv=1200*O.wind, solAv=G.solarClear(h)*O.cloud;
    const renFull=windAv+solAv;
    const need=served-renFull-icNext-S.rert.out-cfg.K*O.freqDev-bPlan;
    const costs=Object.assign({coal:26,ccgt:74,gta:148,gtb:152,hyd:cfg.hydVal},cfg.costs||{});
    if(cfg.waterFloor){ // keep water for the evening
      const keep=h<15.5?cfg.waterKeep:h<21?cfg.waterKeep*(21-h)/5.5:0;
      if(O.hydRes<keep)costs.hyd=Math.max(costs.hyd,200);
      if(O.hydRes<600)costs.hyd=1000;
    }
    const hot=(cfg.hotWin&&h>=cfg.hotWin[0]&&h<cfg.hotWin[1])?1:(cfg.hotCap||1);
    const items=[];
    for(const u of F)if(u.on){const r=u.ramp*DTS*k;
      items.push({u,lo:Math.max(G.minE(u),u.out-r),hi:Math.min(G.capE(u)*hot,u.out+r),hi2:Math.min(G.capE(u),u.out+r),c:costs[u.id]});}
    const bMaxDis=B.soc>2?Math.min(500,B.soc/(DTS/60)/50):0;
    if(bInED)items.push({batt:true,lo:0,hi:bMaxDis,c:bCost});
    if(O.ufls>0){ // leave >400 MW spare on units so the relays can restore (game rule, L506)
      const cap=F.reduce((a,u)=>a+(u.on?G.capE(u):0),0);
      const allow=cap-460;const tot=items.reduce((a,x)=>a+(x.batt?0:x.hi),0);
      if(tot>allow){const sc=allow/tot;items.forEach(x=>{if(!x.batt)x.hi=Math.max(x.lo,x.hi*sc);});}
    }
    const sumLo=items.reduce((a,x)=>a+x.lo,0);
    items.forEach(x=>x.v=x.lo);
    let rem=need-sumLo;
    items.sort((a,b)=>a.c-b.c);
    for(const x of items){if(rem<=0)break;const add=Math.min(rem,x.hi-x.lo);x.v+=add;rem-=add;}
    if(rem>0)for(const x of items){if(rem<=0)break;if(x.hi2>x.hi){const add=Math.min(rem,x.hi2-x.v);x.v+=add;rem-=add;}}
    let bset=bPlan;
    for(const x of items){if(x.batt)bset+=x.v;else x.u.set=x.v;}
    let curt=0;
    if(rem>0){bset+=rem;}
    else if(rem<0){
      const sur=-rem;
      const canCh=B.soc<B.e*0.98?Math.max(0,500+Math.min(bset,0)):0;
      const ch=Math.min(sur,canCh);bset-=ch;curt=sur-ch;
    }
    B.set=clamp(bset,-500,500);
    if(cfg.curtail){
      const c=Math.max(0,curt);
      const cw=Math.min(c,windAv), cs=Math.min(c-cw,solAv);
      S.wCurt=windAv>1?clamp(100*(windAv-cw)/windAv,0,100):100;
      S.sCurt=solAv>1?clamp(100*(solAv-cs)/solAv,0,100):100;
    }
    // ---------- emergency ----------
    if(cfg.spamDR)G.callDR();
    if(cfg.drTimes&&O.heatAnnounced)for(const x of cfg.drTimes)if(h>=x&&h<x+0.1)G.callDR();
    if(cfg.dieselWin&&O.heatAnnounced){if(h>=cfg.dieselWin[0]&&h<cfg.dieselWin[1]&&!O.dieselOn){G.toggleDiesel(true);st.dieselT=S.t;}}
    if(cfg.emergency){
      const spare=F.reduce((a,u)=>a+(u.on?G.capE(u)-u.out:0),0)+(B.soc>50?500-B.out:0)+(O.ic.fault?0:800-S.ic.flow);
      if((spare<250&&O.freqDev<-0.1)||O.ufls>0)G.callDR();
      let mx=-1e9;for(let x=0;x<=25;x+=5)mx=Math.max(mx,netReq(h+x/60));
      const firm=F.reduce((a,u)=>a+((u.on||u.starting>0)&&!(u.id==='hyd'&&O.hydRes<300)?G.capE(u):0),0)+(B.soc>100?Math.min(500,B.soc):0)+O.dieselOut+(O.drActive?350:0);
      if(mx+100>firm&&!O.dieselOn){G.toggleDiesel(true);st.dieselT=S.t;}
      if(netReq(h)+60>firm)G.callDR();
      if(!S.rert.on&&(spare<200||O.ufls>0)){G.toggleDiesel(true);st.dieselT=S.t;}
      if(S.rert.on&&!cfg.dieselAlways&&S.t-st.dieselT>45&&spare>900&&O.ufls===0)G.toggleDiesel(false);
    }
  };
}

// Presets. HEAT_PLAN is the balance lens's best-scoring "heatE" preset: all units committed
// from 04:00, 7,000 MWh of water held to 15:30, and on announced heatwave days DR at
// 17:45/18:45/19:45, reserve diesel 16:30-21:30, units allowed above 96% 17:30-21:00.
const HEAT_PLAN={commitAll:true,waterKeep:7000,drTimes:[17.75,18.75,19.75],dieselWin:[16.5,21.5],hotWin:[17.5,21]};
const competent=(extra={})=>ctl(Object.assign({},HEAT_PLAN,extra));
const competentClassic=(extra={})=>ctl(extra);

module.exports={observe,cloudOutlook,doNothing,reactiveOnly,ctl,competent,competentClassic,HEAT_PLAN,clamp,DTS};
