import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as logic from '../gamelogic.js';
const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const assets=read('asset.json');
const report=read('docs/flower-trial-audit.json');
const levels=Array.from({length:25},(_,i)=>read(`flower-trial/level-${i+1}.json`));

test('25 trial levels are valid, retain mechanism timing and time limits, and leave originals intact',()=>{
 let single=0;
 for(let i=0;i<25;i++){
  const level=levels[i],source=read(`level/level-${i+1}.json`);
  assert.deepEqual(logic.validateLevel(level,assets),[],level.name);
  assert.equal(level.id,200001+i);assert.equal(level.sourceId,i+1);
  assert.equal(level.collection,'flower-trial');assert.equal(level.timeLimit,source.timeLimit);
  assert.equal(level.given.fixedFlowers.length,source.given.fixedFlowers.length,`${i+1}: fixed flowers`);
  assert.equal(level.given.presetPots.length,[22,23,25].includes(i+1)?3:source.given.presetPots.length,`${i+1}: preset cue`);
  assert.equal(level.fences.length>0,source.fences.length>0);
  assert.ok(level.fences.length<=source.fences.length,'redundant fences removed');
  if(level.fences.length)assert.ok(report.levels[i].fenceEffect.additionalSolutionsPerRemovedFence.every(n=>n>0));
  const types=new Set(level.targets.map(t=>logic.canonicalShape(t.shape)));
  assert.ok(types.size<=2);if(types.size===1)single++;
  assert.ok(!level.targets.some(t=>t.assetId==='W5'));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(`level/level-${i+1}.json`,root))).digest('hex'),report.levels[i].originalSha256);
  assert.ok(report.levels[i].trial.solutions>0);
 }
 assert.equal(single,17);
 for(const n of [6,12,16,15,19,24,25]){
  const row=report.levels[n-1];assert.ok(row.trial.deadPct<row.original.deadPct,`level ${n} trap reduction`);
 }
});

// Walk every cell with retracing, including T/cross branches. Use the game's
// real stroke functions rather than assigning targets or completion flags.
function route(cells,start){
 const all=new Set(cells.map(c=>c.join(','))),seen=new Set(),path=[];
 function visit(p){seen.add(p.join(','));path.push(p);for(const q of [[p[0]+1,p[1]],[p[0]-1,p[1]],[p[0],p[1]+1],[p[0],p[1]-1]])if(all.has(q.join(','))&&!seen.has(q.join(','))){visit(q);path.push(p);}}
 visit(start);assert.equal(seen.size,all.size);return path;
}
test('all trial standard solutions win through real runtime strokes, including given cells and fences',async()=>{
 const w=globalThis.window,d=globalThis.document;
 globalThis.window={addEventListener(){},FlowerGameLogic:logic};globalThis.document={readyState:'loading',addEventListener(){}};
 try{
  await import('../flower-runtime.js?trial-test');const rt=window.FlowerPuzzleRuntime;
  for(const level of levels){
   const state=rt.createGameState(level);
   for(const target of level.targets){
    const preset=level.given.presetPots.find(p=>target.solutionCells.some(c=>c.join(',')===p.cell.join(',')));
    const path=route(target.solutionCells,preset?.cell||target.solutionCells[0]);
    rt.beginStroke(state,path[0]);path.slice(1).forEach(p=>rt.extendStroke(state,p));rt.commitStroke(state);
    assert.ok(state.shapes.some(s=>s.status==='buds'&&s.cells.length===target.solutionCells.length&&s.cells.every(c=>target.solutionCells.some(p=>p.join(',')===c.join(',')))),`${level.name}: invalid flower`);
   }
   assert.equal(state.status,'blooming',level.name);
   rt.advanceBloomSequence(state,Date.now());rt.advanceBloomSequence(state,Date.now()+60000);assert.equal(state.status,'complete',level.name);
  }
 }finally{globalThis.window=w;globalThis.document=d;}
});
