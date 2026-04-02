# Devlog: Building an AI-Driven Tactical Combat VTT

This week marked a major step forward in the development of the web-based virtual tabletop (VTT) designed to support AI-assisted tactical combat encounters. The focus was on building the core interaction loop between the game board, the AI controller, and the backend services that interpret and execute turn decisions.

## Building the Tactical Grid Interface

The first milestone was completing a working grid-based combat interface in the browser. The board supports snap-to-grid movement and draggable tokens representing PCs, NPCs, and monsters. Each token carries basic combat metadata including AC, HP, movement speed, notes, and statblocks.

To support real battle maps, a dedicated map layer system was implemented. The map image can now be translated, scaled, and rotated independently of the grid, allowing embedded map grids to be precisely aligned with the VTT grid. This is especially useful for scanned maps or assets exported from other map-making tools.

Key features added to the map system include:

* Adjustable grid cell size
* Map translation controls for alignment
* Optional rotation for skewed maps
* Map opacity adjustment to aid alignment
* Camera pan and zoom

This allows the VTT to quickly adapt to virtually any map asset.

## AI Turn Control System

The next major piece was enabling the AI to act as a combat participant. The frontend now exports a structured “turn packet” describing the full tactical state of the encounter. This packet includes:

* grid rules and coordinate system
* token locations
* current turn actor
* relevant statblocks
* environmental constraints

The packet is transmitted to a backend service which forwards it to an OpenAI model. The model then returns a structured JSON response containing:

* token movement
* chosen action
* target selection
* turn completion signal

This output can be applied directly to the board state.

To streamline gameplay, an **auto-apply mode** was added. When enabled, AI responses automatically move tokens and update the board without manual intervention.

## Backend Reliability Improvements

Because the AI must return strictly formatted JSON, the backend was hardened to prevent crashes caused by malformed responses. Improvements include:

* JSON schema enforcement for structured AI outputs
* safe JSON parsing with fallback extraction
* graceful error responses when parsing fails
* timeout protection for stalled model requests

This ensures the VTT remains stable even if the model returns unexpected output.

## Performance Instrumentation

With the full AI loop operational, attention shifted to performance. End-to-end telemetry was added across both the frontend and backend to track latency and payload characteristics.

The system now records:

* payload size sent to the backend
* response size returned
* frontend request timing breakdown
* backend processing time
* OpenAI model latency
* token usage (input/output/total)

These diagnostics quickly revealed that model selection was the dominant factor affecting turnaround time.

## Model Control and Optimization

To allow experimentation with performance trade-offs, a model selector was added to the VTT interface. The frontend can request different models, while the backend enforces an allowlist for safety.

This enables switching between:

* fast models for tactical decisions
* slower reasoning models for more complex scenarios

Additional safeguards such as request timeouts prevent long-running model calls from blocking gameplay.

## Next Steps

With the core AI-controlled turn system working, the next phase of development will focus on expanding gameplay capabilities and improving responsiveness.

Planned work includes:

* initiative tracking and automated turn order
* environmental obstacles and line-of-sight rules
* improved AI prompt compression to reduce token usage
* faster model orchestration for sub-second turn decisions
* persistent encounter state and replay logs

The long-term goal is a VTT where AI agents can act as monsters, companions, or even full party members—allowing dynamic encounters to run smoothly even with minimal human management.

The foundation for that system is now in place.
