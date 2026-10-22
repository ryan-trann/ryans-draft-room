'use strict';
// Presentation adapter. Existing projection, analysis, draft and save code remains authoritative.
(()=>{
 let scheduled=false;
 const notify=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;window.dispatchEvent(new Event('draftroom:change'))})};
 const original={renderTeams,renderCategoryStandings,renderRankings,editorUpdateUI};
 renderTeams=function(...args){const value=original.renderTeams(...args);notify();return value};
 renderCategoryStandings=function(...args){const value=original.renderCategoryStandings(...args);notify();return value};
 renderRankings=function(...args){const value=original.renderRankings(...args);notify();return value};
 editorUpdateUI=function(...args){const value=original.editorUpdateUI(...args);notify();return value};
 new MutationObserver(notify).observe($('editorStatus'),{childList:true,subtree:true,characterData:true});
 const toOp=m=>({type:m.kind,from:m.team,to:m.other,player:m.give,other:m.receive,free:m.receive});
 const fromOp=op=>({kind:op.type,team:op.from,other:op.to,give:op.player,receive:['add','adddrop'].includes(op.type)?op.free:op.other});
 function preview(rosters,moves){return moves.reduce((next,m)=>editorChange(next,toOp(m)),copyRoster(rosters))}
 window.DraftRoomBridge={
  teams:TEAMS,cats:CATS,
  data:()=>({projections:state.projections,rosters:copyRoster(currentRosters),il:Object.fromEntries(TEAMS.map(t=>[t,[...(editorIL[t]||[])]])),revision:editorRevision,ready:editorReady,batch:editorMoves.map(fromOp),status:$('editorStatus').textContent,projectionStatus:$('sharedProjectionStatus').textContent}),
  preview,
  active:()=>editorActiveRosters(),
  queue(moves){if(!editorReady)throw Error('Saved rosters are still loading. Reload rosters before editing.');let next=editorWorking();for(const m of moves)next=editorChange(next,toOp(m));editorMoves.push(...moves.map(toOp));editorReview=false;editorUpdateUI();$('editorReview').click();notify();},
  remove(index){const next=editorMoves.filter((_,i)=>i!==index);next.reduce((roster,op)=>editorChange(roster,op),copyRoster(currentRosters));editorMoves=next;editorReview=false;editorUpdateUI();if(editorMoves.length)$('editorReview').click();notify();},
  discard(){editorMoves=[];editorReview=false;editorUpdateUI();$('editorStatus').textContent='Batch discarded; saved rosters unchanged.';notify();},
  review(){if(editorMoves.length)$('editorReview').click();},
  reload:()=>loadRosterCloud(),
  reloadProjections:()=>reloadGitHubProjectionFile(),
  player:id=>state.projections.find(p=>p.draftId===id),label:id=>editorName(id),copy:copyRoster,
  trade(a,b,x,y){const proposal=analysisSwap(currentRosters,a,b,x,y);return {proposal,grade:analysisGrade(proposal,a,b),cash:cashImpact(currentRosters,proposal,a,b)}},
  legacy(tab){const root=$('root');root.hidden=true;document.body.classList.remove('modern-ready');document.body.classList.add('show-original');const button=document.querySelector('#legacy-ui [data-tab="'+tab+'"]');if(button)button.click();window.scrollTo(0,0);},
  modern(){document.body.classList.remove('show-original');document.body.classList.add('modern-ready');$('root').hidden=false;notify();},
  backup(){$('export').click()},restore(){$('restoreBtn').click()},
 };
 const back=document.createElement('button');back.type='button';back.id='return-modern';back.textContent='← Back to Draft Room';back.onclick=()=>window.DraftRoomBridge.modern();document.body.append(back);
 notify();
})();

