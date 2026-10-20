import fs from 'node:fs/promises';
await fs.rename('dist/index.source.html','dist/index.html');
for(const file of ['projections-300-data.js','team-editor.js','analysis-tools.js','modern-bridge.js','team-rosters.json','draft-teams.json','nba-schedule.json','upload.html','teams-upload.html'])await fs.copyFile(file,'dist/'+file);
console.log('Production assets prepared. Existing data files are retained separately during deployment.');
