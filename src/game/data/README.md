# Game data

Weapons, spells and enemies are data: one TypeScript file per thing, default-exporting
a definition. Files in these folders are picked up automatically — there's no list to
update.

| Folder | Helper | Schema |
| --- | --- | --- |
| `weapons/` | `defineWeapon` | `MeleeWeaponDef` or `CatalystWeaponDef` in `types.ts` |
| `spells/` | `defineSpell` | `SpellDef` |
| `enemies/` | `defineEnemy` | `EnemyDef` |

```ts
// data/weapons/my-weapon.ts
import artUrl from './my-weapon.svg?no-inline'
import { defineWeapon } from '../types.ts'

export default defineWeapon({
  id: 'my-weapon',
  // ...the type checker lists every required field
})
```

Ids must be unique per kind. Missing fields and unknown attributes in `scaling` fail
the build; duplicate ids and loot entries pointing at unknown items fail on load.

Attributes and the formulas that turn them into health, stamina, spell charges and
loot luck live in `attributes.ts`.
