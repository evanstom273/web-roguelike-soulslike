# Game data

Weapons, spells and statuses are data: one TypeScript file per thing, default-exporting
a definition. Files in these folders are picked up automatically; there's no list to
update.

| Folder | Helper | Schema (`types.ts`) |
| --- | --- | --- |
| `weapons/` | `defineWeapon` | `WeaponDef` |
| `spells/` | `defineSpell` | `SpellDef` (a cast plus one of 17 deliveries) |
| `statuses/` | `defineStatus` | `StatusDef` |

Also here:

- `attributes.ts`: the six attributes and what they derive (HP, stamina, spell charges, loot luck).
- `damageTypes.ts`: physical, magic, fire, lightning, holy.
- `player.ts`: the player's vitals and movement.
- `trainingDummy.ts`: the practice target's vitals.
- `progression.ts`: level-up cost curve.

Ids must be unique per kind. Missing fields and unknown attributes fail the build;
duplicate ids, unknown statuses and bad basic-spell references fail on load.

## Where the numbers came from

The model and numbers were ported from the Godot version (Ashen Vow) and converted
once to this game's units:

- World distances and speeds × 0.4545 (Godot's player foot collider is 44 units; ours is 20 px).
- Melee reach, hit radius, lunge and knockback also × 4 (Godot's actor scale).
- Turn rates from radians to degrees per second.
- Faith and Arcane damage scaling folded into Intelligence (all magic scales with INT).
- Heavy attack = the Godot charged attack; charged heavy is derived from it
  (× 1.35 damage and poise, × 1.25 stamina, × 1.12 reach). Light/heavy cooldowns are this game's.
- Names are neutral placeholders.

The generated files are now the source: edit them directly.
