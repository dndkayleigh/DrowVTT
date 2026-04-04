function validIdSet(tokens = []) {
  return new Set((Array.isArray(tokens) ? tokens : []).map((token) => String(token.id)));
}

export function getValidTokenIds(tokens = [], ids = []) {
  const validIds = validIdSet(tokens);
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter((id) => validIds.has(id)))];
}

export function getSelectedMonsterIds(tokens = [], selectedTokenIds = []) {
  const allowed = new Set(getValidTokenIds(tokens, selectedTokenIds));
  return (Array.isArray(tokens) ? tokens : [])
    .filter((token) => token.type === 'Monster' && allowed.has(String(token.id)))
    .map((token) => String(token.id));
}

export function getAiGroupTokenIds(tokens = [], aiGroupTokenIds = []) {
  return getSelectedMonsterIds(tokens, aiGroupTokenIds);
}

export function setSelectedTokenIds(tokens = [], ids = []) {
  const selectedTokenIds = getValidTokenIds(tokens, ids);
  return {
    selectedTokenIds,
    selectedTokenId: selectedTokenIds[0] || null
  };
}

export function setSingleSelection(tokens = [], id = null) {
  const nextId = id == null ? [] : [id];
  return setSelectedTokenIds(tokens, nextId);
}

export function toggleTokenSelection(tokens = [], selectedTokenIds = [], id = null) {
  const validIds = validIdSet(tokens);
  const targetId = String(id || '');
  if (!validIds.has(targetId)) {
    return setSelectedTokenIds(tokens, selectedTokenIds);
  }
  const next = new Set(getValidTokenIds(tokens, selectedTokenIds));
  if (next.has(targetId)) next.delete(targetId);
  else next.add(targetId);
  return setSelectedTokenIds(tokens, [...next]);
}

export function enforceAiSelectionForStrategy(tokens = [], {
  strategyId = 'single_tactical',
  currentTurnTokenId = null,
  selectedTokenIds = []
} = {}) {
  if (strategyId === 'group_tactical') {
    return setSelectedTokenIds(tokens, selectedTokenIds);
  }
  const currentId = currentTurnTokenId && validIdSet(tokens).has(String(currentTurnTokenId))
    ? String(currentTurnTokenId)
    : getValidTokenIds(tokens, selectedTokenIds)[0] || null;
  return currentId ? setSingleSelection(tokens, currentId) : setSelectedTokenIds(tokens, []);
}
