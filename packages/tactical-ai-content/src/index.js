export const MONSTER_ARCHETYPES = {
  skirmisher: {
    id: 'skirmisher',
    label: 'Skirmisher',
    defaults: { speed: 30, ac: 13, expectedDamage: 5, preferredStance: 'opportunistic' }
  },
  brute: {
    id: 'brute',
    label: 'Brute',
    defaults: { speed: 30, ac: 13, expectedDamage: 8, preferredStance: 'aggressive' }
  },
  archer: {
    id: 'archer',
    label: 'Archer',
    defaults: { speed: 30, ac: 13, expectedDamage: 5, preferredStance: 'cautious' }
  },
  controller: {
    id: 'controller',
    label: 'Controller',
    defaults: { speed: 30, ac: 12, expectedDamage: 4, preferredStance: 'protective' }
  }
};

export { parseVisibleEncounterFixture } from './visible-fixture-loader.js';
export {
  MORK_BORG_MONSTER_TACTICAL_MAP,
  SRD_MONSTER_TACTICAL_MAP,
  inferMonsterTacticalMapping,
  monsterTacticalMapping,
  morkBorgMonsterTacticalMapping,
  normalizeMonsterMappingKey,
  srdMonsterTacticalMapping
} from './monster-mappings/index.js';
import {
  SRD_MONSTER_TACTICAL_MAP,
  inferMonsterTacticalMapping,
  monsterTacticalMapping
} from './monster-mappings/index.js';

export const RULESET_PRESETS = {
  simple_grid: {
    id: 'simple_grid',
    label: 'Simple Grid',
    diagonalMovement: 'chebyshev',
    opportunityRules: 'adjacent-risk'
  },
  five_e_like: {
    id: 'five_e_like',
    label: '5e-like',
    diagonalMovement: 'chebyshev',
    opportunityRules: 'leaving-reach'
  }
};

export const EXAMPLE_MONSTER_PROFILES = [
  {
    id: 'goblin_skirmisher',
    name: 'Goblin Skirmisher',
    archetype: 'skirmisher',
    attacks: [
      { name: 'Scimitar', attackKind: 'melee', rangeFt: 5, expectedDamage: 5 },
      { name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }
    ]
  },
  {
    id: 'ogre_brute',
    name: 'Ogre Brute',
    archetype: 'brute',
    attacks: [
      { name: 'Greatclub', attackKind: 'melee', rangeFt: 5, expectedDamage: 13 },
      { name: 'Javelin', attackKind: 'ranged', rangeFt: 30, expectedDamage: 11 }
    ]
  }
];

export const SAMPLE_ENCOUNTER_FIXTURES = [
  {
    id: 'open_room_skirmish',
    label: 'Open Room Skirmish',
    category: 'open room skirmish',
    encounter: {
      id: 'open_room_skirmish',
      round: 1,
      activeActorId: 'goblin',
      battlefield: { gridSize: 64, width: 12, height: 8, edges: [], tiles: [], interactables: [] },
      actors: [
        { id: 'goblin', name: 'Goblin', side: 'monsters', cell: { x: 2, y: 2 }, speed: 30, attacks: EXAMPLE_MONSTER_PROFILES[0].attacks },
        { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 2 }, speed: 30, attacks: [] }
      ]
    }
  },
  {
    id: 'ranged_cover_skirmish',
    label: 'Ranged Cover Skirmish',
    category: 'ranged cover skirmish',
    encounter: {
      id: 'ranged_cover_skirmish',
      round: 1,
      activeActorId: 'goblin',
      battlefield: {
        gridSize: 64,
        width: 12,
        height: 8,
        edges: [{ orientation: 'h', x: 2, y: 3, blocksMovement: true, blocksLineOfSight: true }],
        tiles: [],
        interactables: []
      },
      actors: [
        { id: 'goblin', name: 'Goblin', side: 'monsters', cell: { x: 2, y: 2 }, speed: 30, attacks: EXAMPLE_MONSTER_PROFILES[0].attacks },
        { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 2, y: 4 }, speed: 30, attacks: [] }
      ]
    }
  }
];

export const SRD_MONSTER_TACTICAL_OVERRIDES = SRD_MONSTER_TACTICAL_MAP;

export function srdMonsterTacticalOverride(monster = {}) {
  return monsterTacticalMapping('srd', monster);
}

