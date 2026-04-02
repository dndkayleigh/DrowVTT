# Drow VTT

A lightweight browser VTT for grid combat with an OpenAI-backed tactical turn loop.

The app is intentionally small:
- a single-page frontend in [`index.html`](index.html)
- a Node/Express backend in [`backend/server.js`](backend/server.js)
- Playwright UI tests in [`backend/tests/vtt-ui.spec.js`](backend/tests/vtt-ui.spec.js)

## Start Here

This section is for people who do not normally code.

If you just want to run the app on your own computer, follow these steps in order.

### What you need

- This project folder on your computer
- An OpenAI API key
- Node.js installed

If you do not already have Node.js:

1. Go to `https://nodejs.org/`
2. Download the current `LTS` version
3. Install it with the default options
4. Restart your terminal after installation

### Step 1: Open the `backend` folder in a terminal

You want your terminal to be inside:

```text
DrowVTT/backend
```

Easy ways to do that:

1. Open the `DrowVTT` folder on your computer
2. Open the `backend` folder
3. Right-click inside that folder
4. Choose `Open in Terminal`, `Open PowerShell here`, or similar

### Step 2: Install the app

In that terminal, run:

```bash
npm install
```

This only needs to be done once, unless you update dependencies later.

### Step 3: Create the `.env` file

Inside the [`backend/`](backend/) folder, create a file named:

```text
.env
```

Put this inside it:

```bash
OPENAI_API_KEY=your_key_here
PORT=3000
```

Replace `your_key_here` with your real OpenAI API key.

### Step 4: Start the app

In the same terminal, run:

```bash
npm start
```

If it works, you should see:

```text
VTT backend listening on http://localhost:3000
```

### Step 5: Open the VTT

Open this in your web browser:

```text
http://localhost:3000/
```

### The next time you want to use it

You do not need to repeat everything.

Usually you only need to:

1. Open a terminal in `DrowVTT/backend`
2. Run `npm start`
3. Open `http://localhost:3000/`

### How to stop the app

Go back to the terminal where it is running and press:

```text
Ctrl+C
```

### Common problems

If `npm` is not recognized:

- Node.js is probably not installed correctly
- reinstall Node.js from `https://nodejs.org/`

If the page does not open in the browser:

- make sure the terminal is still running
- make sure you started the app from the `backend` folder
- make sure you opened `http://localhost:3000/`

If the VTT opens but `Run Tactics Director` fails:

- check that `OPENAI_API_KEY` in `backend/.env` is correct
- restart the server after changing `.env`

## What It Does

- Run a grid-based battlemap with pan/zoom and snap-to-grid tokens
- Load a map image and align it with scale, rotation, opacity, and nudge controls
- Track per-token stats like AC, HP, speed, notes, and statblocks
- Export the current board state as an AI turn packet
- Send that packet to an OpenAI-backed backend and auto-apply the response
- Show AI movement paths and a `Narrator's Cue`
- Enforce basic tactical rules:
  - only the current turn token can move
  - movement is limited by speed
  - token spaces cannot overlap
  - melee attacks must respect reach

## Token Positioning Rules

The VTT stores and displays token positions by occupied grid cells:

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

## Local Setup

This is the same setup as the section above, in shorter technical form.

### 1) Add backend env vars

Create [`backend/.env`](backend/.env):

```bash
OPENAI_API_KEY=your_key_here
PORT=3000
```

### 2) Install dependencies

If needed:

```bash
cd backend
npm install
```

### 3) Start the app

```bash
cd backend
npm start
```

Then open:

```text
http://localhost:3000/
```

The backend API is served at:

```text
http://localhost:3000/api/vtt
```

## Testing

Run the tests from [`backend/`](backend/):

```bash
npm test
```

This runs:

- a schema/unit test for the backend response contract
- the Playwright UI suite

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

- `Balanced`: `gpt-5` with the `compact_moves5` packet. This is the default and the best overall tactical benchmark option.
- `Full`: `gpt-5` with the `full` packet. Use this as the highest-context fallback.
- `Fast`: `gpt-5.4-mini` with the `compact_moves5` packet. Use this when responsiveness matters more than matching the strongest tactical baseline.

The backend resolves these modes server-side, and the response timing block includes the selected strategy and packet variant.

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
  "strategy": "balanced",
  "model": "gpt-5"
}
```

Notes:
- `strategy` is the preferred control and maps to a server-side model plus packet variant.
- `model` is still sent by the frontend for transparency and logging, but strategy selection now drives the intended mode.

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
5. Add tokens and set the current turn token.
6. Edit stats and statblocks in the Turn panel.
7. Use `Tactics Director` to run the AI or inspect the packet manually.
8. Review the returned move JSON, movement path, and `Narrator's Cue`.
9. Auto-apply it or paste/edit JSON manually.

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
