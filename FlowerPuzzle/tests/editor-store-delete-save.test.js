import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../static/js/editor-store.js';
import { validateLevel } from '../gamelogic.js';

function makeStore() {
  const writes = new Map();
  const store = new EditorStore({
    config: {},
    assets: { categories: [{ items: [
      { id: 'I3', type: 'shape', cells: [[0, 0], [1, 0], [2, 0]] },
      { id: 'single', type: 'shape', cells: [[0, 0]] }
    ] }] },
    levels: [{
      id: 51, name: 'new level', width: 4, height: 2,
      activeCells: [[0, 0], [1, 0], [2, 0], [3, 1]],
      targets: [
        { id: 'target-2', assetId: 'I3', shape: [[0, 0], [1, 0], [2, 0]], solutionCells: [[0, 0], [1, 0], [2, 0]] },
        { id: 'target-3', assetId: 'single', shape: [[0, 0]], solutionCells: [[3, 1]] }
      ],
      given: { fixedFlowers: [], presetPots: [{ cell: [0, 0] }, { cell: [2, 0] }] },
      fences: [{ a: [0, 0], b: [1, 0], role: 'challenge' }]
    }],
    files: {
      async mkdir() {},
      async writeText(path, content) { writes.set(path, content); }
    }
  });
  return { store, writes };
}

test('deleting the middle of a flower removes its whole target and orphaned preset pots', () => {
  const { store } = makeStore();
  const before = structuredClone(store.currentLevel);

  assert.equal(store.paintCell(1, 'empty'), true);

  assert.deepEqual(store.currentLevel.targets, [before.targets[1]]);
  assert.deepEqual(store.currentLevel.activeCells, [[0, 0], [2, 0], [3, 1]]);
  assert.deepEqual(store.currentLevel.given.presetPots, []);
  assert.deepEqual(store.currentLevel.fences, []);
  store.undo();
  assert.deepEqual(store.currentLevel, before);
  store.redo();
  assert.deepEqual(store.currentLevel.targets, [before.targets[1]]);
});

test('deleting a whole flower and cropping leaves a level that saves and reloads', async () => {
  const { store, writes } = makeStore();
  store.paintCell(1, 'empty');
  store.cropEmptyCells();

  await store.save();

  const saved = JSON.parse(writes.get('level/level-51.json'));
  assert.deepEqual(saved.activeCells, [[3, 1]]);
  assert.deepEqual(saved.targets.map(target => target.id), ['target-3']);
  assert.deepEqual(validateLevel(saved, store.assets), []);
  assert.equal(store.dirty, false);
});

test('deleting the last cell of a target does not leave an empty solution blocking save', async () => {
  const { store, writes } = makeStore();
  // This test isolates deletion; the shared fixture's internal fence is intentionally invalid.
  store.currentLevel.fences = [];
  store.paintCell(7, 'empty');

  await store.save();

  const saved = JSON.parse(writes.get('level/level-51.json'));
  assert.deepEqual(saved.targets.map(target => target.id), ['target-2']);
  assert.deepEqual(validateLevel(saved, store.assets), []);
});

test('shrinking the board removes clipped targets atomically and supports undo', async () => {
  const { store, writes } = makeStore();
  store.currentLevel.targets[0].solutionCells = [[1, 0], [2, 0], [3, 0]];
  store.currentLevel.targets[1].solutionCells = [[0, 1]];
  store.currentLevel.activeCells = [[1, 0], [2, 0], [3, 0], [0, 1]];
  store.currentLevel.given = { fixedFlowers: [], presetPots: [{ cell: [2, 0] }] };
  store.currentLevel.fences = [{ a: [2, 0], b: [3, 0], role: 'hint' }];
  const before = structuredClone(store.currentLevel);

  store.resizeLevel(3, 2);

  assert.deepEqual(store.currentLevel.targets, [before.targets[1]]);
  assert.deepEqual(store.currentLevel.activeCells, [[1, 0], [2, 0], [0, 1]]);
  assert.deepEqual(store.currentLevel.given.presetPots, []);
  assert.deepEqual(store.currentLevel.fences, []);
  store.undo();
  assert.deepEqual(store.currentLevel, before);
  store.redo();
  store.cropEmptyCells();
  await store.save();
  assert.deepEqual(validateLevel(JSON.parse(writes.get('level/level-51.json')), store.assets), []);
});

test('expanding a board preserves intact targets and their preset pots', () => {
  const { store } = makeStore();
  const before = structuredClone(store.currentLevel);

  store.resizeLevel(5, 3);

  assert.deepEqual(store.currentLevel, { ...before, width: 5, height: 3 });
});

test('saving still rejects disconnected targets without writing any files', async () => {
  const { store, writes } = makeStore();
  store.currentLevel.targets[0].solutionCells = [[0, 0], [2, 0]];

  await assert.rejects(store.save(), /target-2/);

  assert.equal(writes.size, 0);
});
