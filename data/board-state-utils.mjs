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

function normalizeTokenSpellSnapshot(spell = {}) {
  return {
    name: String(spell.name ?? ''),
    kind: String(spell.kind ?? spell.spellKind ?? 'support'),
    target: String(spell.target ?? spell.targetSide ?? 'ally'),
    rangeFt: clampNumber(spell.rangeFt, 30),
    expectedValue: clampNumber(spell.expectedValue ?? spell.expectedDamage, 4),
    requiresLineOfSight: spell.requiresLineOfSight !== false
  };
}

function normalizeTokenAttackSnapshot(attack = {}) {
  const attackKind = String(attack.attackKind ?? attack.kind ?? '').toLowerCase();
  return {
    name: String(attack.name ?? ''),
    attackKind: attackKind === 'ranged' ? 'ranged' : 'melee',
    rangeFt: clampNumber(attack.rangeFt, attackKind === 'ranged' ? 60 : 5),
    expectedDamage: clampNumber(attack.expectedDamage, 4),
    tags: Array.isArray(attack.tags) ? attack.tags.map((tag) => String(tag)) : []
  };
}

function normalizeTokenTacticalSnapshot(tactical = null) {
  if (!tactical || typeof tactical !== 'object') return null;
  const role = String(tactical.role ?? tactical.authoredRole ?? '').trim();
  const authoredRole = String(tactical.authoredRole ?? role).trim();
  const coreRole = String(tactical.coreRole ?? '').trim();
  const objectiveRole = String(tactical.objective_role ?? tactical.objectiveRole ?? '').trim();
  const roleNotes = String(tactical.role_notes ?? tactical.roleNotes ?? '').trim();
  const protectedAsset = Boolean(tactical.protected_asset ?? tactical.protectedAsset);
  if (!role && !authoredRole && !coreRole && !protectedAsset && !objectiveRole && !roleNotes) return null;
  return {
    role,
    authoredRole,
    coreRole,
    protectedAsset,
    objectiveRole,
    roleNotes
  };
}

function normalizeTokenBehaviorSnapshot(behavior = null) {
  if (!behavior || typeof behavior !== 'object') return null;
  const cognition = String(behavior.cognition ?? '').trim();
  const drive = String(behavior.drive ?? '').trim();
  const riskTolerance = String(behavior.riskTolerance ?? behavior.risk_tolerance ?? '').trim();
  const coordination = String(behavior.coordination ?? '').trim();
  const planningHorizon = String(behavior.planningHorizon ?? behavior.planning_horizon ?? '').trim();
  const targetStickiness = String(behavior.targetStickiness ?? behavior.target_stickiness ?? '').trim();
  if (!cognition && !drive && !riskTolerance && !coordination && !planningHorizon && !targetStickiness) return null;
  return {
    cognition,
    drive,
    riskTolerance,
    coordination,
    planningHorizon,
    targetStickiness
  };
}

function normalizeTokenSnapshot(token = {}) {
  const snapshot = {
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
    attacks: Array.isArray(token.attacks) ? token.attacks.map(normalizeTokenAttackSnapshot) : [],
    spells: Array.isArray(token.spells) ? token.spells.map(normalizeTokenSpellSnapshot) : [],
    art: normalizeTokenArtSnapshot(token.art)
  };
  const tactical = normalizeTokenTacticalSnapshot(token.tactical);
  if (tactical) snapshot.tactical = tactical;
  const behavior = normalizeTokenBehaviorSnapshot(token.behavior);
  if (behavior) snapshot.behavior = behavior;
  return snapshot;
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
      encounterDescription: String(state?.encounterDescription ?? ''),
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
      encounterDescription: String(state?.encounterDescription ?? ''),
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
