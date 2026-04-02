# GPT-5 Packet Benchmark

> A consolidated benchmark summary for GPT-5 packet latency testing in the DrowVTT combat controller.

## What This Benchmark Was Trying To Answer

This benchmark evaluates how different AI turn-packet formats affect GPT-5 response latency in the VTT combat system.

The core question was simple: which packet format gives the best response speed without assuming that smaller packets are always better?

The benchmark compared one full verbose packet against several compact variants that:

- compress token and board context
- limit legal move candidates
- limit legal attack windows
- summarize the active token statblock

The result is a mixed but actionable picture: compaction usually helps, but not uniformly. The strongest production default candidate is `compact_moves5`.

## The Main Result In One Screen

- **Best default:** `compact_moves5`
- **Fastest overall mean latency:** `compact_moves5_attacks6`
- **Why not use the fastest variant as the default?** Its edge over `compact_moves5` was tiny, while `compact_moves5` was the more stable choice overall.
- **Best fallback/baseline:** `full`
- **Do not use as default:** `compact_summary`

In practice:

- `compact_moves5_attacks6` had the best mean TAT at **40.35s**
- `compact_moves5` was essentially tied at **40.55s**
- `full` averaged **47.64s**
- `compact_summary` averaged **48.51s** and had the worst variance

## How The Latency Test Was Set Up

| Item | Details |
|---|---|
| Model | `gpt-5` |
| Metric | Turn-around time (`TAT`) in milliseconds, measured around the `responses.create()` API call |
| Test matrix | 6 combat scenarios, 8 packet variants, 3 runs per scenario/variant pair, 144 API calls total |
| Data artifacts | [packet-latency-2026-03-28-runs3.summary.json](packet-latency-2026-03-28-runs3.summary.json)<br>[packet-latency-2026-03-28-runs3.overall.csv](packet-latency-2026-03-28-runs3.overall.csv)<br>[packet-latency-2026-03-28-runs3.runs.csv](packet-latency-2026-03-28-runs3.runs.csv)<br>[packet-latency-2026-03-28-runs3.raw.log](packet-latency-2026-03-28-runs3.raw.log) |

## Which Combat Scenarios Were Included

| Scenario | Description |
|---|---|
| `duel-goblin-vs-acolyte` | Minimal 1v1 melee case with a short statblock. |
| `ranged-bandit-crossfire` | Spread-out ranged skirmish with several 1x1 tokens. |
| `crowded-ogre-frontline` | Dense melee board with a large creature and tight occupancy pressure. |
| `air-elemental-flank` | Mobile large-creature case with repositioning pressure. |
| `boss-dragon-vs-party` | Boss-turn scenario with a large statblock and clustered targets. |
| `aboleth-control-web` | Controller-style scenario with a long statblock and several anchor units. |

## Which Packet Formats Were Compared

| Variant | Definition |
|---|---|
| `full` | Baseline verbose packet with full rules text, full token descriptions, occupied-space listing, and full active-token statblock. |
| `compact_base` | Shorter packet that compresses board and token information while keeping compact legal guidance. |
| `compact_moves5` | `compact_base` plus legal move candidates limited to 5. |
| `compact_attacks6` | `compact_base` plus legal attack opportunities limited to 6. |
| `compact_summary` | `compact_base` plus summarized active-token statblock instead of the full statblock. |
| `compact_moves5_attacks6` | `compact_base` plus move candidates limited to 5 and attack opportunities limited to 6. |
| `compact_moves5_summary` | `compact_base` plus move candidates limited to 5 and summarized statblock. |
| `compact_moves5_attacks6_summary` | `compact_base` plus move candidates limited to 5, attack opportunities limited to 6, and summarized statblock. |

## Overall Latency Results Across All Scenarios

### Mean Latency Ranking By Packet Format

