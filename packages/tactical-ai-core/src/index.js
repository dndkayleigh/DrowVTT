export const TACTICAL_CONTROLLER_KINDS = [
  'human',
  'scripted',
  'utility',
  'pure_llm',
  'hybrid',
  'per_monster_agents',
  'role_specialized',
  'squad_planner'
];

export const ACTIVATION_MODES = [
  'independent',
  'coordinated_sequential',
  'simultaneous_move_then_act',
  'fully_simultaneous'
];

export const TACTICAL_STANCES = [
  'aggressive',
  'cautious',
  'evasive',
  'protective',
  'desperate',
  'opportunistic'
];

/**
 * Portable tactical vocabulary seam.
 *
 * D&D/SRD remains the reference rules implementation in this module. These
 * typedefs name game-neutral concepts already present in the deterministic
 * controller so future adapters can depend on concepts rather than monster or
 * statblock terminology.
 *
 * @typedef {object} UnitTacticalProfile
 * @property {string} id Stable unit id.
 * @property {string} name Display name.
 * @property {string} side Encounter side or faction.
 * @property {{x:number,y:number}} cell Current board cell.
 * @property {number} speed Native movement budget, currently D&D feet.
 * @property {Array<object>} attacks Native offensive options normalized for tactical use.
 * @property {Array<object>} spells Native spell or ability options normalized for tactical use.
 * @property {object} [provenance] Source metadata for inferred tactical fields.
 *
 * @typedef {string} TacticalRole
 * A deterministic tactical role id such as skirmisher, disciplined_blocker,
 * ambusher_bruiser, support_caster, or soldier.
 *
 * @typedef {object} TacticalCandidate
 * @property {string} id Stable candidate id.
 * @property {string} family Candidate family used for deterministic selection and diagnostics.
 * @property {string} actorId Acting unit id.
 * @property {object|null} move Legal movement component, if any.
 * @property {object} action Legal action component.
 * @property {string[]} targetIds Target unit ids.
 * @property {number} expectedDamage Current reference expected-damage estimate.
 * @property {boolean} legal Whether the deterministic rules layer considers the candidate legal.
 * @property {object} [metadata] Extra candidate diagnostics.
 *
 * @typedef {Record<string, number>} ScoreBreakdown
 * Numeric scoring contributions keyed by scoring term.
 *
 * @typedef {object} RoleComplianceResult
 * @property {TacticalRole} role Inferred tactical role.
 * @property {string} status pass, weak_pass, warning, or another diagnostic status.
 * @property {string} concern Human-readable concern when status is not clean.
 * @property {Array<{label:string,ok:boolean}>} checks Deterministic role checks.
 *
 * @typedef {object} CandidateHealthReport
 * @property {TacticalRole} role Inferred tactical role.
 * @property {string} status pass, weak_pass, warning, or another diagnostic status.
 * @property {string[]} availableFamilies Candidate families present in the generated set.
 * @property {string[]} expectedFamilies Candidate families expected for the role.
 * @property {string[]} missingExpectedCandidates Expected families not generated.
 *
 * @typedef {object} DoctrineAssessment
 * @property {string} doctrine Deterministic doctrine id.
 * @property {Record<string, number>} roles Role counts for supervised units.
 * @property {{id:string,name:string}|null} primaryFocusTarget Current focus target.
 * @property {{id:string,name:string,role:TacticalRole}|null} protectedAsset Unit the doctrine is trying to protect.
 * @property {string} posture Broad tactical posture.
 * @property {string} mainRisk Main deterministic planning risk.
 */

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeCell(cell = {}) {
  return {
    x: Math.round(normalizeNumber(cell.x ?? cell.col, 0)),
    y: Math.round(normalizeNumber(cell.y ?? cell.row, 0))
  };
}

function cellToCoord(cell = {}) {
  const normalized = normalizeCell(cell);
  return { row: normalized.y, col: normalized.x };
}

function coordToCell(coord = {}) {
  return {
    x: Math.round(normalizeNumber(coord.col ?? coord.x, 0)),
    y: Math.round(normalizeNumber(coord.row ?? coord.y, 0))
  };
}

const AUTHORED_TACTICAL_ROLE_TO_CORE_ROLE = {
  boss_caster: 'support_caster',
  brute_blocker: 'disciplined_blocker',
  mobile_striker: 'ambusher_bruiser',
  held_ambusher: 'ambusher_bruiser',
  disciplined_soldier: 'disciplined_blocker',
  melee_disrupter: 'ambusher_bruiser'
};

const CORE_TACTICAL_ROLES = new Set([
  'skirmisher',
  'disciplined_blocker',
  'ambusher_bruiser',
  'support_caster',
  'soldier'
]);

const CURRENTLY_UNIMPLEMENTED_CANDIDATE_FAMILIES = new Set([
  'intercept_flanker'
]);

function resolveCoreRole(tactical = null) {
  if (!tactical || typeof tactical !== 'object') return { coreRole: '', source: '' };
  const mappedCoreRole = String(tactical.mapped_core_role ?? tactical.mappedCoreRole ?? '').trim();
  if (mappedCoreRole) return { coreRole: mappedCoreRole, source: 'tactical.mapped_core_role' };
  const directCoreRole = String(tactical.core_role ?? tactical.coreRole ?? '').trim();
  if (directCoreRole) return { coreRole: directCoreRole, source: 'tactical.coreRole' };
  const authoredRole = String(tactical.role ?? tactical.authoredRole ?? '').trim();
  if (CORE_TACTICAL_ROLES.has(authoredRole)) return { coreRole: authoredRole, source: 'tactical.role' };
  const mappedAuthoredRole = AUTHORED_TACTICAL_ROLE_TO_CORE_ROLE[authoredRole] || '';
  if (mappedAuthoredRole) return { coreRole: mappedAuthoredRole, source: 'tactical.role_map' };
  return { coreRole: '', source: '' };
}

function normalizeTacticalMetadata(tactical = null) {
  const empty = {
    role: '',
    authoredRole: '',
    coreRole: '',
    coreRoleSource: '',
    protectedAsset: false,
    objectiveRole: '',
    roleNotes: ''
  };
  if (!tactical || typeof tactical !== 'object') return empty;
  const authoredRole = String(tactical.role || tactical.authoredRole || '').trim();
  const { coreRole, source: coreRoleSource } = resolveCoreRole(tactical);
  return {
    ...empty,
    ...tactical,
    role: authoredRole,
    authoredRole,
    coreRole,
    coreRoleSource,
    protectedAsset: Boolean(tactical.protected_asset ?? tactical.protectedAsset),
    objectiveRole: String(tactical.objective_role ?? tactical.objectiveRole ?? '').trim(),
    roleNotes: String(tactical.role_notes ?? tactical.roleNotes ?? '').trim()
  };
}

function normalizeActor(actor = {}) {
  return {
    id: String(actor.id || actor.name || ''),
    name: String(actor.name || actor.id || 'Actor'),
    side: actor.side === 'monsters' ? 'monsters' : actor.side === 'neutral' ? 'neutral' : 'heroes',
    kind: actor.kind || actor.type || 'unknown',
    cell: normalizeCell(actor.cell),
    sizeCells: Math.max(1, Math.round(normalizeNumber(actor.sizeCells, 1))),
    ac: Math.max(0, Math.round(normalizeNumber(actor.ac, 10))),
    hp: actor.hp == null ? '' : String(actor.hp),
    speed: Math.max(0, Math.round(normalizeNumber(actor.speed, 30))),
    attacks: Array.isArray(actor.attacks) ? actor.attacks.map(normalizeAttackProfile) : [],
    spells: Array.isArray(actor.spells) ? actor.spells.map(normalizeSpellProfile) : [],
    traits: uniqueStrings(actor.traits),
    tags: uniqueStrings(actor.tags),
    tactical: normalizeTacticalMetadata(actor.tactical),
    statblock: String(actor.statblock || ''),
    provenance: actor.provenance || {}
  };
}

function normalizeAttackProfile(attack = {}) {
  const attackKind = String(attack.attackKind || attack.kind || '').toLowerCase();
  return {
    name: String(attack.name || 'Attack'),
    attackKind: attackKind === 'ranged' ? 'ranged' : 'melee',
    rangeFt: Math.max(5, Math.round(normalizeNumber(attack.rangeFt, attackKind === 'ranged' ? 60 : 5))),
    expectedDamage: Math.max(0, normalizeNumber(attack.expectedDamage, 4)),
    tags: uniqueStrings(attack.tags)
  };
}

function normalizeSpellProfile(spell = {}) {
  const kind = String(spell.kind || spell.spellKind || 'support').toLowerCase();
  const target = String(spell.target || spell.targetSide || '').toLowerCase();
  return {
    name: String(spell.name || 'Spell'),
    kind: ['damage', 'control', 'support', 'healing', 'defensive'].includes(kind) ? kind : 'support',
    target: ['ally', 'enemy', 'self'].includes(target) ? target : kind === 'damage' || kind === 'control' ? 'enemy' : 'ally',
    rangeFt: Math.max(0, Math.round(normalizeNumber(spell.rangeFt, target === 'self' ? 0 : 30))),
    expectedValue: Math.max(0, normalizeNumber(spell.expectedValue ?? spell.expectedDamage, 4)),
    requiresLineOfSight: spell.requiresLineOfSight !== false,
    tags: uniqueStrings(spell.tags)
  };
}

function normalizeBattlefieldEdge(edge = {}) {
  const orientation = String(edge.orientation || edge.o || '').toLowerCase().startsWith('v') ? 'v' : 'h';
  return {
    id: String(edge.id || `${orientation}:${Math.round(normalizeNumber(edge.x, 0))},${Math.round(normalizeNumber(edge.y, 0))}`),
    orientation,
    x: Math.round(normalizeNumber(edge.x, 0)),
    y: Math.round(normalizeNumber(edge.y, 0)),
    blocksMovement: edge.blocksMovement !== false,
    blocksLineOfSight: edge.blocksLineOfSight !== false,
    semantics: {
      climbable: !!edge.semantics?.climbable,
      jumpable: !!edge.semantics?.jumpable,
      oneWay: edge.semantics?.oneWay || null,
      breakable: !!edge.semantics?.breakable,
      door: !!edge.semantics?.door
    }
  };
}

function normalizeBattlefieldTile(tile = {}) {
  return {
    x: Math.round(normalizeNumber(tile.x, 0)),
    y: Math.round(normalizeNumber(tile.y, 0)),
    blocksMovement: !!tile.blocksMovement,
    difficult: !!tile.difficult,
    cover: tile.cover || 'none',
    elevation: normalizeNumber(tile.elevation, 0),
    hazards: uniqueStrings(tile.hazards),
    interactableIds: uniqueStrings(tile.interactableIds)
  };
}

export function normalizeEncounterState(encounter = {}) {
  const battlefield = encounter.battlefield || {};
  return {
    id: String(encounter.id || 'encounter'),
    round: Math.max(1, Math.round(normalizeNumber(encounter.round, 1))),
    activeActorId: encounter.activeActorId ? String(encounter.activeActorId) : null,
    activationGroups: Array.isArray(encounter.activationGroups) ? encounter.activationGroups : [],
    objectives: Array.isArray(encounter.objectives) ? encounter.objectives : [],
    actors: Array.isArray(encounter.actors) ? encounter.actors.map(normalizeActor).filter((actor) => actor.id) : [],
    battlefield: {
      gridSize: Math.max(1, Math.round(normalizeNumber(battlefield.gridSize, 64))),
      width: Math.max(0, Math.round(normalizeNumber(battlefield.width, 0))),
      height: Math.max(0, Math.round(normalizeNumber(battlefield.height, 0))),
      tiles: Array.isArray(battlefield.tiles) ? battlefield.tiles.map(normalizeBattlefieldTile) : [],
      edges: Array.isArray(battlefield.edges) ? battlefield.edges.map(normalizeBattlefieldEdge) : [],
      interactables: Array.isArray(battlefield.interactables) ? battlefield.interactables : []
    },
    metadata: encounter.metadata || {}
  };
}

export function validateEncounterState(encounter) {
  const normalized = normalizeEncounterState(encounter);
  const issues = [];
  if (!normalized.actors.length) issues.push('EncounterState requires at least one actor.');
  if (normalized.activeActorId && !normalized.actors.some((actor) => actor.id === normalized.activeActorId)) {
    issues.push(`activeActorId does not match an actor: ${normalized.activeActorId}`);
  }
  return { ok: issues.length === 0, issues, encounter: normalized };
}

export function createDecisionLogEntry({
  controllerId,
  actorId,
  phase = 'decision',
  message = '',
  data = {},
  level = 'info'
} = {}) {
  return {
    id: `${String(controllerId || 'controller')}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    controllerId: String(controllerId || ''),
    actorId: actorId ? String(actorId) : null,
    phase,
    level,
    message,
    data
  };
}

export function createReplayFrame({ encounter, controllerId, output, logs = [] } = {}) {
  return {
    id: `replay:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    controllerId: String(controllerId || ''),
    encounter: normalizeEncounterState(encounter),
    output,
    logs
  };
}

function edgeKey(edge) {
  const normalized = normalizeBattlefieldEdge(edge);
  return `${normalized.orientation}:${normalized.x},${normalized.y}`;
}

function blockingEdgeSet(encounter, los = false) {
  return new Set((encounter?.battlefield?.edges || [])
    .filter((edge) => los ? edge.blocksLineOfSight !== false : edge.blocksMovement !== false)
    .map(edgeKey));
}

export function gridDistance(a, b) {
  return Math.max(Math.abs(Number(a?.x) - Number(b?.x)), Math.abs(Number(a?.y) - Number(b?.y)));
}

export function pathCellsBetween(fromCell, toCell) {
  const steps = [];
  let x = Math.round(Number(fromCell?.x) || 0);
  let y = Math.round(Number(fromCell?.y) || 0);
  const target = normalizeCell(toCell);
  while (x !== target.x || y !== target.y) {
    if (x < target.x) x += 1;
    else if (x > target.x) x -= 1;
    if (y < target.y) y += 1;
    else if (y > target.y) y -= 1;
    steps.push({ x, y });
  }
  return steps;
}

export function movementEdgesBetweenCells(fromCell, toCell) {
  const fromX = Number(fromCell?.x);
  const fromY = Number(fromCell?.y);
  const toX = Number(toCell?.x);
  const toY = Number(toCell?.y);
  if (![fromX, fromY, toX, toY].every(Number.isInteger)) return [];
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);
  const edges = [];
  if (dx !== 0) {
    edges.push(`v:${Math.max(fromX, toX)},${fromY}`);
    if (dy !== 0) edges.push(`v:${Math.max(fromX, toX)},${toY}`);
  }
  if (dy !== 0) {
    edges.push(`h:${fromX},${Math.max(fromY, toY)}`);
    if (dx !== 0) edges.push(`h:${toX},${Math.max(fromY, toY)}`);
  }
  return [...new Set(edges)];
}

export function hasBlockedMovementPath(encounter, fromCell, toCell) {
  const blocked = blockingEdgeSet(encounter, false);
  if (!blocked.size) return false;
  let previous = normalizeCell(fromCell);
  for (const step of pathCellsBetween(previous, toCell)) {
    if (movementEdgesBetweenCells(previous, step).some((key) => blocked.has(key))) return true;
    previous = step;
  }
  return false;
}

function segmentIntersects(a, b, c, d) {
  const cross = (p, q, r) => ((q.y - p.y) * (r.x - q.x)) - ((q.x - p.x) * (r.y - q.y));
  const orientation = (p, q, r) => {
    const value = cross(p, q, r);
    if (Math.abs(value) < 1e-9) return 0;
    return value > 0 ? 1 : 2;
  };
  const onSegment = (p, q, r) =>
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x + 1e-9 >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y + 1e-9 >= Math.min(p.y, r.y);
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  return o4 === 0 && onSegment(c, b, d);
}

export function actorAimPoint(actor, fromCell = null) {
  const cell = normalizeCell(fromCell || actor?.cell);
  const size = Math.max(1, Math.round(Number(actor?.sizeCells) || 1));
  return { x: cell.x + (size / 2), y: cell.y + (size / 2) };
}

export function hasLineOfSight(encounter, fromActor, toActor, fromCell = null) {
  const blocked = blockingEdgeSet(encounter, true);
  if (!blocked.size) return true;
  const start = actorAimPoint(fromActor, fromCell);
  const end = actorAimPoint(toActor);
  for (const edge of encounter?.battlefield?.edges || []) {
    if (!blocked.has(edgeKey(edge))) continue;
    const normalized = normalizeBattlefieldEdge(edge);
    const edgeStart = { x: normalized.x, y: normalized.y };
    const edgeEnd = normalized.orientation === 'v'
      ? { x: normalized.x, y: normalized.y + 1 }
      : { x: normalized.x + 1, y: normalized.y };
    if (segmentIntersects(start, end, edgeStart, edgeEnd)) return false;
  }
  return true;
}

function isCellInsideBattlefield(encounter, cell) {
  const normalized = normalizeCell(cell);
  const width = Math.round(Number(encounter?.battlefield?.width) || 0);
  const height = Math.round(Number(encounter?.battlefield?.height) || 0);
  if (normalized.x < 0 || normalized.y < 0) return false;
  if (width > 0 && normalized.x >= width) return false;
  if (height > 0 && normalized.y >= height) return false;
  return true;
}

function cellKey(cell) {
  const normalized = normalizeCell(cell);
  return `${normalized.x},${normalized.y}`;
}

function occupiedCellMap(encounter, { excludeActorId = null } = {}) {
  const occupied = new Map();
  for (const actor of encounter?.actors || []) {
    if (excludeActorId && actor.id === excludeActorId) continue;
    const origin = normalizeCell(actor.cell);
    const size = Math.max(1, Math.round(Number(actor.sizeCells) || 1));
    for (let dx = 0; dx < size; dx += 1) {
      for (let dy = 0; dy < size; dy += 1) {
        occupied.set(cellKey({ x: origin.x + dx, y: origin.y + dy }), actor);
      }
    }
  }
  return occupied;
}

