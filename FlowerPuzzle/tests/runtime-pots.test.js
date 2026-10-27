import test from 'node:test';
import assert from 'node:assert/strict';
import * as gameLogic from '../gamelogic.js';

test('play state starts with editable preset pots and immutable fixed flowers', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {}, FlowerGameLogic: gameLogic };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?pots=${Date.now()}`);
    const state = globalThis.window.FlowerPuzzleRuntime.createGameState({
      activeCells: [[0, 0], [1, 0]],
      given: {
        presetPots: [{ cell: [0, 0] }],
        fixedFlowers: [{ cell: [1, 0], color: 'rose' }]
      },
      targets: [], fences: []
    });
    assert.deepEqual(state.shapes.map(({ cells, status }) => ({ cells, status })), [
      { cells: [[0, 0]], status: 'pots' },
      { cells: [[1, 0]], status: 'fixed-flowers' }
    ]);
    globalThis.window.FlowerPuzzleRuntime.deleteShapeAt(state, [1, 0]);
    assert.equal(state.shapes.length, 2, 'fixed flowers cannot be deleted');
    globalThis.window.FlowerPuzzleRuntime.beginStroke(state, [1, 0]);
    assert.deepEqual(state.draftPath, [], 'fixed flowers cannot be redrawn');
    globalThis.window.FlowerPuzzleRuntime.beginStroke(state, [0, 0]);
    assert.deepEqual(state.draftPath, [[0, 0]], 'preset pots can be extended');
    state.shapes[0].cells.push([0, 1]);
    globalThis.window.FlowerPuzzleRuntime.deleteShapeAt(state, [0, 1]);
    assert.deepEqual(state.shapes[0].cells, [[0, 0]], 'resetting a preset shape keeps its authored starting pot');
    const commands = [];
    const context = new Proxy({}, {
      get(_target, name) {
        if (['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','globalAlpha'].includes(name)) return undefined;
        return (...args) => commands.push([name, ...args]);
      },
      set(_target, name, value) { commands.push(['set', name, value]); return true; }
    });
    globalThis.window.FlowerPuzzleRuntime.renderScene(context, state, {
      x: 0, y: 0, width: 200, height: 100, cellSize: 100, originX: 0, originY: 0
    }, null, 1000);
    assert.ok(commands.filter(([name]) => name === 'ellipse').length >= 7, 'flower pot renders all five petals');
    assert.ok(commands.some(([name]) => name === 'translate'), 'full flower blossom is rendered');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('adjacent given cells expose only their shared outer boundary', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {}, FlowerGameLogic: gameLogic };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?given-boundary=${Date.now()}`);
    const edges = globalThis.window.FlowerPuzzleRuntime.givenBoundaryEdges([[0, 0], [1, 0]]);

    assert.equal(edges.length, 6);
    assert.equal(edges.some(edge => edge[0][0] === 1 && edge[1][0] === 1), false, 'shared edge is omitted');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('board layout keeps the full level grid so edit and play coordinates match', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {} };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?layout=${Date.now()}`);
    const layout = globalThis.window.FlowerPuzzleRuntime.computeBoardLayout(
      { x: 0, y: 0, width: 300, height: 300 },
      { width: 3, height: 3, activeCells: [[1, 1]] }
    );
    assert.deepEqual(
      { width: layout.width, height: layout.height, originX: layout.originX, originY: layout.originY },
      { width: 300, height: 300, originX: 0, originY: 0 }
    );
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('preset pot cells in the same target start as one resumable shape', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {}, FlowerGameLogic: gameLogic };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?grouped-preset=${Date.now()}`);
    const state = globalThis.window.FlowerPuzzleRuntime.createGameState({
      activeCells: [[0, 0], [1, 0], [2, 0]],
      given: { fixedFlowers: [], presetPots: [{ cell: [0, 0] }, { cell: [1, 0] }] },
      targets: [{ id: 'line', shape: [[0, 0], [1, 0], [2, 0]], solutionCells: [[0, 0], [1, 0], [2, 0]] }],
      fences: []
    });

    assert.equal(state.shapes.length, 1);
    assert.deepEqual(state.shapes[0].cells, [[0, 0], [1, 0]]);
    globalThis.window.FlowerPuzzleRuntime.deleteShapeAt(state, [1, 0]);
    assert.deepEqual(state.shapes[0].cells, [[0, 0], [1, 0]]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('starting another stroke on a drawn cell removes its whole shape', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {}, FlowerGameLogic: gameLogic };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?redraw-removes-shape=${Date.now()}`);
    const runtime = globalThis.window.FlowerPuzzleRuntime;
    const state = runtime.createGameState({
      activeCells: [[0, 0], [1, 0], [2, 0]],
      given: { fixedFlowers: [], presetPots: [] },
      targets: [{ id: 'line', shape: [[0, 0], [1, 0]], solutionCells: [[0, 0], [1, 0]] }],
      fences: []
    }, { shuffleColors: false });
    state.shapes.push({
      id: 'shape-1', cells: [[0, 0], [1, 0]], targetId: 'line', color: 'coral', status: 'buds'
    });
    state.completedTargetIds.push('line');

    runtime.beginStroke(state, [1, 0]);

    assert.deepEqual(state.shapes, [], 'the complete shape containing the redrawn cell is removed');
    assert.deepEqual(state.completedTargetIds, [], 'the removed target becomes available again');
    assert.deepEqual(state.draftPath, [], 'redrawing a shape is a cancellation action, not a new draft');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('each game shuffles the flower color group once and assigns colors cyclically by target order', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {} };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?colors=${Date.now()}`);
    const level = {
      activeCells: [],
      given: { fixedFlowers: [], presetPots: [] },
      fences: [],
      targets: Array.from({ length: 8 }, (_, index) => ({ id: `target-${index + 1}`, shape: [[0, 0]] }))
    };

    const state = globalThis.window.FlowerPuzzleRuntime.createGameState(level, { random: () => 0 });

    assert.deepEqual(state.level.targets.map((target) => target.color), [
      'sun', 'lilac', 'sky', 'rose', 'mint', 'coral', 'sun', 'lilac'
    ]);
    assert.ok(level.targets.every((target) => !Object.hasOwn(target, 'color')), 'authored level remains color-free');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('game colors come from the flower color resources when they are available', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { addEventListener() {} };
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    await import(`../flower-runtime.js?asset-colors=${Date.now()}`);
    const level = {
      activeCells: [], given: { fixedFlowers: [], presetPots: [] }, fences: [],
      targets: [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
    };
    const assets = {
      categories: [{
        id: 'colors',
        items: [
          { id: 'red', type: 'flower-color', color: '#ff0000' },
          { id: 'blue', type: 'flower-color', color: '#0000ff' }
        ]
      }]
    };

    const state = globalThis.window.FlowerPuzzleRuntime.createGameState(level, { assets, random: () => 0 });

    assert.deepEqual(state.level.targets.map((target) => target.color), ['blue', 'red', 'blue']);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
