# Changelog

All notable user-facing changes to the open-source DrowVTT app are tracked here.

## 2026-04-02 Stable OSS Checkpoint

This is the current stable open-source milestone on `main`.

### Added

- Compact AI packet coverage tests for shorthand seed/demo statblocks such as the default goblin setup.
- Explicit abbreviated mechanics guidance for the `Narrator's Cue`, so summaries ask for short forms like `+4, 1d6+2 slashing`.
- A public tutorial wiki article covering map loading, calibration, token setup, AI turns, and AI mode changes.

### Changed

- `balanced` and `fast` compact AI packets now preserve more legal attack windows instead of over-pruning attack-capable move destinations.
- Save/export UX now favors file-based save flow for production-facing use:
  - visible `Download Save` / `Open Save`
  - autosave enabled by default
  - named save-slot controls hidden from the page while retained internally and in tests
- Save snapshots and autosaves now use IndexedDB-backed persistence for snapshot data, avoiding browser `localStorage` size failures on map-backed boards.
- The map/grid workflow has been streamlined around calibration-first setup, with reduced visual clutter and a cleaner top-of-sidebar layout.

### Fixed

- Legal ranged and melee attacks no longer disappear from compact `move5` packets in several practical board states.
- Seeded/demo goblin statblocks now parse attacks correctly even when they use shorthand action lines instead of SRD prose.
- Named save-slot restore tests now wait on the async IndexedDB restore path more reliably.

### Quality Notes

- Current backend test status at this checkpoint:
  - `43/43` unit tests passing
  - `32/32` Playwright tests passing

