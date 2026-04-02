# Hybrid Prompt Benchmark: `full_moves5_attacks6`

This follow-up benchmark tested whether adding explicit legal move and attack windows to the **full verbose packet** could preserve the broader tactical context of `full` while recovering some of the latency gains seen in compact packets.

Test matrix:

| Variants | Scenarios | Runs | API calls |
|---|---:|---:|---:|
| `full`, `full_moves5_attacks6`, `compact_moves5_attacks6` | 6 | 3 each | 54 |

Overall result:

| Variant | Mean TAT | Median TAT | Stddev | Mean vs `full` |
|---|---:|---:|---:|---:|
| `compact_moves5_attacks6` | 42.12s | 35.74s | 19.89s | 12.24% faster |
| `full` | 48.00s | 49.34s | 20.98s | baseline |
| `full_moves5_attacks6` | 59.16s | 61.27s | 26.52s | 23.26% slower |

Scenario winners:

| Scenario | Winner | Notes |
|---|---|---|
| `duel-goblin-vs-acolyte` | `compact_moves5_attacks6` | Strong win for both pruned variants over `full`. |
| `ranged-bandit-crossfire` | `full` | Both hybrid and compact were slower than plain `full`. |
| `crowded-ogre-frontline` | `full` | Dense melee still favored the baseline verbose packet. |
| `air-elemental-flank` | `compact_moves5_attacks6` | Compact remained clearly best. |
| `boss-dragon-vs-party` | `full` | Hybrid was worst; compact also regressed. |
| `aboleth-control-web` | `compact_moves5_attacks6` | Compact won decisively; hybrid was only slightly faster than `full`. |

Key finding:

Adding `moves5` and `attacks6` **without compaction** did **not** produce a useful middle ground. The hybrid `full_moves5_attacks6` packet increased prompt size relative to `full`, won **0 of 6 scenarios**, and was **slower than `full` overall**. The compact version remained the fastest of the three, while plain `full` still won the ranged and dense-board cases.

Practical interpretation:

- If the concern is that compaction might reduce tactical quality, this hybrid latency test does **not** support replacing compact prompts with a verbose-plus-constraints prompt as a speed optimization.
- The question of tactical quality still needs the legality/accuracy benchmark, not just latency.
- For latency alone, `full_moves5_attacks6` should **not** be promoted.

Artifacts:

- `backend/benchmark-results/packet-latency-2026-03-29-hybrid.raw.log`
- `backend/benchmark-results/packet-latency-2026-03-29-hybrid.summary.json`
- `backend/benchmark-results/packet-latency-2026-03-29-hybrid.runs.csv`
- `backend/benchmark-results/packet-latency-2026-03-29-hybrid.overall.csv`
