# TOP-DOWN SOULSLIKE ROGUELITE
## User-defined game concept and visual specification

**Document scope:** Records the creator’s stated decisions from the discussion. Examples, proposed costs, invented content and unapproved suggestions from the assistant are deliberately excluded. Unresolved choices remain unresolved.

## 1. Project identity and platform

- A distinct, fun, relatively simple web-game project: not a remake of Ashen Vow or a full copy of the game-jam game that inspired the discussion.
- Genre: 2D three-quarter-view Soulslike roguelite with procedural environments and repeated runs.
- Some ideas may carry over from Ashen Vow, but this is intended to be a different game entirely.
- Web stack: Phaser, React, Vite, TypeScript and Tailwind CSS, with IndexedDB (via Dexie) for save data, following the creator’s usual workflow.
- Presentation: three-quarter view (oblique): the ground is drawn as seen from above, and characters, walls and props stand up from it. Changed from strict overhead after side-by-side mockups.
- Characters are animated frame by frame in all eight directions: each frame is posed on a 3D model and rendered as cel-shaded SVG (chosen over layered, procedurally moved parts).
- Detailed layered SVG art, following the complete adapted specification in Part II.

## 2. Combat direction

- Combat should feel like Elden Ring / Souls games, translated to three-quarter-view 2D.
- Melee combat, magic and dodge rolls are core elements the creator specifically named.
- No exact weapon lists, spell systems, combat statistics or controls have been decided.

## 3. Runs and procedural floors

- The world/area is procedurally generated.
- The player progresses through successive floors.
- Each floor ends with a boss that must be defeated to access the next floor.
- Death normally ends the current run and returns the player to the beginning, unless they purchase an available checkpoint start for their next run.
- Floor count, dungeon layout algorithm, and final-ending/endless structure are not yet decided.
- Until bosses are designed, reaching the boss room opens the way down to the next floor, and that counts as finishing the floor for checkpoints.
- Enemies spawn at random in rooms, more in bigger rooms (from 1 in the smallest to 5 or 6 in the largest). Walking into a room with enemies in it shuts its doors behind you until they're all dead.
- The post-death screen also sets the loadout for the next run: what each hand starts holding.

## 4. Enemy difficulty, time and progression

- Regular enemies become harder both as the player reaches later floors and as elapsed run time increases, in the spirit of Risk of Rain’s escalating pressure.
- As the run timer increases, enemies also drop more runes/currency.
- Bosses are explicitly excluded from time-based scaling: each boss has fixed, predetermined difficulty regardless of how long the run has taken.
- Bosses on later floors can have their own distinct fixed difficulty; they must not become stronger merely because the run clock is higher.
- Exact scaling formulas, reward rates and the relationship between time and floor scaling are undecided.

## 5. Runes, death and permanent levelling

- Killing enemies earns currency equivalent in function to Souls / Elden Ring runes.
- After dying, the player reaches a post-death spending screen.
- The player can spend their earned runes to permanently improve attributes such as health and stamina.
- Multiple levels can be purchased in the same post-death visit.
- Levelling follows Souls / Elden Ring-style escalating costs: the higher the character’s level, the more expensive the next level becomes.
- Purchased attribute upgrades persist into future runs.
- Any runes left unspent when the player exits the post-death menu are lost permanently; they do not carry into the next run.
- There is no recovering those lost runes from the place of death.
- Exact attribute roster, costs and progression curve are not decided.
- Weapons can be upgraded on the post-death screen, following Ashen Vow's system: runes plus a smithing material that enemies drop, up to +10, each level adding to the weapon's damage.
- New weapons and spells are bought with runes on the post-death screen, giving runes another use. Prices follow a weapon's or spell's strength (higher damage costs more), and are deliberately expensive.
- Starting spells: Warrior has Magic Weapon and Healing Aura; Dex has Magic Dash and Orbiting Shards; Magic has Magic Shard, Magic Wave, Chain Lightning and Magic Rain.
- In a run there's a minimap (and a full map) and a status screen showing your stats; the status screen pauses the game.

## 6. Purchasable checkpoint starts

- The post-death screen also offers the choice of spending runes on a checkpoint start rather than spending those same runes on attribute levels.
- Checkpoints can allow a later run to begin further into the dungeon, skipping previously completed floors.
- Example given by the creator: after reaching Floor 5, purchase a checkpoint at the end of Floor 4 to start the next run at the beginning of Floor 5.
- The checkpoint costs runes that are therefore unavailable for permanent stat upgrades.
- The precise checkpoint prices, availability rules and whether a purchased checkpoint can be reused on multiple runs have not been decided.

## 7. Design boundaries and unresolved decisions

- This document captures established direction, not a licence to invent additional gameplay systems.
- No decision has been made on starting equipment, loot, inventory, enemy types, boss designs, floor count, specific stat formulas, checkpoint permanence, or a final boss/endless mode.
- The enemy roster will come from the creator; until then a single placeholder enemy stands in. Enemies get 3D-posed frame art like the player, with mockups approved before they go in.
- Do not silently treat assistant-generated examples or suggestions as approved game mechanics.