function parseStatblockAttacks(statblock = '', fallbackDamage = 5) {
  return String(statblock || '').split('\n').map((line) => line.trim()).flatMap((line) => {
    const name = line.match(/^-?\s*([^:]+):/)?.[1]?.trim();
    if (!name) return [];
    const ranged = line.match(/\brange\s+(\d+)/i);
    const melee = line.match(/\b(?:reach\s+)?(\d+)\s*ft\b/i);
    if (/\bMelee or Ranged\b/i.test(line) && melee && ranged) {
      return [
        { name, attackKind: 'melee', rangeFt: Number(melee[1]), expectedDamage: fallbackDamage },
        { name, attackKind: 'ranged', rangeFt: Number(ranged[1]), expectedDamage: fallbackDamage }
      ];
    }
    if (ranged) return [{ name, attackKind: 'ranged', rangeFt: Number(ranged[1]), expectedDamage: fallbackDamage }];
    if (melee && !/\brange\b/i.test(line)) return [{ name, attackKind: 'melee', rangeFt: Number(melee[1]), expectedDamage: fallbackDamage }];
    return [];
  });
}

function normalizeTacticalMappingValue(tactical = null) {
  if (!tactical) return null;
  return {
    role: String(tactical.role ?? '').trim(),
    function: String(tactical.function ?? '').trim(),
    secondaryRoles: Array.isArray(tactical.secondaryRoles) ? tactical.secondaryRoles.map(String) : [],
    intent: Array.isArray(tactical.intent) ? tactical.intent.map(String) : tactical.intent ? [String(tactical.intent)] : [],
    posture: String(tactical.posture ?? '').trim(),
    tags: Array.isArray(tactical.tags) ? tactical.tags.map(String) : tactical.tags ? [String(tactical.tags)] : [],
    protectedAsset: Boolean(tactical.protectedAsset),
    objectiveRole: String(tactical.objectiveRole ?? '').trim(),
    roleNotes: String(tactical.roleNotes ?? '').trim()
  };
}

function mergeTacticalMapping(base = null, override = null) {
  const normalizedBase = normalizeTacticalMappingValue(base);
  if (!override) return normalizedBase;
  const normalizedOverride = normalizeTacticalMappingValue(override);
  const merged = { ...(normalizedBase || {}) };
  const fieldSource = {
    role: ['role'],
    function: ['function'],
    secondaryRoles: ['secondaryRoles', 'secondary_roles'],
    intent: ['intent'],
    posture: ['posture'],
    tags: ['tags'],
    protectedAsset: ['protectedAsset', 'protected_asset'],
    objectiveRole: ['objectiveRole', 'objective_role'],
    roleNotes: ['roleNotes', 'role_notes']
  };
  for (const [field, sourceKeys] of Object.entries(fieldSource)) {
    if (sourceKeys.some((key) => Object.hasOwn(override, key))) {
      merged[field] = normalizedOverride[field];
    }
  }
  return merged;
}

export function normalizeMonsterProfile(monster = {}, { archetype = 'skirmisher', overrides = {}, analog = null, systemId = 'srd' } = {}) {
  const mapping = monsterTacticalMapping(systemId, monster) || inferMonsterTacticalMapping({ systemId, monster });
  const resolvedArchetype = overrides.archetype || mapping?.archetype || archetype;
  const archetypeDefaults = MONSTER_ARCHETYPES[resolvedArchetype]?.defaults || MONSTER_ARCHETYPES.skirmisher.defaults;
  const analogDefaults = analog ? MONSTER_ARCHETYPES[analog]?.defaults || {} : {};
  const provenance = {};
  const resolve = (field, safeDefault) => {
    if (overrides[field] != null) {
      provenance[field] = { source: 'explicit_override', confidence: 1 };
      return overrides[field];
    }
    if (monster[field] != null && monster[field] !== '') {
      provenance[field] = { source: 'provided', confidence: 1 };
      return monster[field];
    }
    if (archetypeDefaults[field] != null) {
      provenance[field] = { source: 'archetype_default', archetype: resolvedArchetype, confidence: 0.75 };
      return archetypeDefaults[field];
    }
    if (analogDefaults[field] != null) {
      provenance[field] = { source: 'analog_match', analog, confidence: 0.55 };
      return analogDefaults[field];
    }
    provenance[field] = { source: 'safe_default', confidence: 0.35 };
    return safeDefault;
  };

  const expectedDamage = Number(resolve('expectedDamage', 4)) || 4;
  const attacks = Array.isArray(monster.attacks) && monster.attacks.length
    ? monster.attacks
    : parseStatblockAttacks(monster.statblock, expectedDamage);

  const tactical = mergeTacticalMapping(mapping?.tactical || null, overrides.tactical || monster.tactical || null);
  const behavior = overrides.behavior || monster.behavior || mapping?.behavior || null;

  return {
    id: String(monster.id || monster.name || 'custom_monster'),
    name: String(monster.name || monster.id || 'Custom Monster'),
    archetype: resolvedArchetype,
    speed: Number(resolve('speed', 30)) || 30,
    ac: Number(resolve('ac', 10)) || 10,
    attacks: attacks.length ? attacks : [{ name: 'Strike', attackKind: 'melee', rangeFt: 5, expectedDamage }],
    tactical,
    behavior: behavior ? { ...behavior } : null,
    mappingProvenance: mapping?.provenance || null,
    provenance
  };
}
