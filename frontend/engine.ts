import {rankTotals,type SeasonProjection} from './season-projections';
// Live adapter to the original application. No projection or roster snapshots are bundled.
export type Player={draftId:string;name:string;positions:string;team:string;GP:number;adp:number|null;rank:number;sourceRow:number;[key:string]:any};
export type Roster=Record<string,string[]>;
declare global {interface Window {DraftRoomBridge:any}}
export const bridge=window.DraftRoomBridge;
export const TEAMS:string[]=bridge.teams,CATS:string[]=bridge.cats;
export let PROJECTIONS:Player[]=bridge.data().projections;
export let REVISION:number=bridge.data().revision;
export const INITIAL_ROSTERS:Roster=bridge.data().rosters;
export function refreshLiveData(){const d=bridge.data();PROJECTIONS=d.projections;REVISION=d.revision;return d;}
export const player=(id:string):Player=>bridge.player(id);
export const label=(id:string):string=>bridge.label(id);
export const copyRoster=(r:Roster):Roster=>bridge.copy(r);
export const standings=(r:Roster,model:SeasonProjection|null=null):Array<{team:string;totals:Record<string,number>;ranks:Record<string,number>;points:number;rank:number}>=>model?rankTotals(model.totals(r),CATS):bridge.standings(r);
export const trade=(_r:Roster,a:string,b:string,x:string,y:string):any=>bridge.trade(a,b,x,y);
export const rankedPlayers=(_r:Roster,q='',sort='overall',_team='Ryan'):any[]=>bridge.ranked(q,sort);
export const tradeIdeas=(_r:Roster,from:string):any=>bridge.ideas(from);
export const stream=(_r:Roster,from:string,start:string,end:string):Promise<any>=>bridge.stream(from,start,end);
export const weekRange=(offset=0):{0:string;1:string;index:number}=>bridge.week(offset);
