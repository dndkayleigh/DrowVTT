const BEHAVIOR = Object.freeze({
  corpse: {
    cognition: 'mindless',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  },
  raider: {
    cognition: 'trained',
    drive: 'survive_and_steal',
    riskTolerance: 'self_preserving',
    coordination: 'pack',
    planningHorizon: 'short',
    targetStickiness: 'low'
  },
  cult: {
    cognition: 'fanatic',
    drive: 'complete_ritual',
    riskTolerance: 'bold',
    coordination: 'commander_led',
    planningHorizon: 'medium',
    targetStickiness: 'medium'
  },
  caster: {
    cognition: 'cunning',
    drive: 'complete_objective',
    riskTolerance: 'self_preserving',
    coordination: 'commander_led',
    planningHorizon: 'medium',
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
  horror: {
    cognition: 'alien',
    drive: 'complete_objective',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'long',
    targetStickiness: 'high'
  },
  hazard: {
    cognition: 'alien',
    drive: 'corrupt_area',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  }
});

function entry(archetype, tactical, behavior) {
  return { archetype, tactical, behavior };
}

function corpse(name = 'rotting corpse') {
  return entry('brute', {
    role: 'blocker',
    function: 'body_pressure',
    intent: ['press_nearest', 'clog_space'],
    posture: 'aggressive',
    tags: ['undead', 'melee', 'body_pressure', 'doomed'],
    roleNotes: `${name} that applies simple pressure rather than tactical doctrine.`
  }, BEHAVIOR.corpse);
}

function raider(functionName = 'flanker') {
  return entry('skirmisher', {
    role: 'skirmisher',
    function: functionName,
    intent: ['survive_and_steal', 'avoid_fair_fight'],
    posture: 'opportunistic',
    tags: ['human', 'desperate', 'self_preserving']
  }, BEHAVIOR.raider);
}

function cultist(role = 'striker', functionName = 'disruptor') {
  return entry(role === 'leader' ? 'controller' : 'skirmisher', {
    role,
    function: functionName,
    secondaryRoles: role === 'leader' ? ['caster'] : [],
    intent: ['complete_ritual', 'protect_cult_work'],
    posture: role === 'leader' ? 'cautious' : 'aggressive',
    tags: ['human', 'fanatic', 'ritual', 'doomed']
  }, BEHAVIOR.cult);
}

function cursedCaster(functionName = 'control', secondaryRoles = []) {
  return entry('controller', {
    role: 'caster',
    function: functionName,
    secondaryRoles,
    intent: ['complete_objective', 'preserve_self', 'curse_intruders'],
    posture: 'cautious',
    tags: ['occult', 'curse', 'fragile', 'doomed']
  }, BEHAVIOR.caster);
}

function horror(functionName = 'boss_brute', secondaryRoles = ['striker']) {
  return entry('brute', {
    role: 'solo',
    function: functionName,
    secondaryRoles,
    intent: ['break_survivors', 'spread_doom'],
    posture: 'aggressive',
    tags: ['horror', 'boss', 'supernatural', 'doomed'],
    roleNotes: 'Centerpiece doom creature that should pressure the whole party.'
  }, BEHAVIOR.horror);
}

function staticHazard(functionName = 'ritual_object', tags = []) {
  return entry('controller', {
    role: 'hazard',
    function: functionName,
    intent: ['corrupt_area', 'force_interaction'],
    posture: 'fixed',
    tags: ['hazard', 'doom', ...tags],
    roleNotes: 'Static or semi-static MORK BORG threat.'
  }, BEHAVIOR.hazard);
}

export const MORK_BORG_MONSTER_TACTICAL_MAP = Object.freeze({
  corpse: corpse('corpse'),
  skeleton: corpse('skeleton'),
  zombie: corpse('zombie'),
  goblin: entry('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['harry_weak_target', 'avoid_retribution'],
    posture: 'opportunistic',
    tags: ['goblin', 'melee', 'cowardly', 'doomed']
  }, BEHAVIOR.raider),
  bandit: raider('flanker'),
  cultist: cultist('striker', 'disruptor'),
  'cult leader': cultist('leader', 'commander'),
  priest: cursedCaster('support', ['leader']),
  witch: cursedCaster('control'),
  necromancer: cursedCaster('summoner', ['leader']),
  prophet: cursedCaster('ritualist', ['leader']),
  beast: entry('skirmisher', {
    role: 'striker',
    function: 'brute',
    intent: ['maul_nearest', 'feed_or_flee'],
    posture: 'aggressive',
    tags: ['beast', 'melee', 'wild']
  }, { ...BEHAVIOR.brute, cognition: 'animal', riskTolerance: 'normal' }),
  wolf: entry('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['isolate_weak_prey'],
    posture: 'opportunistic',
    tags: ['beast', 'melee', 'pack', 'fast']
  }, { ...BEHAVIOR.raider, cognition: 'animal', drive: 'isolate_weak_prey', coordination: 'pack' }),
  hound: entry('skirmisher', {
    role: 'skirmisher',
    function: 'flanker',
    intent: ['run_down_fleeing_target'],
    posture: 'aggressive',
    tags: ['beast', 'melee', 'pack', 'fast']
  }, { ...BEHAVIOR.raider, cognition: 'animal', drive: 'run_down_prey', coordination: 'pack' }),
  troll: entry('brute', {
    role: 'striker',
    function: 'brute',
    secondaryRoles: ['blocker'],
    intent: ['smash_nearest', 'hold_bridge_or_door'],
    posture: 'aggressive',
    tags: ['brute', 'melee', 'durable', 'horror']
  }, BEHAVIOR.brute),
  giant: entry('brute', {
    role: 'striker',
    function: 'brute',
    secondaryRoles: ['blocker'],
    intent: ['crush_frontline'],
    posture: 'aggressive',
    tags: ['giant', 'melee', 'durable']
  }, BEHAVIOR.brute),
  ogre: entry('brute', {
    role: 'striker',
    function: 'brute',
    secondaryRoles: ['blocker'],
    intent: ['smash_nearest'],
    posture: 'aggressive',
    tags: ['brute', 'melee', 'durable']
  }, BEHAVIOR.brute),
  assassin: entry('skirmisher', {
    role: 'lurker',
    function: 'ambusher',
    secondaryRoles: ['striker'],
    intent: ['kill_mark', 'escape_after_hit'],
    posture: 'opportunistic',
    tags: ['human', 'stealth', 'blade', 'self_preserving']
  }, { ...BEHAVIOR.caster, coordination: 'none' }),
  stalker: entry('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    intent: ['shadow_party', 'punish_isolation'],
    posture: 'opportunistic',
    tags: ['horror', 'stealth', 'ambush']
  }, BEHAVIOR.horror),
  demon: horror('phase_boss', ['caster', 'striker']),
  'angelic horror': horror('boss_controller', ['caster', 'leader']),
  'apocalypse beast': horror('phase_boss', ['caster', 'striker']),
  'vermin swarm': entry('brute', {
    role: 'swarm',
    function: 'many_bodies',
    intent: ['overwhelm_nearest', 'clog_space'],
    posture: 'aggressive',
    tags: ['vermin', 'swarm', 'many_bodies', 'doomed']
  }, { ...BEHAVIOR.corpse, cognition: 'animal', coordination: 'swarm' }),
  'rat swarm': entry('brute', {
    role: 'swarm',
    function: 'many_bodies',
    intent: ['overwhelm_nearest', 'clog_space'],
    posture: 'aggressive',
    tags: ['beast', 'swarm', 'many_bodies']
  }, { ...BEHAVIOR.corpse, cognition: 'animal', coordination: 'swarm' }),
  'rot sludge': entry('brute', {
    role: 'hazard',
    function: 'environmental',
    secondaryRoles: ['blocker'],
    intent: ['corrode_and_clog_space'],
    posture: 'fixed',
    tags: ['ooze', 'rot', 'slow', 'corridor_threat']
  }, BEHAVIOR.hazard),
  ooze: entry('brute', {
    role: 'blocker',
    function: 'body_pressure',
    secondaryRoles: ['hazard'],
    intent: ['engulf_nearest'],
    posture: 'aggressive',
    tags: ['ooze', 'melee', 'slow']
  }, BEHAVIOR.corpse),
  'cursed idol': staticHazard('ritual_object', ['idol', 'curse']),
  'ritual object': staticHazard('ritual_object', ['ritual_object']),
  turret: staticHazard('turret', ['turret']),
  trap: staticHazard('trap', ['trap']),
  'environmental hazard': staticHazard('environmental', ['environmental']),

  undead_mindless: corpse('mindless undead archetype'),
  animal_pack: entry('skirmisher', {
    role: 'skirmisher',
    function: 'melee_harrier',
    intent: ['isolate_weak_prey'],
    posture: 'opportunistic',
    tags: ['animal', 'pack', 'fast']
  }, { ...BEHAVIOR.raider, cognition: 'animal', drive: 'isolate_weak_prey', coordination: 'pack' }),
  desperate_raider: raider('flanker'),
  fanatic_cultist: cultist('striker', 'disruptor'),
  cursed_caster: cursedCaster('control'),
  brute_horror: entry('brute', {
    role: 'striker',
    function: 'brute',
    secondaryRoles: ['blocker'],
    intent: ['smash_nearest', 'spread_fear'],
    posture: 'aggressive',
    tags: ['horror', 'melee', 'durable']
  }, BEHAVIOR.brute),
  lurking_horror: entry('skirmisher', {
    role: 'lurker',
    function: 'stalker',
    intent: ['punish_isolation'],
    posture: 'opportunistic',
    tags: ['horror', 'stealth', 'ambush']
  }, BEHAVIOR.horror),
  true_swarm: entry('brute', {
    role: 'swarm',
    function: 'many_bodies',
    intent: ['overwhelm_nearest', 'clog_space'],
    posture: 'aggressive',
    tags: ['swarm', 'many_bodies']
  }, { ...BEHAVIOR.corpse, coordination: 'swarm' }),
  solo_apocalypse_horror: horror('phase_boss', ['caster', 'striker']),
  static_doom_hazard: staticHazard('environmental', ['environmental', 'doom'])
});
