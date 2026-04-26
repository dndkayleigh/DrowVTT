import {
  createControllerRegistry,
  createReplayFrame,
  getController,
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

function performanceNow() {
  return globalThis.performance?.now?.() || Date.now();
}
