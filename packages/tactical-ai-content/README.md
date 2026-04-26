# Tactical AI Content

Monster archetypes, profile defaults, ruleset presets, and sample tactical
fixtures used by the portable controller layer.

## Visible Encounter Fixtures

Hand-authored tactical scenarios live in `encounters/*.yaml`. These are meant to
be read and edited directly while playtesting tactical behavior.

Each fixture contains:

- `battlefield`: grid dimensions and blocking edges.
- `actors`: token positions, sides, speed, and attacks.
- `expected.must`: behavior that should always pass.
- `expected.mustNot`: behavior that should never occur.

The test harness parses these files into the shared encounter schema and runs
the selected controllers against the same visible expectations.
