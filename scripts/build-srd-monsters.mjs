import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'data', 'srd-monsters.js');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function titleCaseWords(value) {
  return String(value ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function armorClassValue(monster) {
  if (typeof monster?.armor_class === 'number') return monster.armor_class;
  if (Array.isArray(monster?.armor_class) && monster.armor_class.length) {
    return Number(monster.armor_class[0]?.value) || 10;
  }
  return 10;
}

function speedFeet(monster) {
  const speed = monster?.speed ?? {};
  const ordered = ['walk', 'burrow', 'climb', 'fly', 'swim'];
  for (const key of ordered) {
    const match = String(speed[key] ?? '').match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  for (const value of Object.values(speed)) {
    const match = String(value ?? '').match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return 30;
}

function speedLabel(monster) {
  const entries = Object.entries(monster?.speed ?? {})
    .map(([kind, value]) => {
      const label = kind === 'walk' ? '' : `${titleCaseWords(kind)} `;
      return `${label}${String(value).trim()}`;
    })
    .filter(Boolean);
  return entries.length ? entries.join(', ') : `${speedFeet(monster)} ft.`;
}

function abilityLine(monster) {
  return `- STR ${monster.strength} DEX ${monster.dexterity} CON ${monster.constitution} INT ${monster.intelligence} WIS ${monster.wisdom} CHA ${monster.charisma}`;
}

function proficienciesLine(monster, prefix, needle) {
  const parts = asArray(monster?.proficiencies)
    .filter((entry) => String(entry?.proficiency?.index ?? '').startsWith(needle))
    .map((entry) => {
      const rawName = String(entry?.proficiency?.name ?? '');
      const cleaned = rawName.replace(/^Saving Throw:\s*/i, '').replace(/^Skill:\s*/i, '');
      const signed = entry?.value > 0 ? `+${entry.value}` : `${entry.value}`;
      return `${cleaned} ${signed}`;
    });
  return parts.length ? `- ${prefix}: ${parts.join(', ')}` : null;
}

function listLine(label, values) {
  const parts = asArray(values).filter(Boolean);
  return parts.length ? `- ${label}: ${parts.join(', ')}` : null;
}

function sensesLine(monster) {
  const senses = monster?.senses ?? {};
  const parts = Object.entries(senses).map(([key, value]) => {
    if (key === 'passive_perception') return `passive perception ${value}`;
    return `${titleCaseWords(key)} ${value}`;
  });
  return parts.length ? `- Senses: ${parts.join(', ')}` : null;
}

function sectionLines(title, entries) {
  const parts = asArray(entries)
    .map((entry) => {
      const name = String(entry?.name ?? '').trim();
      const desc = String(entry?.desc ?? '').replace(/\s+/g, ' ').trim();
      if (!name && !desc) return null;
      if (!name) return `  - ${desc}`;
      if (!desc) return `  - ${name}`;
      return `  - ${name}: ${desc}`;
    })
    .filter(Boolean);
  return parts.length ? [`- ${title}:`, ...parts] : [];
}

function subtypeLabel(monster) {
  return monster?.subtype ? `${monster.type} (${monster.subtype})` : monster.type;
}

function buildStatblock(monster) {
  const lines = [
    `${monster.name} (SRD 5.1)`,
    `- Size ${monster.size}, ${subtypeLabel(monster)}, alignment ${monster.alignment}`,
    `- AC ${armorClassValue(monster)}, HP ${monster.hit_points} (${monster.hit_dice || monster.hit_points_roll || 'n/a'}), Speed ${speedLabel(monster)}`,
    abilityLine(monster),
    proficienciesLine(monster, 'Saving Throws', 'saving-throw-'),
    proficienciesLine(monster, 'Skills', 'skill-'),
    listLine('Damage Vulnerabilities', monster.damage_vulnerabilities),
    listLine('Damage Resistances', monster.damage_resistances),
    listLine('Damage Immunities', monster.damage_immunities),
    listLine('Condition Immunities', asArray(monster.condition_immunities).map((entry) => entry?.name).filter(Boolean)),
    sensesLine(monster),
    monster.languages ? `- Languages: ${monster.languages}` : null,
    `- CR ${monster.challenge_rating}`
  ].filter(Boolean);

  lines.push(...sectionLines('Traits', monster.special_abilities));
  lines.push(...sectionLines('Actions', monster.actions));
  lines.push(...sectionLines('Bonus Actions', monster.bonus_actions));
  lines.push(...sectionLines('Reactions', monster.reactions));
  lines.push(...sectionLines('Legendary Actions', monster.legendary_actions));

  return lines.join('\n');
}

function toMonsterRecord(monster) {
  return {
    name: monster.name,
    size: monster.size,
    ac: armorClassValue(monster),
    hp: monster.hit_points,
    speed: speedFeet(monster),
    cr: monster.challenge_rating,
    statblock: buildStatblock(monster)
  };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, attempt = 0) {
  const response = await fetch(url);
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 300 * (attempt + 1);
    await wait(delay);
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`Request failed ${response.status} for ${url}`);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const list = await fetchJson('https://www.dnd5eapi.co/api/2014/monsters');
  let completed = 0;
  const details = await mapWithConcurrency(list.results, 1, async (monster) => {
    const detail = await fetchJson(`https://www.dnd5eapi.co${monster.url}`);
    completed += 1;
    if (completed % 25 === 0 || completed === list.results.length) {
      console.log(`Fetched ${completed}/${list.results.length}`);
    }
    await wait(40);
    return detail;
  });

  const records = details
    .map(toMonsterRecord)
    .sort((left, right) => left.name.localeCompare(right.name));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const payload = `window.SRD_MONSTERS = ${JSON.stringify(records, null, 2)};\n`;
  await fs.writeFile(outputPath, payload, 'utf8');
  console.log(`Wrote ${records.length} monsters to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
