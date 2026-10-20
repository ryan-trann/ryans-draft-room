import type {Player,Roster} from './engine';
import {estimatePotFromTotals} from './strategy';
export type StreamPair={d:{p:Player;games:number;score:number};a:{p:Player;games:number;score:number};gain:number};
export type RankedStreamPair=StreamPair&{potGain:number;potBefore:number;potAfter:number;improved:string[];weakened:string[];categoryDelta:Record<string,number>};
const nbaCode=(team:string)=>{
 const codes:Record<string,string>={GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',PHO:'PHX',PHOE:'PHX',UTAH:'UTA',WSH:'WAS',BK:'BKN'};
 return codes[team.toUpperCase()]||team.toUpperCase();
};
const perGame=(p:Player,cat:string)=>p.GP>0?Number(p[cat]||0)/p.GP:0;
const total=(ids:string[],lookup:Map<string,Player>,cats:string[],games:Record<string,number>)=>
 Object.fromEntries(cats.map(cat=>[cat,ids.reduce((n,id)=>{
  const p=lookup.get(id);return n+(p?perGame(p,cat)*(games[nbaCode(p.team)]||0):0);
 },0)]));
export function rankStreamingPairs(pairs:StreamPair[],rosters:Roster,from:string,all:Player[],cats:string[],countsRoster:Record<string,number>,countsPickup:Record<string,number>,max=15):{rows:RankedStreamPair[];tested:number;baseline:number}{
 const lookup=new Map(all.map(p=>[p.draftId,p]));
 const totals=Object.fromEntries(Object.entries(rosters).map(([t,ids])=>[t,total(ids,lookup,cats,countsRoster)]));
 const trials=1024;
 const baseline=estimatePotFromTotals(totals,cats,trials).shares[from]||0;
 const eligible=pairs.filter(v=>v.a.games>0&&rosters[from].includes(v.d.p.draftId)&&!Object.values(rosters).some(ids=>ids.includes(v.a.p.draftId)));
 const results:RankedStreamPair[]=[];
 for(const v of eligible){
  const updated=Object.fromEntries(Object.entries(totals).map(([t,row])=>[t,t===from?{...row}:row]));
  const delta:Record<string,number>={};
  for(const c of cats){
   delta[c]=perGame(v.a.p,c)*(countsPickup[nbaCode(v.a.p.team)]??v.a.games)-perGame(v.d.p,c)*(countsRoster[nbaCode(v.d.p.team)]??v.d.games);
   updated[from][c]+=delta[c];
  }
  const potAfter=estimatePotFromTotals(updated,cats,trials).shares[from]||0;
  const improved=cats.filter(c=>(c==='TO'?-1:1)*delta[c]>0.00001);
  const weakened=cats.filter(c=>(c==='TO'?-1:1)*delta[c]<-0.00001);
  results.push({...v,potGain:potAfter-baseline,potBefore:baseline,potAfter,improved,weakened,categoryDelta:delta});
 }
 results.sort((a,b)=>b.potGain-a.potGain||b.gain-a.gain);
 return {rows:results.filter(v=>v.potGain>0).slice(0,max),tested:eligible.length,baseline};
}
