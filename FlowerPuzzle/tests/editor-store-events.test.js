import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../static/js/editor-store.js';

const level = id => ({
  id,
  width: 2,
  height: 2,
  activeCells: [[0, 0], [1, 0], [0, 1], [1, 1]],
  given: { fixedFlowers: [], presetPots: [] },
  targets: [],
  fences: []
});

test('selection events identify the lightweight editor update they need', () => {
  const store = new EditorStore({
    config: { defaults: { boardWidth: 2, boardHeight: 2 } },
    assets: { categories: [{ id: 'shape', items: [
      { id: 'domino', type: 'shape', cells: [[0, 0], [1, 0]] },
      { id: 'L3', type: 'shape', cells: [[0, 0], [0, 1], [1, 1]] }
    ] }] },
    levels: [level(1), level(2)]
  });
  const reasons = [];
  store.subscribe((_state, reason) => reasons.push(reason));

  store.selectLevel(2);
  store.selectCell(3);
  store.selectAsset('L3');
  store.updateLevel({ name: '已修改' });

  assert.deepEqual(reasons, ['level-selection', 'cell-selection', 'asset-selection', 'data']);
});
