# Drow VTT

A lightweight browser VTT for grid combat with an OpenAI-backed tactical turn loop.

The app is intentionally small:
- a single-page frontend in [`index.html`](/home/witschey/DrowVTT/index.html)
- a Node/Express backend in [`backend/server.js`](/home/witschey/DrowVTT/backend/server.js)
- Playwright UI tests in [`backend/tests/vtt-ui.spec.js`](/home/witschey/DrowVTT/backend/tests/vtt-ui.spec.js)

## What It Does

- Run a grid-based battlemap with pan/zoom and snap-to-grid tokens
- Load a map image and align it with scale, rotation, opacity, and nudge controls
- Track per-token stats like AC, HP, speed, notes, and statblocks
- Export the current board state as an AI turn packet
- Send that packet to an OpenAI-backed backend and auto-apply the response
- Enforce basic tactical rules:
  - only the current turn token can move
  - movement is limited by speed
  - token spaces cannot overlap

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
├── maps/
└── backend/
    ├── package.json
    ├── package-lock.json
    ├── playwright.config.js
    ├── server.js
    └── tests/
        └── vtt-ui.spec.js
```

## Local Setup

### 1) Add backend env vars

Create [`backend/.env`](/home/witschey/DrowVTT/backend/.env):

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

Run the UI suite from [`backend/`](/home/witschey/DrowVTT/backend):

```bash
npm test
```

Current Playwright coverage includes:
- page load
- 1x1 / 2x2 / 3x3 token snapping
- resizing the current token
- manual AI JSON application
- backend auto-apply flow
- movement-rule rejection
- map control updates

## Backend Contract

### Request

The frontend posts a small payload to the backend:

```json
{
  "aiExport": "SYSTEM: You are the tactical controller ...",
  "model": "gpt-4.1-mini"
}
```

### Response

The backend returns strict JSON in this shape:

```json
{
  "moves": [{"token":"Name","to":[x,y]}],
  "actions": [{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"..."}],
  "end_turn": true
}
```

Notes:
- `token` is matched by token name
- `to` uses top-left occupied cell coordinates
- the frontend can auto-apply the response

## Recommended Workflow

1. Start the backend with `npm start`.
2. Open `http://localhost:3000/`.
3. Load a map image if you want one.
4. Align the map using the controls above the board.
5. Add tokens and set the current turn token.
6. Edit stats and statblocks in the Turn panel.
7. Copy the AI packet or send it directly to the backend.
8. Review or auto-apply the returned move JSON.

## Security Notes

- Never put `OPENAI_API_KEY` in the frontend
- Lock down CORS before production use
- Add auth and rate limiting if you expose the backend publicly

## Map Credit

The included example map is:

**"The Dreadwarren"** by **Dyson Logos**

Source:
https://dysonlogos.blog/2025/08/the-dreadwarren/

Please retain attribution if you redistribute the included map.

## License

See [`LICENSE`](/home/witschey/DrowVTT/LICENSE).
