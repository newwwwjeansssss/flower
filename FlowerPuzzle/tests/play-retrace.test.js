import test from 'node:test';
import assert from 'node:assert/strict';
import * as gameLogic from '../gamelogic.js';

const crossCells = [[1, 1], [1, 0], [2, 1], [1, 2], [0, 1]];
const crossRoute = [[1, 1], [1, 0], [1, 1], [2, 1], [1, 1], [1, 2], [1, 1], [0, 1], [1, 1], [1, 0]];
const crossLevel = {
  id: 1, width: 3, height: 3, activeCells: crossCells,
  targets: [{ id: 'cross', shape: crossCells, solutionCells: crossCells }],
  given: { fixedFlowers: [], presetPots: [] }, fences: []
};

async function withRuntime(run) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {}, FlowerGameLogic: gameLogic };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?retrace=${Date.now()}-${Math.random()}`);
    await run(globalThis.window.FlowerPuzzleRuntime);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
}

test('a play stroke may repeatedly retrace its own cells to reach every branch', () => {
  const path = [];
  for (const cell of crossRoute) {
    assert.deepEqual(gameLogic.canExtendPath(path, cell, {}, crossLevel), { ok: true });
    path.push(cell);
  }
});

test('returning to an earlier cell still requires adjacency and an open fence edge', () => {
  const level = { activeCells: [[0, 0], [1, 0], [1, 1], [0, 1]], fences: [] };
  assert.deepEqual(gameLogic.canExtendPath([[0, 0], [1, 0], [1, 1]], [0, 0], {}, level),
    { ok: false, reason: 'disconnected' });
  level.fences.push({ a: [0, 1], b: [0, 0], role: 'challenge' });
  assert.deepEqual(gameLogic.canExtendPath([[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0], {}, level),
    { ok: false, reason: 'fence' });
});

test('repeated visits produce exactly five cells and complete a cross target', async () => {
  await withRuntime(runtime => {
    const state = runtime.createGameState(crossLevel);
    runtime.beginStroke(state, crossRoute[0]);
    crossRoute.slice(1).forEach(cell => runtime.extendStroke(state, cell));
    assert.deepEqual(state.draftPath, crossRoute);
    runtime.commitStroke(state);
    assert.equal(state.shapes.length, 1);
    assert.deepEqual(state.shapes[0].cells, crossCells);
    assert.deepEqual(state.completedTargetIds, ['cross']);
    assert.equal(state.status, 'blooming');
  });
});

test('retrace also works while extending preset pots without duplicating them', async () => {
  await withRuntime(runtime => {
    const level = { ...crossLevel, given: { fixedFlowers: [], presetPots: [{ cell: [1, 1] }, { cell: [1, 0] }] } };
    const state = runtime.createGameState(level);
    const presetId = state.shapes[0].id;
    runtime.beginStroke(state, crossRoute[0]);
    crossRoute.slice(1).forEach(cell => runtime.extendStroke(state, cell));
    runtime.commitStroke(state);
    assert.equal(state.shapes.length, 1);
    assert.equal(state.shapes[0].id, presetId);
    assert.deepEqual(state.shapes[0].cells, crossCells);
    assert.deepEqual(state.shapes[0].givenCells, [[1, 1], [1, 0]]);
    assert.deepEqual(state.completedTargetIds, ['cross']);
  });
});

test('retrace cannot enter another shape, a fixed flower, or an inactive cell', async () => {
  await withRuntime(runtime => {
    const state = runtime.createGameState({
      width: 3, height: 2, activeCells: [[0, 0], [1, 0], [2, 0], [1, 1]], targets: [], fences: [],
      given: { fixedFlowers: [{ cell: [1, 1], color: 'rose' }], presetPots: [] }
    });
    state.shapes.push({ id: 'other', cells: [[2, 0]], status: 'pots' });
    runtime.beginStroke(state, [0, 0]);
    runtime.extendStroke(state, [1, 0]);
    runtime.extendStroke(state, [0, 0]);
    runtime.extendStroke(state, [1, 0]);
    const before = structuredClone(state.draftPath);
    runtime.extendStroke(state, [2, 0]);
    runtime.extendStroke(state, [1, 1]);
    runtime.extendStroke(state, [1, -1]);
    assert.deepEqual(state.draftPath, before);
    assert.deepEqual(before, [[0, 0], [1, 0], [0, 0], [1, 0]]);
  });
});

test('pointer dragging can retrace several old cells in one move and then turn into a branch', async () => {
  await withRuntime(runtime => {
    const cells = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]];
    const state = runtime.createGameState({
      width: 3, height: 3, activeCells: cells, given: { fixedFlowers: [], presetPots: [] }, fences: [],
      targets: [{ id: 'corner', shape: cells, solutionCells: cells }]
    });
    const handlers = new Map();
    const canvas = {
      style: {},
      addEventListener(name, handler) { handlers.set(name, handler); },
      removeEventListener(name) { handlers.delete(name); },
      setPointerCapture() {}, releasePointerCapture() {}
    };
    const unbind = runtime.bindPointerEvents(canvas, state, event => event.cell);
    const send = (name, cell) => handlers.get(name)({ pointerId: 1, cell, preventDefault() {} });
    send('pointerdown', [0, 0]);
    send('pointermove', [2, 0]);
    send('pointermove', [0, 0]);
    send('pointermove', [0, 2]);
    send('pointerup', [0, 2]);
    assert.deepEqual(state.shapes[0].cells, cells);
    assert.deepEqual(state.completedTargetIds, ['corner']);
    assert.equal(state.status, 'blooming');
    unbind();
  });
});
