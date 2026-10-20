import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const projections=JSON.parse(await fs.readFile('projections-300-data.json','utf8'));
if(projections.formatVersion!==1||typeof projections.raw!=='string'||projections.raw.trim().split(/\r?\n/).length!==300){
 throw Error('Invalid shared projection JSON; production build halted');
}
let html=await fs.readFile('dist/index.source.html','utf8');
const placeholder='__PROJECTIONS_JSON_PLACEHOLDER__';
if(!html.includes(placeholder))throw Error('Missing projection JSON placeholder');
const json=JSON.stringify(projections).replace(/</g,'\\u003c');
html=html.replace(placeholder,json);
// Hash each actual inline JavaScript block. Do not allow unsafe-inline scripts.
const hashes=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
 .filter(match=>!/^<script[^>]*type="application\/json"/.test(match[0]))
 .map(match=>"'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'");
if(!hashes.length)throw Error('Expected a legacy inline bootstrap script to hash');
const csp=[
 "default-src 'self'",
 "script-src 'self' "+hashes.join(' '),
 "style-src 'self' 'unsafe-inline'",
 "img-src 'self' data: https:",
 "font-src 'self' data:",
 "connect-src 'self' https://api.github.com https://site.api.espn.com https://cdn.nba.com",
 "object-src 'none'",
 "base-uri 'self'",
 "form-action 'self'",
].join('; ');
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'">');
await fs.writeFile('dist/index.html',html);
await fs.unlink('dist/index.source.html');
for(const file of ['projections-300-data.json','team-editor.js','analysis-tools.js','modern-bridge.js','team-rosters.json','draft-teams.json','nba-schedule.json','upload.html','teams-upload.html'])await fs.copyFile(file,'dist/'+file);
console.log('Production assets prepared with inert projection data and script-hash CSP.');
