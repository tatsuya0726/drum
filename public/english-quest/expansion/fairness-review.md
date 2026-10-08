# Collection design review

Scope: static review of collection_expansion.json, plus independent arithmetic and abstract pity-state enumeration. No game engine or battle simulation was run. Findings below are specification/design issues, not claims that shipped code exhibits them. No game/repository files were edited.

## Findings to resolve before implementation

### 1. P1: one-enemy-round debuffs can expire before affecting an ally
Paths: design_contract.statuses / answer_scaling; effect_schema.status_definitions.silence; enemies fog, sapper, sprout, twin_mask, hollow_book, eclipse_wyrm.

These enemies apply duration=1 during an enemy action. Duration decrement/expiry phase is delegated to the existing engine but not defined here. Decrementing every status at the same enemy-round end makes silence/weaken/heal_down disappear before the next ally action, defeating the intended counter. Enemy-applied buffs have the same creation-round ambiguity. This is a missing contract, not a demonstrated runtime failure.

Fix/test: specify a phase-aware lifetime: enemy-applied duration=1 must survive through the next allied resolution and expire at the agreed later boundary. fog's round-4 silence must disable exactly one ally-round active opportunity; a prior-slot cleanse must have explicit behavior. Verify no extra rounds/actions, and verify ally-applied duration=2 guard protects exactly the intended two enemy rounds.

### 2. P1: recommended level 21 is inaccessible at dusk_05 under the stated caps
Paths: progression.upgrade_cost; dungeons dusk_05; regions stone.

Region 3 unlocks max20; region6 unlocks max35. dusk_05 is in region5 and recommends21. The acceptance requirement to test every stage at its listed recommended level cannot be met under that cap. Entry-versus-clear cap unlock is also unspecified; clearing-region semantics would create additional mismatches.

Fix/test: explicitly unlock caps on region entry and either allow21 before dusk_05 or tune its recommendation/balance to20. Traverse all 60 unlocks and assert recommended_level <= legal cap BEFORE each first attempt, not after its clear.

### 3. P1: newly-acquired-only level loans punish early collecting
Path: progression.upgrade_cost.

A unit acquired at account-highest1 gets floor1. The same unit acquired at account-highest49 gets floor44. Existing early commons have no stated access to the same floor. Saving tickets/selectors until later therefore buys free progression, and the advertised anti-experimentation-grind rule fails for most early-owned bench units. If "loan" already means a dynamic floor, say so explicitly.

Fix/test: apply a dynamic effective floor to every owned unit, capped by account unlocks, with purchased level tracked separately. Acquire identical units before/after account advancement; assert identical effective level and upgrade cost at the same final account state. Prevent loaned levels themselves recursively increasing the account maximum.

### 4. P2: repeat tickets strongly reward trivial-stage farming
Paths: economy.repeat_clear; dungeons grass_01 and all later two-wave dungeons.

grass_01 has one wave with 90 blob HP +72 twig HP, no armor; all clears grant the same one stamp. At high level, one-round grass_01 clears are feasible from the numbers, while intended late battles require multiple rounds/waves. Repeated easy questions become the fastest collection route, reducing the reason to use the combinations the user wants to matter. Unlimited replay is intentional; this is incentive misalignment, not unauthorized duplication.

Fix/test: choose and document an effort-aware reward rule or an unlocked rotating challenge with competitive ticket efficiency, without adding payment/stamina/caps. Measure tickets per answered question and per minute across unlocked regions using legal parties. Set an explicit acceptable efficiency range; do not ship an economy whose optimal route is permanently grass_01 by a large margin.

### 5. P2: guaranteed combination unlocks arrive after their tutorial region
Paths: progression.guaranteed_rewards; regions/dew, regions/sky; synergies/steam, synergies/focus.

steam_otter is guaranteed only after dew_05, so the no-gacha roster cannot practice the dew region's wet→follow-up combination during its introduction. storm_kite comes at sky_05; its guaranteed focus enabler bell_robot arrives at mirror_05. This does not prove those stages impossible, but it contradicts the stated "early stage introduces a synergy, guardian tests it" progression for these pairs.