| Rank | Variant | Mean TAT | Median TAT | Stddev | Faster Than `full` |
|---|---|---:|---:|---:|---:|
| 1 | `compact_moves5_attacks6` | 40.35s | 39.14s | 12.10s | 15.29% |
| 2 | `compact_moves5` | 40.55s | 38.43s | 10.60s | 14.89% |
| 3 | `compact_moves5_summary` | 41.93s | 39.70s | 13.68s | 11.97% |
| 4 | `compact_attacks6` | 42.34s | 42.05s | 12.26s | 11.11% |
| 5 | `compact_base` | 43.76s | 44.00s | 11.02s | 8.13% |
| 6 | `compact_moves5_attacks6_summary` | 45.01s | 40.91s | 16.57s | 5.51% |
| 7 | `full` | 47.64s | 45.66s | 12.87s | 0% |
| 8 | `compact_summary` | 48.51s | 39.65s | 24.29s | -1.83% |

### What The Main Numbers Say

- `compact_moves5_attacks6` had the best overall mean latency.
- `compact_moves5` was only about **193 ms** slower on mean TAT.
- `compact_moves5` had better stability than the fastest variant and a stronger practical case as the default.
- `compact_summary` had the largest spread by far and the worst tail behavior.

## Which Packet Formats Actually Performed Best

A “latency performer” is just a packet format judged by both response speed and consistency.

| Performance group | Variants | Plain-language read |
|---|---|---|
| Best overall performers | `compact_moves5_attacks6`, `compact_moves5` | These were the fastest overall and are the only serious default candidates from the original GPT-5 sweep. |
| Strong but second-tier performers | `compact_moves5_summary`, `compact_attacks6`, `compact_base` | These were clearly better than `full`, but they did not match the top two. |
| Mixed results | `compact_moves5_attacks6_summary` | This format could look good in some scenarios, but it was not steady enough to trust as a default. |
| Weak default candidates | `compact_summary`, and sometimes even `full` depending on board shape | `compact_summary` was too volatile overall, and `full` only looked best in a narrow high-congestion case. |

## What The Results Mean In Practice

| Finding | What it means for the system |
|---|---|
| Smaller packets usually helped, but not always. | Compaction improved latency overall, but `crowded-ogre-frontline` showed that shrinking the prompt is not automatically a win. |
| Limiting move choices was the most reliable optimization. | Variants with `moves5` kept showing up near the top, which suggests move pruning mattered more than just compressing text. |
| Summarized statblocks were risky. | `compact_summary` sometimes won easy boards, but its variance and worst-case latency were bad enough to rule it out as a default. |
| Board shape changed the winner. | Simple duel and boss-turn boards liked aggressive compaction, while dense melee congestion still favored `full`. |

## Which Default We Should Actually Use

| Role | Variant | Why |
|---|---|---|
| Recommended production default | `compact_moves5` | It was almost tied for fastest overall, more stable than the raw winner, and strong across several scenario types. |
| Fastest raw latency option | `compact_moves5_attacks6` | It had the best mean TAT, but its edge over `compact_moves5` was too small to make it the safer default. |
| Baseline and fallback | `full` | It still won the dense ogre frontline case, so it remains useful as a comparison point and fallback path. |
| Default to avoid | `compact_summary` | It was slower than `full` overall and had the worst variance in the benchmark. |

## What Changed When We Tested Smaller GPT-5 Models

After the original GPT-5 packet sweep, a second latency sweep compared the three most relevant packet formats across `gpt-5`, `gpt-5-mini`, and `gpt-5.4-mini`.

| Model | Best packet format | Mean TAT | Readout |
|---|---|---:|---|
| `gpt-5` | `compact_moves5` | 37.80s | Best large-model latency result while keeping the stronger tactical baseline. |
| `gpt-5-mini` | `compact_moves5` | 23.70s | Much faster than `gpt-5`, but packet choice mattered less and accuracy dropped off. |
| `gpt-5.4-mini` | `compact_moves5` | 1.55s | By far the fastest result in the entire sweep and the clearest speed-mode candidate. |

| Model-level finding | What it means |
|---|---|
| `compact_moves5` remained the best default packet across all tested GPT-5-family models. | The move-pruned packet generalizes better than the more aggressive packet shapes. |
| `gpt-5.4-mini` was dramatically faster than the larger models. | If responsiveness is the top priority, this is the leading speed candidate. |
| `gpt-5-mini` improved latency, but not enough to clearly replace either `gpt-5` or `gpt-5.4-mini`. | It currently looks like a middle ground without a strong enough accuracy case. |

## Example Scenarios With Post-Action Screenshots

