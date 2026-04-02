import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAuthAdapter } from '../../data/local-auth-adapter.mjs';

test('local auth adapter returns a stable authenticated user context', () => {
  const adapter = createLocalAuthAdapter({
    userId: 'user-1',
    accountId: 'account-1',
    displayName: 'Kayleigh',
    accountRole: 'owner',
    sessionRole: 'dm'
  });

  const context = adapter.getCurrentUserContext();
  assert.equal(context.userId, 'user-1');
  assert.equal(context.accountId, 'account-1');
  assert.equal(context.displayName, 'Kayleigh');
  assert.equal(context.isAuthenticated, true);
  assert.equal(context.sessionRole, 'dm');
});

test('local auth adapter requires authentication when configured unauthenticated', () => {
  const adapter = createLocalAuthAdapter({
    isAuthenticated: false
  });

  assert.throws(() => {
    adapter.requireAuthenticatedUser();
  }, /Authentication required/);
  assert.equal(adapter.canPerform('run_ai'), false);
});

test('local auth adapter reports session access defaults for authenticated and unauthenticated users', () => {
  const authenticated = createLocalAuthAdapter({
    accountRole: 'owner',
    sessionRole: 'dm'
  });
  const unauthenticated = createLocalAuthAdapter({
    isAuthenticated: false,
    accountRole: 'viewer',
    sessionRole: 'viewer'
  });

  assert.deepEqual(authenticated.getSessionAccess('session-1'), {
    isAuthenticated: true,
    accountRole: 'owner',
    sessionRole: 'dm',
    canEditBoard: true,
    canRunAi: true
  });

  assert.deepEqual(unauthenticated.getSessionAccess('session-1'), {
    isAuthenticated: false,
    accountRole: 'viewer',
    sessionRole: 'viewer',
    canEditBoard: false,
    canRunAi: false
  });
  assert.equal(unauthenticated.canPerform('edit_board'), false);
});
