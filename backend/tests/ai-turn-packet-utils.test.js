import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiTurnPacketForStrategy,
  buildAiTurnPacketCompactFromState,
  parseAttackProfiles,
  parseSpellProfiles
} from '../../data/ai-turn-packet-utils.mjs';

test('parseAttackProfiles supports shorthand seed-style melee and ranged attack lines', () => {
  const profiles = parseAttackProfiles(
    [
      'Goblin (5e)',
      '- Speed 30 ft',
      '- Actions:',
      '  - Scimitar: +4 to hit, 5 ft, 1d6+2 slashing',
      '  - Shortbow: +4 to hit, range 80/320, 1d6+2 piercing',
      '- Bonus Action: Nimble Escape (Disengage or Hide)'
    ].join('\n')
  );

  assert.deepEqual(
    profiles.map((profile) => ({
      name: profile.name,
      attackKind: profile.attackKind,
      rangeFt: profile.rangeFt
    })),
    [
      { name: 'Scimitar', attackKind: 'melee', rangeFt: 5 },
      { name: 'Shortbow', attackKind: 'ranged', rangeFt: 80 }
    ]
  );
});

test('parseAttackProfiles splits SRD melee-or-ranged attacks into both legal profiles', () => {
  const profiles = parseAttackProfiles(
    [
      'Orc (SRD 5.1)',
      '- Actions:',
      '  - Greataxe: Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.',
      '  - Javelin: Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.'
    ].join('\n')
  );

  assert.deepEqual(
    profiles.map((profile) => ({
      name: profile.name,
      attackKind: profile.attackKind,
      rangeFt: profile.rangeFt
    })),
    [
      { name: 'Greataxe', attackKind: 'melee', rangeFt: 5 },
      { name: 'Javelin', attackKind: 'melee', rangeFt: 5 },
      { name: 'Javelin', attackKind: 'ranged', rangeFt: 30 }
    ]
  );
});

test('parseSpellProfiles extracts SRD acolyte support and offensive spells', () => {
  const profiles = parseSpellProfiles(
    [
      'Acolyte (SRD 5.1)',
      '- Traits:',
      '  - Spellcasting: The acolyte has following cleric spells prepared: - Cantrips (at will): light, sacred flame, thaumaturgy - 1st level (3 slots): bless, cure wounds, sanctuary',
      '- Actions:',
      '  - Club: Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage.'
    ].join('\n')
  );

  assert.deepEqual(
    profiles.map((profile) => ({
      name: profile.name,
      kind: profile.kind,
      target: profile.target,
      rangeFt: profile.rangeFt
    })),
    [
      { name: 'Bless', kind: 'support', target: 'ally', rangeFt: 30 },
      { name: 'Sacred Flame', kind: 'damage', target: 'enemy', rangeFt: 60 },
      { name: 'Cure Wounds', kind: 'healing', target: 'ally', rangeFt: 5 },
      { name: 'Sanctuary', kind: 'defensive', target: 'ally', rangeFt: 30 }
    ]
  );
});

test('parseSpellProfiles extracts a tactical Archmage spell subset from spellcasting text', () => {
  const profiles = parseSpellProfiles(
    [
      'Archmage (SRD 5.1)',
      '- Traits:',
      '  - Spellcasting: The archmage is an 18th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 17, +9 to hit with spell attacks). The archmage can cast disguise self and invisibility at will and has the following wizard spells prepared: - Cantrips (at will): fire bolt, light, mage hand, prestidigitation, shocking grasp - 1st level (4 slots): detect magic, identify, mage armor*, magic missile - 2nd level (3 slots): detect thoughts, mirror image, misty step - 3rd level (3 slots): counterspell, fly, lightning bolt - 5th level (3 slots): cone of cold, scrying, wall of force',
      '- Actions:',
      '  - Dagger: Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.'
    ].join('\n')
  );

  const byName = Object.fromEntries(profiles.map((profile) => [profile.name, profile]));
  assert.ok(byName['Fire Bolt']);
  assert.ok(byName['Magic Missile']);
  assert.ok(byName['Lightning Bolt']);
  assert.ok(byName['Cone of Cold']);
  assert.ok(byName['Misty Step']);
  assert.ok(byName['Counterspell']);
  assert.ok(byName['Mage Armor']);
  assert.ok(byName['Invisibility']);
  assert.equal(byName['Fire Bolt'].kind, 'damage');
  assert.equal(byName['Magic Missile'].requiresLineOfSight, false);
  assert.equal(byName['Misty Step'].target, 'self');
  assert.equal(byName['Counterspell'].kind, 'defensive');
});

