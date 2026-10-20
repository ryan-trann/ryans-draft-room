import type {Player,Roster} from './engine';

export type DealFormat='1:1'|'2:2';
export type TradeVerdict='strong'|'situational'|'avoid';
export type Candidate={verdict:TradeVerdict;rivalRisk:'high'|'medium'|'low';adjustedGain:number;other:string;give:string[];receive:string[];format:DealFormat;cashMine:number;cashTheirs:number;fairness:number;partnerGain:number;myGain:number;potMine:number;potTheirs:number;potBefore:number;potAfter:number;partnerPotBefore:number;partnerPotAfter:number;partnerDrop?:string;myDrop?:string;myAdd?:string;partnerAdd?:string;reason:string};
export type CategoryGap={cat:string;rank:number;total:number;leader:number;gap:number;gapPct:number;leaderName:string;near:boolean};
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
function lookupValue(all:Player[],cats:string[]){
 const pg=(p:Player,c:string)=>num(p,c)/Math.max(1,p.GP);
 const av=Object.fromEntries(cats.map(c=>[c,all.reduce((n,p)=>n+pg(p,c),0)/Math.max(all.length,1)]));
 const sd=Object.fromEntries(cats.map(c=>[c,stdev(all.map(p=>pg(p,c)))]));
 const z=(p:Player)=>cats.reduce((n,c)=>n+flipped(c)*(pg(p,c)-av[c])/sd[c],0);
 const ranked=all.map(p=>({p,score:z(p)})).sort((a,b)=>b.score-a.score);
 const replacement=ranked.slice(Math.max(0,168),Math.max(1,178));
 const replacementValue=replacement.reduce((n,v)=>n+v.score,0)/Math.max(1,replacement.length);
 const market=new Map<string,number>(),raw=new Map<string,number>();
 for(const {p,score} of ranked){
  const value=Math.max(0,(score-replacementValue)*Math.max(0,Number(p.GP)||0)/82);
  raw.set(p.draftId,value);
  market.set(p.draftId,value);
 }
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

// A side-bet payout is awarded to the team with the MOST category leads
// in each simulated week. Tied leading teams split the pot, not the categories.
// These are *heuristic* scenarios from projected totals, not calibrated
// weekly NBA distributions or real Yahoo matchup outcomes.
const POT_TRIALS=2048;
const PRIMES=[2,3,5,7,11,13,17,19,23];
function halton(index:number,base:number){let f=1,r=0;while(index>0){f/=base;r+=f*(index%base);index=Math.floor(index/base)}return r}
const POT_DRAWS=Array.from({length:POT_TRIALS},(_,i)=>PRIMES.map(p=>halton(i+1,p)));
type PotResult={teams:string[];shares:Record<string,number>;trials:number};
export function estimatePot(rosters:Roster,cats:string[],all:Player[],trials=POT_TRIALS):PotResult{
 const lookup=new Map(all.map(p=>[p.draftId,p]));
 return potFromLookup(rosters,cats,lookup,trials);
}
function potFromLookup(rosters:Roster,cats:string[],lookup:Map<string,Player>,trials=POT_TRIALS):PotResult{
 const totals=Object.fromEntries(Object.entries(rosters).map(([t,ids])=>[t,Object.fromEntries(cats.map(c=>[c,sum(ids.map(id=>lookup.get(id)).filter(Boolean) as Player[],c)]))]));
 return estimatePotFromTotals(totals,cats,trials);
}
export function estimatePotFromTotals(totalsByTeam:Record<string,Record<string,number>>,cats:string[],trials=POT_TRIALS):PotResult{
 const teams=Object.keys(totalsByTeam),n=teams.length;
 const totals=teams.map(t=>cats.map(c=>totalsByTeam[t][c]||0));
 // Model noisy weekly outcomes rather than drawing independent category winners
 // from arbitrary softmax shares. Common deterministic random numbers keep
 // before/after trade comparisons stable. One shared team factor captures the
 // tendency for high-game weeks to improve several categories together.
 const won=new Float64Array(n),categoryWins=new Uint8Array(n);
 const weekly=totals.map(row=>row.map(v=>v/19)); // 82-game season ≈ 19 matchup weeks
 const normal=(trial:number,team:number,cat:number)=>{
  const u=Math.max(1e-9,halton(trial+1+team*13,PRIMES[(cat*2)%PRIMES.length]));
  const v=halton(trial+1+team*19,PRIMES[(cat*2+1)%PRIMES.length]);
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
 };
 for(let trial=0;trial<trials;trial++){
  categoryWins.fill(0);
  const shared=teams.map((_,i)=>normal(trial,i,8));
  for(let k=0;k<cats.length;k++){
   let leader=0,best=-Infinity;
   for(let i=0;i<n;i++){
    const mean=weekly[i][k];
    // Counting-stat dispersion + week-to-week playing-time variation.
    const spread=Math.sqrt(Math.max(1,Math.abs(mean)*1.15+mean*mean*.025));
    const draw=mean+spread*(normal(trial,i,k)*.93+shared[i]*.37);
    const oriented=flipped(cats[k])*draw;
    if(oriented>best){best=oriented;leader=i}
   }
   categoryWins[leader]++;
  }
  let highest=0,count=0;
  for(let i=0;i<n;i++)if(categoryWins[i]>highest){highest=categoryWins[i];count=1}else if(categoryWins[i]===highest)count++;
  if(highest>0)for(let i=0;i<n;i++)if(categoryWins[i]===highest)won[i]+=1/count;
 }
 return {teams,shares:Object.fromEntries(teams.map((team,i)=>[team,won[i]/trials])),trials};
}
export function potImpact(before:Roster,after:Roster,cats:string[],all:Player[],from:string,other:string){
 const lookup=new Map(all.map(p=>[p.draftId,p]));
 const a=potFromLookup(before,cats,lookup),b=potFromLookup(after,cats,lookup);
 return {mine:b.shares[from]-a.shares[from],theirs:b.shares[other]-a.shares[other],beforeMine:a.shares[from],afterMine:b.shares[from],beforeTheirs:a.shares[other],afterTheirs:b.shares[other],trials:a.trials};
}
function packages(ids:string[],n:number){
 if(n===1)return ids.map(x=>[x]);
 const out:string[][]=[];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)out.push([ids[i],ids[j]]);
 return out;
}
export function findDeals(rosters:Roster,from:string,all:Player[],cats:string[],format:DealFormat='1:1',ignored:string[]=[],limit=12):{rows:Candidate[];examined:number;fairCount:number;avoided:number}{
 const lookup=new Map(all.map(p=>[p.draftId,p])),v=lookupValue(all,cats),market=v.market,raw=v.raw;
 const sides=format.split(':').map(Number),otherNames=Object.keys(rosters).filter(t=>t!==from);
 const base=share(rosters,cats,lookup),targetCats=cats.filter(c=>!ignored.includes(c)),focusBase=share(rosters,targetCats.length?targetCats:cats,lookup),taken=new Set(Object.values(rosters).flat());
 const free=all.filter(p=>!taken.has(p.draftId)).sort((a,b)=>(market.get(b.draftId)||0)-(market.get(a.draftId)||0));
 const additions=free.slice(0,4);
 const myPacks=packages(rosters[from]||[],sides[0]);
 const potential:(Candidate & {_priority:number;_roster:Roster})[]=[];
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
   // Star trades need closer projected value than ordinary offers.
   if(format==='1:1'&&Math.max(a,b)>12&&difference>.12)continue;
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
   if(draft[from].length>beforeSize){myDrop=draft[from].filter(id=>!theirs.includes(id)).sort((a,b)=>(market.get(a)||0)-(market.get(b)||0))[0];if(!myDrop)continue;draft[from]=draft[from].filter(id=>id!==myDrop)}
   if(draft[other].length>otherSize){partnerDrop=draft[other].filter(id=>!mine.includes(id)).sort((a,b)=>(market.get(a)||0)-(market.get(b)||0))[0];if(!partnerDrop)continue;draft[other]=draft[other].filter(id=>id!==partnerDrop)}
   const used=new Set(Object.values(draft).flat());
   const nextFree=additions.filter(p=>!used.has(p.draftId));
   if(draft[from].length<beforeSize){myAdd=nextFree[0]?.draftId;if(!myAdd)continue;draft[from].push(myAdd)}
   if(draft[other].length<otherSize){partnerAdd=nextFree.find(p=>p.draftId!==myAdd)?.draftId;if(!partnerAdd)continue;draft[other].push(partnerAdd)}
   const mineValue=draft[from].reduce((n,id)=>n+(raw.get(id)||0),0)-rosters[from].reduce((n,id)=>n+(raw.get(id)||0),0);
   const theirsValue=draft[other].reduce((n,id)=>n+(raw.get(id)||0),0)-rosters[other].reduce((n,id)=>n+(raw.get(id)||0),0);
   // No deals that severely damage the other manager's overall projected production.
   if(theirsValue < -1.3 || mineValue < -3)continue;
   const after=share(draft,cats,lookup),cashMine=after[from]-base[from],cashTheirs=after[other]-base[other];
   if(cashTheirs<-.018 || cashMine<-.09)continue;
   const focusAfter=share(draft,targetCats.length?targetCats:cats,lookup);
   const focusedGain=focusAfter[from]-focusBase[from];
   // Partner gain is a feasibility constraint, NEVER a positive ranking bonus.
   const benefit=cashMine*.73+focusedGain*.27-Math.max(0,-theirsValue)*.012-difference*.035;
   potential.push({other,give:mine,receive:theirs,format,cashMine,cashTheirs,fairness:1-difference,partnerGain:theirsValue,myGain:mineValue,potMine:0,potTheirs:0,potBefore:0,potAfter:0,partnerPotBefore:0,partnerPotAfter:0,verdict:'situational',rivalRisk:'low',adjustedGain:0,partnerDrop,myDrop,myAdd,partnerAdd,reason:'Comparable projected value and limited partner downside',_priority:benefit,_roster:draft});
  }
 }
 // Cheap category-share screening selects diverse plausible offers to simulate.
 // Final ordering, however, is ONLY Ryan's modeled POT payout improvement.
 potential.sort((a,b)=>b._priority-a._priority);
 const seen=new Set<string>(),shortlist:typeof potential=[];
 const perOpponent=new Map<string,number>();
 for(const row of potential){
  if((perOpponent.get(row.other)||0)>=20)continue;
  const key=[row.other,...row.give,...row.receive].join('|');
  if(seen.has(key))continue;
  seen.add(key);perOpponent.set(row.other,(perOpponent.get(row.other)||0)+1);
  shortlist.push(row);
 }
 const potBefore=potFromLookup(rosters,cats,lookup);
 const ranked:Candidate[]=[];
 let avoided=0;
 const threats=Object.entries(potBefore.shares).filter(([t])=>t!==from).sort((a,b)=>b[1]-a[1]);
 const strongest=new Set(threats.slice(0,Math.max(3,Math.ceil(threats.length/3))).map(([t])=>t));
 for(const proposal of shortlist){
  const result=potFromLookup(proposal._roster,cats,lookup);
  const mineGain=result.shares[from]-potBefore.shares[from];
  // Do not recommend deals whose actual side-bet payout estimate declines.
  if(mineGain<=0.0001)continue;
  const partnerGain=result.shares[proposal.other]-potBefore.shares[proposal.other];
  const opponentBefore=potBefore.shares[proposal.other],opponentAfter=result.shares[proposal.other];
  const ownAfter=result.shares[from];
  const rivalRisk:'high'|'medium'|'low'=strongest.has(proposal.other)||opponentBefore>=potBefore.shares[from]*.85?'high':opponentAfter>=ownAfter*.75?'medium':'low';
  // An already-dangerous rival cannot gain more than Ryan in a recommended trade.
  // A weak rival may improve more if Ryan's expected pot share still improves.
  const downside=Math.max(0,partnerGain-mineGain);
  const riskWeight=rivalRisk==='high'?1.25:rivalRisk==='medium'?.65:.2;
  const adjustedGain=mineGain-downside*riskWeight;
  const verdict:TradeVerdict=partnerGain<=mineGain+.0005?'strong':rivalRisk==='low'&&adjustedGain>0?'situational':'avoid';
  if(verdict==='avoid'||adjustedGain<=0){avoided++;continue;}
  ranked.push({...proposal,potMine:mineGain,potTheirs:partnerGain,potBefore:potBefore.shares[from],potAfter:ownAfter,partnerPotBefore:opponentBefore,partnerPotAfter:opponentAfter,rivalRisk,adjustedGain,verdict});
 }
 ranked.sort((a,b)=>(a.verdict==='strong'?0:1)-(b.verdict==='strong'?0:1)||b.adjustedGain-a.adjustedGain||b.potMine-a.potMine||b.fairness-a.fairness);
 return {rows:ranked.slice(0,limit),examined,fairCount,avoided};
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
