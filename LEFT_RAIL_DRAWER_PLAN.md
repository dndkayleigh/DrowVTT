# Left Rail + Context Drawer Plan

This plan replaces the current always-open left sidebar with a collapsed rail and a single contextual drawer.

The goal is to:

- extend visible map space
- collapse menus by default
- expand controls in an intuitive, predictable way

## Recent User Feedback To Fold Into The Shared Plan

Recent user feedback surfaced four different classes of work:

1. reliability and recovery
- autosave does not work
- session naming is unclear
- there should be an obvious delete path

2. data import and interoperability
- import a D&D Beyond character sheet into the VTT

3. authored encounter content
- tactical map encounter portfolio
- built-in maps
- built-in monster rosters per encounter
- separate biomes
- blocking edges so tokens cannot move through walls or impassable map boundaries
- deterministic tactical AI for single-actor and coordinated multi-monster turns

4. collaboration and community
- join someone else's instance
- create and rank difficult encounters
- public-domain art and maps
- leaderboard encounters
- livestream and upload related content

These should not all be treated as one implementation slice.

For OSS, the shared-product priorities are:

- autosave reliability
- clear session naming defaults
- delete/archive behavior for saved encounters or sessions
- import normalization seams for external character data
- encounter/portfolio data structures if the same authored content model should exist in both OSS and SaaS
- shared blocking-edge map data so movement, later line of sight, and future AI pathing all reference the same map constraints
- deterministic legality, candidate generation, scoring, and coordinated multi-actor planning as shared tactical engine work

Hosted-only layers such as public leaderboards, hosted discovery, uploads, and livestream surfaces belong in SaaS planning, not in the shared VTT shell plan.

## Shared Tactical AI Roadmap

This work is shared engine work. It should not be implemented as freeform LLM turn piloting.

Required constraints:

- legality and simulation must be deterministic and code-driven
- LLM usage must be advisory only, never freeform turn piloting
- battlefield must support blocking, difficult terrain, cover, elevation, hazards, and interactables
- AI must support single-actor turns and coordinated multi-monster activations
- multi-monster behavior must use group planning with reservation-aware candidate selection
- all major decisions must emit structured debug logs
- each phase must include tests and a small working demo path

Planned phases:

1. Combat domain schema and battlefield model
2. Legality engine
3. Candidate action generation
4. Tactical scoring and stance system
5. Monster tactics database and compiler
6. LLM advisory ranker
7. Group activation planner for simultaneous/coordinated monster actions
8. Evaluation harness and replay tests

Implementation details to preserve:

- use bounded candidate generation
- use beam search for group planning
- include collision checks and reserved-tile planning
- support activation modes: independent, coordinated sequential, simultaneous movement then actions, fully simultaneous
- expose hooks for future SRD-derived monster overlays
- prefer composable interfaces and pure functions where possible

Expected deliverables:

- types and interfaces
- core modules
- tests
- example monster profiles
- example encounter fixtures
- decision logging format
- README with architecture and extension points

## Current Implementation Seam

The smallest clean seam already exists:

- shell markup: `packages/vtt-ui-shared/src/render-oss-vtt-shell.js`
- shell layout/CSS: `packages/vtt-ui-shared/src/vtt-shell.css`
- OSS page integration: `index.html`

This matters because the sidebar is not scattered across many files. The main shell renderer already owns the left-side structure, and the CSS already owns the grid sizing.

## Recommended Interaction Model

Use a two-part structure:

1. `rail`
- narrow vertical strip
- always visible
- one button per section

2. `drawer`
- opens from the rail
- shows one section at a time
- closed by default on desktop and mobile

Expected behavior:

- click a rail item: open that section in the drawer
- click the same rail item again: close the drawer
- click a different rail item: swap drawer content
- press `Escape`: close drawer
- on mobile: drawer overlays the stage instead of shrinking it

## Proposed Information Architecture

Top-level rail items:

- `Session`
- `Map`
- `Tokens`
- `Turn`
- `Save`
- `AI`

Suggested grouping:

### Session

- brand
- reset view
- drag mode
- board status toggle

### Map

- choose map image
- fit map
- calibration
- grid and alignment controls

### Tokens

- add token
- clear tokens
- token list
- grouping controls

### Turn

- round
- current token
- token editor

### Save

- import/export
- autosave history

### AI

- Tactics Director
- packet/settings/apply/log

This is cleaner than keeping every current `details.panelSection` as a first-class permanent column.

## Why This Is Better Than More Accordions

Simple accordions do not solve the map-space problem. They still reserve the full sidebar width even when collapsed.

The rail + drawer split solves the actual problem:

- minimal persistent width
- one active section at a time
- predictable expansion model

## Phase 1: Shell Refactor In OSS

Implement only the shell mechanics first.

### Markup changes

In `packages/vtt-ui-shared/src/render-oss-vtt-shell.js`:

- replace the single `<aside class="sidebar">` with:
  - `<aside class="leftRail">`
  - `<aside class="contextDrawer">`
- move the current brand block into a compact rail header or top drawer section
- wrap each current sidebar section in a reusable drawer panel container
- keep existing IDs for controls inside each section whenever possible

Do not rename control IDs unless necessary. That minimizes JS breakage.

### CSS changes

In `packages/vtt-ui-shared/src/vtt-shell.css`:

