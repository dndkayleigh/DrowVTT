import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiTurnPacketCompactFromState,
  parseAttackProfiles
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
