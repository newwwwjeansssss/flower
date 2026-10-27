import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBoard} from '../board-normalization.js';
import {readFile,readdir} from 'node:fs/promises';
test('trimming keeps holes and translates every board coordinate without moving local shapes',()=>{
 const l={width:10,height:10,activeCells:[[3,4],[4,4],[3,5]],targets:[{shape:[[0,0],[1,0]],origin:[3,4],solutionCells:[[3,4],[4,4]]}],given:{fixedFlowers:[{cell:[3,5]}],presetPots:[{cell:[4,4]}]},fences:[{a:[3,4],b:[3,5]}],bricks:[{cell:[3,4],count:2}],frozen:[{cell:[4,4],seconds:5,charges:0}],gates:[{id:1,a:[3,4],b:[3,5],edges:[{a:[3,4],b:[4,4]}]}]};
 const n=normalizeBoard(l);
 assert.deepEqual([n.width,n.height],[2,2]);assert.deepEqual(n.activeCells,[[0,0],[1,0],[0,1]]);
 assert.deepEqual(n.targets[0],{shape:[[0,0],[1,0]],origin:[0,0],solutionCells:[[0,0],[1,0]]});
 assert.deepEqual(n.given,{fixedFlowers:[{cell:[0,1]}],presetPots:[{cell:[1,0]}]});
 assert.deepEqual(n.fences,[{a:[0,0],b:[0,1]}]);assert.deepEqual(n.bricks,[{cell:[0,0],count:2}]);
 assert.deepEqual(n.frozen,[{cell:[1,0],seconds:5,charges:0}]);assert.deepEqual(n.gates,[{id:1,a:[0,0],b:[0,1],edges:[{a:[0,0],b:[1,0]}]}]);
 assert.equal(l.width,10);assert.deepEqual(l.bricks[0].cell,[3,4]);assert.deepEqual(normalizeBoard(n),n);
});
test('all Shape Fill boards have no outer padding, like the flower collection',async()=>{
 const dir=new URL('../shape-fill/',import.meta.url);
 for(const name of await readdir(dir)){
  if(!/^level-.*\.json$/.test(name))continue;
  const l=JSON.parse(await readFile(new URL(name,dir),'utf8'));
  assert.equal(Math.min(...l.activeCells.map(c=>c[0])),0,name);assert.equal(Math.min(...l.activeCells.map(c=>c[1])),0,name);
  assert.equal(Math.max(...l.activeCells.map(c=>c[0]))+1,l.width,name);assert.equal(Math.max(...l.activeCells.map(c=>c[1]))+1,l.height,name);
 }
});
