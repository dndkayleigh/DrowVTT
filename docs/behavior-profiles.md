# Behavior Profiles

Behavior profiles exist so creatures can feel tactically appropriate without forcing every actor into the same “smart squad” mold. Tactical role still answers "what battlefield job is this actor suited for?" while behavior profile answers "how does this actor think, prioritize, and coordinate while doing that job?"

## Role vs. Behavior

- `tactical.coreRole` is the combat role input: `skirmisher`, `disciplined_blocker`, `ambusher_bruiser`, `support_caster`, etc.
- `behavior` is the decision-style input:
  - `cognition`
  - `drive`
  - `riskTolerance`
  - `coordination`
  - `planningHorizon`
  - `targetStickiness`

Current supported tiers:
- `mindless / none`: low-cognition pressure, nearest-prey bias, no squad doctrine
- `animal / pack`: local pack convergence, isolated/wounded prey bias, movement-risk sensitivity
- `trained / squad` default: current baseline for fixtures without explicit behavior
- advanced Stony Shore-style tactical behavior: role-heavy coordinated behavior under the trained/squad default

## Current Benchmarks

- `bandit-doorway-ambush-2026-04-26.yaml`
  - Baseline smoke fixture for ranged doorway defense and legal lane usage
  - Should not regress on blocking, occupancy, or obvious ranged-vs-melee mistakes
- `sanctuary-of-the-magi-2026-05-03.yaml`
  - Pressure test for protected caster structure, blockers, ambushers, and mixed-role defense
  - Should not regress on Mage protection, role preservation, or ritual-defense shape
- `shrine-of-the-broken-columns-2026-04-26.yaml`
  - Regression fixture for cover lanes, blockers, scouts, acolyte protection, and deterministic controller comparisons
  - Should not regress on blocked paths, illegal shots, scout ranged preference, or acolyte overexposure
- `shrine-of-the-mosswater-bandit-encounter-2026-04-28.yaml`
  - Regression fixture for ranged skirmish pressure, shoot-and-scoot intent, and room-defense positioning
  - Should not regress on occupied destinations, blocking edges, or ranged harassment behavior
- `the-sinkhole-watch-2026-04-29.yaml`
  - Regression fixture for ruin defense, goblin skirmishing, hobgoblin screening, bugbear reserve ambush, and caster protection
  - Should not regress on sinkhole-aware routing, ambush posture, or support protection
- `the-stony-shore-ambush-2026-05-09.yaml`
  - Advanced tactical pressure test for large-token movement, edge blocking, role preservation, reservations, and coordinated group behavior
  - Should not regress on board dimensions, line-of-fire blocking, role mapping, or group-controller behavior
- `wolf-pack-harrier-2026-05-10.yaml`
  - Animal/pack benchmark for melee skirmisher harassment and local prey selection
  - Should not regress into squad doctrine or misleading ranged-skirmisher diagnostics
- `zombie-doorway-press-2026-05-10.yaml`
  - Mindless benchmark for nearest-prey pressure, congestion tolerance, and non-doctrinal pile-on
  - Should not regress into disengage/retreat, shoot-and-scoot, or squad focus-fire behavior

## What Should Not Regress

- Fixtures must continue to parse through `parseVisibleEncounterFixture()`
- Behavior profiles must normalize consistently through fixture and VTT paths
- Default fixtures without explicit `behavior` must remain `trained / squad`
- Stony Shore must remain the advanced tactical benchmark
- Zombie Doorway and Wolf Pack must remain the canonical low-cognition and animal/pack behavior fixtures

## Compatibility Note

- `supervisor_scripted_single` and `supervisor_scripted_group` are legacy controller IDs retained as aliases for older fixtures and saved boards.
- New fixtures and UI should use `supervised_utility_single` and `supervised_utility_group`.

## Running Tests

Core tactical regression file:

```bash
timeout 120s node --test backend/tests/tactical-ai-core.test.js
```

Useful focused slices:

```bash
timeout 120s node --test --test-name-pattern='Zombie Doorway|Wolf Pack Harrier|Stony Shore' backend/tests/tactical-ai-core.test.js
```

```bash
timeout 120s node --test --test-name-pattern='visible YAML encounter fixtures assert tactical behavior|Ossuary Gate Rite|Sinkhole Watch' backend/tests/tactical-ai-core.test.js
```

If fixture export/import behavior is involved, use the Playwright VTT tests rather than `node --test` on `vtt-ui.spec.js`.
