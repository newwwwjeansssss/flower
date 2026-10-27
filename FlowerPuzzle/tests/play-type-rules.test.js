import test from 'node:test';import assert from 'node:assert/strict';import * as logic from '../gamelogic.js';
async function run(fn){const w=globalThis.window,d=globalThis.document;globalThis.window={addEventListener(){},FlowerGameLogic:logic};globalThis.document={readyState:'loading',addEventListener(){}};try{await import(`../flower-runtime.js?types=${Math.random()}`);fn(window.FlowerPuzzleRuntime);}finally{globalThis.window=w;globalThis.document=d;}}
const row=y=>[[0,y],[1,y],[2,y]];
const level=()=>({id:1,width:3,height:6,activeCells:Array.from({length:18},(_,i)=>[i%3,Math.floor(i/3)]),given:{fixedFlowers:[],presetPots:[]},fences:[],targets:[...Array.from({length:4},(_,y)=>({id:`i${y}`,assetId:'I3',shape:row(0),solutionCells:row(y)})),...Array.from({length:3},(_,x)=>({id:`d${x}`,assetId:'domino',shape:[[0,0],[1,0]],solutionCells:[[x,4],[x,5]]}))]});
function stroke(rt,s,cells){rt.beginStroke(s,cells[0]);cells.slice(1).forEach(c=>rt.extendStroke(s,c));rt.commitStroke(s);}
test('different shape counts from the standard solution win when all types are used',()=>run(rt=>{
 const s=rt.createGameState(level());stroke(rt,s,row(0));stroke(rt,s,row(1));for(const y of [2,4])for(let x=0;x<3;x++)stroke(rt,s,[[x,y],[x,y+1]]);
 assert.equal(s.shapes.filter(p=>p.status==='pots').length,0);assert.equal(s.status,'blooming');
}));
test('a full board using only one of the required types does not win',()=>run(rt=>{
 const s=rt.createGameState(level());for(let y=0;y<6;y++)stroke(rt,s,row(y));assert.equal(s.status,'playing');assert.equal(s.shapes.filter(p=>p.status==='pots').length,0);
}));
test('deleting one copy retains usage of its type while another copy exists',()=>run(rt=>{
 const s=rt.createGameState(level());stroke(rt,s,row(0));stroke(rt,s,row(1));const id=s.shapes[0].targetId;rt.deleteShapeAt(s,[0,0]);assert.ok(s.completedTargetIds.includes(id));rt.deleteShapeAt(s,[0,1]);assert.equal(s.completedTargetIds.length,0);
}));
test('target strip has type usage checks instead of quantities',()=>run(rt=>{
 const node=()=>({children:[],style:{setProperty(){}},setAttribute(k,v){this[k]=v;},append(...n){this.children.push(...n)},replaceChildren(...n){this.children=n;}}),container=node();
 const s=rt.createGameState(level());stroke(rt,s,row(0));rt.renderTargetStrip(container,s.level,s,{createElement:node});
 assert.equal(container.children.length,2);assert.equal(container.children[0].children[1].textContent,'✓');assert.equal(container.children[1].children[1].textContent,'');
}));
test('hint does not mistake a used type for all authored placements being complete',()=>{
 const l=level(),state={completedTargetIds:l.targets.map(t=>t.id),shapes:[{id:'alternate',status:'buds',targetId:'i0',cells:[[0,0],[0,1],[0,2]]}]};
 assert.deepEqual(logic.getHint(l,state),{type:'remove',shapeId:'alternate'});
});
