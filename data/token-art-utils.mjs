export function clampTokenArtScale(value) {
  return Math.max(1, Math.min(3, Number(value) || 1));
}

export function clampTokenArtPan(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

export function buildTokenArtImagePlacement(image, diameter, art = {}) {
  const baseScale = Math.max(diameter / image.width, diameter / image.height);
  const drawScale = baseScale * clampTokenArtScale(art.scale);
  const drawW = image.width * drawScale;
  const drawH = image.height * drawScale;
  const overflowX = Math.max(0, drawW - diameter);
  const overflowY = Math.max(0, drawH - diameter);

  return {
    drawW,
    drawH,
    dx: -overflowX / 2 + clampTokenArtPan(art.panX) * (overflowX / 2),
    dy: -overflowY / 2 + clampTokenArtPan(art.panY) * (overflowY / 2)
  };
}