Fix/test: grant each introductory pair before the region's practice stages or provide a clearly scoped temporary trial unit. Run an unlock audit with ZERO pulls: for each region tutorial and boss, assert all advertised combo components are owned before the first relevant encounter. Do not use later quest rewards in the no-gacha clearability test.

### 6. P1 implementation ambiguity: cooldown reduction can change availability after selection is locked
Paths: design_contract.skill_flow; allies/tide_clock; acceptance_tests cooldown test; synergies/focus.

Ready skills are selected at ally-round start, but slot1 tide_clock can reduce slot2's cooldown from1 to0 after the question, when no slot2 active could have been selected. Conversely, a later-slot reducer can shorten an earlier actor's freshly started cooldown. The max1 reduction cap and one cast per round prevent simple infinite loops, but they do not answer which same-round casts become legal.

Fix/test: choose start-of-round readiness snapshot (recommended to retain one-screen question flow) or a predeclared conditional skill policy. Test reducer before/after an ally at cooldown1 and cooldown0, an ally that already cast, wrong-answer fractional reductions, and a recipient already reduced this round. Never reopen the question or grant an additional action. State whether unused/capped reductions consume fractional credit.

### 7. P2: final status magnitude/source identity needs a refresh contract
Paths: design_contract.statuses / answer_scaling; effect_schema.status_definitions; allies spark_ant, cloud-whale, ember_mole.

"Greater magnitude" could mean coefficient or actual snapshotted tick power. At base stats spark_ant burn .35×40=14 exceeds cloud-whale .4×29=11.6 even though its coefficient is lower. Retaining max coefficient but replacing source can inadvertently lower damage; recomputing current source ATK can double-scale or change old DOT after buffs/death. Independent max-duration and max-power refreshing also intentionally allows weak reapplications to extend strong effects, which should be explicit.

Fix/test: store final numeric tick strength at creation after answer scaling and defined buff snapshot; compare that scalar at refresh and preserve its source metadata. Test both application orders, correct then wrong, source buffs expiring, source death, resistance, and duration refresh. Existing DOT must not be rescaled by later answers.

### 8. P2: displayed exact odds must distinguish base versus next-pull conditional odds
Paths: economy.rarity_probabilities / within_rarity / pity / fairness_ui.

Base per-unit probabilities are 3.75%, 2.916666…%, 2%, 1% for rarities1–4 respectively. At high pity the per-unit probabilities instead become 0%,0%,10%,5%; at top pity each of the four top units has25%. Showing only base "exact probability" next to an active guarantee is misleading even though the pity algorithm itself is consistent.

Fix/test: label base odds and show current next-pull odds or an unambiguous guarantee explanation. Verify sums equal1 in base/high/top states; top pity overrides high pity. A ten-pull must recompute the next-pull distribution after EACH result, not use its initial distribution ten times.

## Verified checks / non-findings

- Rarity counts are exactly12/12/8/4 (36 allies); all40 enemy archetypes appear in at least one dungeon.
- First-clear ticket sum is84. 60 stamps add20 tickets; starter5 gives109, and floor(109/40)=2 Choice Pages. The published arithmetic is correct.
- There are18 distinct starter/guaranteed quest roster entries in total (4+14), but future quest rewards must not be included in earlier-stage tests.
- Abstract pity transition enumeration across150 pulls visited255 reachable final states and preserved high<=9/top<=29 after every pull. No counterexample to the 10-pull high/30-pull top guarantees was found. This validates the written recurrence, not persistence/RNG/runtime code.
- Atomic clear and pull transactions, status caps, exclusion of duplicate party IDs, no extra active casts, and no paid economy are explicitly specified. They are good requirements, not proven implemented protections.
- Four units raised conventionally from1→49 cost27,360 coins versus22,800 total first-clear coins. This is a grind-risk bound, not proof of mandatory replay: dynamic loan interpretation and sequential unit replacement could reduce the cost. Include the actual acquisition/leveling path in balance tests.
- No main-story impossibility or reliable combat-win percentage has been established by this review. The listed70% first-answer-success playtest remains outstanding; require chronological legal rosters, level caps, and a stated error sequence distribution.
