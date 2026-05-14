import {
  MORK_BORG_MONSTER_TACTICAL_MAP,
  SRD_MONSTER_TACTICAL_MAP
} from '../src/monster-mappings/index.js';

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

const REQUIRED_BEHAVIOR_FIELDS = [
  'cognition',
  'drive',
  'riskTolerance',
  'coordination',
  'planningHorizon',
  'targetStickiness'
];

const retiredRoleParts = [
  ['disciplined', 'blocker'],
  ['brute', 'blocker'],
  ['support', 'caster'],
  ['controller', 'caster'],
  ['boss', 'caster'],
  ['ambusher', 'bruiser'],
  ['melee', 'disrupter'],
  ['held', 'ambusher'],
  ['mobile', 'striker'],
  ['disciplined', 'soldier'],
  ['mindless', 'swarmer'],
  ['artillery', 'ranged'],
  ['summoner', 'controller'],
  ['leader', 'commander'],
  ['solo', 'boss']
];

const retiredFieldPatterns = [
  ['mapped', 'core', 'role'].join('_'),
  `mapped${'Core'}${'Role'}`,
  `authored${'Role'}`,
  ['core', 'role'].join('_'),
  `${'core'}${'Role'}`,
  `${'core'}${'Role'}Source`
];

const FORBIDDEN_PATTERNS = [
  ...retiredRoleParts.map((parts) => parts.join('_')),
  ...retiredFieldPatterns
];

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      visit(key);
      walk(item, visit);
    }
    return;
  }
  visit(String(value ?? ''));
}

function auditMap(label, map) {
  const issues = [];
  const counts = new Map();

  for (const [name, mapping] of Object.entries(map)) {
    const role = mapping?.tactical?.role;
    const functionName = mapping?.tactical?.function;
    if (!role) issues.push(`${label}:${name} missing tactical.role`);
    if (role && !CANONICAL_ROLES.has(role)) issues.push(`${label}:${name} invalid tactical.role ${role}`);
    if (typeof functionName !== 'string') issues.push(`${label}:${name} tactical.function must be a string`);

    const secondaryRoles = mapping?.tactical?.secondaryRoles || [];
    if (!Array.isArray(secondaryRoles)) {
      issues.push(`${label}:${name} tactical.secondaryRoles must be an array`);
    } else {
      for (const secondaryRole of secondaryRoles) {
        if (!CANONICAL_ROLES.has(secondaryRole)) issues.push(`${label}:${name} invalid tactical.secondaryRoles value ${secondaryRole}`);
      }
    }

    for (const field of REQUIRED_BEHAVIOR_FIELDS) {
      if (!mapping?.behavior?.[field]) issues.push(`${label}:${name} missing behavior.${field}`);
    }

    walk(mapping, (text) => {
      for (const forbidden of FORBIDDEN_PATTERNS) {
        if (String(text).includes(forbidden)) issues.push(`${label}:${name} contains forbidden value ${forbidden}`);
      }
    });

    const countKey = `${role || 'missing'}/${functionName || ''}`;
    counts.set(countKey, (counts.get(countKey) || 0) + 1);
  }

  return { issues, counts, total: Object.keys(map).length };
}

const audits = [
  ['srd', SRD_MONSTER_TACTICAL_MAP],
  ['mork_borg', MORK_BORG_MONSTER_TACTICAL_MAP]
].map(([label, map]) => [label, auditMap(label, map)]);

let failed = false;
for (const [label, result] of audits) {
  console.log(`${label}: ${result.total} mappings`);
  for (const [key, count] of [...result.counts.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
  if (result.issues.length) {
    failed = true;
    for (const issue of result.issues) console.error(`ERROR: ${issue}`);
  }
}

if (failed) process.exit(1);
