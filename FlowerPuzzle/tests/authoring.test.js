import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EditorStore} from '../static/js/editor-store.js';
import {validateLevel,getAssetReferences} from '../gamelogic.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const assets=JSON.parse(readFileSync(new URL('../asset.json',import.meta.url)));
const empty=()=>({id:1,name:'test',width:4,height:4,type:'flower-puzzle',activeCells:Array.from({length:16},(_,i)=>[i%4,Math.floor(i/4)]),targets:[],given:{fixedFlowers:[],presetPots:[]},fences:[],requirements:[{assetId:'I3',count:1}]});
const storeFor=(level=empty())=>new EditorStore({config,assets,levels:[level]});
test('required drawing rejects unconfigured shapes and excess copies without mutations',()=>{
 const s=storeFor();assert.equal(s.addRequiredTargetFromCells([[0,0],[1,0]]).ok,false);assert.equal(s.history.length,0);
 assert.equal(s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]).ok,true);
 assert.equal(s.addRequiredTargetFromCells([[0,1],[1,1],[2,1]]).ok,false);assert.equal(s.currentLevel.targets.length,1);
});
test('requirements survive removing a placed flower, undo and redo',()=>{
 const s=storeFor();s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]);s.removeAuthoredTarget(0);
 assert.equal(s.currentLevel.targets.length,0);assert.equal(s.currentLevel.requirements[0].count,1);
 s.undo();assert.equal(s.currentLevel.targets.length,1);s.redo();assert.equal(s.currentLevel.targets.length,0);
});
test('arbitrary fixed cells do not consume requirements and cannot overwrite a target',()=>{
 const s=storeFor();assert.equal(s.paintFixedRegion([[0,1],[1,1],[2,1],[2,2],[3,2],[3,3]],true).ok,true);
 assert.equal(s.currentLevel.given.fixedFlowers.length,6);assert.equal(s.currentLevel.targets.length,0);
 s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]);
 assert.equal(s.paintFixedRegion([[1,0]],true).ok,false);
 assert.equal(s.paintFixedRegion([[2,2]],false).ok,true);assert.equal(s.currentLevel.given.fixedFlowers.length,5);
});
test('preset region must be a proper subset of one required flower and supports erasing',()=>{
 const s=storeFor();s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]);
 assert.equal(s.paintPresetRegion([[0,1]],true).ok,false);
 assert.equal(s.paintPresetRegion([[0,0],[1,0]],true).ok,true);
 assert.equal(s.paintPresetRegion([[2,0]],true).ok,false);
 assert.equal(s.paintPresetRegion([[1,0]],false).ok,true);assert.equal(s.currentLevel.given.presetPots.length,1);
});
test('fences may separate targets but cannot disconnect a standard solution',()=>{
 const l=empty();l.requirements[0].count=2;const s=storeFor(l);
 s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]);s.addRequiredTargetFromCells([[0,1],[1,1],[2,1]]);
 assert.equal(s.paintAuthoredFence([0,0],[1,0],true).ok,false);
 assert.equal(s.paintAuthoredFence([0,0],[0,1],true).ok,true);
 assert.equal(s.paintAuthoredFence([0,0],[0,1],false).ok,true);
});
test('a requirement cannot be reduced below placed count and incorrect demands block save validation',()=>{
 const s=storeFor();s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]);
 assert.equal(s.setShapeRequirement('I3',0).ok,false);
 s.currentLevel.requirements[0].count=2;
 assert.ok(validateLevel(s.currentLevel,assets).some(e=>e.includes('需求')));
});
test('unplaced configured shapes protect their resource reference',()=>{
 assert.equal(getAssetReferences(empty(),'I3'),true);
});
test('requirements, arbitrary fixed cells and presets survive save and reload',async()=>{
 const s=storeFor(),writes=new Map();s.files={mkdir:async()=>{},writeText:async(p,v)=>writes.set(p,v)};
 s.addRequiredTargetFromCells([[0,0],[1,0],[2,0]]);
 s.paintFixedRegion([[0,1],[1,1],[2,1],[2,2]],true);s.paintPresetRegion([[0,0]],true);s.cropEmptyCells();
 await s.save();const saved=JSON.parse(writes.get('level/level-1.json'));
 assert.deepEqual(saved.requirements,[{assetId:'I3',count:1}]);assert.equal(saved.given.fixedFlowers.length,4);
 const restored=storeFor(saved);assert.equal(restored.currentLevel.given.presetPots.length,1);assert.deepEqual(validateLevel(restored.currentLevel,assets),[]);
 restored.files=s.files;restored.setShapeRequirement('I3',2);writes.clear();await assert.rejects(restored.save());assert.equal(writes.size,0);
});

