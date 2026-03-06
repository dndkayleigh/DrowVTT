# Drow VTT 
## A lightweight open source VTT and tactical AI controller

A lightweight, browser-based **virtual tabletop (VTT)** for grid combat with **snap-to-grid tokens**, **map-image alignment tools**, and a **backend endpoint** that can call **ChatGPT/OpenAI** to produce **structured, auto-applicable turn decisions**.

This repo is intentionally minimal: a single-page frontend you can open in the browser, plus an optional Node/Express backend that relays your VTT state to an AI model and returns an `apply` JSON payload.

## Why Build an Open-Source Tactical VTT?

Lately I’ve been experimenting with different ways people run tabletop RPGs when a full group isn’t available. One style that really influenced this project is **solo RPG play**, where a single player generates story and encounters using inspiration tables or tools like the **Mythic Game Master Emulator**.

In some versions of this style, the solo player effectively becomes both **DM and player**, simulating both sides of the game. I found this approach surprisingly useful when trying to learn new campaign modules.

## Learning a Module by Simulation

While preparing to run *Out of the Abyss*, I tried simulating encounters ahead of time to understand how they might unfold. The opening prison escape sequence includes many NPC prisoners and requires juggling their motivations, abilities, and possible escape strategies.

What I discovered is that the module is difficult to run tactically from the book alone. Information is spread across multiple pages, and there isn’t always a clear structure for how certain NPCs should behave during combat.

When I began simulating both sides of the encounter, the tactical portion quickly became awkward. Running combat while also deciding what the enemies should do felt like **playing chess against yourself**. It works, but it isn’t very satisfying.

That led to a simple question:

**Could AI handle the tactical decisions instead?**

## Treating the Battlemap Like a Board Game

A tactical battlemap is essentially a grid with pieces on it. If the AI knows:

* the grid
* where every creature is located
* what abilities each creature has

then it has everything it needs to make a tactical decision.

To enable this, the board state is exported as a **structured JSON schema** describing the map, tokens, and stat blocks. That payload can be sent to an AI model, which returns a structured response describing how a creature should move and act.

Initially I experimented by copying the board state into a chat window and pasting the response back into the VTT. It worked—but it was clunky.

## Building the AI Loop

The next step was adding a simple backend pipeline:

1. The VTT exports the board state.
2. The backend sends it to the **OpenAI API**.
3. The model returns a tactical decision.
4. The VTT updates the board automatically.

With that loop in place, the AI can effectively **control monsters or NPCs in combat**.

## Trying It at the Table

My players convinced me to try the prototype during one of our sessions. We were running a **Pirate Borg** campaign, so I swapped the monster stat blocks to match that system.

The VTT doesn’t roll dice—players still roll their own. The board is simply shared over **Google Meet**, and players tell me where they want to move and what actions they take.

This setup actually worked very smoothly.

One interesting feature that emerged is that the AI can explain its reasoning. For example, if a goblin prefers ranged tactics, the system can include a note like:

> “The goblin retreats to maintain distance and fires its shortbow.”

These explanations help players understand why enemies act the way they do, making the AI feel less like a black box.

## Why Open Source?

Tabletop gaming thrives on experimentation. Every group plays differently, and no single VTT fits every table.

By keeping the system **open source**, the important pieces remain accessible:

* the grid-based board
* the structured game-state schema
* the AI decision pipeline

That makes it easy for others to experiment with different playstyles, rule systems, and AI behaviors.

At its core, the idea is simple:

a board, a set of pieces, and an AI that can decide how those pieces move.

And sometimes that’s all you need to answer a surprisingly practical question:

**What happens when you let AI move the goblins?**


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
├─ index.html   # the VTT single-file UI
└─ frontend/
   ├─ server.js         # Express API endpoint that calls OpenAI
   ├─ package.json
   └─ .env              # OPENAI_API_KEY, PORT
```

You can also keep everything in one folder if you prefer.

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

### 3) Run

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

The frontend sends a JSON payload similar to:

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
