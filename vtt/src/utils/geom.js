export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function screenToWorld(view, x, y) {
  return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom };
}
export function worldToScreen(view, x, y) {
  return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY };
}

export function snapWorldPoint(gridSize, snapMode, x, y) {
  const g = gridSize;
  const cellX = Math.floor(x / g);
  const cellY = Math.floor(y / g);
  if (snapMode === "topleft") return { x: cellX * g, y: cellY * g };
  return { x: (cellX + 0.5) * g, y: (cellY + 0.5) * g };
}

export function gridCoords(gridSize, snapMode, token) {
  const g = gridSize;
  if (snapMode === "topleft") {
    return { x: Math.round(token.x / g), y: Math.round(token.y / g) };
  }
  return { x: Math.round((token.x / g) - 0.5), y: Math.round((token.y / g) - 0.5) };
}
