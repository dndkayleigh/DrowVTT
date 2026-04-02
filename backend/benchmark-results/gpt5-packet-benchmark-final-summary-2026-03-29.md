# GPT-5 Packet Benchmark Final Summary

Date: March 29, 2026

This file consolidates the current packet benchmark state across:

- baseline GPT-5 packet latency testing
- the non-compact `full_moves5_attacks6` hybrid experiment
- GPT-5 model variation latency testing
- legality and tactical-accuracy testing against a `gpt-5 + full` ground-truth reference

## Final Recommendations

### Best latency-only candidate

- `gpt-5.4-mini + compact_moves5`

Why:

- fastest overall result from the model sweep
- mean latency about `1.55s`
- about `27.09%` faster than `gpt-5.4-mini + full`
- won `5/6` scenarios in the latency sweep

### Best compact option when tactical fidelity matters

- `gpt-5 + compact_moves5`

Why:

- remained legal in every completed accuracy run
- remained tactically sound under the heuristic checks
- matched the `gpt-5 + full` reference better than the smaller models

### Best current production compromise

- default candidate: `gpt-5 + compact_moves5`
- speed candidate: `gpt-5.4-mini + compact_moves5`

Interpretation:

If the priority is safest tactical behavior, stay with `gpt-5 + compact_moves5`.
If the priority is responsiveness, `gpt-5.4-mini + compact_moves5` is the strongest latency candidate, but it behaves more like a speed mode than a tactical replacement for `gpt-5 + full`.

## Baseline Packet Latency Result

Original 8-variant GPT-5 latency benchmark:

- best mean latency: `compact_moves5_attacks6`
- best default recommendation: `compact_moves5`
- reason: nearly tied for fastest while more stable

Core result:

| Variant | Mean TAT |
|---|---:|
| `compact_moves5_attacks6` | `40.35s` |
| `compact_moves5` | `40.55s` |
| `full` | `47.64s` |
| `compact_summary` | `48.51s` |

## Hybrid Result: `full_moves5_attacks6`

Question tested:

Would adding `moves5` and `attacks6` to the full verbose prompt preserve tactical context while improving latency?

Answer:

- no
- `full_moves5_attacks6` won `0/6` scenarios
- it was slower than plain `full` overall

Overall hybrid result:

| Variant | Mean TAT | Relative to `full` |
|---|---:|---:|
| `compact_moves5_attacks6` | `42.12s` | `12.24%` faster |
| `full` | `48.00s` | baseline |
| `full_moves5_attacks6` | `59.16s` | `23.26%` slower |

Conclusion:

`full_moves5_attacks6` should not be used as a latency strategy.

## GPT-5 Model Sweep Result

Focused latency sweep:

- models: `gpt-5`, `gpt-5-mini`, `gpt-5.4-mini`
- variants: `full`, `compact_moves5`, `compact_moves5_attacks6`

Overall best variant per model:

| Model | Best Variant | Mean TAT |
|---|---|---:|
| `gpt-5` | `compact_moves5` | `37.80s` |
| `gpt-5-mini` | `compact_moves5` | `23.70s` |
| `gpt-5.4-mini` | `compact_moves5` | `1.55s` |

Interpretation:

- `gpt-5-mini` is much faster than `gpt-5`, but tactical alignment is weaker
- `gpt-5.4-mini` is the clear latency leader
- `compact_moves5` remains the strongest default packet across models

## Accuracy Method

The upgraded accuracy harness now checks:

1. schema validity
2. move legality
3. action legality
4. tactical warning:
   - flags `Dodge` when a legal melee attack is available at the final position
5. reasoning-based comparison:
   - uses `gpt-5 + full` as ground-truth reference
   - uses `gpt-5` as the tactical judge

This means a turn can now be:

- legal but tactically suspicious
- legal and tactically sound by heuristic
- legal but still rejected by the reasoning judge as worse than the full-reference plan

## Accuracy Result

Focused accuracy sweep:

- candidate variant: `compact_moves5`
- candidate models: `gpt-5`, `gpt-5-mini`, `gpt-5.4-mini`
- ground truth: `gpt-5 + full`
- judge: `gpt-5`

### `gpt-5 + compact_moves5`

- completed all 6 scenarios
- `legal_turn_rate = 1.0` in all completed cases
- best judge alignment of the tested compact candidates

Judge acceptance by scenario:

| Scenario | Judge acceptable rate |
|---|---:|
| `duel-goblin-vs-acolyte` | `1.0` |
| `crowded-ogre-frontline` | `1.0` |
| `air-elemental-flank` | `0.6667` |
| `aboleth-control-web` | `0.3333` |
| `ranged-bandit-crossfire` | `0.0` |
| `boss-dragon-vs-party` | `0.0` |

### `gpt-5-mini + compact_moves5`

- completed all 6 scenarios
- also stayed legal
- but diverged sharply from the `gpt-5 + full` reference

Judge acceptance by scenario:

| Scenario | Judge acceptable rate |
|---|---:|
| `duel-goblin-vs-acolyte` | `1.0` |
| all other tested scenarios | `0.0` |

### `gpt-5.4-mini + compact_moves5`

- completed on rerun
- stayed legal in every scenario
- stayed tactically sound under the heuristic checks
- but aligned poorly with the `gpt-5 + full` reference

Judge acceptance by scenario:

| Scenario | Judge acceptable rate |
|---|---:|
| `duel-goblin-vs-acolyte` | `0.3333` |
| `ranged-bandit-crossfire` | `0.0` |
| `crowded-ogre-frontline` | `0.0` |
| `air-elemental-flank` | `0.0` |
| `boss-dragon-vs-party` | `0.0` |
| `aboleth-control-web` | `0.0` |

## Current Bottom Line

If choosing today:

### Use this for best tactical confidence

- `gpt-5 + compact_moves5`

### Use this for fastest likely production experience

- `gpt-5.4-mini + compact_moves5`

But:

- use it as a latency-optimized mode, not the best tactical default

## What Still Remains

No major benchmark runs remain unfinished.

The remaining work is interpretive:

- decide whether to ship separate tactics and speed modes
- publish the updated completed accuracy findings to the wiki if desired

## Primary Artifacts

### Latency

- `backend/benchmark-results/packet-latency-2026-03-28-runs3.summary.json`
- `backend/benchmark-results/packet-latency-2026-03-29-hybrid.summary.md`
- `backend/benchmark-results/packet-latency-2026-03-29-model-sweep-summary.md`

### Accuracy

- `backend/benchmark-results/packet-accuracy-2026-03-29-model-sweep-summary.md`
- `backend/benchmark-results/packet-accuracy-2026-03-29-model-sweep-report.json`