- change `.app` from `grid-template-columns: 380px 1fr` to something like:
  - `64px minmax(0, auto) 1fr`
- add styles for:
  - `.leftRail`
  - `.railButton`
  - `.contextDrawer`
  - `.contextDrawer[data-open="false"]`
  - `.contextPanel`
- make the drawer width bounded and stable, for example around `320px` to `360px`
- ensure mobile collapses to rail + overlay drawer, not full permanent sidebar

### JS state changes

In `index.html`:

- add a small UI state object or fields for:
  - `activeDrawerSection`
  - `isDrawerOpen`
- wire rail buttons to:
  - open
  - close
  - swap active section
- add `Escape` handling

Do not rewrite the tactical runtime in phase 1. Only add shell state.

## Phase 2: Move Session Controls Out Of Map

Right now `Map & Grid` contains session-ish controls like:

- `Reset view`
- `Drag: Tokens`
- `Show board status overlay`

These should move to `Session`.

Reason:

- `Map` should focus on image/grid/alignment
- session-level viewport controls are conceptually separate

This is a small IA cleanup with real UX payoff.

## Phase 3: Promote AI To The Same Drawer Model

The current AI UI is a separate floating `details.aiDrawer` inside the stage.

That is workable now, but it conflicts with a cleaner left-side information model.

Recommended next step after the rail works:

- move AI into the same contextual drawer system
- keep the same tabs and IDs where possible
- stop floating a second major control surface over the stage

This is the most opinionated part of the proposal, so it should come after phase 1 proves the rail pattern.

## Phase 4: Mobile Behavior

On mobile:

- keep the rail narrow
- drawer becomes a full-height overlay panel
- stage remains the base layer
- tapping outside the drawer closes it

This should be handled in `vtt-shell.css`, not with a second mobile-only markup tree.

## Test Plan For OSS

Add UI regression coverage before moving large amounts of markup.

Likely test file:

- `backend/tests/vtt-ui.spec.js`

Add checks for:

- drawer closed by default
- rail buttons exist and are clickable
- clicking a rail button opens the correct section
- clicking a different rail button swaps sections
- clicking the same rail button closes the drawer
- `Escape` closes the drawer
- map stage width is larger than before when drawer is closed

Keep existing interaction tests for:

- map drag
- token drag
- AI panel behavior

If AI remains floating in phase 1, do not break those tests.

## Suggested Implementation Order

1. Add shell state and rail markup
2. Add drawer CSS and desktop layout
3. Keep current sections intact inside the drawer
4. Move viewport/session controls from `Map` to `Session`
5. Add regression tests
6. Validate manually in OSS
7. Only then mirror into SaaS

## Shared Follow-On Work Triggered By The Feedback

After the rail/drawer work is stable, the next shared-product follow-on items should be:

1. autosave and recovery hardening
- verify autosave writes reliably
- verify restore is obvious and trustworthy
- add explicit delete coverage for saved sessions/encounters

2. session naming lifecycle
- default session names should be human-readable
- rename must be obvious
- delete must be obvious

3. external character import seam
- define an import contract for third-party character data
- decide what minimum normalized shape the tactical runtime needs
- keep import parsing separate from the core tactical rules

4. encounter portfolio model
- define a reusable encounter record shape:
  - map
  - biome
  - roster
  - difficulty/notes
  - authored metadata
- keep this model shared if both OSS and SaaS will use it

5. collaboration seam planning
- joining someone else's live instance is not a pure UI feature
- it requires session membership and sync semantics
- the tactical core should expose stable session-join and presence seams without owning hosted auth

## SaaS Mirror Plan

After the OSS shell works, mirror the structure into `DrowVTT-SaaS`.

Expected mirror targets:

- hosted shell markup that consumes the shared package
- hosted shell CSS overrides if needed
- hosted UI tests for rail/drawer behavior

Rules for the SaaS mirror:

- prefer the OSS structure when there is a layout decision
- keep hosted-only account/billing navigation out of the tactical drawer
- preserve the current hosted product shell outside `/app`

The recent user feedback also implies these parity questions:

- session naming and delete affordances should feel the same unless SaaS has an intentional hosted exception
- autosave/recovery behavior should align unless the storage layer is intentionally different
- if encounter portfolio records exist in both products, their schema should be shared
- import normalization logic should be shared where possible, with SaaS-only auth/storage concerns kept outside the shared runtime

## Test Plan Additions From The Feedback

Beyond the shell regression tests, add or expand tests for:

### Unit tests

- default session naming rules
- save/delete slot lifecycle rules
- autosave enabled/disabled behavior
- autosave restore normalization
- encounter portfolio record normalization once that model exists
- external character import normalization once that seam exists

### UI tests

- autosave recovery remains visible and usable from the new `Session` section
- session rename and delete affordances are discoverable
- `Map` owns viewport and board tools
- `Session` owns naming and recovery controls

### OSS/SaaS parity checks

- shared section ownership (`Session` vs `Map`)
- autosave and restore behavior where expected
- session naming defaults
- any future shared encounter-portfolio or import contracts

## Recommended First Slice

Implement only this first:

- left rail
- one shared drawer
- `Session` and `Map` sections moved into it
- drawer closed by default

Do not migrate every panel at once. That creates too much breakage surface for too little learning.

If that first slice feels right, move the remaining sections into the same pattern.