Representative benchmark boards with scenario-specific latency takeaways.

Each screenshot below shows one benchmark scenario from the GPT-5 packet latency test suite. The caption under each image summarizes which packet variant won that scenario and how far ahead it finished compared with the `full` baseline.

### `duel-goblin-vs-acolyte`

![duel-goblin-vs-acolyte](scenario-screenshots/duel-goblin-vs-acolyte.png)

**Winner:** `compact_moves5_attacks6_summary` at **23.31s** average TAT.

**Delta vs `full`:** **17.08s faster** than `full` (40.39s).

**Runner-up:** `compact_summary` at **26.35s** average TAT.

**Finding:** Small duel scenario. Compact variants were dramatically faster here; the best run class cut average TAT by roughly 17 seconds versus `full`.

**Prompt in plain language:** "You are controlling a goblin in a tiny one-on-one fight. Here is where the goblin and the acolyte are standing, how far the goblin can move, and what actions are legal. Pick one legal turn."

**What happened in the archived turn:** "The goblin held position at (4,4) and made a legal scimitar attack against the Acolyte once the compact attack-window bug was fixed."

**Archived model summary:** "Goblin stays in place and attacks the adjacent Acolyte with its scimitar."

### `ranged-bandit-crossfire`

![ranged-bandit-crossfire](scenario-screenshots/ranged-bandit-crossfire.png)

**Winner:** `compact_summary` at **25.48s** average TAT.

**Delta vs `full`:** **5.34s faster** than `full` (30.82s).

**Runner-up:** `compact_moves5_summary` at **25.84s** average TAT.

**Finding:** Spread-out ranged skirmish. Summarized compact packets performed best here, suggesting lighter token context can help when the board is simple but not crowded.

**Prompt in plain language:** "You are controlling a bandit on a wider battlefield with several combatants spread across lanes. Here are the token positions, legal movement options, and available attack windows. Choose the best legal turn."

**What happened in the archived turn:** "The bandit advanced from (2,2) to (5,5) to pressure the low-AC caster and then fired a legal light crossbow shot at the Acolyte instead of wasting the turn on Dodge."

**Archived model summary:** "Bandit advances to pressure the Acolyte while staying out of the Knight's immediate reach, then fires a light crossbow at the Acolyte at close range."

### `crowded-ogre-frontline`

![crowded-ogre-frontline](scenario-screenshots/crowded-ogre-frontline.png)

**Winner:** `full` at **47.58s** average TAT.

**Delta vs `full`:** `full` was the fastest variant here at **47.58s**.

**Runner-up:** `compact_moves5_attacks6` at **49.43s** average TAT.

**Finding:** Dense melee congestion case. This was the clearest counterexample to “smaller packet is always faster”: `full` was the fastest average performer.

**Prompt in plain language:** "You are controlling an ogre in a cramped melee scrum. Multiple creatures are packed together, occupied spaces matter, and illegal movement is easy to make. Choose a legal and competent turn."

**What happened in the archived turn:** "The ogre advanced to (7,4), pushing into the back line, then swung its greatclub at the Acolyte for a legal melee attack."

**Archived model summary:** "The ogre lumbers right, skirting the knight, then crashes its greatclub toward the acolyte, planting itself amid the melee to threaten the backline."

### `air-elemental-flank`

![air-elemental-flank](scenario-screenshots/air-elemental-flank.png)

**Winner:** `compact_moves5` at **44.50s** average TAT.

**Delta vs `full`:** **18.67s faster** than `full` (63.17s).

**Runner-up:** `compact_moves5_attacks6` at **47.10s** average TAT.

**Finding:** High-mobility flanking board. `compact_moves5` was the best average latency performer here, beating `full` by about 18.7 seconds.

**Prompt in plain language:** "You are controlling an air elemental with strong mobility. Here is the board, the nearby enemies, and the legal moves and attacks. Pick the best legal reposition-and-attack turn."

**What happened in the archived turn:** "The air elemental repositioned diagonally and then followed through with a legal slam attack instead of wasting the turn on Dodge."

**Archived model summary:** "Air Elemental repositions to pressure the enemy line and converts the move into a legal slam attack."

### `boss-dragon-vs-party`

