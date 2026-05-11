# Turn Panel Tactical Metadata

This page explains the `Turn -> Tactics` panel in the OSS VTT.

The panel is meant to be a GM-facing authoring surface. The top section answers practical encounter questions:

- what battlefield job does this token have?
- how does it think and coordinate?
- does it have a special local objective?

The advanced section still exposes the lower-level controller metadata when you need to debug mapping or preserve legacy fixture details.

## Normal Authoring Fields

The default view of the `Tactics` tab focuses on five fields:

1. `Battlefield job`
2. `Behavior preset`
3. `Special objective`
4. `Allies should protect this token`
5. `Tactics notes`

These are saved onto the live token, preserved in board snapshots, and exported through visible tactical fixture YAML.

### Battlefield job

This is the monster's user-facing combat job.

Current options:
- `Default / infer`
- `Skirmisher`
- `Blocker`
- `Ambusher / bruiser`
- `Support caster`
- `Soldier`
- `Boss / elite`

This is the main authoring field most GMs should use.

Internally, it maps to the structured tactical role metadata the controller already understands. For example:
- `Skirmisher` maps to `skirmisher`
- `Blocker` maps to `disciplined_blocker`
- `Boss / elite` is preserved as authored role intent and then mapped to a supported controller role in the AI interpretation summary

### Behavior preset

This is the easiest way to describe how the creature thinks without filling every raw behavior field manually.

Current presets:
- `Default trained squad`
- `Mindless pressure`
- `Animal pack`
- `Trained squad`
- `Cunning skirmisher`
- `Cautious defender`
- `Fearless brute`

Examples:
- `Mindless pressure` makes a creature feel more zombie-like
- `Animal pack` makes a creature behave more like a hunting beast pack
- `Cunning skirmisher` is a better fit for smart mobile harassers than the default trained profile

If the token's behavior fields do not exactly match a known preset, the panel shows `Custom mixed`.

### Special objective

This is a local scenario job layered on top of the normal battlefield role.

Current options:
- `None`
- `Guard location`
- `Protect ally`
- `Complete ritual/objective`
- `Hold doorway/chokepoint`
- `Flank reserve`
- `Harass from range`
- `Custom...`

When `Custom...` is selected, a text field appears so older fixture values or scenario-specific notes can still be preserved.

### Allies should protect this token

This marks the token as something allies may try to screen or preserve.

Typical examples:
- a caster
- a ritualist
- a fragile objective carrier

### Tactics notes

Freeform authoring notes for exports and future context.

The panel helper text is intentionally explicit:
- local deterministic tactics use the structured fields above
- notes are still useful for encounter design, exports, and future LLM-assisted workflows

## AI Interpretation Summary

The panel includes a read-only summary explaining how the deterministic controller will currently interpret the token.

The summary reflects:
- resolved controller role
- source of the role mapping
- effective behavior profile
- special objective, if any

Examples:
- a mindless blocker will mention nearest-prey pressure and lack of retreat/skirmisher behavior
- an animal pack skirmisher will mention isolated or wounded prey and lack of full squad doctrine
- a trained skirmisher will mention harassment and coordinated positioning

This summary is meant to answer "what will the AI think this creature is?" without requiring the GM to understand internal controller architecture.

## Advanced / Debug Fields

The advanced section keeps the lower-level tactical metadata visible for debugging and compatibility work.

Current advanced fields:
- `Authored encounter role`
- `Controller role override`
- `Mapped controller role`
- raw behavior fields:
  - `Cognition`
  - `Drive`
  - `Risk tolerance`
  - `Coordination`
  - `Planning horizon`
  - `Target stickiness`
- `Structured spells JSON`
- `Structured attacks JSON`

These fields are useful when:
- diagnosing role mapping
- preserving imported legacy metadata
- testing exact controller behavior
- editing structured combat data directly

### Authored encounter role

This shows the higher-level authored role label stored on the token or imported from a fixture.

Examples:
- `mobile_striker`
- `boss_caster`
- `door_guard`

### Controller role override

This is the explicit normalized controller-facing role.

Examples:
- `skirmisher`
- `disciplined_blocker`
- `ambusher_bruiser`
- `support_caster`

If present, this is the strongest direct way to force deterministic role interpretation.

### Mapped controller role

This read-only field shows the resolved controller role after mapping and normalization.

It answers:
- what role the controller will actually use
- whether that role came from authored role mapping, explicit override, or inference

## Behavior Presets vs Raw Behavior Fields

These are related but different:

- `Behavior preset` is a GM-friendly shortcut
- raw behavior fields are the detailed structured representation

A preset simply fills or implies the raw fields:
- `cognition`
- `drive`
- `riskTolerance`
- `coordination`
- `planningHorizon`
- `targetStickiness`

If you need precise control, use the advanced section.

## Compatibility Notes

The editor preserves both old and current tactical metadata shapes.

Supported tactical compatibility fields include:
- `tactical.role`
- `tactical.authoredRole`
- `tactical.core_role`
- `tactical.coreRole`
- `tactical.mapped_core_role`
- `tactical.mappedCoreRole`
- `tactical.objective_role`
- `tactical.objectiveRole`
- `tactical.protected_asset`
- `tactical.protectedAsset`
- `tactical.role_notes`
- `tactical.roleNotes`

Behavior compatibility also preserves both camelCase and snake_case variants where they already exist:
- `riskTolerance` / `risk_tolerance`
- `planningHorizon` / `planning_horizon`
- `targetStickiness` / `target_stickiness`

When saving from the UI, the runtime prefers canonical camelCase fields, but legacy import/export compatibility is preserved.

## What This Panel Does Not Do

The panel does not:
- rewrite controller scoring by itself
- invent new candidate families on its own
- guarantee freeform notes will change deterministic tactics

It changes the structured tactical and behavior metadata that the controller receives.

## Related Docs

- [Behavior Profiles](./behavior-profiles.md)
- [README Tactical Roles And Behavior Profiles](../README.md#tactical-roles-and-behavior-profiles)
