# Collection expansion integration contract — draft 1

Base: ce293a08faf08ffaa0d2a33d881441a9ff249219. Expansion branch: codex/english-quest-collection-expansion. Do not publish this expansion without separate authorization.

## Parallel ownership and counts

Implementation owns registry loading, deterministic mechanics, save migration, rewards, recruitment economy, compact UI and tests. Parent owns reviewed English content, independent balance review and original artwork. Please return JSON using the schemas below. Do not edit implementation files in parallel. No temporary image or generated question permutation counts as completed content.

Target includes existing content: 36 allies = existing hero plus six starters plus 29 additions; 40 enemy archetypes = nine existing plus 31 additions. Twelve NEW regions each contain five explicit encounters (60 new dungeons); seven legacy chapters stay playable and retain IDs. At least 600 independently written/reviewed question records, deduplicated by normalized prompt and correct answer; shuffling choices does not add a question.

## Allies: allies.json array

Reserved new IDs a_001 through a_029. Keep existing hero,guardian,mage,cleric,ranger,duelist,bard IDs. Existing six basic jobs remain freely recruitable in the first town. Art reservations in order: a_001 lantern moth spirit; a_002 moss turtle guardian; a_003 porcelain fox mage; a_004 clockwork owl; a_005 crystal jellyfish; a_006 ember lion cub (nonhuman beast); a_007 thorn dryad; a_008 armored beetle knight; a_009 cloud whale; a_010 skeletal raven oracle; a_011 mushroom alchemist; a_012 star serpent.

Each record: {id,name,title,job,age,species,role,hp,mp,atk,color,sigil,quote,story,skills,synergy,rarity,element,artId}.

rarity is R,SR,SSR. Humans are adults; for nonhumans age may be null and species must be explicit. Role and synergy describe actual supported mechanics. Suggested stat envelope before review: hp80–170,mp10–18,atk16–28; rarity must not simply multiply all stats. skills contains one or two IDs, including one authored signature sig_a_001 etc. artId matches id. Existing starter rarity R. Parent should assign 14R/10SR/5SSR among the 29 additions unless balance review recommends another split.

## Skills: skills.json array

Each record: {id,en,ja,cost,target,power,element,kind,text,lessonKey,mechanics?}.

target: enemy,enemies,ally,allies,self,fallen. cost integer0–8; power0–2.0. element: physical,fire,ice,wind,light,dark. kind: slash,bash,arrow,fire,ice,heal,guard,song. lessonKey refers to strike,guard,break,shelter,bash,ignite,frost,mend,revive,cleanse,mark,pierce,sever,interrupt,inspire,hush. text must explain correct and half-potency effects without claiming random success.

Supported signature knobs planned for implementation: effect=exposed|marked|stun|silence|chill (on damaging hit), bypass boolean; mechanics={heal?:number,revive?:fraction,cleanse?:boolean,guard?:fraction,restoreMp?:integer,drain?:fraction,buff?:'inspired',bonus?:{status:'marked'|'exposed',flat?:number,multiplier?:number}}. Fractions0–1; guard capped0.5; buffs/control obey existing correct100%/wrong50% deterministic policy. Effects unsupported by this list need coordination first. Do not invent passives that are only flavor text.

## Enemies: enemies.json array

IDs e_010 through e_040. Record: {id,name,role,hp,atk,weak,pattern,boss?,blastPower?,healPower?,reviveRatio?,lore,artId}.

weak uses the same six elements. pattern is an explicit sequence using attack,poison,drain,protect,heal,revive,charge,blast. If blast exists, charge must precede it in the cycle. Defaults healPower30,reviveRatio0.35. Distinct archetypes should differ in tactical behavior/combination, not merely color or scalar stats. No enemy forecast text returns to the main UI.

## Regions and dungeons

regions.json: [{id:'r01',name,area:'r01',description,tier:1,requires:['eclipse']}]. Region2 requires r01_05 etc; no calendar gates.

dungeons.json: [{id:'r01_01',regionId:'r01',stage:1,chapter:'01-1',name,area:'r01',label,tip,enemies:['e_010','hound'],reward:40,tickets:1,firstClearTickets:2,requires:['eclipse'],recommendedLevel:4,questionDifficulty:1}]. Each stage authored explicitly. One to four enemies; duplicates allowed with separate runtime slots. Finite first-clear reward plus modest repeatable ticket income; no payment or ads. Replay must never award the same battle result twice.