![boss-dragon-vs-party](scenario-screenshots/boss-dragon-vs-party.png)

**Winner:** `compact_moves5_attacks6` at **37.41s** average TAT.

**Delta vs `full`:** **18.43s faster** than `full` (55.84s).

**Runner-up:** `compact_moves5_summary` at **40.48s** average TAT.

**Finding:** Boss-turn stress case with a large statblock. `compact_moves5_attacks6` won this scenario on latency, showing that tighter legal move and attack windows can help on heavyweight turns.

**Prompt in plain language:** "You are controlling a dragon on a boss turn. Here is a bigger statblock, the clustered party, and the legal movement and attack choices. Pick one strong legal boss action."

**What happened in the archived turn:** "The dragon moved left to (6,4) and used Fire Breath in a west-facing cone to catch the Knight, Acolyte, Bandit, and Ogre Ally in one area attack."

**Archived model summary:** "The Adult Red Dragon lumbers left to (6,4) and unleashes its Fire Breath in a 60-ft cone to the west, engulfing the Knight, Acolyte, Bandit, and Ogre Ally."

### `aboleth-control-web`

![aboleth-control-web](scenario-screenshots/aboleth-control-web.png)

**Winner:** `compact_moves5` at **34.94s** average TAT.

**Delta vs `full`:** **13.08s faster** than `full` (48.02s).

**Runner-up:** `compact_summary` at **39.81s** average TAT.

**Finding:** Controller-style scenario with a long statblock. `compact_moves5` was clearly best here, implying move pruning can matter more than extra attack-window detail in control-heavy turns.

**Prompt in plain language:** "You are controlling an aboleth in a control-oriented encounter. Here are the unit positions, legal moves, and the aboleth's attack/control options. Choose a legal turn that pressures the enemy effectively."

**What happened in the archived turn:** "The aboleth slid east to (10,6) and then used Enslave on the Air Elemental to turn the most dangerous mobile threat into a control target."

**Archived model summary:** "Aboleth repositions to the east, then uses Enslave on the Air Elemental to turn the heavy hitter against its allies."

## What The Accuracy Follow-Up Added

A legality-focused and reasoning-backed accuracy harness was added after the latency benchmark so we could stop using latency as a proxy for quality.

Files:

- [measure-packet-accuracy.mjs](../measure-packet-accuracy.mjs)
- [ai-turn-eval-utils.mjs](../ai-turn-eval-utils.mjs)

The follow-up accuracy work is now complete enough to compare legality and tactical fidelity against a `gpt-5 + full` reference turn.

What we know so far:

- `gpt-5 + compact_moves5` remained the strongest compact option when judged against the `gpt-5 + full` reference
- `gpt-5-mini` and `gpt-5.4-mini` were much faster, but they showed weaker agreement with the `gpt-5 + full` tactical baseline
- legality should be measured directly rather than inferred from packet size or verbosity
- Dodge-in-melee cases are now flagged for tactical review instead of being treated as obviously acceptable

| Accuracy comparison | What happened |
|---|---|
| `gpt-5 + compact_moves5` | Stayed legal across the completed sweep and matched the `gpt-5 + full` reference best. |
| `gpt-5-mini + compact_moves5` | Stayed legal, but the reasoning judge rejected it in most scenarios. |
| `gpt-5.4-mini + compact_moves5` | Stayed legal and extremely fast, but aligned poorly with the `gpt-5 + full` tactical reference. |

## Final Recommendation

The benchmark now points to two different “best” choices depending on what you value more.

| If you want... | Use this | Why |
|---|---|---|
| Best tactical confidence | `gpt-5 + compact_moves5` | It stayed closest to the `gpt-5 + full` reference while still giving a meaningful latency improvement over `full`. |
| Best latency | `gpt-5.4-mini + compact_moves5` | It was the fastest result by a wide margin, but it behaves more like a speed mode than a tactical replacement for the larger model. |
| Best fallback | `gpt-5 + full` | It remains the most conservative reference path when packet compaction or smaller models look suspicious. |

Within the original GPT-5-only packet sweep, `compact_moves5_attacks6` was the raw packet-speed leader. Across the newer model sweep, `gpt-5.4-mini + compact_moves5` is now the overall latency leader.
