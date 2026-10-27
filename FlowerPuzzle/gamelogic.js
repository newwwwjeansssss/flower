import { validateMechanics, hasMechanics, obstacleCellsAllowed, shapeIsLocked } from './shape-fill-mechanics.js?v=20261022-mechanics-audit';
export * from './shape-fill-mechanics.js?v=20261022-mechanics-audit';
import { DEFAULT_TIME_LIMIT, isValidTimeLimit } from './level-timing.js?v=20261022-mechanics-audit';
import { validateAuthoring } from './authoring-rules.js?v=20261022-mechanics-audit';
export const listAssets = (data={}) => (data.categories||[]).flatMap(c=>c.items||[]);
const key=([x,y])=>`${x},${y}`;
const boundaryEdges=cells=>{const occupied=new Set((cells||[]).map(key)),edges=[];for(const [x,y] of cells||[]){if(!occupied.has(key([x,y-1])))edges.push([[x,y],[x+1,y]]);if(!occupied.has(key([x+1,y])))edges.push([[x+1,y],[x+1,y+1]]);if(!occupied.has(key([x,y+1])))edges.push([[x+1,y+1],[x,y+1]]);if(!occupied.has(key([x-1,y])))edges.push([[x,y+1],[x,y]]);}return edges;};
const drawRegionBorder=(ctx,cells,l)=>{const edges=boundaryEdges(cells);if(!edges.length)return;ctx.strokeStyle='#f5c451';ctx.lineWidth=Math.max(2,l.cell*.055);ctx.beginPath();for(const [from,to] of edges){ctx.moveTo(l.left+from[0]*l.cell,l.top+from[1]*l.cell);ctx.lineTo(l.left+to[0]*l.cell,l.top+to[1]*l.cell);}ctx.stroke();};
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
const cell=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isInteger);
const normalized=cells=>{const minX=Math.min(...cells.map(c=>c[0])),minY=Math.min(...cells.map(c=>c[1]));return cells.map(([x,y])=>[x-minX,y-minY]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);};
const canonical=cells=>{if(!cells?.length)return'';const variants=[];for(const mirror of [false,true]){let p=cells.map(([x,y])=>[mirror?-x:x,y]);for(let i=0;i<4;i++){variants.push(normalized(p).map(key).join(';'));p=p.map(([x,y])=>[-y,x]);}}return variants.sort()[0];};
const connected=cells=>{if(!cells?.length)return false;const all=new Set(cells.map(key)),seen=new Set([key(cells[0])]),q=[cells[0]];while(q.length){const [x,y]=q.shift();[[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(n=>{const k=key(n);if(all.has(k)&&!seen.has(k)){seen.add(k);q.push(n);}});}return seen.size===all.size;};
const flowerColors={coral:'#ef806f',sun:'#edb74b',lilac:'#a98bd4',sky:'#75acd0',rose:'#dd758e',mint:'#6fbf9a'};
const resolveColor=value=>flowerColors[value]||value||'#dfead0';
export function createEmptyLevel({id,config}){const width=Number(config.defaults?.boardWidth||6),height=Number(config.defaults?.boardHeight||8),activeCells=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)activeCells.push([x,y]);return{id,name:`新关卡 ${id}`,type:'flower-puzzle',timeLimit:DEFAULT_TIME_LIMIT,width,height,activeCells,given:{fixedFlowers:[],presetPots:[]},fences:[],targets:[]};}
export function validateLevel(level,assets={}){if(level.overlapCells!==undefined&&!Array.isArray(level.overlapCells))return ['重叠格必须是数组'];const errors=[],ids=new Set(listAssets(assets).map(a=>a.id));if(level.timeLimit!==undefined&&!isValidTimeLimit(level.timeLimit))errors.push('关卡时限必须是正整数（秒）');if(!Number.isInteger(level.id)||level.id<1)errors.push('id 必须是正整数');if(!Number.isInteger(level.width)||level.width<1)errors.push('width 必须是正整数');if(!Number.isInteger(level.height)||level.height<1)errors.push('height 必须是正整数');const active=level.activeCells||[],activeKeys=new Set();if(!Array.isArray(level.activeCells)||!active.length)errors.push('至少需要一个活跃格');for(const c of active){if(!cell(c)){errors.push('活跃格坐标无效');continue;}const k=key(c);if(activeKeys.has(k))errors.push('活跃格不能重复');activeKeys.add(k);if(c[0]<0||c[1]<0||c[0]>=level.width||c[1]>=level.height)errors.push('活跃格超出棋盘');}const fixed=level.given?.fixedFlowers||[],preset=level.given?.presetPots||[],givenKeys=new Set(),fixedKeys=new Set();for(const item of [...fixed,...preset]){if(!cell(item.cell)){errors.push('预置内容坐标无效');continue;}const k=key(item.cell);if(givenKeys.has(k))errors.push('预置内容不能占用同一格');givenKeys.add(k);if(!activeKeys.has(k))errors.push('预置内容只能放在活跃格');}for(const item of fixed)if(cell(item.cell))fixedKeys.add(key(item.cell));const covered=new Set(),targetIds=new Set();if(!Array.isArray(level.targets)||!level.targets.length)errors.push('至少需要一个目标花块');for(const t of level.targets||[]){if(!t.id||targetIds.has(t.id))errors.push('目标 ID 缺失或重复');targetIds.add(t.id);if(!ids.has(t.assetId))errors.push(`未知形状资源：${t.assetId}`);if(!Array.isArray(t.shape)||!t.shape.length||!t.shape.every(cell)||!connected(t.shape))errors.push(`目标 ${t.id||''} 的 shape 必须连通`);if(!Array.isArray(t.solutionCells)||!t.solutionCells.length||!t.solutionCells.every(cell)||!connected(t.solutionCells))errors.push(`目标 ${t.id||''} 的标准解必须连通`);else{if(canonical(t.shape)!==canonical(t.solutionCells))errors.push(`目标 ${t.id} 的形状与标准解不匹配`);for(const c of t.solutionCells){const k=key(c);if(!activeKeys.has(k))errors.push(`目标 ${t.id} 使用了非活跃格`);if(fixedKeys.has(k))errors.push('固定花朵不能包含在目标标准解中');if(covered.has(k)&&!level.overlapCells?.some(o=>key(o.cell)===k))errors.push('目标标准解不能重叠');covered.add(k);}}}const required=[...activeKeys].filter(k=>!fixedKeys.has(k));if(required.length!==covered.size||required.some(k=>!covered.has(k)))errors.push('目标标准解必须精确覆盖固定花朵之外的活跃格');if(preset.some(item=>cell(item.cell)&&!covered.has(key(item.cell))))errors.push('预置花盆必须包含在目标标准解中');const presetKeys=new Set(preset.filter(item=>cell(item.cell)).map(item=>key(item.cell)));if(presetKeys.size&&!(level.targets||[]).some(t=>{const solution=new Set((t.solutionCells||[]).map(key));return[...presetKeys].every(k=>solution.has(k));}))errors.push('预置花盆必须位于同一个目标花块中');const fenceKeys=new Set();for(const f of level.fences||[]){if(!cell(f.a)||!cell(f.b)||Math.abs(f.a[0]-f.b[0])+Math.abs(f.a[1]-f.b[1])!==1)errors.push('围栏端点必须是相邻格');if(!activeKeys.has(key(f.a))||!activeKeys.has(key(f.b)))errors.push('围栏端点必须为活跃格');if(!['hint','challenge'].includes(f.role))errors.push('围栏类型必须为 hint 或 challenge');const k=edgeKey(f.a,f.b);if(fenceKeys.has(k))errors.push('围栏不能重复');fenceKeys.add(k);}return [...new Set([...errors,...validateOverlap(level),...validateAuthoring(level,assets),...validateMechanics(level)])];}
export function getAssetReferences(level,id){return[...(level.targets||[]),...(Array.isArray(level.requirements)?level.requirements:[])].some(t=>t.assetId===id);}
export function getBoardLayout(level,canvas){const size=Math.min(canvas.width*.86/level.width,canvas.height*.58/level.height),width=size*level.width,height=size*level.height;return{cell:size,left:(canvas.width-width)/2,top:canvas.height*.25,width,height};}
export function canvasPointToCell(x,y,l,level){if(x<l.left||y<l.top||x>=l.left+l.width||y>=l.top+l.height)return-1;return Math.floor((y-l.top)/l.cell)*level.width+Math.floor((x-l.left)/l.cell);}
export function drawLevel(ctx,level,{mode='preview'}={}){const {canvas}=ctx;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff8ee';ctx.fillRect(0,0,canvas.width,canvas.height);const l=getBoardLayout(level,canvas),active=new Set((level.activeCells||[]).map(key)),owners=new Map();(level.targets||[]).forEach(t=>(t.solutionCells||[]).forEach(c=>owners.set(key(c),resolveColor(t.color))));ctx.textAlign='center';ctx.fillStyle='#443b37';ctx.font=`700 ${Math.max(14,canvas.width*.055)}px sans-serif`;ctx.fillText(level.name||'花田拼图',canvas.width/2,canvas.height*.08);ctx.font=`${Math.max(10,canvas.width*.03)}px sans-serif`;ctx.fillStyle='#7b6c63';ctx.fillText(mode==='edit'?'选择工具编辑格子与物品':'拖过相邻格子组成目标花块',canvas.width/2,canvas.height*.125);(level.targets||[]).forEach((t,i)=>{ctx.fillStyle=resolveColor(t.color);ctx.beginPath();ctx.arc(canvas.width/2+(i-(level.targets.length-1)/2)*34,canvas.height*.18,11,0,Math.PI*2);ctx.fill();});for(let y=0;y<level.height;y++)for(let x=0;x<level.width;x++){const px=l.left+x*l.cell,py=l.top+y*l.cell,k=key([x,y]);ctx.fillStyle=active.has(k)?(mode==='preview'&&owners.get(k)||'#dfead0'):'#f4eadb';ctx.fillRect(px+2,py+2,l.cell-4,l.cell-4);if(active.has(k)){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(px+3,py+3,l.cell-6,l.cell-6);}}const drawGiven=(item,flower)=>{const cx=l.left+(item.cell[0]+.5)*l.cell,cy=l.top+(item.cell[1]+.58)*l.cell,r=l.cell*.2;ctx.fillStyle='#b9663f';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7f402d';ctx.beginPath();ctx.arc(cx,cy-r*.7,r*1.12,0,Math.PI*2);ctx.fill();if(flower){ctx.fillStyle=resolveColor(item.color);for(let i=0;i<5;i++){const angle=i*Math.PI*2/5-Math.PI/2;ctx.beginPath();ctx.arc(cx+Math.cos(angle)*r*.8,cy-r*1.9+Math.sin(angle)*r*.8,r*.55,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#8c6333';ctx.beginPath();ctx.arc(cx,cy-r*1.9,r*.42,0,Math.PI*2);ctx.fill();}};(level.given?.presetPots||[]).forEach(item=>drawGiven(item,false));(level.given?.fixedFlowers||[]).forEach(item=>drawGiven(item,true));drawRegionBorder(ctx,(level.given?.presetPots||[]).map(item=>item.cell),l);drawRegionBorder(ctx,(level.given?.fixedFlowers||[]).map(item=>item.cell),l);for(const f of level.fences||[]){const [a,b]=[f.a,f.b],mx=l.left+(a[0]+b[0]+1)*l.cell/2,my=l.top+(a[1]+b[1]+1)*l.cell/2;ctx.strokeStyle=f.role==='hint'?'#6d985c':'#ce5f54';ctx.lineWidth=Math.max(4,l.cell*.1);ctx.beginPath();if(a[0]!==b[0]){ctx.moveTo(mx,my-l.cell*.45);ctx.lineTo(mx,my+l.cell*.45);}else{ctx.moveTo(mx-l.cell*.45,my);ctx.lineTo(mx+l.cell*.45,my);}ctx.stroke();}}
export function calculateDifficulty(level){const cells=level.activeCells?.length||0,targets=level.targets?.length||0,fences=level.fences?.length||0;let similarity=0;for(let i=0;i<targets;i++)for(let j=i+1;j<targets;j++)if(canonical(level.targets[i].shape)===canonical(level.targets[j].shape))similarity++;const score=Math.max(1,Math.round(cells*1.5+targets*6+similarity*4+fences*3));return{score,level:score<25?'简单':score<45?'普通':score<70?'困难':'专家',factors:{活跃格:cells,目标数:targets,相似形状:similarity,围栏:fences}};}
export function getEndActions(result,hasNext){return{retry:true,next:result==='won'&&!!hasNext};}
export const canonicalShape = canonical;
export function canExtendPath(path,nextCell,{occupiedCells=[]}={},level={}){if(!cell(nextCell))return{ok:false,reason:'invalid'};const nextKey=key(nextCell),active=new Set((level.activeCells||[]).map(key)),occupied=new Set(occupiedCells.map(key));if(!active.has(nextKey))return{ok:false,reason:'inactive'};if(occupiedCells.filter(c=>key(c)===nextKey).length>=overlapCapacity(level,nextCell))return{ok:false,reason:'occupied'};const previous=(path||[]).at(-1);if(previous&&Math.abs(previous[0]-nextCell[0])+Math.abs(previous[1]-nextCell[1])!==1)return{ok:false,reason:'disconnected'};if(previous&&(level.fences||[]).some(fence=>edgeKey(fence.a,fence.b)===edgeKey(previous,nextCell)))return{ok:false,reason:'fence'};return{ok:true};}
export function matchTarget(cells,targets=[],completedTargetIds=[]){const completed=new Set(completedTargetIds);const shape=canonical(cells);return targets.find(target=>!completed.has(target.id)&&canonical(target.shape)===shape)||null;}
export function getHint(level,state={}) {
  if(state.status==='blooming'||state.status==='complete')return null;
  if(level.overlapCells?.length) {
    const shapes=state.shapes||[];
    for(const target of level.targets||[]){
      if(shapes.some(s=>canonical(s.cells)===canonical(target.solutionCells)&&s.cells.length===target.solutionCells.length&&s.cells.every(c=>target.solutionCells.some(p=>key(c)===key(p)))))continue;
      const cells=target.solutionCells;
      if(cells.every(c=>shapes.filter(s=>s.cells.some(p=>key(p)===key(c))).length<overlapCapacity(level,c)))return {type:'draw',cells};
    }
    return shapes.length?{type:'remove',shapeId:shapes.at(-1).id}:null;
  }
  if(hasMechanics(level)) {
    const shapes=(state.shapes||[]).filter(s=>s.status!=='fixed-flowers');
    const occupied=new Set(shapes.flatMap(s=>s.cells).map(key));
    for(const target of level.targets||[]) {
      const cells=target.solutionCells||[];
      if(cells.length&&cells.every(c=>!occupied.has(key(c)))&&obstacleCellsAllowed(state,cells))return {type:'draw',targetId:target.id,cells:cells.map(c=>[...c])};
    }
    const invalid=shapes.find(s=>!s.targetId&&!s.givenCells?.length&&!shapeIsLocked(s,state.clock?.() ?? Date.now()));
    return invalid?{type:'remove',shapeId:invalid.id}:null;
  }
  const shapes=(state.shapes||[]).filter(shape=>shape.status!=='fixed-flowers');
  const invalid=shapes.find(shape=>!shape.targetId||shape.status==='pots');
  if(invalid&&!invalid.givenCells?.length)return {type:'remove',shapeId:invalid.id};
  const same=(a,b)=>a.length===b.length&&a.every(c=>b.some(p=>key(c)===key(p)));
  for(const target of level.targets||[]) {
    const cells=target.solutionCells||[];
    if(shapes.some(shape=>shape.targetId&&shape.status!=='pots'&&same(shape.cells,cells)))continue;
    const blocking=shapes.find(shape=>shape.cells.some(c=>cells.some(p=>key(c)===key(p)))&&!(shape.givenCells?.length&&shape.status==='pots'&&shape.cells.every(c=>cells.some(p=>key(c)===key(p)))));
    if(blocking)return {type:'remove',shapeId:blocking.id};
    return {type:'draw',targetId:target.id,cells:cells.map(c=>[...c])};
  }
  return invalid?{type:'remove',shapeId:invalid.id}:null;
}

export function overlapCapacity(level,c){return level.overlapCells?.find(o=>key(o.cell)===key(c))?.count||1;}
export function validateOverlap(level){
 const errors=[],seen=new Set(),active=new Set((level.activeCells||[]).map(key));
 if(level.overlapCells!==undefined&&!Array.isArray(level.overlapCells))return ['重叠格必须是数组'];
 for(const o of level.overlapCells||[]){
  if(!o||!cell(o.cell)||!active.has(key(o.cell))||!Number.isInteger(o.count)||o.count<2||o.count>3){errors.push('重叠格坐标或次数无效');continue;}
  const k=key(o.cell);if(seen.has(k))errors.push('重叠格不能重复');seen.add(k);
  if((level.given?.fixedFlowers||[]).some(p=>key(p.cell)===k))errors.push('重叠格不能包含固定花朵');
  const count=(level.targets||[]).filter(t=>(t.solutionCells||[]).some(c=>key(c)===k)).length;
  if(count!==o.count)errors.push('重叠格标准解覆盖次数不匹配');
 }
 return errors;
}
export function drawOverlap(ctx,level,layout,shapes=[]){
 const size=layout.cellSize||layout.cell,x=layout.x??layout.left,y=layout.y??layout.top;
 for(const o of level.overlapCells||[]){
  const n=shapes.filter(s=>s.targetId&&(s.cells||[]).some(c=>key(c)===key(o.cell))).length;
  const cx=x+(o.cell[0]+.5)*size,cy=y+(o.cell[1]+.5)*size;
  ctx.save();ctx.strokeStyle=n===o.count?'#d39b22':'#8959ac';ctx.lineWidth=Math.max(2,size*.04);
  ctx.strokeRect(cx-size*.43,cy-size*.43,size*.86,size*.86);
  ctx.fillStyle=n===o.count?'#fff1bc':'#f5e9ff';ctx.beginPath();ctx.arc(cx,cy-size*.26,size*.20,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#56336d';ctx.font=`bold ${Math.max(10,size*.20)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${n}/${o.count}`,cx,cy-size*.26);ctx.restore();
 }
}
