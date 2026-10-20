'use strict';
// Derived from the original ZIP's trade-service category-rank comparisons and
// streaming-service per-game × weekly-games scoring. No Yahoo dependency.
const ANALYSIS_CATS=['FGM','FTM','3PM','OREB','DREB','AST','STL','BLK','TO'];
function analysisPlayers(t){return (currentRosters[t]||[]).map(id=>state.projections.find(p=>p.draftId===id)).filter(Boolean)}
function analysisTotals(ids){
 const totals=Object.fromEntries(ANALYSIS_CATS.map(c=>[c,0]));
 for(const id of ids){const p=state.projections.find(p=>p.draftId===id);if(p)for(const c of ANALYSIS_CATS)totals[c]+=Number(p[c]||0)}
 return totals;
}
function analysisAllTotals(rosters){return Object.fromEntries(TEAMS.map(t=>[t,analysisTotals(rosters[t]||[])]))}
function analysisRanks(totals){
 const ranks=Object.fromEntries(TEAMS.map(t=>[t,{}]));
 for(const cat of ANALYSIS_CATS){
  const ordered=[...TEAMS].sort((a,b)=>cat==='TO'?totals[a][cat]-totals[b][cat]:totals[b][cat]-totals[a][cat]);
  for(let i=0;i<ordered.length;i++){
   let j=i+1;while(j<ordered.length&&Math.abs(totals[ordered[j]][cat]-totals[ordered[i]][cat])<1e-8)j++;
   for(let k=i;k<j;k++)ranks[ordered[k]][cat]=(i+j+1)/2;
   i=j-1;
  }
 }
 return ranks;
}
function analysisGrade(rosters,first,second){
 const before=analysisAllTotals(currentRosters),after=analysisAllTotals(rosters),rankBefore=analysisRanks(before),rankAfter=analysisRanks(after);
 // More league-rank improvement = larger positive score.
 const grade=t=>ANALYSIS_CATS.reduce((v,c)=>v+(rankBefore[t][c]-rankAfter[t][c]),0);
 const delta=t=>Object.fromEntries(ANALYSIS_CATS.map(c=>[c,{old:before[t][c],new:after[t][c],oldRank:rankBefore[t][c],newRank:rankAfter[t][c]}]));
 return {first:grade(first),second:grade(second),a:delta(first),b:delta(second)};
}

