import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as logic from '../gamelogic.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const levels=Array.from({length:12},(_,i)=>read(`flower-trial/level-${31+i}.json`));
const assets=read('asset.json');
const fixture={...levels[0],fences:[],width:3,height:3,activeCells:[[0,1],[1,1],[2,1],[1,0],[1,2]],overlapCells:[{cell:[1,1],count:2}],targets:levels[0].targets.slice(0,2).map((t,i)=>({...t,shape:[[0,0],[1,0],[2,0]],assetId:'I3',solutionCells:i?[[1,0],[1,1],[1,2]]:[[0,1],[1,1],[2,1]]}))};
globalThis.window={addEventListener(){},FlowerGameLogic:logic};globalThis.document={readyState:'loading',addEventListener(){}};
await import('../flower-runtime.js?overlap-tests');const rt=window.FlowerPuzzleRuntime;
function draw(s,cells){rt.beginStroke(s,cells[0]);for(const c of cells.slice(1))rt.extendStroke(s,c);rt.commitStroke(s);}
test('31–42 validate and win through real strokes in both solution orders',()=>{
 for(const l of levels){assert.deepEqual(logic.validateLevel(l,assets),[],l.name);assert.equal(l.overlapCells.length,l.sourceId<37?1:2);assert.ok(l.overlapCells.every(o=>o.count===2));
  for(const targets of [l.targets,[...l.targets].reverse()]){const s=rt.createGameState(l);for(const t of targets)draw(s,t.solutionCells);assert.equal(s.status,'blooming',l.name);}
 }
});
test('ordinary cells reject overlap, unfinished numbers block win, invalid strokes leave counts unchanged',()=>{
 const l=fixture,s=rt.createGameState(l);draw(s,l.targets[0].solutionCells);assert.equal(s.status,'playing');
 assert.equal(logic.canExtendPath([],l.targets[0].solutionCells[0],{occupiedCells:s.shapes.flatMap(s=>s.cells)},l).ok,false);
 const before=structuredClone(s.shapes);draw(s,[[1,1],[1,0]]);assert.deepEqual(s.shapes,before);
 draw(s,l.targets[1].solutionCells);assert.equal(s.status,'blooming');
 rt.deleteShapeAt(s,[1,1]);assert.equal(s.shapes.length,1);assert.deepEqual(s.shapes[0].cells,l.targets[0].solutionCells);assert.equal(s.status,'playing');
 assert.equal(logic.getHint(l,s).type,'draw');draw(s,l.targets[1].solutionCells);assert.equal(s.status,'blooming');
});
test('starting a drag on a shared cell adds a layer; tapping it removes the latest layer',()=>{
 const l=fixture,s=rt.createGameState(l);draw(s,l.targets[0].solutionCells);
 const handlers={},canvas={style:{},addEventListener(n,f){handlers[n]=f},removeEventListener(){}};
 rt.bindPointerEvents(canvas,s,e=>e.cell,()=>{});
 const e=cell=>({pointerId:1,cell,preventDefault(){}});
 handlers.pointerdown(e([1,1]));handlers.pointermove(e([1,0]));handlers.pointermove(e([1,1]));handlers.pointermove(e([1,2]));handlers.pointerup(e([1,2]));assert.equal(s.shapes.length,2);assert.equal(s.status,'blooming');
 s.status='playing';handlers.pointerdown(e([1,1]));handlers.pointerup(e([1,1]));assert.equal(s.shapes.length,1);
});
test('overlap schema rejects wrong counts, duplicates, and non-board cells',()=>{
 for(const overlapCells of [[{cell:[1,1],count:3}],[{cell:[99,0],count:2}],[...levels[0].overlapCells,...levels[0].overlapCells]])assert.ok(logic.validateLevel({...levels[0],overlapCells},assets).length);
});

test('overlap levels survive native save, reload, and target removal/redraw',async()=>{
 const {EditorStore}=await import('../static/js/editor-store.js');const writes=new Map();
 const store=new EditorStore({config:{},assets,levels:[{...structuredClone(fixture),filePath:"flower-trial/level-31.json"}],files:{mkdir:async()=>{},writeText:async(p,c)=>writes.set(p,c),remove:async()=>{}}});
 store.selectCollection('flower-trial');store.updateLevel({name:'重叠保存验证'});
 await store.save();const saved=JSON.parse(writes.get('flower-trial/level-31.json'));
 assert.deepEqual(saved.overlapCells,fixture.overlapCells);assert.deepEqual(saved.design,levels[0].design);
 store.removeAuthoredTarget(1);assert.equal(store.currentLevel.targets.length,1);
 assert.equal(store.addRequiredTargetFromCells(fixture.targets[1].solutionCells).ok,true);
 assert.deepEqual(logic.validateLevel(store.currentLevel,assets),[]);
});

test('compact layouts have no enclosed holes and connect the overlap core to surrounding flowers',()=>{
 const audit=read('docs/overlap-trial-audit.json');
 for(const row of audit){
  assert.ok(row.activeCells>=17,`level ${row.level}: retain board scale`);
  assert.ok(row.boardDensity>=.65 && row.boardDensity<=.85,`level ${row.level}: avoid peripheral rings`);
  assert.equal(row.enclosedHoleCells,0);
  assert.ok(row.ordinaryFlowersTouchingCoreAtTwoCells>=2);
 }
 for(const n of [38,40,41])assert.deepEqual(audit.find(r=>r.level===n).sharedCellsPerCorePair,[2]);
 for(const n of [39,42])assert.deepEqual(audit.find(r=>r.level===n).sharedCellsPerCorePair,[1,1]);
 const palettes=levels.slice(0,4).map(l=>[...new Set(l.targets.map(t=>t.assetId))].sort());
 assert.deepEqual(palettes,[['I3'],['L3'],['I4','L3'],['L3','L4']]);
});


test('every shared point has a visible local entry that narrows choices and can lead to a solution',()=>{
 const audit=read('docs/overlap-trial-audit.json');
 for(const row of audit){
  const raw=fs.readFileSync(new URL(`../flower-trial/level-${row.level}.json`,import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),row.inputDigest,`rerun audit for ${row.level}`);
  const l=levels.find(l=>l.sourceId===row.level);
  assert.equal(row.localEntries.length,l.overlapCells.length);
  for(const e of row.localEntries){
   assert.ok(e.entryBoundaryEdges+e.entryFenceEdges>0,`${row.level}: visible starting landmark`);
   assert.ok(e.legalChoices>=1 && e.legalChoices<=(row.level<=36?1:3));
   assert.equal(e.choicesReachingOverlap,e.legalChoices,`${row.level}: entry must lead into overlap`);
   assert.ok(e.solvableChoices>=1,`${row.level}: entry must not be a trap`);
   if(row.level<=36)assert.ok(e.continuations.every(c=>c.nextChoicesAtOverlap<=4));
  }
  assert.ok(row.fenceImpacts.every(f=>f.excludedPlacements>0));
 }
 for(const n of [31,32])assert.equal(audit.find(r=>r.level===n).coverageRemainingAfterForcedMoves,0);
 const fences33=levels.find(l=>l.sourceId===33).fences;
 assert.ok(fences33.some(f=>JSON.stringify(f.a)==='[3,2]' && JSON.stringify(f.b)==='[3,3]'));
});
