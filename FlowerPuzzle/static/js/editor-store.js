import { retainMechanics } from '../../shape-fill-mechanics.js?v=20261022-mechanics-audit';
import { COLLECTIONS, collectionOf, levelsInCollection } from "./level-collections.js?v=20261028-ice-intro";
import { authoringMethods } from './editor-authoring-store.js?v=20261022-mechanics-audit';
import { createEmptyLevel, getAssetReferences, validateLevel } from "../../gamelogic.js?v=20261022-mechanics-audit";

const clone = value => structuredClone(value);
const levelPath = level => level.filePath || `level/level-${level.id}.json`;
const levelContent = level => JSON.stringify(level, (key,value) => ["fileName","filePath","tutorial","difficulty"].includes(key) ? undefined : value, 2);
const normalizeLevel = level => { const normalized=clone(level),legacy=normalized.pots||[];normalized.given=normalized.given||{fixedFlowers:legacy.filter(item=>item.state==='flower').map(item=>({cell:item.cell,color:item.color||'coral'})),presetPots:legacy.filter(item=>item.state!=='flower').map(item=>({cell:item.cell}))};delete normalized.pots;return normalized; };
const cellKey = cell => cell.join(',');
const normalizeCells = cells => { const minX=Math.min(...cells.map(([x])=>x)),minY=Math.min(...cells.map(([,y])=>y));return cells.map(([x,y])=>[x-minX,y-minY]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]); };
const sameCells = (left,right) => left.length===right.length&&left.every((cell,index)=>cellKey(cell)===cellKey(right[index]));
const shapeVariants = cells => { const variants=[];for(const mirrored of [false,true]){let points=cells.map(([x,y])=>[mirrored?-x:x,y]);for(let turn=0;turn<4;turn++){variants.push({transform:`${mirrored?'M':''}R${turn*90}`,cells:normalizeCells(points)});points=points.map(([x,y])=>[-y,x]);}}return variants; };
const cellsAreConnected = cells => { if(!cells.length)return false;const all=new Set(cells.map(cellKey)),seen=new Set([cellKey(cells[0])]),queue=[cells[0]];while(queue.length){const [x,y]=queue.shift();for(const neighbor of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const key=cellKey(neighbor);if(all.has(key)&&!seen.has(key)){seen.add(key);queue.push(neighbor);}}}return seen.size===all.size; };

// Target shapes are indivisible: trimming cells must never leave a partial solution.
const retainLevelCells = (level, keepCell) => {
  const removedTargetCells = new Set();
  const targets = (level.targets || []).filter(target => {
    const cells = target.solutionCells || [];
    if (cells.length && cells.every(keepCell)) return true;
    cells.forEach(cell => removedTargetCells.add(cellKey(cell)));
    return false;
  });
  const given = level.given || { fixedFlowers: [], presetPots: [] };
  return {
    ...retainMechanics(level,keepCell),
    activeCells: level.activeCells.filter(keepCell),
    targets,
    given: {
      fixedFlowers: (given.fixedFlowers || []).filter(item => keepCell(item.cell)),
      presetPots: (given.presetPots || []).filter(item => keepCell(item.cell) && !removedTargetCells.has(cellKey(item.cell)))
    },
    fences: (level.fences || []).filter(fence => keepCell(fence.a) && keepCell(fence.b))
  };
};

