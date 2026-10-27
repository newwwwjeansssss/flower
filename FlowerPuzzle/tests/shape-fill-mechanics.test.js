import {normalizeBoard} from '../board-normalization.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../gamelogic.js';
import {EditorStore} from '../static/js/editor-store.js';
import {paintMechanic,updateMechanics} from '../static/js/editor-mechanics.js';
import {readFile,readdir} from 'node:fs/promises';
const assets={categories:[{items:[{id:'domino',type:'shape',cells:[[0,0],[1,0]]}]}]};
const level=()=>({id:1,width:4,height:3,timeLimit:120,activeCells:Array.from({length:12},(_,i)=>[i%4,Math.floor(i/4)]),given:{fixedFlowers:[],presetPots:[]},fences:[],targets:Array.from({length:6},(_,i)=>{const x=(i%2)*2,y=Math.floor(i/2);return {id:`target-${i}`,assetId:'domino',shape:[[0,0],[1,0]],solutionCells:[[x,y],[x+1,y]]};})});
async function runtime(fn){const w=globalThis.window,d=globalThis.document;globalThis.window={addEventListener(){},FlowerGameLogic:logic};globalThis.document={readyState:'loading',addEventListener(){}};try{await import(`../flower-runtime.js?mechanics=${Math.random()}`);await fn(window.FlowerPuzzleRuntime);}finally{globalThis.window=w;globalThis.document=d;}}
const stroke=(rt,s,cells)=>{rt.beginStroke(s,cells[0]);cells.slice(1).forEach(c=>rt.extendStroke(s,c));rt.commitStroke(s);};
const block=(id,cells,valid=true)=>({id,cells,targetId:valid?'target-0':null,status:valid?'buds':'pots'});

