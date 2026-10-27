import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyLevel, drawLevel, validateLevel } from '../gamelogic.js';

test('new levels include empty fixed-flower and preset-pot collections', () => {
  const level = createEmptyLevel({ id: 7, config: { defaults: { boardWidth: 4, boardHeight: 5 } } });
  assert.deepEqual(level.given, { fixedFlowers: [], presetPots: [] });
  assert.equal(Object.hasOwn(level, 'pots'), false);
});

test('new levels start with every board position as a normal cell', () => {
  const level = createEmptyLevel({ id: 8, config: { defaults: { boardWidth: 2, boardHeight: 3 } } });

  assert.deepEqual(level.activeCells, [
    [0, 0], [1, 0],
    [0, 1], [1, 1],
    [0, 2], [1, 2]
  ]);
});

test('given validation rejects overlaps and cells outside the playable board', () => {
  const errors = validateLevel({
    id: 1,
    width: 2,
    height: 1,
    activeCells: [[0, 0]],
    given: {
      fixedFlowers: [{ cell: [0, 0], color: 'coral' }],
      presetPots: [{ cell: [0, 0] }, { cell: [1, 0] }]
    },
    targets: [],
    fences: []
  }, { categories: [] });

  assert.ok(errors.includes('预置内容不能占用同一格'));
  assert.ok(errors.includes('预置内容只能放在活跃格'));
});

test('fixed flowers are excluded from target coverage while preset pots belong to a target solution', () => {
  const level = {
    id: 1, width: 3, height: 1,
    activeCells: [[0, 0], [1, 0], [2, 0]],
    given: { fixedFlowers: [{ cell: [0, 0], color: 'coral' }], presetPots: [{ cell: [1, 0] }] },
    targets: [{ id: 'pair', assetId: 'domino', shape: [[0, 0], [1, 0]], solutionCells: [[1, 0], [2, 0]] }],
    fences: []
  };
  const assets = { categories: [{ items: [{ id: 'domino' }] }] };

  assert.deepEqual(validateLevel(level, assets), []);
  const errors = validateLevel({ ...level, given: { ...level.given, presetPots: [{ cell: [0, 0] }] } }, assets);
  assert.ok(errors.includes('预置花盆必须包含在目标标准解中'));
});

test('all preset pots may fill one target but cannot span multiple targets', () => {
  const assets = { categories: [{ items: [{ id: 'domino' }] }] };
  const base = {
    id: 1, width: 4, height: 1,
    activeCells: [[0, 0], [1, 0], [2, 0], [3, 0]],
    targets: [
      { id: 'left', assetId: 'domino', shape: [[0, 0], [1, 0]], solutionCells: [[0, 0], [1, 0]] },
      { id: 'right', assetId: 'domino', shape: [[0, 0], [1, 0]], solutionCells: [[2, 0], [3, 0]] }
    ], fences: []
  };

  const whole = validateLevel({ ...base, given: { fixedFlowers: [], presetPots: [{ cell: [0, 0] }, { cell: [1, 0] }] } }, assets);
  assert.deepEqual(whole, []);

  const spanning = validateLevel({ ...base, given: { fixedFlowers: [], presetPots: [{ cell: [0, 0] }, { cell: [2, 0] }] } }, assets);
  assert.ok(spanning.includes('预置花盆必须位于同一个目标花块中'));
});

test('target validation accepts authored targets without colors', () => {
  const errors = validateLevel({
    id: 1,
    width: 2,
    height: 1,
    activeCells: [[0, 0], [1, 0]],
    given: { fixedFlowers: [], presetPots: [] },
    targets: [{
      id: 'target-1',
      assetId: 'domino',
      shape: [[0, 0], [1, 0]],
      solutionCells: [[0, 0], [1, 0]]
    }],
    fences: []
  }, { categories: [{ items: [{ id: 'domino' }] }] });

  assert.deepEqual(errors, []);
});

test('edit rendering draws both preset pots and fixed flowers on active cells', () => {
  const arcs = [];
  const borders = [];
  const boundaryLines = [];
  const context = {
    canvas: { width: 300, height: 500 },
    clearRect() {}, fillRect() {}, strokeRect(...args) { borders.push(args); }, fillText() {},
    beginPath() {}, moveTo() {}, lineTo(...args) { boundaryLines.push(args); }, stroke() {}, fill() {},
    arc(...args) { arcs.push(args); }
  };
  const level = {
    id: 1, name: 'pots', width: 2, height: 1,
    activeCells: [[0, 0], [1, 0]],
    given: { presetPots: [{ cell: [0, 0] }], fixedFlowers: [{ cell: [1, 0], color: 'coral' }] },
    targets: [], fences: []
  };

  drawLevel(context, level, { mode: 'edit' });

  assert.ok(arcs.length >= 7, 'two pots and flower petals should be drawn');
  assert.equal(borders.length, 2, 'only the normal active-cell borders use rectangles');
  assert.equal(boundaryLines.length, 8, 'different adjacent given types keep separate four-edge outlines');
});
