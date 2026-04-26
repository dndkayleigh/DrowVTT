const BOARD_STATE_VERSION = 1;

function clampNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeTokenArtSnapshot(art) {
  if (!art || !art.src) return null;
  return {
    src: String(art.src),
    scale: clampNumber(art.scale, 1),
    panX: clampNumber(art.panX, 0),
    panY: clampNumber(art.panY, 0),
    fileName: String(art.fileName ?? '').trim()
  };
}

function normalizeTokenSnapshot(token = {}) {
  return {
    id: String(token.id ?? ''),
    name: String(token.name ?? ''),
    type: String(token.type ?? 'NPC'),
    sizeCells: Math.max(1, Math.round(clampNumber(token.sizeCells, 1))),
    color: String(token.color ?? '#ff5a7a'),
    x: clampNumber(token.x, 0),
    y: clampNumber(token.y, 0),
    ac: clampNumber(token.ac, 10),
    hp: String(token.hp ?? ''),
    speed: clampNumber(token.speed, 30),
    notes: String(token.notes ?? ''),
    statblock: String(token.statblock ?? ''),
    art: normalizeTokenArtSnapshot(token.art)
  };
}

function normalizeBlockingEdgeKey(edge) {
  if (!edge) return null;
  if (typeof edge === 'string') {
    const trimmed = edge.trim();
    const match = trimmed.match(/^(h|horizontal|v|vertical):(-?\d+),(-?\d+)$/i);
    if (!match) return null;
    const orientation = match[1].toLowerCase().startsWith('h') ? 'h' : 'v';
    return `${orientation}:${Number(match[2])},${Number(match[3])}`;
  }
  const orientationValue = String(edge.orientation ?? edge.o ?? '').toLowerCase();
  const orientation = orientationValue.startsWith('h')
    ? 'h'
    : orientationValue.startsWith('v') ? 'v' : '';
  const x = Number(edge.x);
  const y = Number(edge.y);
  if (!orientation || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  return `${orientation}:${x},${y}`;
}

function normalizeBlockingEdgeKeys(edges = []) {
  const values = Array.isArray(edges) ? edges : [...(edges instanceof Set ? edges : [])];
  return [...new Set(values.map(normalizeBlockingEdgeKey).filter(Boolean))].sort((left, right) => {
    const [leftOrientation, leftCoords] = left.split(':');
    const [rightOrientation, rightCoords] = right.split(':');
    if (leftOrientation !== rightOrientation) return leftOrientation.localeCompare(rightOrientation);
    const [leftX, leftY] = leftCoords.split(',').map(Number);
    const [rightX, rightY] = rightCoords.split(',').map(Number);
    return leftX - rightX || leftY - rightY;
  });
}

export function createBoardSnapshot(state, options = {}) {
  return {
    version: BOARD_STATE_VERSION,
    savedAt: options.savedAt ?? new Date().toISOString(),
    state: {
      gridSize: clampNumber(state?.gridSize, 64),
      snapMode: state?.snapMode === 'topleft' ? 'topleft' : 'center',
      view: {
        zoom: clampNumber(state?.view?.zoom, 1),
        panX: clampNumber(state?.view?.panX, 0),
        panY: clampNumber(state?.view?.panY, 0)
      },
      map: {
        src: state?.map?.src ? String(state.map.src) : '',
        w: clampNumber(state?.map?.w, 0),
        h: clampNumber(state?.map?.h, 0),
        offX: clampNumber(state?.map?.offX, 0),
        offY: clampNumber(state?.map?.offY, 0),
        scale: clampNumber(state?.map?.scale, 1),
        rot: clampNumber(state?.map?.rot, 0),
        opacity: clampNumber(state?.map?.opacity, 1)
      },
      blockingEdges: {
        edgeKeys: normalizeBlockingEdgeKeys(state?.blockingEdges?.edgeKeys || state?.blockingEdges || [])
      },
      tokens: Array.isArray(state?.tokens) ? state.tokens.map(normalizeTokenSnapshot) : [],
      selectedTokenId: state?.selectedTokenId ? String(state.selectedTokenId) : null,
      selectedTokenIds: Array.isArray(state?.selectedTokenIds)
        ? state.selectedTokenIds.map((id) => String(id))
        : state?.selectedTokenId ? [String(state.selectedTokenId)] : [],
      currentTurnTokenId: state?.currentTurnTokenId ? String(state.currentTurnTokenId) : null,
      aiGroupTokenIds: Array.isArray(state?.aiGroupTokenIds)
        ? state.aiGroupTokenIds.map((id) => String(id))
        : [],
      aiControls: String(state?.aiControls ?? 'Monsters'),
      round: Math.max(1, Math.round(clampNumber(state?.round, 1)))
    }
  };
}

export function parseBoardSnapshot(snapshot) {
  const parsed = snapshot?.state ? snapshot : { version: BOARD_STATE_VERSION, state: snapshot };
  const state = parsed?.state ?? {};
  return {
    version: Number(parsed?.version) || BOARD_STATE_VERSION,
    savedAt: parsed?.savedAt ? String(parsed.savedAt) : null,
    state: {
      gridSize: clampNumber(state.gridSize, 64),
      snapMode: state.snapMode === 'topleft' ? 'topleft' : 'center',
      view: {
        zoom: clampNumber(state?.view?.zoom, 1),
        panX: clampNumber(state?.view?.panX, 0),
        panY: clampNumber(state?.view?.panY, 0)
      },
      map: {
        src: state?.map?.src ? String(state.map.src) : '',
        w: clampNumber(state?.map?.w, 0),
        h: clampNumber(state?.map?.h, 0),
        offX: clampNumber(state?.map?.offX, 0),
        offY: clampNumber(state?.map?.offY, 0),
        scale: clampNumber(state?.map?.scale, 1),
        rot: clampNumber(state?.map?.rot, 0),
        opacity: clampNumber(state?.map?.opacity, 1)
      },
      blockingEdges: {
        edgeKeys: normalizeBlockingEdgeKeys(state?.blockingEdges?.edgeKeys || state?.blockingEdges || [])
      },
      tokens: Array.isArray(state.tokens) ? state.tokens.map(normalizeTokenSnapshot) : [],
      selectedTokenId: state?.selectedTokenId ? String(state.selectedTokenId) : null,
      selectedTokenIds: Array.isArray(state?.selectedTokenIds)
        ? state.selectedTokenIds.map((id) => String(id))
        : state?.selectedTokenId ? [String(state.selectedTokenId)] : [],
      currentTurnTokenId: state?.currentTurnTokenId ? String(state.currentTurnTokenId) : null,
      aiGroupTokenIds: Array.isArray(state?.aiGroupTokenIds)
        ? state.aiGroupTokenIds.map((id) => String(id))
        : [],
      aiControls: String(state?.aiControls ?? 'Monsters'),
      round: Math.max(1, Math.round(clampNumber(state?.round, 1)))
    }
  };
}

export { BOARD_STATE_VERSION };
