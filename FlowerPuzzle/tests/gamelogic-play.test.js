import test from 'node:test';
import assert from 'node:assert/strict';
import { canExtendPath, canonicalShape, createEmptyLevel, getHint, matchTarget } from '../gamelogic.js';

const level = {
  activeCells: [[0, 0], [1, 0], [1, 1]],
  targets: [{ id: 'corner', shape: [[0, 0], [1, 0], [1, 1]], solutionCells: [[0, 0], [1, 0], [1, 1]] }]
};

test('play path accepts adjacent active cells and rejects disconnected cells', () => {
  assert.deepEqual(canExtendPath([[0, 0]], [1, 0], { occupiedCells: [] }, level), { ok: true });
  assert.equal(canExtendPath([[0, 0]], [1, 1], { occupiedCells: [] }, level).ok, false);
});

test('play path rejects crossing fences in either direction and orientation', () => {
  const fencedLevel = {
    activeCells: [[0, 0], [1, 0], [0, 1]],
    fences: [
      { a: [0, 0], b: [1, 0], role: 'hint' },
      { a: [0, 0], b: [0, 1], role: 'challenge' }
    ]
  };

  assert.deepEqual(
    canExtendPath([[0, 0]], [1, 0], { occupiedCells: [] }, fencedLevel),
    { ok: false, reason: 'fence' }
  );
  assert.deepEqual(
    canExtendPath([[1, 0]], [0, 0], { occupiedCells: [] }, fencedLevel),
    { ok: false, reason: 'fence' }
  );
  assert.deepEqual(
    canExtendPath([[0, 0]], [0, 1], { occupiedCells: [] }, fencedLevel),
    { ok: false, reason: 'fence' }
  );
});

test('play path matches targets regardless of rotation', () => {
  assert.equal(canonicalShape([[0, 0], [1, 0], [1, 1]]), canonicalShape([[0, 0], [0, 1], [-1, 1]]));
  assert.equal(matchTarget([[0, 0], [1, 0], [1, 1]], level.targets, [])?.id, 'corner');
});

test('hint returns the solution for the first unfinished target', () => {
  assert.deepEqual(getHint(level, { completedTargetIds: [], shapes: [] }), {
    type: 'draw',
    targetId: 'corner',
    cells: [[0, 0], [1, 0], [1, 1]]
  });
});

test('new levels contain only persistent gameplay fields', () => {
  const created = createEmptyLevel({ id: 7, config: { defaults: { boardWidth: 2, boardHeight: 3 } } });

  assert.equal(Object.hasOwn(created, 'tutorial'), false);
  assert.equal(Object.hasOwn(created, 'difficulty'), false);
});
