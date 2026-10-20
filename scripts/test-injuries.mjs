import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const src=ts.transpileModule(await readFile('frontend/injuries.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const lib=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const report={source:'ESPN NBA injuries',sourceUrl:'https://www.espn.com/nba/injuries',updatedAt:new Date().toISOString(),count:12,players:[
 {name:'Jimmy Butler III',team:'GSW',status:'Out'},
 {name:'Kristaps Porzingis',team:'GSW',status:'Out'},
 ...Array.from({length:10},(_,i)=>({name:'Fixture '+i,team:'ATL',status:'Out'}))
]};
assert.equal(lib.isListedInjured('J.Butler','GS',report),true,'Jimmy Butler GS must match ESPN Jimmy Butler III GSW');
assert.equal(lib.isListedInjured('K.Porzingis','GS',report),true,'Kristaps Porzingis GS must match ESPN GSW');
assert.equal(lib.isListedInjured('J.Butler','GSW',report),true);
assert.equal(lib.isListedInjured('K.Porzingis','GSW',report),true);
assert.equal(lib.isListedInjured('J.Butler','MIA',report),false,'Team mismatch should not flag another player');
assert.equal(lib.isListedInjured('Unlisted Player','GS',report),false);
assert.equal(lib.injuryKey('J.Butler','GS'),lib.injuryKey('Jimmy Butler III','GSW'));
assert.equal(lib.injuryKey('K.Porzingis','GS'),lib.injuryKey('Kristaps Porzingis','GSW'));
console.log('Injury identity matching passed: GS ↔ GSW, Jimmy Butler III, Kristaps Porzingis.');
