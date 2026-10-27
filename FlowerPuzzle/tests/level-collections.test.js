import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadLevelCollections, levelsInCollection } from '../static/js/level-collections.js';
import { EditorStore } from '../static/js/editor-store.js';
import { validateLevel } from '../gamelogic.js';
const root=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,root),'utf8'));
const assets=await read('asset.json');
const files={readText:async p=>({content:await fs.readFile(new URL(p,root),'utf8')}),list:async p=>({entries:(await fs.readdir(new URL(p+'/',root),{withFileTypes:true})).map(e=>({name:e.name,type:e.isFile()?'file':'directory'}))})};
const levels=await loadLevelCollections(files);
test('all 140 imported levels validate and preserve source board, time and solution coverage',async()=>{
 const imported=levelsInCollection(levels,'shape-fill');assert.equal(imported.length,140);
 assert.equal(new Set(levels.map(l=>l.id)).size,levels.length);
 for(const level of imported){
  const source=await read(`shape-fill-source/${level.sourceId}.json`);
  assert.deepEqual(validateLevel(level,assets),[],level.name);
  assert.equal(level.timeLimit,source.timeLimit);
  const sourceCells=source.rows.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='#'?[[x,y]]:[]));
  const minX=Math.min(...sourceCells.map(c=>c[0])),minY=Math.min(...sourceCells.map(c=>c[1]));
  assert.deepEqual(level.activeCells,sourceCells.map(([x,y])=>[x-minX,y-minY]));
  assert.deepEqual(level.targets.map(t=>t.solutionCells),source.solution.map(p=>p.cells.split(';').filter(Boolean).map(c=>{const [x,y]=c.split(',').map(Number);return[x-minX,source.height-1-y-minY];})));
  for(const key of ['gates','bricks','frozen'])assert.ok(Array.isArray(level[key]));
 }
});
test('collection switches preserve edits, undo and new-level save destinations',()=>{
 const store=new EditorStore({config:{},assets,levels});
 store.selectCollection('shape-fill');store.updateLevel({name:'edited'});
 store.selectCollection('flower');store.selectCollection('shape-fill');assert.equal(store.currentLevel.name,'edited');
 store.addLevel();assert.match(store.currentLevel.filePath,/^shape-fill\/level-141.json$/);
 store.undo();assert.equal(store.currentLevel.name,'edited');
 store.selectCollection('flower');store.addLevel();assert.match(store.currentLevel.filePath,/^level\/level-/);
});
test('save writes separate directories and catalog; undoing deletion does not delete a restored file',async()=>{
 const writes=new Map(),removed=[];
 const store=new EditorStore({config:{},assets,levels:levels.filter(l=>l.id===1||l.id===100001||l.id===100002),files:{mkdir:async()=>{},writeText:async(p,c)=>writes.set(p,c),remove:async p=>removed.push(p)}});
 store.updateLevel({name:'edited flower'});
 store.selectCollection('shape-fill');store.updateLevel({name:'edited Shape Fill'});
 store.selectCollection('shape-fill');store.deleteLevel(100002);store.undo();await store.save();
 assert.deepEqual(removed,[]);
 assert.ok(writes.has('level/level-1.json'));assert.ok(writes.has('shape-fill/level-1.json'));
 assert.deepEqual(JSON.parse(writes.get('level-catalog.json')), {flower:['level-1.json'],'shape-fill':['level-1.json','level-2.json'],'flower-trial':[]});
});

test('trial edits save only changed levels and stay separate through switch, reload, add and undo',async()=>{
 const writes=new Map(),removed=[];
 const filesForSave={mkdir:async()=>{},writeText:async(p,c)=>writes.set(p,c),remove:async p=>removed.push(p)};
 const store=new EditorStore({config:{},assets,levels,files:filesForSave});
 const original=structuredClone(levelsInCollection(store.levels,'flower'));
 store.selectCollection('flower-trial');assert.equal(store.currentLevel.id,200001);
 store.updateLevel({name:'trial edit'});
 store.selectCollection('flower');store.selectCollection('flower-trial');
 assert.equal(store.currentLevel.name,'trial edit');
 store.addLevel();assert.equal(store.currentLevel.sourceId,43);assert.equal(store.currentLevel.id,200043);
 assert.equal(store.currentLevel.filePath,'flower-trial/level-43.json');store.undo();
 store.deleteLevel(200025);store.undo();
 await store.save();
 assert.deepEqual([...writes.keys()].filter(p=>p.startsWith('level/')||p.startsWith('shape-fill/')),[]);
 assert.deepEqual([...writes.keys()].filter(p=>p.startsWith('flower-trial/')),['flower-trial/level-1.json']);
 assert.deepEqual(removed,[]);
 assert.deepEqual(levelsInCollection(store.levels,'flower'),original);
 assert.equal(JSON.parse(writes.get('level-catalog.json'))['flower-trial'].length,37);
 const reloaded=await loadLevelCollections({...files,readText:async p=>writes.has(p)?{content:writes.get(p)}:files.readText(p)});
 assert.equal(levelsInCollection(reloaded,'flower-trial')[0].name,'trial edit');
 writes.clear();await store.save();assert.equal([...writes.keys()].filter(p=>p.startsWith('flower-trial/')).length,0);
});

test('trial catalog works with the browser fetch loader',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async path=>({ok:true,json:()=>read(path)});
 try { const loaded=await loadLevelCollections();assert.equal(levelsInCollection(loaded,'flower-trial').length,37);assert.equal(new Set(loaded.map(l=>l.id)).size,loaded.length); }
 finally {globalThis.fetch=oldFetch;}
});
