// Level coordinates use a top-left origin. Runtime state never mutates level data.
export const cellKey = c => c.join(',');
export const edgeKey = (a,b) => [cellKey(a),cellKey(b)].sort().join('|');
const same = (a,b) => cellKey(a) === cellKey(b);
const adjacent = (a,b) => Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])===1;
const isCell = c => Array.isArray(c)&&c.length===2&&c.every(Number.isInteger);
const validShape = s => Boolean(s.targetId)&&!['pots','fixed-flowers'].includes(s.status);
export const hasMechanics = level => ['bricks','frozen','gates'].some(k=>level[k]?.length);

export function convertSourceMechanics(source) {
 const cell = text => {const [x,y]=text.split(',').map(Number);return [x,source.height-1-y];};
 const edge = text => {const [x,y,d]=text.split(','),[dx,dy]={R:[1,0],L:[-1,0],U:[0,1],D:[0,-1]}[d];return {a:cell(`${x},${y}`),b:cell(`${+x+dx},${+y+dy}`)};};
 return {
  bricks:(source.bricks||[]).map(b=>({cell:cell(b.cell),count:b.count>0?b.count:3})),
  frozen:(source.frozen||[]).map(z=>({cell:cell(z.cell),seconds:z.seconds>0?z.seconds:5,charges:z.charges>0?z.charges:0})),
  gates:(source.gates||[]).map(g=>({id:g.id,a:cell(g.a),b:cell(g.b),circuit:g.circuit||'network',edges:(g.edges||[]).map(edge)}))
 };
}

export function validateMechanics(level) {
 const errors=[],active=new Set((level.activeCells||[]).filter(isCell).map(cellKey));
 const occupied=new Set([...(level.given?.fixedFlowers||[]),...(level.given?.presetPots||[])].filter(p=>isCell(p.cell)).map(p=>cellKey(p.cell)));
 const valid = c => isCell(c)&&active.has(cellKey(c));
 const used=new Set();
 for(const [kind,label] of [['bricks','砖块'],['frozen','冰冻']]){
  if(level[kind]!==undefined&&!Array.isArray(level[kind])){errors.push(`${label}配置必须是数组`);continue;}
  for(const item of level[kind]||[]){
   if(!item||!valid(item.cell)){errors.push(`${label}必须放在有效格内`);continue;}
   const key=cellKey(item.cell);if(used.has(key)||occupied.has(key))errors.push('砖块、冰冻与预置内容不能重叠');used.add(key);
   if(kind==='bricks'&&(!Number.isInteger(item.count)||item.count<1))errors.push('砖块计数必须是正整数');
   if(kind==='frozen'&&(!Number.isFinite(item.seconds)||item.seconds<=0||!Number.isInteger(item.charges)||item.charges<0))errors.push('冰冻秒数必须大于 0，次数必须为非负整数（0 为不限）');
  }
 }
 if(level.gates!==undefined&&!Array.isArray(level.gates))return [...errors,'机关门配置必须是数组'];
 const ids=new Set(),edges=new Set(),walls=new Set((level.fences||[]).filter(f=>isCell(f.a)&&isCell(f.b)).map(f=>edgeKey(f.a,f.b)));
 for(const gate of level.gates||[]){
  if(!gate){errors.push('机关门配置无效');continue;}
  if(!Number.isInteger(gate.id)||gate.id<1||ids.has(gate.id))errors.push('机关门 ID 必须是唯一正整数');ids.add(gate.id);
  if(!valid(gate.a)||!valid(gate.b))errors.push('机关门端子必须放在有效格内');
  if(!['network','linked','single','chain','paired'].includes(gate.circuit))errors.push('机关门连接模式无效');
  if(!Array.isArray(gate.edges)||!gate.edges.length){errors.push('机关门至少需要一段门边');continue;}
  for(const e of gate.edges){
   if(!e||!valid(e.a)||!valid(e.b)||!adjacent(e.a,e.b)){errors.push('机关门边必须连接相邻有效格');continue;}
   const key=edgeKey(e.a,e.b);if(edges.has(key)||walls.has(key))errors.push('机关门边不能重复或与静态围栏重叠');edges.add(key);
  }
 }
 return [...new Set(errors)];
}