function cellIsOccupied(encounter, cell, { excludeActorId = null } = {}) {
  return occupiedCellMap(encounter, { excludeActorId }).has(cellKey(cell));
}

function battlefieldSearchBounds(encounter) {
  const width = Math.round(Number(encounter?.battlefield?.width) || 0);
  const height = Math.round(Number(encounter?.battlefield?.height) || 0);
  if (width > 0 && height > 0) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  const actorCells = (encounter?.actors || []).map((actor) => normalizeCell(actor.cell));
  const maxActorX = Math.max(0, ...actorCells.map((cell) => cell.x));
  const maxActorY = Math.max(0, ...actorCells.map((cell) => cell.y));
  return { minX: 0, minY: 0, maxX: maxActorX + 12, maxY: maxActorY + 12 };
}

function neighborCells(encounter, cell, { actor = null, goal = null } = {}) {
  const current = normalizeCell(cell);
  const actorId = actor?.id || null;
  const movingSide = actor?.side || null;
  const directions = [
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 0 },                    { x: 1, y: 0 },
    { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 }
  ];
  return directions
    .map((direction) => ({ x: current.x + direction.x, y: current.y + direction.y }))
    .filter((next) => isCellInsideBattlefield(encounter, next))
    .filter((next) => !hasBlockedMovementPath(encounter, current, next))
    .filter((next) => {
      const occupant = occupiedCellMap(encounter, { excludeActorId: actorId }).get(cellKey(next));
      if (!occupant) return true;
      if (goal && cellKey(next) === cellKey(goal)) return false;
      return movingSide && occupant.side === movingSide;
    });
}

function legacyFindPathCells(encounterInput, fromCell, toCell, { maxExpanded = 3000, actor = null } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const start = normalizeCell(fromCell);
  const goal = normalizeCell(toCell);
  if (!isCellInsideBattlefield(encounter, start) || !isCellInsideBattlefield(encounter, goal)) return null;
  const movingActor = actor ? normalizeActor(actor) : null;
  if (cellIsOccupied(encounter, goal, { excludeActorId: movingActor?.id || null })) return null;
  if (cellKey(start) === cellKey(goal)) return [];
  const directPath = pathCellsBetween(start, goal);
  let previous = start;
  let directPathIsLegal = true;
  for (const step of directPath) {
    const occupant = occupiedCellMap(encounter, { excludeActorId: movingActor?.id || null }).get(cellKey(step));
    const occupiedByOpponent = occupant && (!movingActor?.side || occupant.side !== movingActor.side);
    const occupiedFinal = occupant && cellKey(step) === cellKey(goal);
    if (!isCellInsideBattlefield(encounter, step) || hasBlockedMovementPath(encounter, previous, step) || occupiedByOpponent || occupiedFinal) {
      directPathIsLegal = false;
      break;
    }
    previous = step;
  }
  if (directPathIsLegal) return directPath;
  const queue = [{ cell: start, cost: 0, priority: gridDistance(start, goal) }];
  const cameFrom = new Map([[cellKey(start), null]]);
  const costSoFar = new Map([[cellKey(start), 0]]);
  let expanded = 0;

  while (queue.length && expanded < maxExpanded) {
    queue.sort((left, right) => left.priority - right.priority || left.cost - right.cost);
    const current = queue.shift();
    expanded += 1;
    if (!current) break;
    if (cellKey(current.cell) === cellKey(goal)) {
      const path = [];
      let key = cellKey(goal);
      while (key !== cellKey(start)) {
        const cell = key.split(',').map(Number);
        path.push({ x: cell[0], y: cell[1] });
        key = cameFrom.get(key);
        if (!key) return null;
      }
      return path.reverse();
    }
    for (const next of neighborCells(encounter, current.cell, { actor: movingActor, goal })) {
      const nextKey = cellKey(next);
      const newCost = current.cost + 1;
      if (costSoFar.has(nextKey) && newCost >= costSoFar.get(nextKey)) continue;
      costSoFar.set(nextKey, newCost);
      cameFrom.set(nextKey, cellKey(current.cell));
      queue.push({ cell: next, cost: newCost, priority: newCost + gridDistance(next, goal) });
    }
  }

  return null;
}

function legacyReachableCells(encounterInput, actorInput, { limit = 24 } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput);
  const start = normalizeCell(actor?.cell);
  const maxSteps = Math.floor((Number(actor?.speed) || 0) / 5);
  const queue = [{ cell: start, steps: 0, path: [] }];
  const visited = new Set([`${start.x},${start.y}`]);
  const reachable = [{ ...start, steps: 0, path: [] }];
  const directions = [
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 0 },                    { x: 1, y: 0 },
    { x: -1, y: 1 },  { x: 0, y: 1 },  { x: 1, y: 1 }
  ];
  while (queue.length && reachable.length < limit) {
    const current = queue.shift();
    if (!current || current.steps >= maxSteps) continue;
    for (const direction of directions) {
      const next = { x: current.cell.x + direction.x, y: current.cell.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      if (!isCellInsideBattlefield(encounter, next)) continue;
      if (hasBlockedMovementPath(encounter, current.cell, next)) continue;
      const occupant = occupiedCellMap(encounter, { excludeActorId: actor?.id || null }).get(cellKey(next));
      if (occupant && occupant.side !== actor?.side) continue;
      visited.add(key);
      const entry = { ...next, steps: current.steps + 1, path: [...(current.path || []), normalizeCell(next)], occupied: !!occupant };
      if (!occupant) reachable.push(entry);
      queue.push({ cell: next, steps: entry.steps, path: entry.path });
      if (reachable.length >= limit) break;
    }
  }
  return reachable;
}

/**
 * @typedef {object} PathfindingAdapter
 * @property {(request: object) => {found: boolean, path: Array<object>, cost: number, reason?: string, adapterId?: string}} findPath
 * Finds a legal path for a serializable path request.
 * @property {(request: object) => {tiles: Array<object>, adapterId?: string}} reachable
 * Returns reachable tiles with movement cost, path, and legal-stop metadata.
 * @property {(request: object) => number|null} distance
 * Returns path cost when a path exists, otherwise null.
 */

export class LegacyPathfindingAdapter {
  id = 'legacy';

  findPath(request = {}) {
    const encounter = normalizeEncounterState(request.encounter);
    const actor = request.actor ? normalizeActor(request.actor) : null;
    const fromCell = coordToCell(request.from || request.fromCell);
    const toCell = coordToCell(request.to || request.toCell);
    const path = legacyFindPathCells(encounter, fromCell, toCell, {
      actor,
      maxExpanded: request.maxExpanded || 3000
    });
    if (!path) {
      return {
        found: false,
        path: [],
        cost: Infinity,
        reason: 'No legal legacy path found.',
        adapterId: this.id
      };
    }
    return {
      found: true,
      path: path.map(cellToCoord),
      cost: path.length,
      adapterId: this.id
    };
  }

  reachable(request = {}) {
    const encounter = normalizeEncounterState(request.encounter);
    const actor = normalizeActor(request.actor || {});
    const tiles = legacyReachableCells(encounter, actor, { limit: request.limit || 24 }).map((tile) => ({
      coord: cellToCoord(tile),
      cost: tile.steps || 0,
      path: (tile.path || []).map(cellToCoord),
      legalStop: !tile.occupied
    }));
    return { tiles, adapterId: this.id };
  }

  distance(request = {}) {
    const result = this.findPath(request);
    return result.found ? result.cost : null;
  }
}

export class InternalV2PathfindingAdapter extends LegacyPathfindingAdapter {
  id = 'internal-v2';
}

export function createPathfindingAdapter(adapterId = 'legacy') {
  const normalized = String(adapterId || 'legacy').trim().toLowerCase();
  if (normalized === 'internal-v2') return new InternalV2PathfindingAdapter();
  return new LegacyPathfindingAdapter();
}

export class PathfindingService {
  constructor({ adapter = null, adapterId = null } = {}) {
    this.adapter = adapter || createPathfindingAdapter(adapterId || globalThis?.process?.env?.PATHFINDING_ADAPTER || 'legacy');
  }

  findPath(request = {}) {
    return this.adapter.findPath(request);
  }

  reachable(request = {}) {
    return this.adapter.reachable(request);
  }

  distance(request = {}) {
    return this.adapter.distance(request);
  }

  getLegalDestinations(request = {}) {
    return this.reachable(request).tiles.filter((tile) => tile.legalStop);
  }

  getCandidateMoveActions(actor, encounter, options = {}) {
    return this.getLegalDestinations({
      encounter,
      actor,
      limit: options.limit || options.candidateLimit || 24
    }).map((tile) => ({
      tokenId: actor.id,
      from: cellToCoord(actor.cell),
      to: tile.coord,
      path: tile.path || [],
      movementCost: tile.cost,
      legal: tile.legalStop,
      pathfindingAdapter: this.adapter.id,
      reason: 'Legacy reachable destination.'
    }));
  }
}

export function createPathfindingService(options = {}) {
  return new PathfindingService(options);
}

function pathSignature(path = []) {
  return path.map((coord) => `${coord.row},${coord.col}`).join(' -> ');
}

export function comparePathfindingAdapters({
  adapters = [new LegacyPathfindingAdapter(), new InternalV2PathfindingAdapter()],
  pathRequests = [],
  reachabilityRequests = []
} = {}) {
  const pathComparisons = [];
  for (const request of pathRequests) {
    const results = adapters.map((adapter) => adapter.findPath(request));
    pathComparisons.push({
      request,
      results,
      differences: {
        foundMismatch: new Set(results.map((result) => result.found)).size > 1,
        costMismatch: new Set(results.map((result) => result.found ? result.cost : null)).size > 1,
        pathMismatch: new Set(results.map((result) => pathSignature(result.path))).size > 1,
        equivalentCostDifferentPath: new Set(results.map((result) => result.found ? result.cost : null)).size === 1 &&
          new Set(results.map((result) => pathSignature(result.path))).size > 1
      }
    });
  }

  const reachabilityComparisons = [];
  for (const request of reachabilityRequests) {
    const results = adapters.map((adapter) => adapter.reachable(request));
    const legalDestinationSets = results.map((result) =>
      new Set(result.tiles.filter((tile) => tile.legalStop).map((tile) => `${tile.coord.row},${tile.coord.col}`))
    );
    reachabilityComparisons.push({
      request,
      results,
      differences: {
        reachableTileCountMismatch: new Set(results.map((result) => result.tiles.length)).size > 1,
        legalDestinationMismatch: legalDestinationSets.some((set) =>
          set.size !== legalDestinationSets[0].size ||
          [...set].some((key) => !legalDestinationSets[0].has(key))
        )
      }
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    adapters: adapters.map((adapter) => adapter.id),
    pathComparisons,
    reachabilityComparisons
  };
}

export function findPath(encounterInput, fromCell, toCell, { maxExpanded = 3000, actor = null, pathfinding = null } = {}) {
  const service = pathfinding || createPathfindingService();
  const result = service.findPath({
    encounter: encounterInput,
    actor,
    from: cellToCoord(fromCell),
    to: cellToCoord(toCell),
    maxExpanded
  });
  return result.found ? result.path.map(coordToCell) : null;
}

export function findAttackPositions(encounterInput, actorInput, targetInput, attackInput, { limit = 80 } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput);
  const target = normalizeActor(targetInput);
  const attack = normalizeAttackProfile(attackInput);
  const bounds = battlefieldSearchBounds(encounter);
  const rangeCells = Math.max(1, Math.ceil(attack.rangeFt / 5));
  const positions = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const cell = { x, y };
      if (cellIsOccupied(encounter, cell, { excludeActorId: actor.id })) continue;
      if (gridDistance(cell, target.cell) > rangeCells) continue;
      if (!hasLineOfSight(encounter, actor, target, cell)) continue;
      positions.push({
        cell,
        targetId: target.id,
        attackName: attack.name,
        attackKind: attack.attackKind,
        rangeFt: attack.rangeFt,
        distanceToTarget: gridDistance(cell, target.cell)
      });
      if (positions.length >= limit) return positions;
    }
  }
  return positions;
}

export function rankApproachCells(encounterInput, actorInput, targetInput, attacksInput = [], { limit = 5, pathfinding = null } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput);
  const target = normalizeActor(targetInput);
  const maxSteps = Math.floor((Number(actor?.speed) || 0) / 5);
  const attacks = attacksInput.length ? attacksInput.map(normalizeAttackProfile) : [normalizeAttackProfile({ name: 'Strike', attackKind: 'melee', rangeFt: 5 })];
  const approaches = [];

  for (const attack of attacks) {
    for (const position of findAttackPositions(encounter, actor, target, attack, { limit: 120 })) {
      const path = findPath(encounter, actor.cell, position.cell, { actor, pathfinding });
      if (!path || path.length === 0) continue;
      const preferredAdvanceSteps = maxSteps >= 5
        ? Math.max(1, Math.floor(maxSteps * 0.67))
        : maxSteps;
      const movePath = path.slice(0, Math.min(path.length, preferredAdvanceSteps));
      while (movePath.length && cellIsOccupied(encounter, movePath[movePath.length - 1], { excludeActorId: actor.id })) {
        movePath.pop();
      }
      const destination = movePath[movePath.length - 1];
      if (!destination) continue;
      approaches.push({
        cell: destination,
        path: movePath,
        futureAttackCell: position.cell,
        futureAttackDistance: path.length,
        remainingDistance: Math.max(0, path.length - movePath.length),
        movementUsed: movePath.length,
        reserveCells: Math.max(0, maxSteps - movePath.length),
        laneDeviation: Math.abs(position.cell.y - actor.cell.y),
        attackName: attack.name,
        attackKind: attack.attackKind,
        rangeFt: attack.rangeFt,
        expectedDamage: attack.expectedDamage,
        targetId: target.id
      });
    }
  }

  const bestByCell = new Map();
  for (const approach of approaches) {
    const key = cellKey(approach.cell);
    const existing = bestByCell.get(key);
    if (!existing || approach.futureAttackDistance < existing.futureAttackDistance || approach.expectedDamage > existing.expectedDamage) {
      bestByCell.set(key, approach);
    }
  }

  return [...bestByCell.values()]
    .sort((left, right) =>
      left.remainingDistance - right.remainingDistance ||
      right.reserveCells - left.reserveCells ||
      left.laneDeviation - right.laneDeviation ||
      right.expectedDamage - left.expectedDamage ||
      left.futureAttackDistance - right.futureAttackDistance
    )
    .slice(0, limit);
}

/**
 * @typedef {object} TacticalRulesAdapter
 * @property {(encounterInput: object, actor: object, options?: object) => Array<object>} reachableTiles
 * Returns legal or reachable board cells for a unit.
 * @property {(encounterInput: object, actor: object, options?: object) => Array<TacticalCandidate>} legalActions
 * Returns deterministic legal tactical candidates.
 * @property {(encounterInput: object, fromActor: object, toActor: object, fromCell?: object|null) => boolean} lineOfSight
 * Tests whether one unit can see another from an optional origin cell.
 * @property {(request?: object) => string} cover
 * Reports cover information for a tactical query.
 * @property {(encounterInput: object, actor: object, cell: object) => number} opportunityRisk
 * Reports opportunity or adjacency risk for a destination cell.
 * @property {(request?: object) => {ok: boolean, reason: string}} interactableLegality
 * Reports whether an interactable action is legal.
 */

// Board/rules hybrid adapter for the current D&D/SRD reference implementation.
// It intentionally mixes grid movement, line of sight, cover placeholders,
// pathfinding, and D&D-like assumptions such as speed-to-tile conversion.
// Keep it intact until the adapter boundaries are proven by later patches.
export class SimpleGridRulesAdapter {
  constructor({ pathfinding = null } = {}) {
    this.pathfinding = pathfinding || createPathfindingService();
  }

  reachableTiles(encounterInput, actor, { limit = 24 } = {}) {
    const encounter = normalizeEncounterState(encounterInput);
    const normalizedActor = normalizeActor(actor);
    return this.pathfinding.reachable({
      encounter,
      actor: normalizedActor,
      origin: cellToCoord(normalizedActor.cell),
      movementProfile: {
        maxCost: Math.floor((Number(normalizedActor.speed) || 0) / 5),
        diagonalMovement: 'chebyshev'
      },
      limit
    }).tiles.map((tile) => ({
      ...coordToCell(tile.coord),
      steps: tile.cost,
      path: (tile.path || []).map(coordToCell),
      legalStop: tile.legalStop
    }));
  }

  legalActions(encounterInput, actor, { candidateLimit = 24 } = {}) {
    return generateCandidateActions(encounterInput, actor, { rulesAdapter: this, limit: candidateLimit });
  }

  lineOfSight(encounterInput, fromActor, toActor, fromCell = null) {
    return hasLineOfSight(normalizeEncounterState(encounterInput), fromActor, toActor, fromCell);
  }

  cover() {
    return 'none';
  }

  opportunityRisk(encounterInput, actor, cell) {
    const encounter = normalizeEncounterState(encounterInput);
    return encounter.actors
      .filter((other) => other.id !== actor.id && other.side !== actor.side)
      .some((enemy) => gridDistance(enemy.cell, cell) <= 1) ? 1 : 0;
  }

  interactableLegality() {
    return { ok: true, reason: '' };
  }
}

// Compatibility placeholder for 5e-like behavior. A future Dnd5eSrdAdapter
// should wrap or subclass existing behavior rather than replacing this export
// in place.
export class FiveELikeRulesAdapter extends SimpleGridRulesAdapter {}

