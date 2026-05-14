# Turn Panel Tactical Metadata

This page explains the `Turn -> Tactics` panel in the OSS VTT.

The panel exists so encounter authors and GMs can tune live monster behavior without editing YAML fixtures or using debug hooks. It edits the current turn token's structured tactical metadata and sends that metadata through the same board snapshot and tactical fixture export paths used by the controller.

## What The Panel Edits

The `Tactics` tab currently exposes three kinds of metadata:

1. Tactical role metadata
- `Tactical role`
- `Tactical function`
- `Objective role`
- `Protected asset`
- `Role notes`

2. Behavior profile metadata
- `Cognition`
- `Drive`
- `Risk tolerance`
- `Coordination`
- `Planning horizon`
- `Target stickiness`

3. Structured combat metadata
- `Structured spells JSON`
- `Structured attacks JSON`

These fields are saved onto the live token, included in board snapshots, and preserved when exporting the board as a visible tactical fixture YAML.

## Tactical Role vs Behavior

These are related but different:

- `tactical role` answers: what battlefield job is this monster trying to perform?
- `tactical function` answers: what specialty within that job is it using?
- `behavior profile` answers: how intelligently and in what style does it perform that job?

Examples:

- A `skirmisher` with function `melee_harrier` and `animal / pack` behavior should feel like a mobile melee harrier, not a ranged soldier.
- A `blocker` with function `hold_line` and default `trained / squad` behavior should preserve formation and cooperate more like a battle line.
- A `blocker` with function `body_pressure` and `mindless / none` behavior should pressure nearby prey without acting like a coordinated squad.

## Field Meanings

### Tactical role

Authored battlefield intent for the token.

Examples:
- `blocker`
- `skirmisher`
- `caster`
- `lurker`
- `solo`

This must be one of the canonical broad battlefield jobs.

### Tactical function

Optional specialty inside the broad role.

Examples:
- `support`
- `control`
- `body_pressure`
- `hold_line`
- `ambusher`

Functions are normalized as strings but are not globally hard-validated.

### Objective role

Encounter-specific purpose layered on top of the tactical role.

Examples:
- `ritual_actor`
- `door_guard`
- `flank_reserve`

This is useful when a monster is not just “a skirmisher” or “a blocker,” but also has a local job in the scenario.

### Protected asset

Marks a token as something other monsters may try to screen or protect.

Typical examples:
- a caster
- a ritualist
- a fragile objective carrier

### Role notes

Freeform authoring text describing intended tactical behavior.

Use this for intent that is helpful to preserve in exports and fixtures but is not yet represented by structured fields.

## Behavior Profile Fields

### Cognition

How intelligently the creature chooses among legal options.

Examples:
- `mindless`
- `animal`
- `trained`
- `cunning`

### Drive

What the creature is trying to do.

Examples:
- `nearest_living_prey`
- `isolate_weak_prey`
- `tactical_role_objective`
- `complete_objective`

### Risk tolerance

How much danger matters to the creature.

Examples:
- `fearless`
- `normal`
- `self_preserving`
- `berserk`

### Coordination

Whether the creature behaves alone, as a pack, or as a disciplined group.

Examples:
- `none`
- `pack`
- `squad`
- `commander_led`

### Planning horizon

How far ahead the creature should care about positioning and future value.

Examples:
- `immediate`
- `short`
- `long`

### Target stickiness

How reluctant the creature is to switch targets once it has pressure on one.

Examples:
- `low`
- `medium`
- `high`

## Defaults vs Explicit Values

Behavior fields use normalized defaults when left blank.

Current default profile:

```yaml
behavior:
  cognition: trained
  drive: tactical_role_objective
  riskTolerance: normal
  coordination: squad
  planningHorizon: short
  targetStickiness: medium
```

In the Turn panel:
- behavior dropdowns always show the currently active value, even when that value is inherited
- the `Drive` text field may stay blank to mean “use the default/inferred value”
- explicit non-blank values mean “store this value on the token”

The panel shows current default values through status text and field tooltips so a user can tell whether they are inheriting behavior or overriding it.

For the select-style behavior fields, the dropdown always shows the currently active value.

- if the token is inheriting controller defaults, the dropdown shows that inherited value
- if the token has an explicit override, the dropdown shows the override

The `Drive` text field remains blank when it is inheriting the default, and its placeholder explains that blank-state default.

## What Saves Where

Editing the panel updates the live token immediately.

That metadata then flows through:

1. live board state
2. board snapshot export/import
3. visible tactical fixture YAML export
4. tactical controller packet building

This makes the panel a real authoring surface, not just a local-only UI hint.

## Compatibility Notes

The live token/editor path preserves both:
- camelCase tactical keys used by the runtime
- snake_case tactical keys that may still exist on fixture-loaded data

That compatibility layer exists so:
- legacy or fixture-authored metadata is not lost on edit
- exported YAML remains stable
- controller-facing core-role overrides do not disappear when another field is edited

## What This Panel Does Not Do

The panel does not:
- rewrite controller scoring on its own
- immediately create new role families or candidate generators
- guarantee a creature will act exactly as described in freeform notes

It only changes the structured inputs the controller receives.

If behavior still looks wrong after editing these fields, the next place to inspect is:
- controller diagnostics in the Tactics drawer
- exported tactical fixture YAML
- tactical-core behavior/role benchmarks

## Related Docs

- [Behavior Profiles](./behavior-profiles.md)
- [README Tactical Roles And Behavior Profiles](../README.md#tactical-roles-and-behavior-profiles)
