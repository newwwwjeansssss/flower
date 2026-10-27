import { normalizeBoard } from '../board-normalization.js';
import { convertSourceMechanics } from '../shape-fill-mechanics.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalShape, validateLevel } from '../gamelogic.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/import-shape-fill.mjs <source-level-directory>');
const assets = JSON.parse(await fs.readFile(path.join(root, 'asset.json'), 'utf8'));
const shapes = assets.categories.find(c => c.id === 'shapes').items;
const normalize = cells => { const x=Math.min(...cells.map(c=>c[0])),y=Math.min(...cells.map(c=>c[1]));return cells.map(c=>[c[0]-x,c[1]-y]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]); };
const variants = cells => { const result=[];for(const mirror of [false,true]){let p=cells.map(([x,y])=>[mirror?-x:x,y]);for(let i=0;i<4;i++){result.push({transform:`${mirror?'M':''}R${i*90}`,cells:normalize(p)});p=p.map(([x,y])=>[-y,x]);}}return result; };
const names=(await fs.readdir(source)).filter(n=>/^\d+\.json$/.test(n)).sort((a,b)=>parseInt(a)-parseInt(b));
const converted=[];
for (const name of names) {
 const raw=JSON.parse(await fs.readFile(path.join(source,name),'utf8'));
 const flip=([x,y])=>[x,raw.height-1-y];
 const activeCells=raw.rows.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='#'?[[x,y]]:[]));
 const active=new Set(activeCells.map(c=>c.join(',')));
 const shapeAssets=raw.targets.map(t=>{
  const cells=t.rows.flatMap((row,y)=>[...row].flatMap((c,x)=>c==='#'?[[x,y]]:[]));
  let asset=shapes.find(a=>canonicalShape(a.cells)===canonicalShape(cells));
  if(!asset){asset={id:`sf-${t.id}`,name:`Shape Fill ${t.id}`,type:'shape',cells:normalize(cells),difficultyWeight:1};shapes.push(asset);}
  return asset;
 });
 const targets=raw.solution.map((piece,i)=>{
  const solutionCells=piece.cells.split(';').filter(Boolean).map(c=>flip(c.split(',').map(Number)));
  const asset=shapeAssets[piece.target];
  const variant=variants(asset.cells).find(v=>JSON.stringify(v.cells)===JSON.stringify(normalize(solutionCells)));
  if(!variant)throw new Error(`${name}: solution shape mismatch`);
  return {id:`target-${i+1}`,assetId:asset.id,shape:asset.cells,solutionCells,origin:[Math.min(...solutionCells.map(c=>c[0])),Math.min(...solutionCells.map(c=>c[1]))],transform:variant.transform,variant:variant.transform};
 });
 const fences=[];const seen=new Set();
 for(const wall of raw.walls||[]){const [x,y,d]=wall.split(','),[dx,dy]={R:[1,0],U:[0,1],L:[-1,0],D:[0,-1]}[d];const a=flip([+x,+y]),b=flip([+x+dx,+y+dy]),key=[a.join(','),b.join(',')].sort().join('|');if(active.has(a.join(','))&&active.has(b.join(','))&&!seen.has(key)){fences.push({a,b,role:'challenge'});seen.add(key);}}
 const requirements=[...new Set(targets.map(t=>t.assetId))].map(assetId=>({assetId,count:targets.filter(t=>t.assetId===assetId).length}));
 const level=normalizeBoard({id:100000+raw.id,sourceId:raw.id,collection:'shape-fill',name:`Shape Fill ${raw.id}`,type:'flower-puzzle',timeLimit:raw.timeLimit,width:raw.width,height:raw.height,activeCells,targets,requirements,given:{fixedFlowers:[],presetPots:[]},fences,...convertSourceMechanics(raw)});
 const errors=validateLevel(level,assets);if(errors.length)throw new Error(`${name}: ${errors.join('; ')}`);
 converted.push({name:`level-${raw.id}.json`,level,raw});
}
await fs.mkdir(path.join(root,'shape-fill'),{recursive:true});
await fs.mkdir(path.join(root,'shape-fill-source'),{recursive:true});
for(const {name,level,raw} of converted){await fs.writeFile(path.join(root,'shape-fill',name),JSON.stringify(level,null,2)+'\n');await fs.writeFile(path.join(root,'shape-fill-source',`${raw.id}.json`),JSON.stringify(raw,null,2)+'\n');}
await fs.writeFile(path.join(root,'asset.json'),JSON.stringify(assets,null,2)+'\n');
const flower=(await fs.readdir(path.join(root,'level'))).filter(n=>/^level-.*\.json$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
const catalog=JSON.parse(await fs.readFile(path.join(root,'level-catalog.json'),'utf8'));
await fs.writeFile(path.join(root,'level-catalog.json'),JSON.stringify({...catalog,flower, 'shape-fill':converted.map(c=>c.name)},null,2)+'\n');
console.log(`Imported and validated ${converted.length} Shape Fill levels`);
