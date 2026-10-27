import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEditorTool, beginGivenSelection, editorCanvasPointToIndex, extendGivenSelection, extendTargetDraft, fenceNeighborIndex, isTextEditingTarget, renderAssetLibrary, renderEditorScene } from '../static/js/editor-tools.js';

test('target draft extends only through adjacent active unoccupied cells', () => {
  const level = {
    width: 3,
    height: 2,
    activeCells: [[0, 0], [1, 0], [2, 0], [1, 1]],
    targets: [{ solutionCells: [[2, 0]] }]
  };

  assert.deepEqual(extendTargetDraft([], 0, level), { path: [[0, 0]], changed: true });
  assert.deepEqual(extendTargetDraft([[0, 0]], 1, level), { path: [[0, 0], [1, 0]], changed: true });
  assert.deepEqual(extendTargetDraft([[0, 0]], 4, level), { path: [[0, 0]], changed: false, reason: 'disconnected' });
  assert.deepEqual(extendTargetDraft([[1, 0]], 2, level), { path: [[1, 0], [2, 0]], changed: true });
  assert.deepEqual(extendTargetDraft([[1, 0]], 3, level), { path: [[1, 0]], changed: false, reason: 'inactive' });
});

test('target draft can retrace a drawn cell to reach another branch', () => {
  const level = {
    width: 3,
    height: 3,
    activeCells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    targets: []
  };
  let path = [[1, 1], [1, 0]];

  path = extendTargetDraft(path, 4, level).path;
  path = extendTargetDraft(path, 5, level).path;

  assert.deepEqual(path, [[1, 1], [1, 0], [1, 1], [2, 1]]);
});

test('given selection accepts target cells and rejects empty or fixed-flower cells', () => {
  const level = {
    width: 3,
    activeCells: [[0, 0], [1, 0], [2, 0]],
    targets: [{ solutionCells: [[0, 0], [1, 0]] }],
    given: { fixedFlowers: [{ cell: [1, 0] }], presetPots: [] }
  };

  assert.deepEqual(extendGivenSelection([], 0, level), { path: [[0, 0]], changed: true });
  assert.equal(extendGivenSelection([[0, 0]], 1, level).reason, 'fixed');
  assert.equal(extendGivenSelection([[0, 0]], 2, level).reason, 'not-target');
});

test('given selection cannot cross from one target shape into another', () => {
  const level = {
    width: 4,
    targets: [
      { id: 'left', solutionCells: [[0, 0], [1, 0]] },
      { id: 'right', solutionCells: [[2, 0], [3, 0]] }
    ],
    given: { fixedFlowers: [], presetPots: [] }
  };

  assert.equal(extendGivenSelection([[0, 0]], 2, level).reason, 'different-target');
});

test('control starts an additive given selection while a normal click replaces it', () => {
  const level = {
    width: 3,
    targets: [{ solutionCells: [[0, 0], [1, 0], [2, 0]] }],
    given: { fixedFlowers: [], presetPots: [] }
  };

  assert.deepEqual(beginGivenSelection([[0, 0]], 1, level, true), {
    path: [[0, 0], [1, 0]], changed: true
  });
  assert.deepEqual(beginGivenSelection([[0, 0]], 2, level, false), {
    path: [[2, 0]], changed: true
  });
});

test('fence tool waits for a second cell, toggles the edge, then clears its pending cell', () => {
  const calls = [];
  const store = {
    selectCell(index) { calls.push(['select', index]); },
    toggleFence(a, b) { calls.push(['fence', a, b]); return true; }
  };

  assert.equal(applyEditorTool(store, 'fence', 3, null), 3);
  assert.equal(applyEditorTool(store, 'fence', 4, 3), null);
  assert.deepEqual(calls, [['select', 3], ['fence', 3, 4]]);
});

