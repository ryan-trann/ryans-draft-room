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
  const proposal=analysisSwap(currentRosters,a,b,x,y),result=analysisGrade(proposal,a,b);
  $('tradeResults').innerHTML='<p><strong>'+esc(editorName(x))+'</strong> ('+esc(a)+') for <strong>'+esc(editorName(y))+'</strong> ('+esc(b)+')</p>'+
   analysisGradeHtml(result,a,b)+'<p class="muted">Projected season-category ranks; historical draft remains unchanged. This is an analysis only—no trade is saved.</p>';
 }catch(e){$('tradeResults').textContent=e.message}
};
$('recommendTrades').onclick=()=>{
 const from=$('recommendFrom').value, max=Math.max(1,Math.min(20,Number($('recommendMax').value)||10));
 const mine=currentRosters[from]||[],others=TEAMS.filter(t=>t!==from);
 const recommended=[];
 for(const other of others)for(const x of mine)for(const y of currentRosters[other]||[]){
  try{
   const updated=analysisSwap(currentRosters,from,other,x,y);
   const g=analysisGrade(updated,from,other);
   recommended.push({other,x,y,my:g.first,their:g.second,total:g.first+g.second,qualifies:g.first>0&&g.second>=0});
  }catch(e){}
 }
 recommended.sort((a,b)=>Number(b.qualifies)-Number(a.qualifies)||b.my-a.my||b.their-a.their);
 const positive=recommended.filter(x=>x.qualifies);
 const results=(positive.length?positive:recommended).slice(0,max);
 $('recommendResults').innerHTML='<p class="muted">'+(positive.length?positive.length+' trades improve your rank without worsening the partner’s rank; showing strongest candidates.':'No mutually favorable 1-for-1 trades by this category-rank metric; showing least-bad alternatives.')+'</p>'+
 results.map((x,i)=>'<div class="pick"><span class="rank">'+(i+1)+'</span><div class="grow"><strong>Give '+esc(editorName(x.x))+' · Get '+esc(editorName(x.y))+'</strong><div class="muted">Partner: '+esc(x.other)+' · Your rank gain '+(x.my>=0?'+':'')+x.my.toFixed(1)+' · Their rank gain '+(x.their>=0?'+':'')+x.their.toFixed(1)+'</div></div></div>').join('');
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
 if(Array.isArray(payload.games))return {source:payload.source||'Repository NBA schedule',generatedAt:payload.generatedAt||'',games:payload.games.map(x=>({date:nbaDate(x.date),home:nbaCode(x.home),away:nbaCode(x.away)}))};
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
   games.push({date,home:nbaCode(g.homeTeam?.teamTricode),away:nbaCode(g.awayTeam?.teamTricode)});
  }
 }
 return {source:'Official NBA schedule CDN',generatedAt:'',games};
}
function gamesForRange(data,start,end){
 if(!Array.isArray(data.games))throw Error('Schedule has no games.');
 const counts={},selected=data.games.filter(g=>g.date>=start&&g.date<=end&&g.home&&g.away);
 for(const g of selected){counts[g.home]=(counts[g.home]||0)+1;counts[g.away]=(counts[g.away]||0)+1}
 return {counts,gameCount:selected.length};
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
   games.push({date:dateInNBAZone(competition.date||event.date),home:nbaCode(home),away:nbaCode(away)});
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
function chooseWeek(date=new Date()){
 const today=new Date(date.getFullYear(),date.getMonth(),date.getDate());
 today.setDate(today.getDate()-((today.getDay()+6)%7));
 return today;
}
function initializeStreamingWeek(){
 const monday=chooseWeek();
 $('streamWeekStart').value=isoDay(monday);
 const sunday=new Date(monday);sunday.setDate(sunday.getDate()+6);
 $('streamWeekEnd').value=isoDay(sunday);
}
function shiftWeek(days){
 const d=dayFromIso($('streamWeekStart').value);
 d.setDate(d.getDate()+days);
 $('streamWeekStart').value=isoDay(d);
 const end=new Date(d);end.setDate(end.getDate()+6);
 $('streamWeekEnd').value=isoDay(end);
 $('streamScheduleStatus').textContent='Week changed. Run streaming recommendations to load the NBA schedule.';
}
$('streamPreviousWeek').onclick=()=>shiftWeek(-7);
$('streamNextWeek').onclick=()=>shiftWeek(7);
$('streamWeekStart').onchange=()=>{
 try{const date=dayFromIso($('streamWeekStart').value);date.setDate(date.getDate()+6);$('streamWeekEnd').value=isoDay(date)}catch(e){}
};
initializeStreamingWeek();
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
  const schedule=await getNbaSchedule(start,end),counts=schedule.counts;
  $('streamScheduleStatus').textContent='Official NBA regular-season schedule: '+start+' through '+end+' · '+schedule.gameCount+' games · '+schedule.source+'.';
  const from=$('streamTeam').value;
  const roster=analysisPlayers(from);
  const taken=new Set(TEAMS.flatMap(t=>currentRosters[t]||[]));
  const free=state.projections.filter(p=>!taken.has(p.draftId));
  const candidateLimit=Math.max(1,Math.ceil(roster.length/2));
  const lowValueIds=new Set(roster.slice().sort((a,b)=>weeklyCategoryValue(a,1)-weeklyCategoryValue(b,1)).slice(0,candidateLimit).map(p=>p.draftId));
  const drop=roster.filter(p=>lowValueIds.has(p.draftId)&&counts[nbaCode(p.team)]!==undefined).map(p=>({p,games:counts[nbaCode(p.team)],score:weeklyCategoryValue(p,counts[nbaCode(p.team)])})).sort((a,b)=>a.score-b.score);
  const adds=free.filter(p=>counts[nbaCode(p.team)]!==undefined).map(p=>({p,games:counts[nbaCode(p.team)],score:weeklyCategoryValue(p,counts[nbaCode(p.team)])})).sort((a,b)=>b.score-a.score);
  const pairs=[];
  for(const d of drop)for(const a of adds)if(a.games>d.games){
   const gain=a.score-d.score;
   if(gain>0)pairs.push({d,a,gain});
  }
  pairs.sort((a,b)=>b.gain-a.gain);
  $('streamResults').innerHTML='<p class="muted">'+Object.keys(counts).length+' NBA teams have verified scheduled games in this date range. Recommendations compare per-game projections × games, normalized over the nine league categories. Only positive-gain replacements with more scheduled games are shown.</p>'+
   (pairs.slice(0,15).map((x,i)=>'<div class="pick"><span class="rank">'+(i+1)+'</span><div class="grow"><strong>Drop '+esc(playerLabel(x.d.p))+' · Add '+esc(playerLabel(x.a.p))+'</strong><div class="muted">'+x.d.games+' → '+x.a.games+' games · Estimated weighted production gain +'+x.gain.toFixed(2)+'</div></div></div>').join('')||'<p>No positive-gain streaming match yet. Try a different NBA week.</p>')+
   '<p class="muted">Streaming is a short-term estimate. A player’s long-term value, waiver rules, games-on-bench and exact calendar-day schedule must be checked before dropping anyone. No roster changes are applied automatically.</p>';
 }catch(e){$('streamResults').textContent='Streaming unavailable: '+e.message}
 finally{button.disabled=false}
};
analysisRefresh();