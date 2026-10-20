import type {Player,Roster} from './engine';
import {estimatePotFromTotals} from './strategy';
import {injuryAvailability,type InjurySnapshot} from './injuries';

export type StreamPair={d:{p:Player;games:number;score:number};a:{p:Player;games:number;score:number};gain:number};
export type RankedStreamPair=StreamPair&{potGain:number;potBefore:number;potAfter:number;improved:string[];weakened:string[];categoryDelta:Record<string,number>;startableGain:number;startableAdded:number;startableLost:number};
export type ScheduledGame={date:string;home:string;away:string};
const slots=['PG','SG','G','SF','PF','F','C','C','UTIL','UTIL','UTIL'] as const;
const nbaCode=(team:string)=>{
 const codes:Record<string,string>={GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',PHO:'PHX',PHOE:'PHX',UTAH:'UTA',WSH:'WAS',BK:'BKN'};
 return codes[team.toUpperCase()]||team.toUpperCase();
};
const perGame=(p:Player,c:string)=>p.GP>0?Number(p[c]||0)/p.GP:0;
const eligible=(p:Player,slot:string)=>{
 if(slot==='UTIL')return true;
 const positions=String(p.positions||'').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
 return positions.includes(slot)||(slot==='G'&&(positions.includes('PG')||positions.includes('SG')))||(slot==='F'&&(positions.includes('SF')||positions.includes('PF')));
};
// Greedy maximum-cardinality position matching, with higher-value projected players
// given first choice. This avoids treating all scheduled bench games as startable.
function starters(players:Player[],score:(p:Player)=>number):Player[]{
 const ordered=[...players].sort((a,b)=>score(b)-score(a));
 const assignment=new Array<number>(slots.length).fill(-1);
 const tryMatch=(idx:number,visited:Set<number>):boolean=>{
  for(let slot=0;slot<slots.length;slot++){
   if(visited.has(slot)||!eligible(ordered[idx],slots[slot]))continue;
   visited.add(slot);
   if(assignment[slot]===-1||tryMatch(assignment[slot],visited)){assignment[slot]=idx;return true}
  }
  return false;
 };
 for(let i=0;i<ordered.length;i++)tryMatch(i,new Set());
 return [...new Set(assignment.filter(i=>i>=0))].map(i=>ordered[i]);
}
function projectedWeek(ids:string[],lookup:Map<string,Player>,cats:string[],games:ScheduledGame[],score:(p:Player)=>number,injuries:InjurySnapshot|null){
 const rows=Object.fromEntries(cats.map(c=>[c,0])) as Record<string,number>;
 const byDate=new Map<string,Set<string>>();
 for(const g of games){const teams=byDate.get(g.date)||new Set<string>();teams.add(nbaCode(g.home));teams.add(nbaCode(g.away));byDate.set(g.date,teams)}
 let started=0;
 for(const teams of byDate.values()){
  const playing=ids.map(id=>lookup.get(id)).filter((p):p is Player=>Boolean(p)&&teams.has(nbaCode(p!.team)));
  for(const p of starters(playing,score)){
   const availability=Math.min(1,Math.max(0,Number(p.GP||0)/82))*(injuries?injuryAvailability(p.name,p.team,injuries):1);
   for(const c of cats)rows[c]+=perGame(p,c)*availability;
   started+=availability;
  }
 }
 return {totals:rows,started};
}
export function rankStreamingPairs(pairs:StreamPair[],rosters:Roster,from:string,all:Player[],cats:string[],countsRoster:Record<string,number>,countsPickup:Record<string,number>,max=15,games:ScheduledGame[]=[],injuries:InjurySnapshot|null=null):{rows:RankedStreamPair[];tested:number;baseline:number}{
 const lookup=new Map(all.map(p=>[p.draftId,p]));
 const perGameStats=Object.fromEntries(cats.map(c=>{
  const values=all.map(p=>perGame(p,c));
  const mean=values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
  const sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,values.length))||1;
  return [c,{mean,sd}];
 })) as Record<string,{mean:number;sd:number}>;
 const value=(p:Player)=>cats.reduce((n,c)=>n+(c==='TO'?-1:1)*(perGame(p,c)-perGameStats[c].mean)/perGameStats[c].sd,0);
 const mine=rosters[from]||[];
 const free=all.filter(p=>!Object.values(rosters).some(ids=>ids.includes(p.draftId))).sort((a,b)=>value(b)-value(a));
 const replacement=free.slice(0,10).reduce((n,p)=>n+value(p),0)/Math.max(1,Math.min(10,free.length));
 const streamable=new Set(mine.filter(id=>{const p=lookup.get(id);return p&&value(p)<=replacement+1}).map(id=>id));
 // If none of Ryan's players is near replacement level, never invent a disposable roster spot.
 const totals=Object.fromEntries(Object.entries(rosters).map(([team,ids])=>[team,
  games.length?projectedWeek(ids,lookup,cats,games,value,injuries).totals:
  Object.fromEntries(cats.map(c=>[c,ids.reduce((n,id)=>{const p=lookup.get(id);return n+(p?perGame(p,c)*(countsRoster[nbaCode(p.team)]||0):0)},0)]))
 ]));
 const trials=1024;
 const baseline=estimatePotFromTotals(totals,cats,trials,1).shares[from]||0;
 const current=games.length?projectedWeek(mine,lookup,cats,games,value,injuries):null;
 const candidates=pairs.filter(v=>v.a.games>0&&streamable.has(v.d.p.draftId)&&!Object.values(rosters).some(ids=>ids.includes(v.a.p.draftId)));
 const results:RankedStreamPair[]=[];
 for(const v of candidates){
  const updated=Object.fromEntries(Object.entries(totals).map(([t,row])=>[t,t===from?{...row}:row]));
  const newIds=mine.filter(id=>id!==v.d.p.draftId).concat(v.a.p.draftId);
  const afterWeek=games.length?projectedWeek(newIds,lookup,cats,games,value,injuries):null;
  const delta:Record<string,number>={};
  for(const c of cats){
   delta[c]=afterWeek&&current?afterWeek.totals[c]-current.totals[c]:
    perGame(v.a.p,c)*(countsPickup[nbaCode(v.a.p.team)]??v.a.games)-perGame(v.d.p,c)*(countsRoster[nbaCode(v.d.p.team)]??v.d.games);
   updated[from][c]+=delta[c];
  }
  const potAfter=estimatePotFromTotals(updated,cats,trials,1).shares[from]||0;
  const improved=cats.filter(c=>(c==='TO'?-1:1)*delta[c]>0.00001);
  const weakened=cats.filter(c=>(c==='TO'?-1:1)*delta[c]<-0.00001);
  const startableAdded=afterWeek&&current?Math.max(0,afterWeek.started-current.started):v.a.games;
  const startableLost=afterWeek&&current?Math.max(0,current.started-afterWeek.started):v.d.games;
  const startableGain=afterWeek&&current?afterWeek.started-current.started:v.a.games-v.d.games;
  results.push({...v,potGain:potAfter-baseline,potBefore:baseline,potAfter,improved,weakened,categoryDelta:delta,startableGain,startableAdded,startableLost});
 }
 results.sort((a,b)=>b.potGain-a.potGain||b.gain-a.gain);
 return {rows:results.filter(v=>v.potGain>0).slice(0,max),tested:candidates.length,baseline};
}
