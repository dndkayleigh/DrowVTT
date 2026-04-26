# Pathfinding Adapters

## Current Baseline

The tactical AI currently uses `LegacyPathfindingAdapter` as the default pathfinding adapter. This adapter wraps the existing homegrown implementation rather than replacing it.

Current legacy behavior:

- Coordinates are exposed through the adapter as `{ row, col }`, while tactical core internals still preserve the existing `{ x, y }` board-cell convention.
- Diagonal movement is allowed with Chebyshev-style cost: one diagonal step costs one movement cell.
- Movement blocking edges are respected.
- Line-of-sight blocking edges are handled separately by tactical legality helpers.
- Opponent-occupied cells block path traversal.
- Friendly-occupied cells may be traversed, but no move may end on an occupied cell.
- Reachability returns legal stopping cells only, with paths attached when available.
- Approach movement intentionally preserves movement reserve when no attack is available this turn.
- Difficult terrain, weighted costs, elevation, cover, and large-token footprint path expansion are not fully modeled yet.

Known limitations:

- Terrain costs are effectively unweighted.
- Large tokens are normalized, but path expansion is still primarily single-cell.
- The legacy implementation is deterministic but not a complete tactical movement engine.
- Group reservation planning is not yet part of single-actor pathfinding.

## Why Adapters

Pathfinding is now behind a stable adapter/service boundary so future implementations can be compared before they replace the baseline.

Flow:

```text
VTT board state
  -> rules-aware movement model
  -> pathfinding adapter
  -> PathfindingService
  -> tactical evaluator / monster controller
```

The tactical controller should call `PathfindingService`, not pathfinding internals directly.

## Interface Shape

The adapter interface is intentionally serializable:

```ts
type Coord = { row: number; col: number };

type PathResult = {
  found: boolean;
  path: Coord[];
  cost: number;
  reason?: string;
  adapterId?: string;
};

type ReachableTile = {
  coord: Coord;
  cost: number;
  path?: Coord[];
  legalStop: boolean;
};

type ReachabilityResult = {
  tiles: ReachableTile[];
  adapterId?: string;
};
```

Adapters implement:

- `findPath(request)`
- `reachable(request)`
- `distance(request)`

`PathfindingService` exposes:

- `findPath(request)`
- `reachable(request)`
- `distance(request)`
- `getLegalDestinations(request)`
- `getCandidateMoveActions(actor, encounter, options)`

## Adapter Selection

The default adapter is `legacy`.

Selection can be injected in code:

```js
const pathfinding = new PathfindingService({
  adapter: new LegacyPathfindingAdapter()
});
```

Or selected by adapter id:

```js
const pathfinding = new PathfindingService({ adapterId: 'legacy' });
const experimental = new PathfindingService({ adapterId: 'internal-v2' });
```

The service also checks `PATHFINDING_ADAPTER` when available. Experimental adapters must not become default until they pass comparison and movement tests.

## Comparison

Use `comparePathfindingAdapters` to run the same path and reachability requests across adapters.

The comparison reports:

- found vs not found
- path cost
- path sequence differences
- equivalent cost with different paths
- reachable tile count differences
- legal destination differences

Different paths can be acceptable when cost and legality match. Different cost or legality requires an explicit migration decision.

## Safe Replacement Criteria

A new adapter can supersede legacy only when:

- It passes all core movement legality tests.
- It preserves or intentionally improves documented behavior.
- Differences from legacy are explained.
- Tactical-controller output remains serializable.
- The comparison harness shows equal or better correctness.
- Performance is acceptable for typical encounter sizes.

## Candidate Future Adapters

- `InternalV2AStarAdapter`: weighted A* or Dijkstra with terrain costs and token footprints.
- `PathFindingJsAdapter`: external library adapter, only if our movement rules map cleanly.
- Graph-based adapter: useful later for doors, elevation, climb/jump edges, and interactables.

External library types must not leak into tactical-controller code.
