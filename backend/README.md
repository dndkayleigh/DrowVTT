# Backend

This folder contains the Node/Express backend, Playwright tests, benchmark harnesses, and saved benchmark artifacts for Drow VTT.

## Setup

Run everything from this folder:

```bash
npm install
```

Create `.env`:

```bash
OPENAI_API_KEY=your_key_here
PORT=3000
```

Start the backend:

```bash
npm start
```

The app will be served at `http://localhost:3000/` and the API endpoint is `http://localhost:3000/api/vtt`.

## Scripts

- `npm test` runs unit tests and the Playwright UI suite.
- `npm run test:packet` runs the packet scenario regression suite.
- `npm run bench:packet-latency` measures packet turn-around time for the selected scenarios and variants.
- `npm run bench:packet-latency-models` runs the latency sweep across the configured GPT-5-family models.
- `npm run bench:packet-accuracy` measures legality and tactical agreement against a reference turn.
- `npm run bench:packet-accuracy-models` runs the accuracy sweep across the configured models.

## AI Modes

The frontend exposes three named AI modes that the backend resolves in [`../data/ai-turn-strategy-utils.mjs`](../data/ai-turn-strategy-utils.mjs):

- `balanced`: `gpt-5` with `compact_moves5`
- `full`: `gpt-5` with `full`
- `fast`: `gpt-5.4-mini` with `compact_moves5`

Responses from [`server.js`](server.js) include `_timing.strategy`, `_timing.packet_variant`, and `_timing.model` for debugging and benchmark verification.

## Benchmark Artifacts

Generated summaries, raw logs, CSV exports, and screenshot galleries live in [`benchmark-results/`](benchmark-results/).