// Estimate the share of weekly category-leading payouts using smooth relative
// win probabilities rather than treating each league-rank position equally.
// This is an analytical approximation; it is not historical NBA injury modeling.
function cashShareModel(rosters){
 const totals=analysisAllTotals(rosters),result=Object.fromEntries(TEAMS.map(t=>[t,{share:0,cats:{}}]));
 for(const cat of ANALYSIS_CATS){
  const raw=TEAMS.map(t=>(cat==='TO'?-1:1)*totals[t][cat]);
  const mean=raw.reduce((a,b)=>a+b,0)/raw.length;
  const range=Math.max(...raw)-Math.min(...raw);
  const scale=Math.max(range*.22,Math.abs(mean)*.09,1);
  const max=Math.max(...raw);
  const weights=raw.map(x=>Math.exp((x-max)/scale));
  const sum=weights.reduce((a,b)=>a+b,0);
  TEAMS.forEach((t,i)=>{const prob=weights[i]/sum;result[t].share+=prob;result[t].cats[cat]=prob});
 }
 return result;
}
function cashImpact(before,after,a,b){
 const x=cashShareModel(before),y=cashShareModel(after);
 return {a:y[a].share-x[a].share,b:y[b].share-x[b].share,
  beforeA:x[a].share,afterA:y[a].share,beforeB:x[b].share,afterB:y[b].share,
  catA:Object.fromEntries(ANALYSIS_CATS.map(c=>[c,y[a].cats[c]-x[a].cats[c]])),
  catB:Object.fromEntries(ANALYSIS_CATS.map(c=>[c,y[b].cats[c]-x[b].cats[c]]))};
}
function cashDetails(delta,team){
 return '<div class="muted">'+esc(team)+' category-leading probability changes: '+ANALYSIS_CATS.map(c=>c+' '+(delta[c]>=0?'+':'')+(delta[c]*100).toFixed(1)+'pp').join(' · ')+'</div>';
}
function analysisSelect(id,values,prefer){
 const e=$(id),value=e.value||prefer;
 e.innerHTML=values.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>').join('');
 if(values.some(o=>o.id===value))e.value=value;
}
function analysisTeamOptions(){return TEAMS.map(t=>({id:t,label:t}))}
function analysisPlayerOptions(team){return analysisPlayers(team).map(p=>({id:p.draftId,label:playerLabel(p)}))}
function analysisRefresh(){
 analysisSelect('tradeA',analysisTeamOptions(),'Ryan');analysisSelect('tradeB',analysisTeamOptions().filter(t=>t.id!==$('tradeA').value));
 analysisSelect('tradeGive',analysisPlayerOptions($('tradeA').value));
 analysisSelect('tradeReceive',analysisPlayerOptions($('tradeB').value));
 analysisSelect('recommendFrom',analysisTeamOptions(),'Ryan');
 analysisSelect('streamTeam',analysisTeamOptions(),'Ryan');
}
$('tradeA').onchange=()=>{analysisRefresh()};
$('tradeB').onchange=()=>{analysisRefresh()};
$('recommendFrom').onchange=()=>{};
$('streamTeam').onchange=()=>{};
function analysisSwap(rosters,a,b,x,y){
 const out=Object.fromEntries(TEAMS.map(t=>[t,[...rosters[t]]]));
 if(a===b)throw Error('Choose different teams');
 if(!out[a].includes(x)||!out[b].includes(y))throw Error('Player not on selected team');
 out[a].splice(out[a].indexOf(x),1,y);out[b].splice(out[b].indexOf(y),1,x);
 return out;
}
function analysisGradeHtml(grade,a,b){
 const row=(team,cells)=>'<div class="pick"><strong>'+esc(team)+'</strong><span class="muted"> League-rank change: '+(cells>=0?'+':'')+cells.toFixed(1)+'</span></div>';
 return row(a,grade.first)+row(b,grade.second)+
 '<div style="overflow:auto"><table><thead><tr><th>Category</th><th>'+esc(a)+' rank</th><th>'+esc(b)+' rank</th></tr></thead><tbody>'+
 ANALYSIS_CATS.map(c=>'<tr><td>'+c+'</td><td>'+grade.a[c].oldRank+' → '+grade.a[c].newRank+'</td><td>'+grade.b[c].oldRank+' → '+grade.b[c].newRank+'</td></tr>').join('')+'</tbody></table></div>';
}
$('analyzeTrade').onclick=()=>{
 try{
  const a=$('tradeA').value,b=$('tradeB').value,x=$('tradeGive').value,y=$('tradeReceive').value;
  const proposal=analysisSwap(currentRosters,a,b,x,y),result=analysisGrade(proposal,a,b),cash=cashImpact(currentRosters,proposal,a,b);
  $('tradeResults').innerHTML='<p><strong>'+esc(editorName(x))+'</strong> ('+esc(a)+') for <strong>'+esc(editorName(y))+'</strong> ('+esc(b)+')</p>'+
   '<p><strong>Estimated weekly side-bet change:</strong> '+esc(a)+' '+(cash.a>=0?'+':'')+cash.a.toFixed(3)+' category shares; '+esc(b)+' '+(cash.b>=0?'+':'')+cash.b.toFixed(3)+' shares.</p>'+cashDetails(cash.catA,a)+cashDetails(cash.catB,b)+analysisGradeHtml(result,a,b)+'<p class="muted">Estimated shares are a heuristic sensitivity model, not calibrated winning probabilities. Projected season-category ranks; historical draft remains unchanged. This is an analysis only—no trade is saved.</p>';
 }catch(e){$('tradeResults').textContent=e.message}
};
$('recommendTrades').onclick=()=>{
 const from=$('recommendFrom').value, max=Math.max(1,Math.min(20,Number($('recommendMax').value)||10));
 const mine=currentRosters[from]||[],others=TEAMS.filter(t=>t!==from);
 const recommended=[];
 for(const other of others)for(const x of mine)for(const y of currentRosters[other]||[]){
  try{
   const updated=analysisSwap(currentRosters,from,other,x,y);
   const g=analysisGrade(updated,from,other),cash=cashImpact(currentRosters,updated,from,other);
   recommended.push({other,x,y,my:g.first,their:g.second,cashMine:cash.a,cashTheirs:cash.b,qualifies:cash.a>0&&cash.b>=-0.025});
  }catch(e){}
 }
 recommended.sort((a,b)=>Number(b.qualifies)-Number(a.qualifies)||b.cashMine-a.cashMine||b.cashTheirs-a.cashTheirs||b.my-a.my);
 const positive=recommended.filter(x=>x.qualifies);
 const results=(positive.length?positive:recommended).slice(0,max);
 $('recommendResults').innerHTML='<p class="muted">'+(positive.length?positive.length+' offers improve your estimated side-bet share with limited downside for the partner; showing strongest candidates.':'No clearly mutually beneficial one-for-one trades under the estimated side-bet model; showing best alternatives.')+'</p>'+
 results.map((x,i)=>'<div class="pick"><span class="rank">'+(i+1)+'</span><div class="grow"><strong>Give '+esc(editorName(x.x))+' · Get '+esc(editorName(x.y))+'</strong><div class="muted">Partner: '+esc(x.other)+' · Your estimated side-bet share '+(x.cashMine>=0?'+':'')+x.cashMine.toFixed(3)+' · Partner '+(x.cashTheirs>=0?'+':'')+x.cashTheirs.toFixed(3)+' · Rank changes '+(x.my>=0?'+':'')+x.my.toFixed(1)+' / '+(x.their>=0?'+':'')+x.their.toFixed(1)+'</div></div></div>').join('');
};
const NBA_ALIASES={GS:'GSW',NO:'NOP',NY:'NYK',SA:'SAS',PHO:'PHX',UTAH:'UTA',WSH:'WAS'};
function nbaCode(code){return NBA_ALIASES[String(code||'').trim().toUpperCase()]||String(code||'').trim().toUpperCase()}
function isoDay(date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
function dayFromIso(text){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(text||''))throw Error('Select a valid week.');
 const [y,m,d]=text.split('-').map(Number),date=new Date(y,m-1,d);
 if(isoDay(date)!==text)throw Error('Invalid calendar date.');
 return date;
}
function nbaDate(raw){
 const value=String(raw||'');
 if(/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);
 const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
 if(match)return [match[3],match[1].padStart(2,'0'),match[2].padStart(2,'0')].join('-');
 return null;
}
function normalizeSchedule(payload){
 if(Array.isArray(payload.games))return {source:payload.source||'Repository NBA schedule',generatedAt:payload.generatedAt||'',games:payload.games.map(x=>({date:nbaDate(x.date),home:nbaCode(x.home),away:nbaCode(x.away),startUtc:x.startUtc||null}))};
 const days=payload.leagueSchedule?.gameDates;
 if(!Array.isArray(days))throw Error('Unrecognized NBA schedule format.');
 const games=[],seen=new Set();
 for(const day of days){
  const date=nbaDate(day.gameDate);
  if(!date)continue;
  for(const g of day.games||[]){
   const id=String(g.gameId||'');
   if(!id.startsWith('002')||seen.has(id))continue;
   seen.add(id);
   games.push({date,home:nbaCode(g.homeTeam?.teamTricode),away:nbaCode(g.awayTeam?.teamTricode),startUtc:g.gameDateTimeUTC||null});
  }
 }
 return {source:'Official NBA schedule CDN',generatedAt:'',games};
}
function gamesForRange(data,start,end){
 if(!Array.isArray(data.games))throw Error('Schedule has no games.');
 const counts={},selected=data.games.filter(g=>g.date>=start&&g.date<=end&&g.home&&g.away);
 for(const g of selected){counts[g.home]=(counts[g.home]||0)+1;counts[g.away]=(counts[g.away]||0)+1}
 return {counts,gameCount:selected.length,games:selected};
}
function dateInNBAZone(utcDate){
 const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(utcDate));
 const field=part=>pieces.find(x=>x.type===part)?.value;
 return field('year')+'-'+field('month')+'-'+field('day');
}
async function getEspnWeeklySchedule(start,end){
 const months=new Set();
 let cursor=dayFromIso(start),stop=dayFromIso(end);
 while(cursor<=stop){months.add(cursor.getFullYear()+String(cursor.getMonth()+1).padStart(2,'0'));cursor.setDate(cursor.getDate()+1)}
 const games=[],seen=new Set();
 for(const month of months){
  const url='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+month+'&limit=500';
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('ESPN HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.events))throw Error('ESPN schedule format changed');
  for(const event of data.events){
   if(Number(event.season?.type)!==2||seen.has(event.id))continue;
   const competition=event.competitions?.[0];
   const home=competition?.competitors?.find(x=>x.homeAway==='home')?.team?.abbreviation;
   const away=competition?.competitors?.find(x=>x.homeAway==='away')?.team?.abbreviation;
   if(!home||!away)continue;
   seen.add(event.id);
   games.push({date:dateInNBAZone(competition.date||event.date),home:nbaCode(home),away:nbaCode(away),startUtc:competition.date||event.date});
  }
 }
 const result=gamesForRange({games},start,end);
 if(!result.gameCount)throw Error('ESPN reports no regular-season games for this week');
 return {...result,source:'ESPN NBA schedule',generatedAt:'',gameRows:games.length};
}
async function getNbaSchedule(start,end){
 // GitHub Pages-local cache keeps Safari independent of NBA cross-origin rules.
 // If the scheduled GitHub workflow has not populated it, try the official feed.
 const providers=[
  ['nba-schedule.json?fresh='+Date.now(),'GitHub schedule cache'],
  ['https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json','NBA official schedule']
 ];
 const errors=[];
 for(const [url,label] of providers){
  try{
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=normalizeSchedule(await response.json());
   if(data.games.length<100)throw Error('Schedule incomplete');
   const range=gamesForRange(data,start,end);
   if(!range.gameCount)throw Error('No regular-season games for these dates');
   return {...range,source:label,generatedAt:data.generatedAt,gameRows:data.games.length};
  }catch(e){errors.push(label+': '+e.message)}
 }
 try{return await getEspnWeeklySchedule(start,end)}catch(e){errors.push('ESPN weekly schedule: '+e.message)}
 throw Error('NBA game schedule unavailable for '+start+' to '+end+'. '+errors.join('; ')+'. Try again later or select a different week.');
}
// Yahoo's published 2026-27 DEFAULT game weeks (custom leagues may differ).
// Includes the special 14-day NBA Cup and All-Star matchups.
const YAHOO_WEEKS_2026=[
 ['2026-10-20','2026-10-25'],['2026-10-26','2026-11-01'],
 ['2026-11-02','2026-11-08'],['2026-11-09','2026-11-15'],
 ['2026-11-16','2026-11-22'],['2026-11-23','2026-11-29'],
 ['2026-11-30','2026-12-13'],['2026-12-14','2026-12-20'],
 ['2026-12-21','2026-12-27'],['2026-12-28','2027-01-03'],
 ['2027-01-04','2027-01-10'],['2027-01-11','2027-01-17'],
 ['2027-01-18','2027-01-24'],['2027-01-25','2027-01-31'],
 ['2027-02-01','2027-02-07'],['2027-02-08','2027-02-14'],
 ['2027-02-15','2027-02-28'],['2027-03-01','2027-03-07'],
 ['2027-03-08','2027-03-14'],['2027-03-15','2027-03-21'],
 ['2027-03-22','2027-03-28'],['2027-03-29','2027-04-04'],
 ['2027-04-05','2027-04-11']
];
function pacificDate(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const field=type=>parts.find(p=>p.type===type)?.value;
 return field('year')+'-'+field('month')+'-'+field('day');
}
function chooseYahooWeek(today=pacificDate()){
 return YAHOO_WEEKS_2026.findIndex(([from,to])=>from<=today&&today<=to);
}
function selectYahooWeek(index){
 if(index<0||index>=YAHOO_WEEKS_2026.length)throw Error('Outside published Yahoo season dates. Set a custom week manually.');
 const [from,to]=YAHOO_WEEKS_2026[index];
 $('streamWeekStart').value=from;$('streamWeekEnd').value=to;
 $('streamScheduleStatus').textContent='Yahoo default Week '+(index+1)+': '+from+' through '+to+'. If your private league differs, edit the dates.';
}
function initializeStreamingWeek(){
 const today=pacificDate();
 const idx=chooseYahooWeek(today);
 if(idx>=0)return selectYahooWeek(idx);
 const future=YAHOO_WEEKS_2026.findIndex(([from])=>from>today);
 if(future>=0)return selectYahooWeek(future);
 // Out-of-season visitors can still use custom date ranges.
 const d=dayFromIso(today);d.setDate(d.getDate()-((d.getDay()+6)%7));
 $('streamWeekStart').value=isoDay(d);
 const end=new Date(d);end.setDate(end.getDate()+6);
 $('streamWeekEnd').value=isoDay(end);
}
function shiftWeek(direction){
 const from=$('streamWeekStart').value,to=$('streamWeekEnd').value;
 const exact=YAHOO_WEEKS_2026.findIndex(([s,e])=>s===from&&e===to);
 if(exact>=0&&exact+direction>=0&&exact+direction<YAHOO_WEEKS_2026.length)return selectYahooWeek(exact+direction);
 const d=dayFromIso(from);d.setDate(d.getDate()+7*direction);
 $('streamWeekStart').value=isoDay(d);
 const end=new Date(d);end.setDate(end.getDate()+6);
 $('streamWeekEnd').value=isoDay(end);
 $('streamScheduleStatus').textContent='Custom week: '+$('streamWeekStart').value+' through '+$('streamWeekEnd').value+'.';
}
$('streamPreviousWeek').onclick=()=>shiftWeek(-1);
$('streamNextWeek').onclick=()=>shiftWeek(1);
$('streamWeekStart').onchange=()=>{$('streamScheduleStatus').textContent='Custom start date selected. Review your week end date.'};
$('streamWeekEnd').onchange=()=>{$('streamScheduleStatus').textContent='Custom matchup dates selected.'};
initializeStreamingWeek();
function streamingEffectiveRange(start,end,today=pacificDate()){
 if(today>end)throw Error('This matchup has ended. Select the current or a future week to find remaining games.');
 const effectiveStart=today>start?today:start;
 return {start:effectiveStart,end,remaining:effectiveStart!==start};
}

function movePacificDate(iso,days){
 const d=dayFromIso(iso);d.setDate(d.getDate()+days);return isoDay(d);
}
function eligibleGames(games,start,end,delay,now=new Date()){
 const today=pacificDate(now),availableFrom=movePacificDate(today,delay);
 const nowMs=now.getTime(),countsRoster={},countsPickup={},activeGames=[],stats={missingToday:0,expired:0,tooEarly:0};
 const increment=(obj,team)=>{obj[nbaCode(team)]=(obj[nbaCode(team)]||0)+1};
 for(const g of games){
  if(g.date<start||g.date>end)continue;
  const tipoff=g.startUtc?Date.parse(g.startUtc):NaN;
  const isToday=g.date===today;
  const alreadyStarted=Number.isFinite(tipoff)?tipoff<=nowMs:(g.date<today||isToday);
  if(isToday&&!Number.isFinite(tipoff))stats.missingToday++;
  if(alreadyStarted){stats.expired++;continue}
  increment(countsRoster,g.home);increment(countsRoster,g.away);
  activeGames.push(g);
  if(g.date<availableFrom){stats.tooEarly++;continue}
  increment(countsPickup,g.home);increment(countsPickup,g.away);
 }
 return {countsRoster,countsPickup,activeGames,stats,availableFrom,from:today};
}
function weeklyPerGame(p,c){return p.GP>0?Number(p[c]||0)/p.GP:0}
function weeklyCategoryValue(p,games){
 const z=stats(), cats=ANALYSIS_CATS;
 return cats.reduce((sum,c)=>{
  const baseline=z[c].sd/68||1;
  const contribution=(weeklyPerGame(p,c)*games)/baseline;
  return sum+(c==='TO'?-contribution:contribution);
 },0);
}
$('streamRecommend').onclick=async()=>{
 const button=$('streamRecommend');button.disabled=true;
 try{
  const start=$('streamWeekStart').value,end=$('streamWeekEnd').value;
  if(dayFromIso(start)>dayFromIso(end))throw Error('Week end must follow week start.');
  const effective=streamingEffectiveRange(start,end);
  const schedule=await getNbaSchedule(effective.start,end);
  // This league allows real-time free-agent additions before tipoff.
  // Unknown Yahoo waiver statuses are not inferred or screened.
  const eligibility=eligibleGames(schedule.games,effective.start,end,0);
  const counts=eligibility.countsRoster,pickupCounts=eligibility.countsPickup;
  const unknown=eligibility.stats.missingToday;
  $('streamScheduleStatus').textContent='NBA games still eligible this matchup: '+effective.start+' through '+end+' · '+schedule.source+' · Immediate free-agent eligibility, provided tipoff has not occurred'+(unknown?' · '+unknown+' games today lack start times and were excluded for safety.':'')+'.';
  const from=$('streamTeam').value;
  const roster=analysisPlayers(from);
  const taken=new Set(TEAMS.flatMap(t=>currentRosters[t]||[]));
  const free=state.projections.filter(p=>!taken.has(p.draftId));
  const candidateLimit=Math.max(1,Math.ceil(roster.length/2));
  const lowValueIds=new Set(roster.slice().sort((a,b)=>weeklyCategoryValue(a,1)-weeklyCategoryValue(b,1)).slice(0,candidateLimit).map(p=>p.draftId));
  const drop=roster.filter(p=>lowValueIds.has(p.draftId)&&counts[nbaCode(p.team)]!==undefined).map(p=>({p,games:counts[nbaCode(p.team)],score:weeklyCategoryValue(p,counts[nbaCode(p.team)])})).sort((a,b)=>a.score-b.score);
  const adds=free.filter(p=>pickupCounts[nbaCode(p.team)]!==undefined).map(p=>({p,games:pickupCounts[nbaCode(p.team)],score:weeklyCategoryValue(p,pickupCounts[nbaCode(p.team)])})).sort((a,b)=>b.score-a.score);
  const pairs=[];
  for(const d of drop)for(const a of adds)if(a.games>d.games){
   const gain=a.score-d.score;
   if(gain>0)pairs.push({d,a,gain});
  }
  pairs.sort((a,b)=>b.gain-a.gain);
  $('streamResults').innerHTML='<p class="muted">'+Object.keys(counts).length+' NBA teams have remaining playable games. Pickup games count only when tipoff is still in the future. Recommendations compare per-game projections × games, normalized over the nine league categories. Only positive-gain replacements with more scheduled games are shown.</p>'+
   (pairs.slice(0,15).map((x,i)=>'<div class="pick"><span class="rank">'+(i+1)+'</span><div class="grow"><strong>Drop '+esc(playerLabel(x.d.p))+' · Add '+esc(playerLabel(x.a.p))+'</strong><div class="muted">'+x.d.games+' → '+x.a.games+' games · Estimated weighted production gain +'+x.gain.toFixed(2)+'</div></div></div>').join('')||'<p>No positive-gain streaming match yet. Try a different NBA week.</p>')+
   '<p class="muted">Streaming is a short-term estimate. Real-time additions are assumed for available free agents. The app cannot identify players on waivers; confirm their availability in Yahoo. Daily lineup congestion, roster limits and long-term value must still be considered. No roster changes are applied automatically.</p>';
 }catch(e){$('streamResults').textContent='Streaming unavailable: '+e.message}
 finally{button.disabled=false}
};
analysisRefresh();