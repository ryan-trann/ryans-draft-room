// Refresh league-wide NBA injury statuses from ESPN's public injury feed.
// Run in GitHub Actions; keep the last known-good snapshot if upstream fails.
import {readFile,writeFile} from 'node:fs/promises';
const url='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const response=await fetch(url,{headers:{'user-agent':'PL-Fantasy-Basketball/1.0 (public injury snapshot)','accept':'application/json'},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('ESPN injury feed returned '+response.status);
const data=await response.json();
if(!Array.isArray(data.injuries))throw Error('Unexpected ESPN injury schema: '+JSON.stringify(Object.keys(data)));
console.log('ESPN payload sample:',JSON.stringify(data.injuries.slice(0,2)).slice(0,2500));
const rows=[];
for(const group of data.injuries){
 const team=group?.team?.abbreviation||group?.abbreviation||'';
 for(const item of group.injuries||[]){
  const name=item?.athlete?.displayName||item?.athlete?.fullName||'';
  const status=String(item?.status?.name||item?.status?.description||item?.status||'').trim();
  if(!name||!status||!team)continue;
  rows.push({name,team,status});
 }
}
if(rows.length<10)throw Error('Suspicious ESPN feed: only '+rows.length+' injury rows. Keeping previous snapshot.');
const json={source:'ESPN NBA injuries',sourceUrl:url,updatedAt:new Date().toISOString(),count:rows.length,players:rows};
await writeFile('injuries.json',JSON.stringify(json,null,2)+'\n');
console.log('Wrote '+rows.length+' ESPN injuries at '+json.updatedAt);