function enemiesFor(encounter, actor) {
  return encounter.actors.filter((other) => other.id !== actor.id && other.side !== actor.side && other.side !== 'neutral');
}

function alliesFor(encounter, actor) {
  return encounter.actors.filter((other) => other.id !== actor.id && other.side === actor.side);
}

function attackAction(actor, target, attack, fromCell, family, moveSteps = 0, metadata = {}) {
  const movePath = metadata.path?.length ? metadata.path.map(normalizeCell) : pathCellsBetween(actor.cell, fromCell);
  const move = gridDistance(actor.cell, fromCell) > 0
    ? { actorId: actor.id, to: normalizeCell(fromCell), path: movePath }
    : null;
  return {
    id: `${family}:${actor.id}:${target.id}:${attack.name}:${fromCell.x},${fromCell.y}`,
    family,
    actorId: actor.id,
    label: `${actor.name} ${attack.name} vs ${target.name}`,
    move,
    action: {
      type: 'attack',
      actorId: actor.id,
      targetId: target.id,
      details: attack.name,
      attackKind: attack.attackKind,
      rangeFt: attack.rangeFt
    },
    targetIds: [target.id],
    fromCell: normalizeCell(fromCell),
    expectedDamage: attack.expectedDamage,
    moveSteps,
    legal: true,
    metadata
  };
}

function spellAction(actor, target, spell, fromCell, family, moveSteps = 0, metadata = {}) {
  const movePath = metadata.path?.length ? metadata.path.map(normalizeCell) : pathCellsBetween(actor.cell, fromCell);
  const move = gridDistance(actor.cell, fromCell) > 0
    ? { actorId: actor.id, to: normalizeCell(fromCell), path: movePath }
    : null;
  return {
    id: `${family}:${actor.id}:${target?.id || 'self'}:${spell.name}:${fromCell.x},${fromCell.y}`,
    family,
    actorId: actor.id,
    label: `${actor.name} casts ${spell.name}${target ? ` on ${target.name}` : ''}`,
    move,
    action: {
      type: 'spell',
      actorId: actor.id,
      targetId: target?.id || actor.id,
      details: spell.name,
      spellKind: spell.kind,
      targetSide: spell.target,
      rangeFt: spell.rangeFt
    },
    targetIds: target?.id ? [target.id] : [],
    fromCell: normalizeCell(fromCell),
    expectedDamage: spell.kind === 'damage' ? spell.expectedValue : 0,
    moveSteps,
    legal: true,
    metadata: {
      ...metadata,
      spellKind: spell.kind,
      spellTarget: spell.target,
      spellValue: spell.expectedValue
    }
  };
}

function shootAndScootAction(actor, target, attack, attackCell, hideCell, attackPath, hidePath, metadata = {}) {
  const normalizedAttackCell = normalizeCell(attackCell);
  const normalizedHideCell = normalizeCell(hideCell);
  const firstLeg = (attackPath || []).map(normalizeCell);
  const secondLeg = (hidePath || []).map(normalizeCell);
  const fullPath = [...firstLeg, ...secondLeg];
  return {
    id: `shoot_and_scoot:${actor.id}:${target.id}:${attack.name}:${normalizedAttackCell.x},${normalizedAttackCell.y}:${normalizedHideCell.x},${normalizedHideCell.y}`,
    family: 'shoot_and_scoot',
    actorId: actor.id,
    label: `${actor.name} ${attack.name} vs ${target.name}, then breaks line of sight`,
    move: { actorId: actor.id, to: normalizedHideCell, path: fullPath },
    action: {
      type: 'attack',
      actorId: actor.id,
      targetId: target.id,
      details: attack.name,
      attackKind: attack.attackKind,
      rangeFt: attack.rangeFt,
      from: normalizedAttackCell
    },
    targetIds: [target.id],
    fromCell: normalizedHideCell,
    expectedDamage: attack.expectedDamage,
    moveSteps: fullPath.length,
    legal: true,
    metadata: {
      ...metadata,
      attackCell: normalizedAttackCell,
      hideCell: normalizedHideCell,
      attackPath: firstLeg,
      postAttackPath: secondLeg,
      lineOfSightBreak: true,
      postAttackRemainingMovement: Math.max(0, Number(metadata.maxSteps || 0) - fullPath.length)
    }
  };
}

function advanceAction(actor, target, toCell, moveSteps = 0, metadata = {}) {
  const path = metadata.path?.length ? metadata.path.map(normalizeCell) : pathCellsBetween(actor.cell, toCell);
  return {
    id: `advance_to_attack:${actor.id}:${target.id}:${toCell.x},${toCell.y}`,
    family: 'advance_to_attack',
    actorId: actor.id,
    label: `${actor.name} advances toward ${target.name}`,
    move: { actorId: actor.id, to: normalizeCell(toCell), path },
    action: { type: 'dash', actorId: actor.id },
    targetIds: [target.id],
    fromCell: normalizeCell(toCell),
    expectedDamage: 0,
    moveSteps,
    legal: true,
    metadata
  };
}

function visibleEnemiesFromCell(encounter, actor, cell) {
  const actorAtCell = { ...actor, cell: normalizeCell(cell) };
  return enemiesFor(encounter, actor).filter((enemy) => hasLineOfSight(encounter, enemy, actorAtCell, enemy.cell));
}

