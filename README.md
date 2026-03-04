# AI Tactical VTT

![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-experimental-blue)
![Built With](https://img.shields.io/badge/built%20with-JavaScript-yellow)
![AI Ready](https://img.shields.io/badge/AI-assisted-combat-purple)

A lightweight **AI-assisted virtual tabletop for tactical D&D combat**.

This tool exports the current battle state as a structured prompt so an AI model can **control monsters, PCs, or both**, returning JSON actions that can be applied directly to the battlefield.

Unlike traditional VTTs, this project treats the AI as an **active tactical combatant**.

---

# Demo Concept

AI Tactical VTT allows combat like this:

1. Export combat state
2. Ask an AI what the monster should do
3. Paste the response
4. The battlefield updates automatically

Example AI response:

```json
{
  "moves": [{"token":"Goblin A","to":[4,6]}],
  "actions":[{"token":"Goblin A","type":"attack","target":"Aria"}],
  "end_turn": true
}
```

---

# Features

## Battle Map System

- Upload any battle map image
- Translate, rotate, and scale the map
- Align pixel grids to the VTT grid
- Adjustable grid size
- Map opacity controls

## Token System

- PC / NPC / Monster tokens
- Drag-and-drop movement
- Snap-to-grid positioning
- Multi-cell creatures
- Color coding
- Selection independent from turn order

## Combat Metadata

Each token supports:

- AC
- HP
- Speed
- Notes
- Full statblock text

Statblocks are automatically included in AI prompts.

## Turn Control

Combat state includes:

- Round number
- Current turn token
- Which side AI controls
  - PCs
  - Monsters
  - Both
  - None

## AI Combat Integration

The system generates a **complete combat prompt** including:

- token locations
- token sizes
- combat stats
- map information
- acting creature statblock
- strict output schema

AI responses can be pasted back and **applied automatically**.

---

# Architecture

The project uses a **modular ES-module architecture**.

```
src/
 ├── app/
 │   ├── App.js
 │   └── State.js
 │
 ├── models/
 │   ├── Token.js
 │   └── MapLayer.js
 │
 ├── ui/
 │   ├── CanvasStage.js
 │   ├── Sidebar.js
 │   ├── MapPanel.js
 │   ├── TokenList.js
 │   ├── TurnPanel.js
 │   └── ExportPanel.js
 │
 ├── services/
 │   ├── AiExport.js
 │   ├── Backend.js
 │   └── Apply.js
 │
 └── utils/
     ├── geom.js
     └── dom.js
```

Key components:

| Component | Purpose |
|-----------|---------|
| App | Application controller |
| State | Reactive state store |
| CanvasStage | Map and token rendering |
| Sidebar | UI controls |
| AiExport | AI prompt generation |
| Apply | Applies AI JSON actions |

---

# Installation

No build system required.

Clone the repo:

```
git clone https://github.com/yourname/ai-tactical-vtt.git
cd ai-tactical-vtt
```

Run a simple local server:

```
python -m http.server
```

Open:

```
http://localhost:8000
```

Or simply open:

```
index.html
```

---

# How to Use

### 1. Load a Map

Upload a battle map and align it with the grid.

### 2. Add Tokens

Create PCs and monsters.

### 3. Select Current Turn

Choose which creature is acting.

### 4. Export AI Turn Packet

Copy the generated prompt.

### 5. Ask an AI

Paste the prompt into ChatGPT or another model.

### 6. Apply Response

Paste the JSON response into the **Apply panel**.

The system will:

- move tokens
- log actions
- end the turn

---

# Example Use Cases

### AI-Controlled Monsters

Let the AI decide enemy tactics.

### Solo DM Assistant

Use AI to help run combat.

### AI vs AI Battles

Set AI control to **Both**.

### Encounter Simulation

Use AI to test encounter balance.

---

# Screenshots

*(Add screenshots here later)*

```
docs/screenshot-map.png
docs/screenshot-ai-export.png
docs/screenshot-combat.png
```

---

# Roadmap

Planned improvements:

- Initiative order tracker
- Difficult terrain
- Line-of-sight calculations
- Area-of-effect templates
- Fog of war
- Roll automation
- Multiplayer synchronization
- AI combat memory

---

# Design Goals

This project is designed to be:

**AI-first**

Built around structured interaction with AI.

**Lightweight**

No frameworks or build tools.

**Flexible**

Works with any battle map.

**Extensible**

Easy to add new modules.

---

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
