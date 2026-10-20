// Injury availability is a validated ESPN snapshot, refreshed by GitHub Actions.
// Do not interpret an unlisted player as medically cleared or a stale file as current.
export type InjuryPlayer={name:string;team:string;status:string};
export type InjurySnapshot={source:string;sourceUrl:string;updatedAt:string;count:number;players:InjuryPlayer[]};
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const alias=(full:string)=>{
 const tokens=full.replace(/[,]/g,' ').trim().split(/\s+/);
 if(tokens.length<2)return normalize(full);
 const suffix=/^(ii|iii|iv|jr|sr)$/i;
 const filtered=tokens.filter(x=>!suffix.test(x));
 return normalize(filtered[0].slice(0,1)+filtered.slice(1).join(''));
};
const teamAliases:Record<string,string>={
 gs:'gsw',sa:'sas',ny:'nyk',no:'nop',utah:'uta',pho:'phx',phoe:'phx',bkn:'bkn',bk:'bkn',
 lac:'lac',la:'lac',lal:'lal',was:'was',wsh:'was',por:'por'
};
const teamKey=(team:string)=>{const key=normalize(team);return teamAliases[key]||key};
export const injuryKey=(name:string,team:string)=>teamKey(team)+'|'+(name.includes('.')?normalize(name):alias(name));
export const isListedInjured=(name:string,team:string,snapshot:InjurySnapshot)=>
 snapshot.players.some(p=>injuryKey(p.name,p.team)===injuryKey(name,team)&&!/^(available|active|healthy)$/i.test(p.status.trim()));
export const isRecentInjurySnapshot=(s:InjurySnapshot)=>
 Boolean(s&&Array.isArray(s.players)&&s.players.length>=10&&Number.isFinite(Date.parse(s.updatedAt))&&Date.now()-Date.parse(s.updatedAt)>=0&&Date.now()-Date.parse(s.updatedAt)<12*60*60*1000);
export async function getInjurySnapshot():Promise<InjurySnapshot>{
 const response=await fetch('injuries.json?fresh='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw Error('The NBA injury report has not been published yet.');
 const s:InjurySnapshot=await response.json();
 if(!isRecentInjurySnapshot(s))throw Error('The injury report is missing or older than 12 hours.');
 return s;
}
