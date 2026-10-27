import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../static/js/editor-store.js';

const makeStore = () => new EditorStore({
  config: { defaults: { boardWidth: 3, boardHeight: 2 } },
  assets: { categories: [{ id: 'shapes', items: [
    { id: 'domino', type: 'shape', cells: [[0, 0], [1, 0]] },
    { id: 'L3', type: 'shape', cells: [[0, 0], [0, 1], [1, 1]] }
  ] }] },
  levels: [{
    id: 1,
    width: 3,
    height: 2,
    activeCells: [[0, 0], [1, 0], [2, 0]],
    given: { fixedFlowers: [], presetPots: [] },
    targets: [],
    fences: []
  }]
});

test('drawing a known rotated shape creates one target from its asset', () => {
  const store = makeStore();
  store.currentLevel.activeCells.push([1, 1]);

  const result = store.addTargetFromCells([[1, 0], [1, 1]]);

  assert.equal(result.ok, true);
  assert.deepEqual(store.currentLevel.targets, [{
    id: 'target-1',
    assetId: 'domino',
    transform: 'R90',
    variant: 'R90',
    origin: [1, 0],
    shape: [[0, 0], [1, 0]],
    solutionCells: [[1, 0], [1, 1]]
  }]);
  assert.equal(store.history.length, 1);
});

test('drawing an unknown shape is cancelled without changing history', () => {
  const store = makeStore();

  const result = store.addTargetFromCells([[0, 0], [1, 0], [2, 0]]);

  assert.deepEqual(result, { ok: false, reason: 'unknown-shape' });
  assert.deepEqual(store.currentLevel.targets, []);
  assert.equal(store.history.length, 0);
});

test('drawing over an existing target atomically replaces it', () => {
  const store = makeStore();
  assert.equal(store.addTargetFromCells([[0, 0], [1, 0]]).ok, true);

  const result = store.addTargetFromCells([[1, 0], [2, 0]]);

  assert.equal(result.ok, true);
  assert.equal(store.currentLevel.targets.length, 1);
  assert.equal(store.currentLevel.targets[0].id, 'target-1');
  assert.deepEqual(store.currentLevel.targets[0].solutionCells, [[1, 0], [2, 0]]);
  assert.equal(store.history.length, 2);
});

test('unknown redraw leaves intersecting targets unchanged', () => {
  const store = makeStore();
  store.currentLevel.targets = [{ id: 'target-4', assetId: 'domino', shape: [[0, 0], [1, 0]], solutionCells: [[0, 0], [1, 0]] }];
  const before = structuredClone(store.currentLevel.targets);

  const result = store.addTargetFromCells([[0, 0], [1, 0], [2, 0]]);

  assert.deepEqual(result, { ok: false, reason: 'unknown-shape' });
  assert.deepEqual(store.currentLevel.targets, before);
  assert.equal(store.history.length, 0);
});

test('cropping removes empty cells but preserves target and fixed-flower cells', () => {
  const store = makeStore();
  store.currentLevel.activeCells.push([0, 1]);
  store.currentLevel.targets = [{ id: 'target-1', assetId: 'domino', shape: [[0, 0], [1, 0]], solutionCells: [[0, 0], [1, 0]] }];
  store.currentLevel.given.fixedFlowers = [{ cell: [2, 0], color: 'coral' }];

  assert.equal(store.cropEmptyCells(), true);

  assert.deepEqual(store.currentLevel.activeCells, [[0, 0], [1, 0], [2, 0]]);
});

test('restoring cells rebuilds the complete board without changing targets', () => {
  const store = makeStore();
  store.currentLevel.activeCells = [[1, 0]];
  const targets = structuredClone(store.currentLevel.targets);

  assert.equal(store.restoreAllCells(), true);

  assert.deepEqual(store.currentLevel.activeCells, [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1]
  ]);
  assert.deepEqual(store.currentLevel.targets, targets);
});

test('placing given items is restricted to active cells and replaces the item on that cell', () => {
  const store = makeStore();
  store.currentLevel.targets = [{ solutionCells: [[0, 0], [1, 0]] }];

  assert.equal(store.placeGiven(4, 'preset-pot'), false);
  assert.equal(store.placeGiven(1, 'preset-pot'), true);
  assert.deepEqual(store.currentLevel.given, { fixedFlowers: [], presetPots: [{ cell: [1, 0] }] });

  assert.equal(store.placeGiven(1, 'fixed-flower'), false);
  assert.equal(store.placeGiven(2, 'fixed-flower'), true);
  assert.deepEqual(store.currentLevel.given, { fixedFlowers: [{ cell: [2, 0], color: 'coral' }], presetPots: [{ cell: [1, 0] }] });

  store.selectedCell = 2;
  store.updateCell('active');
  assert.deepEqual(store.currentLevel.given, { fixedFlowers: [], presetPots: [{ cell: [1, 0] }] });
});

