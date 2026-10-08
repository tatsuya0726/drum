# English Quest expansion review candidate — 2026-10-08

Branch: `codex/english-quest-collection-expansion`. Base/latest remote main checked during final QA: `ce293a08faf08ffaa0d2a33d881441a9ff249219`. No main push or deployment. Changes are confined to English Quest, its QA scripts, tests and this report; drum and other apps are untouched.

## Content and remaining release gate

- Existing seven human characters and seven encounters remain. Added 36 collectible allies, 40 enemy archetypes, 12 regions / 60 explicit dungeons, and 600 reviewed four-choice English questions.
- Current imported art is 35 individual new ally portraits plus four boss images. `coal_apprentice` is the only missing new ally image. The parent's exact manifest registration retry is awaiting authorization; it has not been bypassed. **Do not publish while this gate remains.**
- Forty enemy archetypes intentionally share suitable dark-fantasy family artwork through `art-map.js`; they are not forty unique illustrations. Twelve regions share three established backgrounds. Existing seven human portraits remain.
- Source design SHA256: `f0a1e3a9ae54e7a8edb9b430a1500cb1e25902d3a6a1de46c1328568ce19c6a8`.
- Reviewed question JSON SHA256: `d928b903a7c6830570664c8931c02ace283deb90f0fa7c3156c86fbd50a93442`.

## Automated verification

`npm test`: 302 passing, one pre-existing skipped test, eight files. `npm run build` passed after removing both temporary QA pages; neither exists in dist. The pre-existing drum rendering chunk-size warning remains.

Coverage includes all 36 signatures at both correct and incorrect potency, marker consumption, status strength refresh, duration boundaries, DOT snapshots, shields, silence, cooldown reduction and half-credit accumulation; waves, retargeting, victory/defeat, reserve swaps, old-save backup and migration, malformed state, failed persistence, cross-tab locks, recruitment guarantees, ten sequential draws in one transaction, duplicate conversion, replay receipts and one-time rewards. Existing 840-run legacy balance contract remains unchanged.

The chronological simulator starts with the actual initial roster and money, makes **no recruitment draws**, buys shared levels from earned coins before each battle, checks the current cap and unlock, and chooses only already-owned allies. Reward recruits are added only after winning. Wrong answers occupy three consecutive positions in each ten-answer sequence, continued across all battles rather than reset for each dungeon.

| Sequence offset | Dungeons won | Correct / wrong | Realized accuracy | Final level | Coins | Tickets | Draws |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0 | 60/60 | 319 / 138 | 69.803% | 49 | 15,980 | 109 | 0 |
| 3 | 60/60 | 319 / 135 | 70.264% | 49 | 15,980 | 109 | 0 |
| 7 | 60/60 | 322 / 138 | 70.000% | 49 | 15,980 | 109 | 0 |

There are 1,035 additional legal-composition probes; every dungeon has a winning available composition. These results establish a viable route, not a claim that every lineup or answer sequence wins. The final guardian defeats the all-strike reference policy in 25 rounds; the tactical policy wins in 19. Full machine-readable results are in `qa/english-quest/expansion-balance-report.json`.

## Browser QA

Chrome, local development origin only; test save backed up and restored. Viewports: 390×844, 375×667, 320×568, 844×390, 1280×900.

Checked town, guild, collection and rarity filter, map, notebook, battle commands, four-enemy battle, longest reviewed question, wrong-answer explanation, round feedback, victory, defeat, second wave, settings and saved recruitment results. Final battle/question layouts have no document scroll, off-screen main controls, clipped question/answer text or broken image loads. Scrollable dialogs intentionally scroll internally. An initial landscape one-pixel overflow and ally-row overflow were fixed and rechecked. Historical failed measurements remain identifiable in the raw evidence; the `long-question-final` measurements are the final state.

Real UI flows verified: wrong-answer 50% persists on reload and requires acknowledgement; standard motion returns to feedback after ally/enemy actions; browser Back pauses; next wave retains party resources and presents new targets; four-slot preset save/load; party replacement survives reload; ten draws spend exactly ten tickets and award ten duplicate leaves in an all-owned test fixture; reload reopens identical saved results without a new draw.

Screenshots and DOM measurements are in `qa/english-quest/`. Test harness sources are in `scripts/expansion-qa.html` and `scripts/audio-qa.html`; to reproduce, copy temporarily under `public/english-quest/`, use a disposable local origin, restore the backed-up test save, then remove the temporary public copies. They must not be shipped.

## Audio

Official CC0 sources and complete license record are in `public/english-quest/assets/audio/`. Port Town Loop (beardalaxy), Chiptune Battle Music (pmiller), and JRPG Epic Rock Battle Theme #1 (HydroGene) were downloaded from their official OpenGameArt pages and converted to 128 kbps stereo MP3. Kenney RPG Audio was inspected but is not used or shipped. Six effect families are original procedural Web Audio motifs.

One gesture-unlocked context, one BGM source, cached decoded tracks, scene switching, saved independent BGM/SE volumes and mutes, existing master mute preservation, TTS ducking, pause/visibility suspension, and failure fallback are implemented. Initial default remains OFF. MP3 avoids depending on Ogg support on older mobile Safari; actual device Safari/Firefox testing was not available.

Chrome decoded all three stereo tracks at 48 kHz: town 30.743229 s; battle 152 s; boss 113.668938 s. Normal battle plays from zero once and loops from the author's approximately 7.5 s point. Eight-millisecond boundary ramps produce measured zero sample discontinuity; maximum decoded channel peaks remained below 1. Browser checks confirmed context running/suspended transitions, scene switches, TTS ducking and effect execution. These are decode/waveform/runtime checks, **not a claim of human listening approval**; subjective mix and musical loop audition remain a review item.

## Release handling

Review the branch diff, complete the one outstanding ally art registration, confirm subjective audio mix if desired, and authorize publishing separately. No changes have been made to production saves or main. Existing save keys are preserved; v1 is backed up verbatim before upgrading to v2, and malformed saves or failed writes do not overwrite the previous valid state.
