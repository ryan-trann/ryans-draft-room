import assert from 'node:assert/strict';
import {starters} from '../frontend/lineups.ts';
import {SeasonProjection,rankTotals} from '../frontend/season-projections.ts';

const cats=['OREB','DREB','AST','TO'];
const p=(id,positions='C',team='BOS',score=1,gp=82)=>({draftId:id,name:id,positions,team,rank:1,adp:null,sourceRow:1,GP:gp,score,OREB:score*gp,DREB:score*2*gp,AST:score*.5*gp,TO:score*.25*gp});
const value=p=>p.score;
const centers=Array.from({length:7},(_,i)=>p('c'+i,'C','BOS',7-i));
const selected=starters(centers,value);
assert.equal(selected.length,5,'7 C-only players must fit only 2 C + 3 UTIL');
assert.deepEqual(selected.map(p=>p.draftId).sort(),['c0','c1','c2','c3','c4'],'start strongest players');
assert.equal(starters([centers[0],centers[0]],value).length,1,'never start a player twice');
assert.equal(starters(Array.from({length:7},(_,i)=>p('g'+i,'PG')),value).length,5,'PG-only: PG + G + 3 UTIL');
const flexible=[p('flex','PG,SG'),p('pg','PG'),p('sg','SG'),p('sf','SF'),p('pf','PF'),p('f','SF,PF'),...centers.slice(0,5)];
assert.equal(starters(flexible,value).length,11,'flexibility must leave no avoidable empty slots');
assert.equal(starters([...centers,p('forward-center','PF,C')],value).length,6,'PF,C player may use PF/F rather than C');
const full=Array.from({length:14},(_,i)=>p('all'+i,'PG,SG,SF,PF,C','BOS',14-i));
assert.equal(starters(full,value).length,11,'never count more than 11 players in one day');

// Compare the matching result with exhaustive legal subsets on small mixed
// rosters: catches position-order errors that simple all-C tests cannot.
const legal=subset=>{
 const capacity={PG:1,SG:1,G:1,SF:1,PF:1,F:1,C:2,UTIL:3};
 const assign=i=>{if(i===subset.length)return true;const positions=subset[i].positions.split(',');for(const slot of Object.keys(capacity)){
  const fits=slot==='UTIL'||positions.includes(slot)||(slot==='G'&&positions.some(v=>v==='PG'||v==='SG'))||(slot==='F'&&positions.some(v=>v==='SF'||v==='PF'));
  if(!capacity[slot]||!fits)continue;capacity[slot]--;if(assign(i+1))return true;capacity[slot]++;
 }return false};
 return assign(0);
};
for(let sample=0;sample<12;sample++){
 const positions=['C','PG','SG','SF','PF','PF,C','PG,SG','SF,PF'];
 const roster=Array.from({length:8},(_,i)=>p('r'+i,positions[(i*3+sample)%positions.length],'BOS',(i*7+sample*11)%19-9));
 let bestCount=-1,bestScore=-Infinity;
 for(let mask=0;mask<1<<roster.length;mask++){
  const sub=roster.filter((_,i)=>mask&(1<<i));if(sub.length<bestCount||!legal(sub))continue;
  const score=sub.reduce((n,p)=>n+p.score,0);if(sub.length>bestCount||score>bestScore){bestCount=sub.length;bestScore=score}
 }
 const got=starters(roster,value);assert.equal(got.length,bestCount);assert.equal(got.reduce((n,p)=>n+p.score,0),bestScore);
}
const schedule={season:'2026-27',generatedAt:'2026-10-23',source:'test',games:[{date:'2026-10-25',home:'BOS',away:'NY'},{date:'2026-10-26',home:'BOS',away:'GS'}]};
const model=new SeasonProjection(centers,cats,schedule),ids=centers.map(p=>p.draftId),out=model.team(ids);
assert.equal(out.scheduled,14);assert.equal(out.startable,10);assert.equal(out.blocked,4);
for(const c of cats){
 const expected=centers.slice(0,5).reduce((n,p)=>n+p[c]/p.GP*2,0);
 assert.ok(Math.abs(out.totals[c]-expected)<1e-9,'same lineup must contribute to '+c);
}
assert.equal(model.team(ids.slice(0,4)).blocked,0,'benched/IL players excluded by caller cannot contribute');
const firstDay=model.forRange('2026-10-25','2026-10-25'),secondDay=model.forRange('2026-10-26','2026-10-26');
assert.equal(firstDay.team(ids).scheduled,7);assert.equal(firstDay.team(ids).startable,5);assert.equal(firstDay.team(ids).blocked,2);
for(const c of cats)assert.ok(Math.abs(firstDay.team(ids).totals[c]+secondDay.team(ids).totals[c]-out.totals[c])<1e-9,'inclusive date windows must sum to the full period');
const emptyWeek=model.forRange('2026-11-01','2026-11-07').team(ids);
assert.equal(emptyWeek.scheduled,0);assert.equal(emptyWeek.startable,0);assert.ok(cats.every(c=>emptyWeek.totals[c]===0));
assert.deepEqual(model.team(ids),out,'weekly projection cannot change season projection');
assert.throws(()=>model.forRange('2026-10-26','2026-10-25'),/Invalid/);

const availabilityModel=new SeasonProjection([p('half','C','GSW',2,41)],cats,schedule);
assert.equal(availabilityModel.team(['half']).expectedStarted,.5,'preserve GP forecast, normalize GS/GSW');
assert.equal(availabilityModel.team(['half']).totals.OREB,1,'per-game stats × starts × GP/82');
assert.equal(availabilityModel.team(['half'],()=>.5).totals.OREB,.5,'injury adjustments preserve lineup limits');
const staggered=centers.map((x,i)=>({...x,team:i%2?'NYK':'GSW'}));
const staggeredModel=new SeasonProjection(staggered,cats,schedule);
assert.equal(staggeredModel.team(ids).blocked,0,'centers playing different dates must not collide');
const duplicateModel=new SeasonProjection(centers,cats,{...schedule,games:[...schedule.games,...schedule.games]});
assert.deepEqual(duplicateModel.team(ids),out,'duplicate schedule entries cannot double count');
assert.deepEqual(model.team([...ids].reverse()),out,'roster ordering cannot change the result');
const changed=model.team(ids.slice(2));assert.notEqual(changed.totals.OREB,out.totals.OREB,'hypothetical rosters must be recalculated');
const rows=rankTotals({A:{OREB:10,TO:5},B:{OREB:10,TO:8},C:{OREB:8,TO:5}},['OREB','TO']);
assert.equal(rows.find(r=>r.team==='A').ranks.OREB,1.5);assert.equal(rows.find(r=>r.team==='A').ranks.TO,1.5);assert.equal(rows.find(r=>r.team==='B').ranks.TO,3);
assert.ok(rows.every(r=>Number.isFinite(r.points)));
console.log('Daily lineup tests passed: C congestion, 11-slot limit, flexible matching, strongest legal lineup, staggered games, shared category totals, GP availability, aliases, duplicates and tied ranks.');
