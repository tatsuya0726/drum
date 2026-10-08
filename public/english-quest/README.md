# English Quest — party battle rebuild

Dedicated scope: `public/english-quest/`, its tests and balance script. The drum application is unchanged.

## Run

`npm ci`, `npm run dev`, then open `/english-quest/index.html` (Vite development serves public HTML by its explicit filename). The deployed static site continues to use `/drum/english-quest/`.

`npm test` includes the engine/save regression tests. `node scripts/english-quest-balance.mjs` simulates all 20 companion trios, seven encounters and two tactical target priorities plus naive all-strikes, using both perfect answers and one wrong answer every three rounds. `npm run build` copies these self-contained ES modules into `dist/english-quest/`.

## Structure

- `data.js`: adult cast, six companion professions, skills, contextual English lessons and seven encounters.
- `engine.js`: pure round planning/resolution, injectable question RNG, targeting, resources, enemy intent and effects.
- `save.js`: validated import, non-destructive v2 migration, party management, idempotent battle settlement.
- `app.js` / `styles.css`: responsive town, guild, comparison, reserve selection, route, notebook, combat, settings and presentation.
- `vocabulary.json`: all 146 original words/phrases, retained for migrated learning records.
- `classic.html`: byte-for-byte original main game at base commit `380c906`; its original exploration, towns, conversations, inventory and save remain playable. `pixelize.html` and legacy asset schema are unchanged.

## Rules

Four active heroes. Plan one action per living hero, reorder freely, then answer one contextual question without a timer. The first answer sets the whole party's action potency: correct = 100%, wrong = 50%. A correction teaches the meaning but does not replace the first judgment. Damage (including combo bonuses), healing, revival HP and buff strength scale deterministically; no effect rolls for random failure. Guard/Shelter reduce incoming enemy damage by 50% on correct answers or 25% on mistakes, without stacking, until the enemy phase ends. MP and item costs are unchanged. The first answer is counted once, with an assisted correction before execution. Living enemies act once after the party. All confirmed state is saved before presentation, so reloading never executes a round twice.

MP regenerates by 2 per round; basic attacks restore 2, guard restores 3. Every battle has 3 healing herbs, 2 antidotes, 1 revival item. Reserve swaps consume an action; incoming units wait until the next round. Death of the protagonist does not end the battle. A dead attack target is retargeted to lowest living HP, then stable slot order. Enemy targets fall back to the first living slot. Healing/utility with no valid target consumes no MP/item. Enemy guard reduces damage by 40% at most and can be bypassed. Interrupt stops ordinary enemies; on bosses it halves damage. Silence blocks heal, revive, charge and blast for one enemy action. Poison lasts two subsequent actions. Guard and legacy shields expire after the enemy phase; self-inflicted poison bypasses guard. Mark and exposure count hits, not time. Wrong answers shorten exposure from two hits to one, halve mark/inspire/chill strength, revive at 22.5% instead of 45% HP (rounded up), and cleanse half the remaining poison duration (remaining turns rounded down) with half healing. Correct cleanse removes all poison. Wrong interrupt reduces normal-enemy damage 50% or boss damage 25%; wrong silence reduces the upcoming heal/revive/blast 50%, including a charged blast. They do not fully cancel the action. Status strength survives save/reload.

The new campaign is an independent seven-chapter story. Legacy progress is not mapped one-to-one to these encounters: level, gold, wins and learning history are imported; all old position, HP, MP, items, conversations and ending state are kept unchanged in the old key and backup. New combat always starts at full HP/MP. This is intentional and stated in settings.

## Saves

New key: `english_quest_rebirth_v1`.
Legacy key: `english_quest_v2`, never changed by the new game.
Before importing legacy data, its exact raw value is copied once to `english_quest_v2_backup_before_rebirth`. Failure to write the backup blocks migration. Invalid saves block writes rather than silently overwrite data. A user-imported backup retains the previous new save under `english_quest_rebirth_v1_before_import`. A second tab's update stops writes and asks to reload.

## Artwork

Twenty original generated illustrations are included under `assets/rebirth/`: seven adult adventurers, six ordinary enemies, three bosses and four environments. Transparent full-figure WebPs preserve the source silhouettes and alpha. The UI frames the same originals for party portraits while showing the full figure in character details. Backgrounds are opaque WebPs.

