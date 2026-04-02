function normalizeStatus(status) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
    ? status
    : 'failed';
}

export function createLocalUsageTrackingAdapter(options = {}) {
  const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const entries = [];

  return {
    recordTacticsInvocationStart(input = {}) {
      const entry = {
        id: createId(),
        status: 'started',
        createdAt: now(),
        userId: input.userId ?? null,
        accountId: input.accountId ?? null,
        sessionId: input.sessionId ?? null,
        strategyId: input.strategyId ?? null,
        model: input.model ?? null,
        payloadBytes: Number.isFinite(Number(input.payloadBytes)) ? Number(input.payloadBytes) : null,
        requestId: input.requestId ?? null
      };
      entries.push(entry);
      return { ...entry };
    },

    recordTacticsInvocationResult(input = {}) {
      const next = {
        id: input.id ?? createId(),
        status: normalizeStatus(input.status),
        createdAt: input.createdAt ?? now(),
        userId: input.userId ?? null,
        accountId: input.accountId ?? null,
        sessionId: input.sessionId ?? null,
        strategyId: input.strategyId ?? null,
        model: input.model ?? null,
        requestId: input.requestId ?? null,
        latencyMs: Number.isFinite(Number(input.latencyMs)) ? Number(input.latencyMs) : null,
        tokens: input.tokens ? {
          input: Number.isFinite(Number(input.tokens.input)) ? Number(input.tokens.input) : null,
          output: Number.isFinite(Number(input.tokens.output)) ? Number(input.tokens.output) : null,
          total: Number.isFinite(Number(input.tokens.total)) ? Number(input.tokens.total) : null
        } : null,
        error: input.error ? String(input.error) : null
      };

      const index = entries.findIndex((entry) => entry.id === next.id);
      if (index >= 0) entries[index] = { ...entries[index], ...next };
      else entries.push(next);
      return { ...next };
    },

    getUsageEvents() {
      return entries.map((entry) => ({
        ...entry,
        tokens: entry.tokens ? { ...entry.tokens } : null
      }));
    },

    clearUsageEvents() {
      entries.length = 0;
    }
  };
}
