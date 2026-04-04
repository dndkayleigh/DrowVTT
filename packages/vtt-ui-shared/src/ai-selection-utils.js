function validIdSet(tokens = []) {
  return new Set((Array.isArray(tokens) ? tokens : []).map((token) => String(token.id)));
}

export function isAiControllableToken(token = {}, aiControls = 'Monsters') {
  const mode = String(aiControls || 'Monsters');
  if (mode === 'None') return false;
  if (mode === 'Both') return true;
  if (mode === 'PCs') return token.type === 'PC' || token.type === 'NPC';
  return token.type === 'Monster';
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

export function getSelectedAiControlledIds(tokens = [], selectedTokenIds = [], aiControls = 'Monsters') {
  const allowed = new Set(getValidTokenIds(tokens, selectedTokenIds));
  return (Array.isArray(tokens) ? tokens : [])
    .filter((token) => allowed.has(String(token.id)) && isAiControllableToken(token, aiControls))
    .map((token) => String(token.id));
}

export function getAiControllableTokenIds(tokens = [], aiControls = 'Monsters') {
  return (Array.isArray(tokens) ? tokens : [])
    .filter((token) => isAiControllableToken(token, aiControls))
    .map((token) => String(token.id));
}

export function getAiGroupTokenIds(tokens = [], aiGroupTokenIds = [], aiControls = 'Monsters') {
  return getSelectedAiControlledIds(tokens, aiGroupTokenIds, aiControls);
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

export function toggleAiControlledSelection(tokens = [], selectedTokenIds = [], id = null, aiControls = 'Monsters') {
  const targetId = String(id || '');
  const target = (Array.isArray(tokens) ? tokens : []).find((token) => String(token.id) === targetId) || null;
  if (!target || !isAiControllableToken(target, aiControls)) {
    return setSelectedTokenIds(tokens, selectedTokenIds);
  }

  const validSelectedIds = getValidTokenIds(tokens, selectedTokenIds);
  const controlledSelectedIds = getSelectedAiControlledIds(tokens, validSelectedIds, aiControls);
  if (controlledSelectedIds.length !== validSelectedIds.length) {
    return setSingleSelection(tokens, targetId);
  }

  return toggleTokenSelection(tokens, validSelectedIds, targetId);
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

export function resolveAiCurrentTurnTokenId(tokens = [], {
  aiControls = 'Monsters',
  currentTurnTokenId = null,
  preferredTokenIds = []
} = {}) {
  const controlledIds = getAiControllableTokenIds(tokens, aiControls);
  if (!controlledIds.length) return null;
  const preferredId = getValidTokenIds(tokens, preferredTokenIds).find((id) => controlledIds.includes(id));
  if (preferredId) return preferredId;
  const currentId = currentTurnTokenId == null ? null : String(currentTurnTokenId);
  if (currentId && controlledIds.includes(currentId)) return currentId;
  return controlledIds[0] || null;
}

export function resolveAiStrategyIdForSelection(strategyId = 'single_tactical', selectedAiControlledIds = []) {
  return Array.isArray(selectedAiControlledIds) && selectedAiControlledIds.length > 1
    ? 'group_tactical'
    : String(strategyId || 'single_tactical');
}

export function isAiTurnActorAllowed({
  strategyId = 'single_tactical',
  tokenId = null,
  currentTurnTokenId = null,
  aiGroupTokenIds = []
} = {}) {
  const actorId = tokenId == null ? null : String(tokenId);
  if (!actorId) return false;
  if (String(strategyId || 'single_tactical') === 'group_tactical') {
    return new Set((Array.isArray(aiGroupTokenIds) ? aiGroupTokenIds : []).map((id) => String(id))).has(actorId)
      || (currentTurnTokenId != null && String(currentTurnTokenId) === actorId);
  }
  return currentTurnTokenId != null && String(currentTurnTokenId) === actorId;
}