test('compact move5 packet still includes legal attacks for the seeded goblin demo statblock format', () => {
  const state = {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 2048, h: 1536, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    aiControls: 'Monsters',
    round: 1,
    currentTurnTokenId: 'goblin-a',
    tokens: [
      {
        id: 'aria',
        name: 'Aria',
        type: 'PC',
        sizeCells: 1,
        color: '#5aa9ff',
        x: 64 * 13.5,
        y: 64 * 7.5,
        ac: 15,
        hp: '18/18',
        speed: 30,
        notes: '',
        statblock: '',
        art: null
      },
      {
        id: 'goblin-a',
        name: 'Goblin A',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 10.5,
        y: 64 * 7.5,
        ac: 15,
        hp: '7/7',
        speed: 30,
        notes: '',
        statblock: [
          'Goblin (5e)',
          '- Speed 30 ft',
          '- Actions:',
          '  - Scimitar: +4 to hit, 5 ft, 1d6+2 slashing',
          '  - Shortbow: +4 to hit, range 80/320, 1d6+2 piercing',
          '- Bonus Action: Nimble Escape (Disengage or Hide)'
        ].join('\n'),
        art: null
      }
    ]
  };

  const packet = buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5 });

  assert.match(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:/);
  assert.doesNotMatch(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:\n- none from listed move candidates/);
  assert.match(packet, /attack="Shortbow" kind=ranged target="Aria"/);
});

test('AI turn packet preserves explicit tactical, spell, and attack metadata', () => {
  const state = {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 2048, h: 1536, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    aiControls: 'Monsters',
    round: 1,
    currentTurnTokenId: 'mage',
    tokens: [
      {
        id: 'mage',
        name: 'Mage',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 4.5,
        y: 64 * 4.5,
        ac: 12,
        hp: '40/40',
        speed: 30,
        notes: '',
        statblock: '',
        tactical: { role: 'boss_caster', protectedAsset: true, objectiveRole: 'ritual_actor' },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }],
        attacks: [{ name: 'Dagger', attackKind: 'ranged', rangeFt: 20, expectedDamage: 4 }],
        art: null
      },
      {
        id: 'aria',
        name: 'Aria',
        type: 'PC',
        sizeCells: 1,
        color: '#5aa9ff',
        x: 64 * 7.5,
        y: 64 * 4.5,
        ac: 15,
        hp: '18/18',
        speed: 30,
        notes: '',
        statblock: '',
        art: null
      }
    ]
  };

  const packet = buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 });

  assert.match(packet, /tactical\(role=boss_caster protected_asset=true objective_role=ritual_actor\)/);
  assert.match(packet, /spells=Shield\/defensive/);
  assert.match(packet, /attacks=Dagger\/ranged\/20/);
  assert.match(packet, /attack="Dagger" kind=ranged target="Aria"/);
});

test('group tactical packet includes explicit grouped-monster context', () => {
  const state = {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 2048, h: 1536, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    aiControls: 'Monsters',
    round: 1,
    currentTurnTokenId: 'goblin-a',
    aiGroupTokenIds: ['goblin-a', 'goblin-b'],
    tokens: [
      {
        id: 'goblin-a',
        name: 'Goblin A',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 4.5,
        y: 64 * 4.5,
        ac: 15,
        hp: '7/7',
        speed: 30,
        notes: '',
        statblock: 'Goblin A statblock',
        art: null
      },
      {
        id: 'goblin-b',
        name: 'Goblin B',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 5.5,
        y: 64 * 4.5,
        ac: 15,
        hp: '7/7',
        speed: 30,
        notes: '',
        statblock: 'Goblin B statblock',
        art: null
      },
      {
        id: 'aria',
        name: 'Aria',
        type: 'PC',
        sizeCells: 1,
        color: '#5aa9ff',
        x: 64 * 8.5,
        y: 64 * 4.5,
        ac: 15,
        hp: '18/18',
        speed: 30,
        notes: '',
        statblock: '',
        art: null
      }
    ]
  };

  const packet = buildAiTurnPacketForStrategy(state, {
    id: 'group_tactical',
    packetVariant: 'full'
  });

  assert.match(packet, /ACTIVE TACTICAL GROUP:/);
  assert.match(packet, /"Goblin A", "Goblin B"/);
  assert.match(packet, /GROUP MEMBER STATBLOCKS:/);
  assert.match(packet, /Goblin A statblock/);
  assert.match(packet, /Goblin B statblock/);
});