function distanceToSegment(cell, start, end) {
  if (!cell || !start || !end) return Infinity;
  const px = Number(cell.x);
  const py = Number(cell.y);
  const ax = Number(start.x);
  const ay = Number(start.y);
  const bx = Number(end.x);
  const by = Number(end.y);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isTargetIsolated(encounter, target) {
  if (!target) return false;
  return alliesFor(encounter, target).every((ally) => gridDistance(target.cell, ally.cell) > 2);
}

function isLikelyCaster(actor = {}) {
  const name = String(actor.name || '').toLowerCase();
  return Boolean(actor.spells?.length) || /\b(acolyte|mage|wizard|cleric|priest|druid|warlock|sorcerer)\b/.test(name);
}

function currentHpValue(actor = {}) {
  const match = String(actor.hp || '').match(/^\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function holdHiddenAction(actor, metadata = {}) {
  return {
    id: `hold_hidden:${actor.id}`,
    family: 'hold_hidden',
    actorId: actor.id,
    label: `${actor.name} holds hidden`,
    move: null,
    action: { type: 'hide', actorId: actor.id },
    targetIds: [],
    fromCell: normalizeCell(actor.cell),
    expectedDamage: 0,
    moveSteps: 0,
    legal: true,
    metadata
  };
}

function stalkToCoverAction(actor, cell, metadata = {}) {
  return {
    id: `stalk_to_cover:${actor.id}:${cell.x},${cell.y}`,
    family: 'stalk_to_cover',
    actorId: actor.id,
    label: `${actor.name} stalks to cover`,
    move: { actorId: actor.id, to: normalizeCell(cell), path: metadata.path || pathCellsBetween(actor.cell, cell) },
    action: { type: 'hide', actorId: actor.id },
    targetIds: [],
    fromCell: normalizeCell(cell),
    expectedDamage: 0,
    moveSteps: cell.steps || 0,
    legal: true,
    metadata
  };
}

function targetsForSpell(encounter, actor, spell) {
  if (spell.target === 'self') return [actor];
  if (spell.target === 'ally') return alliesFor(encounter, actor);
  return enemiesFor(encounter, actor);
}

function spellCanTargetFrom(encounter, actor, target, spell, fromCell) {
  if (!target) return false;
  const rangeCells = Math.max(0, Math.ceil(Number(spell.rangeFt || 0) / 5));
  if (spell.target !== 'self' && gridDistance(fromCell, target.cell) > rangeCells) return false;
  if (spell.target === 'enemy' && spell.requiresLineOfSight) {
    return hasLineOfSight(encounter, actor, target, fromCell);
  }
  return true;
}

function findShootAndScootDestination(encounter, actor, attackCell, attackPath, reachable, pathfindingService, maxSteps) {
  const attackSteps = attackPath.length;
  const remainingSteps = Math.max(0, maxSteps - attackSteps);
  if (remainingSteps <= 0) return null;
  const currentVisibilityCount = visibleEnemiesFromCell(encounter, actor, attackCell).length;
  if (currentVisibilityCount === 0) return null;
  const actorAtAttackCell = { ...actor, cell: normalizeCell(attackCell) };
  const localReachable = pathfindingService.reachable({
    encounter,
    actor: actorAtAttackCell,
    origin: cellToCoord(attackCell),
    movementProfile: {
      maxCost: remainingSteps,
      diagonalMovement: 'chebyshev'
    },
    limit: Math.max(12, (remainingSteps * 2 + 1) ** 2)
  }).tiles
    .filter((tile) => tile.legalStop && tile.cost <= remainingSteps)
    .map((tile) => ({
      ...coordToCell(tile.coord),
      steps: tile.cost,
      path: (tile.path || []).map(coordToCell)
    }));
  const candidates = localReachable
    .filter((cell) => cellKey(cell) !== cellKey(attackCell))
    .map((cell) => {
      const visibleCount = visibleEnemiesFromCell(encounter, actor, cell).length;
      return {
        cell,
        path: cell.path || [],
        visibleCount,
        visibilityReduction: currentVisibilityCount - visibleCount,
        totalSteps: attackSteps + (cell.steps || 0),
        distanceFromAttackCell: gridDistance(attackCell, cell)
      };
    })
    .filter(Boolean)
    .filter((candidate) => candidate.visibilityReduction > 0)
    .sort((left, right) =>
      left.visibleCount - right.visibleCount ||
      right.visibilityReduction - left.visibilityReduction ||
      left.totalSteps - right.totalSteps ||
      right.distanceFromAttackCell - left.distanceFromAttackCell
    );
  return candidates[0] || null;
}

function dedupeCandidates(candidates = []) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function truncateCandidatesPreservingBaseline(candidates = [], limit = 24) {
  const normalizedLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const uniqueCandidates = dedupeCandidates(candidates);
  if (!normalizedLimit) return [];
  if (uniqueCandidates.length <= normalizedLimit) return uniqueCandidates;

  const preservedIds = new Set();
  const firstHold = uniqueCandidates.find((candidate) => candidate.family === 'hold_position');
  const firstAdvance = uniqueCandidates.find((candidate) => candidate.family === 'advance_to_attack');
  if (firstHold) preservedIds.add(firstHold.id);
  if (firstAdvance && preservedIds.size < normalizedLimit) preservedIds.add(firstAdvance.id);

  const attackFromCurrent = uniqueCandidates.filter((candidate) => candidate.family === 'attack_from_current');
  for (const candidate of attackFromCurrent.slice(0, Math.max(0, normalizedLimit - preservedIds.size))) {
    preservedIds.add(candidate.id);
  }

  const preservedAfterIndex = uniqueCandidates.map((candidate, index) =>
    uniqueCandidates.slice(index + 1).filter((entry) => preservedIds.has(entry.id)).length
  );
  const output = [];
  for (let index = 0; index < uniqueCandidates.length; index += 1) {
    const candidate = uniqueCandidates[index];
    if (preservedIds.has(candidate.id)) {
      output.push(candidate);
    } else if (output.length < normalizedLimit - preservedAfterIndex[index]) {
      output.push(candidate);
    }
    if (output.length >= normalizedLimit && preservedAfterIndex[index] === 0) break;
  }
  return output.slice(0, normalizedLimit);
}

// Candidate generation still owns most tactical behavior. Do not move it
// wholesale until rules and board adapter boundaries are better proven.
export function generateCandidateActions(encounterInput, actorInput, { rulesAdapter = null, limit = 24, pathfinding = null } = {}) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = normalizeActor(actorInput || encounter.actors.find((entry) => entry.id === encounter.activeActorId));
  if (!actor?.id) return [];
  const pathfindingService = pathfinding || createPathfindingService();
  const resolvedRulesAdapter = rulesAdapter || new SimpleGridRulesAdapter({ pathfinding: pathfindingService });
  const enemies = enemiesFor(encounter, actor);
  const candidates = [];
  const maxSteps = Math.floor((Number(actor?.speed) || 0) / 5);
  const movementEnvelopeLimit = Math.max(1, (maxSteps * 2 + 1) ** 2);
  const reachable = resolvedRulesAdapter.reachableTiles(encounter, actor, { limit: Math.max(limit * 3, movementEnvelopeLimit) });
  const attacks = actor.attacks.length ? actor.attacks : [normalizeAttackProfile({ name: 'Strike', attackKind: 'melee', rangeFt: 5 })];
  const spells = actor.spells || [];
  const role = inferActorRole(actor);
  const currentNearestEnemyDistance = enemies.length
    ? Math.min(...enemies.map((enemy) => gridDistance(actor.cell, enemy.cell)))
    : Infinity;

  for (const enemy of enemies) {
    for (const attack of attacks) {
      const rangeCells = Math.max(1, Math.ceil(attack.rangeFt / 5));
      if (gridDistance(actor.cell, enemy.cell) <= rangeCells && resolvedRulesAdapter.lineOfSight(encounter, actor, enemy, actor.cell)) {
        candidates.push(attackAction(actor, enemy, attack, actor.cell, 'attack_from_current', 0));
        if (role === 'ambusher_bruiser' && isTargetIsolated(encounter, enemy)) {
          candidates.push(attackAction(actor, enemy, attack, actor.cell, 'attack_isolated_target', 0, {
            isolatedTarget: true
          }));
        }
        if (attack.attackKind === 'ranged') {
          const scoot = findShootAndScootDestination(encounter, actor, actor.cell, [], reachable, pathfindingService, maxSteps);
          if (scoot) {
            candidates.push(shootAndScootAction(actor, enemy, attack, actor.cell, scoot.cell, [], scoot.path, {
              maxSteps,
              visibleEnemiesBeforeScoot: visibleEnemiesFromCell(encounter, actor, actor.cell).length,
              visibleEnemiesAfterScoot: scoot.visibleCount,
              visibilityReduction: scoot.visibilityReduction
            }));
          }
        }
      }
      const moveAttackCells = reachable
        .filter((cell) => gridDistance(cell, actor.cell) > 0)
        .filter((cell) => gridDistance(cell, enemy.cell) <= rangeCells)
        .filter((cell) => resolvedRulesAdapter.lineOfSight(encounter, actor, enemy, cell))
        .sort((left, right) => {
          const stepDelta = (left.steps || 0) - (right.steps || 0);
          if (stepDelta) return stepDelta;
          const leftRange = gridDistance(left, enemy.cell);
          const rightRange = gridDistance(right, enemy.cell);
          const rangeDelta = attack.attackKind === 'ranged'
            ? rightRange - leftRange
            : leftRange - rightRange;
          if (rangeDelta) return rangeDelta;
          if (attack.attackKind === 'ranged') {
            const targetVector = { x: Math.sign(enemy.cell.x - actor.cell.x), y: Math.sign(enemy.cell.y - actor.cell.y) };
            const leftMove = { x: Math.sign(left.x - actor.cell.x), y: Math.sign(left.y - actor.cell.y) };
            const rightMove = { x: Math.sign(right.x - actor.cell.x), y: Math.sign(right.y - actor.cell.y) };
            const leftRetreatScore = -(leftMove.x * targetVector.x + leftMove.y * targetVector.y);
            const rightRetreatScore = -(rightMove.x * targetVector.x + rightMove.y * targetVector.y);
            return rightRetreatScore - leftRetreatScore;
          }
          return 0;
        })
        .slice(0, 6);
      for (const cell of moveAttackCells) {
        candidates.push(attackAction(actor, enemy, attack, cell, 'move_and_attack', cell.steps, {
          path: cell.path || pathCellsBetween(actor.cell, cell)
        }));
        if (role === 'ambusher_bruiser' && isTargetIsolated(encounter, enemy)) {
          candidates.push(attackAction(actor, enemy, attack, cell, 'attack_isolated_target', cell.steps, {
            path: cell.path || pathCellsBetween(actor.cell, cell),
            isolatedTarget: true
          }));
        }
        if (attack.attackKind === 'ranged') {
          const attackPath = cell.path || pathCellsBetween(actor.cell, cell);
          const scoot = findShootAndScootDestination(encounter, actor, cell, attackPath, reachable, pathfindingService, maxSteps);
          if (scoot) {
            candidates.push(shootAndScootAction(actor, enemy, attack, cell, scoot.cell, attackPath, scoot.path, {
              maxSteps,
              visibleEnemiesBeforeScoot: visibleEnemiesFromCell(encounter, actor, cell).length,
              visibleEnemiesAfterScoot: scoot.visibleCount,
              visibilityReduction: scoot.visibilityReduction
            }));
          }
        }
      }
    }
  }

  for (const spell of spells) {
    const spellTargets = targetsForSpell(encounter, actor, spell);
    for (const target of spellTargets) {
      if (spellCanTargetFrom(encounter, actor, target, spell, actor.cell)) {
        candidates.push(spellAction(actor, target, spell, actor.cell, 'spell_from_current', 0));
      }
      const moveSpellCells = reachable
        .filter((cell) => gridDistance(cell, actor.cell) > 0)
        .filter((cell) => spellCanTargetFrom(encounter, actor, target, spell, cell))
        .sort((left, right) => {
          const stepDelta = (left.steps || 0) - (right.steps || 0);
          if (stepDelta) return stepDelta;
          return gridDistance(right, target.cell) - gridDistance(left, target.cell);
        })
        .slice(0, 4);
      for (const cell of moveSpellCells) {
        candidates.push(spellAction(actor, target, spell, cell, 'move_and_spell', cell.steps, {
          path: cell.path || pathCellsBetween(actor.cell, cell)
        }));
      }
    }
  }

  const nearestEnemy = enemies
    .map((enemy) => ({ enemy, distance: gridDistance(actor.cell, enemy.cell) }))
    .sort((left, right) => left.distance - right.distance)[0]?.enemy;
  if (nearestEnemy) {
    const approach = rankApproachCells(encounter, actor, nearestEnemy, attacks, { limit: 1, pathfinding: pathfindingService })[0];
    if (approach && gridDistance(approach.cell, actor.cell) > 0) {
      candidates.push(advanceAction(actor, nearestEnemy, approach.cell, approach.path.length, {
        path: approach.path,
        futureAttackCell: approach.futureAttackCell,
        futureAttackDistance: approach.futureAttackDistance,
        remainingDistance: approach.remainingDistance,
        movementUsed: approach.movementUsed,
        reserveCells: approach.reserveCells,
        laneDeviation: approach.laneDeviation,
        attackName: approach.attackName,
        attackKind: approach.attackKind,
        targetId: approach.targetId
      }));
    }

    const retreat = reachable
      .slice()
      .sort((left, right) => gridDistance(right, nearestEnemy.cell) - gridDistance(left, nearestEnemy.cell))[0];
    if (retreat && gridDistance(retreat, actor.cell) > 0) {
      candidates.push({
        id: `disengage_retreat:${actor.id}:${retreat.x},${retreat.y}`,
        family: 'disengage_retreat',
        actorId: actor.id,
        label: `${actor.name} retreats`,
        move: { actorId: actor.id, to: normalizeCell(retreat), path: pathCellsBetween(actor.cell, retreat) },
        action: { type: 'disengage', actorId: actor.id },
        targetIds: [],
        fromCell: normalizeCell(retreat),
        expectedDamage: 0,
        moveSteps: retreat.steps,
        legal: true
      });
    }
  }

  if (role === 'ambusher_bruiser' && currentNearestEnemyDistance > 1) {
    candidates.push(holdHiddenAction(actor, {
      engaged: false,
      visibleEnemiesAtCurrent: visibleEnemiesFromCell(encounter, actor, actor.cell).length
    }));
    const currentVisibility = visibleEnemiesFromCell(encounter, actor, actor.cell).length;
    const stalkCell = reachable
      .filter((cell) => gridDistance(cell, actor.cell) > 0)
      .map((cell) => ({
        ...cell,
        visibleEnemies: visibleEnemiesFromCell(encounter, actor, cell).length
      }))
      .filter((cell) => cell.visibleEnemies <= currentVisibility)
      .sort((left, right) =>
        left.visibleEnemies - right.visibleEnemies ||
        (left.steps || 0) - (right.steps || 0) ||
        gridDistance(left, nearestEnemy?.cell || actor.cell) - gridDistance(right, nearestEnemy?.cell || actor.cell)
      )[0];
    if (stalkCell) {
      candidates.push(stalkToCoverAction(actor, stalkCell, {
        path: stalkCell.path || pathCellsBetween(actor.cell, stalkCell),
        visibleEnemiesBefore: currentVisibility,
        visibleEnemiesAfter: stalkCell.visibleEnemies
      }));
    }
  }

  candidates.push({
    id: `hold_position:${actor.id}`,
    family: 'hold_position',
    actorId: actor.id,
    label: `${actor.name} holds position`,
    move: null,
    action: { type: 'dodge', actorId: actor.id },
    targetIds: [],
    fromCell: normalizeCell(actor.cell),
    expectedDamage: 0,
    moveSteps: 0,
    legal: true
  });

  return truncateCandidatesPreservingBaseline(candidates, limit);
}

/**
 * @typedef {object} ScoreBreakdownNamespaces
 * @property {ScoreBreakdown} universal General tactical terms that are not tied to one ruleset.
 * @property {ScoreBreakdown} targeting Target-priority terms.
 * @property {ScoreBreakdown} role Tactical-role terms.
 * @property {ScoreBreakdown} doctrine Supervisor doctrine terms.
 * @property {ScoreBreakdown} dnd5e Terms currently shaped by the D&D/SRD reference implementation.
 * @property {ScoreBreakdown} uncategorized Terms without an assigned namespace.
 */

const SCORE_BREAKDOWN_NAMESPACE_KEYS = [
  'universal',
  'targeting',
  'role',
  'doctrine',
  'dnd5e',
  'uncategorized'
];

const BASE_SCORE_TERM_NAMESPACES = {
  expectedDamage: 'dnd5e',
  attackValue: 'universal',
  spellValue: 'dnd5e',
  supportSpellValue: 'dnd5e',
  controlSpellValue: 'dnd5e',
  damageSpellValue: 'dnd5e',
  rangedAttackValue: 'dnd5e',
  longRangedAttackValue: 'dnd5e',
  currentPositionValue: 'universal',
  repositionValue: 'universal',
  shootAndScootValue: 'universal',
  lineOfSightBreakValue: 'universal',
  exposedAfterActionPenalty: 'universal',
  meleeClosingPenalty: 'dnd5e',
  killChance: 'dnd5e',
  retaliationRisk: 'universal',
  defensiveValue: 'universal',
  coverGain: 'universal',
  objectiveProgress: 'universal',
  allySupport: 'dnd5e',
  terrainAdvantage: 'universal',
  chokeControl: 'universal',
  interactableUtility: 'universal',
  formationValue: 'universal',
  overkillPenalty: 'dnd5e',
  holdPenalty: 'universal',
  retreatPenalty: 'universal'
};

const SUPERVISOR_SCORE_TERM_NAMESPACES = {
  safeRangedBonus: 'universal',
  shootAndScootBonus: 'universal',
  spellBonus: 'dnd5e',
  attackBonus: 'universal',
  holdWhenNoPressureBonus: 'universal',
  retreatPenalty: 'universal',
  reservationPenalty: 'universal',
  roleSkirmisherShootAndScootBonus: 'role',
  roleSkirmisherBreakLosBonus: 'role',
  roleSkirmisherExposedPenalty: 'role',
  roleBlockerHoldLineBonus: 'role',
  roleBlockerCurrentLineAttackBonus: 'role',
  roleBlockerScreenBonus: 'role',
  roleBlockerSkirmishAwayPenalty: 'role',
  roleBlockerAbandonScreenPenalty: 'role',
  roleBlockerAbandonsLinePenalty: 'role',
  roleBlockerShootAndScootBonusOffset: 'role',
  roleAmbusherHoldHiddenBonus: 'role',
  roleAmbusherStalkToCoverBonus: 'role',
  roleAmbusherAttackIsolatedBonus: 'role',
  roleAmbusherEarlyRevealPenalty: 'role',
  roleAmbusherRangedSkirmishPenalty: 'role',
  roleSupportStaysProtectedBonus: 'role',
  roleSupportBuffBonus: 'role',
  roleSupportMovesAwayFromThreatBonus: 'role',
  roleSupportExposedPenalty: 'role',
  roleSupportMeleeFallbackPenalty: 'role',
  targetPriorityMainThreatBonus: 'targeting',
  targetPriorityLowHpBonus: 'dnd5e',
  targetPriorityCasterBonus: 'dnd5e',
  targetPriorityIsolatedBonus: 'targeting',
  targetPriorityGroupFocusBonus: 'targeting',
  targetPriorityPoorDamagePenalty: 'dnd5e',
  targetPriorityThreatensProtectedBonus: 'targeting',
  doctrineProtectCasterThreatBonus: 'doctrine',
  doctrineProtectCasterInterceptBonus: 'doctrine',
  doctrineProtectCasterScreenBonus: 'doctrine',
  doctrineBlockerLaneBonus: 'doctrine',
  doctrineBlockerAwayPenalty: 'doctrine',
  doctrineIgnoreMainThreatPenalty: 'doctrine'
};

function namespaceScoreBreakdown(breakdown = {}, termNamespaceMap = {}) {
  const namespaced = SCORE_BREAKDOWN_NAMESPACE_KEYS.reduce((groups, key) => {
    groups[key] = {};
    return groups;
  }, {});
  for (const [term, value] of Object.entries(breakdown || {})) {
    const namespace = SCORE_BREAKDOWN_NAMESPACE_KEYS.includes(termNamespaceMap[term])
      ? termNamespaceMap[term]
      : 'uncategorized';
    namespaced[namespace][term] = value;
  }
  return namespaced;
}

export function extractScoringFeatures(encounterInput, candidate) {
  const encounter = normalizeEncounterState(encounterInput);
  const actor = encounter.actors.find((entry) => entry.id === candidate.actorId);
  const target = encounter.actors.find((entry) => candidate.targetIds?.includes(entry.id));
  const allies = actor ? alliesFor(encounter, actor) : [];
  const actorHasLongRangedAttack = actor?.attacks?.some((attack) =>
    attack.attackKind === 'ranged' && Number(attack.rangeFt) >= 60
  ) || false;
  const nearestEnemyDistance = actor
    ? Math.min(...enemiesFor(encounter, actor).map((enemy) => gridDistance(candidate.fromCell || actor.cell, enemy.cell)), Infinity)
    : Infinity;
  const currentNearestEnemyDistance = actor
    ? Math.min(...enemiesFor(encounter, actor).map((enemy) => gridDistance(actor.cell, enemy.cell)), Infinity)
    : Infinity;
  return {
    expectedDamage: normalizeNumber(candidate.expectedDamage, 0),
    attackValue: candidate.action?.type === 'attack' ? 1 : 0,
    spellValue: candidate.action?.type === 'spell' ? normalizeNumber(candidate.metadata?.spellValue, 0) : 0,
    supportSpellValue: candidate.action?.type === 'spell' && ['support', 'healing', 'defensive'].includes(candidate.action?.spellKind) ? 1 : 0,
    controlSpellValue: candidate.action?.type === 'spell' && candidate.action?.spellKind === 'control' ? 1 : 0,
    damageSpellValue: candidate.action?.type === 'spell' && candidate.action?.spellKind === 'damage' ? 1 : 0,
    rangedAttackValue: candidate.action?.type === 'attack' && candidate.action?.attackKind === 'ranged' ? 1 : 0,
    longRangedAttackValue: candidate.action?.type === 'attack' && candidate.action?.attackKind === 'ranged' && Number(candidate.action?.rangeFt) >= 60 ? 1 : 0,
    currentPositionValue: candidate.family === 'attack_from_current' ? 1 : 0,
    repositionValue: candidate.family === 'move_and_attack' || candidate.family === 'advance_to_attack' || candidate.family === 'shoot_and_scoot' || candidate.family === 'move_and_spell' ? 1 : 0,
    shootAndScootValue: candidate.family === 'shoot_and_scoot' ? 1 : 0,
    lineOfSightBreakValue: Math.max(0, normalizeNumber(candidate.metadata?.visibilityReduction, 0)),
    exposedAfterActionPenalty: candidate.action?.attackKind === 'ranged' && normalizeNumber(candidate.metadata?.visibleEnemiesAfterScoot, 0) > 0 ? 1 : 0,
    meleeClosingPenalty: actorHasLongRangedAttack &&
      candidate.family === 'move_and_attack' &&
      candidate.action?.attackKind === 'melee' &&
      currentNearestEnemyDistance > 1 ? 1 : 0,
    killChance: target && String(target.hp).match(/^\d+/)
      ? Math.min(1, normalizeNumber(candidate.expectedDamage, 0) / Math.max(1, Number(String(target.hp).match(/^\d+/)?.[0])))
      : 0,
    retaliationRisk: Number.isFinite(nearestEnemyDistance) && nearestEnemyDistance <= 1 ? 1 : 0,
    defensiveValue: candidate.family === 'disengage_retreat' || candidate.action?.type === 'dodge' ? 1 : 0,
    coverGain: 0,
    objectiveProgress: candidate.family === 'objective_reposition' ? 1 : 0,
    allySupport: candidate.action?.type === 'spell'
      ? ['support', 'healing', 'defensive'].includes(candidate.action?.spellKind) ? 1 : 0
      : allies.some((ally) => gridDistance(candidate.fromCell || actor?.cell || {}, ally.cell) <= 1) ? 1 : 0,
    terrainAdvantage: 0,
    chokeControl: candidate.family === 'move_to_chokepoint' ? 1 : 0,
    interactableUtility: candidate.family === 'use_interactable' ? 1 : 0,
    formationValue: allies.length ? 0.25 : 0,
    overkillPenalty: 0,
    holdPenalty: candidate.family === 'hold_position' ? 1 : 0,
    retreatPenalty: candidate.family === 'disengage_retreat' ? 1 : 0
  };
}

export function scoreCandidate(encounter, candidate, { stance = 'opportunistic' } = {}) {
  const weightsByStance = {
    aggressive: { expectedDamage: 2.2, attackValue: 4, spellValue: 0.7, controlSpellValue: 1.2, damageSpellValue: 1.6, rangedAttackValue: 0.4, longRangedAttackValue: 0.6, currentPositionValue: 0.8, repositionValue: 0.4, shootAndScootValue: 1.8, lineOfSightBreakValue: 0.6, exposedAfterActionPenalty: -1, killChance: 1.5, retaliationRisk: -0.4, meleeClosingPenalty: -1.2, holdPenalty: -3, retreatPenalty: -2 },
    cautious: { expectedDamage: 1.2, attackValue: 3, spellValue: 1, supportSpellValue: 1.8, controlSpellValue: 1.4, rangedAttackValue: 0.8, longRangedAttackValue: 1.2, currentPositionValue: 0.8, repositionValue: 0.3, shootAndScootValue: 2.6, lineOfSightBreakValue: 1.1, exposedAfterActionPenalty: -1.8, defensiveValue: 0.8, retaliationRisk: -1.4, meleeClosingPenalty: -1.8, holdPenalty: -2, retreatPenalty: -1.2 },
    evasive: { expectedDamage: 0.7, attackValue: 2, spellValue: 0.9, supportSpellValue: 1.4, controlSpellValue: 1.8, rangedAttackValue: 0.8, longRangedAttackValue: 1.2, shootAndScootValue: 3, lineOfSightBreakValue: 1.4, exposedAfterActionPenalty: -2, defensiveValue: 1.2, retaliationRisk: -2, meleeClosingPenalty: -2, holdPenalty: -1.5, retreatPenalty: -0.4 },
    protective: { expectedDamage: 1, attackValue: 3, spellValue: 1.2, supportSpellValue: 2.6, controlSpellValue: 1.6, rangedAttackValue: 0.4, longRangedAttackValue: 0.8, currentPositionValue: 0.6, shootAndScootValue: 1.6, lineOfSightBreakValue: 0.7, exposedAfterActionPenalty: -1.2, allySupport: 1.8, formationValue: 1.2, meleeClosingPenalty: -1.4, holdPenalty: -2, retreatPenalty: -1 },
    desperate: { expectedDamage: 2.4, attackValue: 5, spellValue: 0.8, damageSpellValue: 1.8, currentPositionValue: 0.8, shootAndScootValue: 0.8, lineOfSightBreakValue: 0.3, killChance: 2, retaliationRisk: -0.1, meleeClosingPenalty: -0.8, holdPenalty: -4, retreatPenalty: -3 },
    opportunistic: { expectedDamage: 1.6, attackValue: 4, spellValue: 1, supportSpellValue: 1.5, controlSpellValue: 1.5, damageSpellValue: 1.2, rangedAttackValue: 0.6, longRangedAttackValue: 1.2, currentPositionValue: 0.8, repositionValue: 0.4, shootAndScootValue: 2.5, lineOfSightBreakValue: 1, exposedAfterActionPenalty: -1.5, killChance: 1.2, defensiveValue: 0.2, retaliationRisk: -0.8, meleeClosingPenalty: -1.6, holdPenalty: -1, retreatPenalty: -2.5 }
  };
  const features = extractScoringFeatures(encounter, candidate);
  const weights = weightsByStance[stance] || weightsByStance.opportunistic;
  const score = Object.entries(features).reduce((sum, [key, value]) => sum + (weights[key] || 0) * value, 0);
  const scoreBreakdown = Object.entries(features).reduce((breakdown, [key, value]) => {
    const contribution = (weights[key] || 0) * value;
    if (Math.abs(contribution) > 0.0001) breakdown[key] = Number(contribution.toFixed(3));
    return breakdown;
  }, {});
  return { score, features, scoreBreakdown, stance };
}

function candidateActionName(candidate) {
  return candidate?.action?.details || candidate?.metadata?.attackName || candidate?.family || 'action';
}

function actorLabelById(encounter, actorId) {
  const actor = encounter?.actors?.find((entry) => entry.id === actorId);
  return actor ? `${actor.name} [${actor.id}]` : String(actorId || 'none');
}

function candidateTargetLabels(candidate = {}, encounter = null) {
  return (candidate.targetIds || []).map((targetId) => actorLabelById(encounter, targetId));
}

function candidateDiagnosticKey(candidate = {}, actor = null) {
  const destination = candidate.move?.to || candidate.fromCell || actor?.cell || {};
  const from = candidate.action?.from || candidate.metadata?.attackCell || {};
  const hide = candidate.metadata?.hideCell || {};
  return [
    candidate.actorId || actor?.id || '',
    candidate.family || '',
    candidate.action?.type || '',
    candidateActionName(candidate),
    (candidate.targetIds || []).join(','),
    `${destination.x ?? ''},${destination.y ?? ''}`,
    `${from.x ?? ''},${from.y ?? ''}`,
    `${hide.x ?? ''},${hide.y ?? ''}`
  ].join('|');
}

function dedupeScoredEntries(scored = [], actor = null) {
  const seen = new Set();
  const unique = [];
  for (const entry of scored) {
    const key = candidateDiagnosticKey(entry.candidate, actor);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function coordLabel(coord = null) {
  return coord ? `(${coord.x},${coord.y})` : '';
}

function tacticalGroupKey(candidate = {}, actor = null) {
  const destination = candidate.move?.to || candidate.fromCell || actor?.cell || {};
  const endPosture = candidate.family === 'shoot_and_scoot'
    ? 'hide'
    : candidate.family === 'disengage_retreat'
    ? 'retreat'
    : candidate.family === 'hold_position' ? 'hold' : 'active';
  return [
    candidate.actorId || actor?.id || '',
    candidate.action?.type || '',
    candidate.family || '',
    candidateActionName(candidate),
    `${destination.x ?? ''},${destination.y ?? ''}`,
    (candidate.targetIds || []).join(','),
    endPosture
  ].join('|');
}

function buildTacticalSummaryGroups(uniqueScored = [], actor = null, encounter = null, limit = 5) {
  const groups = new Map();
  for (const entry of uniqueScored) {
    const candidate = entry.candidate;
    const key = tacticalGroupKey(candidate, actor);
    const destination = candidate.move?.to || candidate.fromCell || actor?.cell || null;
    const firingCell = candidate.metadata?.attackCell || candidate.action?.from || candidate.fromCell || null;
    const existing = groups.get(key);
    const next = existing || {
      key,
      family: candidate.family,
      actionName: candidateActionName(candidate),
      actionType: candidate.action?.type || null,
      destination,
      endPosture: candidate.family === 'shoot_and_scoot' ? 'hide' : candidate.family,
      targetLabels: candidateTargetLabels(candidate, encounter),
      bestScore: entry.score,
      variantCount: 0,
      firingCells: [],
      bestCandidate: summarizeCandidate(candidate, entry, encounter)
    };
    next.variantCount += 1;
    if (firingCell && !next.firingCells.some((cell) => cell.x === firingCell.x && cell.y === firingCell.y)) {
      next.firingCells.push(firingCell);
    }
    if (entry.score > next.bestScore) {
      next.bestScore = entry.score;
      next.bestCandidate = summarizeCandidate(candidate, entry, encounter);
    }
    groups.set(key, next);
  }
  return [...groups.values()]
    .sort((left, right) => right.bestScore - left.bestScore || right.variantCount - left.variantCount)
    .slice(0, limit);
}

function buildScoreFlatnessDiagnostic(scored = [], topLimit = 8) {
  if (!scored.length) return { status: 'ok', identicalTopCount: 0 };
  const topScore = Number(scored[0].score.toFixed(2));
  const identicalTopCount = scored
    .slice(0, topLimit)
    .filter((entry) => Number(entry.score.toFixed(2)) === topScore).length;
  return {
    status: identicalTopCount >= 3 ? 'warning' : 'ok',
    topScore,
    identicalTopCount,
    inspectedTopCount: Math.min(topLimit, scored.length),
    possibleMissingDifferentiators: identicalTopCount >= 3
      ? ['target_priority', 'cover_quality', 'path_safety', 'role_objective_alignment']
      : []
  };
}

function candidateCategory(candidate = {}) {
  if (candidate.action?.type === 'attack') return 'attack';
  if (candidate.action?.type === 'spell') return 'spell';
  if (candidate.family === 'advance_to_attack') return 'advance';
  if (candidate.family === 'disengage_retreat') return 'retreat';
  if (candidate.family === 'hold_position') return 'hold';
  return candidate.family || 'other';
}

function inferActorRole(actor = {}) {
  const explicitCoreRole = normalizeTacticalMetadata(actor.tactical).coreRole;
  if (explicitCoreRole) return explicitCoreRole;
  const name = String(actor.name || '').toLowerCase();
  const attacks = actor.attacks || [];
  const spells = actor.spells || [];
  if (name.includes('acolyte') || spells.some((spell) => ['support', 'healing', 'defensive'].includes(spell.kind))) return 'support_caster';
  if (name.includes('goblin') && !name.includes('hobgoblin')) return 'skirmisher';
  if (name.includes('hobgoblin')) return 'disciplined_blocker';
  if (name.includes('bugbear')) return 'ambusher_bruiser';
  if (attacks.some((attack) => attack.attackKind === 'ranged' && Number(attack.rangeFt) >= 60)) return 'skirmisher';
  return 'soldier';
}

function expectedCandidateFamiliesForRole(role) {
  if (role === 'skirmisher') return ['shoot_and_scoot', 'attack_from_current', 'move_and_attack'];
  if (role === 'disciplined_blocker') return ['hold_position', 'advance_to_attack', 'move_and_attack', 'attack_from_current'];
  if (role === 'ambusher_bruiser') return ['hold_hidden', 'stalk_to_cover', 'intercept_flanker', 'attack_isolated_target', 'move_and_attack'];
  if (role === 'support_caster') return ['spell_from_current', 'move_and_spell'];
  return ['attack_from_current', 'move_and_attack', 'advance_to_attack'];
}

function buildCandidateSetHealth(actor, uniqueScored = []) {
  const normalizedTactical = normalizeTacticalMetadata(actor.tactical);
  const role = normalizedTactical.coreRole || inferActorRole(actor);
  const availableFamilies = [...new Set(uniqueScored.map((entry) => entry.candidate.family).filter(Boolean))].sort();
  const expectedFamilies = expectedCandidateFamiliesForRole(role);
  const missingExpectedCandidates = expectedFamilies.filter((family) => !availableFamilies.includes(family));
  const unsupportedExpectedCandidates = missingExpectedCandidates.filter((family) => CURRENTLY_UNIMPLEMENTED_CANDIDATE_FAMILIES.has(family));
  const status = missingExpectedCandidates.length >= Math.max(2, Math.ceil(expectedFamilies.length / 2))
    ? 'warning'
    : missingExpectedCandidates.length ? 'weak_pass' : 'pass';
  return {
    role,
    roleSource: normalizedTactical.coreRoleSource || 'heuristic',
    status,
    availableFamilies,
    expectedFamilies,
    missingExpectedCandidates,
    unsupportedExpectedCandidates
  };
}

function buildSpellTargetExplanation(encounter, actor, selected, uniqueScored = []) {
  const spellName = selected.action?.details || 'spell';
  const simplifiedMultiTargetSpells = new Set(['bless']);
  const sameSpellCandidates = uniqueScored.filter((entry) =>
    entry.candidate.action?.type === 'spell' &&
    entry.candidate.action?.details === spellName
  );
  const targetOptions = sameSpellCandidates.map((entry) => {
    const targetId = entry.candidate.targetIds?.[0] || entry.candidate.action?.targetId;
    return {
      target: actorLabelById(encounter, targetId),
      score: Number(entry.score.toFixed(2)),
      family: entry.candidate.family,
      destination: entry.candidate.move?.to || entry.candidate.fromCell || actor?.cell || null
    };
  });
  const selectedTargetId = selected.targetIds?.[0] || selected.action?.targetId;
  return {
    spell: spellName,
    modeledTargeting: 'single_target',
    modelWarning: simplifiedMultiTargetSpells.has(spellName.toLowerCase())
      ? `${spellName} modeled as single_target; support-caster behavior may be distorted compared with full multi-target spell behavior`
      : null,
    selectedTarget: actorLabelById(encounter, selectedTargetId),
    selectedReason: targetOptions.length > 1
      ? 'selected target had the strongest scored spell candidate after movement, range, and supervisor bonuses'
      : 'only one legal target option was generated for this spell',
    targetOptions
  };
}

function roleComplianceForCandidate(actor, candidate, candidateSetHealth = null) {
  const normalizedTactical = normalizeTacticalMetadata(actor.tactical);
  const role = normalizedTactical.coreRole || inferActorRole(actor);
  const checks = [];
  let status = 'pass';
  let concern = '';
  const actionType = candidate?.action?.type || '';
  const attackKind = candidate?.action?.attackKind || '';
  const spellKind = candidate?.action?.spellKind || '';
  const family = candidate?.family || '';

  if (role === 'skirmisher') {
    checks.push({ label: 'usesRangedOrMobility', ok: attackKind === 'ranged' || family === 'shoot_and_scoot' });
    checks.push({ label: 'avoidsMeleeCommitment', ok: attackKind !== 'melee' || family === 'attack_from_current' });
    if (attackKind === 'melee' && family !== 'attack_from_current') {
      status = 'warning';
      concern = 'skirmisher is committing to melee instead of using ranged mobility';
    }
  } else if (role === 'disciplined_blocker') {
    checks.push({ label: 'holdsOrAdvancesLine', ok: ['hold_position', 'advance_to_attack', 'attack_from_current', 'move_and_attack'].includes(family) });
    if (family === 'shoot_and_scoot') {
      status = 'warning';
      concern = 'blocker is behaving like a skirmisher and may abandon the defensive line';
    }
  } else if (role === 'ambusher_bruiser') {
    checks.push({ label: 'pressuresMeleeOrIntercepts', ok: attackKind === 'melee' || ['advance_to_attack', 'hold_position'].includes(family) });
    if (attackKind === 'ranged' || family === 'shoot_and_scoot') {
      status = 'warning';
      concern = 'ambusher bruiser is taking a ranged/skirmish line instead of preserving melee threat';
    } else if (candidateSetHealth?.status === 'warning') {
      status = 'warning';
      concern = 'ambusher bruiser selected a plausible action, but the candidate set lacks ambush-specific options';
    } else if (candidateSetHealth?.status === 'weak_pass') {
      status = 'weak_pass';
      concern = 'ambusher bruiser selected a plausible action, but candidate coverage is thin';
    }
  } else if (role === 'support_caster') {
    checks.push({ label: 'usesSupportOrDefensiveSpell', ok: actionType === 'spell' && ['support', 'healing', 'defensive'].includes(spellKind) });
    if (actionType !== 'spell' || attackKind === 'melee') {
      status = 'warning';
      concern = 'support caster did not use a support, healing, defensive, or offensive spell';
    }
  }

  return { role, roleSource: normalizedTactical.coreRoleSource || 'heuristic', status, concern, checks };
}

function protectedAssetSafetyDelta(encounter, actor, candidate, doctrineContext = {}) {
  const { protectedAsset, mainThreat } = doctrineActors(encounter, doctrineContext);
  const finalCell = candidateFinalCell(candidate, actor);
  if (!actor?.cell || !finalCell || !protectedAsset || !mainThreat) return null;
  const current = screenGeometryMetrics(actor.cell, protectedAsset, mainThreat);
  const final = screenGeometryMetrics(finalCell, protectedAsset, mainThreat);
  const currentScreens = isScreeningProtectedAsset({ family: 'hold_position', fromCell: actor.cell }, actor, protectedAsset, mainThreat);
  const finalScreens = isScreeningProtectedAsset(candidate, actor, protectedAsset, mainThreat);
  const deltaScreenScore = Number((final.score - current.score).toFixed(3));
  const deltaLineDistance = Number((final.lineDistance - current.lineDistance).toFixed(3));
  const deltaProtectedDistance = final.protectedDistance - current.protectedDistance;
  const deltaThreatDistance = final.threatDistance - current.threatDistance;
  const maintainsProtectedScreen = candidateMaintainsProtectedScreen(candidate, actor, protectedAsset, mainThreat);
  const worsensProtectedScreen = candidateWorsensProtectedScreen(candidate, actor, protectedAsset, mainThreat);
  return {
    protectedAsset: { id: protectedAsset.id, name: protectedAsset.name },
    mainThreat: { id: mainThreat.id, name: mainThreat.name },
    currentCell: normalizeCell(actor.cell),
    finalCell: normalizeCell(finalCell),
    currentProtectedDistance: current.protectedDistance,
    finalProtectedDistance: final.protectedDistance,
    deltaProtectedDistance,
    currentThreatDistance: current.threatDistance,
    finalThreatDistance: final.threatDistance,
    deltaThreatDistance,
    currentLineDistance: Number(current.lineDistance.toFixed(3)),
    finalLineDistance: Number(final.lineDistance.toFixed(3)),
    deltaLineDistance,
    currentScreenScore: Number(current.score.toFixed(3)),
    finalScreenScore: Number(final.score.toFixed(3)),
    deltaScreenScore,
    currentScreens,
    finalScreens,
    maintainsProtectedScreen,
    worsensProtectedScreen,
    assessment: worsensProtectedScreen
      ? 'worsens'
      : deltaScreenScore > 0.25 || deltaLineDistance < -0.25 || deltaThreatDistance < 0
      ? 'improves'
      : 'preserves'
  };
}

function buildCandidateDiagnostics(encounter, actor, scored = [], selected = null, doctrineContext = {}) {
  const uniqueScored = dedupeScoredEntries(scored, actor);
  const selectedKey = selected ? candidateDiagnosticKey(selected, actor) : '';
  const selectedRawRank = selected ? scored.findIndex((entry) => entry.candidate.id === selected.id) + 1 : null;
  const selectedDedupRank = selectedKey
    ? uniqueScored.findIndex((entry) => candidateDiagnosticKey(entry.candidate, actor) === selectedKey) + 1
    : null;
  const rawCategoryCounts = scored.reduce((counts, entry) => {
    const category = candidateCategory(entry.candidate);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const uniqueCategoryCounts = uniqueScored.reduce((counts, entry) => {
    const category = candidateCategory(entry.candidate);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const topByCategory = {};
  for (const entry of uniqueScored) {
    const category = candidateCategory(entry.candidate);
    if (!topByCategory[category]) topByCategory[category] = summarizeCandidate(entry.candidate, entry, encounter, { actor, doctrineContext });
  }
  const topRejectedAlternatives = uniqueScored
    .filter((entry) => !selectedKey || candidateDiagnosticKey(entry.candidate, actor) !== selectedKey)
    .slice(0, 3)
    .map((entry) => summarizeCandidate(entry.candidate, entry, encounter, { actor, doctrineContext }));
  const reservationRejected = scored
    .filter((entry) => entry.supervisorFeatures?.reservationPenalty < 0)
    .slice(0, 5)
    .map((entry) => summarizeCandidate(entry.candidate, entry, encounter, { actor, doctrineContext }));
  const targetsRepresented = uniqueScored.reduce((targets, entry) => {
    const targetId = entry.candidate.targetIds?.[0] || 'none';
    const target = encounter.actors.find((actorEntry) => actorEntry.id === targetId);
    const label = target ? `${target.name} [${target.id}]` : targetId;
    targets[label] = (targets[label] || 0) + 1;
    return targets;
  }, {});
  const selectedScored = selected
    ? scored.find((entry) => entry.candidate.id === selected.id) || uniqueScored.find((entry) => candidateDiagnosticKey(entry.candidate, actor) === selectedKey)
    : null;
  const candidateSetHealth = buildCandidateSetHealth(actor, uniqueScored);
  const tacticalSummaryGroups = buildTacticalSummaryGroups(uniqueScored, actor, encounter, 5);
  const scoreFlatness = buildScoreFlatnessDiagnostic(scored);

  return {
    rawCandidateCount: scored.length,
    mechanicallyDistinctCandidateCount: uniqueScored.length,
    deduplicatedCandidateCount: uniqueScored.length,
    tacticalGroupCount: new Set(uniqueScored.map((entry) => tacticalGroupKey(entry.candidate, actor))).size,
    selectedRawRank,
    selectedDeduplicatedRank: selectedDedupRank || null,
    rawCategoryCounts,
    uniqueCategoryCounts,
    targetsRepresented,
    selectedScoreBreakdown: selectedScored?.scoreBreakdown || null,
    selectedSupervisorBreakdown: selectedScored?.supervisorFeatures || null,
    selectedProtectedAssetSafetyDelta: selected ? protectedAssetSafetyDelta(encounter, actor, selected, doctrineContext) : null,
    topByCategory,
    topRejectedAlternatives,
    reservationRejected,
    tacticalSummaryGroups,
    scoreFlatness,
    candidateSetHealth,
    spellTargetExplanation: selected?.action?.type === 'spell' ? buildSpellTargetExplanation(encounter, actor, selected, uniqueScored) : null,
    roleCompliance: selected ? roleComplianceForCandidate(actor, selected, candidateSetHealth) : null
  };
}

function buildSupervisorBattlefieldAssessment(encounter, actorIds = []) {
  const actors = actorIds
    .map((actorId) => encounter.actors.find((actor) => actor.id === actorId))
    .filter(Boolean);
  const roles = actors.reduce((counts, actor) => {
    const role = inferActorRole(actor);
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const enemies = actors.length ? enemiesFor(encounter, actors[0]) : [];
  const protectedAsset = actors.find((actor) => inferActorRole(actor) === 'support_caster') || null;
  const doctrine = roles.support_caster
    ? 'protect_caster'
    : roles.skirmisher && roles.skirmisher >= Math.max(2, actors.length / 2)
    ? 'ranged_ambush_focus_fire'
    : roles.disciplined_blocker
    ? 'hold_defensive_line'
    : roles.ambusher_bruiser
    ? 'opportunistic_melee'
    : 'split_and_punish';
  const primaryFocusTarget = enemies
    .map((enemy) => ({
      enemy,
      score: actors.reduce((sum, actor) => {
        const visible = hasLineOfSight(encounter, actor, enemy, actor.cell) ? 2 : 0;
        const distance = Math.max(1, gridDistance(actor.cell, enemy.cell));
        return sum + visible + (1 / distance);
      }, 0)
    }))
    .sort((left, right) => right.score - left.score)[0]?.enemy || null;

  return {
    doctrine,
    roles,
    primaryFocusTarget: primaryFocusTarget ? { id: primaryFocusTarget.id, name: primaryFocusTarget.name } : null,
    protectedAsset: protectedAsset ? { id: protectedAsset.id, name: protectedAsset.name, role: inferActorRole(protectedAsset) } : null,
    posture: doctrine === 'protect_caster' || doctrine === 'hold_defensive_line' ? 'defensive_control' : 'pressure',
    mainRisk: roles.disciplined_blocker && roles.skirmisher
      ? 'blockers may be pulled into skirmish behavior if ranged shots dominate local scoring'
      : roles.support_caster
      ? 'support caster safety depends on allied spacing and reservation choices'
      : 'local candidate ranking may not optimize global group posture'
  };
}

function summarizeCandidate(candidate, scored = null, encounter = null, { actor = null, doctrineContext = null } = {}) {
  return {
    id: candidate.id,
    family: candidate.family,
    label: candidate.label,
    actionType: candidate.action?.type || null,
    attackKind: candidate.action?.attackKind || null,
    spellKind: candidate.action?.spellKind || null,
    spellValue: candidate.metadata?.spellValue ?? null,
    targetIds: candidate.targetIds || [],
    targetLabels: candidateTargetLabels(candidate, encounter),
    actionName: candidateActionName(candidate),
    moveTo: candidate.move?.to || null,
    pathLength: candidate.move?.path?.length ?? 0,
    moveSteps: candidate.moveSteps || 0,
    expectedDamage: normalizeNumber(candidate.expectedDamage, 0),
    futureAttackCell: candidate.metadata?.futureAttackCell || null,
    futureAttackDistance: candidate.metadata?.futureAttackDistance ?? null,
    remainingDistance: candidate.metadata?.remainingDistance ?? null,
    movementUsed: candidate.metadata?.movementUsed ?? null,
    reserveCells: candidate.metadata?.reserveCells ?? null,
    laneDeviation: candidate.metadata?.laneDeviation ?? null,
    approachAttack: candidate.metadata?.attackName || null,
    attackCell: candidate.metadata?.attackCell || candidate.action?.from || null,
    hideCell: candidate.metadata?.hideCell || null,
    visibleEnemiesBeforeScoot: candidate.metadata?.visibleEnemiesBeforeScoot ?? null,
    visibleEnemiesAfterScoot: candidate.metadata?.visibleEnemiesAfterScoot ?? null,
    visibilityReduction: candidate.metadata?.visibilityReduction ?? null,
    score: scored?.score ?? null,
    features: scored?.features || null,
    scoreBreakdown: scored?.scoreBreakdown || null,
    supervisorBreakdown: scored?.supervisorFeatures || null,
    protectedAssetSafetyDelta: actor && doctrineContext
      ? protectedAssetSafetyDelta(encounter, actor, candidate, doctrineContext)
      : null
  };
}

function topCandidateSummaries(encounter, candidates, { stance = 'opportunistic', limit = 5 } = {}) {
  const scored = candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(encounter, candidate, { stance }) }))
    .sort((left, right) => right.score - left.score || left.candidate.moveSteps - right.candidate.moveSteps);
  return dedupeScoredEntries(scored)
    .slice(0, limit)
    .map((entry) => summarizeCandidate(entry.candidate, entry, encounter));
}

function candidateFamilyCounts(candidates = []) {
  return candidates.reduce((counts, candidate) => {
    counts[candidate.family] = (counts[candidate.family] || 0) + 1;
    return counts;
  }, {});
}

function candidateDestinationKey(candidate, actor = null) {
  const destination = candidate?.move?.to || candidate?.fromCell || actor?.cell;
  return destination ? cellKey(destination) : '';
}

function filterReservedCandidates(candidates = [], actor = null, reservedDestinations = new Set()) {
  if (!reservedDestinations?.size) return candidates;
  return candidates.filter((candidate) => {
    const key = candidateDestinationKey(candidate, actor);
    return !key || !reservedDestinations.has(key);
  });
}

function candidateFinalCell(candidate, actor = null) {
  return candidate?.move?.to || candidate?.fromCell || actor?.cell || null;
}

function screenGeometryScore(cell, protectedAsset, mainThreat) {
  return screenGeometryMetrics(cell, protectedAsset, mainThreat).score;
}

function screenGeometryMetrics(cell, protectedAsset, mainThreat) {
  if (!cell || !protectedAsset?.cell || !mainThreat?.cell) {
    return {
      protectedDistance: Infinity,
      threatDistance: Infinity,
      threatToAssetDistance: Infinity,
      lineDistance: Infinity,
      between: false,
      score: 0
    };
  }
  const protectedDistance = gridDistance(cell, protectedAsset.cell);
  const threatDistance = gridDistance(cell, mainThreat.cell);
  const threatToAssetDistance = Math.max(1, gridDistance(mainThreat.cell, protectedAsset.cell));
  const lineDistance = distanceToSegment(cell, mainThreat.cell, protectedAsset.cell);
  const between = threatDistance < threatToAssetDistance && protectedDistance < threatToAssetDistance;
  return {
    protectedDistance,
    threatDistance,
    threatToAssetDistance,
    lineDistance,
    between,
    score: Math.max(0, 6 - protectedDistance) +
      Math.max(0, 3 - lineDistance) +
      (between ? 3 : 0)
  };
}

function candidateMaintainsProtectedScreen(candidate, actor, protectedAsset, mainThreat) {
  const finalCell = candidateFinalCell(candidate, actor);
  if (!actor?.cell || !finalCell || !protectedAsset || !mainThreat) return false;
  const current = screenGeometryMetrics(actor.cell, protectedAsset, mainThreat);
  const final = screenGeometryMetrics(finalCell, protectedAsset, mainThreat);
  const laneNotOpened = final.threatDistance <= current.threatDistance;
  const screenNotWorse = final.score >= current.score - 0.25;
  const lineImproves = final.lineDistance < current.lineDistance - 0.25;
  const holdsLine = final.between && final.lineDistance <= current.lineDistance + 0.25;
  const improvesInterception = final.threatDistance < current.threatDistance && final.lineDistance <= current.lineDistance + 0.5;
  return laneNotOpened && screenNotWorse && (holdsLine || lineImproves || improvesInterception);
}

function candidateWorsensProtectedScreen(candidate, actor, protectedAsset, mainThreat) {
  const finalCell = candidateFinalCell(candidate, actor);
  if (!actor?.cell || !finalCell || !protectedAsset || !mainThreat) return false;
  const currentScore = screenGeometryScore(actor.cell, protectedAsset, mainThreat);
  const finalScore = screenGeometryScore(finalCell, protectedAsset, mainThreat);
  const currentlyScreens = isScreeningProtectedAsset({ family: 'hold_position', fromCell: actor.cell }, actor, protectedAsset, mainThreat);
  const finallyScreens = isScreeningProtectedAsset(candidate, actor, protectedAsset, mainThreat);
  return !candidateMaintainsProtectedScreen(candidate, actor, protectedAsset, mainThreat) ||
    finalScore < currentScore - 0.5 ||
    (currentlyScreens && !finallyScreens);
}

function disciplinedBlockerWorseningShootAndScoot(encounter, actor, candidate, doctrineContext = {}, roleGateContext = null) {
  const { protectedAsset, mainThreat } = doctrineActors(encounter, doctrineContext);
  if (!protectedAsset || !mainThreat) return false;
  if (!disciplinedBlockerShootAndScootScreenDuty(actor, candidate, doctrineContext, roleGateContext)) return false;
  return candidateWorsensProtectedScreen(candidate, actor, protectedAsset, mainThreat);
}

function disciplinedBlockerShootAndScootScreenDuty(actor, candidate, doctrineContext = {}, roleGateContext = null) {
  if (inferActorRole(actor) !== 'disciplined_blocker') return false;
  if (doctrineContext?.doctrine !== 'protect_caster') return false;
  if (candidate?.family !== 'shoot_and_scoot') return false;
  return Boolean(roleGateContext?.hasLinePreservingBlockerAlternative);
}

function hasLinePreservingBlockerAlternative(candidates = [], actor = {}, doctrineContext = {}, encounter = {}) {
  const { protectedAsset, mainThreat } = doctrineActors(encounter, doctrineContext);
  if (!protectedAsset || !mainThreat || !actor?.cell) return false;
  const currentScore = screenGeometryScore(actor.cell, protectedAsset, mainThreat);
  const currentProtectedDistance = gridDistance(actor.cell, protectedAsset.cell);
  const currentlyScreens = isScreeningProtectedAsset({ family: 'hold_position', fromCell: actor.cell }, actor, protectedAsset, mainThreat);
  return candidates.some((candidate) => {
    if (candidate.actorId !== actor.id) return false;
    if (candidate.family === 'shoot_and_scoot') return false;
    if (candidate.family === 'attack_from_current' && (currentlyScreens || currentProtectedDistance <= 4)) return true;
    if (candidate.family === 'hold_position' && (currentlyScreens || currentProtectedDistance <= 4)) return true;
    if (!['move_and_attack', 'advance_to_attack'].includes(candidate.family)) return false;
    const finalCell = candidateFinalCell(candidate, actor);
    if (!finalCell) return false;
    return screenGeometryScore(finalCell, protectedAsset, mainThreat) >= currentScore;
  });
}

function buildRoleGateContext(encounter = {}, actor = {}, candidates = [], doctrineContext = {}) {
  const role = inferActorRole(actor);
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const currentNearestEnemyDistance = actor
    ? Math.min(...enemiesFor(encounter, actor).map((enemy) => gridDistance(actor.cell, enemy.cell)), Infinity)
    : Infinity;
  const hasSafeHold = candidateList.some((candidate) =>
    candidate.family === 'hold_position' &&
    candidate.actorId === actor.id &&
    (Number.isFinite(currentNearestEnemyDistance) ? currentNearestEnemyDistance > 1 : true)
  );
  const hasSupportPreferredAlternative = role === 'support_caster' && candidateList.some((candidate) =>
    candidate.actorId === actor.id &&
    (
      ['spell_from_current', 'move_and_spell'].includes(candidate.family) ||
      candidate.family === 'disengage_retreat' ||
      hasSafeHold
    )
  );
  const hasAmbusherRoleShapedAlternative = role === 'ambusher_bruiser' && candidateList.some((candidate) =>
    candidate.actorId === actor.id &&
    (
      ['hold_hidden', 'stalk_to_cover', 'attack_isolated_target', 'intercept_flanker'].includes(candidate.family) ||
      (['attack_from_current', 'move_and_attack'].includes(candidate.family) && candidate.action?.attackKind === 'melee')
    )
  );
  return {
    role,
    hasSupportPreferredAlternative,
    hasAmbusherRoleShapedAlternative,
    hasLinePreservingBlockerAlternative: role === 'disciplined_blocker'
      ? hasLinePreservingBlockerAlternative(candidateList, actor, doctrineContext, encounter)
      : false
  };
}

function doctrineActors(encounter, doctrineContext = {}) {
  const protectedAsset = doctrineContext.protectedAsset?.id
    ? encounter.actors.find((actor) => actor.id === doctrineContext.protectedAsset.id)
    : null;
  const mainThreat = doctrineContext.primaryFocusTarget?.id
    ? encounter.actors.find((actor) => actor.id === doctrineContext.primaryFocusTarget.id)
    : null;
  return { protectedAsset, mainThreat };
}

function isScreeningProtectedAsset(candidate, actor, protectedAsset, mainThreat) {
  const finalCell = candidateFinalCell(candidate, actor);
  if (!finalCell || !protectedAsset || !mainThreat) return false;
  const nearLine = distanceToSegment(finalCell, protectedAsset.cell, mainThreat.cell) <= 1.25;
  const nearProtected = gridDistance(finalCell, protectedAsset.cell) <= 4;
  const between = gridDistance(finalCell, mainThreat.cell) < gridDistance(protectedAsset.cell, mainThreat.cell);
  return nearLine && nearProtected && between;
}

function roleScoreModifiers(encounter, actor, candidate, doctrineContext = {}, roleGateContext = null) {
  const role = inferActorRole(actor);
  const { protectedAsset, mainThreat } = doctrineActors(encounter, doctrineContext);
  const finalCell = candidateFinalCell(candidate, actor);
  const currentProtectedDistance = protectedAsset ? gridDistance(actor.cell, protectedAsset.cell) : Infinity;
  const finalProtectedDistance = protectedAsset && finalCell ? gridDistance(finalCell, protectedAsset.cell) : Infinity;
  const screening = isScreeningProtectedAsset(candidate, actor, protectedAsset, mainThreat);
  const blockerShootAndScootScreenDuty = disciplinedBlockerShootAndScootScreenDuty(actor, candidate, doctrineContext, roleGateContext);
  const blockerMaintainsShootAndScootScreen = blockerShootAndScootScreenDuty
    ? candidateMaintainsProtectedScreen(candidate, actor, protectedAsset, mainThreat)
    : true;
  const blockerWorseningShootAndScoot = disciplinedBlockerWorseningShootAndScoot(encounter, actor, candidate, doctrineContext, roleGateContext);
  const visibleAfter = normalizeNumber(candidate.metadata?.visibleEnemiesAfterScoot, visibleEnemiesFromCell(encounter, actor, finalCell || actor.cell).length);
  const breakdown = {};

  if (role === 'skirmisher') {
    if (candidate.family === 'shoot_and_scoot') breakdown.roleSkirmisherShootAndScootBonus = 3;
    if (normalizeNumber(candidate.metadata?.visibilityReduction, 0) > 0 || visibleAfter === 0) breakdown.roleSkirmisherBreakLosBonus = 2;
    if (candidate.action?.attackKind === 'melee' || visibleAfter > 0) breakdown.roleSkirmisherExposedPenalty = -5;
  } else if (role === 'disciplined_blocker') {
    if (candidate.family === 'hold_position' && finalProtectedDistance <= 4) breakdown.roleBlockerHoldLineBonus = 4;
    if (candidate.family === 'attack_from_current' && currentProtectedDistance <= 4) breakdown.roleBlockerCurrentLineAttackBonus = 3;
    if (screening && blockerMaintainsShootAndScootScreen) breakdown.roleBlockerScreenBonus = 3;
    if (candidate.family === 'shoot_and_scoot' && finalProtectedDistance > currentProtectedDistance) breakdown.roleBlockerSkirmishAwayPenalty = -4;
    if (protectedAsset && currentProtectedDistance <= 4 && finalProtectedDistance > currentProtectedDistance + 1) breakdown.roleBlockerAbandonScreenPenalty = -3;
    if (blockerWorseningShootAndScoot) {
      breakdown.roleBlockerAbandonsLinePenalty = -14;
    }
  } else if (role === 'ambusher_bruiser') {
    if (candidate.family === 'hold_hidden') breakdown.roleAmbusherHoldHiddenBonus = 4;
    if (candidate.family === 'stalk_to_cover') breakdown.roleAmbusherStalkToCoverBonus = 3;
    if (candidate.family === 'attack_isolated_target' || candidate.metadata?.isolatedTarget) breakdown.roleAmbusherAttackIsolatedBonus = 5;
    if (!candidate.metadata?.isolatedTarget && ['advance_to_attack', 'move_and_attack'].includes(candidate.family)) breakdown.roleAmbusherEarlyRevealPenalty = -3;
    if (
      roleGateContext?.hasAmbusherRoleShapedAlternative &&
      !candidate.metadata?.isolatedTarget &&
      (candidate.family === 'shoot_and_scoot' || candidate.action?.attackKind === 'ranged')
    ) {
      breakdown.roleAmbusherRangedSkirmishPenalty = -18;
    }
  } else if (role === 'support_caster') {
    if (protectedAsset?.id === actor.id || finalProtectedDistance <= currentProtectedDistance) breakdown.roleSupportStaysProtectedBonus = 4;
    if (candidate.action?.type === 'spell' && ['support', 'healing', 'defensive'].includes(candidate.action?.spellKind)) breakdown.roleSupportBuffBonus = 3;
    const currentThreatDistance = mainThreat ? gridDistance(actor.cell, mainThreat.cell) : Infinity;
    const finalThreatDistance = mainThreat && finalCell ? gridDistance(finalCell, mainThreat.cell) : Infinity;
    if (finalThreatDistance > currentThreatDistance) breakdown.roleSupportMovesAwayFromThreatBonus = 3;
    if (finalThreatDistance <= 1 || visibleAfter > 0) breakdown.roleSupportExposedPenalty = -5;
    if (
      roleGateContext?.hasSupportPreferredAlternative &&
      candidate.action?.type === 'attack' &&
      candidate.action?.attackKind === 'melee'
    ) {
      breakdown.roleSupportMeleeFallbackPenalty = -14;
    }
  }

  return breakdown;
}

function targetPriorityModifiers(encounter, actor, candidate, doctrineContext = {}) {
  const target = encounter.actors.find((entry) => candidate.targetIds?.includes(entry.id));
  if (!target) return {};
  const { protectedAsset, mainThreat } = doctrineActors(encounter, doctrineContext);
  const breakdown = {};
  if (mainThreat?.id && target.id === mainThreat.id) breakdown.targetPriorityMainThreatBonus = 4;
  const hp = currentHpValue(target);
  if (hp != null && hp <= 10) breakdown.targetPriorityLowHpBonus = 3;
  if (isLikelyCaster(target)) breakdown.targetPriorityCasterBonus = 3;
  if (isTargetIsolated(encounter, target)) breakdown.targetPriorityIsolatedBonus = 2;
  if (doctrineContext.primaryFocusTarget?.id && target.id === doctrineContext.primaryFocusTarget.id) breakdown.targetPriorityGroupFocusBonus = 1.5;
  if (normalizeNumber(candidate.expectedDamage, 0) < 3) breakdown.targetPriorityPoorDamagePenalty = -2;
  if (protectedAsset && target.id === mainThreat?.id && gridDistance(target.cell, protectedAsset.cell) <= 8) {
    breakdown.targetPriorityThreatensProtectedBonus = 4;
  }
  return breakdown;
}

function doctrineScoreModifiers(encounter, actor, candidate, doctrineContext = {}) {
  if (doctrineContext.doctrine !== 'protect_caster') return {};
  const { protectedAsset, mainThreat } = doctrineActors(encounter, doctrineContext);
  if (!protectedAsset || !mainThreat) return {};
  const targetId = candidate.targetIds?.[0] || null;
  const finalCell = candidateFinalCell(candidate, actor);
  const currentProtectedDistance = gridDistance(actor.cell, protectedAsset.cell);
  const finalProtectedDistance = finalCell ? gridDistance(finalCell, protectedAsset.cell) : currentProtectedDistance;
  const screening = isScreeningProtectedAsset(candidate, actor, protectedAsset, mainThreat);
  const role = inferActorRole(actor);
  const blockerShootAndScoot = role === 'disciplined_blocker' &&
    doctrineContext?.doctrine === 'protect_caster' &&
    candidate.family === 'shoot_and_scoot';
  const blockerMaintainsShootAndScootScreen = blockerShootAndScoot
    ? candidateMaintainsProtectedScreen(candidate, actor, protectedAsset, mainThreat)
    : true;
  const blockerWorseningShootAndScoot = blockerShootAndScoot &&
    candidate.family === 'shoot_and_scoot' &&
    candidateWorsensProtectedScreen(candidate, actor, protectedAsset, mainThreat);
  const breakdown = {};

  if (candidate.action?.type === 'attack' && targetId === mainThreat.id) breakdown.doctrineProtectCasterThreatBonus = 3;
  if (screening && blockerMaintainsShootAndScootScreen) breakdown.doctrineProtectCasterInterceptBonus = 3;
  if (finalProtectedDistance <= currentProtectedDistance && finalProtectedDistance <= 4 && blockerMaintainsShootAndScootScreen) breakdown.doctrineProtectCasterScreenBonus = 2;
  if (role === 'disciplined_blocker' && screening && blockerMaintainsShootAndScootScreen) breakdown.doctrineBlockerLaneBonus = 2;
  if (role === 'disciplined_blocker' && finalProtectedDistance > currentProtectedDistance + 1) breakdown.doctrineBlockerAwayPenalty = -3;
  if (targetId && targetId !== mainThreat.id && gridDistance(mainThreat.cell, protectedAsset.cell) <= 8) breakdown.doctrineIgnoreMainThreatPenalty = -2;
  return breakdown;
}

function scriptedAttackPriority(encounter, actor, candidate) {
  const actorHasLongRangedAttack = actor?.attacks?.some((attack) =>
    attack.attackKind === 'ranged' && Number(attack.rangeFt) >= 60
  ) || false;
  const currentNearestEnemyDistance = actor
    ? Math.min(...enemiesFor(encounter, actor).map((enemy) => gridDistance(actor.cell, enemy.cell)), Infinity)
    : Infinity;
  const longRangedBonus = candidate.action?.attackKind === 'ranged' && Number(candidate.action?.rangeFt) >= 60 ? 2 : 0;
  const shootAndScootBonus = candidate.family === 'shoot_and_scoot' ? 3 + normalizeNumber(candidate.metadata?.visibilityReduction, 0) : 0;
  const spellBonus = candidate.action?.type === 'spell'
    ? 4 + normalizeNumber(candidate.metadata?.spellValue, 0) + (candidate.action?.spellKind === 'support' ? 2 : 0)
    : 0;
  const avoidUnforcedMelee = actorHasLongRangedAttack &&
    candidate.family === 'move_and_attack' &&
    candidate.action?.attackKind === 'melee' &&
    currentNearestEnemyDistance > 1 ? -2 : 0;
  return normalizeNumber(candidate.expectedDamage, 0) + longRangedBonus + shootAndScootBonus + spellBonus + avoidUnforcedMelee;
}

function sumBreakdown(breakdown = {}) {
  return Object.values(breakdown).reduce((sum, value) => sum + normalizeNumber(value, 0), 0);
}

function supervisedCandidateScore(encounter, actor, candidate, { stance = 'opportunistic', reservedDestinations = new Set(), doctrineContext = null, roleGateContext = null } = {}) {
  const scored = scoreCandidate(encounter, candidate, { stance });
  const destination = candidate.move?.to || candidate.fromCell || actor?.cell;
  const destinationKey = destination ? cellKey(destination) : '';
  const currentEnemyDistance = actor
    ? Math.min(...enemiesFor(encounter, actor).map((enemy) => gridDistance(actor.cell, enemy.cell)), Infinity)
    : Infinity;
  const safeRangedBonus = candidate.action?.attackKind === 'ranged' && currentEnemyDistance > 1 ? 1.5 : 0;
  const shootAndScootBonus = candidate.family === 'shoot_and_scoot' ? 3 + normalizeNumber(candidate.metadata?.visibilityReduction, 0) : 0;
  const spellBonus = candidate.action?.type === 'spell'
    ? 3 + normalizeNumber(candidate.metadata?.spellValue, 0) + (candidate.action?.spellKind === 'support' ? 2 : 0)
    : 0;
  const attackBonus = candidate.action?.type === 'attack' ? 2 : 0;
  const holdWhenNoPressureBonus = candidate.family === 'hold_position' ? 0.4 : 0;
  const retreatPenalty = candidate.family === 'disengage_retreat' ? -2 : 0;
  const reservationPenalty = destinationKey && reservedDestinations.has(destinationKey) ? -100 : 0;
  const roleModifiers = roleScoreModifiers(encounter, actor, candidate, doctrineContext || {}, roleGateContext);
  const targetPriorityModifiersForCandidate = targetPriorityModifiers(encounter, actor, candidate, doctrineContext || {});
  const doctrineModifiers = doctrineScoreModifiers(encounter, actor, candidate, doctrineContext || {});
  const roleBlockerShootAndScootBonusOffset = disciplinedBlockerShootAndScootScreenDuty(actor, candidate, doctrineContext || {}, roleGateContext)
    ? -shootAndScootBonus
    : 0;
  return {
    ...scored,
    score: scored.score +
      safeRangedBonus +
      shootAndScootBonus +
      roleBlockerShootAndScootBonusOffset +
      spellBonus +
      attackBonus +
      holdWhenNoPressureBonus +
      retreatPenalty +
      reservationPenalty +
      sumBreakdown(roleModifiers) +
      sumBreakdown(targetPriorityModifiersForCandidate) +
      sumBreakdown(doctrineModifiers),
    supervisorFeatures: {
      safeRangedBonus,
      shootAndScootBonus,
      roleBlockerShootAndScootBonusOffset,
      spellBonus,
      attackBonus,
      holdWhenNoPressureBonus,
      retreatPenalty,
      reservationPenalty,
      ...roleModifiers,
      ...targetPriorityModifiersForCandidate,
      ...doctrineModifiers
    }
  };
}

function selectSupervisedCandidate(encounter, actor, { candidateLimit = 36, stance = 'opportunistic', reservedDestinations = new Set(), doctrineContext = null } = {}) {
  const candidates = generateCandidateActions(encounter, actor, { limit: candidateLimit });
  const roleGateContext = buildRoleGateContext(encounter, actor, candidates, doctrineContext || {});
  const scored = candidates.map((candidate) => ({
    candidate,
    ...supervisedCandidateScore(encounter, actor, candidate, { stance, reservedDestinations, doctrineContext, roleGateContext })
  }));
  // Future CandidateSelectionPolicy or ImprovisationPolicy hooks belong here,
  // after legal candidate generation and scoring. They must only choose,
  // annotate, or vary already-generated legal candidates; they must not invent
  // actions, paths, targets, spells, or attacks.
  scored.sort((left, right) =>
    right.score - left.score ||
    (left.candidate.moveSteps || 0) - (right.candidate.moveSteps || 0)
  );
  return {
    candidates,
    scored,
    selected: scored[0]?.candidate || candidates[0] || null,
    topCandidates: dedupeScoredEntries(scored, actor)
      .slice(0, 5)
      .map((entry) => summarizeCandidate(entry.candidate, entry, encounter, { actor, doctrineContext: doctrineContext || {} })),
    diagnostics: buildCandidateDiagnostics(encounter, actor, scored, scored[0]?.candidate || candidates[0] || null, doctrineContext || {})
  };
}

function decisionSummary({ controllerLabel, selected, candidates, topCandidates = [], diagnostics = null }) {
  if (!selected) return `${controllerLabel} found no legal candidates.`;
  const counts = candidateFamilyCounts(candidates);
  const attackCount = (counts.attack_from_current || 0) + (counts.move_and_attack || 0) + (counts.shoot_and_scoot || 0);
  const spellCount = (counts.spell_from_current || 0) + (counts.move_and_spell || 0);
  const countLine = diagnostics
    ? `${diagnostics.rawCandidateCount} raw / ${diagnostics.mechanicallyDistinctCandidateCount || diagnostics.deduplicatedCandidateCount} mechanically distinct / ${diagnostics.tacticalGroupCount ?? '?'} tactical groups`
    : `${candidates.length} candidates`;
  const rankLine = diagnostics?.selectedDeduplicatedRank
    ? ` Rank ${diagnostics.selectedDeduplicatedRank}/${diagnostics.deduplicatedCandidateCount}.`
    : '';
  const topLine = topCandidates
    .slice(0, 3)
    .map((candidate) => {
      const destination = candidate.moveTo ? `@(${candidate.moveTo.x},${candidate.moveTo.y})` : '';
      const origin = candidate.attackCell ? ` from=(${candidate.attackCell.x},${candidate.attackCell.y})` : '';
      const hide = candidate.hideCell ? ` hide=(${candidate.hideCell.x},${candidate.hideCell.y})` : '';
      const target = candidate.targetLabels?.length ? ` target=${candidate.targetLabels.join(',')}` : '';
      const score = candidate.score == null ? '' : `=${candidate.score.toFixed(2)}`;
      return `${candidate.family}:${candidate.actionName || 'action'}${destination}${origin}${hide}${score}${target}`;
    })
    .join(', ');
  return `${controllerLabel} selected ${selected.family} from ${countLine} (${attackCount} attacks, ${spellCount} spells, ${counts.advance_to_attack || 0} advances, ${counts.disengage_retreat || 0} retreats, ${counts.hold_position || 0} holds).${rankLine} Top candidates: ${topLine || 'none'}.`;
}

function formatScoreBreakdown(breakdown = {}, limit = 6) {
  const parts = Object.entries(breakdown)
    .filter(([, value]) => Math.abs(Number(value)) > 0.0001)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, limit)
    .map(([key, value]) => `${key} ${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}`);
  return parts.join(', ');
}

function formatCandidateBrief(candidate = {}) {
  const destination = candidate.moveTo ? `@(${candidate.moveTo.x},${candidate.moveTo.y})` : '';
  const origin = candidate.attackCell ? ` from=(${candidate.attackCell.x},${candidate.attackCell.y})` : '';
  const hide = candidate.hideCell ? ` hide=(${candidate.hideCell.x},${candidate.hideCell.y})` : '';
  const score = candidate.score == null ? '' : `=${Number(candidate.score).toFixed(2)}`;
  const target = candidate.targetLabels?.length
    ? ` target=${candidate.targetLabels.join(',')}`
    : candidate.targetIds?.length ? ` target=${candidate.targetIds.join(',')}` : '';
  return `${candidate.family}:${candidate.actionName || 'action'}${destination}${origin}${hide}${score}${target}`;
}

function formatTacticalGroupBrief(group = {}) {
  const destination = group.destination ? ` -> ${group.endPosture || 'to'} ${coordLabel(group.destination)}` : '';
  const target = group.targetLabels?.length ? `, target=${group.targetLabels.join(',')}` : '';
  const firingCells = group.firingCells?.length
    ? `, from=${group.firingCells.slice(0, 4).map(coordLabel).join(',')}${group.firingCells.length > 4 ? ',...' : ''}`
    : '';
  return `${group.family}:${group.actionName}${destination}${target}, best=${Number(group.bestScore).toFixed(2)}, variants=${group.variantCount}${firingCells}`;
}

function createSupervisorDiagnosticLogs({ controllerId, actor, diagnostics }) {
  if (!actor || !diagnostics) return [];
  const logs = [];
  const baseBreakdown = formatScoreBreakdown(diagnostics.selectedScoreBreakdown || {});
  const supervisorBreakdown = formatScoreBreakdown(diagnostics.selectedSupervisorBreakdown || {});
  if (baseBreakdown || supervisorBreakdown) {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'score_breakdown',
      message: `${actor.name} selected score breakdown: ${baseBreakdown || 'no base score'}${supervisorBreakdown ? ` | supervisor: ${supervisorBreakdown}` : ''}.`,
      data: {
        selectedScoreBreakdown: diagnostics.selectedScoreBreakdown,
        selectedSupervisorBreakdown: diagnostics.selectedSupervisorBreakdown
      }
    }));
  }
  const alternatives = diagnostics.topRejectedAlternatives?.slice(0, 3).map(formatCandidateBrief).join('; ');
  if (alternatives) {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'alternatives',
      message: `${actor.name} top rejected alternatives: ${alternatives}.`,
      data: { topRejectedAlternatives: diagnostics.topRejectedAlternatives }
    }));
  }
  const tacticalGroups = diagnostics.tacticalSummaryGroups?.slice(0, 3).map(formatTacticalGroupBrief).join('; ');
  if (tacticalGroups) {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'tactical_groups',
      message: `${actor.name} top tactical groups: ${tacticalGroups}.`,
      data: { tacticalSummaryGroups: diagnostics.tacticalSummaryGroups }
    }));
  }
  const flatness = diagnostics.scoreFlatness;
  if (flatness?.status === 'warning') {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'score_flatness',
      level: 'warning',
      message: `${actor.name} score flatness WARNING: top ${flatness.identicalTopCount} candidates have identical score ${Number(flatness.topScore).toFixed(2)}; possible missing differentiators: ${flatness.possibleMissingDifferentiators.join(', ')}.`,
      data: { scoreFlatness: flatness }
    }));
  }
  const role = diagnostics.roleCompliance;
  if (role) {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'role_compliance',
      level: role.status === 'pass' ? 'info' : 'warning',
      message: `${actor.name} role compliance ${role.status.toUpperCase()}: role=${role.role}${role.roleSource ? `; source=${role.roleSource}` : ''}${role.concern ? `; concern=${role.concern}` : ''}.`,
      data: { roleCompliance: role }
    }));
  }
  const health = diagnostics.candidateSetHealth;
  if (health && health.status !== 'pass') {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'candidate_health',
      level: health.status === 'pass' ? 'info' : 'warning',
      message: `${actor.name} candidate health ${health.status.toUpperCase()}: role=${health.role}${health.roleSource ? `; source=${health.roleSource}` : ''}; available=${health.availableFamilies.join(', ') || 'none'}; missing=${health.missingExpectedCandidates.join(', ') || 'none'}${health.unsupportedExpectedCandidates?.length ? `; unsupported=${health.unsupportedExpectedCandidates.join(', ')}` : ''}.`,
      data: { candidateSetHealth: health }
    }));
  }
  const spell = diagnostics.spellTargetExplanation;
  if (spell) {
    logs.push(createDecisionLogEntry({
      controllerId,
      actorId: actor.id,
      phase: 'spell_targeting',
      message: `${actor.name} spell targeting: ${spell.spell} is modeled as ${spell.modeledTargeting}; selected ${spell.selectedTarget}; ${spell.selectedReason}.`,
      data: { spellTargetExplanation: spell }
    }));
    if (spell.modelWarning) {
      logs.push(createDecisionLogEntry({
        controllerId,
        actorId: actor.id,
        phase: 'spell_model_warning',
        level: 'warning',
        message: `${actor.name} spell model WARNING: ${spell.modelWarning}.`,
        data: { spellTargetExplanation: spell }
      }));
    }
  }
  return logs;
}

