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
const nbaTeams=['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GS','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY','OKC','ORL','PHI','PHO','POR','SAC','SA','TOR','UTA','WAS'];
$('weeklyGames').innerHTML=nbaTeams.map(t=>'<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:5px 0">'+t+'<input data-nba="'+t+'" type="number" min="0" max="6" placeholder="—" style="width:82px"></label>').join('');
function weeklyGameCounts(){
 const counts={};
 for(const node of document.querySelectorAll('[data-nba]')){
  if(node.value==='')continue;
  const n=Number(node.value);
  if(!Number.isInteger(n)||n<0||n>6)throw Error('Weekly games must be 0–6 for '+node.dataset.nba);
  counts[node.dataset.nba]=n;
 }
 return counts;
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
$('streamRecommend').onclick=()=>{
 try{
  const counts=weeklyGameCounts(),from=$('streamTeam').value;
  const roster=analysisPlayers(from);
  const taken=new Set(TEAMS.flatMap(t=>currentRosters[t]||[]));
  const free=state.projections.filter(p=>!taken.has(p.draftId));
  const drop=roster.filter(p=>counts[p.team]!==undefined).map(p=>({p,games:counts[p.team],score:weeklyCategoryValue(p,counts[p.team])})).sort((a,b)=>a.score-b.score);
  const adds=free.filter(p=>counts[p.team]!==undefined).map(p=>({p,games:counts[p.team],score:weeklyCategoryValue(p,counts[p.team])})).sort((a,b)=>b.score-a.score);
  const pairs=[];
  for(const d of drop)for(const a of adds)if(a.games>d.games){
   const gain=a.score-d.score;
   if(gain>0)pairs.push({d,a,gain});
  }
  pairs.sort((a,b)=>b.gain-a.gain);
  $('streamResults').innerHTML='<p class="muted">'+Object.keys(counts).length+' NBA teams have weekly game counts entered. Recommendations compare per-game projections × games, normalized over the nine league categories. Only positive-gain replacements with more scheduled games are shown.</p>'+
   (pairs.slice(0,15).map((x,i)=>'<div class="pick"><span class="rank">'+(i+1)+'</span><div class="grow"><strong>Drop '+esc(playerLabel(x.d.p))+' · Add '+esc(playerLabel(x.a.p))+'</strong><div class="muted">'+x.d.games+' → '+x.a.games+' games · Estimated weighted production gain +'+x.gain.toFixed(2)+'</div></div></div>').join('')||'<p>No positive-gain streaming match yet. Enter games for more NBA teams or adjust the week.</p>')+
   '<p class="muted">Streaming is a short-term estimate. A player’s long-term value, waiver rules, games-on-bench and exact calendar-day schedule must be checked before dropping anyone. No roster changes are applied automatically.</p>';
 }catch(e){$('streamResults').textContent=e.message}
};
analysisRefresh();