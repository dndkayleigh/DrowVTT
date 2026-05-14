import { SRD_MONSTER_TACTICAL_MAP } from './srd.js';
import { MORK_BORG_MONSTER_TACTICAL_MAP } from './mork-borg.js';

const CANONICAL_ROLES = new Set([
  'blocker',
  'striker',
  'skirmisher',
  'caster',
  'leader',
  'lurker',
  'artillery',
  'swarm',
  'solo',
  'hazard'
]);

const SYSTEM_ALIASES = new Map([
  ['srd', 'srd'],
  ['five_e_srd', 'srd'],
  ['5e_srd', 'srd'],
  ['dnd_5_5_srd', 'srd'],
  ['dnd_5e_srd', 'srd'],
  ['mork_borg', 'mork_borg'],
  ['morkborg', 'mork_borg'],
  ['mörk_borg', 'mork_borg']
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function textFrom(value) {
  if (Array.isArray(value)) return value.map(textFrom).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textFrom).join(' ');
  return String(value || '');
}

function normalizeAttackKind(attack = {}) {
  return String(attack.attackKind || attack.kind || attack.type || '').toLowerCase();
}

function attackRange(attack = {}) {
  return Number(attack.rangeFt ?? attack.range ?? attack.rangeFeet ?? 0) || 0;
}

function attackDamage(attack = {}) {
  return Number(attack.expectedDamage ?? attack.damage ?? attack.averageDamage ?? 0) || 0;
}

function mappingWithProvenance(mapping, mappingSource, confidence, reasons) {
  if (!mapping) return null;
  return {
    ...clone(mapping),
    provenance: {
      mappingSource,
      confidence,
      reasons: [...reasons]
    }
  };
}

export function normalizeMonsterMappingKey(name = '') {
  return String(name?.name || name || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ');
}

export function srdMonsterTacticalMapping(monsterOrName = {}) {
  const key = normalizeMonsterMappingKey(monsterOrName);
  const mapping = SRD_MONSTER_TACTICAL_MAP[key];
  return mapping ? mappingWithProvenance(mapping, 'exact', 1, [`Matched SRD mapping for ${key}.`]) : null;
}

export function morkBorgMonsterTacticalMapping(monsterOrName = {}) {
  const key = normalizeMonsterMappingKey(monsterOrName);
  const exact = MORK_BORG_MONSTER_TACTICAL_MAP[key];
  if (exact) return mappingWithProvenance(exact, key.includes('_') ? 'archetype' : 'exact', 1, [`Matched MORK BORG mapping for ${key}.`]);
  return null;
}

export function monsterTacticalMapping(systemId = 'srd', monsterOrName = {}) {
  const canonicalSystem = SYSTEM_ALIASES.get(normalizeMonsterMappingKey(systemId)) || 'srd';
  if (canonicalSystem === 'mork_borg') return morkBorgMonsterTacticalMapping(monsterOrName);
  return srdMonsterTacticalMapping(monsterOrName);
}

function fallbackBehavior(overrides = {}) {
  return {
    cognition: 'trained',
    drive: 'tactical_role_objective',
    riskTolerance: 'normal',
    coordination: 'none',
    planningHorizon: 'short',
    targetStickiness: 'medium',
    ...overrides
  };
}

function inferred(archetype, tactical, behavior, confidence, reasons) {
  const role = tactical.role || 'striker';
  const safeRole = CANONICAL_ROLES.has(role) ? role : 'striker';
  return {
    archetype,
    tactical: {
      role: safeRole,
      function: String(tactical.function || 'brute'),
      secondaryRoles: Array.isArray(tactical.secondaryRoles) ? tactical.secondaryRoles.filter((item) => CANONICAL_ROLES.has(item)) : [],
      intent: Array.isArray(tactical.intent) ? tactical.intent : ['apply_direct_pressure'],
      posture: String(tactical.posture || 'aggressive'),
      tags: Array.isArray(tactical.tags) ? tactical.tags.map(String) : [],
      roleNotes: String(tactical.roleNotes || '')
    },
    behavior: fallbackBehavior(behavior),
    provenance: {
      mappingSource: confidence < 0.5 ? 'fallback' : 'heuristic',
      confidence,
      reasons
    }
  };
}

export function inferMonsterTacticalMapping({ systemId = 'srd', monster = {} } = {}) {
  const name = normalizeMonsterMappingKey(monster?.name || monster?.id || '');
  const attacks = Array.isArray(monster?.attacks) ? monster.attacks : [];
  const spells = Array.isArray(monster?.spells) ? monster.spells : [];
  const tagText = textFrom(monster?.tags);
  const traitText = textFrom(monster?.traits);
  const statblockText = String(monster?.statblock || '');
  const haystack = `${name} ${tagText} ${traitText} ${statblockText}`.toLowerCase();
  const size = String(monster?.size || monster?.sizeCategory || '').toLowerCase();
  const speed = Number(monster?.speed || 0) || 0;
  const hasSpellText = spells.length > 0 || /\b(spellcasting|spell|cantrip|ritual|curse|hex|magic)\b/i.test(haystack);
  const rangedAttacks = attacks.filter((attack) => normalizeAttackKind(attack).includes('ranged') || attackRange(attack) >= 30);
  const meleeAttacks = attacks.filter((attack) => normalizeAttackKind(attack).includes('melee') || (attackRange(attack) > 0 && attackRange(attack) <= 10));
  const maxDamage = attacks.reduce((max, attack) => Math.max(max, attackDamage(attack)), 0);
  const reasons = [];

  if (/\b(static|trap|turret|idol|ritual object|lair|hazard|environmental)\b/i.test(haystack)) {
    reasons.push('Static object, trap, turret, lair, or environmental language suggests a hazard.');
    return inferred('controller', {
      role: 'hazard',
      function: /\bturret\b/i.test(haystack) ? 'turret' : /\btrap\b/i.test(haystack) ? 'trap' : /\britual object|idol\b/i.test(haystack) ? 'ritual_object' : 'environmental',
      intent: ['force_interaction', 'control_space'],
      posture: 'fixed',
      tags: ['hazard']
    }, { cognition: 'programmed', riskTolerance: 'fearless', planningHorizon: 'immediate', targetStickiness: 'high' }, 0.82, reasons);
  }

  if (/\b(swarm|horde|mob|many bodies|many_bodies)\b/i.test(haystack)) {
    reasons.push('Swarm, horde, mob, or many-bodies language indicates mass/body-pressure.');
    return inferred('brute', {
      role: 'swarm',
      function: 'many_bodies',
      intent: ['overwhelm_nearest', 'clog_space'],
      tags: ['swarm', 'many_bodies']
    }, { cognition: /\bundead|corpse|zombie\b/i.test(haystack) ? 'mindless' : 'animal', coordination: 'swarm', riskTolerance: 'fearless' }, 0.85, reasons);
  }

  if (hasSpellText) {
    reasons.push('Spells or spell-like language suggest a caster.');
    return inferred('controller', {
      role: 'caster',
      function: /\b(heal|bless|cure|support|priest|acolyte)\b/i.test(haystack) ? 'support' : /\b(summon|raise|necromancer)\b/i.test(haystack) ? 'summoner' : /\britual|prophet|idol\b/i.test(haystack) ? 'ritualist' : 'control',
      secondaryRoles: rangedAttacks.length ? ['artillery'] : [],
      intent: ['control_battlefield', 'preserve_self'],
      posture: 'cautious',
      tags: ['caster', 'fragile']
    }, { cognition: 'cunning', riskTolerance: 'self_preserving', coordination: 'commander_led', planningHorizon: 'medium', targetStickiness: 'high' }, 0.78, reasons);
  }

  if (/\b(dragon|demon|boss|ancient|adult|apocalypse)\b/i.test(haystack) || ['huge', 'gargantuan'].includes(size)) {
    reasons.push('Boss, dragon, demon, adult/ancient, or huge-scale language suggests a solo threat.');
    return inferred('brute', {
      role: 'solo',
      function: /\bspell|magic|breath|gaze|curse\b/i.test(haystack) ? 'boss_controller' : 'boss_brute',
      secondaryRoles: ['striker'],
      intent: ['pressure_party', 'preserve_self'],
      tags: ['boss']
    }, { cognition: /\bdemon|apocalypse\b/i.test(haystack) ? 'alien' : 'cunning', riskTolerance: 'bold', planningHorizon: 'long', targetStickiness: 'high' }, 0.74, reasons);
  }

  if (/\b(hidden|ambush|grapple|stalk|spider|crocodile|assassin|lurking)\b/i.test(haystack)) {
    reasons.push('Ambush, stalk, grapple, spider, crocodile, or assassin language suggests a lurker.');
    return inferred('skirmisher', {
      role: 'lurker',
      function: /\bgrapple|crocodile|constrict/i.test(haystack) ? 'grappler' : 'ambusher',
      secondaryRoles: ['striker'],
      intent: ['punish_isolated_target'],
      posture: 'opportunistic',
      tags: ['ambush']
    }, { cognition: 'animal', riskTolerance: 'normal' }, 0.72, reasons);
  }

  if (rangedAttacks.length && rangedAttacks.length >= meleeAttacks.length) {
    reasons.push('Ranged attacks dominate available attacks.');
    return inferred('archer', {
      role: speed >= 35 ? 'skirmisher' : 'artillery',
      function: speed >= 35 ? 'ranged_harrier' : 'sniper',
      intent: ['harass_from_range', 'avoid_melee'],
      posture: 'cautious',
      tags: ['ranged']
    }, { riskTolerance: 'self_preserving' }, 0.68, reasons);
  }

  if (speed >= 40 || /\b(fast|mobile|fly|flying|skirmish|harry)\b/i.test(haystack)) {
    reasons.push('High speed or mobility language suggests a skirmisher.');
    return inferred('skirmisher', {
      role: 'skirmisher',
      function: rangedAttacks.length ? 'ranged_harrier' : 'melee_harrier',
      intent: ['harass_and_reposition'],
      posture: 'opportunistic',
      tags: ['mobile']
    }, { riskTolerance: 'normal' }, 0.64, reasons);
  }

  if (/\b(guard|shield|choke|door|line|durable|armor|armour|defend|protect)\b/i.test(haystack)) {
    reasons.push('Guard, durable, chokepoint, or protection language suggests a blocker.');
    return inferred('brute', {
      role: 'blocker',
      function: /\bprotect|shield|guard\b/i.test(haystack) ? 'bodyguard' : 'hold_line',
      intent: ['hold_line', 'control_space'],
      posture: 'protective',
      tags: ['durable', 'melee']
    }, { riskTolerance: 'normal', targetStickiness: 'high' }, 0.62, reasons);
  }

  if (maxDamage >= 10 || meleeAttacks.length || /\b(brute|smash|maul|claw|bite|rage)\b/i.test(haystack)) {
    reasons.push('Melee pressure or high expected damage suggests a striker.');
    return inferred('brute', {
      role: 'striker',
      function: 'brute',
      intent: ['apply_direct_pressure'],
      tags: ['melee']
    }, { cognition: systemId === 'mork_borg' ? 'brutish' : 'trained' }, 0.58, reasons);
  }

  reasons.push('No strong tactical signals found; using direct-pressure fallback.');
  return inferred('brute', {
    role: 'striker',
    function: 'brute',
    intent: ['apply_direct_pressure'],
    tags: []
  }, {}, 0.35, reasons);
}

export { SRD_MONSTER_TACTICAL_MAP, MORK_BORG_MONSTER_TACTICAL_MAP };
