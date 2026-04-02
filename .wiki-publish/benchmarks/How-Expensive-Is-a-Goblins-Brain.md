> Historical note: this page reflects an older `gpt-4.1` / `gpt-4.1-mini` benchmark snapshot. For the current GPT-5-family cost and speed picture, see [2026-03-30 GPT-5 Cost and Speed Notes](../devlog/2026-03-30-GPT-5-Cost-and-Speed-Notes.md).

One of the goals of this project is to explore how AI agents can participate in tabletop combat encounters in real time. After implementing the full AI turn pipeline—board state export, backend orchestration, model decision-making, and automatic application of moves—the next question naturally emerged:

**How much does it actually cost to let an AI move a goblin?**

To answer this, a controlled benchmark was run using a simple combat scenario. A single goblin acting against a player character was evaluated across three OpenAI models. The prompt, board state, and statblock were identical for every run. The transmitted payload was approximately **1356 bytes**, corresponding to roughly **556–558 input tokens**.

## Benchmark Prompt

The following prompt was used for all three model evaluations:

```
SYSTEM: You are the tactical controller for the side specified below in a D&D 5e grid combat.
You must follow the rules, use legal actions, and play competently.
If information is missing, make conservative assumptions and state them briefly.

RULES:
- D&D 5e, grid-based. Each grid cell = 5 ft.
- Positions are integer cells (x,y), 0-based; x increases right, y increases down.
- Diagonals cost 5 ft (default).
- No walls/cover unless specified; do not assume you can Hide unless cover/concealment exists.

AI CONTROLS: Monsters
ROUND: 1
TURN: Monster "Goblin A"

MAP:
- Grid size px (visual): 64
- Map transform (for reference): offX=0, offY=0, scale=1.00, rotDeg=0.00
- Blocked cells: []
- Difficult terrain: []

TOKENS:
- PC: "Aria" at (1, 1), size 1x1, AC 15, HP 18/18, Speed 30 ft, Notes: none
- Monster: "Goblin A" at (7, 6), size 1x1, AC 15, HP 7/7, Speed 30 ft, Notes: none

STATBLOCK (current turn token):
Goblin (5e)
- Speed 30 ft
- Actions:
  - Scimitar: +4 to hit, 5 ft, 1d6+2 slashing
  - Shortbow: +4 to hit, range 80/320, 1d6+2 piercing
- Bonus Action: Nimble Escape (Disengage or Hide)

OUTPUT CONTRACT:
Return ONLY this JSON shape (no prose, no markdown):
{
  "moves": [{"token":"Name","to":[x,y]}],
  "actions": [{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"..."}],
  "end_turn": true
}
```

## Movement Analysis

_Movement screenshot omitted from this draft export._

### Interpreting the Goblin’s Move

### Goblin Turn Summary

When controlling the goblin, the three models produced similar combat behavior but differed in movement decisions, token usage, latency, and cost.

**GPT-4.1-mini** moved the goblin **15 feet** and then fired a **shortbow attack** at the player character. The response used **558 input tokens and 48 output tokens (606 total)** and completed in **~1.6 seconds**. The estimated cost of the turn was **approximately $0.0003**.

**GPT-4.1** made a similar decision, moving the goblin **10 feet** before firing a **shortbow attack**. The response used **558 input tokens and 58 output tokens (616 total)** and completed in **~2.5 seconds**. The estimated cost of the turn was **approximately $0.0016**.

**GPT-5** chose a more aggressive repositioning strategy. The goblin used its **full 30 feet of movement** before attacking with the **shortbow**, suggesting a stronger emphasis on positioning and distance management. However, the model generated a much longer response describing the decision. The turn consumed **556 input tokens and 2330 output tokens (2886 total)** and required **~36 seconds** to complete. Because of the extremely large output, the estimated cost rose to **approximately $0.024**.

Overall, the goblin scenario demonstrates that smaller models are capable of producing reasonable tactical decisions with extremely low latency and cost. In contrast, the largest model produced a more elaborate response that significantly increased both response time and cost, despite reaching a broadly similar tactical outcome.


### How about a Lich?

_Lich scenario screenshot omitted from this draft export._

When given control of the Lich, the three models again demonstrated different tactical behavior, along with noticeable differences in token usage, cost, and latency.

**GPT-4.1-mini** took the most conservative action. The Lich simply cast **Ray of Frost**, a cantrip, at the player character. This decision required **1352 input tokens and 47 output tokens (1399 total)** and completed in **~2.6 seconds**. The estimated cost of the turn was **approximately $0.0006**.

**GPT-4.1** made a much more aggressive decision. The model moved the Lich and cast **Power Word Kill**, instantly defeating the player character with a 9th-level spell. This response used **1352 input tokens and 68 output tokens (1420 total)** and took **~4.7 seconds** to complete. The estimated cost was **approximately $0.0032**.

**GPT-5** reached essentially the same tactical conclusion as GPT-4.1—casting **Power Word Kill**—but generated a much longer response describing the action. The turn consumed **1350 input tokens and 1344 output tokens (2694 total)** and required **~27.5 seconds** to complete. Because of the large output, the estimated cost rose to **approximately $0.015**.

Overall, the Lich scenario highlights two important behaviors of the models. First, the larger models tend to make **more decisive, high-impact tactical choices**, while the smaller model selected a safer, lower-level action. Second, the **dominant driver of cost and latency is output token length**, particularly for the largest model. Even with a similar prompt size, GPT-5’s longer output significantly increased both response time and cost compared with the smaller models.

## What This Means for AI-Driven Combat

These results highlight an important architectural insight: the VTT system itself introduces almost no overhead. Board state serialization, network transmission, and backend parsing all complete in effectively negligible time.

The dominant factors controlling both **latency and cost** are:

* model choice
* output token length

For small tactical decisions—such as determining a monster’s movement and attack—the smaller models perform exceptionally well.

Using **gpt-4.1-mini**, a goblin’s turn costs roughly:

**$0.000525 per decision**

That means a typical combat encounter of 30 AI turns would cost roughly:

**$0.01575 (about 1.6 cents).**

Even with dozens of monsters across multiple encounters, the operational cost remains extremely low.

## Recommended Model Strategy

Based on these results, the system now adopts the following model usage strategy:

* **gpt-4.1-mini** — default model for real-time combat decisions
* **gpt-4.1** — optional higher-reasoning tactical model
* **gpt-5** — reserved for complex strategic reasoning, encounter planning, or narrative AI

This approach keeps gameplay responsive while maintaining flexibility for more sophisticated AI tasks elsewhere in the system.
