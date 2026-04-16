export function findOpenSpawnCell(preferredCell, sizeCells = 1, canPlaceTokenAtCell = () => true) {
  const start = preferredCell || { x: 0, y: 0 };
  if (canPlaceTokenAtCell(start.x, start.y, sizeCells)) return start;

  const maxRadius = 20;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = {
          x: Math.max(0, start.x + dx),
          y: Math.max(0, start.y + dy)
        };
        if (canPlaceTokenAtCell(candidate.x, candidate.y, sizeCells)) return candidate;
      }
    }
  }

  return start;
}

export function findVisibleSpawnCell({
  sizeCells = 1,
  screenToWorld,
  gridCellFromWorldPoint,
  canPlaceTokenAtCell,
  preferredScreenPoint = { x: 70, y: 70 }
}) {
  const worldPoint = screenToWorld(preferredScreenPoint.x, preferredScreenPoint.y);
  const preferredCell = gridCellFromWorldPoint(worldPoint.x, worldPoint.y, sizeCells);
  return findOpenSpawnCell(preferredCell, sizeCells, canPlaceTokenAtCell);
}