export class EditorStore {
  constructor({ config, assets, levels, files = null }) {
    this.config = clone(config); this.assets = clone(assets); this.levels = levels.map(normalizeLevel); this.files = files;
    // Skip unchanged files so saving a trial edit leaves the original campaign byte-for-byte intact.
    this.savedLevelContents = new Map(this.levels.filter((level,index) => level.filePath && !['pots','tutorial','difficulty'].some(key=>Object.hasOwn(levels[index],key))).map(level=>[levelPath(level),levelContent(level)]));
    this.currentCollection = collectionOf(this.levels[0]); this.currentLevelId = this.levels[0]?.id ?? null; this.selectedCell = 0; this.selectedAssetId = this.allAssets()[0]?.id ?? null;
    this.dirty = false; this.history = []; this.future = []; this.pendingImages = new Map(); this.deletedLevelPaths = new Set(); this.deletedImagePaths = new Set(); this.listeners = new Set();
  }
  get currentLevel() { return this.levels.find(level => level.id === this.currentLevelId) || null; }
  allAssets() { return (this.assets.categories || []).flatMap(category => category.items || []); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(reason = "data") { this.listeners.forEach(listener => listener(this, reason)); }
  snapshot() { return clone({ config: this.config, assets: this.assets, levels: this.levels, currentLevelId: this.currentLevelId, currentCollection: this.currentCollection, selectedCell: this.selectedCell, selectedAssetId: this.selectedAssetId }); }
  restore(state) { Object.assign(this, clone(state)); this.dirty = true; this.emit("data"); }
  mutate(change) { this.history.push(this.snapshot()); if (this.history.length > 100) this.history.shift(); this.future = []; change(); this.dirty = true; this.emit("data"); }
  undo() { if (!this.history.length) return; this.future.push(this.snapshot()); this.restore(this.history.pop()); }
  redo() { if (!this.future.length) return; this.history.push(this.snapshot()); this.restore(this.future.pop()); }
  selectCollection(id) { const level=levelsInCollection(this.levels,id)[0];if(!level)return;this.selectLevel(level.id); }
  selectLevel(id) { const level=this.levels.find(l=>l.id===Number(id));if(!level)return;this.currentCollection=collectionOf(level);this.currentLevelId=Number(id);this.selectedCell=0;this.emit("level-selection"); }
  selectCell(index) { this.selectedCell=Number(index);this.emit("cell-selection"); }
  selectAsset(id) { this.selectedAssetId=id;this.emit("asset-selection"); }
  paintCell(index, value) {
    const level = this.currentLevel;
    if (!level || index < 0) return false;
    const point = [index % level.width, Math.floor(index / level.width)], key = cellKey(point);
    const has = level.activeCells.some(cell => cellKey(cell) === key), active = value !== "empty";
    if (has === active) return false;
    this.mutate(() => {
      if (active) level.activeCells.push(point);
      else Object.assign(level, retainLevelCells(level, cell => cellKey(cell) !== key));
      this.selectedCell = index;
    });
    return true;
  }
  placeGiven(index, type) { if (!this.currentLevel || index < 0 || !['preset-pot','fixed-flower'].includes(type)) return false; const point=[index%this.currentLevel.width,Math.floor(index/this.currentLevel.width)],cellKey=point.join(','); if(!this.currentLevel.activeCells.some(cell=>cell.join(',')===cellKey))return false;const target=this.currentLevel.targets.find(item=>(item.solutionCells||[]).some(cell=>cell.join(',')===cellKey));if((type==='preset-pot'&&!target)||(type==='fixed-flower'&&target))return false;const given=this.currentLevel.given||{fixedFlowers:[],presetPots:[]},fixedFlowers=given.fixedFlowers||[],presetPots=given.presetPots||[],current=fixedFlowers.some(item=>item.cell.join(',')===cellKey)?'fixed-flower':presetPots.some(item=>item.cell.join(',')===cellKey)?'preset-pot':null;if(current===type)return false;this.mutate(()=>{this.currentLevel.given={fixedFlowers:fixedFlowers.filter(item=>item.cell.join(',')!==cellKey),presetPots:presetPots.filter(item=>item.cell.join(',')!==cellKey)};if(type==='fixed-flower')this.currentLevel.given.fixedFlowers.push({cell:point,color:'coral'});else this.currentLevel.given.presetPots.push({cell:point});this.selectedCell=index;});return true; }
  togglePresetPots(cells) { if(!this.currentLevel)return false;const level=this.currentLevel,selected=[...new Map((cells||[]).map(cell=>[cellKey(cell),cell])).values()],fixedCells=new Set((level.given?.fixedFlowers||[]).map(item=>cellKey(item.cell))),target=(level.targets||[]).find(item=>selected.every(cell=>(item.solutionCells||[]).some(point=>cellKey(point)===cellKey(cell))));if(!selected.length||!target||selected.some(cell=>fixedCells.has(cellKey(cell))))return false;const given=level.given||{fixedFlowers:[],presetPots:[]},existing=new Set((given.presetPots||[]).map(item=>cellKey(item.cell))),remove=selected.every(cell=>existing.has(cellKey(cell)));this.mutate(()=>{const selectedKeys=new Set(selected.map(cellKey));level.given={fixedFlowers:given.fixedFlowers||[],presetPots:remove?(given.presetPots||[]).filter(item=>!selectedKeys.has(cellKey(item.cell))):[...(given.presetPots||[]),...selected.filter(cell=>!existing.has(cellKey(cell))).map(cell=>({cell:[...cell]}))]};});return true; }
  toggleFence(firstIndex, secondIndex) { if(!this.currentLevel||firstIndex<0||secondIndex<0)return false;const width=this.currentLevel.width,a=[firstIndex%width,Math.floor(firstIndex/width)],b=[secondIndex%width,Math.floor(secondIndex/width)],active=new Set(this.currentLevel.activeCells.map(cell=>cell.join(',')));if(!active.has(a.join(','))||!active.has(b.join(','))||Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])!==1)return false;const same=fence=>(fence.a.join(',')===a.join(',')&&fence.b.join(',')===b.join(','))||(fence.a.join(',')===b.join(',')&&fence.b.join(',')===a.join(','));this.mutate(()=>{const exists=this.currentLevel.fences.some(same);this.currentLevel.fences=exists?this.currentLevel.fences.filter(fence=>!same(fence)):[...this.currentLevel.fences,{a,b,role:'challenge'}];this.selectedCell=secondIndex;});return true; }
  updateConfig(patch) { this.mutate(() => Object.assign(this.config, patch)); }
  updateLevel(patch) { if (this.currentLevel) this.mutate(() => Object.assign(this.currentLevel, patch)); }
  resizeLevel(width, height) {
    const level = this.currentLevel;
    if (!level || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return false;
    if (level.width === width && level.height === height) return false;
    const inside = ([x, y]) => x >= 0 && y >= 0 && x < width && y < height;
    this.updateLevel({ width, height, ...retainLevelCells(level, inside) });
    return true;
  }
  updateCell(value) { if(value==='active'&&this.currentLevel){const point=[this.selectedCell%this.currentLevel.width,Math.floor(this.selectedCell/this.currentLevel.width)],cellKey=point.join(','),given=this.currentLevel.given||{fixedFlowers:[],presetPots:[]};if([...(given.fixedFlowers||[]),...(given.presetPots||[])].some(item=>item.cell.join(',')===cellKey)){this.mutate(()=>{this.currentLevel.given={fixedFlowers:(given.fixedFlowers||[]).filter(item=>item.cell.join(',')!==cellKey),presetPots:(given.presetPots||[]).filter(item=>item.cell.join(',')!==cellKey)};});return true;}}return this.paintCell(this.selectedCell, value); }
  addTargetFromCells(cells) { const level=this.currentLevel,unique=[...new Map((cells||[]).map(point=>[cellKey(point),point])).values()];if(!level||!unique.length||!cellsAreConnected(unique))return{ok:false,reason:'invalid'};const active=new Set(level.activeCells.map(cellKey)),fixed=new Set((level.given?.fixedFlowers||[]).map(item=>cellKey(item.cell)));if(unique.some(point=>!active.has(cellKey(point))))return{ok:false,reason:'inactive'};if(unique.some(point=>fixed.has(cellKey(point))))return{ok:false,reason:'occupied'};if(level.overlapCells?.length&&unique.some(c=>level.targets.filter(t=>t.solutionCells.some(p=>cellKey(p)===cellKey(c))).length>=(level.overlapCells.find(o=>cellKey(o.cell)===cellKey(c))?.count||1)))return{ok:false,reason:'occupied'};const normalized=normalizeCells(unique),match=this.allAssets().filter(asset=>asset.type==='shape'&&Array.isArray(asset.cells)).flatMap(asset=>shapeVariants(asset.cells).map(variant=>({asset,...variant}))).find(candidate=>sameCells(candidate.cells,normalized));if(!match)return{ok:false,reason:'unknown-shape'};const drawn=new Set(unique.map(cellKey)),replaced=level.targets.filter(target=>(target.solutionCells||[]).some(point=>drawn.has(cellKey(point))&&!level.overlapCells?.some(o=>cellKey(o.cell)===cellKey(point)))),nextId=Math.max(0,...level.targets.map(target=>Number(String(target.id).match(/^target-(\d+)$/)?.[1]||0)))+1,id=replaced[0]?.id||`target-${nextId}`,solutionCells=unique.map(point=>[...point]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),origin=[Math.min(...unique.map(([x])=>x)),Math.min(...unique.map(([,y])=>y))],target={id,assetId:match.asset.id,transform:match.transform,variant:match.transform,origin,shape:clone(match.asset.cells),solutionCells};this.mutate(()=>{level.targets=level.targets.filter(candidate=>!replaced.includes(candidate));level.targets.push(target);});return{ok:true,target:clone(target)}; }
  cropEmptyCells() { if(!this.currentLevel)return false;const level=this.currentLevel,given=level.given||{fixedFlowers:[],presetPots:[]},kept=new Set([...(level.targets||[]).flatMap(target=>target.solutionCells||[]),...(given.fixedFlowers||[]).map(item=>item.cell),...(given.presetPots||[]).map(item=>item.cell)].map(cellKey)),active=level.activeCells.filter(cell=>kept.has(cellKey(cell))).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);if(active.length===level.activeCells.length)return false;const activeKeys=new Set(active.map(cellKey));this.mutate(()=>{Object.assign(level,retainMechanics(level,c=>activeKeys.has(cellKey(c))));level.activeCells=active;level.fences=(level.fences||[]).filter(fence=>activeKeys.has(cellKey(fence.a))&&activeKeys.has(cellKey(fence.b)));});return true; }
  restoreAllCells() { if(!this.currentLevel)return false;const level=this.currentLevel,cells=[];for(let y=0;y<level.height;y++)for(let x=0;x<level.width;x++)cells.push([x,y]);if(cells.length===level.activeCells.length&&cells.every((cell,index)=>cellKey(cell)===cellKey(level.activeCells[index])))return false;this.mutate(()=>{level.activeCells=cells;});return true; }
  addAsset(categoryId, asset, image = null) { if (this.allAssets().some(item => item.id === asset.id)) throw new Error("资源 ID 已存在"); this.mutate(() => { const category = this.assets.categories.find(item => item.id === categoryId) || this.assets.categories[0]; category.items.push(asset); if (image) this.pendingImages.set(asset.image, image); }); }
  updateAsset(id, patch, image = null) { const asset = this.allAssets().find(item => item.id === id); if (!asset) throw new Error("资源不存在"); if (patch.id!==id && this.assetReferences(id).length) throw new Error("被关卡引用的资源不能修改 ID"); if (patch.id!==id && this.allAssets().some(item=>item.id===patch.id)) throw new Error("资源 ID 已存在"); this.mutate(() => { const oldImage=asset.image; Object.assign(asset, patch); if(oldImage&&oldImage!==asset.image)this.deletedImagePaths.add(oldImage); if (image) this.pendingImages.set(asset.image, image); }); }
  assetReferences(id) { return this.levels.filter(level => getAssetReferences(level, id)).map(level => level.fileName || `level-${level.id}.json`); }
  deleteAsset(id) { const refs = this.assetReferences(id); if (refs.length) throw new Error(`资源仍被这些关卡引用：${refs.join("、")}`); this.mutate(() => { const asset=this.allAssets().find(item=>item.id===id); if(asset?.image)this.deletedImagePaths.add(asset.image); for (const category of this.assets.categories) category.items = category.items.filter(item => item.id !== id); }); }
  addLevel() {
    const collection=COLLECTIONS.find(c=>c.id===this.currentCollection),levels=levelsInCollection(this.levels,this.currentCollection);
    const number=Math.max(0,...levels.map(l=>l.sourceId||l.id))+1;
    let id=collection.idBase+number;
    while(this.levels.some(l=>l.id===id))id++;
    this.mutate(()=>{const level=createEmptyLevel({id,config:this.config});this.levels.push({...level,name:`${this.currentCollection==='flower'?'新关卡':this.currentCollection==='flower-trial'?'试玩':collection.label} ${number}`,collection:this.currentCollection,...(collection.idBase?{sourceId:number}:{}),requirements:[],fileName:`level-${number}.json`,filePath:`${collection.directory}/level-${number}.json`});this.currentLevelId=id;});
  }
  deleteLevel(id) {
    const level=this.levels.find(l=>l.id===Number(id));if(!level)return;
    const group=levelsInCollection(this.levels,collectionOf(level));
    if(group.length<=1)throw new Error("每个列表至少保留一个关卡");
    this.mutate(()=>{this.levels=this.levels.filter(l=>l!==level);this.deletedLevelPaths.add(level.filePath);this.currentLevelId=group.find(l=>l!==level).id;this.currentCollection=collectionOf(level);});
  }
  async save() {
    if (!this.files) throw new Error("当前为只读演示模式");
    for (const level of this.levels) { const errors=validateLevel(level,this.assets); if(errors.length) throw new Error(`${level.fileName || level.name}：${errors.join("；")}`); }
    try { await this.files.mkdir("level/asset", true); } catch (error) { if (error.code !== "ALREADY_EXISTS") throw error; }
    for (const [path, base64] of this.pendingImages) await this.files.writeBase64(path, base64, true);
    await this.files.writeText("config.json", JSON.stringify(this.config, null, 2), true);
    await this.files.writeText("asset.json", JSON.stringify(this.assets, null, 2), true);
    for (const level of this.levels) {
      const path=levelPath(level),content=levelContent(level);
      if(this.savedLevelContents.get(path)!==content)await this.files.writeText(path,content,true);
    }
    for (const path of this.deletedLevelPaths) if(!this.levels.some(level=>level.filePath===path)) await this.files.remove(path, false);
    const catalog=Object.fromEntries(COLLECTIONS.map(c=>[c.id,levelsInCollection(this.levels,c.id).map(l=>l.fileName||`level-${l.id}.json`)]));
    await this.files.writeText("level-catalog.json", JSON.stringify(catalog,null,2), true);
    for (const path of this.deletedImagePaths) { try { await this.files.remove(path, false); } catch (error) { if(error.code!=="NOT_FOUND") throw error; } }
    this.savedLevelContents = new Map(this.levels.map(level=>[levelPath(level),levelContent(level)]));
    this.pendingImages.clear(); this.deletedLevelPaths.clear(); this.deletedImagePaths.clear(); this.dirty = false; this.history = []; this.future = []; this.emit("save");
  }
}

Object.assign(EditorStore.prototype, authoringMethods);

