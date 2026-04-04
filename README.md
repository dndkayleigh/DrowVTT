# Drow VTT

A lightweight browser VTT for grid combat with an OpenAI-backed tactical turn loop.

The app is intentionally small:
- a single-page frontend in [`index.html`](index.html)
- a Node/Express backend in [`backend/server.js`](backend/server.js)
- Playwright UI tests in [`backend/tests/vtt-ui.spec.js`](backend/tests/vtt-ui.spec.js)

## Current Release

The current stable OSS checkpoint is summarized in [`CHANGELOG.md`](CHANGELOG.md).

Recent highlights:

- Tactics Director now supports `Single (Fast)`, `Single (Tactical)`, and `Group (Tactical)`
- explicit monster-group selection is now built into the OSS UI
- save/export UX is centered on file-based saves plus autosave
- map setup is cleaner and calibration-first

If you want a practical walkthrough of loading a board, selecting monsters, and running AI turns, start with [TUTORIAL.md](TUTORIAL.md).

## Start Here

This section is for people who do not normally code. If you just want to run the app on your own computer, follow these steps.

### What you need

- This project folder on your computer
- An OpenAI API key
- Node.js installed

If you do not already have Node.js: go to `https://nodejs.org/`, download the current `LTS` version, install it with the default options, then restart your terminal.

### 1. Open the `backend` folder in a terminal

Your terminal should be inside:

```text
DrowVTT/backend
```

One easy path: open the `DrowVTT` folder, open `backend`, right-click inside it, then choose `Open in Terminal`, `Open PowerShell here`, or similar.

### 2. Install the app

Run:

```bash
npm install
```

This only needs to be done once, unless you update dependencies later.

### 3. Create the `.env` file

Inside [`backend/`](backend/), create a file named `.env` with:

```bash
OPENAI_API_KEY=your_key_here
PORT=3000
```

Replace `your_key_here` with your real OpenAI API key.

### 4. Start the app

In the same terminal, run:

```bash
npm start
```

If it works, you should see:

```text
VTT backend listening on http://localhost:3000
```

### 5. Open the VTT

Open this in your web browser:

```text
http://localhost:3000/
```

### Next time

Usually you only need to:

1. Open a terminal in `DrowVTT/backend`
2. Run `npm start`
3. Open `http://localhost:3000/`

### How to stop the app

Go back to the terminal where it is running and press `Ctrl+C`.

### Common problems

- If `npm` is not recognized, Node.js is probably not installed correctly; reinstall it from `https://nodejs.org/`.
- If the page does not open, make sure the terminal is still running, you started the app from `backend`, and you opened `http://localhost:3000/`.
- If the VTT opens but `Run Tactics Director` fails, check `OPENAI_API_KEY` in `backend/.env` and restart the server after changing `.env`.

## What It Does

- Run a grid-based battlemap with pan/zoom and snap-to-grid tokens
- Load a map image and align it with scale, rotation, opacity, and nudge controls
- Track per-token stats like AC, HP, speed, notes, and statblocks
- Export the current board state as an AI turn packet
- Send that packet to an OpenAI-backed backend and auto-apply the response
- Show AI movement paths and a `Narrator's Cue`
- Enforce basic tactical rules: only the current turn token can move, movement is limited by speed, token spaces cannot overlap, and melee attacks must respect reach

## Tutorial

For a play-focused walkthrough, see [TUTORIAL.md](TUTORIAL.md).

## Token Positioning Rules

- `1x1` creatures center on the middle of a tile
- `2x2` creatures center on the intersection of four tiles
- `3x3` creatures center on the middle of the center tile
- AI/export coordinates use the top-left occupied cell for multi-cell creatures

## Repository Layout

```text
.
├── index.html
├── data/
├── maps/
└── backend/
    ├── package.json
    ├── package-lock.json
    ├── playwright.config.js
    ├── server.js
    ├── vtt-response-schema.js
    └── tests/
        ├── vtt-schema.test.js
        └── vtt-ui.spec.js
```

## Quick Technical Setup

Create [`backend/.env`](backend/.env):

```bash
OPENAI_API_KEY=your_key_here
PORT=3000
```

```bash
cd backend
npm install
npm start
```

Then open `http://localhost:3000/`.

The backend API is served at `http://localhost:3000/api/vtt`.

## Testing

Run the tests from [`backend/`](backend/):

```bash
npm test
```

This runs the schema/unit tests plus the Playwright UI suite.

Current coverage includes:
- page load
- 1x1 / 2x2 / 3x3 token snapping
- resizing the current token
- manual AI JSON application
- backend auto-apply flow
- movement-rule rejection
- melee reach validation
- map control updates

Packet-specific checks are also available:

```bash
npm run test:packet
```

This runs the benchmark scenario packet suite without starting Playwright.

## AI Modes

The `Tactics Director` settings panel now exposes three AI modes:

- `Single (Fast)`: `gpt-5.4-mini` with the `compact_moves5` packet. Use this when responsiveness matters more than matching the strongest tactical baseline.
- `Single (Tactical)`: `gpt-5` with the `full` packet. This is the default and the strongest single-monster tactical read.
- `Group (Tactical)`: `gpt-5` with the `full` packet. This keeps the strongest tactical read for coordinated group turns too.