`assets/manifest.json` keeps the legacy keys and adds `rebirth.characters`, `rebirth.enemies` and `rebirth.backgrounds`. Missing assets are a test failure. The internal `bard` save ID represents the rogue Nadia. Do not rename stable character IDs in existing saves.

## Casting and interruption

With a correct answer, interrupting an ordinary enemy during its charge cancels the following blast. Interrupting a boss charge halves the following blast. Silence on a charging caster cancels its next blast, including bosses. The next intent and status labels show the result, and the pending effect survives reload. Interrupting an already readied ordinary blast stops it; a boss blast is reduced by half. Effects expire after the affected blast and do not stack into permanent control.

## Compatibility

The original free-roaming towns, conversations and inventory remain playable through Classic in Settings. The new chapter campaign uses its own save key. Original vocabulary and recorded review history remain available. Import and export operate locally in the browser; there is no account or server-side save.

## Verification

`npm test` covers recruitment, the four-person limit, reserve swaps, targeting, healing and cleansing, revival, area attacks, enemy guard, casting and interruption, kill order, equal turn economy for correct/wrong English answers, duplicate resolution prevention, migration, save recovery and audio failures. It also requires all twenty production art files.

`node scripts/english-quest-balance.mjs` checks all twenty companion trios across seven encounters with three policies and two answer patterns, 840 simulations total (560 tactical, 280 naive). Mechanical simulations complement visual and interaction QA; they are not a substitute for real-device playtesting.


## Turn-potency and tactical balance check (2026-10-08)

Only telegraphed blast damage was raised: oracle 48, bellwarden 68, eclipse 64. Ordinary attacks, chapter-one enemies and health pools stay unchanged. The charge and blast forecasts show the actual base damage. This makes defending, freezing, interrupting, silencing or eliminating the caster useful without prescribing one kill order.

At campaign levels 1–4, all 20 four-person compositions win all seven chapters with both support-first and threat-first tactical policies, with perfect answers and with one wrong answer every three rounds: 560/560 tactical victories. Naive means every living ally uses Strike on the leftmost living enemy and never heals, guards, or uses items. On the final chapter it wins only 10/20 perfect-answer runs and 0/20 mixed-answer runs. These are deterministic policy checks, not claims that every player decision wins.

Example with hero/guardian/mage/cleric: in the belfry, perfect-answer naive play takes 292 enemy damage in four rounds, compared with 82 for support-first and 88 for threat-first. Against the twin bosses, naive perfect-answer play loses in five rounds; tactical support-first wins in five (387 HP left), threat-first wins in six (361 HP left). With mixed answers both kill orders still win (six/nine rounds respectively). The script prints per-run HP, rounds, enemy damage, deaths and items spent, plus aggregates, and exits nonzero if these balance requirements regress.

## Single-screen presentation (2026-10-08)

The current UI uses a `100dvh` grid with safe-area padding. Town, guild, route, notebook, battle, questions and results keep their primary controls inside the viewport. `compact.css` defines the viewport budget; the document is not clipped with overflow:hidden. Guild recruits are paginated in pairs, routes one chapter per page, and review words four per page. Profiles separate formation, skills, comparison and story into tabs. Detailed settings remain an optional scrollable dialog.

Enemy forecasts, role/weakness paragraphs and logs are no longer permanently shown. This supersedes the earlier forecast-display description above, without changing enemy behavior or the 100%/50% round rule. Battle uses compact ally HP/status controls, a native action selector, target taps, and a short action-order row. Select a planned ally and open the skill explanation to move that ally to the front of the order. All skills, consumables, reserve swaps and review remain available.

Enemy art occupies the flexible stage. Three/four enemies use a fixed-height 2x2 stage on tall phones and a single row on compact/landscape displays. Enemy attack animation scales only the acting enemy image toward the viewer, lands on the target, then returns before the next event. HP text and names do not scale. The arena clips only effect spill, never action controls; reduced-motion bypasses movement. Confirmed battle state is still saved before presentation.

Migration notices appear once for acknowledgement and remain available in Settings, instead of taking permanent viewport space. QA measured zero document overflow and no offscreen primary buttons at 390x844, 375x667, 320x568, 844x390 and 1280x900 for town, guild, route, notebook, four-enemy combat, two bosses, English questions, incorrect-answer explanation, review and victory. Engine/save modules and save format are unchanged.
