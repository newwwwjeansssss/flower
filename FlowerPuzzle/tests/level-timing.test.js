import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createEmptyLevel,validateLevel} from '../gamelogic.js';import {estimateTimeLimit} from '../level-timing.js';import {EditorStore} from '../static/js/editor-store.js';import {bindTimeLimitInput,renderTimeLimitInput} from '../static/js/editor-time-limit.js';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url))),assets=read('asset.json'),config=read('config.json');
test('new levels have a default; legacy levels load; invalid explicit time values are rejected',()=>{
 assert.equal(createEmptyLevel({id:501,config}).timeLimit,120);const level=read('level/level-14.json');delete level.timeLimit;assert.deepEqual(validateLevel(level,assets),[]);
 for(const timeLimit of [0,-1,1.5,null,'120',Infinity,NaN])assert.ok(validateLevel({...level,timeLimit},assets).some(e=>e.includes('时限')));
 assert.deepEqual(validateLevel({...level,timeLimit:150},assets),[]);
});
test('inspector changes survive undo/redo, save and reload; invalid input never alters stored time',async()=>{
 const writes=new Map(),files={async mkdir(){},async writeText(path,text){writes.set(path,text);}};
 const store=new EditorStore({config,assets,levels:[read('level/level-14.json'),read('level/level-21.json')],files});
 const input={value:'',valueAsNumber:180,setCustomValidity(s){this.error=s;},reportValidity(){this.reported=true;}};
 bindTimeLimitInput(input,store);const initial=store.currentLevel.timeLimit;input.onchange();assert.equal(store.currentLevel.timeLimit,180);store.undo();assert.equal(store.currentLevel.timeLimit,initial);store.redo();assert.equal(store.currentLevel.timeLimit,180);
 input.valueAsNumber=0;input.onchange();assert.equal(store.currentLevel.timeLimit,180);assert.ok(input.reported);await store.save();assert.equal(JSON.parse(writes.get('level/level-14.json')).timeLimit,180);
 store.selectLevel(21);renderTimeLimitInput(input,store.currentLevel);assert.equal(input.value,store.currentLevel.timeLimit);assert.equal(input.error,'');
 const loaded=new EditorStore({config,assets,levels:[JSON.parse(writes.get('level/level-14.json'))]});assert.equal(loaded.currentLevel.timeLimit,180);
});
test('time budget grows with scale; hints do not increase it; tutorial allowance stays generous',()=>{
 const l=read('level/level-300.json'),hard=estimateTimeLimit(l),small={...l,targets:l.targets.slice(0,4),activeCells:l.activeCells.slice(0,16)};assert.ok(hard>estimateTimeLimit(small));assert.ok(estimateTimeLimit({...l,fences:[...l.fences,...Array(10).fill({role:'hint'})]})<=hard);assert.ok(estimateTimeLimit(read('level/level-14.json'))>=120);
});
