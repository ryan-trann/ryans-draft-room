import type {Player,Roster} from './engine';
import {lineupValue,nbaCode,perGame,projectedAvailability,starters,type ScheduledGame} from './lineups.ts';

export type SeasonSchedule={season:string;generatedAt:string;source:string;games:ScheduledGame[]};
export type TeamProjection={totals:Record<string,number>;scheduled:number;startable:number;blocked:number;expectedStarted:number;expectedBlocked:number;playerStarts:Record<string,number>;missing:string[]};
export async function getSeasonSchedule():Promise<SeasonSchedule>{
 const response=await fetch('./nba-schedule.json?fresh='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('NBA season schedule unavailable');
 const data=await response.json();
 if(data.season!=='2026-27'||!Array.isArray(data.games)||data.games.length<1000||data.games.some((g:ScheduledGame)=>!/^\d{4}-\d{2}-\d{2}$/.test(g.date)||!g.home||!g.away||nbaCode(g.home)===nbaCode(g.away)))throw Error('NBA season schedule is incomplete or invalid');
 return data;
}

export class SeasonProjection {
 readonly schedule:SeasonSchedule;
 readonly gamesPerTeam:Record<string,number>={};
 private lookup:Map<string,Player>;
 private days:Map<string,Set<string>>=new Map();
 private scores:Map<string,number>;
 private cache=new Map<string,TeamProjection>();
 private cats:string[];
 constructor(all:Player[],cats:string[],schedule:SeasonSchedule){
  this.cats=cats;
  this.schedule=schedule;this.lookup=new Map(all.map(p=>[p.draftId,p]));
  const value=lineupValue(all,cats);this.scores=new Map(all.map(p=>[p.draftId,value(p)]));
  const seen=new Set<string>();
  for(const g of schedule.games){
   const home=nbaCode(g.home),away=nbaCode(g.away),key=[g.date,...[home,away].sort()].join('|');
   if(seen.has(key))continue;seen.add(key);
   const teams=this.days.get(g.date)||new Set<string>();teams.add(home);teams.add(away);this.days.set(g.date,teams);
   for(const t of [home,away])this.gamesPerTeam[t]=(this.gamesPerTeam[t]||0)+1;
  }
 }
 team(ids:string[],factor?:(p:Player)=>number):TeamProjection{
  const players=[...new Set(ids)].map(id=>this.lookup.get(id)).filter((p):p is Player=>Boolean(p));
  const key=players.map(p=>p.draftId).sort().join('|');
  if(factor){
   const base=this.team(ids),totals=Object.fromEntries(this.cats.map(c=>[c,0]));let expectedStarted=0,expectedBlocked=0;
   for(const p of players){
    if(!(p.GP>0))continue;
    const availability=projectedAvailability(p)*factor(p),starts=base.playerStarts[p.draftId];
    for(const c of this.cats)totals[c]+=perGame(p,c)*starts*availability;
    expectedStarted+=starts*availability;expectedBlocked+=Math.max(0,(this.gamesPerTeam[nbaCode(p.team)]||0)-starts)*availability;
   }
   return {...base,totals,expectedStarted,expectedBlocked};
  }
  const cached=this.cache.get(key);if(cached)return cached;
  const totals=Object.fromEntries(this.cats.map(c=>[c,0]));
  const playerStarts=Object.fromEntries(players.map(p=>[p.draftId,0]));
  let scheduled=0,startable=0,expectedStarted=0,expectedBlocked=0;
  for(const teams of this.days.values()){
   const playing=players.filter(p=>p.GP>0&&teams.has(nbaCode(p.team)));
   scheduled+=playing.length;
   const selected=starters(playing,p=>this.scores.get(p.draftId)||0),chosen=new Set(selected.map(p=>p.draftId));
   startable+=selected.length;
   for(const p of playing){
    const availability=projectedAvailability(p);
    if(!chosen.has(p.draftId)){expectedBlocked+=availability;continue}
    playerStarts[p.draftId]++;expectedStarted+=availability;
    for(const c of this.cats)totals[c]+=perGame(p,c)*availability;
   }
  }
  const result={totals,scheduled,startable,blocked:scheduled-startable,expectedStarted,expectedBlocked,playerStarts,missing:players.filter(p=>!this.gamesPerTeam[nbaCode(p.team)]).map(p=>p.draftId)};
  // Bound memory during the trade search, which tries thousands of rosters.
  if(this.cache.size>=3000)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,result);
  return result;
 }
 totals(rosters:Roster,factor?:(p:Player)=>number){return Object.fromEntries(Object.entries(rosters).map(([team,ids])=>[team,this.team(ids,factor).totals]))}
}

export function rankTotals(totals:Record<string,Record<string,number>>,cats:string[]){
 const names=Object.keys(totals),rows=names.map(team=>({team,totals:totals[team],ranks:{} as Record<string,number>,points:0,rank:0}));
 for(const c of cats){
  const sorted=[...rows].sort((a,b)=>(c==='TO'?1:-1)*(a.totals[c]-b.totals[c]));
  let i=0;while(i<sorted.length){let j=i+1;while(j<sorted.length&&Math.abs(sorted[j].totals[c]-sorted[i].totals[c])<.00001)j++;
   for(let k=i;k<j;k++){sorted[k].ranks[c]=(i+1+j)/2;sorted[k].points+=names.length+1-sorted[k].ranks[c]}i=j;
  }
 }
 rows.sort((a,b)=>b.points-a.points||names.indexOf(a.team)-names.indexOf(b.team));
 for(const row of rows)row.rank=rows.findIndex(r=>Math.abs(r.points-row.points)<.00001)+1;
 return rows;
}
