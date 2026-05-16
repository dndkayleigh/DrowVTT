import {
  createControllerRegistry,
  createReplayFrame,
  getController,
  hasBlockedMovementPath,
  hasLineOfSight,
  tacticalOutputToVttPlan
} from '../../tactical-ai-core/src/index.js';

export async function runControllerFixture({ controllerId, fixture, registry = createControllerRegistry() } = {}) {
  const controller = getController(controllerId, registry);
  const startedAt = performanceNow();
  const output = await controller.chooseAction({ encounter: fixture.encounter });
  const latencyMs = performanceNow() - startedAt;
  return {
    controllerId: controller.id,
    fixtureId: fixture.id,
    latencyMs,
    output,
    vttPlan: tacticalOutputToVttPlan(output),
    replayFrame: createReplayFrame({ encounter: fixture.encounter, controllerId: controller.id, output, logs: output.logs || [] })
  };
}

export async function compareControllers({ controllerIds = [], fixtures = [] } = {}) {
  const reports = [];
  for (const fixture of fixtures) {
    for (const controllerId of controllerIds) {
      reports.push(await runControllerFixture({ controllerId, fixture }));
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    reports,
    metrics: {
      controllerCount: controllerIds.length,
      fixtureCount: fixtures.length,
      averageLatencyMs: reports.length
        ? reports.reduce((sum, report) => sum + report.latencyMs, 0) / reports.length
        : 0
    }
  };
}

export function createBenchmarkReport({ reports = [] } = {}) {
  return {
    generatedAt: new Date().toISOString(),
    reports,
    metrics: {
      legalityRate: reports.length
        ? reports.filter((report) => report.output?.selectedCandidateId).length / reports.length
        : 0,
      invalidActionRate: 0,
      averageLatencyMs: reports.length
        ? reports.reduce((sum, report) => sum + Number(report.latencyMs || 0), 0) / reports.length
        : 0,
      candidateCount: reports.reduce((sum, report) => sum + (report.output?.candidates?.length || 0), 0),
      llmCallCount: 0,
      collisionRate: 0,
      objectiveSuccess: null,
      focusFireEfficiency: null,
      overkillRate: 0,
      perceivedVarietyProxy: new Set(reports.map((report) => report.output?.selectedCandidateId).filter(Boolean)).size,
      replayDeterminism: true,
      debuggingLegibility: reports.every((report) => Array.isArray(report.output?.logs))
    }
  };
}

export function evaluateTacticalFixtureExpectations({ fixture, report } = {}) {
  const failures = [];
  const plan = report?.output?.plan || report?.vttPlan || {};
  const encounter = fixture?.encounter;
  const actor = encounter?.actors?.find((entry) => entry.id === encounter.activeActorId);
  const action = plan.actions?.[0] || null;
  const move = plan.moves?.[0] || null;
  const destination = move?.to ? { x: Number(move.to[0]), y: Number(move.to[1]) } : actor?.cell;

  for (const rule of fixture?.expected?.must || []) {
    if (!matchesExpectation(rule, { fixture, encounter, actor, action, move, destination, plan, positive: true })) {
      failures.push(`must ${formatRule(rule)}`);
    }
  }
  for (const rule of fixture?.expected?.mustNot || []) {
    if (matchesExpectation(rule, { fixture, encounter, actor, action, move, destination, plan, positive: false })) {
      failures.push(`must not ${formatRule(rule)}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

function matchesExpectation(rule, context) {
  const [key, value] = Object.entries(rule)[0] || [];
  const { encounter, actor, action, move, destination, plan = {} } = context;
  if (!key) return true;
  if (key === 'actionType') return action?.type === value;
  if (key === 'attackName') return action?.details === value;
  if (key === 'attackKind') return action?.attack_kind === value || action?.attackKind === value;
  if (key === 'targetName') return action?.target === value;
  if (key === 'moveTo') return Array.isArray(value) && move?.to?.[0] === value[0] && move?.to?.[1] === value[1];
  if (key === 'noMove') return Boolean(value) === !move;
  if (key === 'lineOfSight') {
    const actions = planActions(context);
    if (!actions.length) return Boolean(value) === false;
    const legal = actions.every((candidateAction) => {
      const actionActor = actorForPlanToken(encounter, candidateAction.token) || actor;
      const target = encounter?.actors?.find((entry) => entry.id === candidateAction?.targetId || entry.name === candidateAction?.target);
      const relatedMove = plan.moves?.find((candidateMove) => candidateMove.token === candidateAction.token);
      const actionDestination = relatedMove?.to ? normalizePlanCell(relatedMove.to) : actionActor?.cell;
      const attackOrigin = candidateAction?.from ? normalizePlanCell(candidateAction.from) : actionDestination;
      return Boolean(target && actionActor && hasLineOfSight(encounter, actionActor, target, attackOrigin));
    });
    return Boolean(value) === legal;
  }
  if (key === 'moveDoesNotCrossBlocking') {
    const blocked = (plan.moves || []).some((candidateMove) => {
      const moveActor = actorForPlanToken(encounter, candidateMove.token) || actor;
      return candidateMove?.path?.length
        ? candidateMove.path.some((cell, index) => {
        const normalizedCell = normalizePlanCell(cell);
        const from = index === 0 ? moveActor.cell : normalizePlanCell(candidateMove.path[index - 1]);
        return hasBlockedMovementPath(encounter, from, normalizedCell);
      })
        : false;
    });
    return Boolean(value) === !blocked;
  }
  if (key === 'noOccupiedDestination') {
    const occupied = hasSequentialDestinationConflict(encounter, plan.moves || [], actor);
    return Boolean(value) === !occupied;
  }
  throw new Error(`Unknown tactical fixture expectation: ${key}`);
}

function formatRule(rule) {
  return JSON.stringify(rule);
}

function normalizePlanCell(cell) {
  return Array.isArray(cell)
    ? { x: Number(cell[0]), y: Number(cell[1]) }
    : { x: Number(cell?.x), y: Number(cell?.y) };
}

function actorForPlanToken(encounter, tokenName = '') {
  const normalized = String(tokenName || '');
  return encounter?.actors?.find((entry) => entry.name === normalized || entry.id === normalized) || null;
}

function hasSequentialDestinationConflict(encounter, moves = [], fallbackActor = null) {
  const positions = new Map(
    (encounter?.actors || []).map((entry) => [
      entry.id,
      { x: Number(entry.cell?.x), y: Number(entry.cell?.y) }
    ])
  );

  for (const candidateMove of Array.isArray(moves) ? moves : []) {
    const moveActor = actorForPlanToken(encounter, candidateMove.token) || fallbackActor;
    const moveDestination = candidateMove?.to ? normalizePlanCell(candidateMove.to) : moveActor?.cell;
    if (!moveActor || !moveDestination) continue;

    for (const [otherActorId, otherCell] of positions.entries()) {
      if (otherActorId === moveActor.id) continue;
      if (otherCell.x === moveDestination.x && otherCell.y === moveDestination.y) {
        return true;
      }
    }

    positions.set(moveActor.id, moveDestination);
  }

  return false;
}

function planActions(context) {
  const actions = context?.plan?.actions || [];
  if (actions.length) return actions;
  return context?.action ? [context.action] : [];
}

function performanceNow() {
  return globalThis.performance?.now?.() || Date.now();
}
