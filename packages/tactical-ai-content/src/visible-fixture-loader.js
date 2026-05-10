import { normalizeEncounterState } from '../../tactical-ai-core/src/index.js';

export function parseVisibleEncounterFixture(source) {
  const raw = parseSimpleYaml(source);
  const battlefield = raw.battlefield || {};
  const edges = expandBlockingEdges(battlefield.blockingEdges || []);
  const encounter = normalizeEncounterState({
    id: raw.id,
    round: Number(raw.round || 1),
    activeActorId: raw.activeActor,
    activationGroups: (raw.activationGroups || []).map((group) => ({
      id: String(group.id || 'activation_group'),
      actorIds: Array.isArray(group.actorIds) ? group.actorIds.map((id) => String(id)) : [],
      activationMode: String(group.activationMode || 'coordinated_sequential')
    })),
    battlefield: {
      gridSize: Number(battlefield.gridSize || 64),
      width: Number(battlefield.width || 12),
      height: Number(battlefield.height || 12),
      edges,
      tiles: [],
      interactables: []
    },
    actors: (raw.actors || []).map((actor) => ({
      id: String(actor.id),
      name: String(actor.name || actor.id),
      side: String(actor.side || 'monsters'),
      cell: { x: Number(actor.position?.[0] || 0), y: Number(actor.position?.[1] || 0) },
      sizeCells: Number(actor.sizeCells || 1),
      ac: Number(actor.ac || 10),
      hp: actor.hp ?? '',
      speed: Number(actor.speed || 30),
      tactical: actor.tactical || null,
      behavior: actor.behavior || null,
      attacks: (actor.attacks || []).map((attack) => ({
        name: String(attack.name),
        attackKind: String(attack.kind || attack.attackKind || 'melee'),
        rangeFt: Number(attack.rangeFt || 5),
        expectedDamage: Number(attack.expectedDamage || 0)
      })),
      spells: (actor.spells || []).map((spell) => ({
        name: String(spell.name),
        kind: String(spell.kind || spell.spellKind || 'support'),
        target: String(spell.target || spell.targetSide || 'ally'),
        rangeFt: Number(spell.rangeFt || 30),
        expectedValue: Number(spell.expectedValue ?? spell.expectedDamage ?? 4),
        requiresLineOfSight: spell.requiresLineOfSight !== false
      })),
      traits: actor.traits || [],
      tags: actor.tags || [],
      statblock: actor.statblock || ''
    }))
  });

  return {
    id: String(raw.id),
    label: String(raw.title || raw.id),
    category: String(raw.category || 'custom'),
    description: String(raw.description || ''),
    controllers: raw.controllers || [],
    encounter,
    expected: raw.expected || { must: [], mustNot: [] },
    raw
  };
}

function expandBlockingEdges(blockingEdges) {
  const edges = [];
  for (const edge of blockingEdges) {
    const length = Math.max(1, Number(edge.length || 1));
    for (let offset = 0; offset < length; offset += 1) {
      const orientation = String(edge.orientation || 'v');
      edges.push({
        orientation,
        x: Number(edge.x || 0) + (orientation === 'h' ? offset : 0),
        y: Number(edge.y || 0) + (orientation === 'v' ? offset : 0),
        blocksMovement: edge.blocksMovement !== false,
        blocksLineOfSight: edge.blocksLineOfSight !== false
      });
    }
  }
  return edges;
}

function parseSimpleYaml(source) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.match(/^\s*/)?.[0].length || 0;
    const line = rawLine.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (line.startsWith('- ')) {
      if (!Array.isArray(parent)) throw new Error(`Unexpected list item at line ${index + 1}: ${line}`);
      const content = line.slice(2).trim();
      if (content.includes(':') && !isQuotedScalar(content)) {
        const item = {};
        parent.push(item);
        assignKeyValue(item, content, lines, index);
        stack.push({ indent, value: item });
      } else {
        parent.push(parseScalar(content));
      }
      continue;
    }

    const { key, valueText } = splitKeyValue(line);
    if (valueText === '|') {
      const block = [];
      const blockIndent = findNextContentIndent(lines, index + 1);
      while (index + 1 < lines.length) {
        const nextRaw = lines[index + 1];
        const nextIndent = nextRaw.match(/^\s*/)?.[0].length || 0;
        if (nextRaw.trim() && nextIndent < blockIndent) break;
        index += 1;
        block.push(nextRaw.slice(blockIndent));
      }
      parent[key] = block.join('\n').trimEnd();
      continue;
    }
    if (valueText !== '') {
      parent[key] = parseScalar(valueText);
      continue;
    }

    const child = nextContentIsList(lines, index + 1, indent) ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child });
  }
  return root;
}

function assignKeyValue(target, content, lines, index) {
  const { key, valueText } = splitKeyValue(content);
  if (valueText !== '') {
    target[key] = parseScalar(valueText);
    return;
  }
  target[key] = nextContentIsList(lines, index + 1, 0) ? [] : {};
}

function splitKeyValue(line) {
  const colon = line.indexOf(':');
  if (colon < 0) throw new Error(`Expected key/value line: ${line}`);
  return {
    key: line.slice(0, colon).trim(),
    valueText: line.slice(colon + 1).trim()
  };
}

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '[]') return [];
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((entry) => parseScalar(entry.trim()));
  }
  return value.replace(/^['"]|['"]$/g, '');
}

function isQuotedScalar(value) {
  return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
}

function findNextContentIndent(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim()) return lines[index].match(/^\s*/)?.[0].length || 0;
  }
  return 0;
}

function nextContentIsList(lines, startIndex, parentIndent) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const indent = raw.match(/^\s*/)?.[0].length || 0;
    return indent > parentIndent && raw.trim().startsWith('- ');
  }
  return false;
}
