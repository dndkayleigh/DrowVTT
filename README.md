# Web VTT + AI Turn Controller (Prototype)

A lightweight, browser-based **virtual tabletop (VTT)** for grid combat with **snap-to-grid tokens**, **map-image alignment tools**, and a **backend endpoint** that can call **ChatGPT/OpenAI** to produce **structured, auto-applicable turn decisions**.

This repo is intentionally minimal: a single-page frontend you can open in the browser, plus an optional Node/Express backend that relays your VTT state to an AI model and returns an `apply` JSON payload.

---

## ✨ Highlights

- **Grid-based battlemap**
  - Adjustable grid size (px)
  - Snap modes (center or top-left)
  - Camera pan (Space + drag) and zoom (wheel)

- **Map image alignment**
  - Load a map image as a layer
  - Translate / nudge the map to align embedded pixel grids
  - Optional map **scale**, **rotation**, and **opacity** controls

- **Tokens**
  - PC / NPC / Monster tokens
  - Snap-to-grid movement
  - Simple per-token fields: **AC**, **HP**, **Speed**, **Notes**, **Statblock**
  - “Current turn token” is linked to selection

- **AI integration**
  - Frontend generates a **turn packet** (prompt) including map + token state
  - Backend calls ChatGPT/OpenAI and returns **strict JSON**
  - Frontend can **auto-apply** AI responses via a checkbox

---

## Repository layout (suggested)

```
.
├─ frontend/
│  └─ index.html        # the VTT single-file UI (paste the provided HTML here)
└─ backend/
   ├─ server.js         # Express API endpoint that calls OpenAI
   ├─ package.json
   └─ .env              # OPENAI_API_KEY, PORT
```

You can also keep everything in one folder if you prefer.

---

## ✅ Quick start (Frontend only)

1. Create `frontend/index.html` and paste in the full VTT HTML you generated.
2. Open it directly:
   - Double-click `index.html`, or
   - Use a static server (recommended):

```bash
cd frontend
python -m http.server 8080
# then open http://localhost:8080
```

Why a static server? Browsers sometimes restrict local `file://` behavior, and serving over `http://` avoids headaches.

---

## 🧠 AI backend (Node/Express)

### 1) Install

```bash
mkdir -p backend
cd backend
npm init -y
npm install express cors openai dotenv
```

> If you use `import ... from`, set `"type": "module"` in `backend/package.json`.

### 2) Add environment variables

Create `backend/.env`:

```bash
OPENAI_API_KEY=YOUR_KEY_HERE
PORT=3000
```

### 3) Create `backend/server.js`

Use your backend code that:
- accepts `POST /api/vtt`
- reads `req.body.aiExport` (the prompt/turn packet)
- calls OpenAI
- returns a strict JSON response

Example behavior:
- request: VTT state JSON
- response: `{"moves":[...],"actions":[...],"end_turn":true}`

### 4) Run

```bash
cd backend
node server.js
```

Backend will listen at:

- `http://localhost:3000/api/vtt`

---

## 🔌 Connecting the frontend to the backend

In the VTT UI:

1. Set **Backend endpoint** to:

```
http://localhost:3000/api/vtt
```

2. Click **Send state to backend**
3. The UI will:
   - receive the JSON response
   - paste it into “Apply AI JSON”
   - optionally auto-apply it if **Auto-apply AI response** is checked

---

## 📦 API contract

### Request (from VTT to backend)

Your frontend sends a JSON payload similar to:

```json
{
  "gridSize": 64,
  "snapMode": "center",
  "view": { "zoom": 1, "panX": 0, "panY": 0 },
  "map": { "width": 2000, "height": 1400, "offX": 0, "offY": 0, "scale": 1, "rot": 0, "opacity": 1 },
  "tokens": [
    { "name": "Aria", "type": "PC", "cell": { "x": 10, "y": 12 }, "ac": 15, "hp": "18/18", "speed": 30 }
  ],
  "turn": { "aiControls": "Monsters", "round": 1, "currentTurnTokenId": "abc123" },
  "aiExport": "SYSTEM: You are the tactical controller ..."
}
```

### Response (from backend to VTT)

Must match:

```json
{
  "moves": [{"token":"Name","to":[x,y]}],
  "actions": [{"token":"Name","type":"attack|dash|dodge|hide|disengage|other","target":"Name|null","details":"..."}],
  "end_turn": true
}
```

The VTT applies moves by matching `token` to token **name**.

> Tip: Token names should be unique to avoid ambiguity.

---

## 🔐 Security notes

- **Do not** put API keys in the frontend.
- Add **CORS allowlist** in production (avoid `*`).
- Consider adding an **auth token** header from the frontend to your backend.
- Add rate limiting (per-IP or per-session).

---

## 🧭 Recommended workflow (maps with embedded grids)

1. Load the map image
2. Set grid size (px) to your desired VTT cell size
3. Switch to **Drag: Map**
4. Drag/nudge until the embedded grid lines up
5. If needed, adjust:
   - **Map scale** to match spacing
   - **Map rotation** if the scan is slightly tilted
   - **Opacity** to see grid alignment better

---

## 🧰 Troubleshooting

### “Send failed: CORS …”
- Your backend must enable CORS for your frontend origin.
- For local dev, `app.use(cors())` is fine.
- For production, use an allowlist.

### “Invalid JSON” in Apply
- Ensure your backend always returns valid JSON.
- If the model occasionally outputs text, enforce structured output (JSON schema) or add a server-side validation/retry.

### Tokens don’t move
- Confirm response token names match VTT token names exactly.
- Confirm coordinates are integer grid cells.

---

## Roadmap ideas

- Initiative tracker + turn order advancement
- AoE templates, measurement ruler, and movement validation
- Walls/doors + line-of-sight and cover
- Condition tracking and damage application
- Multi-user realtime sync (WebSocket/WebRTC)
- “2-click calibration” for embedded grids (auto scale/rotation)

---

## License

Choose one:
- MIT (most common for prototypes)
- Apache-2.0 (explicit patent grant)
- Proprietary (if you intend to keep it closed)

If you want, tell me which license you prefer and I’ll add the exact `LICENSE` file.

---

## Credits

Built as a rapid prototype for AI-assisted grid combat and map alignment.

## Map Credits

The example map included in this repository is:

**"The Dreadwarren"** by **Dyson Logos**

Source:  
https://dysonlogos.blog/2025/08/the-dreadwarren/

© Dyson Logos

Dyson Logos generously provides many of his maps for **commercial and non-commercial use with attribution**.  
This project includes the map as an example battle map for testing and demonstration purposes.

If you use or redistribute this project with the included map, please retain this attribution.

Please consider supporting Dyson Logos and his work:

- Website: https://dysonlogos.blog  
- Patreon: https://www.patreon.com/dysonlogos


# License

MIT License

Free for personal and commercial use.

---

# Why This Exists

Large language models are extremely good at **tactical reasoning**, but there is no good interface for connecting them to tabletop combat.

This project explores a new idea:

**AI as a tactical participant in tabletop gameplay.**

---

⭐ If you find this project interesting, consider starring the repository!
