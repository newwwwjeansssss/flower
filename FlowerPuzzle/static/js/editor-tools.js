export function applyEditorTool(store, tool, index, pendingFenceCell = null) {
  if (tool === 'select') {
    store.selectCell(index);
    return null;
  }
  if (tool === 'restore') store.paintCell(index, 'active');
  if (tool === 'remove') store.paintCell(index, 'empty');
  if (tool === 'preset-pot') store.placeGiven(index, 'preset-pot');
  if (tool === 'fixed-flower') store.placeGiven(index, 'fixed-flower');
  if (tool !== 'fence') return null;
  if (pendingFenceCell === null) {
    store.selectCell(index);
    return index;
  }
  store.toggleFence(pendingFenceCell, index);
  return null;
}

export function editorCanvasPointToIndex(point, layout, level) {
  if (point.x < layout.x || point.y < layout.y || point.x >= layout.x + layout.width || point.y >= layout.y + layout.height) return -1;
  const x = Math.floor((point.x - layout.x) / layout.cellSize) + (layout.originX || 0);
  const y = Math.floor((point.y - layout.y) / layout.cellSize) + (layout.originY || 0);
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return -1;
  return y * level.width + x;
}

export function extendTargetDraft(path, index, level) {
  const point = [index % level.width, Math.floor(index / level.width)];
  const key = point.join(',');
  const active = new Set((level.activeCells || []).map(cell => cell.join(',')));
  const fixed = new Set((level.given?.fixedFlowers || []).map(item => item.cell.join(',')));
  if (!active.has(key)) return { path, changed: false, reason: 'inactive' };
  if (fixed.has(key)) return { path, changed: false, reason: 'occupied' };
  const previous = path.at(-1);
  if (previous && Math.abs(previous[0] - point[0]) + Math.abs(previous[1] - point[1]) !== 1) return { path, changed: false, reason: 'disconnected' };
  return { path: [...path, point], changed: true };
}

export function extendGivenSelection(path, index, level) {
  const point = [index % level.width, Math.floor(index / level.width)];
  const key = point.join(',');
  const targets = level.targets || [];
  const target = targets.find(item => (item.solutionCells || []).some(cell => cell.join(',') === key));
  const firstKey = path?.[0]?.join(',');
  const firstTarget = firstKey && targets.find(item => (item.solutionCells || []).some(cell => cell.join(',') === firstKey));
  const fixedCells = new Set((level.given?.fixedFlowers || []).map(item => item.cell.join(',')));
  if (!target) return { path, changed: false, reason: 'not-target' };
  if (firstTarget && firstTarget !== target) return { path, changed: false, reason: 'different-target' };
  if (fixedCells.has(key)) return { path, changed: false, reason: 'fixed' };
  if ((path || []).some(cell => cell.join(',') === key)) return { path, changed: false, reason: 'duplicate' };
  return { path: [...path, point], changed: true };
}

export function beginGivenSelection(path, index, level, additive = false) {
  return extendGivenSelection(additive ? path : [], index, level);
}

export function renderEditorScene(runtime, context, level, layout, palette, now = Date.now()) {
  const state = runtime.createGameState(level, { shuffleColors: false, assets: palette });
  const runtimeTargets = state.level?.targets || level.targets || [];
  const targetShapes = (level.targets || []).map((target, index) => ({
    id: `editor-${target.id || index + 1}`,
    targetId: target.id,
    cells: (target.solutionCells || []).map(cell => [...cell]),
    color: runtimeTargets[index]?.color || target.color,
    status: 'flowers',
    createdAt: 0
  }));
  if (targetShapes.length) state.shapes = [...targetShapes, ...(state.shapes || [])];
  runtime.renderScene(context, state, layout, palette, now);
  return state;
}

const importedShapeNames = {'sf-S5':'五格折线 S5','sf-L5_Big':'五格大拐角 L5_Big','sf-T5_Long':'五格长丁字 T5_Long','sf-L5':'五格长拐角 L5'};
const assetDisplayName = asset => asset.name === `Shape Fill ${asset.id.slice(3)}` ? (importedShapeNames[asset.id] || asset.name) : asset.name;
const escapeAssetText = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shapeThumbnail(cells) {
  const minX=Math.min(...cells.map(c=>c[0])),minY=Math.min(...cells.map(c=>c[1]));
  const width=Math.max(...cells.map(c=>c[0]))-minX+1,height=Math.max(...cells.map(c=>c[1]))-minY+1;
  return `<svg class="asset-shape-thumbnail" viewBox="0 0 ${width*10} ${height*10}" aria-hidden="true" focusable="false">${cells.map(([x,y])=>`<rect x="${(x-minX)*10+0.6}" y="${(y-minY)*10+0.6}" width="8.8" height="8.8" rx="1"/>`).join('')}</svg>`;
}

export function renderAssetLibrary(assets, search = '', selectedAssetId = null) {
  const query = search.trim().toLowerCase();
  return (assets.categories || []).map((category) => {
    const items = (category.items || []).filter((asset) => (
      !query || `${asset.id}${assetDisplayName(asset)}${asset.type}`.toLowerCase().includes(query)
    ));
    if (!items.length) return '';
    const cards = items.map((asset) => {
      const editable = asset.type !== 'flower-color';
      const selected = editable && asset.id === selectedAssetId;
      const importedShape = asset.id.startsWith('sf-') && asset.type === 'shape' && asset.cells?.length;
      const visual = importedShape ? shapeThumbnail(asset.cells) : (editable ? (asset.symbol || '●') : '');
      return `<button type="button" class="asset ${selected ? 'selected' : ''}${editable ? '' : ' asset-readonly'}${importedShape ? ' asset-imported-shape' : ''}" title="${escapeAssetText(assetDisplayName(asset))} (${escapeAssetText(asset.id)})" data-id="${asset.id}" data-editable="${editable}"${editable ? '' : ' aria-disabled="true"'}><div class="asset-visual" style="background:${asset.color || '#293246'}">${visual}</div><div class="asset-name">${escapeAssetText(assetDisplayName(asset))}</div></button>`;
    }).join('');
    return `<section class="category"><div class="category-head"><span>⌄</span>${category.name}<span class="count">${items.length}</span></div><div class="asset-grid">${cards}</div></section>`;
  }).join('');
}

export function fenceNeighborIndex(level, index, direction) {
  const x = index % level.width;
  const y = Math.floor(index / level.width);
  const offsets = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const offset = offsets[direction];
  if (!offset) return -1;
  const next = [x + offset[0], y + offset[1]];
  if (next[0] < 0 || next[1] < 0 || next[0] >= level.width || next[1] >= level.height) return -1;
  if (!(level.activeCells || []).some(([cellX, cellY]) => cellX === next[0] && cellY === next[1])) return -1;
  return next[1] * level.width + next[0];
}

export function isTextEditingTarget(target) {
  return Boolean(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable));
}
