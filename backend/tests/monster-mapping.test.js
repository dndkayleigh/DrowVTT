import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORK_BORG_MONSTER_TACTICAL_MAP,
  SRD_MONSTER_TACTICAL_MAP,
  inferMonsterTacticalMapping,
  monsterTacticalMapping,
  normalizeMonsterProfile
} from '../../packages/tactical-ai-content/src/index.js';

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

const retiredFields = [
  ['mapped', 'core', 'role'].join('_'),
  `mapped${'Core'}${'Role'}`,
  `authored${'Role'}`,
  ['core', 'role'].join('_'),
  `${'core'}${'Role'}`,
  `${'core'}${'Role'}Source`
];

function mapping(systemId, name) {
  const result = monsterTacticalMapping(systemId, name);
  assert.ok(result, `Expected ${systemId} mapping for ${name}`);
  return result;
}

function assertRole(mappingValue, role, functionName) {
  assert.equal(mappingValue.tactical.role, role);
  assert.equal(mappingValue.tactical.function, functionName);
}

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

test('exact SRD monster mappings use portable role and function taxonomy', () => {
  assertRole(mapping('srd', 'zombie'), 'blocker', 'body_pressure');
  assertRole(mapping('srd', 'skeleton'), 'artillery', 'sniper');
  assertRole(mapping('srd', 'wolf'), 'skirmisher', 'melee_harrier');
  assertRole(mapping('srd', 'goblin'), 'skirmisher', 'ranged_harrier');
  assertRole(mapping('srd', 'hobgoblin'), 'blocker', 'hold_line');
  assertRole(mapping('srd', 'acolyte'), 'caster', 'support');
  assertRole(mapping('srd', 'mage'), 'caster', 'control');
  assertRole(mapping('srd', 'troll'), 'blocker', 'zone_anchor');
  assertRole(mapping('srd', 'giant crocodile'), 'lurker', 'grappler');

  const dragon = mapping('srd', 'young black dragon');
  assertRole(dragon, 'solo', 'boss_controller');
  assert.deepEqual(dragon.tactical.secondaryRoles, ['caster', 'striker']);
});

test('MORK BORG monster mappings cover named threats and archetypes', () => {
  assertRole(mapping('mork_borg', 'corpse'), 'blocker', 'body_pressure');
  assert.equal(mapping('mork_borg', 'cultist').behavior.cognition, 'fanatic');
  assertRole(mapping('mork_borg', 'witch'), 'caster', 'control');
  assertRole(mapping('mork_borg', 'troll'), 'striker', 'brute');
  assert.equal(mapping('mork_borg', 'demon').tactical.role, 'solo');
  assertRole(mapping('mork_borg', 'cursed idol'), 'hazard', 'ritual_object');
  assertRole(mapping('mork_borg', 'vermin swarm'), 'swarm', 'many_bodies');
  assertRole(mapping('mork_borg', 'undead_mindless'), 'blocker', 'body_pressure');
  assertRole(mapping('mork_borg', 'solo_apocalypse_horror'), 'solo', 'phase_boss');
});

test('fallback inference emits transparent portable mappings', () => {
  assert.equal(inferMonsterTacticalMapping({
    monster: { name: 'Unknown Hexer', spells: [{ name: 'Doom' }] }
  }).tactical.role, 'caster');

  assert.ok(['artillery', 'skirmisher'].includes(inferMonsterTacticalMapping({
    monster: { name: 'Unknown Archer', attacks: [{ name: 'Longbow', attackKind: 'ranged', rangeFt: 150, expectedDamage: 6 }] }
  }).tactical.role));

  assertRole(inferMonsterTacticalMapping({
    monster: { name: 'Unknown Horde', tags: ['swarm', 'many_bodies'] }
  }), 'swarm', 'many_bodies');

  assert.equal(inferMonsterTacticalMapping({
    monster: { name: 'Static Doom Turret', tags: ['static', 'hazard'] }
  }).tactical.role, 'hazard');

  assertRole(inferMonsterTacticalMapping({
    monster: { name: 'Unknown Mauler', attacks: [{ name: 'Maul', attackKind: 'melee', rangeFt: 5, expectedDamage: 14 }] }
  }), 'striker', 'brute');
});

test('normalizeMonsterProfile uses mappings and lets explicit overrides win', () => {
  const wolf = normalizeMonsterProfile({ name: 'Wolf' });
  assertRole(wolf, 'skirmisher', 'melee_harrier');
  assert.equal(wolf.behavior.coordination, 'pack');

  const custom = normalizeMonsterProfile({ name: 'Zombie' }, {
    overrides: {
      tactical: { role: 'leader', function: 'caller' },
      behavior: { cognition: 'genius', drive: 'test_plan', riskTolerance: 'normal', coordination: 'squad', planningHorizon: 'long', targetStickiness: 'low' }
    }
  });
  assertRole(custom, 'leader', 'caller');
  assert.equal(custom.behavior.cognition, 'genius');
});

test('all monster mappings use canonical roles, behavior fields, and no retired schema vocabulary', () => {
  const forbidden = [
    ...retiredRoleParts.map((parts) => parts.join('_')),
    ...retiredFields
  ];

  for (const [label, map] of [['srd', SRD_MONSTER_TACTICAL_MAP], ['mork_borg', MORK_BORG_MONSTER_TACTICAL_MAP]]) {
    for (const [name, value] of Object.entries(map)) {
      assert.ok(CANONICAL_ROLES.has(value.tactical.role), `${label}:${name} role`);
      assert.equal(typeof value.tactical.function, 'string', `${label}:${name} function`);
      for (const secondaryRole of value.tactical.secondaryRoles || []) {
        assert.ok(CANONICAL_ROLES.has(secondaryRole), `${label}:${name} secondary role ${secondaryRole}`);
      }
      for (const field of REQUIRED_BEHAVIOR_FIELDS) {
        assert.ok(value.behavior[field], `${label}:${name} behavior.${field}`);
      }
      walk(value, (text) => {
        for (const forbiddenText of forbidden) {
          assert.equal(String(text).includes(forbiddenText), false, `${label}:${name} contains ${forbiddenText}`);
        }
      });
    }
  }
});
