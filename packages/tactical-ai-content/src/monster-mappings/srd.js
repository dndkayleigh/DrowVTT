const BEHAVIOR = Object.freeze({
  mindless: {
    cognition: 'mindless',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  },
  animalPack: {
    cognition: 'animal',
    drive: 'isolate_weak_prey',
    riskTolerance: 'self_preserving',
    coordination: 'pack',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  },
  animal: {
    cognition: 'animal',
    drive: 'nearest_prey',
    riskTolerance: 'normal',
    coordination: 'none',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  },
  trainedSquad: {
    cognition: 'trained',
    drive: 'tactical_role_objective',
    riskTolerance: 'normal',
    coordination: 'squad',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  },
  soldier: {
    cognition: 'trained',
    drive: 'hold_line',
    riskTolerance: 'normal',
    coordination: 'squad',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  },
  cunning: {
    cognition: 'cunning',
    drive: 'complete_objective',
    riskTolerance: 'self_preserving',
    coordination: 'commander_led',
    planningHorizon: 'long',
    targetStickiness: 'high'
  },
  brute: {
    cognition: 'brutish',
    drive: 'smash_nearest',
    riskTolerance: 'bold',
    coordination: 'none',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  },
  solo: {
    cognition: 'cunning',
    drive: 'complete_objective',
    riskTolerance: 'bold',
    coordination: 'none',
    planningHorizon: 'long',
    targetStickiness: 'high'
  },
  construct: {
    cognition: 'programmed',
    drive: 'follow_trigger',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  }
});

function entry(archetype, tactical, behavior) {
  return { archetype, tactical, behavior };
}

function undead(functionName, tags = [], overrides = {}) {
  return entry(overrides.archetype || 'brute', {
    role: overrides.role || 'blocker',
    function: functionName,
    secondaryRoles: overrides.secondaryRoles || [],
    intent: overrides.intent || ['press_nearest'],
    posture: overrides.posture || 'aggressive',
    tags: ['undead', ...tags],
    roleNotes: overrides.roleNotes || ''
  }, overrides.behavior || BEHAVIOR.mindless);
}

function beast(archetype, tactical, behavior = BEHAVIOR.animal) {
  return entry(archetype, tactical, behavior);
}

function humanoid(archetype, tactical, behavior = BEHAVIOR.trainedSquad) {
  return entry(archetype, tactical, behavior);
}

function brute(tags = [], overrides = {}) {
  return entry(overrides.archetype || 'brute', {
    role: overrides.role || 'striker',
    function: overrides.function || 'brute',
    secondaryRoles: overrides.secondaryRoles || [],
    intent: overrides.intent || ['apply_direct_pressure'],
    posture: overrides.posture || 'aggressive',
    tags: [...tags, 'melee', 'durable'],
    roleNotes: overrides.roleNotes || ''
  }, overrides.behavior || BEHAVIOR.brute);
}

function dragon(color, age, functionName = 'boss_controller') {
  return entry('controller', {
    role: 'solo',
    function: functionName,
    secondaryRoles: ['caster', 'striker'],
    intent: ['break_formation', 'punish_clusters', 'preserve_mobility'],
    posture: age === 'young' ? 'aggressive' : 'cautious',
    tags: ['dragon', color, age, 'boss', 'area_effects', 'mobile'],
    roleNotes: `${age} ${color} dragon centerpiece threat.`
  }, age === 'young' ? BEHAVIOR.solo : { ...BEHAVIOR.solo, cognition: age === 'ancient' ? 'genius' : 'cunning' });
}

function elemental(type, role, functionName, tags = []) {
  return entry(role === 'caster' ? 'controller' : role === 'blocker' ? 'brute' : 'skirmisher', {
    role,
    function: functionName,
    intent: ['pressure_intruders'],
    posture: role === 'blocker' ? 'protective' : 'aggressive',
    tags: ['elemental', type, ...tags],
    roleNotes: `${type} elemental expression of its plane.`
  }, { ...BEHAVIOR.brute, cognition: 'alien', riskTolerance: 'fearless' });
}

