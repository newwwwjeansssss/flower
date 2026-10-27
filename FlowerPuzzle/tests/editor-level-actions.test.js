import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../static/js/editor-store.js';
import { addLevelForEditing, openLevelInspector } from '../static/js/editor-level-actions.js';

test('adding a level selects it and requests edit mode', () => {
  const store = new EditorStore({
    config: { defaults: { boardWidth: 2, boardHeight: 2 } },
    assets: { categories: [] },
    levels: [{ id: 4, width: 1, height: 1, activeCells: [[0, 0]], given: { fixedFlowers: [], presetPots: [] }, fences: [], targets: [] }]
  });

  const nextMode = addLevelForEditing(store);

  assert.equal(store.currentLevelId, 5);
  assert.equal(nextMode, 'edit');
});

test('double-clicking a level selects it and activates the level inspector tab', () => {
  const selected = [];
  const store = { selectLevel(id) { selected.push(id); } };
  const makeNode = dataset => ({ dataset, active: false, classList: { toggle(_name, value) { this.owner.active = value; }, owner: null } });
  const tabs = ['global', 'level', 'element'].map(tab => makeNode({ tab }));
  const panels = ['global', 'level', 'element'].map(panel => makeNode({ panel }));
  [...tabs, ...panels].forEach(node => { node.classList.owner = node; });

  openLevelInspector(store, '12', tabs, panels);

  assert.deepEqual(selected, ['12']);
  assert.deepEqual(tabs.map(node => node.active), [false, true, false]);
  assert.deepEqual(panels.map(node => node.active), [false, true, false]);
});
