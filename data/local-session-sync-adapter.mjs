const ALLOWED_BOARD_EVENT_TYPES = new Set([
  'token.created',
  'token.moved',
  'turn.changed',
  'calibration.updated',
  'board.cleared'
]);

function normalizePayload(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? JSON.parse(JSON.stringify(payload))
    : {};
}

export function createLocalSessionSyncAdapter(options = {}) {
  const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();

  let connection = null;
  let sequence = 0;
  const events = [];
  const boardSubscribers = new Set();
  const presenceSubscribers = new Set();

  function ensureConnected() {
    if (!connection?.sessionId) throw new Error('Session sync adapter is not connected.');
  }

  function validateEvent(event = {}) {
    if (!ALLOWED_BOARD_EVENT_TYPES.has(event.type)) {
      throw new Error(`Unsupported board event type: ${event?.type ?? '<missing>'}`);
    }
    return {
      id: event.id ?? createId(),
      sessionId: event.sessionId ?? connection?.sessionId ?? null,
      type: event.type,
      payload: normalizePayload(event.payload),
      createdAt: event.createdAt ?? now(),
      sequence: event.sequence ?? ++sequence
    };
  }

  return {
    connect(sessionId, userContext = {}) {
      connection = {
        sessionId: String(sessionId ?? '').trim() || 'local-session',
        userContext: { ...userContext }
      };
      return { ...connection };
    },

    disconnect() {
      connection = null;
    },

    publishBoardEvent(event) {
      ensureConnected();
      const normalized = validateEvent(event);
      events.push(normalized);
      for (const handler of boardSubscribers) handler({ ...normalized, payload: normalizePayload(normalized.payload) });
      return { ...normalized, payload: normalizePayload(normalized.payload) };
    },

    subscribeToBoardEvents(handler) {
      boardSubscribers.add(handler);
      return () => boardSubscribers.delete(handler);
    },

    subscribeToPresence(handler) {
      presenceSubscribers.add(handler);
      return () => presenceSubscribers.delete(handler);
    },

    requestAuthoritativeSnapshot() {
      ensureConnected();
      return {
        sessionId: connection.sessionId,
        requestedAt: now()
      };
    },

    getPublishedEvents() {
      return events.map((event) => ({
        ...event,
        payload: normalizePayload(event.payload)
      }));
    },

    getConnection() {
      return connection ? { ...connection, userContext: { ...connection.userContext } } : null;
    }
  };
}

export { ALLOWED_BOARD_EVENT_TYPES };
