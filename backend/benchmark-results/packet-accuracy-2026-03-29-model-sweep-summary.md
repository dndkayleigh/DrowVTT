# GPT-5 Accuracy Model Sweep Summary

This focused accuracy sweep compared `compact_moves5` across GPT-5-family models while using:

- `gpt-5 + full` as the reference ground-truth turn for each scenario
- `gpt-5` as the reasoning judge
- rule legality plus tactical heuristics plus reference-judge agreement

Benchmark shape:

| Candidate models | Candidate variant | Ground truth | Judge | Runs |
|---|---|---|---|---:|
| `gpt-5`, `gpt-5-mini`, `gpt-5.4-mini` | `compact_moves5` | `gpt-5 + full` | `gpt-5` | 3 |

## Key Result

All completed candidate runs stayed **100% legal** and **100% tactically sound by the simple heuristic** on the completed scenarios. The differentiator was the reasoning judge:

- `gpt-5 + compact_moves5` stayed closest to the `gpt-5 + full` reference
- `gpt-5-mini + compact_moves5` was usually legal but much less often judged tactically acceptable against the reference
- `gpt-5.4-mini + compact_moves5` was interrupted by quota before finishing, but its early results already showed mixed judge agreement

## Completed Models

### `gpt-5 + compact_moves5`

- Completed all 6 scenarios
- `legal_turn_rate = 1.0` in every scenario
- `tactical_sound_rate = 1.0` in every scenario
- Judge accepted:
  - duel `1.0`
  - crowded ogre `1.0`
  - air elemental `0.6667`
  - ranged bandit `0.0`
  - boss dragon `0.0`
  - aboleth `0.3333`

Interpretation:

`gpt-5 + compact_moves5` preserved legality well and remained the closest compact configuration to the `gpt-5 + full` reference, but it still diverged meaningfully on ranged, boss, and control-heavy scenarios.

### `gpt-5-mini + compact_moves5`

- Completed all 6 scenarios
- `legal_turn_rate = 1.0` in every scenario
- `tactical_sound_rate = 1.0` in every scenario
- Judge accepted:
  - duel `1.0`
  - every other completed scenario `0.0`

Interpretation:

`gpt-5-mini + compact_moves5` looked legally clean but much less aligned with the strongest-reference tactical plan. It appears usable for speed, but not yet trustworthy as a tactical replacement for `gpt-5 + full`.

## `gpt-5.4-mini + compact_moves5`

- completed all 6 scenarios on rerun
- `legal_turn_rate = 1.0` in every completed scenario
- `tactical_sound_rate = 1.0` in every completed scenario
- judge accepted:
  - duel `0.3333`
  - ranged `0.0`
  - crowded ogre `0.0`
  - air elemental `0.0`
  - boss dragon `0.0`
  - aboleth `0.0`

Interpretation:

`gpt-5.4-mini + compact_moves5` is excellent on latency, but on this benchmark it aligns poorly with the `gpt-5 + full` reference strategy. It looks much more like a speed-first option than a tactical drop-in replacement.

## Tactical Heuristic Update

The accuracy harness now adds a tactical warning when:

- the acting creature ends its turn with at least one legal melee attack available
- but chooses `Dodge` instead of attacking

This does **not** automatically mark the turn illegal. It marks it as tactically suspicious and surfaces it separately from pure rules legality.

## Practical Recommendation

For now:

1. Keep `gpt-5 + compact_moves5` as the strongest compact candidate if tactical fidelity matters.
2. Treat `gpt-5-mini` as a speed-first option, not a reference-quality tactical substitute.
3. Treat `gpt-5.4-mini + compact_moves5` as a latency-optimized mode, not the tactical default.

## Artifacts

- `backend/benchmark-results/packet-accuracy-2026-03-29-model-sweep-report.json`
- `backend/benchmark-results/packet-accuracy-2026-03-29-gpt-5-runs3.json`
- `backend/benchmark-results/packet-accuracy-2026-03-29-gpt-5-mini-runs3.json`
- `backend/benchmark-results/packet-accuracy-2026-03-29-gpt-5-4-mini-runs3.json`
