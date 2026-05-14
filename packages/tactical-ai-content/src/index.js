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

function normalizeMonsterBehaviorKey(name = '') {
  return String(name || '').trim().toLowerCase();
}

export const SRD_MONSTER_TACTICAL_OVERRIDES = Object.freeze({
  zombie: {
    archetype: 'brute',
    tactical: {
      role: 'blocker',
      function: 'body_pressure',
      intent: ['press_nearest'],
      posture: 'aggressive',
      tags: ['undead', 'melee', 'body_pressure', 'swarm_member']
    },
    behavior: {
      cognition: 'mindless',
      drive: 'nearest_living_prey',
      riskTolerance: 'fearless',
      coordination: 'none',
      planningHorizon: 'immediate',
      targetStickiness: 'high'
    }
  },
  skeleton: {
    archetype: 'archer',
    tactical: {
      role: 'artillery',
      function: 'sniper',
      intent: ['harass_from_range'],
      posture: 'cautious',
      tags: ['undead', 'ranged']
    },
    behavior: {
      cognition: 'mindless',
      drive: 'nearest_living_prey',
      riskTolerance: 'fearless',
      coordination: 'none',
      planningHorizon: 'immediate',
      targetStickiness: 'high'
    }
  },
  wolf: {
    archetype: 'skirmisher',
    tactical: {
      role: 'skirmisher',
      function: 'melee_harrier',
      intent: ['isolate_weak_prey'],
      posture: 'opportunistic',
      tags: ['animal', 'melee', 'pack', 'fast']
    },
    behavior: {
      cognition: 'animal',
      drive: 'isolate_weak_prey',
      riskTolerance: 'self_preserving',
      coordination: 'pack',
      planningHorizon: 'short',
      targetStickiness: 'medium'
    }
  },
  'dire wolf': {
    archetype: 'brute',
    tactical: {
      role: 'striker',
      function: 'brute',
      secondaryRoles: ['skirmisher'],
      intent: ['isolate_weak_prey', 'knock_down_target'],
      posture: 'aggressive',
      tags: ['animal', 'melee', 'pack', 'fast']
    },
    behavior: {
      cognition: 'animal',
      drive: 'isolate_weak_prey',
      riskTolerance: 'self_preserving',
      coordination: 'pack',
      planningHorizon: 'short',
      targetStickiness: 'medium'
    }
  },
  goblin: {
    archetype: 'skirmisher',
    tactical: {
      role: 'skirmisher',
      function: 'ranged_harrier',
      intent: ['harass_from_range', 'avoid_melee'],
      posture: 'opportunistic',
      tags: ['humanoid', 'ranged', 'mobile', 'cowardly']
    },
    behavior: {
      cognition: 'trained',
      drive: 'tactical_role_objective',
      riskTolerance: 'normal',
      coordination: 'squad',
      planningHorizon: 'short',
      targetStickiness: 'medium'
    }
  },
  hobgoblin: {
    archetype: 'brute',
    tactical: {
      role: 'blocker',
      function: 'hold_line',
      intent: ['hold_line', 'focus_fire'],
      posture: 'protective',
      tags: ['humanoid', 'soldier', 'formation', 'trained']
    },
    behavior: {
      cognition: 'trained',
      drive: 'hold_line',
      riskTolerance: 'normal',
      coordination: 'squad',
      planningHorizon: 'short',
      targetStickiness: 'medium'
    }
  },
  bandit: {
    archetype: 'skirmisher',
    tactical: {
      role: 'skirmisher',
      function: 'ranged_harrier',
      intent: ['survive_and_harass'],
      posture: 'opportunistic',
      tags: ['humanoid', 'self_preserving']
    },
    behavior: {
      cognition: 'trained',
      drive: 'tactical_role_objective',
      riskTolerance: 'normal',
      coordination: 'squad',
      planningHorizon: 'short',
      targetStickiness: 'medium'
    }
  },
  guard: {
    archetype: 'brute',
    tactical: {
      role: 'blocker',
      function: 'hold_line',
      intent: ['hold_line', 'protect_area'],
      posture: 'protective',
      tags: ['humanoid', 'soldier', 'trained', 'defensive']
    },
    behavior: {
      cognition: 'trained',
      drive: 'hold_line',
      riskTolerance: 'normal',
      coordination: 'squad',
      planningHorizon: 'short',
      targetStickiness: 'medium'
    }
  },
  acolyte: {
    archetype: 'controller',
    tactical: {
      role: 'caster',
      function: 'support',
      intent: ['support_allies', 'protect_master'],
      posture: 'cautious',
      tags: ['humanoid', 'divine', 'fragile']
    },
    behavior: {
      cognition: 'trained',
      drive: 'protect_master',
      riskTolerance: 'self_preserving',
      coordination: 'commander_led',
      planningHorizon: 'medium',
      targetStickiness: 'medium'
    }
  },
  mage: {
    archetype: 'controller',
    tactical: {
      role: 'caster',
      function: 'control',
      secondaryRoles: ['artillery'],
      intent: ['control_battlefield', 'preserve_self'],
      posture: 'cautious',
      tags: ['humanoid', 'arcane', 'fragile', 'area_effects']
    },
    behavior: {
      cognition: 'cunning',
      drive: 'complete_objective',
      riskTolerance: 'self_preserving',
      coordination: 'commander_led',
      planningHorizon: 'long',
      targetStickiness: 'high'
    }
  }
});

export function srdMonsterTacticalOverride(monster = {}) {
  const key = normalizeMonsterBehaviorKey(monster?.name);
  return SRD_MONSTER_TACTICAL_OVERRIDES[key] || null;
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

export function normalizeMonsterProfile(monster = {}, { archetype = 'skirmisher', overrides = {}, analog = null } = {}) {
  const srdOverride = srdMonsterTacticalOverride(monster);
  const resolvedArchetype = srdOverride?.archetype || archetype;
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

  const tactical = srdOverride?.tactical
    ? {
      role: String(srdOverride.tactical.role ?? '').trim(),
      function: String(srdOverride.tactical.function ?? '').trim(),
      secondaryRoles: Array.isArray(srdOverride.tactical.secondaryRoles) ? [...srdOverride.tactical.secondaryRoles] : [],
      intent: Array.isArray(srdOverride.tactical.intent) ? [...srdOverride.tactical.intent] : [],
      posture: String(srdOverride.tactical.posture ?? '').trim(),
      tags: Array.isArray(srdOverride.tactical.tags) ? [...srdOverride.tactical.tags] : [],
      protectedAsset: Boolean(srdOverride.tactical.protectedAsset),
      objectiveRole: String(srdOverride.tactical.objectiveRole ?? '').trim(),
      roleNotes: String(srdOverride.tactical.roleNotes ?? '').trim()
    }
    : null;

  return {
    id: String(monster.id || monster.name || 'custom_monster'),
    name: String(monster.name || monster.id || 'Custom Monster'),
    archetype: resolvedArchetype,
    speed: Number(resolve('speed', 30)) || 30,
    ac: Number(resolve('ac', 10)) || 10,
    attacks: attacks.length ? attacks : [{ name: 'Strike', attackKind: 'melee', rangeFt: 5, expectedDamage }],
    tactical,
    behavior: srdOverride?.behavior ? { ...srdOverride.behavior } : null,
    provenance
  };
}