test('a preset pot may occupy a one-cell target', () => {
  const store = makeStore();
  store.currentLevel.targets = [{ solutionCells: [[0, 0]] }];

  assert.equal(store.placeGiven(0, 'preset-pot'), true);
  assert.deepEqual(store.currentLevel.given.presetPots, [{ cell: [0, 0] }]);
});

test('preset pots are toggled in one batch only on authored target cells', () => {
  const store = makeStore();
  store.currentLevel.targets = [{ solutionCells: [[0, 0], [1, 0], [2, 0]] }];

  assert.equal(store.togglePresetPots([[0, 0], [1, 0]]), true);
  assert.deepEqual(store.currentLevel.given.presetPots, [{ cell: [0, 0] }, { cell: [1, 0] }]);
  assert.equal(store.history.length, 1);
  assert.equal(store.togglePresetPots([[0, 0], [1, 0]]), true);
  assert.deepEqual(store.currentLevel.given.presetPots, []);
  assert.equal(store.history.length, 2);
});

test('preset pot selection may fill exactly one target but cannot cross targets', () => {
  const store = makeStore();
  store.currentLevel.targets = [
    { solutionCells: [[0, 0], [1, 0]] },
    { solutionCells: [[2, 0], [2, 1]] }
  ];

  assert.equal(store.togglePresetPots([[0, 0], [1, 0]]), true, 'the whole target may be preset');
  assert.equal(store.togglePresetPots([[0, 0], [2, 0]]), false, 'selection cannot cross targets');
  assert.equal(store.history.length, 1);
});

test('removing a cell also removes its given item and connected fences', () => {
  const store = makeStore();
  store.currentLevel.given = { fixedFlowers: [{ cell: [1, 0], color: 'coral' }], presetPots: [] };
  store.currentLevel.fences = [{ a: [0, 0], b: [1, 0], role: 'challenge' }];

  store.paintCell(1, 'empty');

  assert.deepEqual(store.currentLevel.activeCells, [[0, 0], [2, 0]]);
  assert.deepEqual(store.currentLevel.given, { fixedFlowers: [], presetPots: [] });
  assert.deepEqual(store.currentLevel.fences, []);
});

test('fences toggle only between adjacent existing cells', () => {
  const store = makeStore();

  assert.equal(store.toggleFence(0, 2), false);
  assert.equal(store.toggleFence(0, 1), true);
  assert.deepEqual(store.currentLevel.fences, [{ a: [0, 0], b: [1, 0], role: 'challenge' }]);

  assert.equal(store.toggleFence(1, 0), true);
  assert.deepEqual(store.currentLevel.fences, []);
});

test('saving removes legacy tutorial and difficulty fields from level files', async () => {
  const writes = new Map();
  const store = new EditorStore({
    config: { defaults: { boardWidth: 1, boardHeight: 1 } },
    assets: { categories: [{ id: 'shapes', items: [{ id: 'single', cells: [[0, 0]] }] }] },
    levels: [{
      id: 1,
      name: 'legacy',
      width: 1,
      height: 1,
      activeCells: [[0, 0]],
      given: { fixedFlowers: [], presetPots: [] },
      fences: [],
      targets: [{ id: 'target-1', assetId: 'single', color: 'red', shape: [[0, 0]], solutionCells: [[0, 0]] }],
      tutorial: { text: 'old' },
      difficulty: { score: 999 },
      filePath: 'level/level-1.json'
    }],
    files: {
      async mkdir() {},
      async writeBase64() {},
      async writeText(path, content) { writes.set(path, content); },
      async remove() {}
    }
  });

  await store.save();

  const saved = JSON.parse(writes.get('level/level-1.json'));
  assert.equal(Object.hasOwn(saved, 'tutorial'), false);
  assert.equal(Object.hasOwn(saved, 'difficulty'), false);
});

test('loading legacy pots migrates them to given and saving removes the old field', async () => {
  const writes = new Map();
  const store = new EditorStore({
    config: { defaults: { boardWidth: 3, boardHeight: 1 } },
    assets: { categories: [{ items: [{ id: 'domino' }] }] },
    levels: [{
      id: 1, width: 3, height: 1, activeCells: [[0, 0], [1, 0], [2, 0]],
      pots: [{ cell: [0, 0], state: 'flower', color: 'rose' }, { cell: [1, 0], state: 'empty' }],
      targets: [{ id: 'pair', assetId: 'domino', shape: [[0, 0], [1, 0]], solutionCells: [[1, 0], [2, 0]] }],
      fences: [], filePath: 'level/level-1.json'
    }],
    files: {
      async mkdir() {}, async writeBase64() {},
      async writeText(path, content) { writes.set(path, content); },
      async remove() {}
    }
  });

  assert.deepEqual(store.currentLevel.given, {
    fixedFlowers: [{ cell: [0, 0], color: 'rose' }],
    presetPots: [{ cell: [1, 0] }]
  });
  await store.save();
  assert.equal(Object.hasOwn(JSON.parse(writes.get('level/level-1.json')), 'pots'), false);
});