## Questions: questions.json array

Parent-native accepted record: {id:'q_0001',level:1,category:'travel',prompt,options:['correct','wrong','wrong','wrong'],answerIndex:0,explanation,englishText}. Optional skillTags/word/translation are welcome but not required. A separate approvedIds array plus review evidence identifies the actually reviewed subset.

Stable IDs q_0001 onward. Four distinct choices; answerIndex0–3 before runtime shuffling. Japanese prompt/explanation and natural English text; explain the exact sense/use, not merely repeat a dictionary gloss. Level1–6. Optional skillTags use lesson keys above. Review approval is evidence of actual independent review, never defaulted by a loader. Provide rejected/needs-revision items separately. Pure punctuation, choice shuffles and noun-substitution clones do not satisfy the600 target. Exact prompt+correct-answer duplicates are rejected; content review must additionally check semantic duplicates. Long prompt/options/explanation are flagged for mobile review, not silently truncated.

## Art slots

assets/expansion/allies/a_001.webp etc: transparent full figure,768x1024, subject fully inside frame with6–8% breathing room. Species and art styles may vary; silhouette and readable face remain important.

assets/expansion/enemies/e_010.webp etc: transparent1024x1024, entire weapon/wings inside frame. Main body occupies65–85% of canvas; no baked background, labels or UI.

assets/expansion/regions/r01.webp etc: opaque1536x1024 background, focal center usable behind1–4 enemies. Distinctive original locations. Existing20 assets stay unchanged. Manifest will add expansion.characters/enemies/backgrounds. Parent returns files via the regular Library route or committed branch; PC Library download previously returned403 and may require parent materialization plus an authorized git asset transfer. Never claim unreceived art complete.

## Proposed earned-ticket recruitment

One ticket per draw. Base rarity R70%,SR25%,SSR5%; uniform inside the selected eligible rarity. Tenth consecutive non-SR+ draw guarantees SR+ (SR95%,SSR5%). Fortieth consecutive non-SSR draw guarantees SSR and takes precedence. The guaranteed draw is included in the threshold. Rarity counters reset on qualifying pulls. Rates and next guarantees appear in the optional rules panel; no purchases,cash value,ads or time-limited pressure.

Duplicate yields archive shards R1/SR5/SSR20 and does not directly increase combat stats. Shards buy a chosen unit at fixed R10/SR40/SSR120, so duplicates give deterministic collection progress without required duplicate power. Exact draw receipt and ticket decrement commit together before animation. Injected RNG uses0<=x<1, explicit rejection otherwise. Storage failure leaves the old save and no revealed pull. Locks plus save revision guard concurrent tabs. Request IDs make interrupted/repeated claim/draw/redeem operations idempotent.

## Save compatibility

Keep english_quest_rebirth_v1 storage key; schema version2 accepts version1 and makes an exact one-time backup before writing upgrade. Preserve original legacy key, roster, party, completed IDs, words, settings and pending battle. New economy and per-question history live in separate versioned fields. No automatic retroactive repeated rewards. Existing ownership is never rerolled. Counts shown in UI derive from validated/approved actual content, not target constants.
# Integration checkpoint — design pack received 2026-10-08

The sections below describe the initial engine-facing proposal, not the final
design pack. The newly delivered Library design supersedes the proposed rarity
economy: four rarity tiers (45/35/16/4%), tier 3+ by draw 10, tier 4 by draw 30,
one ticket per three clears, equal duplicate currency and a choice every 40 draws.
`collection.js` currently tests the earlier three-tier proposal and is not wired
to the public UI. It must be adapted before enabling recruitment.

Library source: `libfile_6d5ba2cf655081918a345d2a18c02ba5`, version 0,
`english_quest_collection_expansion.json` (108474 bytes). Formal local transfer
failed with HTTP 403. Library text reading works; whole-file local bytes are
not yet available. Parent must arrange an authorized alternate transfer.

The source uses semantic unit IDs (for example `ember_mole`), numeric rarity,
an ordered `skill.effects` array and cooldowns. Its `apply_status`, shield,
conditional consumption, DOT, cleanse/dispel and cooldown effects need a
validated adapter and composable engine support. Preserve the original seven
human IDs and existing battle/save semantics. Do not silently substitute the
provisional `a_001` IDs or claim this checkpoint implements the complete pack.

