# Tactical AI Core

Portable, browser-free tactical controller primitives for DrowVTT.

The core package defines the common encounter schema, controller contract,
deterministic legality helpers, candidate generation, scoring primitives, and
baseline controllers. The VTT should treat every controller as a hot-swappable
implementation of the same input and output contract.

This first OSS slice ships a minimal end-to-end controller set:

- `HumanController`
- `ScriptedController`
- `UtilityController`

Future slices should add group beam search, richer cover/elevation semantics,
LLM advisor integration, replay inspection, and benchmark reporting without
changing the VTT adapter contract.