test('LLM supervisor tactical packets keep existing LLM path and add supervisor instructions', () => {
  const state = {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 2048, h: 1536, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    aiControls: 'Monsters',
    round: 1,
    currentTurnTokenId: 'goblin-a',
    aiGroupTokenIds: ['goblin-a', 'goblin-b'],
    tokens: [
      {
        id: 'goblin-a',
        name: 'Goblin A',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 4.5,
        y: 64 * 4.5,
        ac: 15,
        hp: '7/7',
        speed: 30,
        notes: '',
        statblock: 'Goblin A statblock',
        art: null
      },
      {
        id: 'goblin-b',
        name: 'Goblin B',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 5.5,
        y: 64 * 4.5,
        ac: 15,
        hp: '7/7',
        speed: 30,
        notes: '',
        statblock: 'Goblin B statblock',
        art: null
      }
    ]
  };

  const singlePacket = buildAiTurnPacketForStrategy(state, {
    id: 'llm_supervisor_single',
    packetVariant: 'full',
    supervisor: 'llm'
  });
  assert.match(singlePacket, /LLM SUPERVISOR MODE:/);
  assert.match(singlePacket, /SUPERVISOR CANDIDATE SET:/);
  assert.match(singlePacket, /deterministic rules layer has already filtered/);
  assert.match(singlePacket, /Do not perform independent legality repair/);
  assert.doesNotMatch(singlePacket, /Reject candidates that cross blocked movement/);
  assert.doesNotMatch(singlePacket, /ACTIVE TACTICAL GROUP:/);

  const groupPacket = buildAiTurnPacketForStrategy(state, {
    id: 'llm_supervisor_group',
    packetVariant: 'full',
    supervisor: 'llm',
    requiresGroup: true
  });
  assert.match(groupPacket, /ACTIVE TACTICAL GROUP:/);
  assert.match(groupPacket, /LLM SUPERVISOR MODE:/);
  assert.match(groupPacket, /TOKEN "Goblin A" CANDIDATES:/);
  assert.match(groupPacket, /TOKEN "Goblin B" CANDIDATES:/);
  assert.match(groupPacket, /avoid redundant crowding/);
});

test('LLM supervisor candidates exclude out-of-bounds and blocked-edge moves', () => {
  const state = {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 64 * 4, h: 64 * 4, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    blockingEdges: ['h:1,1'],
    aiControls: 'Monsters',
    round: 1,
    currentTurnTokenId: 'archer',
    tokens: [
      {
        id: 'archer',
        name: 'Archer',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 64 * 1.5,
        y: 64 * 0.5,
        ac: 12,
        hp: '7/7',
        speed: 30,
        notes: '',
        statblock: [
          'Archer',
          '- Speed 30 ft',
          '- Actions:',
          '  - Bow: +4 to hit, range 80/320, 1d6+2 piercing'
        ].join('\n'),
        art: null
      },
      {
        id: 'hero',
        name: 'Hero',
        type: 'PC',
        sizeCells: 1,
        color: '#5aa9ff',
        x: 64 * 1.5,
        y: 64 * 3.5,
        ac: 15,
        hp: '18/18',
        speed: 30,
        notes: '',
        statblock: '',
        art: null
      }
    ]
  };

  const packet = buildAiTurnPacketForStrategy(state, {
    id: 'llm_supervisor_single',
    packetVariant: 'full_moves5_attacks6',
    supervisor: 'llm'
  });

  assert.match(packet, /Blocking edges: h:1,1/);
  assert.doesNotMatch(packet, /to=\([^)]*,-/);
  assert.doesNotMatch(packet, /to=\(-/);
  assert.doesNotMatch(packet, /legal_move to=\(1,1\)/);
  assert.doesNotMatch(packet, /from=\(1,1\)/);
});