test('brick blocks input, credits once per valid block, refunds removals and stays broken',()=>runtime(rt=>{
 const l={...level(),bricks:[{cell:[3,2],count:2}]},s=rt.createGameState(l);
 rt.beginStroke(s,[3,2]);assert.deepEqual(s.draftPath,[]);
 stroke(rt,s,[[0,0],[1,0]]);assert.equal(s.obstacles.bricks[0].remaining,1);
 logic.obstacleBlockChanged(s,s.shapes[0],[]);assert.equal(s.obstacles.bricks[0].remaining,1);
 rt.deleteShapeAt(s,[0,0]);assert.equal(s.obstacles.bricks[0].remaining,2);
 stroke(rt,s,[[0,0],[1,0]]);stroke(rt,s,[[2,0],[3,0]]);
 assert.equal(s.obstacles.bricks[0].destroyed,true);
 rt.deleteShapeAt(s,[0,0]);assert.equal(s.obstacles.bricks[0].remaining,0);
 rt.beginStroke(s,[3,2]);assert.deepEqual(s.draftPath,[[3,2]]);
 assert.deepEqual(l.bricks,[{cell:[3,2],count:2}]);
}));
test('invalidating a previously valid block refunds live bricks',()=>{
 const s={level:level(),shapes:[],obstacles:logic.createObstacleState({bricks:[{cell:[3,2],count:2}]})},b=block('b',[[0,0],[1,0]]);
 logic.obstacleBlockChanged(s,b,[]);b.targetId=null;b.status='pots';logic.obstacleBlockChanged(s,b,[]);assert.equal(s.obstacles.bricks[0].remaining,2);
});
test('freeze locks editing/removal, uses longest new zone duration and expires on clock',()=>runtime(rt=>{
 let now=1000;const s=rt.createGameState({...level(),frozen:[{cell:[0,0],seconds:2,charges:1},{cell:[1,0],seconds:5,charges:0}]},{clock:()=>now});
 stroke(rt,s,[[0,0],[1,0]]);assert.equal(s.shapes[0].frozenUntil,6000);assert.equal(s.obstacles.frozen[0].melted,true);
 rt.deleteShapeAt(s,[0,0]);assert.equal(s.shapes.length,1);rt.beginStroke(s,[0,0]);assert.deepEqual(s.draftPath,[]);
 now=6000;logic.tickObstacles(s,now);assert.equal(s.shapes[0].frozenUntil,undefined);rt.deleteShapeAt(s,[0,0]);assert.equal(s.shapes.length,0);
 stroke(rt,s,[[0,0],[1,0]]);assert.equal(s.shapes[0].frozenUntil,11000);
}));
test('frozen invalid pots cannot be extended and only newly added cells trigger zones',()=>runtime(rt=>{
 let now=0;const s=rt.createGameState({...level(),frozen:[{cell:[0,0],seconds:1,charges:0}]},{clock:()=>now});
 stroke(rt,s,[[0,0],[1,0],[2,0]]);assert.equal(s.shapes[0].status,'pots');rt.beginStroke(s,[2,0]);assert.deepEqual(s.draftPath,[]);
 now=1001;rt.beginStroke(s,[2,0]);rt.extendStroke(s,[3,0]);rt.commitStroke(s);assert.equal(s.shapes[0].frozenUntil,undefined);
}));
test('network gate opens through valid shapes and closes/crushes crossing shapes after disconnection',()=>runtime(rt=>{
 const gate={id:1,a:[0,0],b:[1,0],circuit:'network',edges:[{a:[2,1],b:[3,1]}]};
 const s=rt.createGameState({...level(),gates:[gate]});
 stroke(rt,s,[[2,1],[3,1]]);assert.equal(s.shapes.length,0);
 stroke(rt,s,[[0,0],[1,0]]);assert.equal(s.obstacles.gates[0].open,true);
 stroke(rt,s,[[2,1],[3,1]]);assert.equal(s.shapes.length,2);
 rt.deleteShapeAt(s,[0,0]);assert.equal(s.obstacles.gates[0].open,false);assert.equal(s.shapes.length,0);
}));
test('network can bridge adjacent blocks, own edges and static walls do not conduct',()=>{
 const gate={id:1,a:[0,0],b:[3,0],circuit:'network',edges:[{a:[2,1],b:[3,1]}]};
 const make=()=>({level:{...level(),gates:[gate]},obstacles:logic.createObstacleState({gates:[gate]}),shapes:[block('a',[[0,0],[1,0]]),block('b',[[2,0],[3,0]])]});
 let s=make();logic.resolveObstacles(s);assert.equal(s.obstacles.gates[0].open,true);
 s=make();s.level.fences=[{a:[1,0],b:[2,0]}];logic.resolveObstacles(s);assert.equal(s.obstacles.gates[0].open,false);
 s=make();s.obstacles.gates[0].edges=[{a:[1,0],b:[2,0]}];logic.resolveObstacles(s);assert.equal(s.obstacles.gates[0].open,false);
 s=make();s.obstacles.gates[0].circuit='single';logic.resolveObstacles(s);assert.equal(s.obstacles.gates[0].open,false);
});
test('free circuits consume terminals once and preserve previous open links',()=>{
 const gates=[{id:1,a:[0,0],b:[1,0],circuit:'network',edges:[{a:[0,2],b:[1,2]}]},{id:2,a:[0,0],b:[1,0],circuit:'network',edges:[{a:[2,2],b:[3,2]}]}];
 const s={level:level(),obstacles:logic.createObstacleState({gates}),shapes:[block('a',[[0,0],[1,0]])]};
 logic.resolveObstacles(s);assert.deepEqual(s.obstacles.gates.map(g=>g.open),[true,false]);logic.resolveObstacles(s);assert.deepEqual(s.obstacles.gates.map(g=>g.open),[true,false]);
});
test('blocked hints skip brick and gate targets; retry resets all mechanism state',()=>runtime(rt=>{
 const s=rt.createGameState({...level(),bricks:[{cell:[0,0],count:1}],frozen:[{cell:[2,0],seconds:3,charges:1}]});
 const hint=logic.getHint(s.level,s);assert.deepEqual(hint.cells,[[2,0],[3,0]]);stroke(rt,s,hint.cells);
 const retry=rt.createGameState(s.level);assert.equal(retry.obstacles.bricks[0].remaining,1);assert.equal(retry.obstacles.frozen[0].melted,false);assert.equal(retry.shapes.length,0);
}));
test('mechanism authoring validates, supports undo/redo and cleans up resized board',()=>{
 const store=new EditorStore({config:{},assets,levels:[level()]});
 assert.equal(paintMechanic(store,'brick',[[3,2]],{count:2}).ok,true);store.undo();assert.equal(store.currentLevel.bricks,undefined);store.redo();assert.equal(store.currentLevel.bricks[0].count,2);
 assert.equal(paintMechanic(store,'frozen',[[3,2]],{seconds:5,charges:0}).ok,false);
 assert.equal(paintMechanic(store,'brick',[[0,0]],{count:0}).ok,false);
 assert.equal(updateMechanics(store,{gates:[{id:1,a:[0,0],b:[1,0],circuit:'network',edges:[]}]}).ok,false);
 store.resizeLevel(3,3);assert.deepEqual(store.currentLevel.bricks,[]);store.undo();assert.equal(store.currentLevel.bricks.length,1);
});
test('save round trip preserves all three mechanism types',async()=>{
 const l={...level(),bricks:[{cell:[3,2],count:2}],frozen:[{cell:[0,2],seconds:4,charges:0}],gates:[{id:1,a:[0,0],b:[1,0],circuit:'network',edges:[{a:[1,1],b:[2,1]}]}]},writes=new Map();
 const store=new EditorStore({config:{},assets,levels:[l],files:{mkdir:async()=>{},writeText:async(p,c)=>writes.set(p,c)}});await store.save();
 const saved=JSON.parse(writes.get('level/level-1.json'));for(const k of ['bricks','frozen','gates'])assert.deepEqual(saved[k],l[k]);
});
test('all imported mechanisms match converted source and pass complete validation',async()=>{
 const root=new URL('../',import.meta.url),assets=JSON.parse(await readFile(new URL('asset.json',root),'utf8'));
 const counts={bricks:0,frozen:0,gates:0};
 for(const name of await readdir(new URL('shape-fill-source/',root))){if(!/^\d+\.json$/.test(name))continue;const source=JSON.parse(await readFile(new URL('shape-fill-source/'+name,root),'utf8')),l=JSON.parse(await readFile(new URL(`shape-fill/level-${source.id}.json`,root),'utf8'));const converted=normalizeBoard({activeCells:source.rows.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='#'?[[x,y]]:[])),...logic.convertSourceMechanics(source)});for(const k of Object.keys(counts)){assert.deepEqual(l[k],converted[k]);if(l[k].length)counts[k]++;}assert.deepEqual(logic.validateLevel(l,assets),[],name);}
 assert.deepEqual(counts,{bricks:38,frozen:45,gates:20});
});