The backend resolves these modes server-side, and the response timing block includes the selected strategy and packet variant.

### Selection Behavior

- `Single (Fast)` and `Single (Tactical)` act on exactly one AI-controlled token.
- Clicking another AI-controlled token switches focus to that token.
- `Ctrl`-click on Windows/Linux or `Cmd`-click on macOS adds or removes AI-controlled monsters from the active selection.
- When more than one AI-controlled monster is selected, Tactics Director automatically switches to `Group (Tactical)`.
- Clicking a non-AI-controlled token such as a PC clears the active monster group.

### Group Workflow

You can build a group in either of these ways:

1. `Ctrl`/`Cmd`-click multiple AI-controlled monsters on the board.
2. Use `Pick` in the token list, then click `Set Group From Selection`.

Once more than one valid monster is selected, `Run Tactics Director` applies the grouped turn to the active monster group instead of only the current single monster.

## Benchmarking

Benchmark commands live in [`backend/package.json`](backend/package.json) and should be run from [`backend/`](backend/):

```bash
npm run bench:packet-latency
npm run bench:packet-latency-models
npm run bench:packet-accuracy
npm run bench:packet-accuracy-models
```

All benchmark scripts require `OPENAI_API_KEY` in [`backend/.env`](backend/.env).

Benchmark artifacts and summaries are stored in [`backend/benchmark-results/`](backend/benchmark-results/), including:

- latency sweep summaries
- accuracy sweep summaries
- scenario screenshots and gallery markdown
- consolidated benchmark recommendations

## Roadmap

- Prompt caching for GPT-5 latency reduction. Split the AI turn packet into stable and volatile sections so repeated battlefield context, rules text, and static token data can be cached instead of re-sent every turn. The goal is to cut perceived turn time and reduce token usage when using slower but smarter GPT-5-class models.
- Map/view control cleanup. Rework where controls like `Fit map`, `Reset view`, drag mode, and map-alignment actions live so they take up less board real estate and feel more intentional during play.
- Storage hardening for saved boards. Detect `localStorage` quota issues earlier, surface friendlier errors, and handle large embedded map images more gracefully.
- Save-slot polish. Add rename support, clearer timestamps, and a stronger “current board differs from saved slot” signal.
- Autosave polish. Improve autosave history labels, make restore intent clearer, and decide whether autosave should be enabled by default.
- Token UX cleanup. Make common token actions like art editing, selection, and future status markers faster to reach during play.
- Better tactical packet shaping. Reduce unnecessary prompt bulk while keeping enough board context for reliable movement and action choices.

## Backend Contract

### Request

The frontend posts a small payload to the backend:

```json
{
  "aiExport": "SYSTEM: You are the tactical controller ...",
  "strategy": "single_tactical",
  "model": "gpt-5"
}
```

Notes:
- `strategy` is the preferred control and maps to a server-side model plus packet variant.
- `model` is still sent by the frontend for transparency and logging, but strategy selection now drives the intended mode.
- Canonical strategies are `single_fast`, `single_tactical`, and `group_tactical`.
- Older aliases remain accepted for backward compatibility, but new integrations should use the canonical names above.

### Response

The backend returns strict JSON in this shape:

```json
{
  "summary": "Short narrator cue",
  "moves": [{"token":"Name","to":[x,y],"path":[[x1,y1],[x2,y2]],"rationale":"..."}],
  "actions": [{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"...","rationale":"...","attack_kind":"melee|ranged|null","range_ft":5}],
  "end_turn": true
}
```

Notes:
- `token` is matched by token name
- `to` uses top-left occupied cell coordinates
- `path` is used to draw the route on the board
- `summary` is shown in the `Narrator's Cue` area
- the frontend can auto-apply the response
- the frontend validates movement and melee reach

## Recommended Workflow

1. Start the backend with `npm start`.
2. Open `http://localhost:3000/`.
3. Load a map image if you want one.
4. Align the map using the controls above the board.
5. Add tokens and choose which side `AI controls`.
6. Click a monster to focus a single turn, or `Ctrl`/`Cmd`-click multiple monsters to build a tactical group.
7. Edit stats and statblocks in the Turn panel.
8. Use `Tactics Director` to run the AI or inspect the packet manually.
9. Review the returned move JSON, movement paths, and `Narrator's Cue`.
10. Auto-apply it or paste/edit JSON manually.

## Security Notes

- Never put `OPENAI_API_KEY` in the frontend
- Lock down CORS before production use
- Add auth and rate limiting if you expose the backend publicly

## SRD License

This project includes material based on the Dungeons & Dragons System Reference Document 5.1 (`SRD 5.1`) by Wizards of the Coast LLC.

The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License (`CC BY 4.0`).

Attribution statement:

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Links:

- Official SRD page: https://dnd.wizards.com/resources/systems-reference-document
- CC BY 4.0 license: https://creativecommons.org/licenses/by/4.0/legalcode

## Map Credit

The included example map is:

**"The Dreadwarren"** by **Dyson Logos**

Source:
https://dysonlogos.blog/2025/08/the-dreadwarren/

Please retain attribution if you redistribute the included map.

## License

See [`LICENSE`](LICENSE).
