import type {Player} from './engine';

export const DAILY_SLOTS=['PG','SG','G','SF','PF','F','C','C','UTIL','UTIL','UTIL'] as const;
export type ScheduledGame={date:string;home:string;away:string};
export const nbaCode=(team:string)=>{
 const codes:Record<string,string>={GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',PHO:'PHX',PHOE:'PHX',UTAH:'UTA',WSH:'WAS',BK:'BKN'};
 const code=String(team||'').trim().toUpperCase();return codes[code]||code;
};
export const perGame=(p:Player,c:string)=>p.GP>0?Number(p[c]||0)/p.GP:0;
export const projectedAvailability=(p:Player)=>Math.min(1,Math.max(0,Number(p.GP||0)/82));
export function eligible(p:Player,slot:string){
 if(slot==='UTIL')return true;
 const positions=String(p.positions||'').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
 return positions.includes(slot)||(slot==='G'&&(positions.includes('PG')||positions.includes('SG')))||(slot==='F'&&(positions.includes('SF')||positions.includes('PF')));
}
export function lineupValue(all:Player[],cats:string[]){
 const stats=cats.map(c=>{
  const values=all.map(p=>perGame(p,c)),mean=values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
  return {c,mean,sd:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,values.length))||1};
 });
 return (p:Player)=>stats.reduce((n,{c,mean,sd})=>n+(c==='TO'?-1:1)*(perGame(p,c)-mean)/sd,0);
}
// Match flexible positions with augmenting paths, rather than greedily locking
// UTIL slots. Matchable player sets form a transversal matroid: considering
// players in value order selects the highest-value maximum-cardinality lineup.
// The same selected players contribute to every category, including turnovers.
export function starters(players:Player[],score:(p:Player)=>number):Player[]{
 const ordered=[...new Map(players.map(p=>[p.draftId,p])).values()].sort((a,b)=>score(b)-score(a)||a.draftId.localeCompare(b.draftId));
 const assignment=new Array<number>(DAILY_SLOTS.length).fill(-1);
 const tryMatch=(idx:number,visited:Set<number>):boolean=>{
  for(let slot=0;slot<DAILY_SLOTS.length;slot++){
   if(visited.has(slot)||!eligible(ordered[idx],DAILY_SLOTS[slot]))continue;
   visited.add(slot);
   if(assignment[slot]===-1||tryMatch(assignment[slot],visited)){assignment[slot]=idx;return true}
  }
  return false;
 };
 for(let i=0;i<ordered.length;i++)tryMatch(i,new Set());
 return [...new Set(assignment.filter(i=>i>=0))].map(i=>ordered[i]);
}
