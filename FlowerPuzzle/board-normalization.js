// Trim only the empty outer margin; holes and relative positions stay intact.
export function normalizeBoard(level) {
  const result = structuredClone(level);
  if (!result.activeCells?.length) return result;
  const xs = result.activeCells.map(c => c[0]), ys = result.activeCells.map(c => c[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const shift = c => [c[0] - minX, c[1] - minY];
  result.width = Math.max(...xs) - minX + 1;
  result.height = Math.max(...ys) - minY + 1;
  result.activeCells = result.activeCells.map(shift);
  for (const target of result.targets || []) {
    target.solutionCells = (target.solutionCells || []).map(shift);
    if (target.origin) target.origin = shift(target.origin);
  }
  for (const items of [result.given?.fixedFlowers, result.given?.presetPots, result.bricks, result.frozen, result.overlapCells]) {
    for (const item of items || []) item.cell = shift(item.cell);
  }
  for (const fence of result.fences || []) { fence.a = shift(fence.a); fence.b = shift(fence.b); }
  for (const gate of result.gates || []) {
    gate.a = shift(gate.a); gate.b = shift(gate.b);
    for (const edge of gate.edges) { edge.a = shift(edge.a); edge.b = shift(edge.b); }
  }
  return result;
}
