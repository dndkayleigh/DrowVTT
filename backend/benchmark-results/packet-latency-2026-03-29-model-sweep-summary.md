# GPT-5 Model Sweep Summary

This focused sweep compared three GPT-5-family models on the three most relevant packet variants:

- `full`
- `compact_moves5`
- `compact_moves5_attacks6`

Benchmark shape:

| Models | Scenarios | Variants | Runs | API calls |
|---|---:|---:|---:|---:|
| `gpt-5`, `gpt-5-mini`, `gpt-5.4-mini` | 6 | 3 | 3 | 162 |

## Overall Winners

| Model | Best Variant | Mean TAT | Relative to `full` |
|---|---|---:|---:|
| `gpt-5` | `compact_moves5` | 37.80s | 27.02% faster |
| `gpt-5-mini` | `compact_moves5` | 23.70s | 7.12% faster |
| `gpt-5.4-mini` | `compact_moves5` | 1.55s | 27.09% faster |

## What Changed By Model

### `gpt-5`

- `compact_moves5` and `compact_moves5_attacks6` were both much faster than `full`
- `compact_moves5` won overall on mean latency
- `compact_moves5_attacks6` still won more individual scenarios (`4/6`)

### `gpt-5-mini`

- Absolute latency improved a lot versus `gpt-5`
- Packet choice mattered less overall
- `compact_moves5` still won overall, but only by a small margin
- `full` was fastest in `2/6` scenarios

### `gpt-5.4-mini`

- By far the fastest model tested
- Most runs landed around 1-2 seconds
- `compact_moves5` won `5/6` scenarios and was the clearest overall default
- `compact_moves5_attacks6` only won `aboleth-control-web`

## Practical Readout

If the goal is the best latency with a still-simple packet strategy:

1. `gpt-5.4-mini + compact_moves5` is the strongest latency candidate from this sweep.
2. `gpt-5-mini + compact_moves5` is much faster than `gpt-5`, but the packet choice advantage is smaller and more scenario-dependent.
3. `gpt-5 + compact_moves5` remains a strong baseline if you still prefer the larger model.

## Recommendation

For the next step:

- Use `gpt-5.4-mini` as the leading latency candidate
- Use `compact_moves5` as the default packet for that model
- Run a focused legality/accuracy follow-up on:
  - `gpt-5 + compact_moves5`
  - `gpt-5-mini + compact_moves5`
  - `gpt-5.4-mini + compact_moves5`

## Artifacts

- `backend/benchmark-results/packet-latency-2026-03-29-model-sweep-report.json`
- `backend/benchmark-results/packet-latency-2026-03-29-gpt-5-runs3.summary.json`
- `backend/benchmark-results/packet-latency-2026-03-29-gpt-5-mini-runs3.summary.json`
- `backend/benchmark-results/packet-latency-2026-03-29-gpt-5-4-mini-runs3.summary.json`
