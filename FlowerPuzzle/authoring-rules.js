const key=c=>c.join(',');
const edge=(a,b)=>[key(a),key(b)].sort().join('|');
export function inferRequirements(level){
 if(Array.isArray(level.requirements))return level.requirements.map(r=>({...r}));
 const counts=new Map();for(const t of level.targets||[])counts.set(t.assetId,(counts.get(t.assetId)||0)+1);
 return [...counts].map(([assetId,count])=>({assetId,count}));
}
export function solutionConnected(cells,fences=[]){
 if(!cells?.length)return false;
 const remaining=new Set(cells.map(key)),blocked=new Set(fences.map(f=>edge(f.a,f.b))),queue=[cells[0]];
 remaining.delete(key(cells[0]));
 while(queue.length){const a=queue.pop();for(const b of [[a[0]+1,a[1]],[a[0]-1,a[1]],[a[0],a[1]+1],[a[0],a[1]-1]])if(remaining.has(key(b))&&!blocked.has(edge(a,b))){remaining.delete(key(b));queue.push(b);}}
 return remaining.size===0;
}
export function validateAuthoring(level,assets){
 const errors=[];
 if(level.requirements!==undefined){
  if(!Array.isArray(level.requirements))return ['本关形状需求必须是列表'];
  const shapes=new Set((assets.categories||[]).flatMap(c=>c.items||[]).filter(a=>a.type==='shape').map(a=>a.id)),seen=new Set();
  for(const r of level.requirements){
   if(!r||!shapes.has(r.assetId)||seen.has(r.assetId)||!Number.isInteger(r.count)||r.count<1){errors.push('形状需求包含无效形状、重复形状或无效数量');continue;}
   seen.add(r.assetId);const count=(level.targets||[]).filter(t=>t.assetId===r.assetId).length;
   if(count!==r.count)errors.push(`形状需求 ${r.assetId}：已放置 ${count} / 需要 ${r.count}`);
  }
  if((level.targets||[]).some(t=>!seen.has(t.assetId)))errors.push('画布包含未配置的需求形状');
 }
 // Structural validation runs first; skip malformed coordinates here.
 const cell=c=>Array.isArray(c)&&c.length===2&&c.every(Number.isInteger);
 if((level.fences||[]).every(f=>cell(f.a)&&cell(f.b)))for(const t of level.targets||[]){
  if(t.solutionCells?.length&&t.solutionCells.every(cell)&&!solutionConnected(t.solutionCells,level.fences))errors.push(`目标 ${t.id} 的标准解被栅栏切断`);
 }
 return errors;
}
