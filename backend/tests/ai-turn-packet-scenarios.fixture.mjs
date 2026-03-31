import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const GRID_SIZE = 64;

function loadSrdMonsters() {
  const filePath = path.resolve(process.cwd(), '..', 'data', 'srd-monsters.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.window.SRD_MONSTERS || [];
}

const SRD_MONSTERS = loadSrdMonsters();
const SRD_BY_NAME = new Map(SRD_MONSTERS.map((monster) => [monster.name, monster]));

function sizeCellsFromMonster(monster) {
  if (!monster) return 1;
  if (monster.size === 'Huge' || monster.size === 'Gargantuan') return 3;
  if (monster.size === 'Large') return 2;
  return 1;
}

function tokenCenterFromCell(cellX, cellY, sizeCells) {
  return {
    x: GRID_SIZE * (cellX + (sizeCells / 2)),
    y: GRID_SIZE * (cellY + (sizeCells / 2))
  };
}

function srdToken(monsterName, options = {}) {
  const monster = SRD_BY_NAME.get(monsterName);
  if (!monster) throw new Error(`Unknown SRD monster: ${monsterName}`);

  const sizeCells = options.sizeCells ?? sizeCellsFromMonster(monster);
  const position = tokenCenterFromCell(options.cellX ?? 0, options.cellY ?? 0, sizeCells);

  return {
    id: options.id ?? monsterName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: options.name ?? monster.name,
    type: options.type ?? 'Monster',
    sizeCells,
    color: options.color ?? '#ff5a7a',
    x: position.x,
    y: position.y,
    ac: options.ac ?? monster.ac,
    hp: options.hp ?? `${monster.hp}/${monster.hp}`,
    speed: options.speed ?? monster.speed,
    notes: options.notes ?? '',
    statblock: options.statblock ?? monster.statblock,
    art: null
  };
}

function scenario({ id, description, aiControls = 'Monsters', round = 3, currentTurnId, tokens }) {
  return {
    id,
    description,
    state: {
      gridSize: GRID_SIZE,
      snapMode: 'center',
      view: { zoom: 1, panX: 0, panY: 0 },
      map: { src: '', w: 2048, h: 1536, offX: 0, offY: 0, scale: 1, rot: 0, opacity: 1 },
      tokens,
      selectedTokenId: currentTurnId,
      currentTurnTokenId: currentTurnId,
      aiControls,
      round
    }
  };
}

export const AI_PACKET_SCENARIOS = [
  scenario({
    id: 'duel-goblin-vs-acolyte',
    description: 'Minimal melee duel with a short SRD statblock on the active turn.',
    currentTurnId: 'goblin-a',
    tokens: [
      srdToken('Goblin', { id: 'goblin-a', cellX: 4, cellY: 4, notes: 'Shortbow ready.' }),
      srdToken('Acolyte', { id: 'acolyte', name: 'Acolyte', type: 'PC', color: '#5aa9ff', cellX: 5, cellY: 4, notes: 'Holding sanctuary for Aria.' })
    ]
  }),
  scenario({
    id: 'ranged-bandit-crossfire',
    description: 'Several 1x1 bodies spread across lanes to stress token listing and occupied-space sections.',
    currentTurnId: 'bandit-a',
    tokens: [
      srdToken('Bandit', { id: 'bandit-a', cellX: 2, cellY: 2, notes: 'Elevated perch with light cover.' }),
      srdToken('Bandit', { id: 'bandit-b', name: 'Bandit B', cellX: 8, cellY: 2 }),
      srdToken('Bandit', { id: 'bandit-c', name: 'Bandit C', cellX: 5, cellY: 6 }),
      srdToken('Knight', { id: 'knight', type: 'PC', color: '#5aa9ff', cellX: 5, cellY: 3, notes: 'Shield wall anchor.' }),
      srdToken('Acolyte', { id: 'acolyte', type: 'PC', color: '#7dffb2', cellX: 6, cellY: 5, notes: 'Bless prepared.' })
    ]
  }),
  scenario({
    id: 'crowded-ogre-frontline',
    description: 'A large active creature plus multiple adjacent allies and enemies for crowded melee pressure.',
    currentTurnId: 'ogre',
    tokens: [
      srdToken('Ogre', { id: 'ogre', cellX: 4, cellY: 3, notes: 'Smash the center.' }),
      srdToken('Goblin', { id: 'goblin-a', cellX: 3, cellY: 2 }),
      srdToken('Goblin', { id: 'goblin-b', name: 'Goblin B', cellX: 7, cellY: 3 }),
      srdToken('Goblin', { id: 'goblin-c', name: 'Goblin C', cellX: 6, cellY: 5 }),
      srdToken('Knight', { id: 'knight', type: 'PC', color: '#5aa9ff', cellX: 8, cellY: 3, notes: 'Defending the caster.' }),
      srdToken('Acolyte', { id: 'acolyte', type: 'PC', color: '#7dffb2', cellX: 9, cellY: 5 }),
      srdToken('Bandit', { id: 'merc', name: 'Mercenary', type: 'NPC', color: '#ffd36a', cellX: 8, cellY: 6 })
    ]
  }),
  scenario({
    id: 'air-elemental-flank',
    description: 'A large high-mobility statblock with a medium number of surrounding tokens.',
    currentTurnId: 'air-elemental',
    tokens: [
      srdToken('Air Elemental', { id: 'air-elemental', cellX: 6, cellY: 4, notes: 'Can pass through hostile spaces.' }),
      srdToken('Knight', { id: 'knight', type: 'PC', color: '#5aa9ff', cellX: 8, cellY: 4 }),
      srdToken('Acolyte', { id: 'acolyte', type: 'PC', color: '#7dffb2', cellX: 10, cellY: 5 }),
      srdToken('Bandit', { id: 'bandit', type: 'NPC', color: '#ffd36a', cellX: 7, cellY: 7 }),
      srdToken('Goblin', { id: 'goblin-a', name: 'Goblin Spotter', cellX: 3, cellY: 5 })
    ]
  }),
  scenario({
    id: 'boss-dragon-vs-party',
    description: 'Very large active statblock with a compact party cluster to represent boss-turn worst case.',
    currentTurnId: 'adult-red-dragon',
    tokens: [
      srdToken('Adult Red Dragon', { id: 'adult-red-dragon', cellX: 9, cellY: 4, notes: 'Open with Frightful Presence, then breath if lined up.' }),
      srdToken('Knight', { id: 'knight', type: 'PC', color: '#5aa9ff', cellX: 4, cellY: 4 }),
      srdToken('Acolyte', { id: 'acolyte', type: 'PC', color: '#7dffb2', cellX: 5, cellY: 5 }),
      srdToken('Bandit', { id: 'bandit', type: 'NPC', color: '#ffd36a', cellX: 5, cellY: 3 }),
      srdToken('Ogre', { id: 'ogre', name: 'Ogre Ally', cellX: 2, cellY: 6, type: 'NPC', color: '#ffd36a' })
    ]
  }),
  scenario({
    id: 'aboleth-control-web',
    description: 'A long legendary-controller statblock with multiple enemy and ally anchors on the board.',
    currentTurnId: 'aboleth',
    tokens: [
      srdToken('Aboleth', { id: 'aboleth', cellX: 8, cellY: 6, notes: 'Pick off isolated targets with Enslave.' }),
      srdToken('Goblin', { id: 'goblin-a', name: 'Goblin Cultist', cellX: 5, cellY: 6 }),
      srdToken('Goblin', { id: 'goblin-b', name: 'Goblin Guard', cellX: 7, cellY: 9 }),
      srdToken('Knight', { id: 'knight', type: 'PC', color: '#5aa9ff', cellX: 12, cellY: 5 }),
      srdToken('Acolyte', { id: 'acolyte', type: 'PC', color: '#7dffb2', cellX: 13, cellY: 7, notes: 'Trying to stay within healing range.' }),
      srdToken('Air Elemental', { id: 'air-elemental', type: 'NPC', color: '#ffd36a', cellX: 10, cellY: 10 })
    ]
  })
];