---

# PART II — COMPLETE ART STYLE SPECIFICATION

The following preserves the supplied art-style document, changing only the perspective-specific wording to match the game's three-quarter view.

ART STYLE — TOP-DOWN 2D SVG

Core Visual Direction

Maintain a consistent art style using detailed, realistic, cel-shaded SVG graphics presented in a consistent three-quarter (oblique) view.

The artwork must use carefully layered SVG geometry, controlled proportions, gradients, highlights, shadows and lighting to create convincing depth and volume within a 2D game environment.

The visual style should be richly detailed, dimensional and cohesive, rather than flat, minimalist or excessively cartoonish.

Perspective and Composition

Use a consistent three-quarter (oblique) view throughout the game. Ground surfaces (floors, paths, decals, anything lying flat) are drawn as seen from above, at native scale. Anything standing (characters, walls, columns, props) is drawn upright, its height rising straight up the screen, with its foot on the ground point it occupies.

Characters and other things that turn are drawn facing each of the eight directions. Things further down the screen are nearer the camera and draw on top.

Maintain consistent viewing angles, proportions, depth and visual scale across all assets.

Avoid:

- Mixing overhead-only and three-quarter assets in the same scene.
- Isometric diamond-grid projection.
- Exaggerated perspective distortion.
- Pixel art.
- Minimalist flat graphics.
- Oversimplified geometry.
- Exaggerated cartoon proportions.

SVG Construction and Layering

Construct all visual assets using detailed, layered SVG geometry.

Use multiple overlapping shapes, carefully controlled gradients, highlights, shadows, recessed details and material-specific shading to create dimensional artwork.

Objects should have convincing silhouettes, visible thickness and clearly defined structural forms.

Use baked-in shading to establish volume and depth, with runtime lighting enhancing the artwork rather than replacing its existing visual definition.

Maintain consistent rendering quality across characters, environments, buildings, vegetation, props, furniture and interactive objects.

Materials and Surface Detail

Give each material distinctive visual properties appropriate to its physical characteristics.

Metals should feature controlled reflections, darker edges, subtle brushing, recessed details and restrained highlights.

Wood should display convincing grain, colour variation, edge shading and surface depth.

Stone, concrete and masonry should feature appropriate texture, structural definition, surface variation and subtle imperfections.

Glass should use controlled transparency, reflections, highlights and visible thickness where appropriate.

Fabric, leather, plastic, ceramics and other materials should use suitable textures, gradients and shading to communicate their physical qualities.

Avoid treating different materials as identical flat-coloured surfaces.

Lighting and Shadows

Use lighting to complement the existing SVG artwork and reinforce its dimensional appearance.

Apply natural highlights, controlled contrast, ambient illumination, soft shadows and restrained glows where appropriate.

Normal and specular maps may be derived from each asset's geometry to enhance surface depth and material response.

Runtime 2D lighting should supplement the baked shading already present in the SVG assets.

Use soft, appropriately positioned shadows to establish contact with the environment and reinforce object placement.

Reserve additive glows for genuinely luminous objects.

Avoid excessive bloom, harsh post-processing and lighting effects that obscure the underlying artwork.

Native Scale and Asset Quality

Author all artwork at native world scale:

1 SVG unit = 1 world pixel.

Import assets at scale 1.0 and place them at scale 1.

Never enlarge undersized artwork using sprite or layer scaling. Instead, redraw the artwork at the resolution and dimensions required for its intended appearance.

Maintain consistent proportions between characters, environmental objects, structures and interactive elements.

Preserve clear navigation routes, readable silhouettes and accurate collision footprints.

Modular Construction

Where environmental assets connect or repeat, maintain consistent proportions, alignment, material profiles and shading.

Use position-independent shading where appropriate to prevent visible discontinuities between adjacent modules.

Avoid unwanted seams, gaps, overlapping outlines and inconsistent lighting between connected assets.

Keep reflections and decorative details contained within their intended surfaces.

Larger continuous structures should appear visually unified rather than assembled from obviously disconnected pieces.

Independent Assets

Keep individual props, decorative objects, environmental details and interactive elements as separate SVG assets or scene components where appropriate.

Do not unnecessarily bake independent objects into larger structures.

This allows objects to be repositioned, animated, interacted with, replaced or reused without rebuilding the surrounding environment.

Maintain consistent native scale and perspective across all independent assets.

Overall Quality Standard

The finished game should resemble a richly illustrated, dimensional 2D world with detailed cel-shaded SVG artwork.

Prioritise:

- Strong, readable silhouettes.
- Realistic proportions within the three-quarter view.
- Detailed layered geometry.
- Convincing material differentiation.
- Carefully controlled highlights and shadows.
- Consistent depth and visual scale.
- Cohesive lighting and colour treatment.
- Clean integration between environmental assets.
- High-quality, reusable SVG artwork.

The art style must not dictate the game's setting, gameplay systems, environment layout or content.

Apply the same visual principles consistently regardless of the type of world, environment, object or character being represented.

