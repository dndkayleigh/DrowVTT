export function createLocalAuthAdapter(options = {}) {
  const userContext = {
    userId: options.userId ?? 'local-user',
    accountId: options.accountId ?? 'local-account',
    displayName: options.displayName ?? 'Local User',
    isAuthenticated: options.isAuthenticated ?? true,
    accountRole: options.accountRole ?? 'owner',
    sessionRole: options.sessionRole ?? 'owner'
  };

  function getCurrentUserContext() {
    return { ...userContext };
  }

  function requireAuthenticatedUser() {
    if (!userContext.isAuthenticated) throw new Error('Authentication required.');
    return getCurrentUserContext();
  }

  function getSessionAccess(_sessionId = null) {
    return {
      isAuthenticated: !!userContext.isAuthenticated,
      accountRole: userContext.accountRole,
      sessionRole: userContext.sessionRole,
      canEditBoard: !!userContext.isAuthenticated,
      canRunAi: !!userContext.isAuthenticated
    };
  }

  function canPerform(action, _resourceContext = {}) {
    if (!userContext.isAuthenticated) return false;
    if (action === 'run_ai') return true;
    if (action === 'edit_board') return true;
    return true;
  }

  return {
    getCurrentUserContext,
    requireAuthenticatedUser,
    getSessionAccess,
    canPerform
  };
}
