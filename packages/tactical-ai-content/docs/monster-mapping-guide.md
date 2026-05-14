# Monster Mapping Guide

DrowVTT maps monster names and loose monster archetypes onto portable tactical metadata. The mapping layer is intentionally system-aware but rules-light: it describes battlefield purpose, not a full rules engine.

## Core Model

- `role` is the broad battlefield job: blocker, striker, skirmisher, caster, leader, lurker, artillery, swarm, solo, or hazard.
- `function` is the specialty inside that job, such as `body_pressure`, `support`, `control`, `grappler`, or `boss_controller`.
- `behavior` describes cognition, drive, risk, coordination, planning horizon, and target persistence.
- `intent` describes the encounter-specific purpose.
- `tags` capture mechanical affordances, system flavor, and future hooks.
- `secondaryRoles` names optional additional broad battlefield jobs.

## SRD-Style Mapping

SRD mappings live in `packages/tactical-ai-content/src/monster-mappings/srd.js` and are keyed by normalized monster name. The map covers common undead, beasts, humanoids, giants, dragons, elementals, constructs, oozes, fiends, celestials, fey, and monstrosities.

Examples:

```js
zombie: {
  tactical: {
    role: 'blocker',
    function: 'body_pressure',
    tags: ['undead', 'melee', 'body_pressure', 'swarm_member']
  },
  behavior: {
    cognition: 'mindless',
    drive: 'nearest_living_prey'
  }
}
```

A single zombie is `blocker/body_pressure`, not `swarm`. It blocks, clogs, and presses with one body. Use `swarm` only when the actor represents many bodies, a mob, a horde, a troop token, or a true swarm.

## MORK BORG Mapping

MORK BORG mappings live in `packages/tactical-ai-content/src/monster-mappings/mork-borg.js`. They include exact names like `corpse`, `witch`, `demon`, and `cursed idol`, plus archetype-style entries such as `undead_mindless`, `desperate_raider`, `cursed_caster`, and `solo_apocalypse_horror`.

MORK BORG monsters are often sparse or strange, so behavior does more work. A desperate raider can share a skirmisher role with an SRD scout while behaving with lower target stickiness and self-preserving risk.

## Adding A Mapping

1. Normalize the monster name to lowercase and trimmed text.
2. Choose exactly one canonical `tactical.role`.
3. Put subtype detail in `tactical.function`, not in the role name.
4. Add `secondaryRoles` only when another broad job is tactically meaningful.
5. Add `intent`, `posture`, `tags`, and `roleNotes` when they clarify behavior.
6. Fill every behavior field.
7. Run the mapping audit and tests.

Exact mapping example:

```js
'rat swarm': {
  archetype: 'brute',
  tactical: {
    role: 'swarm',
    function: 'many_bodies',
    intent: ['overwhelm_nearest', 'clog_space'],
    tags: ['beast', 'swarm', 'many_bodies']
  },
  behavior: {
    cognition: 'animal',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'swarm',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  }
}
```

Archetype mapping example:

```js
undead_mindless: {
  tactical: {
    role: 'blocker',
    function: 'body_pressure'
  },
  behavior: {
    cognition: 'mindless',
    drive: 'nearest_living_prey'
  }
}
```

## Fallback Inference

`inferMonsterTacticalMapping` is used when no exact mapping exists. It looks for simple, transparent signals:

- swarm, horde, mob, or many-bodies language -> `swarm`
- spells, curses, rituals, or spell arrays -> `caster`
- dragon, demon, boss, adult, ancient, huge-scale language -> `solo`
- ranged attacks with little melee pressure -> `artillery` or mobile `skirmisher`
- fast or mobile harassment -> `skirmisher`
- hidden, ambush, grapple, stalk, spider, or crocodile language -> `lurker`
- guard, durable, chokepoint, or protection language -> `blocker`
- high melee damage or direct pressure -> `striker`
- static, trap, idol, turret, lair, or environmental language -> `hazard`

Every inferred mapping includes:

```js
provenance: {
  mappingSource: 'heuristic',
  confidence: 0.78,
  reasons: ['Spells or spell-like language suggest a caster.']
}
```

Fallback mappings are intentionally conservative and should be replaced by exact mappings when a monster becomes important to authored content.
