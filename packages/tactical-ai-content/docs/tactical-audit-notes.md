# Tactical Audit Notes

## Summary Of Observations

This audit focused on recent `supervised_utility_group` behavior after the tactical taxonomy refactor. The current engine is mechanically healthier than before: grouped execution works, `shoot_and_scoot` executes in the right order, and statblock metadata is no longer being emitted as attacks. The remaining issues are mostly about classification, diagnostics, and coarse tactical abstractions rather than obvious execution breakage.

## Confirmed Bugs

1. No fresh execution-order bug was confirmed in this pass.
2. No reproducible executable off-map candidate was confirmed in this pass.

## Candidate Bounds

- Candidate generation now has an audit pass that inspects `fromCell`, `move.to`, `action.from`, firing cells, hide cells, and path cells for out-of-bounds coordinates.
- In focused edge-of-map probes, generated and selected candidates remained in bounds.
- The next thing to verify, if negative coordinates reappear in logs, is whether they come from:
  - imported fixture coordinates,
  - a display transform in the UI/log layer,
  - or a stale pre-normalized actor position before candidate generation.

Current assessment:
- Status: `not yet reproduced as a legality bug`
- Likely class if it reappears: `diagnostic/display issue` or `fixture/import issue` before `candidate-generation bug`

## Hobgoblins / Blocker Hold-Line Mapping

Observed pattern:
- Generic hobgoblin mapping is `role=blocker`, `function=hold_line`.
- In fixtures where the actor mainly has ranged pressure and no explicit protected asset or objective is authored, the actor can reasonably select `shoot_and_scoot`.

Audit conclusion:
- This is not automatically a scoring bug.
- It is often a `mapping ambiguity` or `fixture-context ambiguity`.
- The same actor chassis can read differently depending on scenario:
  - `blocker/hold_line` when explicitly screening a lane, ruin entrance, or ally
  - `artillery/sniper` when it is mostly acting as a ranged lane-holder
  - `leader/commander` when the fixture wants disciplined coordination pressure

Low-risk change made in this audit:
- blocker `shoot_and_scoot` diagnostics now distinguish:
  - `line_preserved`
  - `line_abandoned`
  - `mapping_or_fixture_ambiguous`
  - `defended_line_ambiguous`

## Lurker Diagnostics

Observed pattern:
- Lurkers such as ghosts, crocodiles, or mist-form actors often select `hold_hidden` or `stalk_to_cover`.
- Previous warnings treated this as candidate failure even when the behavior was tactically plausible.

Audit conclusion:
- `hold_hidden` is a valid primary lurker action when the actor is not yet committed and ambush trigger timing is not modeled.
- The main limitation is not necessarily candidate generation; it is `unsupported ambush trigger logic`.

Current diagnostic taxonomy:
- `PASS`: hidden lurker holds hidden in a plausible wait state
- `WEAK_PASS`: lurker can hold/stalk but lacks fully modeled reveal/follow-through
- `WARNING`: lurker has neither ambush posture nor attack pressure, or is taking a ranged/skirmish line that fights the role
- `UNSUPPORTED`: represented today as diagnostic classification `unsupported_ambush_trigger`

## Score Flatness

Observed pattern:
- Top candidates often tie exactly, especially on ranged skirmishers.

Audit conclusion:
- Some ties are probably genuine.
- Some ties were only equal in score, not equal in tactical shape.

Low-risk change made in this audit:
- score-flatness diagnostics now capture lightweight feature vectors for tied top candidates, including:
  - path length
  - final distance to target
  - final distance to nearest enemy
  - number of escape neighbors
  - adjacency exposure
  - line-of-sight break behavior
  - final cell
  - firing cell

This gives a better answer to “are these tied because they are truly equivalent, or because we are not scoring a difference yet?”

## Doctrine Influence

Observed pattern:
- logs often reported doctrine selection but no applied doctrine modifiers.

Audit conclusion:
- This is mostly expected with the current code.
- Right now doctrine scoring is `causal` only for `protect_caster`.
- Other doctrines such as `hold_defensive_line`, `split_and_punish`, and `ranged_ambush_focus_fire` are mostly `descriptive`.

Low-risk change made in this audit:
- doctrine logs now expose `scoringMode`:
  - `causal`
  - `descriptive`

## Recommended Next Patches

1. Candidate bounds enforcement only if a real executable off-map case is reproduced.
2. Fixture-context mapping policy for hobgoblins and similar ranged soldiers.
3. Small tie-breaker terms after reviewing new flatness feature logs.
4. Separate doctrine scoring work for non-`protect_caster` doctrines.
5. Better authored objective semantics for `hold_line`, `protect_area`, and `screen`.

## Non-Goals

- No Pathfinder or Starfinder action-economy work.
- No new ambush trigger mechanics.
- No area-template modeling.
- No broad rewrite of the scoring system in this pass.
