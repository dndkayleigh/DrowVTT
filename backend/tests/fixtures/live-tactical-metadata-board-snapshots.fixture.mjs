export const LIVE_TACTICAL_METADATA_SNAPSHOT = {
  version: 1,
  savedAt: '2026-05-02T12:00:00.000Z',
  state: {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 0, h: 0, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    encounterDescription: 'Imported tactical metadata should survive the live board path.',
    blockingEdges: { edgeKeys: [] },
    tokens: [
      {
        id: 'mage-token',
        name: 'Mage',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 352,
        y: 288,
        ac: 12,
        hp: '40/40',
        speed: 30,
        notes: '',
        statblock: '',
        attacks: [{
          name: 'Dagger',
          attackKind: 'melee',
          rangeFt: 5,
          expectedDamage: 4
        }],
        spells: [{
          name: 'Shield',
          kind: 'defensive',
          target: 'self',
          rangeFt: 0,
          expectedValue: 5,
          requiresLineOfSight: false
        }],
        tactical: {
          role: 'boss_caster',
          protected_asset: true,
          objective_role: 'ritual_actor',
          role_notes: 'Protected ritual caster'
        },
        behavior: {
          cognition: 'cunning',
          drive: 'complete_objective',
          riskTolerance: 'self_preserving',
          coordination: 'commander_led',
          planningHorizon: 'long',
          targetStickiness: 'high'
        }
      },
      {
        id: 'hero-token',
        name: 'Aria',
        type: 'PC',
        sizeCells: 1,
        color: '#5aa9ff',
        x: 96,
        y: 288,
        ac: 16,
        hp: '24/24',
        speed: 30,
        notes: '',
        statblock: ''
      }
    ],
    selectedTokenId: 'mage-token',
    selectedTokenIds: ['mage-token'],
    currentTurnTokenId: 'mage-token',
    aiGroupTokenIds: ['mage-token'],
    aiControls: 'Monsters',
    round: 1
  }
};

export const LEGACY_BOARD_SNAPSHOT_WITHOUT_TACTICAL = {
  version: 1,
  savedAt: '2026-05-02T12:05:00.000Z',
  state: {
    gridSize: 64,
    snapMode: 'center',
    view: { zoom: 1, panX: 0, panY: 0 },
    map: { src: '', w: 0, h: 0, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
    encounterDescription: 'Legacy board snapshots do not include tactical metadata.',
    blockingEdges: { edgeKeys: [] },
    tokens: [
      {
        id: 'legacy-mage-token',
        name: 'Mage',
        type: 'Monster',
        sizeCells: 1,
        color: '#ff5a7a',
        x: 352,
        y: 288,
        ac: 12,
        hp: '40/40',
        speed: 30,
        notes: '',
        statblock: 'Mage (SRD 5.1)\n- Traits:\n  - Spellcasting: The mage is a 9th-level spellcaster. The mage has the following wizard spells prepared: shield.\n- Actions:\n  - Dagger: Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.'
      },
      {
        id: 'legacy-hero-token',
        name: 'Aria',
        type: 'PC',
        sizeCells: 1,
        color: '#5aa9ff',
        x: 96,
        y: 288,
        ac: 16,
        hp: '24/24',
        speed: 30,
        notes: '',
        statblock: ''
      }
    ],
    selectedTokenId: 'legacy-mage-token',
    selectedTokenIds: ['legacy-mage-token'],
    currentTurnTokenId: 'legacy-mage-token',
    aiGroupTokenIds: ['legacy-mage-token'],
    aiControls: 'Monsters',
    round: 1
  }
};

export function cloneBoardSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}
