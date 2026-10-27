// Persisted as timeLimit in each level JSON, in seconds.
export const DEFAULT_TIME_LIMIT = 120;
export const isValidTimeLimit = value => Number.isSafeInteger(value) && value > 0;

// Initial authoring estimate, not a measured completion-time prediction.
export function estimateTimeLimit(level) {
  const targets = level.targets || [];
  const playableCells = Math.max(0, (level.activeCells?.length || 0) - (level.given?.fixedFlowers?.length || 0));
  const typeCount = new Set(targets.map(target => target.assetId)).size;
  const largestShape = Math.max(0, ...targets.map(target => target.shape?.length || 0));
  const hints = (level.fences || []).filter(fence => fence.role === 'hint').length;
  const presets = level.given?.presetPots?.length || 0;
  const guidanceDiscount = Math.min(0.15, hints * 0.015 + presets * 0.015);
  const seconds = (35 + targets.length * 8 + playableCells * 0.7 + Math.max(0, typeCount - 1) * 10 + Math.max(0, largestShape - 3) * 2) * (1 - guidanceDiscount);
  const learningLevel = level.id <= 10 || level.id === 14 || level.id === 21;
  return Math.max(learningLevel ? 120 : 90, Math.ceil(seconds / 15) * 15);
}
