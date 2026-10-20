'use strict';
/* The current roster is separate from immutable original draft picks. */
let editorRevision=0,editorReady=false,editorMoves=[],editorReview=false;
function copyRoster(obj){return Object.fromEntries(TEAMS.map(t=>[t,[...(obj[t]||[])]]))}
function editorValidate(rosters){
 const allowed=new Set(state.projections.map(p=>p.draftId)),seen=new Set();
 for(const t of TEAMS){
  if(!Array.isArray(rosters[t]))throw Error('Missing team '+t);
  if(rosters[t].length>20)throw Error(t+' exceeds the 20-player safety limit');
  for(const id of rosters[t]){
   if(!allowed.has(id))throw Error('Unknown player on '+t);
   if(seen.has(id))throw Error('A player belongs to multiple teams: '+editorName(id));
   seen.add(id);
  }
 }
 return rosters;
}
function editorName(id){const p=state.projections.find(x=>x.draftId===id);return p?playerLabel(p):id}
function editorChange(source,op){
 const next=copyRoster(source),from=next[op.from],to=next[op.to];
 if(!TEAMS.includes(op.from))throw Error('Choose a source team');
 if(['swap','move'].includes(op.type)&&(!TEAMS.includes(op.to)||op.to===op.from))throw Error('Choose a different destination team');
 if(['swap','move','drop'].includes(op.type)&&!from.includes(op.player))throw Error(editorName(op.player)+' is no longer on '+op.from);
 if(op.type==='swap'){
  if(!to.includes(op.other))throw Error(editorName(op.other)+' is no longer on '+op.to);
  from.splice(from.indexOf(op.player),1,op.other);to.splice(to.indexOf(op.other),1,op.player);
 }else if(op.type==='move'){from.splice(from.indexOf(op.player),1);to.push(op.player)}
 else if(op.type==='drop'){from.splice(from.indexOf(op.player),1)}
 else if(op.type==='add'){
  if(!state.projections.some(p=>p.draftId===op.free))throw Error('Choose a valid free agent');
  if(Object.values(next).some(ids=>ids.includes(op.free)))throw Error(editorName(op.free)+' is already on a roster');
  from.push(op.free);
 }else throw Error('Unknown action');
 return editorValidate(next);
}
function editorWorking(){return editorMoves.reduce((roster,op)=>editorChange(roster,op),copyRoster(currentRosters))}
function editorLabel(op){
 if(op.type==='swap')return 'Swap '+editorName(op.player)+' ('+op.from+') ↔ '+editorName(op.other)+' ('+op.to+')';
 if(op.type==='move')return 'Move '+editorName(op.player)+' from '+op.from+' to '+op.to;
 if(op.type==='drop')return 'Drop '+editorName(op.player)+' from '+op.from;
 return 'Add '+editorName(op.free)+' to '+op.from;
}
function editOptions(id,values,fallback){
 const el=$(id),previous=el.value||fallback;
 el.innerHTML=values.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label)+'</option>').join('');
 if(values.some(p=>p.id===previous))el.value=previous;
}
function editorUpdateUI(){
 let working;
 try{working=editorWorking()}catch(e){$('editorStatus').textContent='Invalid staged moves: '+e.message;return}
 const type=$('editorAction').value;
 editOptions('editorFrom',TEAMS.map(t=>({id:t,label:t})),'Ryan');
 const from=$('editorFrom').value;
 editOptions('editorTo',TEAMS.filter(t=>t!==from).map(t=>({id:t,label:t})));
 const to=$('editorTo').value;
 editOptions('editorPlayer',(working[from]||[]).map(id=>({id,label:editorName(id)})));
 editOptions('editorOther',(working[to]||[]).map(id=>({id,label:editorName(id)})));
 const taken=new Set(Object.values(working).flat());
 editOptions('editorFree',state.projections.filter(p=>!taken.has(p.draftId)).map(p=>({id:p.draftId,label:playerLabel(p)})));
 $('editorPlayerGroup').classList.toggle('hidden',type==='add');
 $('editorToGroup').classList.toggle('hidden',!['swap','move'].includes(type));
 $('editorOtherGroup').classList.toggle('hidden',type!=='swap');
 $('editorFreeGroup').classList.toggle('hidden',type!=='add');
 $('editorQueue').textContent=editorMoves.length?editorMoves.map((op,i)=>(i+1)+'. '+editorLabel(op)).join('\n'):'No changes queued.';
 $('editorReview').disabled=!editorMoves.length;
 $('editorDiscard').disabled=!editorMoves.length;
 if(!editorReview)$('editorReviewArea').classList.add('hidden');
}
async function loadRosterCloud(){
 if(editorMoves.length){$('editorStatus').textContent='You have unsaved changes. Publish or discard them before reloading.';return false}
 try{
  const response=await fetch('team-rosters.json?fresh='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json(),next={};
  for(const t of TEAMS){
   if(!Array.isArray(data.teams?.[t]))throw Error('Missing team '+t);
   next[t]=data.teams[t].map(row=>{
    const byId=state.projections.find(p=>p.draftId===row.playerId);
    if(byId&&byId.name===row.name)return byId.draftId;
    const byName=state.projections.filter(p=>norm(p.name)===norm(row.name));
    if(byName.length===1)return byName[0].draftId;
    throw Error('Cannot uniquely identify '+row.name+' on '+t);
   });
  }
  editorValidate(next);
  currentRosters=next;editorRevision=Number(data.revision||1);editorReady=true;
  renderTeams();renderCategoryStandings();renderRankings();editorUpdateUI();
  if(typeof analysisRefresh==='function')analysisRefresh();
  $('editorStatus').textContent='Saved rosters loaded from GitHub · revision '+editorRevision+'.';
  return true;
 }catch(e){$('editorStatus').textContent='Roster refresh failed: '+e.message+'. Previous rosters remain visible.';return false}
}
['editorAction','editorFrom','editorTo'].forEach(id=>$(id).onchange=()=>{editorReview=false;editorUpdateUI()});
$('editorAddMove').onclick=()=>{
 try{
  const op={type:$('editorAction').value,from:$('editorFrom').value,to:$('editorTo').value,player:$('editorPlayer').value,other:$('editorOther').value,free:$('editorFree').value};
  editorChange(editorWorking(),op);editorMoves.push(op);editorReview=false;
  $('editorStatus').textContent='Queued '+editorLabel(op)+'. Not saved yet.';
  editorUpdateUI();
 }catch(e){$('editorStatus').textContent='Cannot queue: '+e.message}
};
$('editorDiscard').onclick=()=>{
 if(!editorMoves.length||!confirm('Discard all pending roster moves?'))return;
 editorMoves=[];editorReview=false;editorUpdateUI();
 $('editorStatus').textContent='Batch discarded; the saved rosters are unchanged.';
};
$('editorReview').onclick=()=>{
 try{
  const next=editorWorking(),counts=TEAMS.map(t=>t+': '+currentRosters[t].length+' → '+next[t].length).join(' · ');
  $('editorSummary').textContent='Review these '+editorMoves.length+' moves before saving:\n'+editorMoves.map((op,i)=>(i+1)+'. '+editorLabel(op)).join('\n')+'\n\nRoster sizes (before → after):\n'+counts+'\n\nThe Teams and Category Ranks tabs will update after saving.';
  editorReview=true;$('editorReviewArea').classList.remove('hidden');
 }catch(e){$('editorStatus').textContent='Review failed: '+e.message}
};
$('editorBack').onclick=()=>{editorReview=false;$('editorReviewArea').classList.add('hidden')};
$('editorPublish').onclick=async()=>{
 if(!editorReview||!editorMoves.length)return;
 const token=$('editorToken').value.trim();
 if(!token){$('editorStatus').textContent='Enter the fine-grained GitHub token to save.';return}
 if(!confirm('Publish '+editorMoves.length+' reviewed roster moves to GitHub?'))return;
 $('editorToken').value='';$('editorPublish').disabled=true;
 $('editorStatus').textContent='Checking current GitHub revision…';
 try{
  const next=editorWorking();
  const url='https://api.github.com/repos/ryan-trann/ryans-draft-room/contents/team-rosters.json';
  const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'};
  const read=await fetch(url,{headers,cache:'no-store'});
  if(!read.ok)throw Error('GitHub could not read rosters (HTTP '+read.status+')');
  const old=await read.json(),encoded=String(old.content||'').replace(/\s/g,'');
  const remote=JSON.parse(decodeURIComponent(Array.from(atob(encoded),c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
  if(Number(remote.revision||1)!==editorRevision)throw Error('Another device has saved newer rosters. Discard your batch and reload before editing.');
  const teams={};for(const t of TEAMS)teams[t]=next[t].map(id=>({playerId:id,name:editorName(id)}));
  const json=JSON.stringify({formatVersion:1,revision:editorRevision+1,source:'Draft Room team editor',teams},null,2)+'\n';
  const bytes=new TextEncoder().encode(json);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'Update fantasy team rosters ('+editorMoves.length+' moves)',sha:old.sha,content:btoa(binary),branch:'main'})});
  if(!response.ok){const info=await response.json().catch(()=>({}));throw Error('GitHub HTTP '+response.status+': '+(info.message||'Rejected'))}
  currentRosters=next;editorRevision++;editorMoves=[];editorReview=false;$('editorReviewArea').classList.add('hidden');
  renderTeams();renderCategoryStandings();renderRankings();editorUpdateUI();
  if(typeof analysisRefresh==='function')analysisRefresh();
  $('editorStatus').textContent='Saved to GitHub (revision '+editorRevision+'). Current rosters and category ranks updated.';
 }catch(e){$('editorStatus').textContent='Save failed: '+e.message+'. Staged changes are still queued.'}
 finally{$('editorPublish').disabled=false}
};
$('editorReload').onclick=loadRosterCloud;
editorUpdateUI();
loadRosterCloud();