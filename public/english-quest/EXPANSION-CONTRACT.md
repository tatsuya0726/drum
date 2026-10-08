# Collection expansion integration contract — implementation candidate

Base: `ce293a08faf08ffaa0d2a33d881441a9ff249219`. Branch: `codex/english-quest-collection-expansion`. Publishing requires separate authorization. The detailed validation/release gate is in `docs/english-quest-expansion-qa.md`.

## Registries and content

Keep the seven legacy human IDs and seven encounter IDs. `expansion/collection-design.json` is the reviewed source for **36 additional allies**, 40 new enemy archetypes, 12 new regions and 60 new dungeons. `expansion-pack.js` mirrors that source; `expansion.js` installs it into existing registries. Semantic source IDs are authoritative, not the earlier draft `a_001` placeholders. Four rarities (1–4) contain 12/12/8/4 allies. Existing six basic professions remain freely recruitable in the first town. Initial expansion gift: five earned tickets and four owned allies (`ember_mole`, `dew_slime`, `beetle-knight`, `lantern-moth`).

All human characters are adults; nonhuman species are explicit. Existing human portraits plus 36 new individual ally portraits and four new bosses are used. Enemy families and region backgrounds are explicitly mapped shared assets. Final `coal_apprentice` registration was authorized and delivered in content commit `45525a48d661135e1e98a9c3b28c09a10b7faff4`.

The 600 reviewed records are loaded from `expansion/questions/english-quest-600-questions.json`, with IDs explicitly allowed by `reviewed-ids.js`. Four distinct options, exactly one answer, difficulty 1–6 and normalized duplicate checks are required. Reordering choices does not create content. Questions prioritize weak/least-practiced records within the region's difficulty. Three of four battle rounds use the bank; the fourth keeps command learning. Signature commands teach Invoke accurately. Wrong answers stay at 50% through reload; confirmation explains the correct use and core meaning.

## Combat

Four active allies including the hero; any owned reserves; one action per living member per round; enemy phase after the team's actions. Enemy slots are `e0`…`e3`; do not classify ally `ember_mole` as an enemy by a prefix test. Multiple waves preserve party resources, reset selection, and award victory only after the last wave. Dead targets are reselected by the engine. Old campaign combat remains intact.

Composable effects: damage, heal, shield, status, cleanse, dispel and cooldown reduction. Target and condition are evaluated before consuming a marker. Self markers are consumed once per effect, after all targets; skipped effects consume nothing. Wrong answers halve created strength exactly once, including stored DOT/regen/thorns snapshots. Stronger refresh is selected by final numeric strength, not only the source multiplier; maximum remaining duration is retained.

Status effects live in `aura`, separate from legacy counters. Enemy silence/weaken/slow/heal-down apply through the next ally round. Silence lasts one affected turn. End-of-round ticking updates DOT, regeneration, shields and cooldowns. Scalar attack buffs/debuffs cap at 40%, armor at 60%, shields at 40% max HP; existing legacy guard retains its old rule. Thorns cannot recurse. Death clears temporary statuses. Cooldown reduction caps at one per recipient per round and cannot add a skill that was unavailable when planning. Half cleanse/dispel/reduction credits accumulate per actor+skill+effect; whole credits are consumed even when no eligible cooldown remains.

Shared roster level and cost `20 + 5 × current level`; new recruits join at the same level, with no rarity-based growth advantage. New encounters scale all party members consistently. Region entry/recommended-level milestones avoid a cap that blocks the next legal stage. Fixed recruits are awarded early enough that advertised tutorial pairs can be built without random recruitment. Repeat ticket stamps only come from the deepest cleared region and the one before it, preventing trivial early-stage farming; older stages still give coins.

## Recruitment and persistence

Earned tickets only. Base odds 45/35/16/4%; uniform within each rarity. After nine consecutive results below rarity 3, next draw is rarity 3/4 at 80/20. After 29 consecutive non-4 results, next draw is rarity 4; this takes precedence. Ten draws are ten sequential guarantee-aware draws, with no hidden bonus. Duplicate of any rarity gives one leaf, never a stat bonus. Targeted exchanges cost 6/10/18/30 leaves. Every 40 draws gives one selection page; a page chooses any unowned recruit.

Results, inventory and counters commit before reveal. Web Locks prevent concurrent writes; revision checks and saved receipts make retries idempotent. Ten draws commit atomically with one external operation sequence. Last results can be reopened without redrawing. Run IDs and settlement receipts prevent duplicate dungeon rewards. First-clear tickets total 84; first clears give one stamp, three stamps give one ticket. Eligible repeat wins give wave count plus a boss bonus, capped at three stamps.

Save key stays `english_quest_rebirth_v1`; schema is v2. Old v1 is backed up verbatim to `_before_collection_v2`; original legacy game keys stay untouched. Import validates registries, formation, waves, question snapshots, status values, cooldowns and economy counters. Failed writes roll back to the last saved state. Offline/no-audio/reduced-motion modes do not change game outcomes.

## Presentation and audio

Keep compact one-screen battle and large enemy artwork. No intent prose in the battle field; traits/status are accessible from battle menu and departure preview. Main actions and four-choice questions fit 320×568 and landscape 844×390. Attack, impact, return and defeat animations distinguish acting and receiving units.

`audio-manager.js` owns a persistent user-gesture-unlocked context, independent saved BGM/SE volumes/mutes, three CC0 tracks, six original effect families, TTS ducking, and visibility/pause lifecycle. Default and prior master OFF remain OFF. Full source/license records accompany assets. Audio failure never blocks a turn or hides a question.
