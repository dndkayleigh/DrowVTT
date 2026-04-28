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

## Playable Scenario Packages

Tactical fixtures are the test-facing part of a larger scenario package. For
SaaS deployment, a scenario should be packaged as an immutable template that can
instantiate a fresh playable `/app` session.

Recommended package shape:

- `manifest.json`: slug, title, summary, difficulty, party size/level,
  estimated time, tags, release status, and asset references.
- `board.snapshot.json`: playable VTT board state, including tokens, fog,
  blocking edges, grid calibration, and map placement.
- `tactical.fixture.yaml`: controller test fixture and ideal-behavior notes.
- `assets/`: source map, preview image, token art, handouts, and attribution.

The tactical YAML should not embed large map images. It should reference the
tactical battlefield model only. The board snapshot and SaaS scenario manifest
should point to durable hosted assets for maps, previews, and token art.

SaaS launch flow:

1. A public `/scenarios` page lists published scenario cards.
2. `/scenarios/:slug` shows the detail page and launch button.
3. Launching calls the backend to create a new session from the scenario
   template.
4. The backend resolves or copies durable asset references into that session.
5. The user lands in `/app` with the map, tokens, fog, blocking, and tactical
   metadata already loaded.

Scenario templates should not be mutated during play. Every launch should create
a fresh session copy so playtest results, solo runs, and future subscription
content remain reproducible.
