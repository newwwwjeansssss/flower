import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');

test('level selection uses an incremental list update instead of rebuilding every card', () => {
  assert.match(source, /function renderLevels\(reason/);
  assert.match(source, /reason===['"]level-selection['"]/);
  assert.match(source, /syncActiveLevelCard\(/);
  assert.doesNotMatch(source, /function render\([^)]*\)\s*\{\s*renderLevels\(\)/);
});

test('level thumbnails are rendered lazily near the visible scroll area', () => {
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /rootMargin\s*:\s*['"]240px 0px['"]/);
  assert.match(source, /thumbnailObserver\.observe\(/);
});

test('rendered thumbnails are versioned so unchanged canvases are not redrawn', () => {
  assert.match(source, /dataset\.thumbnailKey/);
  assert.match(source, /if\(canvas\.dataset\.thumbnailKey===thumbnailKey/);
});

test('replacing an edited card releases its old lazy-thumbnail observation', () => {
  assert.match(source, /function replaceLevelCard\([\s\S]*?thumbnailObserver\?\.unobserve\(card\)/);
});

test('the resource library is cached between unrelated level selections', () => {
  assert.match(source, /assetLibraryKey/);
  assert.match(source, /if\(nextKey===assetLibraryKey\)return/);
});
