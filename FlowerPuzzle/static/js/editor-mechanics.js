import { validateMechanics, drawMechanics, edgeKey, cellKey } from '../../shape-fill-mechanics.js?v=20261022-mechanics-audit';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configOf=level=>({bricks:level.bricks||[],frozen:level.frozen||[],gates:level.gates||[]});
export function updateMechanics(store,patch) {
 const next={...configOf(store.currentLevel),...patch};
 const errors=validateMechanics({...store.currentLevel,...next});
 if(errors.length)return {ok:false,message:errors.join('；')};
 store.updateLevel(next);return {ok:true};
}
export function paintMechanic(store,kind,cells,settings={}) {
 const unique=[...new Map(cells.map(c=>[cellKey(c),c])).values()],keys=new Set(unique.map(cellKey));
 const next=structuredClone(configOf(store.currentLevel));
 if(kind==='erase')for(const k of ['bricks','frozen'])next[k]=next[k].filter(item=>!keys.has(cellKey(item.cell)));
 else {
  const field=kind==='brick'?'bricks':'frozen';
  next[field]=next[field].filter(item=>!keys.has(cellKey(item.cell)));
  for(const cell of unique)next[field].push(kind==='brick'?{cell,count:settings.count}:{cell,seconds:settings.seconds,charges:settings.charges});
 }
 return updateMechanics(store,next);
}
export function bindMechanicsUI(store,{getMode,getLayout,draw,message}) {
 const panel=document.querySelector('#mechanics-panel'),canvas=document.querySelector('#game-canvas');
 let tool='',count=3,seconds=5,charges=0,draft=null,lastLevel=null,gesture=null,renderKey='';
 const hints={brick:'在有效格上点击或拖动放置砖块，数字表示需要形成的有效花块数量。',frozen:'在有效格上点击或拖动放置冰冻格。新覆盖此格的花块会暂时锁定。',erase:'点击或拖动擦除砖块、冰冻格。机关门使用下方“删除”按钮。','gate-a':'点击有效格设置当前机关门的端子 A。','gate-b':'点击有效格设置当前机关门的端子 B。','gate-edge':'点击两格的公共边添加或移除门边；完成后点击“应用机关门”。'};
 const report=result=>{if(!result.ok)message(result.message);};
 function reset(){tool='';draft=null;gesture=null;renderKey='';}
 function newGate(){draft={id:Math.max(0,...(store.currentLevel.gates||[]).map(g=>g.id))+1,circuit:'network',a:null,b:null,edges:[]};}
 function render(){
  if(lastLevel!==store.currentLevel.id){reset();lastLevel=store.currentLevel.id;}
  const l=store.currentLevel,editing=getMode()==='edit',config=configOf(l),key=JSON.stringify([l.id,config,editing,tool,draft,count,seconds,charges]);
  if(key===renderKey)return;renderKey=key;
  const disabled=editing?'':'disabled';
  panel.innerHTML=`<div class="section-label"><span>Shape Fill 机制</span><span>砖 ${config.bricks.length} · 冰 ${config.frozen.length} · 门 ${config.gates.length}</span></div>
   <p class="authoring-help">砖块：每个有效花块扣 1 次，移除后返还，破碎后不恢复。冰冻：锁住花块，倒计时结束后可修改。机关门：端子接通后开门，断开后关门。</p>
   <div class="mechanic-settings"><label>砖块次数<input id="brick-count" type="number" min="1" step="1" value="${count}" ${disabled}></label><label>冰冻秒数<input id="frozen-seconds" type="number" min="0.1" step="0.1" value="${seconds}" ${disabled}></label><label class="frozen-charges-setting"><span>冰冻触发次数 <small id="frozen-charges-help">0 表示不限次数</small></span><input aria-describedby="frozen-charges-help" id="frozen-charges" type="number" min="0" step="1" value="${charges}" ${disabled}></label></div>
   <div class="authoring-tool-grid">${[['brick','放置砖块'],['frozen','放置冰冻'],['erase','擦除机制']].map(([id,name])=>`<button type="button" data-mechanic-tool="${id}" class="${tool===id?'active':''}" ${disabled}>${name}</button>`).join('')}</div>
   <div class="mechanic-list">${[['bricks','砖'],['frozen','冰']].flatMap(([field,label])=>config[field].map((item,i)=>`<div><span>${label} (${item.cell.join(',')}) · ${field==='bricks'?item.count+' 次':item.seconds+' 秒 / '+(item.charges||'不限')+' 次'}</span><button type="button" data-remove-mechanic="${field}:${i}" aria-label="删除${label} ${item.cell.join(',')}" ${disabled}>×</button></div>`)).join('')}</div>
   <div class="gate-heading"><strong>机关门</strong><button type="button" data-new-gate ${disabled}>新增机关门</button></div>
   <div class="mechanic-list">${config.gates.map(g=>`<div><button type="button" data-edit-gate="${g.id}" ${disabled}>门 ${g.id} · ${g.edges.length} 段</button><button type="button" data-remove-gate="${g.id}" aria-label="删除机关门 ${g.id}" ${disabled}>删除</button></div>`).join('')}</div>
   ${draft?`<div class="gate-draft"><label>连接模式<select id="gate-circuit" class="control" ${disabled}>${[['network','花块网络 · 可配对其他端子'],['linked','同一花块 · 可配对其他端子'],['chain','花块网络 · 仅自身端子'],['single','同一花块 · 仅自身端子']].map(([v,t])=>`<option value="${v}" ${(draft.circuit==='paired'?'chain':draft.circuit)===v?'selected':''}>${t}</option>`).join('')}</select></label><div class="authoring-tool-grid">${[['gate-a',`端子 A：${draft.a?.join(',')??'待设置'}`],['gate-b',`端子 B：${draft.b?.join(',')??'待设置'}`],['gate-edge',`绘制门边（${draft.edges.length}）`]].map(([id,label])=>`<button type="button" data-mechanic-tool="${id}" class="${tool===id?'active':''}" ${disabled}>${label}</button>`).join('')}</div><button type="button" data-apply-gate ${disabled}>应用机关门 ${draft.id}</button><button type="button" data-cancel-gate>取消</button></div>`:''}
   <p class="authoring-help">${escape(hints[tool]||'进入编辑模式后选择上方工具，在画布中放置机制。坐标从左上角 (0,0) 开始。')}</p>`;
 }
 panel.onclick=e=>{
  if(getMode()!=='edit')return;const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mechanicTool)tool=tool===b.dataset.mechanicTool?'':b.dataset.mechanicTool;
  if(b.hasAttribute('data-new-gate')){newGate();tool='gate-a';}
  if(b.dataset.editGate){draft=structuredClone(store.currentLevel.gates.find(g=>g.id===+b.dataset.editGate));tool='gate-edge';}
  if(b.dataset.removeGate){report(updateMechanics(store,{gates:(store.currentLevel.gates||[]).filter(g=>g.id!==+b.dataset.removeGate)}));if(draft?.id===+b.dataset.removeGate){draft=null;tool='';}}
  if(b.dataset.removeMechanic){const [field,i]=b.dataset.removeMechanic.split(':');report(updateMechanics(store,{[field]:store.currentLevel[field].filter((_,index)=>index!==+i)}));}
  if(b.hasAttribute('data-cancel-gate')){draft=null;tool='';}
  if(b.hasAttribute('data-apply-gate')){const result=updateMechanics(store,{gates:[...(store.currentLevel.gates||[]).filter(g=>g.id!==draft.id),structuredClone(draft)].sort((a,b)=>a.id-b.id)});report(result);if(result.ok){draft=null;tool='';}}
  render();draw();
 };
 panel.onchange=e=>{
  if(e.target.id==='brick-count')count=Number(e.target.value);
  if(e.target.id==='frozen-seconds')seconds=Number(e.target.value);
  if(e.target.id==='frozen-charges')charges=Number(e.target.value);
  if(e.target.id==='gate-circuit'&&draft)draft.circuit=e.target.value;
 };
 document.querySelector('#authoring-panel').addEventListener('click',e=>{if(e.target.closest('button')){reset();render();draw();}},true);
 function point(e){const r=canvas.getBoundingClientRect(),l=getLayout();return {x:((e.clientX-r.left)*canvas.width/r.width-l.x)/l.cellSize+(l.originX||0),y:((e.clientY-r.top)*canvas.height/r.height-l.y)/l.cellSize+(l.originY||0)};}
 function extend(e){
  if(!gesture)return;const p=point(e),c=[Math.floor(p.x),Math.floor(p.y)],l=store.currentLevel;
  if(tool==='gate-edge'){
   const dx=Math.abs(p.x-Math.round(p.x)),dy=Math.abs(p.y-Math.round(p.y));if(Math.min(dx,dy)>.24)return;
   const [a,b]=dx<dy?[[Math.round(p.x)-1,Math.floor(p.y)],[Math.round(p.x),Math.floor(p.y)]]:[[Math.floor(p.x),Math.round(p.y)-1],[Math.floor(p.x),Math.round(p.y)]];
   if(![a,b].every(c=>l.activeCells.some(p=>cellKey(p)===cellKey(c))))return;
   const key=edgeKey(a,b);if(gesture.seen.has(key))return;gesture.seen.add(key);
   if(draft.edges.some(e=>edgeKey(e.a,e.b)===key))draft.edges=draft.edges.filter(e=>edgeKey(e.a,e.b)!==key);else draft.edges.push({a,b});
   render();draw();return;
  }
  if(!l.activeCells.some(p=>cellKey(p)===cellKey(c)))return;
  if(tool==='gate-a'||tool==='gate-b'){draft[tool==='gate-a'?'a':'b']=c;render();draw();return;}
  gesture.cells.set(cellKey(c),c);
 }
 // Registered before the ordinary authoring handler, so a mechanism gesture has a single owner.
 canvas.addEventListener('pointerdown',e=>{if(getMode()!=='edit'||!tool||e.button!==0)return;e.stopImmediatePropagation();e.preventDefault();document.querySelector('#cell-context-menu').hidden=true;gesture={cells:new Map(),seen:new Set()};canvas.setPointerCapture?.(e.pointerId);extend(e);},true);
 canvas.addEventListener('pointermove',e=>{if(getMode()!=='edit'||!tool)return;e.stopImmediatePropagation();extend(e);},true);
 canvas.addEventListener('pointerup',e=>{if(getMode()!=='edit'||!tool)return;e.stopImmediatePropagation();if(gesture?.cells.size)report(paintMechanic(store,tool,[...gesture.cells.values()],{count,seconds,charges}));gesture=null;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);render();draw();},true);
 canvas.addEventListener('pointercancel',e=>{if(getMode()!=='edit'||!tool)return;e.stopImmediatePropagation();gesture=null;draw();},true);
 return {render,reset,drawOverlay(ctx,layout){if(getMode()==='edit'&&lastLevel===store.currentLevel.id&&draft?.a&&draft?.b)drawMechanics(ctx,store.currentLevel,layout,{bricks:[],frozen:[],gates:[{...draft,open:false}]});}};
}