export function retainMechanics(level, keep) {
 const result={};
 for(const k of ['bricks','frozen','overlapCells'])if(level[k])result[k]=level[k].filter(item=>keep(item.cell));
 if(level.gates)result.gates=level.gates.filter(g=>keep(g.a)&&keep(g.b)).map(g=>({...g,edges:g.edges.filter(e=>keep(e.a)&&keep(e.b))})).filter(g=>g.edges.length);
 return result;
}
export function createObstacleState(level) {
 return {
  bricks:(level.bricks||[]).map(b=>({...structuredClone(b),initial:b.count,remaining:b.count,destroyed:false,credit:new Set()})),
  frozen:(level.frozen||[]).map(z=>({...structuredClone(z),remainingCharges:z.charges,melted:false})),
  gates:(level.gates||[]).map(g=>({...structuredClone(g),open:false,link:null}))
 };
}
export function tickObstacles(state,now=Date.now()) {
 for(const s of state.shapes||[])if(s.frozenUntil&&s.frozenUntil<=now)delete s.frozenUntil;
}
export const shapeIsLocked = (shape,now=Date.now()) => Boolean(shape?.frozenUntil>now);
export const blockedByBrick = (state,cell) => Boolean(state.obstacles?.bricks.some(b=>!b.destroyed&&same(b.cell,cell)));
export function closedGateEdges(state) {return (state.obstacles?.gates||[]).filter(g=>!g.open).flatMap(g=>g.edges);}
export function obstaclePathAllowed(state,from,to) {
 if(blockedByBrick(state,to))return false;
 return !from||!closedGateEdges(state).some(e=>edgeKey(e.a,e.b)===edgeKey(from,to));
}
export function obstacleCellsAllowed(state,cells) {
 const keys=new Set(cells.map(cellKey));
 return !cells.some(c=>blockedByBrick(state,c))&&!closedGateEdges(state).some(e=>keys.has(cellKey(e.a))&&keys.has(cellKey(e.b)));
}
export function obstacleBlockChanged(state,shape,added,now=Date.now()) {
 const obstacles=state.obstacles;if(!obstacles)return;
 for(const brick of obstacles.bricks.filter(b=>!b.destroyed)){
  if(validShape(shape)&&!brick.credit.has(shape.id)){
   brick.credit.add(shape.id);brick.remaining=Math.max(0,brick.remaining-1);
   if(!brick.remaining){brick.destroyed=true;brick.credit.clear();}
  } else if(!validShape(shape)&&brick.credit.delete(shape.id))brick.remaining=Math.min(brick.initial,brick.remaining+1);
 }
 if(!shapeIsLocked(shape,now)&&added?.length){
  const hits=obstacles.frozen.filter(z=>!z.melted&&added.some(c=>same(c,z.cell)));
  if(hits.length){shape.frozenUntil=now+Math.max(...hits.map(z=>z.seconds))*1000;for(const z of hits)if(z.remainingCharges>0&&!--z.remainingCharges)z.melted=true;}
 }
}
export function obstacleBlockRemoved(state,shape) {
 for(const b of state.obstacles?.bricks||[])if(!b.destroyed&&b.credit.delete(shape.id))b.remaining=Math.min(b.initial,b.remaining+1);
 delete shape.frozenUntil;
}
function solveCircuits(state) {
 const gates=state.obstacles.gates,result=new Map(),consumed=new Set();
 const owners=new Map();for(const shape of state.shapes.filter(validShape))for(const c of shape.cells)owners.set(cellKey(c),shape.id);
 const barriers=new Set([...(state.level.fences||[]),...closedGateEdges(state)].map(e=>edgeKey(e.a,e.b)));
 const connected=(a,b,single,viewer)=>{
  if(!owners.has(cellKey(a))||!owners.has(cellKey(b)))return false;
  if(single)return owners.get(cellKey(a))===owners.get(cellKey(b));
  const ownEdges=new Set(viewer.edges.map(e=>edgeKey(e.a,e.b))),visited=new Set([cellKey(a)]),queue=[a];
  while(queue.length){const c=queue.shift();if(same(c,b))return true;for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[c[0]+d[0],c[1]+d[1]],k=cellKey(n),e=edgeKey(c,n);if(owners.has(k)&&!visited.has(k)&&!barriers.has(e)&&!ownEdges.has(e)){visited.add(k);queue.push(n);}}}return false;
 };
 const free=g=>['linked','network'].includes(g.circuit||'network');
 const linked=(g,a,b)=>connected(a,b,['single','linked'].includes(g.circuit),g);
 const take=(g,a,b)=>{if(same(a,b)||consumed.has(cellKey(a))||consumed.has(cellKey(b))||!linked(g,a,b))return false;consumed.add(cellKey(a));consumed.add(cellKey(b));result.set(g,[a,b]);return true;};
 const contacts=[...new Map(gates.flatMap(g=>[g.a,g.b]).map(c=>[cellKey(c),c])).values()];
 for(const g of gates){if(same(g.a,g.b)&&g.circuit!=='single'){if(owners.has(cellKey(g.a)))result.set(g,[g.a,g.b]);}else if(!free(g)&&linked(g,g.a,g.b))result.set(g,[g.a,g.b]);}
 for(const g of gates.filter(g=>free(g)&&g.open&&g.link&&!same(g.a,g.b)))take(g,...g.link);
 for(const g of gates.filter(g=>free(g)&&!result.has(g)&&!same(g.a,g.b)))take(g,g.a,g.b);
 for(const wasOpen of [true,false])for(const g of gates.filter(g=>free(g)&&!result.has(g)&&g.open===wasOpen&&!same(g.a,g.b))){
  for(const a of [g.a,g.b]){if(consumed.has(cellKey(a)))continue;for(const b of contacts)if(take(g,a,b))break;if(result.has(g))break;}
 }
 return result;
}
export function resolveObstacles(state) {
 if(!state.obstacles)return;
 for(let i=0;i<16;i++){
  let changed=false;const links=solveCircuits(state);
  for(const g of state.obstacles.gates){const open=links.has(g);if(g.open!==open)changed=true;g.open=open;g.link=links.get(g)||null;}
  const barriers=closedGateEdges(state);
  for(const shape of [...state.shapes]){
   if(shape.status==='fixed-flowers')continue;
   const cells=new Set(shape.cells.map(cellKey));
   if(barriers.some(e=>cells.has(cellKey(e.a))&&cells.has(cellKey(e.b)))){
    obstacleBlockRemoved(state,shape);state.shapes=state.shapes.filter(s=>s!==shape);changed=true;
    if(shape.givenCells?.length)state.shapes.push({...shape,cells:shape.givenCells.map(c=>[...c]),targetId:null,status:'pots',color:'terracotta'});
   }
  }
  if(!changed)break;
 }
}