function formatReservationSummary(reservations = []) {
  return reservations
    .map((reservation) => `${reservation.actorName} -> (${reservation.destination?.[0]},${reservation.destination?.[1]})`)
    .join('; ');
}

function buildDoctrineActionTension(battlefieldAssessment, actions = []) {
  const targetCounts = actions.reduce((counts, action) => {
    if (!action?.target || action.target === 'null') return counts;
    const key = String(action.target);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const dominant = Object.entries(targetCounts).sort((left, right) => right[1] - left[1])[0] || null;
  const focusName = battlefieldAssessment?.primaryFocusTarget?.name || null;
  let status = 'aligned';
  let note = 'selected actions are consistent with the heuristic doctrine focus';
  if (dominant && focusName && dominant[0] !== focusName) {
    status = 'tension';
    note = `doctrine focus is ${focusName}, but ${dominant[1]} selected actions target ${dominant[0]}; likely local scoring/focus-fire override`;
  } else if (battlefieldAssessment?.doctrine === 'protect_caster' && actions.filter((action) => action.type === 'attack').length >= Math.max(3, actions.length - 1)) {
    status = 'watch';
    note = 'protect_caster doctrine is active, but most selections are attacks; verify the protected asset remains safe';
  }
  return {
    status,
    doctrine: battlefieldAssessment?.doctrine || 'unknown',
    focusTarget: focusName,
    targetCounts,
    dominantTarget: dominant ? { name: dominant[0], count: dominant[1] } : null,
    note
  };
}

function buildDoctrineInfluence(battlefieldAssessment, outputs = []) {
  const applied = outputs
    .flatMap((output) => output.logs || [])
    .flatMap((log) => Object.entries(log.data?.diagnostics?.selectedSupervisorBreakdown || {}))
    .filter(([key, value]) => key.startsWith('doctrine') && Math.abs(Number(value)) > 0.0001);
  const bonusesApplied = applied
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${key} +${Number(value).toFixed(2)}`);
  const penaltiesApplied = applied
    .filter(([, value]) => Number(value) < 0)
    .map(([key, value]) => `${key} ${Number(value).toFixed(2)}`);
  return {
    doctrine: battlefieldAssessment?.doctrine || 'unknown',
    bonusesApplied,
    penaltiesApplied,
    note: applied.length
      ? 'doctrine modifiers are applied as conservative supervisor score nudges'
      : 'doctrine modifiers available, but none applied to selected candidates'
  };
}

function outputFromCandidate({ encounter, controllerId, candidate, candidates = [], logs = [], stance = 'opportunistic' }) {
  const actor = encounter.actors.find((entry) => entry.id === candidate?.actorId);
  if (!candidate || !actor) {
    return {
      controllerId,
      actorId: actor?.id || encounter.activeActorId || null,
      plan: { moves: [], actions: [], endTurn: true },
      selectedCandidateId: null,
      candidates,
      explanation: { summary: 'No legal action available.', features: {}, stance },
      logs
    };
  }
  const action = candidate.action?.type === 'attack'
    ? {
        token: actor.name,
        type: 'attack',
        target: encounter.actors.find((entry) => entry.id === candidate.action.targetId)?.name || null,
        details: candidate.action.details,
        rationale: candidate.label,
        attack_kind: candidate.action.attackKind,
        range_ft: candidate.action.rangeFt,
        from: candidate.action.from ? [candidate.action.from.x, candidate.action.from.y] : undefined
      }
    : candidate.action?.type === 'spell'
    ? {
        token: actor.name,
        type: 'spell',
        target: encounter.actors.find((entry) => entry.id === candidate.action.targetId)?.name || null,
        details: candidate.action.details,
        rationale: candidate.label,
        spell_kind: candidate.action.spellKind,
        range_ft: candidate.action.rangeFt
      }
    : {
        token: actor.name,
        type: candidate.action?.type || 'other',
        target: null,
        details: candidate.label,
        rationale: candidate.label,
        attack_kind: null,
        range_ft: null
      };
  return {
    controllerId,
    actorId: actor.id,
    plan: {
      moves: candidate.move ? [{ token: actor.name, to: [candidate.move.to.x, candidate.move.to.y], path: candidate.move.path.map((cell) => [cell.x, cell.y]), rationale: candidate.label }] : [],
      actions: [action],
      endTurn: true
    },
    selectedCandidateId: candidate.id,
    candidates,
    explanation: {
      summary: `${candidate.label}.`,
      features: scoreCandidate(encounter, candidate, { stance }).features,
      stance
    },
    logs
  };
}

export class HumanController {
  id = 'human';
  label = 'Human Controller';
  kind = 'human';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const candidates = filterReservedCandidates(
      generateCandidateActions(encounter, actor, { limit: input.candidateLimit || 24 }),
      actor,
      input.reservedDestinations || new Set()
    );
    const selected = input.selectedAction || candidates.find((candidate) => candidate.id === input.selectedCandidateId) || null;
    const logs = [createDecisionLogEntry({ controllerId: this.id, actorId: actor?.id, message: selected ? 'Human selected action.' : 'Human action pending.' })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs });
  }
}

export class ScriptedController {
  id = 'scripted_baseline';
  label = 'Scripted Baseline';
  kind = 'scripted';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const candidates = filterReservedCandidates(
      generateCandidateActions(encounter, actor, { limit: input.candidateLimit || 24 }),
      actor,
      input.reservedDestinations || new Set()
    );
    const bestAttack = (family) => candidates
      .filter((candidate) => candidate.family === family)
      .sort((left, right) =>
        scriptedAttackPriority(encounter, actor, right) - scriptedAttackPriority(encounter, actor, left) ||
        (left.moveSteps || 0) - (right.moveSteps || 0) ||
        (right.action?.attackKind === 'ranged' ? 1 : 0) - (left.action?.attackKind === 'ranged' ? 1 : 0)
      )[0];
    const selected = bestAttack('attack_from_current')
      || bestAttack('shoot_and_scoot')
      || bestAttack('move_and_attack')
      || candidates.find((candidate) => candidate.family === 'advance_to_attack')
      || candidates.find((candidate) => candidate.family === 'hold_position')
      || candidates.find((candidate) => candidate.family === 'disengage_retreat')
      || candidates[0];
    const topCandidates = topCandidateSummaries(encounter, candidates, { limit: 5 });
    const logs = [createDecisionLogEntry({
      controllerId: this.id,
      actorId: actor?.id,
      message: decisionSummary({ controllerLabel: this.label, selected, candidates, topCandidates }),
      data: {
        ruleOrder: ['best attack from current position', 'best move and attack', 'advance toward attack range', 'hold defensively if no pressure action is available', 'retreat only as fallback', 'fallback'],
        familyCounts: candidateFamilyCounts(candidates),
        selected: selected ? summarizeCandidate(selected, null, encounter) : null,
        topCandidates
      }
    })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs });
  }
}

export class UtilityController {
  id = 'utility_baseline';
  label = 'Utility Baseline';
  kind = 'utility';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const stance = TACTICAL_STANCES.includes(input.stance) ? input.stance : 'opportunistic';
    const candidates = filterReservedCandidates(
      generateCandidateActions(encounter, actor, { limit: input.candidateLimit || 24 }),
      actor,
      input.reservedDestinations || new Set()
    );
    const scored = candidates.map((candidate) => ({ candidate, ...scoreCandidate(encounter, candidate, { stance }) }));
    scored.sort((left, right) => right.score - left.score || left.candidate.moveSteps - right.candidate.moveSteps);
    const selected = scored[0]?.candidate || candidates[0];
    const topCandidates = scored.slice(0, 5).map((entry) => summarizeCandidate(entry.candidate, entry, encounter));
    const logs = [createDecisionLogEntry({
      controllerId: this.id,
      actorId: actor?.id,
      message: decisionSummary({ controllerLabel: this.label, selected, candidates, topCandidates }),
      data: {
        stance,
        familyCounts: candidateFamilyCounts(candidates),
        selected: selected ? summarizeCandidate(selected, scored.find((entry) => entry.candidate.id === selected.id), encounter) : null,
        topCandidates
      }
    })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs, stance });
  }
}

export class SupervisorScriptedController {
  id = 'supervisor_scripted_single';
  label = 'Supervisor + Scripted';
  kind = 'hybrid';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const actor = encounter.actors.find((entry) => entry.id === (input.actorId || encounter.activeActorId));
    const stance = TACTICAL_STANCES.includes(input.stance) ? input.stance : 'opportunistic';
    const { candidates, scored, selected, topCandidates, diagnostics } = selectSupervisedCandidate(encounter, actor, {
      candidateLimit: input.candidateLimit || 36,
      stance,
      reservedDestinations: input.reservedDestinations || new Set(),
      doctrineContext: input.doctrineContext || null
    });
    const logs = [createDecisionLogEntry({
      controllerId: this.id,
      actorId: actor?.id,
      message: decisionSummary({ controllerLabel: this.label, selected, candidates, topCandidates, diagnostics }),
      data: {
        supervisor: {
          baseControllerId: 'scripted_baseline',
          testedCandidateCount: candidates.length,
          selectionMode: 'supervised_candidate_ranking',
          difficultyProfile: {
            name: 'normal',
            minimumScoreFractionOfBest: 1,
            maxSelectedRank: 1,
            active: false
          }
        },
        familyCounts: candidateFamilyCounts(candidates),
        selected: selected ? summarizeCandidate(selected, scored.find((entry) => entry.candidate.id === selected.id), encounter, {
          actor,
          doctrineContext: input.doctrineContext || null
        }) : null,
        topCandidates,
        diagnostics
      }
    }),
    ...createSupervisorDiagnosticLogs({ controllerId: this.id, actor, diagnostics })];
    return outputFromCandidate({ encounter, controllerId: this.id, candidate: selected, candidates, logs, stance });
  }
}

export class SupervisorScriptedGroupController extends SupervisorScriptedController {
  id = 'supervisor_scripted_group';
  label = 'Supervisor + Scripted Group';
  supportsGroupPlanning = true;

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const group = input.activationGroup || encounter.activationGroups?.[0] || {
      actorIds: [input.actorId || encounter.activeActorId].filter(Boolean),
      activationMode: 'coordinated_sequential'
    };
    const actorIds = (group.actorIds || []).filter((actorId) =>
      encounter.actors.some((actor) => actor.id === actorId)
    );
    const reservedDestinations = new Set();
    const reservations = [];
    const reservationConflicts = [];
    const outputs = [];
    const resolvedActorIds = actorIds.length ? actorIds : [encounter.activeActorId].filter(Boolean);
    const battlefieldAssessment = buildSupervisorBattlefieldAssessment(encounter, resolvedActorIds);
    for (const actorId of resolvedActorIds) {
      const actor = encounter.actors.find((entry) => entry.id === actorId);
      const output = await super.chooseAction({
        ...input,
        encounter,
        actorId,
        candidateLimit: input.candidateLimit || 36,
        reservedDestinations,
        doctrineContext: battlefieldAssessment
      });
      const moveDestination = output.plan?.moves?.[0]?.to;
      const reservationKey = moveDestination ? `${moveDestination[0]},${moveDestination[1]}` : actor?.cell ? cellKey(actor.cell) : '';
      if (reservationKey) {
        reservedDestinations.add(reservationKey);
        reservations.push({
          actorId,
          actorName: actor?.name || actorId,
          destination: moveDestination || (actor?.cell ? [actor.cell.x, actor.cell.y] : null),
          source: moveDestination ? 'move_destination' : 'current_position'
        });
      }
      for (const log of output.logs || []) {
        const rejected = log.data?.diagnostics?.reservationRejected || [];
        for (const candidate of rejected) {
          reservationConflicts.push({
            actorId,
            actorName: actor?.name || actorId,
            candidate
          });
        }
      }
      outputs.push(output);
    }
    const moves = outputs.flatMap((output) => output.plan?.moves || []);
    const actions = outputs.flatMap((output) => output.plan?.actions || []);
    const doctrineActionTension = buildDoctrineActionTension(battlefieldAssessment, actions);
    const doctrineInfluence = buildDoctrineInfluence(battlefieldAssessment, outputs);
    const logs = [
      createDecisionLogEntry({
        controllerId: this.id,
        actorId: encounter.activeActorId,
        message: `${this.label} supervised ${outputs.length} grouped activations with reservation-aware candidate selection.`,
        data: {
          activationGroup: group,
          battlefieldAssessment,
          doctrineActionTension,
          doctrineInfluence,
          selectedCandidateIds: outputs.map((output) => output.selectedCandidateId).filter(Boolean),
          reservedDestinations: [...reservedDestinations],
          reservations,
          reservationConflicts
        }
      }),
      createDecisionLogEntry({
        controllerId: this.id,
        actorId: encounter.activeActorId,
        phase: 'battlefield_assessment',
        message: `${this.label} battlefield assessment: doctrine=${battlefieldAssessment.doctrine}; focus=${battlefieldAssessment.primaryFocusTarget?.name || 'none'}; protected=${battlefieldAssessment.protectedAsset?.name || 'none'}; risk=${battlefieldAssessment.mainRisk}.`,
        data: { battlefieldAssessment }
      }),
      createDecisionLogEntry({
        controllerId: this.id,
        actorId: encounter.activeActorId,
        phase: 'doctrine_action_tension',
        level: doctrineActionTension.status === 'aligned' ? 'info' : 'warning',
        message: `${this.label} doctrine/action tension ${doctrineActionTension.status.toUpperCase()}: ${doctrineActionTension.note}.`,
        data: { doctrineActionTension }
      }),
      createDecisionLogEntry({
        controllerId: this.id,
        actorId: encounter.activeActorId,
        phase: 'doctrine_influence',
        message: `${this.label} doctrine influence: selected doctrine=${doctrineInfluence.doctrine}; doctrine bonuses applied=${doctrineInfluence.bonusesApplied.length ? doctrineInfluence.bonusesApplied.join(', ') : 'none'}; doctrine penalties applied=${doctrineInfluence.penaltiesApplied.length ? doctrineInfluence.penaltiesApplied.join(', ') : 'none'}; note=${doctrineInfluence.note}.`,
        data: { doctrineInfluence }
      }),
      createDecisionLogEntry({
        controllerId: this.id,
        actorId: encounter.activeActorId,
        phase: 'reservations',
        message: `${this.label} reservations: ${formatReservationSummary(reservations) || 'none'}.`,
        data: { reservations, reservationConflicts }
      }),
      ...outputs.flatMap((output) => output.logs || [])
    ];
    return {
      controllerId: this.id,
      actorId: encounter.activeActorId,
      plan: { moves, actions, endTurn: true },
      selectedCandidateId: outputs.map((output) => output.selectedCandidateId).filter(Boolean).join('|') || null,
      candidates: outputs.flatMap((output) => output.candidates || []),
      explanation: {
        summary: `${this.label} selected ${actions.length} grouped actions.`,
        features: { groupSize: outputs.length },
        stance: input.stance || 'opportunistic'
      },
      logs
    };
  }
}

class SequentialGroupController {
  constructor({ id, label, baseController }) {
    this.id = id;
    this.label = label;
    this.baseController = baseController;
    this.kind = baseController.kind;
    this.supportsGroupPlanning = true;
    this.supportsSimultaneousPlanning = false;
  }

  async chooseAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const group = input.activationGroup || encounter.activationGroups?.[0] || {
      actorIds: [input.actorId || encounter.activeActorId].filter(Boolean),
      activationMode: 'coordinated_sequential'
    };
    const actorIds = (group.actorIds || []).filter((actorId) =>
      encounter.actors.some((actor) => actor.id === actorId)
    );
    const reservedDestinations = new Set();
    const outputs = [];
    for (const actorId of actorIds.length ? actorIds : [encounter.activeActorId].filter(Boolean)) {
      const actor = encounter.actors.find((entry) => entry.id === actorId);
      const output = await this.baseController.chooseAction({
        ...input,
        encounter,
        actorId,
        reservedDestinations
      });
      const moveDestination = output.plan?.moves?.[0]?.to;
      if (moveDestination) reservedDestinations.add(`${moveDestination[0]},${moveDestination[1]}`);
      else if (actor?.cell) reservedDestinations.add(cellKey(actor.cell));
      outputs.push(output);
    }
    const moves = outputs.flatMap((output) => output.plan?.moves || []);
    const actions = outputs.flatMap((output) => output.plan?.actions || []);
    const logs = [
      createDecisionLogEntry({
        controllerId: this.id,
        actorId: encounter.activeActorId,
        message: `${this.label} ran ${outputs.length} grouped activations through ${this.baseController.label}.`,
        data: {
          activationGroup: group,
          selectedCandidateIds: outputs.map((output) => output.selectedCandidateId).filter(Boolean),
          reservedDestinations: [...reservedDestinations]
        }
      }),
      ...outputs.flatMap((output) => output.logs || [])
    ];
    return {
      controllerId: this.id,
      actorId: encounter.activeActorId,
      plan: { moves, actions, endTurn: true },
      selectedCandidateId: outputs.map((output) => output.selectedCandidateId).filter(Boolean).join('|') || null,
      candidates: outputs.flatMap((output) => output.candidates || []),
      explanation: {
        summary: `${this.label} selected ${actions.length} grouped actions.`,
        features: { groupSize: outputs.length, baseControllerId: this.baseController.id },
        stance: input.stance || 'opportunistic'
      },
      logs
    };
  }
}

export class ScriptedGroupController extends SequentialGroupController {
  constructor() {
    super({
      id: 'scripted_baseline_group',
      label: 'Scripted Baseline Group',
      baseController: new ScriptedController()
    });
  }
}

export class UtilityGroupController extends SequentialGroupController {
  constructor() {
    super({
      id: 'utility_baseline_group',
      label: 'Utility Baseline Group',
      baseController: new UtilityController()
    });
  }
}

export class PureLLMController {
  id = 'pure_llm_stub';
  label = 'Pure LLM Controller';
  kind = 'pure_llm';
  supportsGroupPlanning = false;
  supportsSimultaneousPlanning = false;
  async chooseAction() {
    throw new Error('PureLLMController requires an advisor provider in a later phase.');
  }
}

export class HybridController extends UtilityController {
  id = 'hybrid_stub';
  label = 'Hybrid Controller';
  kind = 'hybrid';
}

export class PerMonsterAgentController extends UtilityController {
  id = 'per_monster_agents_stub';
  label = 'Per-Monster Agents';
  kind = 'per_monster_agents';
}

export class RoleSpecializedPlannerController extends UtilityController {
  id = 'role_specialized_stub';
  label = 'Role-Specialized Planner';
  kind = 'role_specialized';
}

export class SquadPlannerController extends UtilityController {
  id = 'squad_planner_stub';
  label = 'Centralized Squad Planner';
  kind = 'squad_planner';
  supportsGroupPlanning = true;
  async chooseGroupAction(input = {}) {
    const encounter = normalizeEncounterState(input.encounter);
    const group = input.activationGroup || { actorIds: [encounter.activeActorId].filter(Boolean), activationMode: 'coordinated_sequential' };
    const outputs = [];
    for (const actorId of group.actorIds || []) {
      outputs.push(await this.chooseAction({ ...input, encounter, actorId }));
    }
    return {
      controllerId: this.id,
      activationGroup: group,
      plans: outputs.map((output) => output.plan),
      logs: outputs.flatMap((output) => output.logs || [])
    };
  }
}

export function createControllerRegistry() {
  const controllers = [
    new HumanController(),
    new ScriptedController(),
    new ScriptedGroupController(),
    new UtilityController(),
    new UtilityGroupController(),
    new SupervisorScriptedController(),
    new SupervisorScriptedGroupController(),
    new PureLLMController(),
    new HybridController(),
    new PerMonsterAgentController(),
    new RoleSpecializedPlannerController(),
    new SquadPlannerController()
  ];
  return new Map(controllers.map((controller) => [controller.id, controller]));
}

export function getController(controllerId, registry = createControllerRegistry()) {
  return registry.get(controllerId) || registry.get('utility_baseline');
}

export function tacticalOutputToVttPlan(output = {}) {
  return {
    summary: output.explanation?.summary || '',
    moves: output.plan?.moves || [],
    actions: output.plan?.actions || [],
    end_turn: output.plan?.endTurn !== false,
    _controller: {
      id: output.controllerId,
      selectedCandidateId: output.selectedCandidateId,
      logs: output.logs || [],
      explanation: output.explanation || null
    }
  };
}
