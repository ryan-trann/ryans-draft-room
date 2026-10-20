import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const root=path.resolve('dist'),prefix='/ryans-draft-room/',evidence=path.resolve('../production-evidence');await fs.mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff':'font/woff','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1'),rel=decodeURIComponent(url.pathname).replace(prefix,'/');const file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(root+path.sep))throw Error();const bytes=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes)}catch{res.statusCode=404;res.end('Not found')}});
await new Promise(resolve=>server.listen(4182,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER_EXECUTABLE||undefined,args:process.env.QA_BROWSER_ARGS?JSON.parse(process.env.QA_BROWSER_ARGS):[]});
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles'});
const errors=[],writes=[],projectionWrites=[],draftWrites=[];let remote=JSON.parse(await fs.readFile('team-rosters.json','utf8'));
const originalDraft=JSON.parse(await fs.readFile('draft-teams.json','utf8')).picks;
page.on('pageerror',e=>errors.push(e.message));
await page.clock.setFixedTime(new Date('2026-10-20T03:15:00Z'));
await page.route('**/team-rosters.json?fresh=*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(remote)}));
await page.route('https://api.github.com/**',async route=>{
 const req=route.request();
 if(req.url().endsWith('/contents/projections-300-data.js')||req.url().endsWith('/contents/draft-teams.json')){
  if(req.method()==='GET')return route.fulfill({contentType:'application/json',body:'{"sha":"fixture-tool-sha"}'});
  if(req.method()==='PUT'){(req.url().includes('projections-')?projectionWrites:draftWrites).push(req.postDataJSON());return route.fulfill({contentType:'application/json',body:'{"commit":{"sha":"fixture-tool-commit"}}'});}
 }
 if(!req.url().endsWith('/contents/team-rosters.json'))throw Error('Unexpected API endpoint');
 if(req.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({sha:'fixture-sha',content:Buffer.from(JSON.stringify(remote)).toString('base64')})});
 if(req.method()==='PUT'){const body=req.postDataJSON();remote=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));writes.push(body);return route.fulfill({contentType:'application/json',body:'{"commit":{"sha":"fixture-commit"}}'});}
 return route.abort();
});
page.on('dialog',d=>d.accept());
try{
 await page.route('**/assets/*.js',async route=>{await new Promise(resolve=>setTimeout(resolve,80));await route.continue()});
 await page.goto('http://127.0.0.1:4182'+prefix,{waitUntil:'commit'});await expect(page.locator('#legacy-ui')).toBeHidden();
 await page.waitForLoadState('networkidle');await expect(page.locator('body')).toHaveClass(/modern-ready/);await page.evaluate(()=>document.fonts.ready);
 await expect(page.getByRole('heading',{name:'MY TEAM',exact:true})).toBeVisible();await expect(page.locator('.team-overview')).toContainText('75.0');await expect(page.locator('.roster-row')).toHaveCount(14);
 const initial=await page.evaluate(()=>window.DraftRoomBridge.data());expect(initial.revision).toBe(1);expect(initial.projections.length).toBe(300);expect(initial.projections.filter(p=>p.adp>0).length).toBe(186);expect(Object.values(initial.rosters).flat().length).toBe(168);
 // Duplicate display names use NBA team + positions; stable player IDs remain unchanged.
 const duplicateLabels=await page.evaluate(()=>{const all=window.DraftRoomBridge.data().projections;const counts=new Map();for(const p of all){const key=p.name.toLowerCase();counts.set(key,(counts.get(key)||0)+1)}return all.filter(p=>counts.get(p.name.toLowerCase())>1).map(p=>({id:p.draftId,actual:window.DraftRoomBridge.label(p.draftId),expected:p.name+' · '+p.team+' ('+p.positions+')'}))});
 expect(duplicateLabels.length).toBeGreaterThan(0);
 for(const p of duplicateLabels)expect(p.actual).toBe(p.expected);
 await page.screenshot({path:evidence+'/01-team-mobile.png'});
 // v38: Team has no redundant Category Strategy entry; Trades is the sole auto finder.
 await expect(page.locator('.strategy-entry')).toHaveCount(0);
 await page.getByRole('button',{name:'Trades',exact:true}).click();
 await page.getByRole('button',{name:'Find ideas',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Trade format',exact:true})).toBeVisible();
 await expect(page.locator('.ideas-section .footnote')).toContainText('cash-pot gain');
 await expect(page.locator('.ideas-section .status-note').last()).toContainText(/offers pass|No offers passed/);
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
 await page.getByRole('combobox',{name:'Trade format',exact:true}).selectOption('2:2');
 await expect(page.locator('.ideas-section .status-note').last()).toContainText(/offers pass|No offers passed/);
 // If a 2-for-2 offer is available, analyze both players on each side.
 if(await page.locator('.idea-row').count()){
  await page.locator('.idea-row').first().click();
  await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
  await expect(page.locator('.impact-heading')).toContainText('2 for 2');
  await expect(page.locator('.pot-summary')).toBeVisible();
  await expect(page.getByRole('button',{name:'Queue for review'})).toHaveCount(0);
 }
 await page.getByRole('button',{name:'Analyze',exact:true}).click();
 await expect(page.locator('.pot-summary')).toContainText('cash-pot payout');
 await page.getByRole('button',{name:'Ranks',exact:true}).click();
 await expect(page.locator('.gap-row')).toHaveCount(9);
 await expect(page.locator('.gap-value')).toHaveCount(9);
 await page.getByRole('button',{name:'Trades',exact:true}).click();await expect(page.locator('.trade-summary')).toContainText('Estimated weekly side-bet change');await expect(page.locator('.trade-summary')).toContainText('category shares');await page.screenshot({path:evidence+'/02-trade-mobile.png'});
 await expect(page.getByRole('button',{name:'Queue for review',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Team',exact:true}).click();
 await page.getByRole('button',{name:'Manage',exact:true}).click();
 await page.getByRole('button',{name:'Add to batch',exact:true}).click();
 await expect(page.locator('#editorToken')).toBeVisible();
 expect(await page.evaluate(()=>window.DraftRoomBridge.data().rosters)).toEqual(initial.rosters);
 await page.getByRole('button',{name:'Save batch to GitHub',exact:true}).click();await expect(page.locator('.live-save-status')).toContainText('Enter the fine-grained');expect(writes.length).toBe(0);
 await page.locator('#editorToken').fill('FAKE_TEST_TOKEN_ONLY');await page.getByRole('button',{name:'Save batch to GitHub',exact:true}).click();await expect(page.locator('.live-save-status')).toHaveCount(0);expect(writes.length).toBe(1);expect(remote.revision).toBe(2);
 // Canonical identity must survive a save/reload even when display names are disambiguated.
 expect(remote.teams.Ryan.find(p=>p.playerId==='hb-15').name).toBe('D.Mitchell');
 expect(remote.teams.Ryan[0].name).toBe('N.Jokic');expect(remote.teams.Keith[0].name).toBe('A.Edwards');
 await page.evaluate(()=>window.DraftRoomBridge.reload());expect(await page.evaluate(()=>window.DraftRoomBridge.data().revision)).toBe(2);
 expect(await page.evaluate(()=>state.picks)).toEqual(originalDraft);
 await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Team',exact:true}).click();
 await page.getByRole('button',{name:'Manage',exact:true}).click();
 await page.getByRole('combobox',{name:'Action',exact:true}).selectOption('drop');
 await page.getByRole('button',{name:'Add to batch',exact:true}).click();remote.revision=3;await page.locator('#editorToken').fill('FAKE_TEST_TOKEN_ONLY');await page.getByRole('button',{name:'Save batch to GitHub',exact:true}).click();await expect(page.locator('.live-save-status')).toContainText('Another device');expect(writes.length).toBe(1);expect(await page.evaluate(()=>window.DraftRoomBridge.data().batch.length)).toBe(1);
 await page.getByRole('button',{name:'Discard batch',exact:true}).click();await page.getByRole('button',{name:'Close panel',exact:true}).click();remote.revision=2;
 await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByRole('button',{name:'Select N.Jokic for comparison',exact:true}).click();await page.getByRole('button',{name:'Select D.Clingan for comparison',exact:true}).click();await page.getByRole('button',{name:'Compare',exact:true}).click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(11);await page.screenshot({path:evidence+'/03-comparison-mobile.png'});await page.getByRole('button',{name:'Close panel',exact:true}).click();
 await page.getByRole('button',{name:'Ranks',exact:true}).click();await expect(page.locator('.category-row')).toHaveCount(9);await page.getByRole('button',{name:'League',exact:true}).click();await expect(page.locator('.league-row')).toHaveCount(12);
 await page.getByRole('button',{name:'Players',exact:true}).click();await page.getByRole('textbox',{name:'Search players',exact:true}).fill('zz-no-player');await expect(page.getByRole('heading',{name:'No matching players',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByRole('combobox',{name:'Sort players',exact:true}).selectOption('adp');await expect(page.locator('.player-lab-row').first()).toContainText('N.Jokic');
 await page.getByRole('button',{name:'Stream',exact:true}).click();await page.getByRole('button',{name:'Find streaming opportunities',exact:true}).click();await expect(page.locator('.stream-results')).toContainText('+22.82');await page.screenshot({path:evidence+'/04-stream-mobile.png'});
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Draft & backups',exact:false}).click();await expect(page.getByRole('heading',{name:'DRAFT CENTER',exact:true})).toBeVisible();await expect(page.locator('#legacy-ui')).toBeHidden();await expect(page.locator('#export')).toBeVisible();await expect(page.locator('#bestPickContext')).toContainText('Draft complete');
 const backup=await page.evaluate(()=>JSON.stringify(state));
 await page.screenshot({path:evidence+'/06-draft-mobile.png'});
 await page.locator('#reset').click();await expect(page.locator('#count')).toHaveText('0');await page.locator('#player').fill('N.Jokic');await page.locator('#playerSuggestions button').first().click();await page.locator('#record').click();await expect(page.locator('#count')).toHaveText('1');await page.locator('#undo').click();await expect(page.locator('#count')).toHaveText('0');
 await page.locator('#restore').setInputFiles({name:'draft-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await expect(page.locator('#count')).toHaveText('168');
 await page.getByRole('button',{name:'Team',exact:true}).click();await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'GitHub & projections',exact:false}).click();await page.getByRole('button',{name:'Upload projections',exact:true}).click();
 await expect(page.getByRole('heading',{name:'UPLOAD PROJECTIONS',exact:true})).toBeVisible();await expect(page.locator('#legacy-ui')).toBeHidden();await expect(page.locator('.preview-label')).toHaveText('v38');expect(await page.locator('.hero-title').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:evidence+'/07a-projections-start-mobile.png'});
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
 const result={status:'passed',viewports:[{width:393,height:852},{width:1280,height:900}],appErrors:errors,mockedGitHubWrites:writes.length,mockedProjectionWrites:projectionWrites.length,checks:['live data loading','category/trade parity','review-before-save','missing-token guard','canonical identity serialization','successful save and reload','unchanged draft history','stale-revision protection','two-player comparison','rankings','search and ADP sorting','live schedule streaming','native draft record, undo and restore','native projection validation and mocked publication','native backup reconciliation','legacy upload URL redirect','responsive overflow']};
 await fs.writeFile(evidence+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
