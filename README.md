AI Tactical VTT

A lightweight AI-assisted virtual tabletop for tactical D&D combat.

This tool exports the current battle state to an AI model and allows the AI to control monsters, PCs, or both through structured JSON actions applied directly to the board.

It is designed for fast tactical encounters, not as a full VTT replacement.

Core Idea

Traditional virtual tabletops focus on managing tokens and maps.

AI Tactical VTT adds a new concept:

The combat state can be exported as a structured prompt so an AI model can:

decide movement

choose attacks

use abilities

end its turn

The AI returns structured JSON that can be applied directly to the battlefield.

Example response:

{
  "moves": [{"token":"Goblin A","to":[4,6]}],
  "actions":[{"token":"Goblin A","type":"attack","target":"Aria"}],
  "end_turn": true
}

This enables AI-controlled combatants or even fully AI-driven battles.

Features
Battle Map System

Upload any battle map image

Translate, rotate, and scale the map

Align pixel grids to the VTT grid

Adjustable grid size

Map opacity controls

Token System

PC / NPC / Monster tokens

Drag and drop movement

Snap-to-grid positioning

Multi-cell creatures

Color coding

Independent selection vs turn token

Combat Metadata

Each token supports:

AC

HP

Speed

Notes

Full statblock text

Statblocks are automatically included in AI turn prompts.

Turn Control

Combat state includes:

Round number

Current turn token

Which side the AI controls

PCs

Monsters

Both

None

AI Combat Integration

The system generates a complete combat prompt containing:

token positions

token sizes

combat stats

map information

acting creature statblock

strict output schema

AI responses can then be applied directly to the board.

JSON Action Application

Paste an AI response and the system will:

move tokens

log actions

end the turn

Architecture

The project uses a modular ES-module architecture.

src/
 app/        Application state + orchestration
 models/     Token and map data models
 ui/         Canvas rendering and panels
 services/   AI export + backend integration
 utils/      Geometry + DOM helpers

Key components:

Module	Responsibility
App	Main application controller
State	Reactive state management
CanvasStage	Map + token rendering
Sidebar	UI controls
AiExport	AI prompt generation
Apply	Apply AI actions to game state
Design Goals

This project was built with several principles:

AI-First Combat

The UI is designed around exporting and applying structured AI decisions.

Lightweight

No frameworks, no build tools.

Just:

HTML

CSS

modern JavaScript modules

Tactical Focus

Optimized for combat encounters, not full campaigns.

Flexible Map Alignment

Many battle maps have embedded grids that don't match VTT grids.
This tool allows fine control over map scaling, rotation, and offsets.

Installation

No installation required.

Simply open the project.

index.html

or run a lightweight server:

python -m http.server

Then open:

http://localhost:8000
How to Use
1. Load a Battle Map

Upload a map image and align it to the grid.

2. Add Tokens

Create tokens for PCs and monsters.

3. Select Current Turn

Choose which creature is acting.

4. Export AI Turn Packet

Copy the generated prompt.

5. Ask an AI Model

Paste the prompt into ChatGPT or another model.

6. Apply AI Actions

Paste the returned JSON into the Apply panel.

The battlefield will update automatically.

Example Use Cases
AI-Controlled Monsters

Let the AI control enemy tactics during combat.

Solo DM Assistant

Use AI to handle enemy decision-making.

AI vs AI Combat

Set AI control to Both and watch battles play out.

Encounter Simulation

Test encounter balance automatically.

Roadmap

Planned improvements:

Initiative order tracker

Difficult terrain / obstacles

Line of sight calculations

Area-of-effect templates

Fog of war

AI combat memory

Roll automation

Multiplayer synchronization

License

MIT License

Free for personal and commercial use.

Why This Project Exists

Modern LLMs are extremely good at tactical reasoning, but there is no good interface for connecting them to tabletop combat.

This project explores the idea of AI as an active participant in tabletop gameplay.