// Renderer consumes either initial obstacle state (editor) or live state (play).
export function drawMechanics(ctx,level,layout,obstacles,shapes=[],now=Date.now()) {
 const size=layout.cellSize,center=c=>({x:layout.x+(c[0]-(layout.originX||0)+.5)*size,y:layout.y+(c[1]-(layout.originY||0)+.5)*size});
 const label=(c,text,color,bg)=>{const p=center(c);ctx.fillStyle=bg;ctx.fillRect(p.x-size*.38,p.y-size*.38,size*.76,size*.76);ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,size*.035);ctx.strokeRect(p.x-size*.38,p.y-size*.38,size*.76,size*.76);ctx.fillStyle=color;ctx.font=`bold ${Math.max(7,size*.3)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,p.x,p.y);};
 ctx.save();
 for(const z of obstacles?.frozen||[])if(!z.melted)label(z.cell,`❄${z.seconds}`, '#277a9f','rgba(169,229,250,.85)');
 for(const b of obstacles?.bricks||[])if(!b.destroyed)label(b.cell,String(b.remaining),'#fff5dd','#a85a39');
 for(const s of shapes)if(shapeIsLocked(s,now)){
  for(const c of s.cells){const p=center(c);ctx.fillStyle='rgba(80,185,240,.4)';ctx.fillRect(p.x-size*.45,p.y-size*.45,size*.9,size*.9);}
  label(s.cells[0],`${Math.ceil((s.frozenUntil-now)/1000)}s`,'#145977','rgba(211,244,255,.95)');
 }
 for(const g of obstacles?.gates||[]){
  const color=g.open?'#2a9564':'#b45cbe';ctx.strokeStyle=color;ctx.lineWidth=Math.max(3,size*.13);ctx.setLineDash(g.open?[size*.1,size*.12]:[]);
  for(const e of g.edges){const a=center(e.a),b=center(e.b),x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.beginPath();if(e.a[0]!==e.b[0]){ctx.moveTo(x,y-size*.45);ctx.lineTo(x,y+size*.45);}else{ctx.moveTo(x-size*.45,y);ctx.lineTo(x+size*.45,y);}ctx.stroke();}
  ctx.setLineDash([]);
  for(const [c,suffix] of [[g.a,'A'],[g.b,'B']]){const p=center(c);ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x-size*.24,p.y-size*.24,size*.21,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(7,size*.22)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`${g.id}${suffix}`,p.x-size*.24,p.y-size*.24);}
 }
 ctx.restore();
}
