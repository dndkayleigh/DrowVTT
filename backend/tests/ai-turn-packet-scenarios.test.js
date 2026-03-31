import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiTurnPacketCompactFromState, buildAiTurnPacketFromState, buildAiTurnPacketVerboseConstrainedFromState } from '../../data/ai-turn-packet-utils.mjs';
import { AI_PACKET_SCENARIOS } from './ai-turn-packet-scenarios.fixture.mjs';

function packetMetrics(packet, scenario) {
  return {
    scenario: scenario.id,
    tokens: scenario.state.tokens.length,
    currentTurn: scenario.state.tokens.find((token) => token.id === scenario.state.currentTurnTokenId)?.name || 'unknown',
    bytes: Buffer.byteLength(packet, 'utf8'),
    lines: packet.split('\n').length
  };
}

test('AI packet scenario suite covers varied SRD-backed board states', () => {
  assert.equal(AI_PACKET_SCENARIOS.length, 6);
  const ids = AI_PACKET_SCENARIOS.map((scenario) => scenario.id);
  assert.deepEqual(ids, [
    'duel-goblin-vs-acolyte',
    'ranged-bandit-crossfire',
    'crowded-ogre-frontline',
    'air-elemental-flank',
    'boss-dragon-vs-party',
    'aboleth-control-web'
  ]);
});

test('AI packet scenario benchmark compares baseline and compact packet sizes', () => {
  const metrics = AI_PACKET_SCENARIOS.map((scenario) => {
    const fullPacket = buildAiTurnPacketFromState(scenario.state);
    const compactPacket = buildAiTurnPacketCompactFromState(scenario.state);
    assert.match(fullPacket, /SYSTEM: You are the tactical controller/);
    assert.match(compactPacket, /TACTICAL CONTROLLER:/);
    assert.match(fullPacket, /OUTPUT CONTRACT:/);
    assert.match(compactPacket, /OUTPUT CONTRACT:/);

    const full = packetMetrics(fullPacket, scenario);
    const compact = packetMetrics(compactPacket, scenario);
    const savedBytes = full.bytes - compact.bytes;
    return {
      scenario: scenario.id,
      tokens: scenario.state.tokens.length,
      currentTurn: full.currentTurn,
      fullBytes: full.bytes,
      compactBytes: compact.bytes,
      savedBytes,
      savedPct: Number(((savedBytes / full.bytes) * 100).toFixed(1))
    };
  }).sort((left, right) => right.fullBytes - left.fullBytes);

  const byId = new Map(metrics.map((entry) => [entry.scenario, entry]));

  assert.ok(byId.get('boss-dragon-vs-party').fullBytes > byId.get('duel-goblin-vs-acolyte').fullBytes);
  assert.ok(byId.get('aboleth-control-web').fullBytes > byId.get('ranged-bandit-crossfire').fullBytes);
  assert.ok(byId.get('crowded-ogre-frontline').fullBytes > byId.get('duel-goblin-vs-acolyte').fullBytes);

  for (const entry of metrics) {
    assert.ok(entry.compactBytes < entry.fullBytes, `${entry.scenario} should shrink in compact mode`);
    assert.ok(entry.savedPct >= 17, `${entry.scenario} should save at least 17%`);
  }

  assert.ok(byId.get('ranged-bandit-crossfire').savedPct >= 20);
  assert.ok(byId.get('boss-dragon-vs-party').savedPct >= 20);
  assert.ok(byId.get('aboleth-control-web').savedPct >= 17);

  console.table(metrics);
});

test('verbose constrained packet keeps the full prompt style while adding explicit legal move and attack windows', () => {
  for (const scenario of AI_PACKET_SCENARIOS) {
    const packet = buildAiTurnPacketVerboseConstrainedFromState(scenario.state, {
      moveCandidateLimit: 5,
      attackOpportunityLimit: 6
    });

    assert.match(packet, /SYSTEM: You are the tactical controller/);
    assert.match(packet, /LEGAL MOVE CANDIDATES FOR CURRENT TURN TOKEN:/);
    assert.match(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:/);
    assert.match(packet, /STATBLOCK \(current turn token\):/);

    const fullBytes = Buffer.byteLength(buildAiTurnPacketFromState(scenario.state), 'utf8');
    const hybridBytes = Buffer.byteLength(packet, 'utf8');
    assert.ok(hybridBytes >= fullBytes, `${scenario.id} hybrid packet should be at least as large as full`);
  }
});

test('compact summary packet still includes legal attack windows for ranged-bandit-crossfire', () => {
  const scenario = AI_PACKET_SCENARIOS.find((entry) => entry.id === 'ranged-bandit-crossfire');
  assert.ok(scenario, 'expected ranged-bandit-crossfire fixture');

  const packet = buildAiTurnPacketCompactFromState(scenario.state, { statblockMode: 'summary' });

  assert.match(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:/);
  assert.doesNotMatch(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:\n- none from listed move candidates/);
  assert.match(packet, /attack="Scimitar" kind=melee target="Knight"/);
  assert.match(packet, /attack="Light Crossbow" kind=ranged target="Acolyte"/);
  assert.match(packet, /Actions: Scimitar\(melee, 5ft\); Light Crossbow\(ranged, 80ft\)/);
});

test('compact moves5+attacks6+summary packet still includes legal goblin melee attacks in the duel scenario', () => {
  const scenario = AI_PACKET_SCENARIOS.find((entry) => entry.id === 'duel-goblin-vs-acolyte');
  assert.ok(scenario, 'expected duel-goblin-vs-acolyte fixture');

  const packet = buildAiTurnPacketCompactFromState(scenario.state, {
    moveCandidateLimit: 5,
    attackOpportunityLimit: 6,
    statblockMode: 'summary'
  });

  assert.match(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:/);
  assert.doesNotMatch(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:\n- none from listed move candidates/);
  assert.match(packet, /attack="Scimitar" kind=melee target="Acolyte"/);
});

test('compact moves5 packet still includes legal slam attacks for air-elemental-flank', () => {
  const scenario = AI_PACKET_SCENARIOS.find((entry) => entry.id === 'air-elemental-flank');
  assert.ok(scenario, 'expected air-elemental-flank fixture');

  const packet = buildAiTurnPacketCompactFromState(scenario.state, { moveCandidateLimit: 5 });

  assert.match(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:/);
  assert.doesNotMatch(packet, /LEGAL ATTACK WINDOWS FOR CURRENT TURN TOKEN:\n- none from listed move candidates/);
  assert.match(packet, /attack="Slam" kind=melee target="Bandit"/);
  assert.match(packet, /attack="Slam" kind=melee target="Knight"/);
});
