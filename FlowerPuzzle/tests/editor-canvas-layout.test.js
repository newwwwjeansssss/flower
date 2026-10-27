import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../static/css/editor.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('game frame is constrained by both viewport dimensions without cropping', () => {
  const rule = /\.game-frame\{([^}]*)\}/g;
  const matches = [...css.matchAll(rule)];
  const effective = matches.at(-1)?.[1] || '';
  assert.match(effective, /max-width\s*:\s*100%/);
  assert.match(effective, /max-height\s*:\s*100%/);
  assert.match(effective, /aspect-ratio\s*:\s*390\s*\/\s*844/);
  assert.match(effective, /overflow\s*:\s*visible/);
});

test('playfield keeps symmetric outer gutters so the board is centered', () => {
  const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');
  assert.match(source, /computeBoardLayout\(\{x:28,y:152,width:334,height:540\}/);
});

test('canvas fills the constrained frame instead of using a competing ratio', () => {
  const rule = /#game-canvas\{([^}]*)\}/g;
  const combined = [...css.matchAll(rule)].map(match => match[1]).join(';');
  assert.match(combined, /width\s*:\s*100%/);
  assert.match(combined, /height\s*:\s*100%/);
});

test('hint action is immediately before the edit action', () => {
  assert.match(html, /class="canvas-actions"[^>]*>\s*<button id="play-hint"[\s\S]*?<button id="edit-toggle"/);
});

test('hint action is hidden while editing', () => {
  assert.match(css, /\.canvas-area\.editing #play-hint\{[^}]*display\s*:\s*none/);
});

test('editing tools are hidden until edit mode is active', () => {
  assert.match(css, /\.canvas-area:not\(\.editing\) \.canvas-tools\{[^}]*display\s*:\s*none/);
});

test('cell editing is exposed through a context menu instead of a top toolbar', () => {
  assert.doesNotMatch(html, /class="canvas-tools"/);
  assert.match(html, /id="cell-context-menu"[^>]*hidden/);
  assert.match(html, /data-fence-direction="up"/);
  assert.match(html, /data-fence-direction="down"/);
  assert.match(html, /data-fence-direction="left"/);
  assert.match(html, /data-fence-direction="right"/);
});

test('completion result is a centered modal over the flower canvas', () => {
  const rules = [...css.matchAll(/\.play-result\{([^}]*)\}/g)];
  const effective = rules.at(-1)?.[1] || '';
  assert.match(effective, /inset\s*:\s*0/);
  assert.match(effective, /display\s*:\s*grid/);
  assert.match(effective, /place-items\s*:\s*center/);
  assert.match(effective, /background\s*:\s*rgba\(/);
  assert.match(html, /id="result-title">花田盛开啦！</);
});

test('game logic module is not loaded as a classic script before the play runtime', () => {
  assert.doesNotMatch(html, /<script src="\.\.\/gamelogic\.js/);
});

test('editor exposes the imported game logic to the play runtime', () => {
  const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');
  assert.match(source, /import \* as gameLogic from "\.\.\/\.\.\/gamelogic\.js(?:\?v=[^"\s]+)?"/);
  assert.match(source, /window\.FlowerGameLogic\s*=\s*gameLogic/);
});

test('play animation frames use the same wall-clock time as shape creation', () => {
  const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');
  assert.match(source, /requestAnimationFrame\(\(\)=>paintPlay\(Date\.now\(\)\)\)/);
  assert.doesNotMatch(source, /requestAnimationFrame\(paintPlay\)/);
});

test('level thumbnails use the same scene renderer as the editor canvas', () => {
  const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');
  assert.match(source, /function renderLevelThumbnail\(/);
  assert.match(source, /renderEditorScene\(runtime,context,level,layout,store\.assets\)/);
  assert.match(source, /forEach\(renderLevelThumbnail\)/);
});

test('edit mode renders with the loaded asset palette', () => {
  const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');

  assert.match(source, /renderEditorScene\(runtime,ctx,store\.currentLevel,layout,store\.assets\)/);
});

test('given selection uses the shared region outline renderer', () => {
  const source = fs.readFileSync(new URL('../static/js/editor.js', import.meta.url), 'utf8');

  assert.match(source, /runtime\.drawCellRegionBorder\(ctx,givenSelection,layout,'#f5c451'\)/);
});

test('level list occupies a fixed 230 pixel workspace column', () => {
  assert.match(css, /--level-list-width\s*:\s*230px/);
  const responsiveRules = css.slice(css.lastIndexOf('.workspace{--level-list-width:230px'));
  const columns = [...responsiveRules.matchAll(/\.workspace\{[^}]*grid-template-columns:([^;}]+)/g)].map(match => match[1]);
  assert.equal(columns.length, 4);
  columns.forEach(value => assert.match(value, /^var\(--level-list-width\)\s/));
});

test('asset library does not expose an add action', () => {
  assert.doesNotMatch(html, /id="add-asset"/);
});