test('cell and given tools dispatch the requested edit and leave no fence selection', () => {
  const calls = [];
  const store = {
    paintCell(index, value) { calls.push(['cell', index, value]); },
    placeGiven(index, type) { calls.push(['given', index, type]); }
  };

  assert.equal(applyEditorTool(store, 'restore', 2, 1), null);
  assert.equal(applyEditorTool(store, 'remove', 2, 1), null);
  assert.equal(applyEditorTool(store, 'preset-pot', 2, 1), null);
  assert.equal(applyEditorTool(store, 'fixed-flower', 2, 1), null);
  assert.deepEqual(calls, [
    ['cell', 2, 'active'],
    ['cell', 2, 'empty'],
    ['given', 2, 'preset-pot'],
    ['given', 2, 'fixed-flower']
  ]);
});

test('editor uses the runtime scene renderer used by play mode', () => {
  const calls = [];
  const runtime = {
    createGameState(level, options) { calls.push(['state', level, options]); return { level }; },
    renderScene(context, state, layout, palette, now) { calls.push(['render', context, state, layout, palette, now]); }
  };
  const level = { id: 1 };
  const context = {};
  const layout = { x: 1 };
  const palette = { palettes: {} };

  renderEditorScene(runtime, context, level, layout, palette, 123);

  assert.deepEqual(calls, [
    ['state', level, { shuffleColors: false, assets: palette }],
    ['render', context, { level }, layout, palette, 123]
  ]);
});

test('editor scene includes authored targets as visible flower shapes', () => {
  const calls = [];
  const runtime = {
    createGameState(level) { return { level, shapes: [] }; },
    renderScene(_context, state) { calls.push(structuredClone(state.shapes)); }
  };
  const level = {
    targets: [{ id: 'target-1', color: 'coral', solutionCells: [[0, 0], [1, 0]] }]
  };

  renderEditorScene(runtime, {}, level, {}, { categories: [] }, 123);

  assert.deepEqual(calls, [[{
    id: 'editor-target-1',
    targetId: 'target-1',
    cells: [[0, 0], [1, 0]],
    color: 'coral',
    status: 'flowers',
    createdAt: 0
  }]]);
});

test('asset library renders flower colors as searchable read-only cards', () => {
  const assets = { categories: [
    { id: 'shapes', name: '花块形状', items: [{ id: 'domino', name: '双格花圃', type: 'shape', color: '#ef806f' }] },
    { id: 'colors', name: '花块颜色', items: [
      { id: 'coral', name: '珊瑚红', type: 'flower-color', color: '#F47F72' },
      { id: 'sun', name: '阳光黄', type: 'flower-color', color: '#F5C451' }
    ] }
  ] };

  const html = renderAssetLibrary(assets, '阳光', 'domino');

  assert.match(html, /花块颜色/);
  assert.match(html, /阳光黄/);
  assert.match(html, /data-editable="false"/);
  assert.doesNotMatch(html, /珊瑚红|双格花圃/);
});

test('editor hit testing includes missing cells inside the displayed board', () => {
  const level = { width: 3, height: 2 };
  const layout = { x: 10, y: 20, width: 90, height: 60, cellSize: 30, originX: 0, originY: 0 };
  assert.equal(editorCanvasPointToIndex({ x: 55, y: 65 }, layout, level), 4);
  assert.equal(editorCanvasPointToIndex({ x: 101, y: 65 }, layout, level), -1);
});

test('fence directions resolve only to adjacent existing cells', () => {
  const level = { width: 3, height: 3, activeCells: [[1, 1], [1, 0], [2, 1]] };
  assert.equal(fenceNeighborIndex(level, 4, 'up'), 1);
  assert.equal(fenceNeighborIndex(level, 4, 'right'), 5);
  assert.equal(fenceNeighborIndex(level, 4, 'down'), -1);
  assert.equal(fenceNeighborIndex(level, 4, 'left'), -1);
  assert.equal(fenceNeighborIndex(level, 1, 'up'), -1);
});

test('delete shortcuts do not intercept text editing controls', () => {
  assert.equal(isTextEditingTarget({ tagName: 'INPUT', isContentEditable: false }), true);
  assert.equal(isTextEditingTarget({ tagName: 'TEXTAREA', isContentEditable: false }), true);
  assert.equal(isTextEditingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextEditingTarget({ tagName: 'CANVAS', isContentEditable: false }), false);
});
