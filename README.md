# Drow VTT

A lightweight browser VTT for grid combat with an OpenAI-backed tactical turn loop.

This repository is the open-source lightweight prototyping environment for DrowVTT. It is meant to be run locally on your own computer, and it is useful if you want to inspect the code, experiment with tactical VTT ideas, or contribute to the project.

If you want to use the tool right now and are not interested in coding or local setup, use the full-service hosted environment instead:

https://drowvtt-saas-production.onrender.com

DrowVTT is currently in early alpha. If you are interested in joining the preview, please email dndkayleigh@gmail.com.

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

The `Tactics Director` has two families of AI modes:

- LLM modes call the backend and use an OpenAI model to return a strict JSON turn plan.
- Local controller modes run inside the browser through the portable tactical-controller layer and do not call OpenAI.

Every mode ultimately feeds the same VTT apply contract: a summary, zero or more token moves, zero or more actions, and an optional end-turn flag. This is intentional. The board should not need separate application logic for each tactical architecture.

### LLM Modes

`Single (Fast)`

- Uses `gpt-5.4-mini`.
- Sends the compact `compact_moves5` packet.
- Acts on one current AI-controlled token.
- Best for quick iteration, lower latency, and smoke-testing the turn loop.
- Tradeoff: it has less battlefield context than the heavier tactical packets, so it is more likely to miss nuanced positioning.

`Single (Tactical)`

- Uses `gpt-5`.
- Sends the full tactical packet.
- Acts on one current AI-controlled token.
- This is the default high-context single-actor LLM mode.
- It gives the model the broadest board read, but the model is still generating the final turn plan directly.

`Group (Tactical)`

- Uses `gpt-5`.
- Sends the full tactical packet plus active group context.
- Acts on the selected AI-controlled group.
- Use this when several monsters should coordinate in one activation.
- The prompt includes the active tactical group and group-member statblocks, but this is still a direct LLM tactical plan rather than a deterministic candidate-ranking pass.

`LLM Supervisor + Tactical (Single)`

- Uses `gpt-5`.
- Sends `full_moves5_attacks6`.
- Acts on one current AI-controlled token.
- Adds a deterministic `SUPERVISOR CANDIDATE SET` to the packet before the LLM is asked to choose.
- The candidate set is filtered for movement budget, occupied final spaces, blocking movement edges, and ranged line of sight.
- The LLM is instructed to rank the listed legal candidates, not invent a new move, target, attack, or path.
- This is the preferred LLM mode when debugging legality and tactical quality together because the model’s job is narrower and easier to inspect.

`LLM Supervisor + Tactical (Group)`

- Uses `gpt-5`.
- Sends `full_moves5_attacks6`.
- Acts on the selected AI-controlled group.
- Adds per-token legal candidate sections for the grouped actors.
- The LLM supervisor ranks a combined group plan from those candidates and is told to avoid redundant crowding where alternatives exist.
- This is the safest current LLM option for coordinated monster turns because deterministic code supplies the legal option space and the LLM chooses among those options.

### Local Controller Modes

`Scripted Baseline`

- Runs locally with no model call.
- Uses behavior rules and deterministic candidate generation.
- Useful as a lower-bound tactical baseline: fast, repeatable, and easy to test.
- It should prefer legal attacks when available, route around blocking edges, and avoid occupied final destinations.
- Tradeoff: it is intentionally simple and can still make tactically bland decisions.

`Utility Baseline`

- Runs locally with no model call.
- Generates bounded legal candidates and scores them with deterministic utility features.
- Useful for inspecting whether the tactical features are pointing in the right direction.
- It emits structured logs with the selected candidate and top alternatives, which makes it easier to debug why it attacked, moved, advanced, retreated, or held.
- Tradeoff: the scoring model is hand-authored and will only be as good as the current features and weights.

`Supervisor + Scripted (Single)`

- Runs locally with no model call.
- Generates scripted candidates, then passes them through a deterministic supervisor/ranker for one actor.
- Intended as a bridge between simple scripted behavior and stronger tactical selection.
- Useful when the baseline generator can produce a reasonable set of options but needs a better selection pass.

`Supervisor + Scripted (Group)`

- Runs locally with no model call.
- Generates grouped scripted candidates and ranks them with a deterministic supervisor.
- Uses group context and reservation-aware planning to reduce collisions and redundant destinations.
- Intended for testing coordinated monster activations before relying on an LLM supervisor.

`Human Controller`

- Exists in the portable tactical-controller package for evaluation and replay parity.
- It is not exposed as a normal OSS UI option because humans can already move tokens directly on the board.
- Keeping it in the controller contract lets future replay/evaluation tooling compare human decisions and AI decisions through the same input/output shape.

### Selection Behavior

- Single modes act on exactly one AI-controlled token.
- Clicking another AI-controlled token switches focus to that token.
- `Ctrl`-click on Windows/Linux or `Cmd`-click on macOS adds or removes AI-controlled tokens from the active selection.
- On mobile/tablet, use `Group Select` in the token list when modifier-click is not available.
- When more than one AI-controlled monster is selected from a non-group mode, Tactics Director automatically switches to `Group (Tactical)`.
- If you are already in a group mode, such as `LLM Supervisor + Tactical (Group)` or `Supervisor + Scripted (Group)`, multi-selection preserves that selected group mode instead of switching away from it.
- Clicking a non-AI-controlled token such as a PC clears the active monster group unless AI controls are configured to allow that token type.

### Group Workflow

You can build a group in either of these ways:

1. `Ctrl`/`Cmd`-click multiple AI-controlled monsters on the board.
2. Use `Pick` in the token list, then click `Set Group From Selection`.

Once more than one valid AI-controlled token is selected, group modes apply the turn to the active group instead of only the current single token. Group modes require an explicit group before running.

### Legality, Blocking, And Debugging

- Manual human movement is intentionally permissive so a GM can fix board state quickly.
- Tactical/AI movement is constrained by speed, occupied final spaces, and blocking edges.
- Ranged tactical attacks are blocked by blocking edges that cross line of sight.
- The board draws movement trails and ranged line-of-sight debug overlays so illegal or suspicious choices can be inspected visually.
- LLM supervisor packets include deterministic legal candidates; if an LLM supervisor returns something outside that candidate set, that is a model-following failure rather than a candidate-generation failure.
- Local controller logs are structured and should explain the selected candidate plus top alternatives. These logs are the first place to look when the scripted or utility baseline makes a questionable choice.

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
