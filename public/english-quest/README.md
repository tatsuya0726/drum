# English Quest — party battle rebuild

Dedicated scope: `public/english-quest/`, its tests and balance script. The drum application is unchanged.

## Run

`npm ci`, `npm run dev`, then open `/english-quest/index.html` (Vite development serves public HTML by its explicit filename). The deployed static site continues to use `/drum/english-quest/`.

`npm test` includes the engine/save regression tests. `node scripts/english-quest-balance.mjs` simulates all 20 companion trios, seven encounters and two target priorities with no correctness bonus. `npm run build` copies these self-contained ES modules into `dist/english-quest/`.

## Structure

- `data.js`: adult cast, six companion professions, skills, contextual English lessons and seven encounters.
- `engine.js`: pure round planning/resolution, injectable question RNG, targeting, resources, enemy intent and effects.
- `save.js`: validated import, non-destructive v2 migration, party management, idempotent battle settlement.
- `app.js` / `styles.css`: responsive town, guild, comparison, reserve selection, route, notebook, combat, settings and presentation.
- `vocabulary.json`: all 146 original words/phrases, retained for migrated learning records.
- `classic.html`: byte-for-byte original main game at base commit `380c906`; its original exploration, towns, conversations, inventory and save remain playable. `pixelize.html` and legacy asset schema are unchanged.

## Rules

Four active heroes. Plan one action per living hero, reorder freely, then answer one contextual question without a timer. A first correct answer boosts one selected actor's damage/healing by 25%; a mistake does not remove defensive/utility effects. The first answer is counted once, with an assisted correction before execution. Living enemies act once after the party. All confirmed state is saved before presentation, so reloading never executes a round twice.

MP regenerates by 2 per round; basic attacks restore 2, guard restores 3. Every battle has 3 healing herbs, 2 antidotes, 1 revival item. Reserve swaps consume an action; incoming units wait until the next round. Death of the protagonist does not end the battle. A dead attack target is retargeted to lowest living HP, then stable slot order. Enemy targets fall back to the first living slot. Healing/utility with no valid target consumes no MP/item. Enemy guard reduces damage by 40% at most and can be bypassed. Interrupt stops ordinary enemies; on bosses it halves damage. Silence blocks heal, revive, charge and blast for one enemy action. Poison lasts two subsequent actions. Shields expire after the enemy phase. Mark and exposure count hits, not time.

The new campaign is an independent seven-chapter story. Legacy progress is not mapped one-to-one to these encounters: level, gold, wins and learning history are imported; all old position, HP, MP, items, conversations and ending state are kept unchanged in the old key and backup. New combat always starts at full HP/MP. This is intentional and stated in settings.

## Saves

New key: `english_quest_rebirth_v1`.
Legacy key: `english_quest_v2`, never changed by the new game.
Before importing legacy data, its exact raw value is copied once to `english_quest_v2_backup_before_rebirth`. Failure to write the backup blocks migration. Invalid saves block writes rather than silently overwrite data. A user-imported backup retains the previous new save under `english_quest_rebirth_v1_before_import`. A second tab's update stops writes and asks to reload.

## Artwork

Twenty original generated illustrations are included under `assets/rebirth/`: seven adult adventurers, six ordinary enemies, three bosses and four environments. Transparent full-figure WebPs preserve the source silhouettes and alpha. The UI frames the same originals for party portraits while showing the full figure in character details. Backgrounds are opaque WebPs.

`assets/manifest.json` keeps the legacy keys and adds `rebirth.characters`, `rebirth.enemies` and `rebirth.backgrounds`. Missing assets are a test failure. The internal `bard` save ID represents the rogue Nadia. Do not rename stable character IDs in existing saves.

## Casting and interruption

Interrupting an ordinary enemy during its charge cancels the following blast. Interrupting a boss charge halves the following blast. Silence on a charging caster cancels its next blast, including bosses. The next intent and status labels show the result, and the pending effect survives reload. Interrupting an already readied ordinary blast stops it; a boss blast is reduced by half. Effects expire after the affected blast and do not stack into permanent control.

## Compatibility

The original free-roaming towns, conversations and inventory remain playable through Classic in Settings. The new chapter campaign uses its own save key. Original vocabulary and recorded review history remain available. Import and export operate locally in the browser; there is no account or server-side save.

## Verification

`npm test` covers recruitment, the four-person limit, reserve swaps, targeting, healing and cleansing, revival, area attacks, enemy guard, casting and interruption, kill order, equal turn economy for correct/wrong English answers, duplicate resolution prevention, migration, save recovery and audio failures. It also requires all twenty production art files.

`node scripts/english-quest-balance.mjs` checks all twenty companion trios across seven encounters with two tactical priorities, 280 simulations total. Mechanical simulations complement visual and interaction QA; they are not a substitute for real-device playtesting.
