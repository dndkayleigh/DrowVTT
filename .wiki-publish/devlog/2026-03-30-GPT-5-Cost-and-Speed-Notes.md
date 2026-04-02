# Devlog: GPT-5 Cost and Speed Notes

Date: March 30, 2026

This note updates the older model-cost discussion using current GPT-5-family benchmark artifacts instead of the earlier `gpt-4.1` era tests.

## What Was Measured

The current reference point comes from the model sweep in `backend/benchmark-results/packet-latency-2026-03-29-model-sweep-summary.md`.

That sweep compared:

- `gpt-5`
- `gpt-5-mini`
- `gpt-5.4-mini`

Across the three most relevant packet formats:

- `full`
- `compact_moves5`
- `compact_moves5_attacks6`

Benchmark shape:

| Models | Scenarios | Variants | Runs | API calls |
|---|---:|---:|---:|---:|
| 3 | 6 | 3 | 3 | 162 |

## Best Latency Result Per Model

| Model | Best packet | Mean TAT | Relative to that model's `full` packet |
|---|---|---:|---:|
| `gpt-5` | `compact_moves5` | 37.80s | 27.02% faster |
| `gpt-5-mini` | `compact_moves5` | 23.70s | 7.12% faster |
| `gpt-5.4-mini` | `compact_moves5` | 1.55s | 27.09% faster |

## What This Means For Cost

These benchmark files primarily measure latency, not invoice totals, so this page should be read as a cost-estimation note rather than a billing statement.

Even without exact pricing rolled up here, the benchmark still tells us the two biggest practical cost drivers:

- model choice
- total tokens generated

That means the same architectural lesson still holds:

- smaller or faster GPT-5-family models are the cheapest place to start
- compact packet shaping remains valuable because it reduces prompt size and usually reduces turnaround time
- long, verbose outputs from the larger reasoning model remain the main reason a turn becomes expensive

## Recommended Reading Of The Current Results

If the goal is the safest tactical default:

- use `gpt-5 + compact_moves5`

If the goal is the fastest likely production experience:

- use `gpt-5.4-mini + compact_moves5`

If the goal is a middle ground:

- `gpt-5-mini + compact_moves5` is much faster than `gpt-5`, but it did not show as strong an accuracy case as the larger model

## Practical Takeaway

The old conclusion that “small models are extremely cheap and fast” is still directionally true, but the names have changed and the current best speed candidate is now `gpt-5.4-mini`, not `gpt-4.1-mini`.

The current docs should be interpreted like this:

- `gpt-5 + compact_moves5` is the best tactical-confidence mode
- `gpt-5.4-mini + compact_moves5` is the best speed mode
- packet shaping still matters, especially `compact_moves5`

## Source Artifacts

- `backend/benchmark-results/packet-latency-2026-03-29-model-sweep-summary.md`
- `backend/benchmark-results/packet-latency-2026-03-29-model-sweep-report.json`
- `backend/benchmark-results/gpt5-packet-benchmark-final-summary-2026-03-29.md`
