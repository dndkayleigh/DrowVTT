# Portable Tactical Roles

Core principle:

- `role` = battlefield job
- `function` = tactical specialty within that role
- `behavior` = cognition, drive, risk, coordination, planning, and target persistence
- `intent` = encounter-specific purpose
- `tags` = mechanical affordances or flavor
- `secondaryRoles` = optional additional broad jobs

## Roles

`blocker`: Controls space, pins enemies, holds chokepoints, protects assets by positioning.
Common functions: `screen`, `hold_line`, `door_plug`, `bodyguard`, `zone_anchor`, `body_pressure`.

`striker`: Deals focused damage to valuable, weak, exposed, or priority targets.
Common functions: `brute`, `assassin`, `charger`, `finisher`, `disruptor`.

`skirmisher`: Uses mobility to harass, reposition, avoid being pinned, and attack opportunistically.
Common functions: `ranged_harrier`, `melee_harrier`, `kiter`, `flanker`.

`caster`: Uses spells, powers, rituals, supernatural effects, tech powers, or other non-basic abilities.
Common functions: `support`, `control`, `artillery`, `summoner`, `debuffer`, `ritualist`, `hybrid`.

`leader`: Improves allies, coordinates groups, buffs, rallies, commands, or anchors morale.
Common functions: `commander`, `morale_anchor`, `buffer`, `caller`.

`lurker`: Starts hidden, waits, stalks, ambushes, or punishes exposed targets.
Common functions: `ambusher`, `stalker`, `grappler`, `trapdoor`.

`artillery`: Projects damage or suppression from range.
Common functions: `sniper`, `suppressor`, `siege`, `aoe_blaster`.

`swarm`: Uses numbers, congestion, attrition, or body pressure. Use for true swarms, mobs, hordes, troop tokens, or actors representing many bodies. Do not use simply because a creature is mindless.
Common functions: `mob`, `horde`, `engulfer`, `many_bodies`.

`solo`: Centerpiece threat expected to operate independently and pressure a party.
Common functions: `boss_brute`, `boss_controller`, `boss_artillery`, `phase_boss`.

`hazard`: Static or semi-static threat, trap, turret, lair effect, ritual object, or environmental danger.
Common functions: `trap`, `turret`, `lair_effect`, `ritual_object`, `environmental`.

## Examples

Zombie:
`role: blocker`, `function: body_pressure`, `behavior.cognition: mindless`, `intent: [press_nearest, clog_doorway]`, `tags: [undead, melee, body_pressure, swarm_member]`.

Guard:
`role: blocker`, `function: hold_line`, `behavior.cognition: trained`, `intent: [hold_line, protect_area]`.

Support caster:
`role: caster`, `function: support`, `intent: [keep_allies_alive, stay_behind_screen]`.

Control caster:
`role: caster`, `function: control`, `intent: [deny_chokepoint, split_party, preserve_self]`.

Mage:
`role: caster`, `function: control`, `secondaryRoles: [artillery]`, `intent: [control_battlefield, preserve_self]`.

Dragon:
`role: solo`, `function: boss_controller`, `secondaryRoles: [caster, striker]`, `intent: [break_formation, punish_clusters, preserve_mobility]`.

Rat swarm:
`role: swarm`, `function: many_bodies`, `intent: [overwhelm_nearest, clog_space]`, `tags: [beast, swarm, many_bodies]`.