test('native chain mode validates and all four gate modes distinguish one block from a chain',()=>{
 for(const circuit of ['single','linked','chain','network','paired']){
  const gate={id:1,a:[0,0],b:[3,0],circuit,edges:[{a:[2,2],b:[3,2]}]};
  const l={...level(),gates:[gate]},s={level:l,obstacles:logic.createObstacleState(l),shapes:[block('a',[[0,0],[1,0]]),block('b',[[2,0],[3,0]])]};
  assert.deepEqual(logic.validateMechanics(l),[]);
  logic.resolveObstacles(s);assert.equal(s.obstacles.gates[0].open,['chain','network','paired'].includes(circuit),circuit);
 }
});
test('only free pairing modes can connect terminals belonging to different gates',()=>{
 for(const circuit of ['single','chain','linked','network']){
  const gates=[{id:1,a:[0,0],b:[0,1],circuit,edges:[{a:[0,2],b:[1,2]}]},{id:2,a:[1,0],b:[3,1],circuit,edges:[{a:[2,2],b:[3,2]}]}];
  const s={level:level(),obstacles:logic.createObstacleState({gates}),shapes:[block('a',[[0,0],[1,0]])]};
  logic.resolveObstacles(s);assert.equal(s.obstacles.gates.filter(g=>g.open).length,['linked','network'].includes(circuit)?1:0,circuit);
 }
});
test('closing gate crushes even frozen blocks and refunds each surviving brick credit',()=>runtime(rt=>{
 const l={...level(),bricks:[{cell:[3,2],count:5}],frozen:[{cell:[2,1],seconds:10,charges:2}],gates:[{id:1,a:[0,0],b:[1,0],circuit:'single',edges:[{a:[2,1],b:[3,1]}]}]};
 const s=rt.createGameState(l,{clock:()=>1000});stroke(rt,s,[[0,0],[1,0]]);stroke(rt,s,[[2,1],[3,1]]);
 assert.equal(s.obstacles.bricks[0].remaining,3);assert.equal(logic.shapeIsLocked(s.shapes[1],1000),true);
 rt.deleteShapeAt(s,[0,0]);assert.equal(s.shapes.length,0);assert.equal(s.obstacles.bricks[0].remaining,5);assert.equal(s.obstacles.frozen[0].remainingCharges,1);
}));
test('finite ice exhausts exactly after two triggers while unlimited ice survives',()=>runtime(rt=>{
 let now=1000;const s=rt.createGameState({...level(),frozen:[{cell:[0,0],seconds:2,charges:2},{cell:[1,0],seconds:5,charges:0}]},{clock:()=>now});
 for(let i=0;i<3;i++){
  stroke(rt,s,[[0,0],[1,0]]);assert.equal(s.shapes[0].frozenUntil,now+5000);
  assert.equal(s.obstacles.frozen[0].remainingCharges,Math.max(0,1-i));assert.equal(s.obstacles.frozen[0].melted,i>=1);assert.equal(s.obstacles.frozen[1].melted,false);
  now+=5000;rt.deleteShapeAt(s,[0,0]);
 }
}));
test('hint uses runtime clock and never recommends deleting a still-frozen invalid block',()=>runtime(rt=>{
 const l={...level(),targets:level().targets.map(t=>({...t,solutionCells:[]})),frozen:[{cell:[0,0],seconds:5,charges:0}]};
 let now=1000;const s=rt.createGameState(l,{clock:()=>now});stroke(rt,s,[[0,0],[1,0],[2,0]]);
 assert.equal(logic.getHint(l,s),null);now=6000;assert.equal(logic.getHint(l,s).type,'remove');
}));
