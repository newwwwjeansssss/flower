import {inferRequirements} from '../../authoring-rules.js?v=20261022-mechanics-audit';
const key=c=>c.join(',');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hints={target:'在空格上拖动画出需求花块；点击已有花块可选中后移除。',fixed:'拖动涂画任意固定区域，不占需求数量，不覆盖需求花块。','fixed-erase':'拖动擦除固定区域，格子会恢复为空白。',preset:'在一个需求花块内部涂画预置地块，至少留一格给玩家。','preset-erase':'拖动擦除预置地块，保留原有需求花块。',fence:'点击公共边添加或删除栅栏；拖动连续添加或删除。'};
export function bindAuthoringUI(store,{getMode,getLayout,onDraft,draw,message}){
 const panel=document.querySelector('#authoring-panel'),canvas=document.querySelector('#game-canvas');
 let tool='target',gesture=null,lastId=null,renderKey='';
 const report=result=>{if(result&&!result.ok)message(result.message||'当前操作无法完成');};
 const point=event=>{const rect=canvas.getBoundingClientRect(),l=getLayout();return {x:((event.clientX-rect.left)*canvas.width/rect.width-l.x)/l.cellSize+(l.originX||0),y:((event.clientY-rect.top)*canvas.height/rect.height-l.y)/l.cellSize+(l.originY||0)};};
 const cellAt=e=>{const p=point(e),l=store.currentLevel,c=[Math.floor(p.x),Math.floor(p.y)];return c[0]>=0&&c[1]>=0&&c[0]<l.width&&c[1]<l.height?c:null;};
 const edgeAt=e=>{const p=point(e),dx=Math.abs(p.x-Math.round(p.x)),dy=Math.abs(p.y-Math.round(p.y));if(Math.min(dx,dy)>.24)return null;return dx<dy?[[Math.round(p.x)-1,Math.floor(p.y)],[Math.round(p.x),Math.floor(p.y)]]:[[Math.floor(p.x),Math.round(p.y)-1],[Math.floor(p.x),Math.round(p.y)]];};
 function reset(){gesture=null;onDraft([]);}
 function render(){
  if(lastId!==store.currentLevel.id){reset();lastId=store.currentLevel.id;}
  const editing=getMode()==='edit',l=store.currentLevel,requirements=inferRequirements(l);
  const nextKey=JSON.stringify([l.id,requirements,l.targets.map(t=>[t.id,t.assetId]),l.given,l.fences.length,editing,tool]);
  if(nextKey===renderKey)return;renderKey=nextKey;
  const shapes=store.allAssets().filter(a=>a.type==='shape');
  panel.innerHTML=`<div class="section-label"><span>本关需求形状</span><span>${l.targets.length} / ${requirements.reduce((s,r)=>s+r.count,0)}</span></div>
   <p class="authoring-help">试玩只显示形状类型，每种至少用一次、数量不限。下方数量仅用于编辑标准解，固定区域不计入。</p>
   <div class="requirement-list">${requirements.map(r=>{const a=shapes.find(a=>a.id===r.assetId),used=l.targets.filter(t=>t.assetId===r.assetId).length;return `<div class="requirement-row"><canvas width="40" height="40" data-shape-preview="${escape(r.assetId)}"></canvas><span><strong>${escape(a?.name||r.assetId)}</strong><small class="${used===r.count?'fulfilled':'unfilled'}">已放 ${used} / 需求 ${r.count}</small></span><input type="number" min="${used||1}" max="196" value="${r.count}" data-demand="${escape(r.assetId)}" aria-label="${escape(a?.name||r.assetId)}需求数量" ${editing?'':'disabled'}><button type="button" data-delete-demand="${escape(r.assetId)}" title="移除需求（先移除画布花块）" ${editing?'':'disabled'}>×</button></div>`;}).join('')||'<p class="authoring-help">尚未配置需求，请从下面添加形状。</p>'}</div>
   <div class="requirement-add"><select id="requirement-shape" class="control" aria-label="添加需求形状" ${editing?'':'disabled'}>${shapes.filter(a=>!requirements.some(r=>r.assetId===a.id)).map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join('')}</select><button type="button" data-add-demand ${editing?'':'disabled'}>添加</button></div>
   <div class="authoring-edit-tools" ${editing?'':'hidden'}><div class="section-label"><span>画布编辑工具</span></div><div class="authoring-tool-grid">${[['target','需求花块'],['fixed','画固定区域'],['fixed-erase','擦固定区域'],['preset','画预置地块'],['preset-erase','擦预置地块'],['fence','栅栏']].map(([id,label])=>`<button type="button" data-author-tool="${id}" class="${id===tool?'active':''}">${label}</button>`).join('')}</div><p class="authoring-help">${hints[tool]}</p><button type="button" class="panel-action" data-remove-target>移除选中的需求花块</button></div>
   <p class="authoring-help">固定 ${l.given.fixedFlowers.length} 格 · 预置 ${l.given.presetPots.length} 格 · 栅栏 ${l.fences.length} 段</p>`;
  panel.querySelectorAll('[data-shape-preview]').forEach(node=>{const a=shapes.find(a=>a.id===node.dataset.shapePreview);if(!a)return;const xs=a.cells.map(c=>c[0]),ys=a.cells.map(c=>c[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX+1,h=Math.max(...ys)-minY+1,size=Math.min(32/w,32/h),ctx=node.getContext('2d');ctx.fillStyle=a.color||'#a79af6';a.cells.forEach(([x,y])=>ctx.fillRect((40-w*size)/2+(x-minX)*size+1,(40-h*size)/2+(y-minY)*size+1,size-2,size-2));});
 }
 panel.onclick=e=>{if(getMode()!=='edit')return;const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-add-demand'))report(store.setShapeRequirement(panel.querySelector('#requirement-shape').value,1));
  if(b.dataset.deleteDemand)report(store.setShapeRequirement(b.dataset.deleteDemand,0));
  if(b.dataset.authorTool){reset();tool=b.dataset.authorTool;render();draw();}
  if(b.hasAttribute('data-remove-target'))report(store.removeAuthoredTarget(store.selectedCell));
 };
 panel.onchange=e=>{if(getMode()!=='edit')return;if(e.target.dataset.demand){report(store.setShapeRequirement(e.target.dataset.demand,Number(e.target.value)));renderKey='';render();}};
 function extend(e){
  if(!gesture)return;
  if(tool==='fence'){
   const pair=edgeAt(e);if(!pair)return;const signature=pair.map(key).sort().join('|');if(gesture.seen.has(signature))return;
   gesture.seen.add(signature);
   if(gesture.adding===undefined)gesture.adding=!store.currentLevel.fences.some(f=>[key(f.a),key(f.b)].sort().join('|')===signature);
   report(store.paintAuthoredFence(pair[0],pair[1],gesture.adding));return;
  }
  const c=cellAt(e);if(!c)return;const previous=gesture.cells.at(-1);if(previous&&key(previous)===key(c))return;
  if(tool==='target'){
   if(previous&&Math.abs(previous[0]-c[0])+Math.abs(previous[1]-c[1])!==1)return;
   const l=store.currentLevel;if(!l.activeCells.some(p=>key(p)===key(c))||l.given.fixedFlowers.some(p=>key(p.cell)===key(c))||l.targets.some(t=>t.solutionCells.some(p=>key(p)===key(c))))return;
  }
  gesture.cells.push(c);onDraft(gesture.cells);draw();
 }
 canvas.addEventListener('pointerdown',e=>{
  if(getMode()!=='edit'||e.button!==0)return;e.stopImmediatePropagation();e.preventDefault();document.querySelector('#cell-context-menu').hidden=true;
  const c=cellAt(e);if(!c)return;reset();store.selectCell(c[1]*store.currentLevel.width+c[0]);
  gesture={cells:[],seen:new Set(),pointerId:e.pointerId};canvas.setPointerCapture(e.pointerId);extend(e);
 },true);
 canvas.addEventListener('pointermove',e=>{if(getMode()!=='edit')return;e.stopImmediatePropagation();extend(e);},true);
 canvas.addEventListener('pointerup',e=>{
  if(getMode()!=='edit')return;e.stopImmediatePropagation();if(!gesture)return;
  const cells=gesture.cells;reset();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(cells.length){if(tool==='target')report(store.addRequiredTargetFromCells(cells));else if(tool.startsWith('fixed'))report(store.paintFixedRegion(cells,tool==='fixed'));else if(tool.startsWith('preset'))report(store.paintPresetRegion(cells,tool==='preset'));}
  draw();
 },true);
 canvas.addEventListener('pointercancel',e=>{if(getMode()!=='edit')return;e.stopImmediatePropagation();reset();draw();},true);
 return {render,reset};
}
