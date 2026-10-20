// @ts-nocheck
// Existing upload validation and GitHub publication logic, scoped to each native tool form.
export const projectionsMarkup="<div class=\"wrap\"><p>Upload your complete Hashtag Basketball projection table once. The saved file lives in your GitHub repository, and everyone using the Draft Room loads that same projection data. Your draft picks stay local to each device.</p>\n<div class=\"panel\"><h2>1. Paste or choose a projection file</h2><p>Supports the same R# / Player / ADP / Pos / Team / GP / MPG / FGM / FTM / 3PM / DREB / OREB / AST / STL / BLK / TO / Total format. The ten trailing values may each be on their own lines. Blank ADP fields are preserved.</p><label for=\"file\">Text or TSV file (optional)</label><input id=\"file\" type=\"file\" accept=\".txt,.tsv,.csv,text/plain,text/csv,text/tab-separated-values\"><label for=\"source\">Projection table</label><textarea id=\"source\" spellcheck=\"false\" placeholder=\"R#  PLAYER  ADP  POS  TEAM  GP  MPG  FGM ... TOTAL&#10;1  N.Jokic  1.4  C  DEN  72  35.1  10.5&#10;5.6&#10;1.8 ...\"></textarea><button class=\"primary\" id=\"validate\">Validate and preview</button><div id=\"preview\" class=\"note\">No projections validated.</div></div>\n<div class=\"panel\"><h2>2. Authorize one GitHub upload</h2><p>Generate a <strong>fine-grained personal access token</strong> in GitHub Settings \u2192 Developer settings \u2192 Personal access tokens. Limit repository access to <strong>ryan-trann/ryans-draft-room</strong> and grant <strong>Contents: Read and write</strong>. You can set a short token expiration. The token is used for this upload only, cleared from the form, and never saved to your browser's storage or the repository.</p><label for=\"token\">One-time GitHub token</label><input id=\"token\" type=\"password\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"github_pat_...\"><button id=\"publish\" class=\"primary\" disabled>Publish validated projections to GitHub</button><div class=\"note\" id=\"status\">Nothing will be uploaded until you confirm.</div></div></div>\n";
export function mountProjections(host){

'use strict';
const $=id=>host.querySelector('[data-tool-id="'+id+'"]');
const repo='ryan-trann/ryans-draft-room',path='projections-300-data.json';
let staged=null;
const isNumber=x=>/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x);
const start=/^(\d{1,3})(?:\s+\d{1,3})?\s+(.+?)\s+(?:(\d+(?:\.\d+)?)\s+)?((?:PG|SG|SF|PF|C)(?:,(?:PG|SG|SF|PF|C))*)\s+([A-Z]{2,3})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)(?:\s+(.*))?$/i;
function parseTable(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean),rows=[],errors=[];
 let pending=null;
 function finish(){
  if(!pending)return;
  if(pending.stats.length!==10)errors.push('Row '+pending.rank+' ('+pending.name+') has '+pending.stats.length+' values, expected 10.');
  else rows.push(pending);
  pending=null;
 }
 for(const line of lines){
  if(/^R#\s+PLAYER/i.test(line))continue;
  const normalized=line.replace(/\t/g,' ').replace(/\s{2,}/g,' ');
  const m=normalized.match(start);
  if(m){
   finish();
   pending={rank:Number(m[1]),name:m[2].trim(),adp:m[3]?Number(m[3]):null,positions:m[4],team:m[5],GP:Number(m[6]),MPG:Number(m[7]),stats:[]};
   if(m[8]){
    const nums=m[8].split(/\s+/);
    if(nums.every(isNumber))pending.stats.push(...nums.map(Number));
    else errors.push('Invalid stats in row '+pending.rank);
   }
  }else if(pending){
   const nums=normalized.split(/\s+/);
   if(nums.every(isNumber))pending.stats.push(...nums.map(Number));
   else errors.push('Unrecognized content near row '+pending.rank+': '+line.slice(0,40));
  }else errors.push('Unrecognized row: '+line.slice(0,40));
 }
 finish();
 if(rows.length<100||rows.length>500)errors.push('Expected 100–500 players; found '+rows.length+'.');
 const duplicates=new Set();
 rows.forEach((r,i)=>{
  if(r.rank!==i+1)errors.push('Ranks must run consecutively from 1: problem at row '+(i+1)+'.');
  if(!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.' -]*$/.test(r.name))errors.push('Invalid name '+r.name);
  if(!(r.GP>=1&&r.GP<=82&&r.MPG>=0&&r.MPG<=48))errors.push('Invalid games/minutes for '+r.name);
  if(r.adp!==null&&!(r.adp>0&&r.adp<=400))errors.push('Invalid ADP for '+r.name);
  if(r.stats.slice(0,9).some(x=>!Number.isFinite(x)||x<0)||!Number.isFinite(r.stats[9]))errors.push('Invalid stats for '+r.name);
  const k=r.name+'|'+r.positions+'|'+r.team;
  if(duplicates.has(k))errors.push('Duplicate row for '+r.name);duplicates.add(k);
 });
 if(errors.length)throw Error(errors.slice(0,5).join(' | '));
 return rows;
}
function serialized(rows){
 return rows.map(p=>[p.rank,p.name.replace(/\s+/g,'_'),p.adp===null?'-':p.adp,p.positions,p.team,p.GP,p.MPG,...p.stats].join(' ')).join('\n');
}
function validateRaw(raw){
 const rows=raw.trim().split(/\r?\n/);
 if(rows.length<100||rows.length>500)throw Error('Invalid record count');
 for(let i=0;i<rows.length;i++){
  const fields=rows[i].split(/\s+/);
  if(fields.length!==17||Number(fields[0])!==i+1)throw Error('Invalid saved format at row '+(i+1));
  if(fields.slice(7).some(x=>!isNumber(x)))throw Error('Invalid numeric value at row '+(i+1));
 }
}
$('source').addEventListener('input',()=>{staged=null;$('publish').disabled=true;$('preview').textContent='Data changed. Validate again.'});
$('file').addEventListener('change',async function(){
 const f=this.files?.[0];if(!f)return;
 if(f.size>500000){$('preview').textContent='File too large (max 500 KB).';return}
 $('source').value=await f.text();staged=null;$('publish').disabled=true;$('preview').textContent='File loaded; press Validate and preview.';
});
$('validate').addEventListener('click',()=>{
 try{
  const rows=parseTable($('source').value),raw=serialized(rows);
  validateRaw(raw);
  staged={rows,raw};$('publish').disabled=false;
  const known=rows.filter(p=>p.adp!==null).length;
  $('preview').textContent='Valid: '+rows.length+' players; '+known+' numeric ADP; '+(rows.length-known)+' blank ADP. First: '+rows[0].name+'; last: '+rows[rows.length-1].name+'.';
 }catch(e){staged=null;$('publish').disabled=true;$('preview').textContent='Validation failed: '+e.message}
});
$('publish').addEventListener('click',async()=>{
 if(!staged)return;
 const token=$('token').value.trim();
 if(!token){$('status').textContent='Enter a fine-grained GitHub token.';return}
 if(!confirm('Replace the shared GitHub projections with '+staged.rows.length+' validated players?'))return;
 const btn=$('publish');btn.disabled=true;$('token').value='';
 $('status').textContent='Publishing to GitHub…';
 try{
  const url='https://api.github.com/repos/'+repo+'/contents/'+path;
  const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'};
  const priorResponse=await fetch(url,{headers,cache:'no-store'});
  if(!priorResponse.ok)throw Error('Could not access repository file (HTTP '+priorResponse.status+'). Check token permissions.');
  const prior=await priorResponse.json();
  const file=JSON.stringify({formatVersion:1,raw:staged.raw},null,2)+'\n';
  const bytes=new TextEncoder().encode(file);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const body={message:'Update Hashtag projections through Draft Room',content:btoa(binary),sha:prior.sha,branch:'main'};
  const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){const detail=await response.json().catch(()=>({}));throw Error('GitHub HTTP '+response.status+': '+(detail.message||'Upload rejected'))}
  $('status').textContent='Published '+staged.rows.length+' players to GitHub. Other devices will load the updated file after GitHub Pages finishes publishing.';
  staged=null;
 }catch(err){$('status').textContent='Upload failed: '+err.message+'. Existing projections remain in place.'}
 finally{btn.disabled=!staged}
});

}
export const restoreMarkup="<div class=\"wrap\"><p>Upload a Draft Room JSON backup to store its 12 rosters permanently in GitHub. The existing shared team file is replaced only after validation and your authorization. The latest projections are used to identify individual players\u2014even when names are abbreviated.</p><div class=\"panel\"><h2>1. Select your original draft backup</h2><input type=\"file\" id=\"backup\" accept=\".json,application/json\"><button id=\"validate\" class=\"primary\">Validate all teams</button><div class=\"note\" id=\"preview\">Choose your downloaded draft-backup JSON file.</div></div><div class=\"panel\"><h2>2. Publish to GitHub</h2><p>Use the same restricted GitHub token as for projection uploads (repository Contents: Read and write). The token is never saved and the entry field is cleared after an attempt.</p><label for=\"token\">GitHub token</label><input id=\"token\" type=\"password\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"github_pat_...\"><button class=\"primary\" id=\"publish\" disabled>Publish all teams</button><div class=\"note\" id=\"status\">Validate a complete draft before publishing.</div></div></div>";
export function mountRestore(host){

'use strict';
const $=id=>host.querySelector('[data-tool-id="'+id+'"]'),TEAMS=['Keith','Dave','Sean','Matt','Chris','Tim','Aaron','Alan','Joe','Jake','Ryan','Cam'];
let staged=null;
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const corrections={mara:'A.Mara',ayton:'D.Ayton',laravia:'J.LaRavia',raynaud:'M.Raynaud',risaxher:'Z.Risacher'};
function readProjectionFile(src){
 const data=JSON.parse(src);
 if(data.formatVersion!==1||typeof data.raw!=='string')throw Error('Shared projection JSON is invalid.');
 return data.raw.trim().split(/\r?\n/).map(row=>{const x=row.split(/\s+/);return {name:x[1].replace(/_/g,' '),positions:x[3],team:x[4],draftId:'hb-'+x[0]};});
}
function reconcileBackup(data,projections){
 if(!Array.isArray(data.picks)||data.picks.length!==168)throw Error('Backup must contain exactly 168 picks for a completed draft.');
 const byId=new Map(projections.map(p=>[p.draftId,p]));
 const oldPlayers=new Map((data.projections||[]).filter(p=>p.draftId).map(p=>[p.draftId,p]));
 const used=new Set(),correctionsMade=[];
 const picks=data.picks.map((item,i)=>{
  const expected=TEAMS[Math.floor(i/12)%2===0?i%12:11-i%12];
  if(item.team!==expected)throw Error('Incorrect snake order at pick #'+(i+1));
  const input=String(item.player||'').trim();
  if(!input)throw Error('Empty player at pick #'+(i+1));
  const target=corrections[norm(input)]||input;
  const old=oldPlayers.get(item.playerId);
  const matching=projections.filter(p=>norm(p.name)===norm(target));
  let found=null;
  // Existing IDs can be reused only when the projection name agrees.
  const idCandidate=byId.get(item.playerId);
  if(idCandidate&&norm(idCandidate.name)===norm(target))found=idCandidate;
  if(!found&&matching.length===1)found=matching[0];
  if(!found&&old){const specific=matching.filter(p=>p.positions===old.positions&&(!old.team||p.team===old.team));if(specific.length===1)found=specific[0]}
  if(!found)throw Error('Player could not be uniquely matched: '+input+' (pick #'+(i+1)+')');
  if(used.has(found.draftId))throw Error('Duplicate player: '+found.name);
  used.add(found.draftId);
  if(input!==found.name)correctionsMade.push(input+' → '+found.name);
  return {team:item.team,player:found.name,playerId:found.draftId,unlisted:false};
 });
 return {formatVersion:1,picks,correctionsMade};
}
$('backup').onchange=()=>{staged=null;$('publish').disabled=true;$('preview').textContent='File selected. Tap Validate all teams.'};
$('validate').onclick=async()=>{
 const file=$('backup').files?.[0];if(!file){$('preview').textContent='Choose a backup file first.';return}
 try{
  if(file.size>1500000)throw Error('File exceeds 1.5 MB.');
  const backup=JSON.parse(await file.text());
  const resp=await fetch('projections-300-data.json?fresh='+Date.now(),{cache:'no-store'});
  if(!resp.ok)throw Error('Could not load shared projections: HTTP '+resp.status);
  const projections=readProjectionFile(await resp.text());
  staged=reconcileBackup(backup,projections);
  $('preview').textContent='Validated 168 unique picks across 12 teams, 14 per team. '+staged.correctionsMade.length+' names reconciled. '+staged.correctionsMade.join('; ');
  $('publish').disabled=false;
 }catch(e){staged=null;$('publish').disabled=true;$('preview').textContent='Validation failed: '+e.message}
};
$('publish').onclick=async()=>{
 if(!staged)return;
 const token=$('token').value.trim();
 if(!token){$('status').textContent='Enter your GitHub token.';return}
 if(!confirm('Replace the shared 12-team draft in GitHub with this backup?'))return;
 $('token').value='';$('publish').disabled=true;$('status').textContent='Uploading 168 picks to GitHub…';
 try{
  const url='https://api.github.com/repos/ryan-trann/ryans-draft-room/contents/draft-teams.json';
  const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'};
  const current=await fetch(url,{headers,cache:'no-store'});
  if(!current.ok)throw Error('Cannot access team file: HTTP '+current.status);
  const meta=await current.json();
  const bodyText=JSON.stringify({formatVersion:1,source:'Draft Room upload',picks:staged.picks},null,2)+'\n';
  const bytes=new TextEncoder().encode(bodyText);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const result=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'Update saved fantasy draft teams',content:btoa(binary),sha:meta.sha,branch:'main'})});
  if(!result.ok){const error=await result.json().catch(()=>({}));throw Error('GitHub HTTP '+result.status+': '+(error.message||'Upload failed'))}
  $('status').textContent='Saved all 168 picks permanently to GitHub. Reload the Draft Room after GitHub Pages publishes.';
  staged=null;
 }catch(e){$('status').textContent='Upload failed: '+e.message}
 finally{$('publish').disabled=!staged}
};

}