export const SRD_MONSTER_TACTICAL_MAP = Object.freeze({
  skeleton: undead('sniper', ['ranged'], {
    archetype: 'archer',
    role: 'artillery',
    intent: ['harass_from_range'],
    posture: 'cautious'
  }),
  zombie: undead('body_pressure', ['melee', 'body_pressure', 'swarm_member'], {
    roleNotes: 'Mindless undead pressure body.'
  }),
  ghoul: undead('disruptor', ['melee', 'paralysis'], {
    role: 'striker',
    intent: ['paralyze_exposed_target', 'feed_on_weak'],
    behavior: { ...BEHAVIOR.mindless, cognition: 'brutish' }
  }),
  wight: undead('commander', ['melee', 'life_drain'], {
    role: 'leader',
    secondaryRoles: ['striker'],
    intent: ['drain_priority_target', 'direct_undead'],
    behavior: { ...BEHAVIOR.cunning, cognition: 'cunning' }
  }),
  mummy: undead('zone_anchor', ['melee', 'fear', 'curse'], {
    role: 'blocker',
    secondaryRoles: ['striker'],
    intent: ['hold_tomb_space', 'curse_intruders'],
    behavior: { ...BEHAVIOR.brute, cognition: 'fanatic' }
  }),
  ghost: undead('stalker', ['incorporeal', 'fear'], {
    role: 'lurker',
    secondaryRoles: ['caster'],
    intent: ['possess_or_terrify', 'avoid_sustained_contact'],
    posture: 'opportunistic',
    behavior: { ...BEHAVIOR.cunning, cognition: 'alien' }
  }),
  specter: undead('stalker', ['incorporeal', 'life_drain'], {
    role: 'lurker',
    intent: ['drain_isolated_target'],
    posture: 'opportunistic',
    behavior: { ...BEHAVIOR.mindless, cognition: 'brutish' }
  }),
  vampire: undead('phase_boss', ['undead', 'charm', 'regeneration', 'boss'], {
    archetype: 'controller',
    role: 'solo',
    secondaryRoles: ['caster', 'striker'],
    intent: ['isolate_and_dominate', 'preserve_self'],
    posture: 'cautious',
    behavior: { ...BEHAVIOR.solo, cognition: 'genius' }
  }),
  lich: undead('boss_controller', ['arcane', 'undead', 'area_effects', 'boss'], {
    archetype: 'controller',
    role: 'solo',
    secondaryRoles: ['caster', 'leader'],
    intent: ['control_battlefield', 'preserve_phylactery', 'destroy_intruders'],
    posture: 'cautious',
    behavior: { ...BEHAVIOR.solo, cognition: 'genius' }
  }),

  wolf: beast('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['isolate_weak_prey'],
    posture: 'opportunistic',
    tags: ['animal', 'melee', 'pack', 'fast']
  }, BEHAVIOR.animalPack),
  'dire wolf': beast('brute', {
    role: 'striker',
    function: 'brute',
    secondaryRoles: ['skirmisher'],
    intent: ['isolate_weak_prey', 'knock_down_target'],
    posture: 'aggressive',
    tags: ['animal', 'melee', 'pack', 'fast']
  }, BEHAVIOR.animalPack),
  'giant rat': beast('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['swarm_weak_prey'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'small', 'pack']
  }, BEHAVIOR.animalPack),
  'rat swarm': beast('brute', {
    role: 'swarm',
    function: 'many_bodies',
    intent: ['overwhelm_nearest', 'clog_space'],
    posture: 'aggressive',
    tags: ['beast', 'swarm', 'many_bodies']
  }, { ...BEHAVIOR.animal, coordination: 'swarm' }),
  'giant spider': beast('skirmisher', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['striker'],
    intent: ['ambush_restrained_prey'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'web', 'poison', 'climber']
  }),
  'giant wolf spider': beast('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['skirmisher'],
    intent: ['poison_isolated_prey'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'poison', 'fast']
  }),
  'giant poisonous snake': beast('skirmisher', {
    role: 'striker',
    function: 'assassin',
    intent: ['poison_exposed_target'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'poison']
  }),
  'constrictor snake': beast('brute', {
    role: 'lurker',
    function: 'grappler',
    secondaryRoles: ['blocker'],
    intent: ['restrain_isolated_target'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'grappler']
  }),
  'giant constrictor snake': beast('brute', {
    role: 'lurker',
    function: 'grappler',
    secondaryRoles: ['blocker', 'striker'],
    intent: ['restrain_priority_target'],
    posture: 'aggressive',
    tags: ['beast', 'melee', 'grappler', 'large']
  }),
  crocodile: beast('skirmisher', {
    role: 'lurker',
    function: 'grappler',
    secondaryRoles: ['striker'],
    intent: ['ambush_water_edge'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'grappler', 'aquatic']
  }),
  'giant crocodile': beast('brute', {
    role: 'lurker',
    function: 'grappler',
    secondaryRoles: ['striker'],
    intent: ['ambush_isolated_target', 'punish_water_edge'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'grappler', 'aquatic']
  }),
  bear: brute(['beast'], { behavior: BEHAVIOR.animal }),
  'black bear': brute(['beast'], { behavior: BEHAVIOR.animal }),
  'brown bear': brute(['beast'], { behavior: BEHAVIOR.animal }),
  'polar bear': brute(['beast'], { behavior: BEHAVIOR.animal }),
  lion: beast('skirmisher', {
    role: 'striker',
    function: 'charger',
    secondaryRoles: ['skirmisher'],
    intent: ['pounce_weak_prey'],
    posture: 'aggressive',
    tags: ['beast', 'melee', 'pack', 'fast']
  }, BEHAVIOR.animalPack),
  tiger: beast('skirmisher', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['striker'],
    intent: ['pounce_isolated_prey'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'stealth', 'fast']
  }),
  'giant eagle': beast('skirmisher', {
    role: 'skirmisher',
    function: 'flanker',
    intent: ['dive_on_exposed_target'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'flying', 'fast']
  }),
  'giant owl': beast('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    intent: ['silent_dive_on_exposed_target'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'flying', 'stealth']
  }),
  'giant bat': beast('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['harry_from_air'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'flying', 'blindsight']
  }),

  bandit: humanoid('skirmisher', {
    role: 'skirmisher',
    function: 'ranged_harrier',
    intent: ['survive_and_harass'],
    posture: 'opportunistic',
    tags: ['humanoid', 'self_preserving']
  }),
  'bandit captain': humanoid('skirmisher', {
    role: 'leader',
    function: 'commander',
    secondaryRoles: ['skirmisher'],
    intent: ['coordinate_raiders', 'survive_and_profit'],
    posture: 'opportunistic',
    tags: ['humanoid', 'leader', 'self_preserving']
  }, { ...BEHAVIOR.trainedSquad, cognition: 'cunning' }),
  guard: humanoid('brute', {
    role: 'blocker',
    function: 'hold_line',
    intent: ['hold_line', 'protect_area'],
    posture: 'protective',
    tags: ['humanoid', 'soldier', 'trained', 'defensive']
  }, BEHAVIOR.soldier),
  veteran: humanoid('brute', {
    role: 'blocker',
    function: 'hold_line',
    secondaryRoles: ['striker'],
    intent: ['hold_line', 'focus_fire'],
    posture: 'protective',
    tags: ['humanoid', 'soldier', 'trained', 'durable']
  }, BEHAVIOR.soldier),
  thug: humanoid('brute', {
    role: 'striker',
    function: 'brute',
    intent: ['gang_up_on_target'],
    posture: 'aggressive',
    tags: ['humanoid', 'melee', 'pack']
  }),
  scout: humanoid('archer', {
    role: 'skirmisher',
    function: 'ranged_harrier',
    intent: ['harass_from_range', 'avoid_melee'],
    posture: 'opportunistic',
    tags: ['humanoid', 'ranged', 'mobile']
  }),
  spy: humanoid('skirmisher', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['striker'],
    intent: ['strike_exposed_target', 'escape_after_hit'],
    posture: 'opportunistic',
    tags: ['humanoid', 'stealth', 'self_preserving']
  }, { ...BEHAVIOR.trainedSquad, cognition: 'cunning' }),
  cultist: humanoid('skirmisher', {
    role: 'striker',
    function: 'disruptor',
    intent: ['protect_ritual', 'overwhelm_intruders'],
    posture: 'aggressive',
    tags: ['humanoid', 'fanatic', 'melee']
  }, { ...BEHAVIOR.trainedSquad, cognition: 'fanatic', riskTolerance: 'bold', coordination: 'commander_led' }),
  'cult fanatic': humanoid('controller', {
    role: 'leader',
    function: 'buffer',
    secondaryRoles: ['caster'],
    intent: ['complete_ritual', 'support_cultists'],
    posture: 'cautious',
    tags: ['humanoid', 'fanatic', 'divine', 'ritual']
  }, { ...BEHAVIOR.cunning, cognition: 'fanatic' }),
  acolyte: humanoid('controller', {
    role: 'caster',
    function: 'support',
    intent: ['support_allies', 'protect_master'],
    posture: 'cautious',
    tags: ['humanoid', 'divine', 'fragile']
  }, { ...BEHAVIOR.trainedSquad, drive: 'protect_master', coordination: 'commander_led', planningHorizon: 'medium' }),
  priest: humanoid('controller', {
    role: 'caster',
    function: 'support',
    secondaryRoles: ['leader'],
    intent: ['keep_allies_alive', 'stay_behind_screen'],
    posture: 'cautious',
    tags: ['humanoid', 'divine', 'fragile', 'leader']
  }, { ...BEHAVIOR.cunning, cognition: 'trained' }),
  mage: humanoid('controller', {
    role: 'caster',
    function: 'control',
    secondaryRoles: ['artillery'],
    intent: ['control_battlefield', 'preserve_self'],
    posture: 'cautious',
    tags: ['humanoid', 'arcane', 'fragile', 'area_effects']
  }, BEHAVIOR.cunning),
  archmage: humanoid('controller', {
    role: 'caster',
    function: 'control',
    secondaryRoles: ['artillery', 'leader'],
    intent: ['control_battlefield', 'preserve_self', 'neutralize_priority_target'],
    posture: 'cautious',
    tags: ['humanoid', 'arcane', 'fragile', 'area_effects', 'boss']
  }, { ...BEHAVIOR.cunning, cognition: 'genius' }),
  assassin: humanoid('skirmisher', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['striker'],
    intent: ['kill_priority_target', 'escape_after_hit'],
    posture: 'opportunistic',
    tags: ['humanoid', 'stealth', 'poison']
  }, { ...BEHAVIOR.cunning, coordination: 'none' }),
  berserker: humanoid('brute', {
    role: 'striker',
    function: 'brute',
    intent: ['rush_nearest_enemy'],
    posture: 'aggressive',
    tags: ['humanoid', 'melee', 'reckless']
  }, { ...BEHAVIOR.brute, cognition: 'fanatic', riskTolerance: 'fearless' }),
  knight: humanoid('brute', {
    role: 'blocker',
    function: 'hold_line',
    secondaryRoles: ['leader'],
    intent: ['hold_line', 'protect_allies'],
    posture: 'protective',
    tags: ['humanoid', 'soldier', 'formation', 'trained']
  }, BEHAVIOR.soldier),
  noble: humanoid('controller', {
    role: 'leader',
    function: 'caller',
    intent: ['direct_guards', 'preserve_self'],
    posture: 'cautious',
    tags: ['humanoid', 'leader', 'fragile']
  }, { ...BEHAVIOR.trainedSquad, cognition: 'cunning', riskTolerance: 'self_preserving' }),
  commoner: humanoid('skirmisher', {
    role: 'striker',
    function: 'brute',
    intent: ['survive'],
    posture: 'cautious',
    tags: ['humanoid', 'fragile']
  }, { ...BEHAVIOR.trainedSquad, riskTolerance: 'cowardly', coordination: 'none', targetStickiness: 'low' }),

  goblin: humanoid('skirmisher', {
    role: 'skirmisher',
    function: 'ranged_harrier',
    intent: ['harass_from_range', 'avoid_melee'],
    posture: 'opportunistic',
    tags: ['humanoid', 'ranged', 'mobile', 'cowardly']
  }),
  hobgoblin: humanoid('brute', {
    role: 'blocker',
    function: 'hold_line',
    intent: ['hold_line', 'focus_fire'],
    posture: 'protective',
    tags: ['humanoid', 'soldier', 'formation', 'trained']
  }, BEHAVIOR.soldier),
  bugbear: humanoid('brute', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['striker'],
    intent: ['ambush_exposed_target'],
    posture: 'opportunistic',
    tags: ['humanoid', 'melee', 'stealth', 'brute']
  }, { ...BEHAVIOR.trainedSquad, cognition: 'brutish' }),
  orc: humanoid('brute', {
    role: 'striker',
    function: 'charger',
    intent: ['rush_weak_target'],
    posture: 'aggressive',
    tags: ['humanoid', 'melee', 'aggressive']
  }, { ...BEHAVIOR.trainedSquad, riskTolerance: 'bold' }),
  orog: humanoid('brute', {
    role: 'blocker',
    function: 'zone_anchor',
    secondaryRoles: ['striker'],
    intent: ['hold_center', 'break_frontline'],
    posture: 'aggressive',
    tags: ['humanoid', 'soldier', 'melee', 'durable']
  }, { ...BEHAVIOR.soldier, cognition: 'cunning' }),

  ogre: brute(['giant'], { function: 'brute' }),
  troll: brute(['brute', 'regeneration'], {
    role: 'blocker',
    function: 'zone_anchor',
    secondaryRoles: ['striker'],
    intent: ['hold_chokepoint', 'regenerate_under_pressure']
  }),
  'hill giant': brute(['giant'], { function: 'brute' }),
  'stone giant': brute(['giant', 'ranged'], { role: 'artillery', function: 'siege', secondaryRoles: ['striker'] }),
  'frost giant': brute(['giant'], { function: 'brute', secondaryRoles: ['blocker'] }),
  'fire giant': brute(['giant', 'soldier'], { role: 'blocker', function: 'zone_anchor', secondaryRoles: ['striker'] }),
  'cloud giant': brute(['giant', 'ranged'], { role: 'artillery', function: 'suppressor', secondaryRoles: ['striker'] }),
  'storm giant': brute(['giant', 'ranged', 'leader'], { role: 'solo', function: 'boss_artillery', secondaryRoles: ['artillery', 'striker'] }),

  'young black dragon': dragon('black', 'young', 'boss_controller'),
  'adult black dragon': dragon('black', 'adult', 'boss_controller'),
  'ancient black dragon': dragon('black', 'ancient', 'boss_controller'),
  'young red dragon': dragon('red', 'young', 'boss_artillery'),
  'adult red dragon': dragon('red', 'adult', 'boss_artillery'),
  'ancient red dragon': dragon('red', 'ancient', 'boss_artillery'),
  'young white dragon': dragon('white', 'young', 'boss_brute'),
  'adult white dragon': dragon('white', 'adult', 'boss_brute'),
  'ancient white dragon': dragon('white', 'ancient', 'boss_brute'),
  'young green dragon': dragon('green', 'young', 'boss_controller'),
  'adult green dragon': dragon('green', 'adult', 'boss_controller'),
  'ancient green dragon': dragon('green', 'ancient', 'boss_controller'),
  'young blue dragon': dragon('blue', 'young', 'boss_artillery'),
  'adult blue dragon': dragon('blue', 'adult', 'boss_artillery'),
  'ancient blue dragon': dragon('blue', 'ancient', 'boss_artillery'),

  'air elemental': elemental('air', 'skirmisher', 'flanker', ['flying', 'mobile']),
  'earth elemental': elemental('earth', 'blocker', 'zone_anchor', ['burrow', 'durable']),
  'fire elemental': elemental('fire', 'striker', 'disruptor', ['aura', 'mobile']),
  'water elemental': elemental('water', 'lurker', 'grappler', ['aquatic', 'engulf']),
  'animated armor': entry('brute', {
    role: 'blocker',
    function: 'bodyguard',
    intent: ['guard_area'],
    posture: 'protective',
    tags: ['construct', 'melee', 'programmed']
  }, BEHAVIOR.construct),
  'flying sword': entry('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['harry_intruder'],
    posture: 'aggressive',
    tags: ['construct', 'flying', 'melee', 'programmed']
  }, BEHAVIOR.construct),
  'rug of smothering': entry('brute', {
    role: 'lurker',
    function: 'grappler',
    secondaryRoles: ['hazard'],
    intent: ['restrain_intruder'],
    posture: 'opportunistic',
    tags: ['construct', 'grappler', 'ambush']
  }, BEHAVIOR.construct),
  'gelatinous cube': entry('brute', {
    role: 'hazard',
    function: 'environmental',
    secondaryRoles: ['blocker'],
    intent: ['engulf_corridor_intruders'],
    posture: 'aggressive',
    tags: ['ooze', 'engulf', 'slow', 'corridor_threat']
  }, BEHAVIOR.mindless),
  'ochre jelly': entry('brute', {
    role: 'blocker',
    function: 'body_pressure',
    intent: ['engulf_nearest'],
    posture: 'aggressive',
    tags: ['ooze', 'melee', 'split']
  }, BEHAVIOR.mindless),
  'gray ooze': entry('brute', {
    role: 'lurker',
    function: 'ambusher',
    intent: ['corrode_isolated_target'],
    posture: 'opportunistic',
    tags: ['ooze', 'ambush', 'corrosion']
  }, BEHAVIOR.mindless),
  'black pudding': entry('brute', {
    role: 'blocker',
    function: 'body_pressure',
    secondaryRoles: ['hazard'],
    intent: ['corrode_and_clog_space'],
    posture: 'aggressive',
    tags: ['ooze', 'acid', 'split', 'durable']
  }, BEHAVIOR.mindless),

  imp: entry('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['skirmisher'],
    intent: ['poison_exposed_target', 'preserve_self'],
    posture: 'opportunistic',
    tags: ['fiend', 'flying', 'invisible', 'poison']
  }, { ...BEHAVIOR.cunning, riskTolerance: 'self_preserving' }),
  quasit: entry('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['skirmisher'],
    intent: ['frighten_and_poison'],
    posture: 'opportunistic',
    tags: ['fiend', 'invisible', 'fear', 'poison']
  }, { ...BEHAVIOR.cunning, riskTolerance: 'self_preserving' }),
  'hell hound': brute(['fiend', 'fire'], { role: 'striker', function: 'charger', behavior: BEHAVIOR.animalPack }),
  'succubus/incubus': entry('controller', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['caster'],
    intent: ['charm_isolated_target', 'avoid_direct_melee'],
    posture: 'cautious',
    tags: ['fiend', 'charm', 'shapechanger']
  }, BEHAVIOR.cunning),
  succubus: entry('controller', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['caster'],
    intent: ['charm_isolated_target', 'avoid_direct_melee'],
    posture: 'cautious',
    tags: ['fiend', 'charm', 'shapechanger']
  }, BEHAVIOR.cunning),
  incubus: entry('controller', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['caster'],
    intent: ['charm_isolated_target', 'avoid_direct_melee'],
    posture: 'cautious',
    tags: ['fiend', 'charm', 'shapechanger']
  }, BEHAVIOR.cunning),
  nightmare: brute(['fiend', 'flying'], { role: 'skirmisher', function: 'flanker', behavior: { ...BEHAVIOR.animal, cognition: 'alien' } }),
  dryad: entry('controller', {
    role: 'caster',
    function: 'control',
    secondaryRoles: ['lurker'],
    intent: ['protect_grove', 'charm_intruders'],
    posture: 'cautious',
    tags: ['fey', 'charm', 'forest', 'fragile']
  }, BEHAVIOR.cunning),
  pixie: entry('controller', {
    role: 'caster',
    function: 'debuffer',
    secondaryRoles: ['skirmisher'],
    intent: ['confuse_intruders', 'avoid_contact'],
    posture: 'cautious',
    tags: ['fey', 'flying', 'invisible', 'fragile']
  }, BEHAVIOR.cunning),
  medusa: entry('controller', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['artillery'],
    intent: ['petrify_exposed_target'],
    posture: 'cautious',
    tags: ['monstrosity', 'gaze', 'ranged']
  }, BEHAVIOR.cunning),
  minotaur: brute(['monstrosity'], { function: 'charger' }),
  owlbear: brute(['monstrosity'], { function: 'brute', behavior: BEHAVIOR.animal }),
  basilisk: brute(['monstrosity', 'gaze'], { role: 'lurker', function: 'stalker', secondaryRoles: ['striker'], behavior: BEHAVIOR.animal }),
  cockatrice: beast('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['petrify_exposed_target'],
    posture: 'opportunistic',
    tags: ['monstrosity', 'melee', 'petrification', 'flying']
  }),
  griffon: beast('skirmisher', {
    role: 'striker',
    function: 'charger',
    secondaryRoles: ['skirmisher'],
    intent: ['dive_on_exposed_target'],
    posture: 'aggressive',
    tags: ['monstrosity', 'flying', 'melee']
  }),
  hippogriff: beast('skirmisher', {
    role: 'skirmisher',
    function: 'flanker',
    intent: ['dive_and_harry'],
    posture: 'opportunistic',
    tags: ['monstrosity', 'flying', 'melee']
  }),
  manticore: entry('archer', {
    role: 'artillery',
    function: 'suppressor',
    secondaryRoles: ['skirmisher'],
    intent: ['harass_from_range', 'avoid_melee'],
    posture: 'opportunistic',
    tags: ['monstrosity', 'flying', 'ranged']
  }, { ...BEHAVIOR.animal, cognition: 'brutish' }),
  'phase spider': beast('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    secondaryRoles: ['striker'],
    intent: ['phase_in_poison_target', 'phase_out'],
    posture: 'opportunistic',
    tags: ['monstrosity', 'poison', 'teleport', 'ambush']
  }),
  wyvern: beast('brute', {
    role: 'striker',
    function: 'charger',
    secondaryRoles: ['skirmisher'],
    intent: ['poison_priority_target', 'preserve_mobility'],
    posture: 'aggressive',
    tags: ['dragon', 'flying', 'poison', 'melee']
  }, { ...BEHAVIOR.animal, riskTolerance: 'bold' })
});
