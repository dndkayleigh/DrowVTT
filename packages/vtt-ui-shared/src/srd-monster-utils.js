export function normalizeMonsterName(name) {
  return (name ?? '').toString().trim().toLowerCase();
}

export function sizeCellsFromSrdSize(size) {
  switch (normalizeMonsterName(size)) {
    case 'large':
      return 2;
    case 'huge':
      return 3;
    case 'gargantuan':
      return 4;
    default:
      return 1;
  }
}

export function challengeLabelForMonster(monster = {}) {
  if (monster?.cr != null) return String(monster.cr);
  const match = String(monster?.statblock || '').match(/- CR ([^\n]+)/);
  return match ? match[1] : '?';
}

export function createSrdMonstersByName(monsters = []) {
  return new Map(
    monsters.map((monster) => [normalizeMonsterName(monster?.name), monster]).filter(([name]) => name)
  );
}

export function resolveSrdMonsterTemplate(name, monstersByName = new Map()) {
  return monstersByName.get(normalizeMonsterName(name)) || null;
}

export function levenshteinDistance(a, b) {
  const left = normalizeMonsterName(a);
  const right = normalizeMonsterName(b);
  const dp = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = dp[0];
    dp[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = dp[j];
      if (left[i - 1] === right[j - 1]) dp[j] = previous;
      else dp[j] = Math.min(previous, dp[j - 1], dp[j]) + 1;
      previous = next;
    }
  }
  return dp[right.length];
}

export function monsterSearchScore(query, monsterName) {
  const normalizedQuery = normalizeMonsterName(query);
  const normalizedName = normalizeMonsterName(monsterName);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return -1000;
  if (normalizedName.startsWith(normalizedQuery)) return -500 + (normalizedName.length - normalizedQuery.length);
  const wordMatch = normalizedName.split(/\s+/).some((part) => part.startsWith(normalizedQuery));
  if (wordMatch) return -250 + (normalizedName.length - normalizedQuery.length);
  const includesAt = normalizedName.indexOf(normalizedQuery);
  if (includesAt >= 0) return -100 + includesAt;
  return levenshteinDistance(normalizedQuery, normalizedName);
}

export function topMonsterMatches(monsters = [], query = '', limit = 4) {
  const normalizedQuery = normalizeMonsterName(query);
  if (!normalizedQuery) return [];
  return monsters
    .map((monster) => ({ monster, score: monsterSearchScore(normalizedQuery, monster?.name) }))
    .sort((left, right) => left.score - right.score || String(left.monster?.name || '').localeCompare(String(right.monster?.name || '')))
    .slice(0, limit)
    .map(({ monster }) => monster);
}