// These calculation bodies are lifted verbatim from the existing renderers.
window.DraftRoomBridge.standings=function(){
 const teams=TEAMS.map(team=>{
  const ps=(editorActiveRosters()[team]||[]).map(id=>state.projections.find(p=>p.draftId===id)).filter(Boolean);
  const totals={};for(const c of CATS)totals[c]=ps.reduce((sum,p)=>sum+Number(p[c]||0),0);
  return {team,count:ps.length,totals,ranks:{},points:0};
 });
 for(const c of CATS){
  const ordered=[...teams].sort((a,b)=>c==='TO'?a.totals[c]-b.totals[c]:b.totals[c]-a.totals[c]);
  let i=0;while(i<ordered.length){
   let j=i+1;while(j<ordered.length&&Math.abs(ordered[j].totals[c]-ordered[i].totals[c])<.00001)j++;
   const averageRank=((i+1)+j)/2;
   for(let k=i;k<j;k++){ordered[k].ranks[c]=averageRank;ordered[k].points+=13-averageRank;}
   i=j;
  }
 }
 teams.sort((a,b)=>b.points-a.points||TEAMS.indexOf(a.team)-TEAMS.indexOf(b.team));

 return teams.map((t,i)=>({...t,rank:teams.findIndex(x=>Math.abs(x.points-t.points)<.00001)+1}));
};
window.DraftRoomBridge.ranked=function(query,sort){ const all=state.projections,q=norm(query),s=stats(),mine=(editorActiveRosters()['Ryan']||[]).map(id=>state.projections.find(p=>p.draftId===id)).filter(Boolean),weak={};
 if(mine.length)for(const c of CATS){
  const z=mine.reduce((v,p)=>v+((p[c]||0)-s[c].m)/s[c].sd*(c==='TO'?-1:1),0)/mine.length;
  weak[c]=Math.max(0,Math.min(.5,-z*.2));
 }
 const drafted=new Map();
 for(const team of TEAMS)for(const id of currentRosters[team]||[])drafted.set(id,team);

 const ranked=all.filter(p=>norm(p.name).includes(q)||norm(p.positions).includes(q)||norm(p.team||'').includes(q)).map(p=>({...p,playerScore:score(p,s,sort==='fit'?weak:null)}));
 if(sort==='adp')ranked.sort((a,b)=>(Number.isFinite(a.adp)&&a.adp>0?a.adp:Infinity)-(Number.isFinite(b.adp)&&b.adp>0?b.adp:Infinity)||a.rank-b.rank);
 else ranked.sort((a,b)=>b.playerScore-a.playerScore||a.rank-b.rank);

 return ranked.map(p=>({...p,score:p.playerScore,owner:drafted.get(p.draftId)}));
};
window.DraftRoomBridge.ideas=function(from){const max=10; const mine=currentRosters[from]||[],others=TEAMS.filter(t=>t!==from);
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

 return {mutual:positive.length>0,rows:results};
};
window.DraftRoomBridge.stream=async function(from,start,end){  if(dayFromIso(start)>dayFromIso(end))throw Error('Week end must follow week start.');
  const effective=streamingEffectiveRange(start,end);
  const schedule=await getNbaSchedule(effective.start,end);
  // This league allows real-time free-agent additions before tipoff.
  // Unknown Yahoo waiver statuses are not inferred or screened.
  const eligibility=eligibleGames(schedule.games,effective.start,end,0);
  const counts=eligibility.countsRoster,pickupCounts=eligibility.countsPickup;
  const unknown=eligibility.stats.missingToday;
  $('streamScheduleStatus').textContent='NBA games still eligible this matchup: '+effective.start+' through '+end+' · '+schedule.source+' · Immediate free-agent eligibility, provided tipoff has not occurred'+(unknown?' · '+unknown+' games today lack start times and were excluded for safety.':'')+'.';

  const roster=analysisPlayers(from).filter(p=>!(editorIL[from]||[]).includes(p.draftId));
  const taken=new Set(TEAMS.flatMap(t=>currentRosters[t]||[]));
  const free=state.projections.filter(p=>!taken.has(p.draftId));
  // Only treat the lowest-value roster slots as disposable for short-term streaming.
  // The remainder require a deliberate permanent roster move, not a one-week swap.
  const candidateLimit=Math.min(3,Math.max(1,Math.floor(roster.length/4)));
  const lowValueIds=new Set(roster.slice().sort((a,b)=>weeklyCategoryValue(a,1)-weeklyCategoryValue(b,1)).slice(0,candidateLimit).map(p=>p.draftId));
  const drop=roster.filter(p=>lowValueIds.has(p.draftId)&&counts[nbaCode(p.team)]!==undefined).map(p=>({p,games:counts[nbaCode(p.team)],score:weeklyCategoryValue(p,counts[nbaCode(p.team)])})).sort((a,b)=>a.score-b.score);
  const adds=free.filter(p=>pickupCounts[nbaCode(p.team)]!==undefined).map(p=>({p,games:pickupCounts[nbaCode(p.team)],score:weeklyCategoryValue(p,pickupCounts[nbaCode(p.team)])})).sort((a,b)=>b.score-a.score);
  const pairs=[];
  for(const d of drop)for(const a of adds)if(a.games>0){
   // Keep category-specialist pickups even when their equal-weight gain is negative;
   // the payout model decides whether the swap actually helps.
   const gain=a.score-d.score;
   pairs.push({d,a,gain});
  }
  pairs.sort((a,b)=>b.gain-a.gain);

 return {pairs:pairs.slice(0,600),effective,eligibility,source:schedule.source};
};
window.DraftRoomBridge.week=function(offset=0){let base=chooseYahooWeek();if(base<0)base=0;const index=Math.max(0,Math.min(YAHOO_WEEKS_2026.length-1,base+offset));return {0:YAHOO_WEEKS_2026[index][0],1:YAHOO_WEEKS_2026[index][1],index}};
