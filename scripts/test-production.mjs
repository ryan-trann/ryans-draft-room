import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {SeasonProjection,rankTotals} from '../frontend/season-projections.ts';
const root=path.resolve('dist'),prefix='/ryans-draft-room/',evidence=path.resolve('../production-evidence');
const builtHtml=await fs.readFile(path.join(root,'index.html'),'utf8');
if(!builtHtml.includes('Content-Security-Policy')||!builtHtml.includes('script-src \'self\' \'sha256-'))throw Error('Missing script-hash CSP');
if(builtHtml.includes('src="projections-300-data.js'))throw Error('Executable projections script still included');
if(!builtHtml.includes('id="shared-projections-json"'))throw Error('Missing inert projection payload');
await fs.mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff':'font/woff','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1'),rel=decodeURIComponent(url.pathname).replace(prefix,'/');const file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(root+path.sep))throw Error();const bytes=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes)}catch{res.statusCode=404;res.end('Not found')}});
await new Promise(resolve=>server.listen(4182,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER_EXECUTABLE||undefined,args:process.env.QA_BROWSER_ARGS?JSON.parse(process.env.QA_BROWSER_ARGS):[]});
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles'});
const errors=[],writes=[],projectionWrites=[],draftWrites=[];let remote=JSON.parse(await fs.readFile('team-rosters.json','utf8'));
const originalDraft=JSON.parse(await fs.readFile('draft-teams.json','utf8')).picks;
page.on('pageerror',e=>errors.push(e.message));
const injuryFixture={source:'ESPN NBA injuries',sourceUrl:'https://www.espn.com/nba/injuries',updatedAt:'2026-10-20T02:00:00Z',count:14,players:[{name:'Jimmy Butler III',team:'GSW',status:'Out'},{name:'Kristaps Porzingis',team:'GSW',status:'Out'},...Array.from({length:12},(_,i)=>({name:'Fixture Injured '+i,team:'ATL',status:'Out'}))]};
await page.route('**/injuries.json?fresh=*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(injuryFixture)}));
await page.clock.setFixedTime(new Date('2026-10-20T03:15:00Z'));
await page.route('**/team-rosters.json?fresh=*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(remote)}));
await page.route('https://api.github.com/**',async route=>{
 const req=route.request();
 if(req.url().endsWith('/contents/projections-300-data.json')||req.url().endsWith('/contents/draft-teams.json')){
  if(req.method()==='GET')return route.fulfill({contentType:'application/json',body:'{"sha":"fixture-tool-sha"}'});
  if(req.method()==='PUT'){(req.url().includes('projections-')?projectionWrites:draftWrites).push(req.postDataJSON());return route.fulfill({contentType:'application/json',body:'{"commit":{"sha":"fixture-tool-commit"}}'});}
 }
 if(!req.url().endsWith('/contents/team-rosters.json'))throw Error('Unexpected API endpoint '+req.method()+' '+req.url());
 if(req.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({sha:'fixture-sha',content:Buffer.from(JSON.stringify(remote)).toString('base64')})});
 if(req.method()==='PUT'){const body=req.postDataJSON();remote=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));writes.push(body);return route.fulfill({contentType:'application/json',body:'{"commit":{"sha":"fixture-commit"}}'});}
 return route.abort();
});
page.on('dialog',d=>d.accept());
try{
 await page.route('**/assets/*.js',async route=>{await new Promise(resolve=>setTimeout(resolve,80));await route.continue()});
 await page.goto('http://127.0.0.1:4182'+prefix,{waitUntil:'commit'});await expect(page.locator('#legacy-ui')).toBeHidden();
 await page.waitForLoadState('networkidle');await expect(page.locator('body')).toHaveClass(/modern-ready/);await page.evaluate(()=>document.fonts.ready);
 await expect(page.getByRole('heading',{name:'MY TEAM',exact:true})).toBeVisible();await expect(page.locator('.team-overview')).toContainText('Rank points');await expect(page.locator('.team-overview')).toContainText(/\d+\.\d/);await expect(page.locator('.roster-row')).toHaveCount(14);
 const initial=await page.evaluate(()=>window.DraftRoomBridge.data());expect(initial.revision).toBeGreaterThanOrEqual(1);expect(initial.projections.length).toBe(300);expect(initial.projections.filter(p=>p.adp>0).length).toBe(186);expect(new Set(Object.values(initial.rosters).flat()).size).toBe(Object.values(initial.rosters).flat().length);expect(Object.keys(initial.rosters)).toHaveLength(12);expect(Object.values(initial.rosters).every(ids=>ids.length<=20)).toBe(true);
 // v58: published schedule and daily legal lineups drive the displayed ranks.
 await expect(page.locator('.schedule-status')).toHaveCount(0);
 const seasonSchedule=JSON.parse(await fs.readFile('nba-schedule.json','utf8'));
 const categoryNames=['FGM','FTM','3PM','OREB','DREB','AST','STL','BLK','TO'];
 const model=new SeasonProjection(initial.projections,categoryNames,seasonSchedule);
 const active=Object.fromEntries(Object.entries(initial.rosters).map(([t,ids])=>[t,ids.filter(id=>!(initial.il[t]||[]).includes(id))]));
 const expectedLeague=rankTotals(model.totals(active),categoryNames);
 const alan=model.team(active.Alan);
 const alanRaw=Object.fromEntries(categoryNames.map(c=>[c,active.Alan.reduce((n,id)=>n+Number(initial.projections.find(p=>p.draftId===id)?.[c]||0),0)]));
 expect(alan.blocked).toBeGreaterThan(0);expect(alan.startable).toBeLessThan(alan.scheduled);expect(alan.totals.DREB).toBeLessThan(alanRaw.DREB);
 await fs.writeFile(evidence+'/lineup-alan-comparison.json',JSON.stringify({revision:initial.revision,scheduleGames:seasonSchedule.games.length,scheduled:alan.scheduled,startable:alan.startable,blocked:alan.blocked,expectedStarted:alan.expectedStarted,oldTotals:alanRaw,adjustedTotals:alan.totals,league:expectedLeague},null,2));
 await page.getByRole('button',{name:'Ranks',exact:true}).click();
 await expect(page.locator('.intro')).toContainText('Lineup-adjusted season projections');
 await expect(page.locator('.lineup-counts')).toContainText('blocked by daily slots');
 const expectedRyan=expectedLeague.find(r=>r.team==='Ryan');
 for(let i=0;i<categoryNames.length;i++){
  await expect(page.locator('.gap-row').nth(i).locator(':scope > span')).toHaveText(Math.round(expectedRyan.totals[categoryNames[i]]).toLocaleString('en-US'));
 }
 await page.locator('.lineup-method summary').click();await expect(page.locator('.lineup-method')).toContainText('2 C and 3 UTIL');await expect(page.locator('.lineup-method')).toContainText('Unpublished games are excluded');
 await page.screenshot({path:evidence+'/lineup-method-mobile.png'});await page.locator('.lineup-method summary').click();
 await page.getByRole('button',{name:'Team',exact:true}).click();
 // Duplicate display names use NBA team + positions; stable player IDs remain unchanged.
 const duplicateLabels=await page.evaluate(()=>{const all=window.DraftRoomBridge.data().projections;const counts=new Map();for(const p of all){const key=p.name.toLowerCase();counts.set(key,(counts.get(key)||0)+1)}return all.filter(p=>counts.get(p.name.toLowerCase())>1).map(p=>({id:p.draftId,actual:window.DraftRoomBridge.label(p.draftId),expected:p.name+' · '+p.team+' ('+p.positions+')'}))});
 expect(duplicateLabels.length).toBeGreaterThan(0);
 for(const p of duplicateLabels)expect(p.actual).toBe(p.expected);
 await page.screenshot({path:evidence+'/01-team-mobile.png'});
 // v56: Team has no redundant Category Strategy entry; Trades is the sole auto finder.
 await expect(page.locator('.strategy-entry')).toHaveCount(0);
 await page.getByRole('button',{name:'Trades',exact:true}).click();
 await expect(page.getByRole('button',{name:'Choose trade teams'})).toBeVisible();
 const analyzeTop=await page.getByRole('button',{name:'Analyze',exact:true}).evaluate(el=>el.getBoundingClientRect().top);const selectorTop=await page.getByRole('button',{name:'Choose trade teams'}).evaluate(el=>el.getBoundingClientRect().top);expect(selectorTop).toBeGreaterThan(analyzeTop);
 await page.getByRole('button',{name:'Find ideas',exact:true}).click();
 await expect(page.getByRole('button',{name:'Choose trade teams'})).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Find trades for team'})).toHaveValue('Ryan');
 await page.getByRole('combobox',{name:'Find trades for team'}).selectOption('Keith');
 await expect(page.getByRole('combobox',{name:'Find trades for team'})).toHaveValue('Keith');
 // v57: results and the analysis handoff must retain the searched manager and exact players.
 await page.getByRole('button',{name:'Find trades',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Find trades for team'})).toBeDisabled();
 await expect(page.getByRole('combobox',{name:'Trade format',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Stream',exact:true}).click();
 await expect(page.getByRole('button',{name:'Find streaming opportunities',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Trades',exact:true}).click();
 await page.locator('.idea-row').first().waitFor({timeout:60000});
 await expect(page.locator('.ideas-section .status-note')).not.toContainText('{ideas.avoided}');
 await page.locator('.idea-row').first().click();
 await expect(page.locator('.deal-sheet .eyebrow').first()).toHaveText('KEITH SENDS');
 const searchedGive=await page.locator('.deal-sheet h3').nth(0).innerText(),searchedReceive=await page.locator('.deal-sheet h3').nth(1).innerText();
 await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
 await expect(page.getByRole('button',{name:'Choose trade teams'})).toContainText('Keith');
 await expect(page.locator('.impact-heading')).toContainText('Analyze recommended trade');
 await expect(page.locator('.exchange')).toContainText(searchedGive);await expect(page.locator('.exchange')).toContainText(searchedReceive);
 // The actual proposed roster must drive the trade rank table, not saved rosters.
 const offer=await page.evaluate(({give,receive})=>{
  const data=window.DraftRoomBridge.data();
  const sent=data.projections.find(p=>window.DraftRoomBridge.label(p.draftId)===give).draftId;
  const got=data.projections.find(p=>window.DraftRoomBridge.label(p.draftId)===receive).draftId;
  const other=Object.keys(data.rosters).find(t=>data.rosters[t].includes(got));return {sent,got,other};
 },{give:searchedGive,receive:searchedReceive});
 const next=structuredClone(active);next.Keith=next.Keith.filter(id=>id!==offer.sent).concat(offer.got);next[offer.other]=next[offer.other].filter(id=>id!==offer.got).concat(offer.sent);
 const nextLeague=rankTotals(model.totals(next),categoryNames),oldKeith=expectedLeague.find(t=>t.team==='Keith'),newKeith=nextLeague.find(t=>t.team==='Keith');
 for(const [i,c] of ['DREB','AST','OREB','FTM'].entries()){
  const cells=page.locator('.impact-table').first().locator('tbody tr').nth(i).locator('td');
  await expect(cells.nth(0)).toHaveText(String(oldKeith.ranks[c]));await expect(cells.nth(2)).toHaveText(String(newKeith.ranks[c]));
 }

 await page.getByRole('button',{name:'Find ideas',exact:true}).click();
 await page.getByRole('combobox',{name:'Find trades for team'}).selectOption('Ryan');
 await expect(page.getByRole('combobox',{name:'Trade format',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Find trades',exact:true})).toBeVisible();
 await expect(page.locator('.ideas-section .status-note')).toHaveCount(0);
 await page.getByRole('button',{name:'Find trades',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'Trade search progress'})).toBeVisible();
 await expect(page.locator('.ideas-section .footnote')).toContainText('cash-pot gain');
 await expect(page.locator('.ideas-section .status-note').last()).toContainText(/offers pass|No offers passed/,{timeout:60000});
 await expect(page.locator('.payout-line').first()).toContainText('Your pot');
 await expect(page.locator('.payout-comparison').first()).toContainText(/You gain more|Opponent gains more|Similar gains/);
 await expect(page.locator('.trade-verdict').first()).toContainText(/Strong recommendation|Situational/);
 // Trade suggestions are analysis-only, including the full recommended package.
 await page.locator('.idea-row').first().click();
 await expect(page.getByRole('button',{name:'Queue scenario for review'})).toHaveCount(0);
 await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
 await expect(page.locator('.impact-heading')).toContainText('Analyze recommended trade');
 await expect(page.locator('.pot-summary')).toContainText('cash-pot payout');
 await expect(page.locator('.trade-summary')).toBeVisible();
 await expect(page.getByRole('button',{name:'Queue for review'})).toHaveCount(0);
 await page.getByRole('button',{name:'Compare all 9 categories'}).click();
 await expect(page.locator('.impact-table').nth(1).locator('tbody tr')).toHaveCount(9);
 await expect(page.locator('.impact-table').nth(2).locator('tbody tr')).toHaveCount(9);
 await page.getByRole('button',{name:'Close panel'}).click();
 await page.getByRole('button',{name:'Find ideas',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Trade format',exact:true}).locator('option')).toHaveCount(2);
 await page.getByRole('combobox',{name:'Trade format',exact:true}).selectOption('2:2');
 await expect(page.locator('.ideas-section .status-note')).toHaveCount(0);
 await page.getByRole('button',{name:'Find trades',exact:true}).click();
 await expect(page.locator('.ideas-section .status-note').last()).toContainText(/offers pass|No offers passed/,{timeout:60000});
 // If a 2-for-2 offer is available, analyze both players on each side.
 if(await page.locator('.idea-row').count()){
  await page.locator('.idea-row').first().click();
  await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
  await expect(page.locator('.impact-heading')).toContainText('2 for 2');
  await expect(page.locator('.pot-summary')).toBeVisible();
  await expect(page.getByRole('button',{name:'Queue for review'})).toHaveCount(0);
 }
 await page.getByRole('button',{name:'Analyze',exact:true}).click();
 await page.getByRole('combobox',{name:'Analyze trade format'}).selectOption('1:1');
 await expect(page.locator('.pot-summary')).toContainText('cash-pot payout');
 await page.getByRole('button',{name:'Ranks',exact:true}).click();await expect(page.locator('.weekly-pot-row')).toHaveCount(12);
 await expect(page.locator('.weekly-pot-board')).not.toHaveAttribute('open','');
 const ranksTabTop=await page.getByRole('button',{name:'My team',exact:true}).evaluate(el=>el.getBoundingClientRect().top);expect(ranksTabTop).toBeLessThan(600);
 await page.locator('.weekly-pot-board summary').click();await expect(page.locator('.weekly-pot-row').first()).toBeVisible();await page.locator('.weekly-pot-board summary').click();
 await expect(page.locator('.gap-row')).toHaveCount(9);
 await expect(page.locator('.gap-value')).toHaveCount(9);
 // Percentages are relative to projected league leaders; TO is lower-is-better.
 await expect(page.locator('.gap-row').filter({has:page.locator('.gap-value')}).first()).toBeVisible();
 const edgeLabels=await page.locator('.gap-value').allTextContents();
 expect(edgeLabels.every(v=>v==='League leader'||v.endsWith(' (1st)'))).toBe(true);
 expect(edgeLabels.every(v=>v==='League leader'||/^\d+\.\d% (behind|more than) /.test(v))).toBe(true);
 const turnoverGap=await page.locator('.gap-row').filter({has:page.getByText('Turnovers', {exact:false})}).locator('.gap-value').textContent();
 expect(turnoverGap==='League leader'||/\d+\.\d% more than /.test(turnoverGap)).toBe(true);

 await page.getByRole('button',{name:'Trades',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Analyze trade format'})).toHaveValue('1:1');
 // A hidden second slot must never remove a player from one-for-one selection.
 await page.getByRole('button',{name:'Choose trade teams',exact:true}).click();await page.getByRole('combobox',{name:'Trading partner',exact:true}).selectOption('Keith');await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Choose player to receive',exact:true}).click();await expect(page.locator('.selection-row')).toHaveCount(initial.rosters.Keith.length);
 await page.getByRole('textbox',{name:'Search roster players'}).fill('Durant');await expect(page.locator('.selection-row')).toContainText('K.Durant');
 await page.getByRole('textbox',{name:'Search roster players'}).fill('zz-nobody');await expect(page.getByRole('heading',{name:'No matching players',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear roster search'}).click();await expect(page.locator('.selection-row')).toHaveCount(initial.rosters.Keith.length);await page.getByRole('button',{name:'Close panel'}).click();
 await page.getByRole('combobox',{name:'Analyze trade format'}).selectOption('2:1');
 await expect(page.getByRole('button',{name:'Choose second player to send'})).toBeVisible();
 await page.getByRole('button',{name:'Choose second player to send'}).click();
 await expect(page.getByRole('heading',{name:'Choose second player to send'})).toBeVisible();
 await page.getByRole('button',{name:'Close panel'}).click();
 await expect(page.getByRole('button',{name:'Choose second player to receive'})).toHaveCount(0);
 await expect(page.locator('.pot-summary')).toContainText('cash-pot payout');
 await expect(page.getByText('one open roster spot', {exact:false})).toBeVisible();
 await page.getByRole('combobox',{name:'Analyze trade format'}).selectOption('2:2');
 await expect(page.getByRole('button',{name:'Choose second player to receive'})).toBeVisible();
 await expect(page.locator('.pot-summary')).toContainText('cash-pot payout');
 await page.getByRole('combobox',{name:'Analyze trade format'}).selectOption('1:1');
 await expect(page.getByRole('combobox',{name:'Second player to send'})).toHaveCount(0);
 await expect(page.locator('.trade-summary')).toContainText('Estimated weekly side-bet change');await expect(page.locator('.trade-summary')).toContainText('category shares');await page.screenshot({path:evidence+'/02-trade-mobile.png'});
 await expect(page.getByRole('button',{name:'Queue for review',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Team',exact:true}).click();
 await page.getByRole('button',{name:'Manage',exact:true}).click();
 await expect(page.getByRole('heading',{name:'ROSTER MANAGER',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Action',exact:true}).evaluate(el=>el.getBoundingClientRect().top)).resolves.toBeLessThan(await page.locator('.roster-heading').first().evaluate(el=>el.getBoundingClientRect().top));
 await page.getByRole('combobox',{name:'Team to manage',exact:true}).selectOption('Keith');
 await expect(page.locator('.roster-heading')).toContainText('Keith roster');
 await page.getByRole('combobox',{name:'Team to manage',exact:true}).selectOption('Ryan');
 await page.getByRole('combobox',{name:'Other team',exact:true}).selectOption('Keith');
 await expect(page.getByRole('combobox',{name:'Action',exact:true}).locator('option[value="adddrop"]')).toHaveCount(1);
 await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('add');
 await page.getByRole('textbox',{name:'Search free agents',exact:true}).fill('Jokic');
 await expect(page.getByRole('combobox',{name:'Free agent'}).locator('option')).toHaveCount(1); // rostered players cannot be picked
 await page.getByRole('textbox',{name:'Search free agents',exact:true}).fill('Joe');
 expect(await page.getByRole('combobox',{name:'Free agent'}).locator('option').count()).toBeGreaterThan(1);
 await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('adddrop');
 await page.getByRole('textbox',{name:'Search free agents',exact:true}).fill('Joe');
 await page.getByRole('button',{name:'Add to batch',exact:true}).click();
 await expect(page.locator('.review-list')).toContainText('drop');
 expect(await page.evaluate(()=>window.DraftRoomBridge.data().batch)).toHaveLength(1);
 expect(await page.evaluate(()=>window.DraftRoomBridge.data().rosters)).toEqual(initial.rosters);
 await page.getByRole('button',{name:'Discard batch',exact:true}).click();await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Move to IL A.Edwards',exact:true}).click();
 await expect(page.locator('.review-list')).toContainText('IL');
 expect(await page.evaluate(()=>window.DraftRoomBridge.data().batch)).toHaveLength(1);
 await page.getByRole('button',{name:'Close panel',exact:true}).click();await expect(page.locator('.roster-heading')).toContainText('1 on IL · preview');await expect(page.getByRole('button',{name:'Activate A.Edwards',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Activate A.Edwards',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).resolves.toBeGreaterThanOrEqual(44);
 await page.getByRole('button',{name:'Review 1 queued changes',exact:true}).click();
 await page.getByRole('button',{name:'Discard batch',exact:true}).click();await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Manage',exact:true}).click();
 await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('swap');
 await page.getByRole('button',{name:'Add to batch',exact:true}).click();
 await expect(page.locator('#editorToken')).toBeVisible();
 expect(await page.evaluate(()=>window.DraftRoomBridge.data().rosters)).toEqual(initial.rosters);
 await page.getByRole('button',{name:'Save batch to GitHub',exact:true}).click();await expect(page.locator('.live-save-status')).toContainText('Enter the fine-grained');expect(writes.length).toBe(0);
 await page.locator('#editorToken').fill('FAKE_TEST_TOKEN_ONLY');await page.getByRole('button',{name:'Save batch to GitHub',exact:true}).click();await expect(page.locator('.live-save-status')).toHaveCount(0);expect(writes.length).toBe(1);expect(remote.revision).toBe(initial.revision+1);
 // Canonical identity must survive a save/reload even when display names are disambiguated.
 expect(remote.teams.Ryan.find(p=>p.playerId==='hb-15').name).toBe('D.Mitchell');
 expect([...remote.teams.Ryan,...remote.teams.Keith].map(p=>p.playerId).sort()).toEqual([...initial.rosters.Ryan,...initial.rosters.Keith].sort());expect(remote.teams.Ryan.filter(p=>!initial.rosters.Ryan.includes(p.playerId))).toHaveLength(1);expect(remote.teams.Keith.filter(p=>!initial.rosters.Keith.includes(p.playerId))).toHaveLength(1);
 await page.evaluate(()=>window.DraftRoomBridge.reload());expect(await page.evaluate(()=>window.DraftRoomBridge.data().revision)).toBe(initial.revision+1);
 expect(await page.evaluate(()=>state.picks)).toEqual(originalDraft);
 await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Team',exact:true}).click();
 await page.getByRole('button',{name:'Manage',exact:true}).click();
 await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('drop');
 await page.getByRole('button',{name:'Add to batch',exact:true}).click();remote.revision=initial.revision+2;await page.locator('#editorToken').fill('FAKE_TEST_TOKEN_ONLY');await page.getByRole('button',{name:'Save batch to GitHub',exact:true}).click();await expect(page.locator('.live-save-status')).toContainText('Another device');expect(writes.length).toBe(1);expect(await page.evaluate(()=>window.DraftRoomBridge.data().batch.length)).toBe(1);
 await page.getByRole('button',{name:'Discard batch',exact:true}).click();await page.getByRole('button',{name:'Close panel',exact:true}).click();remote.revision=initial.revision+1;
 await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByRole('button',{name:'Select N.Jokic for comparison',exact:true}).click();await page.getByRole('button',{name:'Select D.Clingan for comparison',exact:true}).click();await page.getByRole('button',{name:'Compare',exact:true}).click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(11);await page.screenshot({path:evidence+'/03-comparison-mobile.png'});await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Ranks',exact:true}).click();await expect(page.locator('.category-row')).toHaveCount(9);await page.getByRole('button',{name:'League',exact:true}).click();
 await expect(page.getByRole('region',{name:'All team category rankings'})).toBeVisible();
 await expect(page.locator('.league-matrix tbody tr')).toHaveCount(12);
 await expect(page.locator('.league-matrix thead th')).toHaveCount(10);
 await expect(page.locator('.league-matrix tbody tr').first().locator('td')).toHaveCount(9);
 await expect(page.locator('.league-matrix tbody tr.is-my-team')).toHaveCount(1);
 await page.getByRole('button',{name:'Single category',exact:true}).click();
 await expect(page.locator('.league-row')).toHaveCount(12);
 await page.getByRole('button',{name:'All categories',exact:true}).click();
 await expect(page.locator('.league-matrix tbody tr')).toHaveCount(12);
 await page.screenshot({path:evidence+'/05-rank-matrix-mobile.png'});
 await page.getByRole('button',{name:'Players',exact:true}).click();await page.getByRole('textbox',{name:'Search players',exact:true}).fill('zz-no-player');await expect(page.getByRole('heading',{name:'No matching players',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByRole('combobox',{name:'Sort players',exact:true}).selectOption('adp');await expect(page.locator('.player-lab-row').first()).toContainText('N.Jokic');
 await page.getByRole('button',{name:'Stream',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Exclude injured players'})).toBeChecked();
 await expect(page.locator('.injury-status')).toContainText('ESPN NBA injuries');
 await expect(page.getByRole('button',{name:'Refresh injury report'})).toBeVisible();
 await page.getByRole('button',{name:'Refresh injury report'}).click();
 await expect(page.locator('.injury-status')).toContainText('Checked');
 await expect(page.locator('.injury-status')).toContainText('Report updated');
 await expect(page.getByRole('checkbox',{name:'Exclude injured players'})).toBeChecked();
 await page.getByRole('button',{name:'Find streaming opportunities',exact:true}).click();
 await expect(page.locator('.stream-results')).toBeVisible();
 await expect(page.locator('.stream-results')).not.toContainText('J.Butler');
 await expect(page.locator('.stream-results')).not.toContainText('K.Porzingis');
 await expect(page.getByRole('combobox',{name:'Trade format',exact:true})).toHaveCount(0);
 // Pot-ranked picks must be positive and sorted; injury filtering remains reversible.
 const suggestionCount=await page.locator('.stream-row').count();
 // No offer is preferable to a modeled harmful permanent drop.
 if(!suggestionCount)await expect(page.locator('.stream-results')).toContainText('No projected pot-improving replacements');
 if(suggestionCount){
  await expect(page.locator('.stream-row').first()).toContainText(/weekly pot share|Two-pickup plan/);
  await expect(page.locator('.stream-row').last()).toContainText('Modeled pot:');
  await expect(page.locator('.stream-row').last()).toContainText('Improves:');
  await expect(page.locator('.stream-row').last()).toContainText('Weakens:');
  const values=await page.locator('.stream-row .section-header .positive').allTextContents();
  const impacts=values.map(v=>Number(v.match(/([+−-]?\d+\.\d+) pp/)?.[1].replace('−','-')||0));
  expect(impacts.every(n=>n>=0)).toBe(true);
  expect(impacts.every((n,i)=>i===0||impacts[i-1]>=n)).toBe(true);
  const addId=await page.locator('.stream-row .stream-pair').first().locator('div').last().locator('b').textContent();
  const projection=initial.projections.find(p=>addId?.startsWith(p.name));
  if(projection){
   injuryFixture.players.unshift({name:projection.name,team:projection.team,status:'Out'});
   injuryFixture.count=injuryFixture.players.length;
   await page.getByRole('button',{name:'Find streaming opportunities',exact:true}).click();
   await expect(page.locator('.stream-results')).toContainText('injured excluded');
   await page.getByRole('checkbox',{name:'Exclude injured players'}).uncheck();
   await expect(page.locator('.stream-results')).not.toContainText('injured excluded');
  }
 }
 await page.screenshot({path:evidence+'/04-stream-mobile.png'});
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Draft & backups',exact:false}).click();await expect(page.getByRole('heading',{name:'DRAFT CENTER',exact:true})).toBeVisible();await expect(page.locator('#legacy-ui')).toBeHidden();await expect(page.locator('#export')).toBeVisible();await expect(page.locator('#bestPickContext')).toContainText('Draft complete');
 const backup=await page.evaluate(()=>JSON.stringify(state));
 await page.screenshot({path:evidence+'/06-draft-mobile.png'});
 await page.locator('#reset').click();await expect(page.locator('#count')).toHaveText('0');await page.locator('#player').fill('N.Jokic');await page.locator('#playerSuggestions button').first().click();await page.locator('#record').click();await expect(page.locator('#count')).toHaveText('1');await page.locator('#undo').click();await expect(page.locator('#count')).toHaveText('0');
 await page.locator('#restore').setInputFiles({name:'draft-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await expect(page.locator('#count')).toHaveText('168');
 await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'GitHub & projections',exact:false}).click();await page.getByRole('button',{name:'Upload projections',exact:true}).click();
 await expect(page.getByRole('heading',{name:'UPLOAD PROJECTIONS',exact:true})).toBeVisible();await expect(page.locator('#legacy-ui')).toBeHidden();await expect(page.locator('.preview-label')).toHaveText('v58');expect(await page.locator('.hero-title').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:evidence+'/07a-projections-start-mobile.png'});
 await page.getByRole('button',{name:'Validate and preview',exact:true}).click();await expect(page.locator('#tool-projections-preview')).toContainText('Validation failed');await expect(page.locator('#tool-projections-publish')).toBeDisabled();
 const tableText=await page.evaluate(()=>window.DRAFT_PROJECTIONS_RAW.trim().split(/\r?\n/).map(row=>{const x=row.split(/\s+/);x[1]=x[1].replaceAll('_',' ');if(x[2]==='-')x[2]='';return x.join(' ')}).join('\n'));
 await page.getByLabel('Projection table',{exact:true}).fill(tableText);await page.getByRole('button',{name:'Validate and preview',exact:true}).click();await expect(page.locator('#tool-projections-preview')).toContainText('Valid: 300 players');
 await page.getByRole('button',{name:'Publish validated projections to GitHub',exact:true}).click();await expect(page.locator('#tool-projections-status')).toContainText('Enter a fine-grained');expect(projectionWrites.length).toBe(0);
 await page.getByLabel('One-time GitHub token',{exact:true}).fill('FAKE_TEST_TOKEN_ONLY');await page.getByRole('button',{name:'Publish validated projections to GitHub',exact:true}).click();await expect(page.locator('#tool-projections-status')).toContainText('Published 300 players');expect(projectionWrites.length).toBe(1);await expect(page.locator('#tool-projections-token')).toHaveValue('');
 await page.screenshot({path:evidence+'/07-projections-mobile.png'});
 await page.getByRole('button',{name:'Back to team',exact:true}).click();await expect(page.getByRole('heading',{name:'MY TEAM',exact:true})).toBeVisible();await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Draft & backups',exact:false}).click();await page.getByRole('link',{name:'Replace saved teams from a backup',exact:true}).click();
 await expect(page.getByRole('heading',{name:'RESTORE TEAMS',exact:true})).toBeVisible();await page.locator('#tool-restore-backup').setInputFiles({name:'draft-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await page.getByRole('button',{name:'Validate all teams',exact:true}).click();await expect(page.locator('#tool-restore-preview')).toContainText('Validated 168 unique picks');await expect(page.locator('#tool-restore-publish')).toBeEnabled();
 await page.screenshot({path:evidence+'/08-restore-mobile.png'});
 await page.getByRole('button',{name:'Team',exact:true}).click();
 await page.goto('http://127.0.0.1:4182'+prefix+'upload.html');await expect(page.getByRole('heading',{name:'UPLOAD PROJECTIONS',exact:true})).toBeVisible();await expect(page.locator('#legacy-ui')).toBeHidden();await page.getByRole('button',{name:'Team',exact:true}).click();
 await expect(page.locator('body')).toHaveClass(/modern-ready/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'Team',exact:true}).click();await page.screenshot({path:evidence+'/05-team-desktop.png'});
 expect(errors).toEqual([]);
 // A failed schedule must never silently claim that lineup limits were applied.
 const fallback=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 await fallback.route('**/nba-schedule.json?fresh=*',route=>route.fulfill({status:503,body:'Unavailable'}));
 await fallback.goto('http://127.0.0.1:4182'+prefix);await expect(fallback.locator('.schedule-status')).toContainText('daily lineup limits are not applied');
 await fallback.getByRole('button',{name:'Ranks',exact:true}).click();await expect(fallback.locator('.intro')).toContainText('Unrestricted season estimates');
 await fallback.unroute('**/nba-schedule.json?fresh=*');await fallback.getByRole('button',{name:'Retry schedule',exact:true}).click();
 await expect(fallback.locator('.schedule-status')).toHaveCount(0);await expect(fallback.locator('.intro')).toContainText('Lineup-adjusted');
 expect(await fallback.locator('.content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await fallback.close();
 const result={status:'passed',viewports:[{width:393,height:852},{width:1280,height:900}],appErrors:errors,mockedGitHubWrites:writes.length,mockedProjectionWrites:projectionWrites.length,checks:['daily position-aware season projections','proposed-roster trade rank table','schedule failure and retry','live data loading','category/trade parity','review-before-save','missing-token guard','canonical identity serialization','successful save and reload','unchanged draft history','stale-revision protection','two-player comparison','rankings','search and ADP sorting','live schedule streaming','native draft record, undo and restore','native projection validation and mocked publication','native backup reconciliation','legacy upload URL redirect','responsive overflow']};
 await fs.writeFile(evidence+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
