(function attachFlowerPlayer(root) {
  'use strict';

  const gameLogic = new Proxy({}, {
    get(_target, property) {
      const logic = (root && root.FlowerGameLogic)
        || (typeof require === 'function' ? require('./gamelogic.js') : null);
      return logic && logic[property];
    }
  });
  const PROGRESS_STORAGE_KEY = 'flower-field-progress-v1';
  const LEVEL_LIMIT = 50;
  const HINT_DURATION_MS = 2500;
  const FLOWER_COLOR_GROUP = ['coral', 'sun', 'lilac', 'sky', 'rose', 'mint'];

  function computeBoardLayout(viewport, level) {
    const originX = 0;
    const originY = 0;
    const columns = level.width;
    const rows = level.height;
    const cellSize = Math.min(viewport.width / columns, viewport.height / rows);
    const width = columns * cellSize;
    const height = rows * cellSize;

    return {
      x: viewport.x + (viewport.width - width) / 2,
      y: viewport.y + (viewport.height - height) / 2,
      width,
      height,
      cellSize,
      originX,
      originY
    };
  }

  function canvasPointToCell(point, layout, level) {
    if (
      point.x < layout.x || point.y < layout.y
      || point.x >= layout.x + layout.width || point.y >= layout.y + layout.height
    ) return null;

    const cell = [
      Math.floor((point.x - layout.x) / layout.cellSize) + (layout.originX || 0),
      Math.floor((point.y - layout.y) / layout.cellSize) + (layout.originY || 0)
    ];

    if (
      cell[0] < 0 || cell[0] >= level.width
      || cell[1] < 0 || cell[1] >= level.height
    ) return null;

    return (level.activeCells || []).some(([x, y]) => x === cell[0] && y === cell[1])
      ? cell
      : null;
  }

  function copyCell(cell) {
    return [cell[0], cell[1]];
  }

  function isCell(cell) {
    return Array.isArray(cell)
      && cell.length === 2
      && Number.isInteger(cell[0])
      && Number.isInteger(cell[1]);
  }

  function cellKey(cell) {
    return `${cell[0]},${cell[1]}`;
  }

  function sameCell(first, second) {
    return isCell(first) && isCell(second)
      && first[0] === second[0]
      && first[1] === second[1];
  }

  function occupiedCells(state) {
    return (state.shapes || []).flatMap((shape) => shape.cells || []);
  }

  function findShapeAt(state, cell) {
    if (!isCell(cell)) return null;
    const key = cellKey(cell);
    return [...(state.shapes || [])].reverse().find((shape) => (
      shape && (shape.cells || []).some((shapeCell) => cellKey(shapeCell) === key)
    )) || null;
  }

  function shuffledFlowerColors(random, sourceColors = FLOWER_COLOR_GROUP) {
    const colors = [...sourceColors];
    for (let index = colors.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [colors[index], colors[swapIndex]] = [colors[swapIndex], colors[index]];
    }
    return colors;
  }

  function createGameState(level, options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const configuredColors = (options.assets?.categories || [])
      .flatMap((category) => category.items || [])
      .filter((asset) => asset && asset.type === 'flower-color' && asset.id)
      .map((asset) => asset.id);
    const colorGroup = configuredColors.length ? configuredColors : FLOWER_COLOR_GROUP;
    const colors = options.shuffleColors === false ? [...colorGroup] : shuffledFlowerColors(random, colorGroup);
    const runtimeLevel = {
      ...level,
      targets: (level.targets || []).map((target, index) => ({
        ...target,
        color: colors[index % colors.length]
      }))
    };
    const presetPots = level.given?.presetPots || [];
    const fixedFlowers = level.given?.fixedFlowers || [];
    const groupedPresetCells = [];
    const assignedPresetCells = new Set();
    (level.targets || []).forEach((target) => {
      const solution = new Set((target.solutionCells || []).map(cellKey));
      const cells = presetPots.filter(pot => solution.has(cellKey(pot.cell))).map(pot => copyCell(pot.cell));
      if (cells.length) {
        groupedPresetCells.push(cells);
        cells.forEach(cell => assignedPresetCells.add(cellKey(cell)));
      }
    });
    presetPots.filter(pot => !assignedPresetCells.has(cellKey(pot.cell))).forEach(pot => groupedPresetCells.push([copyCell(pot.cell)]));
    const initialShapes = groupedPresetCells.map((cells, index) => ({
      id: `preset-pot-${index + 1}`,
      cells: cells.map(copyCell),
      targetId: null,
      color: 'terracotta',
      status: 'pots',
      givenCells: cells.map(copyCell),
      createdAt: 0
    })).concat(fixedFlowers.map((flower, index) => ({
      id: `fixed-flower-${index + 1}`,
      cells: [copyCell(flower.cell)],
      targetId: null,
      color: flower.color || 'coral',
      status: 'fixed-flowers',
      createdAt: 0
    })));
    return {
      level: runtimeLevel,
      obstacles: gameLogic.createObstacleState?.(runtimeLevel),
      clock: typeof options.clock === 'function' ? options.clock : Date.now,
      draftPath: [],
      editingShapeId: null,
      shapes: initialShapes,
      completedTargetIds: [],
      status: 'playing',
      hint: null,
      nextShapeId: initialShapes.length + 1
    };
  }

  function safeProgress(progress) {
    const source = progress && typeof progress === 'object' ? progress : {};
    const highestUnlocked = Number.isInteger(source.highestUnlocked)
      ? Math.min(Math.max(source.highestUnlocked, 1), LEVEL_LIMIT)
      : 1;
    const completed = Array.isArray(source.completed)
      ? [...new Set(source.completed.filter((id) => Number.isInteger(id) && id >= 1 && id <= LEVEL_LIMIT))]
        .sort((first, second) => first - second)
      : [];
    return { highestUnlocked, completed };
  }

  function isValidProgressSchema(progress) {
    return Boolean(progress)
      && typeof progress === 'object'
      && !Array.isArray(progress)
      && Number.isInteger(progress.highestUnlocked)
      && progress.highestUnlocked >= 1
      && progress.highestUnlocked <= LEVEL_LIMIT
      && Array.isArray(progress.completed)
      && progress.completed.every((id) => Number.isInteger(id) && id >= 1 && id <= LEVEL_LIMIT);
  }

  function readProgress(storage) {
    try {
      if (!storage || typeof storage.getItem !== 'function') return safeProgress();
      const raw = storage.getItem(PROGRESS_STORAGE_KEY);
      if (!raw) return safeProgress();
      const parsed = JSON.parse(raw);
      return isValidProgressSchema(parsed) ? safeProgress(parsed) : safeProgress();
    } catch (error) {
      return safeProgress();
    }
  }

  function writeProgress(storage, progress) {
    const safe = safeProgress(progress);
    try {
      if (storage && typeof storage.setItem === 'function') {
        storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(safe));
      }
    } catch (error) {
      // Progress is optional convenience data; a blocked quota must not stop play.
    }
    return safe;
  }

  function recordCompletion(progress, levelId) {
    const safe = safeProgress(progress);
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_LIMIT) return safe;
    return {
      highestUnlocked: Math.max(safe.highestUnlocked, Math.min(levelId + 1, LEVEL_LIMIT)),
      completed: [...new Set(safe.completed.concat(levelId))].sort((first, second) => first - second)
    };
  }

  function findLevel(levels, id) {
    return (levels || []).find((level) => level && level.id === id) || null;
  }

  function loadLevel(id, levels, progress) {
    const safe = safeProgress(progress);
    if (!Number.isInteger(id) || id < 1 || id > safe.highestUnlocked) return null;
    const level = findLevel(levels, id);
    return level ? createGameState(level) : null;
  }

  function loadTestLevel(id, levels) {
    if (!Number.isInteger(id) || id < 1 || id > LEVEL_LIMIT) return null;
    const level = findLevel(levels, id);
    return level ? createGameState(level) : null;
  }

  function retryLevel(state) {
    return state && state.level ? createGameState(state.level) : null;
  }

  function nextLevel(state, levels, progress) {
    if (!state || !state.level || state.level.id >= LEVEL_LIMIT) return null;
    return loadTestLevel(state.level.id + 1, levels);
  }

  function requestHint(state, now) {
    if (!state || !state.level || !gameLogic || typeof gameLogic.getHint !== 'function') return null;
    const hint = gameLogic.getHint(state.level, state);
    if (!hint) {
      state.hint = null;
      return null;
    }
    const blockingShape = hint.type === 'remove'
      ? (state.shapes || []).find((shape) => shape && shape.id === hint.shapeId)
      : null;
    state.hint = {
      ...hint,
      ...(blockingShape ? { shapeCells: (blockingShape.cells || []).map(copyCell) } : {}),
      startedAt: Number.isFinite(now) ? now : Date.now(),
      duration: HINT_DURATION_MS
    };
    return hint;
  }

  function createFlowController(options) {
    const settings = options || {};
    const levels = settings.levels || [];
    const storage = settings.storage;
    const clock = typeof settings.clock === 'function' ? settings.clock : Date.now;
    const setTimer = typeof settings.setTimeout === 'function' ? settings.setTimeout : setTimeout;
    const clearTimer = typeof settings.clearTimeout === 'function' ? settings.clearTimeout : clearTimeout;
    const onHintExpired = typeof settings.onHintExpired === 'function' ? settings.onHintExpired : () => {};
    let progress = readProgress(storage);
    let state = loadLevel(1, levels, progress) || (levels[0] ? createGameState(levels[0]) : null);
    let hintTimer = null;

    function clearHint() {
      if (hintTimer !== null) clearTimer(hintTimer.handle);
      hintTimer = null;
      if (state) state.hint = null;
    }

    function scheduleHintExpiry() {
      const currentHint = state && state.hint;
      if (!currentHint) return;
      const timerToken = { handle: null };
      hintTimer = timerToken;
      timerToken.handle = setTimer(() => {
        if (hintTimer !== timerToken) return;
        if (state && state.hint === currentHint) {
          state.hint = null;
          onHintExpired(state);
        }
        hintTimer = null;
      }, HINT_DURATION_MS);
    }

    return {
      getState: () => state,
      getProgress: () => progress,
      loadLevel(id) {
        const next = loadLevel(id, levels, progress);
        if (!next) return null;
        clearHint();
        state = next;
        return state;
      },
      loadTestLevel(id) {
        const next = loadTestLevel(id, levels);
        if (!next) return null;
        clearHint();
        state = next;
        return state;
      },
      retryLevel() {
        if (!state) return null;
        clearHint();
        state = retryLevel(state);
        return state;
      },
      nextLevel() {
        if (!state) return null;
        const next = nextLevel(state, levels, progress);
        if (!next) return null;
        clearHint();
        state = next;
        return state;
      },
      requestHint() {
        if (!state) return null;
        clearHint();
        const hint = requestHint(state, clock());
        if (hint) scheduleHintExpiry();
        return hint;
      },
      completeLevel() {
        if (!state || state.status !== 'complete') return progress;
        progress = writeProgress(storage, recordCompletion(progress, state.level.id));
        return progress;
      }
    };
  }

  function beginStroke(state, cell) {
    if (!state || state.status !== 'playing' || !isCell(cell) || !gameLogic) return state;

    gameLogic.tickObstacles?.(state,state.clock?.() ?? Date.now());
    const shape = state.level.overlapCells?.length ? null : findShapeAt(state, cell);
    if (gameLogic.shapeIsLocked?.(shape,state.clock?.() ?? Date.now()) || gameLogic.blockedByBrick?.(state,cell)) return state;
    if (shape && shape.status === 'fixed-flowers') return state;
    if (shape && shape.status !== 'pots') {
      deleteShapeAt(state, cell);
      state.draftPath = [];
      state.editingShapeId = null;
      return state;
    }
    state.editingShapeId = shape ? shape.id : null;
    const blocked = (state.shapes || [])
      .filter((candidate) => !shape || candidate.id !== shape.id)
      .flatMap((candidate) => candidate.cells || []);
    const allowed = gameLogic.canExtendPath([], cell, { occupiedCells: blocked }, state.level);
    if (allowed.ok) state.draftPath = [copyCell(cell)];
    else state.editingShapeId = null;
    return state;
  }

  function extendStroke(state, cell) {
    if (!state || state.status !== 'playing' || !state.draftPath.length || !isCell(cell) || !gameLogic) {
      return state;
    }

    if (gameLogic.shapeIsLocked?.((state.shapes||[]).find(s=>s.id===state.editingShapeId),state.clock?.() ?? Date.now()) || (gameLogic.obstaclePathAllowed && !gameLogic.obstaclePathAllowed(state,state.draftPath.at(-1),cell))) return state;
    const allowed = gameLogic.canExtendPath(
      state.draftPath,
      cell,
      { occupiedCells: (state.shapes || [])
        .filter((shape) => shape.id !== state.editingShapeId)
        .flatMap((shape) => shape.cells || []) },
      state.level
    );
    if (allowed.ok) state.draftPath.push(copyCell(cell));
    return state;
  }

  function hasCompleteCoverage(state) {
    const occupied = new Set(occupiedCells(state).map(cellKey));
    return (state.level.activeCells || []).every(cell => occupiedCells(state).filter(c=>sameCell(c,cell)).length === (gameLogic.overlapCapacity?.(state.level,cell)||1));
  }

  function syncTypeUsage(state) {
    state.completedTargetIds = [...new Set((state.shapes || []).filter(shape => shape.targetId && shape.status !== 'pots' && shape.status !== 'fixed-flowers').map(shape => shape.targetId))];
  }

  function updateCompletionStatus(state) {
    syncTypeUsage(state);
    const required = new Set((state.level.targets || []).map(target => gameLogic.canonicalShape(target.shape)));
    const drawn = (state.shapes || []).filter(shape => shape.status !== 'fixed-flowers');
    const used = new Set(drawn.filter(shape => shape.targetId && shape.status !== 'pots').map(shape => gameLogic.canonicalShape(shape.cells)));
    const valid = drawn.every(shape => shape.targetId && shape.status !== 'pots' && required.has(gameLogic.canonicalShape(shape.cells)));
    state.status = required.size > 0 && valid && [...required].every(type => used.has(type)) && hasCompleteCoverage(state) ? 'blooming' : 'playing';
  }

  function commitStroke(state) {
    if (!state) return state;
    const editingShape = (state.shapes || []).find((shape) => shape.id === state.editingShapeId) || null;
    const previousCells = new Set((editingShape?.cells||[]).map(cellKey));
    const mergedCells = (editingShape ? editingShape.cells : []).concat(state.draftPath || []);
    const seen = new Set();
    const cells = mergedCells.filter((cell) => {
      const key = cellKey(cell);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(copyCell);
    state.draftPath = [];
    state.editingShapeId = null;
    if (state.status !== 'playing' || cells.length < 2 || !gameLogic) return state;

    if (gameLogic.shapeIsLocked?.(editingShape,state.clock?.() ?? Date.now()) || (gameLogic.obstacleCellsAllowed && !gameLogic.obstacleCellsAllowed(state,cells))) return state;
    // A valid shape cannot enclose a wall, even if the drawn walk went around it.
    const keys=new Set(cells.map(cellKey));
    const crossesWall=(state.level.fences||[]).some(f=>keys.has(cellKey(f.a))&&keys.has(cellKey(f.b)));
    const target = crossesWall ? null : gameLogic.matchTarget(cells, state.level.targets, []);
    if(state.level.overlapCells?.length && (!target || cells.some(c=>(state.shapes||[]).filter(s=>s.id!==editingShape?.id&&s.cells.some(p=>sameCell(p,c))).length >= gameLogic.overlapCapacity(state.level,c))))return state;
    const shape = {
      id: editingShape ? editingShape.id : `shape-${state.nextShapeId}`,
      cells,
      targetId: target ? target.id : null,
      color: target ? target.color : 'terracotta',
      status: target ? 'buds' : 'pots',
      givenCells: editingShape?.givenCells,
      createdAt: Date.now()
    };

    if (editingShape) {
      state.shapes = state.shapes.map((candidate) => candidate === editingShape ? shape : candidate);
    } else {
      state.nextShapeId += 1;
      state.shapes.push(shape);
    }
    if (target) state.completedTargetIds.push(target.id);
    gameLogic.obstacleBlockChanged?.(state,shape,cells.filter(c=>!previousCells.has(cellKey(c))),state.clock?.() ?? Date.now());
    gameLogic.resolveObstacles?.(state);
    updateCompletionStatus(state);
    return state;
  }

  function deleteShapeAt(state, cell) {
    if (!state || !isCell(cell)) return state;
    const shape = findShapeAt(state, cell);
    if (!shape) return state;
    if (shape.status === 'fixed-flowers' || gameLogic.shapeIsLocked?.(shape,state.clock?.() ?? Date.now())) return state;
    gameLogic.obstacleBlockRemoved?.(state,shape);
    if (shape.givenCells?.length) {
      if (shape.targetId) state.completedTargetIds = state.completedTargetIds.filter((targetId) => targetId !== shape.targetId);
      shape.cells = shape.givenCells.map(copyCell);
      shape.targetId = null;
      shape.color = 'terracotta';
      shape.status = 'pots';
      gameLogic.resolveObstacles?.(state);
      syncTypeUsage(state);
      state.bloomSequence = null;
      state.status = 'playing';
      return state;
    }

    state.shapes = state.shapes.filter((candidate) => candidate !== shape);
    if (shape.targetId) {
      state.completedTargetIds = state.completedTargetIds.filter((targetId) => targetId !== shape.targetId);
    }
    gameLogic.resolveObstacles?.(state);
    syncTypeUsage(state);
    state.bloomSequence = null;
    state.status = 'playing';
    return state;
  }

  function interpolateAxisAligned(from, to) {
    if (!isCell(from) || !isCell(to) || (from[0] !== to[0] && from[1] !== to[1])) return [];
    const cells = [];
    const distance = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    const stepX = Math.sign(to[0] - from[0]);
    const stepY = Math.sign(to[1] - from[1]);
    for (let step = 1; step <= distance; step += 1) {
      cells.push([from[0] + stepX * step, from[1] + stepY * step]);
    }
    return cells;
  }

  const RENDER_CONFIG = {
    bloomStaggerMs: 45,
    bloomDurationMs: 650,
    growthDurationMs: 260,
    palettes: {
      coral: '#F47F72',
      sun: '#F5C451',
      lilac: '#A98AD9',
      sky: '#69B9DF',
      rose: '#DC7098',
      mint: '#6FC5A2'
    }
  };

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function resizeCanvas(canvas, context, cssWidth, cssHeight, devicePixelRatio) {
    const ratio = Math.min(Math.max(Number(devicePixelRatio) || 1, 1), 3);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    if (context && typeof context.setTransform === 'function') {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    return ratio;
  }

  function cellTopLeft(cell, layout) {
    const originX = Number.isFinite(layout.originX) ? layout.originX : 0;
    const originY = Number.isFinite(layout.originY) ? layout.originY : 0;
    return {
      x: layout.x + (cell[0] - originX) * layout.cellSize,
      y: layout.y + (cell[1] - originY) * layout.cellSize
    };
  }

  function cellCenter(cell, layout) {
    const topLeft = cellTopLeft(cell, layout);
    return {
      x: topLeft.x + layout.cellSize * 0.5,
      y: topLeft.y + layout.cellSize * 0.5
    };
  }

  function paletteColor(color, assets) {
    const resourcePalette = Object.fromEntries((assets?.categories || [])
      .flatMap((category) => category.items || [])
      .filter((asset) => asset && asset.type === 'flower-color' && asset.id && asset.color)
      .map((asset) => [asset.id, asset.color]));
    const palettes = (assets && (assets.palettes || assets.palette)) || resourcePalette;
    return palettes[color] || RENDER_CONFIG.palettes[color] || RENDER_CONFIG.palettes.coral;
  }

  function drawSoilCell(context, cell, layout) {
    const size = layout.cellSize;
    const { x, y } = cellTopLeft(cell, layout);
    const inset = size * 0.045;
    context.fillStyle = '#F3DFC0';
    context.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
    context.fillStyle = '#D6B98B';
    [
      [0.23, 0.29],
      [0.72, 0.22],
      [0.66, 0.74]
    ].forEach(([offsetX, offsetY], index) => {
      context.beginPath();
      context.arc(x + size * offsetX, y + size * offsetY, size * (0.012 + index * 0.004), 0, Math.PI * 2);
      context.fill();
    });
  }

  function givenBoundaryEdges(cells) {
    const occupied = new Set((cells || []).map(cellKey));
    const edges = [];
    (cells || []).forEach(([x, y]) => {
      if (!occupied.has(cellKey([x, y - 1]))) edges.push([[x, y], [x + 1, y]]);
      if (!occupied.has(cellKey([x + 1, y]))) edges.push([[x + 1, y], [x + 1, y + 1]]);
      if (!occupied.has(cellKey([x, y + 1]))) edges.push([[x + 1, y + 1], [x, y + 1]]);
      if (!occupied.has(cellKey([x - 1, y]))) edges.push([[x, y + 1], [x, y]]);
    });
    return edges;
  }

  function drawCellRegionBorder(context, cells, layout, color = '#F5C451') {
    const edges = givenBoundaryEdges(cells);
    if (!edges.length) return;
    const originX = Number.isFinite(layout.originX) ? layout.originX : 0;
    const originY = Number.isFinite(layout.originY) ? layout.originY : 0;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, layout.cellSize * 0.055);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    edges.forEach(([from, to]) => {
      context.moveTo(layout.x + (from[0] - originX) * layout.cellSize, layout.y + (from[1] - originY) * layout.cellSize);
      context.lineTo(layout.x + (to[0] - originX) * layout.cellSize, layout.y + (to[1] - originY) * layout.cellSize);
    });
    context.stroke();
    context.restore();
  }

  function hintCells(hint) {
    if (!hint) return [];
    if (hint.type === 'remove' && Array.isArray(hint.shapeCells)) return hint.shapeCells;
    if (Array.isArray(hint.cells)) return hint.cells;
    if (Array.isArray(hint.solutionCells)) return hint.solutionCells;
    if (hint.target && Array.isArray(hint.target.solutionCells)) return hint.target.solutionCells;
    return [];
  }

  function drawHintOverlay(context, hint, layout, now) {
    const size = layout.cellSize;
    context.save();
    context.globalAlpha = 0.84 + Math.sin(now / 180) * 0.12;
    const isRemoval = hint.type === 'remove';
    context.fillStyle = isRemoval ? 'rgba(220, 112, 152, 0.24)' : 'rgba(245, 196, 81, 0.28)';
    context.strokeStyle = isRemoval ? '#DC7098' : '#F5C451';
    context.lineWidth = size * 0.045;
    hintCells(hint).forEach((cell) => {
      const topLeft = cellTopLeft(cell, layout);
      const x = topLeft.x + size * 0.08;
      const y = topLeft.y + size * 0.08;
      context.fillRect(x, y, size * 0.84, size * 0.84);
      context.beginPath();
      context.arc(x + size * 0.42, y + size * 0.42, size * 0.34, 0, Math.PI * 2);
      context.stroke();
    });
    if (!isRemoval && isCell(hint.startCell)) {
      const center = cellCenter(hint.startCell, layout);
      context.fillStyle = '#517549';
      context.beginPath();
      context.arc(center.x, center.y, size * 0.12, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function normalizePreviewCells(cells) {
    if (!Array.isArray(cells) || !cells.length) return [];
    const minX = Math.min(...cells.map((cell) => cell[0]));
    const minY = Math.min(...cells.map((cell) => cell[1]));
    return cells.map((cell) => [cell[0] - minX, cell[1] - minY]);
  }

  function groupTargets(targets, completedTargetIds) {
    const completed = new Set(completedTargetIds || []);
    const groups = new Map();
    (targets || []).forEach((target) => {
      if (!target || !Array.isArray(target.shape)) return;
      const key = gameLogic && typeof gameLogic.canonicalShape === 'function'
        ? gameLogic.canonicalShape(target.shape)
        : JSON.stringify(normalizePreviewCells(target.shape));
      const group = groups.get(key) || { shape: target.shape, total: 0, completed: 0 };
      group.total += 1;
      if (completed.has(target.id)) group.completed += 1;
      groups.set(key, group);
    });
    return [...groups.values()];
  }

  function renderTargetStrip(container, level, state, documentRef) {
    if (!container || !level || !documentRef || typeof documentRef.createElement !== 'function') return;
    const chips = groupTargets(level.targets, state && state.completedTargetIds).map((target) => {
      const chip = documentRef.createElement('span');
      const preview = documentRef.createElement('span');
      const count = documentRef.createElement('span');
      const cells = normalizePreviewCells(target.shape || []);
      const completedTarget = target.completed > 0;
      chip.className = `target-chip${completedTarget ? ' is-used' : ''}`;
      chip.setAttribute && chip.setAttribute('aria-label', `${target.shape.length} 格形状，${completedTarget ? "已使用" : "尚未使用"}，可重复使用`);
      preview.className = 'target-preview';
      count.className = 'target-count';
      count.textContent = completedTarget ? '✓' : ''; 
      const columns = cells.length ? Math.max(...cells.map((cell) => cell[0])) + 1 : 1;
      const rows = cells.length ? Math.max(...cells.map((cell) => cell[1])) + 1 : 1;
      preview.style.setProperty('--preview-columns', columns);
      preview.style.setProperty('--preview-rows', rows);
      cells.forEach(([x, y]) => {
        const cell = documentRef.createElement('i');
        cell.className = 'target-preview-cell';
        cell.style.setProperty('--preview-x', x + 1);
        cell.style.setProperty('--preview-y', y + 1);
        if (typeof preview.append === 'function') preview.append(cell);
      });
      if (typeof chip.append === 'function') chip.append(preview, count);
      return chip;
    });
    container.replaceChildren(...chips);
  }

  function drawPot(context, cell, layout) {
    const size = layout.cellSize;
    const center = cellCenter(cell, layout);
    const top = center.y + size * 0.12;
    const topHalf = size * 0.25;
    const baseHalf = size * 0.18;
    const bottom = center.y + size * 0.39;

    context.fillStyle = '#C86F46';
    context.beginPath();
    context.moveTo(center.x - topHalf, top);
    context.lineTo(center.x + topHalf, top);
    context.lineTo(center.x + baseHalf, bottom);
    context.quadraticCurveTo(center.x, bottom + size * 0.035, center.x - baseHalf, bottom);
    context.closePath();
    context.fill();
    context.fillStyle = '#E69767';
    context.fillRect(center.x - size * 0.28, top - size * 0.055, size * 0.56, size * 0.11);
    context.fillStyle = '#76513A';
    context.beginPath();
    context.ellipse(center.x, top, size * 0.22, size * 0.045, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawStem(context, center, size, growth) {
    const top = center.y + size * 0.08 - size * 0.42 * growth;
    context.strokeStyle = '#5D9655';
    context.lineWidth = size * 0.055;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(center.x, center.y + size * 0.13);
    context.quadraticCurveTo(center.x + size * 0.04, center.y - size * 0.05, center.x, top);
    context.stroke();
    if (growth > 0.45) {
      context.fillStyle = '#70A866';
      context.beginPath();
      context.ellipse(
        center.x + size * 0.075,
        center.y - size * 0.07,
        size * 0.105 * growth,
        size * 0.045 * growth,
        -0.45,
        0,
        Math.PI * 2
      );
      context.fill();
    }
    return top;
  }

  function drawBud(context, cell, layout, color, growth) {
    const size = layout.cellSize;
    const center = cellCenter(cell, layout);
    drawPot(context, cell, layout);
    const top = drawStem(context, center, size, growth);
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(center.x, top, size * 0.12 * growth, size * 0.16 * growth, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawBloom(context, cell, layout, color, progress) {
    const size = layout.cellSize;
    const center = cellCenter(cell, layout);
    drawPot(context, cell, layout);
    const flowerY = drawStem(context, center, size, 1);
    const eased = 1 - Math.pow(1 - clamp(progress, 0, 1), 3);
    const petalScale = 0.2 + eased * 0.8;
    const rotation = (1 - eased) * -0.28;

    context.save();
    context.translate(center.x, flowerY);
    context.rotate(rotation);
    context.scale(petalScale, petalScale);
    context.fillStyle = color;
    for (let petal = 0; petal < 5; petal += 1) {
      context.save();
      context.rotate((Math.PI * 2 * petal) / 5);
      context.beginPath();
      context.ellipse(0, -size * 0.14, size * 0.105, size * 0.19, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.fillStyle = '#F5C451';
    context.beginPath();
    context.arc(0, 0, size * 0.095, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawDraft(context, draftPath, layout) {
    if (!draftPath || !draftPath.length) return;
    const size = layout.cellSize;
    context.fillStyle = 'rgba(111, 197, 162, 0.34)';
    draftPath.forEach((cell) => {
      const topLeft = cellTopLeft(cell, layout);
      const x = topLeft.x + size * 0.08;
      const y = topLeft.y + size * 0.08;
      context.fillRect(x, y, size * 0.84, size * 0.84);
    });
    if (draftPath.length < 2) return;
    context.strokeStyle = 'rgba(81, 117, 73, 0.72)';
    context.lineWidth = size * 0.12;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    draftPath.forEach((cell, index) => {
      const center = cellCenter(cell, layout);
      if (index === 0) context.moveTo(center.x, center.y);
      else context.lineTo(center.x, center.y);
    });
    context.stroke();
  }

  function fencePoints(fence, layout) {
    const size = layout.cellSize;
    const first = cellCenter(fence.a, layout);
    const second = cellCenter(fence.b, layout);
    const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    if (fence.a[1] === fence.b[1]) {
      return [
        { x: middle.x, y: middle.y - size * 0.3 },
        { x: middle.x, y: middle.y + size * 0.3 }
      ];
    }
    return [
      { x: middle.x - size * 0.3, y: middle.y },
      { x: middle.x + size * 0.3, y: middle.y }
    ];
  }

  function drawFence(context, fence, layout) {
    const size = layout.cellSize;
    const [first, second] = fencePoints(fence, layout);
    const horizontal = Math.abs(first.y - second.y) < size * 0.01;
    const postOffset = size * 0.12;
    const drawWood = () => {
      context.beginPath();
      if (horizontal) {
        context.moveTo(first.x, first.y - postOffset);
        context.lineTo(first.x, first.y + postOffset);
        context.moveTo(second.x, second.y - postOffset);
        context.lineTo(second.x, second.y + postOffset);
        context.moveTo(first.x, first.y - postOffset * 0.52);
        context.lineTo(second.x, second.y - postOffset * 0.52);
        context.moveTo(first.x, first.y + postOffset * 0.52);
        context.lineTo(second.x, second.y + postOffset * 0.52);
      } else {
        context.moveTo(first.x - postOffset, first.y);
        context.lineTo(first.x + postOffset, first.y);
        context.moveTo(second.x - postOffset, second.y);
        context.lineTo(second.x + postOffset, second.y);
        context.moveTo(first.x - postOffset * 0.52, first.y);
        context.lineTo(second.x - postOffset * 0.52, second.y);
        context.moveTo(first.x + postOffset * 0.52, first.y);
        context.lineTo(second.x + postOffset * 0.52, second.y);
      }
      context.stroke();
    };
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#76513A';
    context.lineWidth = size * 0.11;
    drawWood();
    context.strokeStyle = '#F8F1DD';
    context.lineWidth = size * 0.06;
    drawWood();
  }

  function stableUnit(shapeIndex, cell, particleIndex, salt) {
    let seed = ((shapeIndex + 1) * 83492791)
      ^ ((cell[0] + 11) * 73856093)
      ^ ((cell[1] + 17) * 19349663)
      ^ ((particleIndex + 3) * 2654435761)
      ^ salt;
    seed >>>= 0;
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507) >>> 0;
    return (seed % 10000) / 10000;
  }

  function drawPollen(context, state, layout, now) {
    if (state.status !== 'blooming' || !state.bloomSequence) return;
    const size = layout.cellSize;
    context.fillStyle = 'rgba(245, 196, 81, 0.72)';
    state.bloomSequence.buds.forEach((bud, shapeIndex) => {
      const progress = clamp((now - bud.startAt) / RENDER_CONFIG.bloomDurationMs, 0, 1);
      if (progress <= 0.08 || progress >= 1) return;
      const center = cellCenter(bud.cell, layout);
      for (let particle = 0; particle < 3; particle += 1) {
        const horizontal = stableUnit(shapeIndex, bud.cell, particle, 17) - 0.5;
        const lift = 0.2 + stableUnit(shapeIndex, bud.cell, particle, 31) * 0.34;
        const radius = size * (0.018 + stableUnit(shapeIndex, bud.cell, particle, 47) * 0.012);
        context.beginPath();
        context.arc(
          center.x + horizontal * size * (0.45 + progress * 0.25),
          center.y - size * 0.35 - lift * size * progress,
          radius,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    });
  }

  function startBloomSequence(state, now) {
    if (!state || state.status !== 'blooming' || state.bloomSequence) return state;
    const growthEndsAt = (state.shapes || []).reduce((latest, shape) => (
      shape && shape.status === 'buds'
        ? Math.max(latest, shape.createdAt + RENDER_CONFIG.growthDurationMs)
        : latest
    ), now);
    const sequenceStart = Math.max(now, growthEndsAt);
    const buds = [];
    (state.shapes || []).forEach((shape) => {
      if (!shape || shape.status !== 'buds') return;
      (shape.cells || []).forEach((cell) => {
        buds.push({
          shapeId: shape.id,
          cell: copyCell(cell),
          color: shape.color,
          startAt: sequenceStart + buds.length * RENDER_CONFIG.bloomStaggerMs
        });
      });
    });
    state.bloomSequence = { startedAt: sequenceStart, buds };
    return state;
  }

  function advanceBloomSequence(state, now) {
    if (!state || state.status !== 'blooming') return state;
    startBloomSequence(state, now);
    const buds = state.bloomSequence.buds;
    const finalStart = buds.length ? buds[buds.length - 1].startAt : state.bloomSequence.startedAt;
    if (now >= finalStart + RENDER_CONFIG.bloomDurationMs) state.status = 'complete';
    return state;
  }

  function bloomEntry(state, shape, cell) {
    if (!state.bloomSequence) return null;
    return state.bloomSequence.buds.find((bud) => bud.shapeId === shape.id && sameCell(bud.cell, cell)) || null;
  }

  function renderScene(context, state, layout, assets, now) {
    if (!context || !state || !layout) return;
    const currentTime = Number.isFinite(now) ? now : Date.now();
    gameLogic.tickObstacles?.(state,currentTime);
    context.clearRect(0, 0, layout.x + layout.width, layout.y + layout.height);

    (state.level.activeCells || []).forEach((cell) => drawSoilCell(context, cell, layout));
    if (state.hint) drawHintOverlay(context, state.hint, layout, currentTime);

    (state.shapes || []).forEach((shape) => {
      const flowerColor = paletteColor(shape.color, assets);
      (shape.cells || []).forEach((cell) => {
        if (shape.status === 'flowers' || shape.status === 'fixed-flowers') {
          drawBloom(context, cell, layout, flowerColor, 1);
          return;
        }
        if (shape.status !== 'buds') {
          drawPot(context, cell, layout);
          return;
        }
        if (state.status === 'complete') {
          drawBloom(context, cell, layout, flowerColor, 1);
          return;
        }
        if (state.status === 'blooming') {
          const entry = bloomEntry(state, shape, cell);
          const progress = entry
            ? clamp((currentTime - entry.startAt) / RENDER_CONFIG.bloomDurationMs, 0, 1)
            : 0;
          if (progress > 0) drawBloom(context, cell, layout, flowerColor, progress);
          else {
            const growth = clamp(
              (currentTime - shape.createdAt) / RENDER_CONFIG.growthDurationMs,
              0,
              1
            );
            drawBud(context, cell, layout, flowerColor, growth);
          }
          return;
        }
        const growth = clamp((currentTime - shape.createdAt) / RENDER_CONFIG.growthDurationMs, 0, 1);
        drawBud(context, cell, layout, flowerColor, growth);
      });
    });
    drawCellRegionBorder(context, (state.level.given?.presetPots || []).map(item => item.cell), layout);
    drawCellRegionBorder(context, (state.level.given?.fixedFlowers || []).map(item => item.cell), layout);

    drawDraft(context, state.draftPath, layout);
    (state.level.fences || []).forEach((fence) => drawFence(context, fence, layout));
    gameLogic.drawMechanics?.(context,state.level,layout,state.obstacles,state.shapes,currentTime);
    gameLogic.drawOverlap?.(context,state.level,layout,state.shapes);
    drawPollen(context, state, layout, currentTime);
  }

  function needsAnimation(state, now) {
    if (!state) return false;
    if ((state.shapes||[]).some(s=>gameLogic.shapeIsLocked?.(s,now))) return true;
    if (state.status === 'blooming') return true;
    if (state.status === 'playing' && (state.shapes || []).some((shape) => (
      shape.status === 'buds' && now - shape.createdAt < RENDER_CONFIG.growthDurationMs
    ))) return true;
    if (state.hint && Number.isFinite(state.hint.startedAt) && Number.isFinite(state.hint.duration)) {
      return now < state.hint.startedAt + state.hint.duration;
    }
    return false;
  }

  function bindPointerEvents(canvas, state, cellForEvent, onChange) {
    if (!canvas || typeof canvas.addEventListener !== 'function') return () => {};
    canvas.style.touchAction = 'none';
    let pointerId = null;
    let drawing = false;
    let tapShapeId = null;
    let tapOriginCell = null;
    let tapValid = false;
    let lastCell = null;

    function notify() {
      if (typeof onChange === 'function') onChange(state);
    }

    function resetTransient() {
      pointerId = null;
      drawing = false;
      tapShapeId = null;
      tapOriginCell = null;
      tapValid = false;
      lastCell = null;
    }

    function eventCell(event) {
      const cell = cellForEvent(event);
      return isCell(cell) ? cell : null;
    }

    function onPointerDown(event) {
      if (pointerId !== null) return;
      const cell = eventCell(event);
      if (!cell) return;

      pointerId = event.pointerId;
      lastCell = cell;
      if (typeof canvas.setPointerCapture === 'function') canvas.setPointerCapture(pointerId);
      const occupiedShape = findShapeAt(state, cell);
      if (occupiedShape) {
        tapShapeId = occupiedShape.id;
        tapOriginCell = copyCell(cell);
        tapValid = true;
        if (occupiedShape.status === 'pots' || (state.level.overlapCells?.length && gameLogic.canExtendPath([],cell,{occupiedCells:occupiedCells(state)},state.level).ok)) {
          beginStroke(state, cell);
          drawing = state.draftPath.length > 0;
          if (drawing) event.preventDefault();
          notify();
        }
        return;
      }

      beginStroke(state, cell);
      drawing = state.draftPath.length > 0;
      if (drawing) event.preventDefault();
      notify();
    }

    function onPointerMove(event) {
      if (event.pointerId !== pointerId) return;
      if (!drawing) {
        if (tapShapeId && !sameCell(eventCell(event), tapOriginCell)) tapValid = false;
        return;
      }
      const cell = eventCell(event);
      if (cell) {
        if (tapShapeId && !sameCell(cell, tapOriginCell)) tapValid = false;
        interpolateAxisAligned(lastCell, cell).forEach((nextCell) => extendStroke(state, nextCell));
        lastCell = cell;
        notify();
      }
      event.preventDefault();
    }

    function finishPointer(event, cancelled) {
      if (event.pointerId !== pointerId) return;
      const wasDrawing = drawing;
      if (cancelled) {
        state.draftPath = [];
        state.editingShapeId = null;
      } else if (drawing && tapShapeId && tapValid) {
        state.draftPath = [];
        state.editingShapeId = null;
        const shape = findShapeAt(state, tapOriginCell);
        if (shape && shape.id === tapShapeId) deleteShapeAt(state, tapOriginCell);
      } else if (drawing) {
        commitStroke(state);
      } else if (tapShapeId && tapValid) {
        const cell = eventCell(event);
        const shape = findShapeAt(state, cell);
        if (sameCell(cell, tapOriginCell) && shape && shape.id === tapShapeId) deleteShapeAt(state, cell);
      }
      if (wasDrawing) event.preventDefault();
      if (typeof canvas.releasePointerCapture === 'function') canvas.releasePointerCapture(pointerId);
      resetTransient();
      notify();
    }

    const onPointerUp = (event) => finishPointer(event, false);
    const onPointerCancel = (event) => finishPointer(event, true);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    };
  }

  const api = {
    computeBoardLayout,
    canvasPointToCell,
    createGameState,
    beginStroke,
    extendStroke,
    commitStroke,
    deleteShapeAt,
    bindPointerEvents,
    resizeCanvas,
    renderScene,
    startBloomSequence,
    advanceBloomSequence,
    needsAnimation,
    readProgress,
    writeProgress,
    recordCompletion,
    loadLevel,
    loadTestLevel,
    requestHint,
    retryLevel,
    nextLevel,
    createFlowController,
    groupTargets,
    renderTargetStrip
    ,givenBoundaryEdges
    ,drawCellRegionBorder
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FlowerPuzzleRuntime = api;

  if (typeof document === 'undefined') return;

  function setupPlayer() {
    const shell = document.querySelector('[data-flower-puzzle]');
    const canvas = document.querySelector('[data-board-canvas]');
    const stage = document.querySelector('[data-board-stage]');
    const title = document.querySelector('[data-level-title]');
    const targets = document.querySelector('[data-target-strip]');
    const status = document.querySelector('[data-game-status]');
    const completionSheet = document.querySelector('.completion-sheet');
    const hintButton = document.querySelector('[data-hint-button]');
    const retryButtons = [
      document.querySelector('[data-retry-button]'),
      document.querySelector('[data-completion-retry]')
    ].filter(Boolean);
    const nextButtons = [
      document.querySelector('[data-next-button]'),
      document.querySelector('[data-completion-next]')
    ].filter(Boolean);
    const levelList = document.querySelector('[data-level-list]');
    const levels = (root && root.FLOWER_LEVELS) || [];

    if (!shell || !canvas || !stage || !levels.length) return;

    let layout;
    let animationFrame = null;
    let didRecordCompletion = false;
    let unbindPointerEvents = () => {};
    let browserStorage;
    try {
      browserStorage = root.localStorage;
    } catch (error) {
      browserStorage = null;
    }
    const controller = createFlowController({
      levels,
      storage: browserStorage,
      onHintExpired: () => paint(Date.now())
    });
    const context = canvas.getContext('2d');
    const canRender = context && typeof context.clearRect === 'function';

    function updateStatus() {
      const gameState = controller.getState();
      if (!gameState) return;
      if (gameState.status === 'complete') status.textContent = '花田盛开啦！';
      else if (gameState.status === 'blooming') status.textContent = '花田即将盛开。';
      else status.textContent = '拖动绘制形状，轻点可删除。';
      if (completionSheet) completionSheet.hidden = gameState.status !== 'complete';
      nextButtons.forEach((button) => {
        const unavailable = gameState.level.id >= LEVEL_LIMIT;
        button.disabled = unavailable;
        button.hidden = unavailable;
      });
    }

    function updateLevelTitle(gameState) {
      if (title && gameState && gameState.level) {
        title.textContent = `第 ${gameState.level.id} 关 · ${gameState.level.name}`;
      }
    }

    function updateLevelList() {
      if (!levelList || typeof document.createElement !== 'function') return;
      const progress = controller.getProgress();
      const gameState = controller.getState();
      const completed = new Set(progress.completed);
      const buttons = levels.map((level) => {
        const button = document.createElement('button');
        const current = gameState && gameState.level.id === level.id;
        button.type = 'button';
        button.className = `level-button${current ? ' is-current' : ''}${completed.has(level.id) ? ' is-completed' : ''}`;
        button.textContent = String(level.id);
        button.disabled = false;
        if (button.setAttribute) {
          button.setAttribute('type', 'button');
          if (current) button.setAttribute('aria-current', 'true');
          button.setAttribute('aria-label', `第 ${level.id} 关 · ${level.name}`);
        }
        if (typeof button.addEventListener === 'function') button.addEventListener('click', () => load(level.id));
        return button;
      });
      if (typeof levelList.replaceChildren === 'function') levelList.replaceChildren(...buttons);
    }

    function scheduleAnimation() {
      if (animationFrame !== null || typeof root.requestAnimationFrame !== 'function') return;
      animationFrame = root.requestAnimationFrame(() => {
        animationFrame = null;
        paint(Date.now());
      });
    }

    function paint(now) {
      const gameState = controller.getState();
      if (!gameState) return;
      if (gameState.status === 'blooming') {
        startBloomSequence(gameState, now);
        advanceBloomSequence(gameState, now);
      }
      if (gameState.status === 'complete' && !didRecordCompletion) {
        controller.completeLevel();
        didRecordCompletion = true;
        updateLevelList();
      }
      if (canRender && layout) renderScene(context, gameState, layout, RENDER_CONFIG, now);
      if (targets) renderTargetStrip(targets, gameState.level, gameState, document);
      updateStatus();
      if (needsAnimation(gameState, now)) scheduleAnimation();
    }

    function sizeCanvas() {
      const gameState = controller.getState();
      if (!gameState) return;
      updateLevelTitle(gameState);
      const viewport = { x: 0, y: 0, width: stage.clientWidth, height: stage.clientHeight };
      layout = computeBoardLayout(viewport, gameState.level);
      resizeCanvas(canvas, context, viewport.width, viewport.height, root.devicePixelRatio || 1);
      canvas.dataset.boardX = String(layout.x);
      canvas.dataset.boardY = String(layout.y);
      canvas.dataset.cellSize = String(layout.cellSize);
      paint(Date.now());
    }

    function cellForPointerEvent(event) {
      const rect = typeof canvas.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: stage.clientWidth, height: stage.clientHeight };
      const point = {
        x: (event.clientX - rect.left) * stage.clientWidth / rect.width,
        y: (event.clientY - rect.top) * stage.clientHeight / rect.height
      };
      const gameState = controller.getState();
      return gameState ? canvasPointToCell(point, layout, gameState.level) : null;
    }

    function bindCurrentLevel() {
      unbindPointerEvents();
      const gameState = controller.getState();
      if (!gameState) return;
      unbindPointerEvents = bindPointerEvents(canvas, gameState, cellForPointerEvent, () => paint(Date.now()));
    }

    function load(id) {
      const loaded = controller.loadTestLevel(id);
      if (!loaded) return null;
      didRecordCompletion = false;
      bindCurrentLevel();
      sizeCanvas();
      updateLevelList();
      return loaded;
    }

    updateLevelList();
    sizeCanvas();
    root.addEventListener('resize', sizeCanvas);
    bindCurrentLevel();
    if (hintButton) hintButton.addEventListener('click', () => {
      controller.requestHint();
      paint(Date.now());
    });
    retryButtons.forEach((button) => button.addEventListener('click', () => {
      if (controller.retryLevel()) {
        didRecordCompletion = false;
        bindCurrentLevel();
        sizeCanvas();
      }
    }));
    nextButtons.forEach((button) => button.addEventListener('click', () => {
      const next = controller.nextLevel();
      if (next) {
        didRecordCompletion = false;
        bindCurrentLevel();
        sizeCanvas();
        updateLevelList();
      }
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPlayer, { once: true });
  } else {
    setupPlayer();
  }
}(typeof window !== 'undefined' ? window : null));
