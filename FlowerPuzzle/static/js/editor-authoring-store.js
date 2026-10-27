import {inferRequirements,solutionConnected} from '../../authoring-rules.js?v=20261022-mechanics-audit';
import {canonicalShape} from '../../gamelogic.js?v=20261022-mechanics-audit';
const key=c=>c.join(',');
const unique=cells=>[...new Map(cells.map(c=>[key(c),c])).values()];
const edge=(a,b)=>[key(a),key(b)].sort().join('|');
const fail=message=>({ok:false,message});
const activeCells=(level,cells)=>cells.length&&cells.every(c=>level.activeCells.some(p=>key(p)===key(c)));
export const authoringMethods={
 setShapeRequirement(assetId,count){
  const level=this.currentLevel,asset=this.allAssets().find(a=>a.id===assetId&&a.type==='shape');
  if(!asset||!Number.isInteger(count)||count<0)return fail('请选择形状并填写非负整数数量');
  if(level.targets.filter(t=>t.assetId===assetId).length>count)return fail('请先移除多余的已放置花块，再减少需求数量');
  const requirements=inferRequirements(level).filter(r=>r.assetId!==assetId);if(count)requirements.push({assetId,count});
  this.updateLevel({requirements});return {ok:true};
 },
 addRequiredTargetFromCells(cells){
  const level=this.currentLevel,points=unique(cells),requirements=inferRequirements(level);
  if(!points.length)return fail('请拖动画出需求花块');
  const signature=canonicalShape(points),asset=this.allAssets().find(a=>a.type==='shape'&&canonicalShape(a.cells)===signature);
  const requirement=asset&&requirements.find(r=>r.assetId===asset.id);
  if(!requirement)return fail('这个形状不在本关需求中，请先在右侧配置');
  const occupied=new Set(level.targets.flatMap(t=>t.solutionCells||[]).map(key));
  if(points.some(c=>level.targets.filter(t=>t.solutionCells.some(p=>key(p)===key(c))).length>=(level.overlapCells?.find(o=>key(o.cell)===key(c))?.count||1)))return fail('这里已有花块，请先移除后重新绘制');
  if(level.targets.filter(t=>t.assetId===asset.id).length>=requirement.count)return fail('这个形状已达到本关需求数量');
  if(!solutionConnected(points,level.fences))return fail('花块不连通或被栅栏切断');
  const result=this.addTargetFromCells(points);return result.ok?result:fail('只能在空白有效格上画花块，不能覆盖固定区域');
 },
 removeAuthoredTarget(index){
  const l=this.currentLevel,c=[index%l.width,Math.floor(index/l.width)],target=l.targets.find(t=>t.solutionCells.some(p=>key(p)===key(c)));
  if(!target)return fail('请先选中一个已放置花块');
  const removed=new Set(target.solutionCells.map(key)),requirements=inferRequirements(l);
  this.mutate(()=>{l.requirements=requirements;l.targets=l.targets.filter(t=>t!==target);l.given.presetPots=l.given.presetPots.filter(p=>!removed.has(key(p.cell)));});return {ok:true};
 },
 paintFixedRegion(cells,adding){
  const l=this.currentLevel,points=unique(cells);if(!activeCells(l,points))return fail('固定区域只能画在有效格子上');
  const occupied=new Set(l.targets.flatMap(t=>t.solutionCells).map(key));
  if(adding&&points.some(c=>occupied.has(key(c))))return fail('固定区域不能覆盖需求花块，请先移除该花块');
  const keys=new Set(points.map(key)),old=l.given.fixedFlowers,existing=new Set(old.map(p=>key(p.cell)));
  const next=adding?[...old,...points.filter(c=>!existing.has(key(c))).map(cell=>({cell:[...cell],color:'coral'}))]:old.filter(p=>!keys.has(key(p.cell)));
  if(next.length!==old.length)this.mutate(()=>{l.given.fixedFlowers=next;});return {ok:true};
 },
 paintPresetRegion(cells,adding){
  const l=this.currentLevel,points=unique(cells),keys=new Set(points.map(key));if(!activeCells(l,points))return fail('预置地块只能画在有效格子上');
  const old=l.given.presetPots,next=adding?unique([...old.map(p=>p.cell),...points]).map(cell=>({cell:[...cell]})):old.filter(p=>!keys.has(key(p.cell)));
  if(adding){const owner=l.targets.find(t=>next.every(p=>t.solutionCells.some(c=>key(c)===key(p.cell))));
   if(!owner)return fail('预置地块必须属于同一个已放置的需求花块');
   if(next.length>=owner.solutionCells.length)return fail('预置地块只能占花块的一部分，请至少留一个格子给玩家');
  }
  if(JSON.stringify(next)!==JSON.stringify(old))this.mutate(()=>{l.given.presetPots=next;});return {ok:true};
 },
 paintAuthoredFence(a,b,adding){
  const l=this.currentLevel;if(!activeCells(l,[a,b])||Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])!==1)return fail('栅栏只能放在两个有效格子的公共边');
  const k=edge(a,b),present=l.fences.some(f=>edge(f.a,f.b)===k);
  if(present===adding)return {ok:true};
  const next=adding?[...l.fences,{a,b,role:'challenge'}]:l.fences.filter(f=>edge(f.a,f.b)!==k);
  if(l.targets.some(t=>!solutionConnected(t.solutionCells,next)))return fail('这段栅栏会切断需求花块，请放在花块边界');
  this.mutate(()=>{l.fences=next;});return {ok:true};
 }
};
