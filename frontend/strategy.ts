import type {Player,Roster} from './engine';

export type DealFormat='1:1'|'2:2'|'2:1'|'1:2';
export type Candidate={other:string;give:string[];receive:string[];format:DealFormat;cashMine:number;cashTheirs:number;fairness:number;partnerGain:number;myGain:number;partnerDrop?:string;myDrop?:string;myAdd?:string;partnerAdd?:string;reason:string};
export type CategoryGap={cat:string;rank:number;total:number;leader:number;gap:number;gapPct:number;leaderName:string;near:boolean};
export type Strategy={punts:string[];focus:string[];score:number;description:string;opportunity:number};
const flipped=(c:string)=>c==='TO'?-1:1;
const num=(p:Player,c:string)=>Number(p[c]||0);
const sum=(p:Player[],c:string)=>p.reduce((a,x)=>a+num(x,c),0);
const stdev=(values:number[])=>{const m=values.reduce((a,b)=>a+b,0)/Math.max(values.length,1);return Math.sqrt(values.reduce((a,b)=>a+(b-m)**2,0)/Math.max(values.length,1))||1};

export function gaps(team:string,rosters:Roster,cats:string[],all:Player[]):CategoryGap[]{
 const lookup=new Map(all.map(p=>[p.draftId,p]));
 return cats.map(cat=>{
  const teams=Object.entries(rosters).map(([name,ids])=>({name,total:sum(ids.map(id=>lookup.get(id)).filter(Boolean) as Player[],cat)}))
   .sort((a,b)=>flipped(cat)*(b.total-a.total));
  const me=teams.find(x=>x.name===team),leader=teams[0],total=me?.total||0;
  const gap=Math.max(0,flipped(cat)*(leader.total-total));
  return {cat,rank:teams.findIndex(x=>x.name===team)+1,total,leader:leader.total,gap,gapPct:Math.max(0,Math.min(1,gap/Math.max(Math.abs(leader.total),1))),leaderName:leader.name,near:gap<=stdev(teams.map(t=>t.total))*.6};
 });
}
export function strategies(team:string,rosters:Roster,cats:string[],all:Player[]):Strategy[]{
 const rows=gaps(team,rosters,cats,all);
 const scales=Object.fromEntries(cats.map(cat=>{
  const lookup=new Map(all.map(p=>[p.draftId,p]));
  return [cat,stdev(Object.values(rosters).map(ids=>sum(ids.map(id=>lookup.get(id)).filter(Boolean) as Player[],cat)))];
 }));
 const opportunity=(row:CategoryGap)=>Math.exp(-row.gap/Math.max(scales[row.cat],1));
 const sorted=rows.slice().sort((a,b)=>opportunity(a)-opportunity(b));
 const combos:string[][]=[[],...sorted.map(x=>[x.cat])];
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++)combos.push([sorted[i].cat,sorted[j].cat]);
 return combos.map(punts=>{
  const focus=rows.filter(x=>!punts.includes(x.cat)).sort((a,b)=>opportunity(b)-opportunity(a)).slice(0,4).map(x=>x.cat);
  // This measures accessible category leads, NOT a fictional gain from ignoring a category.
  const opportunitySum=rows.filter(x=>!punts.includes(x.cat)).reduce((n,x)=>n+opportunity(x),0);
  const ignoredCost=rows.filter(x=>punts.includes(x.cat)).reduce((n,x)=>n+opportunity(x),0);
  const score=opportunitySum-ignoredCost*.35;
  return {punts,focus,score,opportunity:opportunitySum,description:punts.length?'Deprioritize '+punts.join(' and ')+' when assessing potential moves. Existing projected totals do not change.':'Keep all nine categories in play.'};
 }).sort((a,b)=>b.score-a.score).slice(0,7);
}
function lookupValue(all:Player[],cats:string[]){
 const av=Object.fromEntries(cats.map(c=>[c,all.reduce((n,p)=>n+num(p,c),0)/Math.max(all.length,1)]));
 const sd=Object.fromEntries(cats.map(c=>[c,stdev(all.map(p=>num(p,c)))]));
 const scores=all.map(p=>({p,score:cats.reduce((n,c)=>n+flipped(c)*(num(p,c)-av[c])/sd[c],0)})).sort((a,b)=>b.score-a.score);
 const market=new Map<string,number>(),raw=new Map<string,number>();
 scores.forEach(({p,score},i)=>{
  raw.set(p.draftId,score);
  const projectionRank=i+1;
  const rank=Number(p.adp)>0?projectionRank*.77+Math.min(300,Number(p.adp))*.23:projectionRank;
  market.set(p.draftId,5+100*Math.pow(Math.max(0,1-rank/(all.length+35)),2.1));
 });
 return {market,raw};
}
function share(rosters:Roster,cats:string[],lookup:Map<string,Player>){
 const totals=Object.fromEntries(Object.entries(rosters).map(([t,ids])=>[t,Object.fromEntries(cats.map(c=>[c,sum(ids.map(id=>lookup.get(id)).filter(Boolean) as Player[],c)]))]));
 const shares=Object.fromEntries(Object.keys(rosters).map(t=>[t,0]));
 for(const cat of cats){
  const raw=Object.keys(rosters).map(t=>flipped(cat)*totals[t][cat]),mean=raw.reduce((a,b)=>a+b,0)/raw.length,range=Math.max(...raw)-Math.min(...raw);
  const scale=Math.max(range*.22,Math.abs(mean)*.09,1),maximum=Math.max(...raw);
  const probs=raw.map(x=>Math.exp((x-maximum)/scale)),denom=probs.reduce((a,b)=>a+b,0);
  Object.keys(rosters).forEach((t,i)=>shares[t]+=probs[i]/denom);
 }
 return shares;
}
function packages(ids:string[],n:number){
 if(n===1)return ids.map(x=>[x]);
 const out:string[][]=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)out.push([ids[i],ids[j]]);
 return out;
}
export function findDeals(rosters:Roster,from:string,all:Player[],cats:string[],format:DealFormat='1:1',ignored:string[]=[],limit=12):{rows:Candidate[];examined:number;fairCount:number}{
 const lookup=new Map(all.map(p=>[p.draftId,p])),v=lookupValue(all,cats),market=v.market,raw=v.raw;
 const sides=format.split(':').map(Number),otherNames=Object.keys(rosters).filter(t=>t!==from);
 const base=share(rosters,cats,lookup),taken=new Set(Object.values(rosters).flat());
 const free=all.filter(p=>!taken.has(p.draftId)).sort((a,b)=>(market.get(b.draftId)||0)-(market.get(a.draftId)||0));
 const additions=free.slice(0,4);
 const myPacks=packages(rosters[from]||[],sides[0]);
 const rows:Candidate[]=[];
 let examined=0,fairCount=0;
 for(const other of otherNames){
  const theirPacks=packages(rosters[other]||[],sides[1]);
  const preliminary:{mine:string[];theirs:string[];difference:number}[]=[];
  for(const mine of myPacks)for(const theirs of theirPacks){
   examined++;
   const a=mine.reduce((n,id)=>n+(market.get(id)||0),0),b=theirs.reduce((n,id)=>n+(market.get(id)||0),0);
   const difference=Math.abs(a-b)/Math.max(a,b,1);
   // Hard value guardrail: prevents star-for-role-player proposals like Braun/Wembanyama.
   if(difference>(format==='1:1'?.19:.22))continue;
   // High-end elite-for-nonelite 1:1s demand a very close market value.
   if(format==='1:1'&&Math.max(a,b)>88&&difference>.105)continue;
   fairCount++;
   preliminary.push({mine,theirs,difference});
  }
  preliminary.sort((a,b)=>a.difference-b.difference);
  for(const {mine,theirs,difference} of preliminary.slice(0,110)){
   const draft:Roster=Object.fromEntries(Object.entries(rosters).map(([t,ids])=>[t,[...ids]]));
   draft[from]=draft[from].filter(x=>!mine.includes(x)).concat(theirs);
   draft[other]=draft[other].filter(x=>!theirs.includes(x)).concat(mine);
   let myDrop:string|undefined,partnerDrop:string|undefined,myAdd:string|undefined,partnerAdd:string|undefined;
   const beforeSize=rosters[from].length,otherSize=rosters[other].length;
   if(draft[from].length>beforeSize){myDrop=draft[from].slice().sort((a,b)=>(market.get(a)||0)-(market.get(b)||0))[0];draft[from]=draft[from].filter(id=>id!==myDrop)}
   if(draft[other].length>otherSize){partnerDrop=draft[other].slice().sort((a,b)=>(market.get(a)||0)-(market.get(b)||0))[0];draft[other]=draft[other].filter(id=>id!==partnerDrop)}
   const used=new Set(Object.values(draft).flat());
   const nextFree=additions.filter(p=>!used.has(p.draftId));
   if(draft[from].length<beforeSize){myAdd=nextFree[0]?.draftId;if(!myAdd)continue;draft[from].push(myAdd)}
   if(draft[other].length<otherSize){partnerAdd=nextFree.find(p=>p.draftId!==myAdd)?.draftId;if(!partnerAdd)continue;draft[other].push(partnerAdd)}
   const mineValue=draft[from].reduce((n,id)=>n+(raw.get(id)||0),0)-rosters[from].reduce((n,id)=>n+(raw.get(id)||0),0);
   const theirsValue=draft[other].reduce((n,id)=>n+(raw.get(id)||0),0)-rosters[other].reduce((n,id)=>n+(raw.get(id)||0),0);
   // No deals that severely damage the other manager's overall projected production.
   if(theirsValue < -1.3 || mineValue < -3)continue;
   const after=share(draft,cats,lookup),cashMine=after[from]-base[from],cashTheirs=after[other]-base[other];
   if(cashMine<=.002 || cashTheirs<-.018)continue;
   const benefit=cashMine+cashTheirs*.35-Math.max(0,-theirsValue)*.018-difference*.09;
   rows.push({other,give:mine,receive:theirs,format,cashMine,cashTheirs,fairness:1-difference,partnerGain:theirsValue,myGain:mineValue,partnerDrop,myDrop,myAdd,partnerAdd,reason:'Comparable projected market value and limited partner downside',_priority:benefit} as Candidate & {_priority:number});
  }
 }
 rows.sort((a,b)=>((b as Candidate & {_priority:number})._priority)-((a as Candidate & {_priority:number})._priority));
 return {rows:rows.slice(0,limit),examined,fairCount};
}
export function tradeMoves(deal:Candidate,from:string){
 const other=deal.other,actions:{kind:string;team:string;other:string;give:string;receive:string}[]=[];
 const put=(kind:string,team:string,other:string,give='',receive='')=>actions.push({kind,team,other,give,receive});
 for(let i=0;i<Math.min(deal.give.length,deal.receive.length);i++)put('swap',from,other,deal.give[i],deal.receive[i]);
 for(const id of deal.give.slice(deal.receive.length))put('move',from,other,id);
 for(const id of deal.receive.slice(deal.give.length))put('move',other,from,id);
 if(deal.myDrop)put('drop',from,'',deal.myDrop);
 if(deal.partnerDrop)put('drop',other,'',deal.partnerDrop);
 if(deal.myAdd)put('add',from,'','',deal.myAdd);
 if(deal.partnerAdd)put('add',other,'','',deal.partnerAdd);
 return actions;
}
