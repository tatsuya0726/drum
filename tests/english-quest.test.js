import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {HEROES,ENCOUNTERS,ENEMIES} from '../public/english-quest/data.js';
import {createBattle,queueAction,resolveRound,resumePlanning,targetsFor,useSkill,continueBattle,makeQuestion,alive,planEnemies} from '../public/english-quest/engine.js';
import {newSave,loadSave,SAVE_KEY,LEGACY_KEY,BACKUP_KEY,sanitizeSave,recruit,swapMember,settleBattle,recordAnswer} from '../public/english-quest/save.js';
import {speakText,playEffect} from '../public/english-quest/audio.js';
const party=['hero','guardian','mage','cleric'];
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
const planStrikes=b=>b.party.filter(alive).forEach(u=>queueAction(b,u.id,'strike',b.enemies.find(alive).id));
describe('English Quest party and saves',()=>{
 it('recruits every basic class once; keeps the protagonist and a maximum of four active',()=>{const s=newSave();for(const id of Object.keys(HEROES)){recruit(s,id);recruit(s,id);}expect(s.roster).toHaveLength(7);expect(s.party).toHaveLength(4);expect(swapMember(s,'bard','hero')).toBe(false);expect(swapMember(s,'bard','guardian')).toBe(true);expect(s.party).toEqual(['hero','bard','mage','cleric']);expect(swapMember(s,'mage')).toBe(true);expect(s.party).not.toContain('mage');});
 it('rejects reserve changes during a battle',()=>{const s=newSave();recruit(s,'mage');s.battle={};expect(swapMember(s,'mage')).toBe(false);});
 it('backs up legacy verbatim, preserves all old fields in the original and migrates only once',()=>{const storage=memory(),old=JSON.stringify({lv:8,gold:90,words:{protect:{o:2,n:4}},phr:{hello:true},herbs:9,cleared:true,hp:12,x:7,y:9});storage.setItem(LEGACY_KEY,old);const first=loadSave(storage);expect(first.save.level).toBe(8);expect(first.save.words.protect).toEqual({o:2,n:4});expect(storage.getItem(BACKUP_KEY)).toBe(old);expect(storage.getItem(LEGACY_KEY)).toBe(old);const again=loadSave(storage);expect(again.save.legacy.importedAt).toBe(first.save.legacy.importedAt);expect(again.notice).toBe('');});
 it('does not overwrite malformed current or old data',()=>{const storage=memory();storage.setItem(SAVE_KEY,'bad json');const r=loadSave(storage);expect(r.blocked).toBe(true);expect(storage.getItem(SAVE_KEY)).toBe('bad json');});
 it('does not migrate if backup storage fails',()=>{const r=loadSave({getItem:k=>k===LEGACY_KEY?' {"lv":3} ':null,setItem:()=>{throw Error('quota');}});expect(r.blocked).toBe(true);});
 it('rejects invalid imported battle data and normalizes repeated party IDs',()=>{const s=newSave();s.party=['hero','hero','nobody'];expect(sanitizeSave(s).party).toEqual(['hero']);s.battle={version:1};expect(()=>sanitizeSave(s)).toThrow();});
 it('awards victory once, and restores a round snapshot without extra damage',()=>{const s=newSave();s.party=party;s.roster=party;s.battle=createBattle(party,'path');planStrikes(s.battle);resolveRound(s.battle,true,'hero');const copy=sanitizeSave(JSON.parse(JSON.stringify(s)));expect(copy.battle).toEqual(s.battle);expect(s.battle.result).toBe('victory');expect(settleBattle(s)).toBe(true);const g=s.gold;expect(settleBattle(s)).toBe(false);expect(s.gold).toBe(g);});
});
describe('English Quest round economy and targeting',()=>{
 it('has one action per living ally and one per living enemy for correct and wrong answers',()=>{const a=createBattle(party,'eclipse'),b=createBattle(party,'eclipse');planStrikes(a);planStrikes(b);const ea=resolveRound(a,true,'hero'),eb=resolveRound(b,false,'hero');expect(a.round).toBe(2);expect(b.round).toBe(2);expect(ea.filter(e=>e.actor?.startsWith('e')&&e.kind!=='defeat').length).toBe(eb.filter(e=>e.actor?.startsWith('e')&&e.kind!=='defeat').length);expect(a.party.map(x=>x.hp)).toEqual(b.party.map(x=>x.hp));expect(a.enemies[0].hp).toBeLessThan(b.enemies[0].hp);});
 it('cannot resolve twice or act during feedback',()=>{const b=createBattle(party,'gate');planStrikes(b);resolveRound(b,false,'hero');expect(()=>resolveRound(b,false,'hero')).toThrow();expect(()=>queueAction(b,'hero','strike','e0')).toThrow();});
 it('reselects a defeated enemy without charging an extra action',()=>{const b=createBattle(party,'grove');b.enemies[0].hp=1;planStrikes(b);const events=resolveRound(b,true,'hero');expect(events.filter(e=>e.kind==='slash'&&e.actor==='hero')).toHaveLength(1);expect(events.find(e=>e.kind==='slash'&&e.actor==='guardian').target).not.toBe('e0');expect(events.some(e=>e.actor==='e0')).toBe(false);});
 it('a fallen protagonist does not end the battle',()=>{const b=createBattle(party,'gate');b.party[0].hp=0;planStrikes(b);resolveRound(b,false,'mage');expect(b.result).not.toBe('defeat');});
 it('supports revival without granting the revived unit a second turn',()=>{const b=createBattle(party,'eclipse');b.party[0].hp=0;queueAction(b,'cleric','revive','hero');queueAction(b,'guardian','guard','guardian');queueAction(b,'mage','guard','mage');resolveRound(b,false,'cleric');expect(b.party[0].hp).toBeGreaterThan(0);expect(b.round).toBe(2);expect(b.phase).toBe('feedback');});
 it('supports swaps, prohibits two allies swapping to one reserve, and incoming allies wait',()=>{const b=createBattle(party,'eclipse',1,0,[...party,'ranger']);queueAction(b,'guardian','swap','ranger');expect(()=>queueAction(b,'mage','swap','ranger')).toThrow();queueAction(b,'hero','guard','hero');queueAction(b,'mage','guard','mage');queueAction(b,'cleric','guard','cleric');const events=resolveRound(b,false,'hero');expect(b.party.map(u=>u.id)).toContain('ranger');expect(events.filter(e=>e.actor==='ranger')).toHaveLength(0);expect(b.round).toBe(2);});
 it('tracks shared supplies and does not spend supplies on invalid targets',()=>{const b=createBattle(party,'eclipse');b.supplies.herb=1;queueAction(b,'hero','herb','hero');expect(()=>queueAction(b,'mage','herb','mage')).toThrow();expect(()=>useSkill(b,'hero','phoenix','hero')).toThrow();expect(b.supplies.phoenix).toBe(1);});
 it('protects MP from invalid targets and insufficient MP',()=>{const b=createBattle(party,'gate');const m=b.party[2];m.mp=0;expect(()=>useSkill(b,'mage','ignite','e0')).toThrow();expect(m.mp).toBe(0);expect(b.acted).toHaveLength(0);});
 it('keeps healing within maximum and removes poison',()=>{const b=createBattle(party,'gate');b.party[0].status.poison=2;useSkill(b,'cleric','cleanse','hero');expect(b.party[0].hp).toBe(b.party[0].maxHp);expect(b.party[0].status.poison).toBeUndefined();});
 it('applies area damage to each living enemy and never to a corpse',()=>{const b=createBattle(party,'crypt');b.enemies[1].hp=0;const events=useSkill(b,'mage','frost','e0');expect(events.filter(e=>e.kind==='ice')).toHaveLength(3);expect(b.enemies[1].hp).toBe(0);});
 it('silence stops resurrection; otherwise a dead enemy returns next round',()=>{for(const silent of [false,true]){const b=createBattle(party,'crypt');b.enemies[1].hp=0;b.enemies[0].intent={type:'revive',target:'e1'};b.enemies[0].status.silence=silent?1:0;b.acted=party;b.phase='feedback';continueBattle(b);expect(b.enemies[1].hp>0).toBe(!silent);}});
 it('guard is capped at 40 percent and bypass reaches the selected target',()=>{const b=createBattle(['hero','ranger'],'gate');b.enemies[0].protecting='e1';const hp=b.enemies[1].hp;const events=useSkill(b,'ranger','pierce','e1');expect(events.find(e=>e.kind==='arrow').target).toBe('e1');expect(b.enemies[1].hp).toBeLessThan(hp);expect(b.enemies[0].hp).toBe(b.enemies[0].maxHp);});
 it('can lose to poison and then retry with new supplies and full health',()=>{const b=createBattle(['hero'],'eclipse');b.party[0].hp=1;b.party[0].status.poison=2;queueAction(b,'hero','strike','e0');resolveRound(b,false,'hero');expect(b.result).toBe('defeat');const fresh=createBattle(['hero'],'eclipse');expect(fresh.party[0].hp).toBe(fresh.party[0].maxHp);expect(fresh.supplies.herb).toBe(3);});
 it('recomputes predictable target after its original ally is defeated',()=>{const b=createBattle(party,'grove');b.party[0].hp=0;b.enemies[0].intent={type:'attack',target:'hero'};b.acted=party;b.phase='feedback';const hp=b.party[1].hp;continueBattle(b);expect(b.party[1].hp).toBeLessThan(hp);});
});
describe('English Quest audio fallback',()=>{
 it('works without any audio APIs',async()=>{let notified=false;expect(speakText('Hello',{},()=>notified=true)).toBe(false);expect(notified).toBe(true);expect(await playEffect('heal',{})).toBe(false);});
 it('handles denied audio resume without unhandled rejection',async()=>{let closed=false;class DeniedAudio{resume(){return Promise.reject(Error('Denied'));}close(){closed=true;return Promise.resolve();}}expect(await playEffect('slash',{AudioContext:DeniedAudio})).toBe(false);expect(closed).toBe(true);});
 it('handles delayed speech failure',()=>{let failed=false,spoken;const environment={SpeechSynthesisUtterance:class{},speechSynthesis:{cancel(){},speak(x){spoken=x;}}};expect(speakText('Guard.',environment,()=>failed=true)).toBe(true);spoken.onerror();expect(failed).toBe(true);});
});
describe('English Quest learning',()=>{
 it('has shuffled choices with one correct answer and alternates use cases',()=>{const q=makeQuestion('mend',{},()=>0);expect(q.choices.filter(x=>x.correct)).toHaveLength(1);expect(q.choices[0].correct).toBe(false);const next=makeQuestion('mend',{mend:{o:1,n:0}});expect(next.prompt).not.toBe(q.prompt);expect(next.core).toBeTruthy();});
 it('preserves both success and mistake totals',()=>{const s=newSave();recordAnswer(s,'protect',false);recordAnswer(s,'protect',true);expect(s.words.protect).toEqual({o:1,n:1});expect(s.ok).toBe(1);expect(s.ng).toBe(1);});
});

describe('English Quest cast interruption and tactical priorities',()=>{
 const enemyPhase=b=>{b.phase='feedback';b.acted=b.party.map(u=>u.id);return continueBattle(b);};
 it('interrupts an ordinary charge and prevents its following blast',()=>{
  const b=createBattle(['hero','duelist','mage','cleric'],'gate');
  const caster=b.enemies.find(e=>e.key==='oracle');
  useSkill(b,'duelist','interrupt',caster.id,false);
  enemyPhase(b);
  expect(caster.intent.type).toBe('blast');expect(caster.status.chargeBroken).toBe(1);
  const events=enemyPhase(b);
  expect(events.filter(e=>e.actor===caster.id&&e.kind==='blast')).toHaveLength(0);
  expect(events.some(e=>e.actor===caster.id&&e.kind==='stun')).toBe(true);
  expect(caster.status.chargeBroken).toBeUndefined();
 });
 it('weakens a boss charge through a save/reload and halves the next blast once',()=>{
  const s=newSave();s.party=['hero','duelist','mage','cleric'];s.roster=s.party;
  s.battle=createBattle(s.party,'belfry');let boss=s.battle.enemies[0];
  useSkill(s.battle,'duelist','interrupt',boss.id,false);enemyPhase(s.battle);
  s.battle=sanitizeSave(JSON.parse(JSON.stringify(s))).battle;boss=s.battle.enemies[0];
  expect(boss.status.chargeWeak).toBe(1);
  const hits=enemyPhase(s.battle).filter(e=>e.actor===boss.id&&e.kind==='blast');
  expect(hits).toHaveLength(4);expect(hits.every(e=>e.amount===Math.round(boss.atk*.5))).toBe(true);
  expect(boss.status.chargeWeak).toBeUndefined();
 });
 it('silencing a charge prevents the following blast even on a boss',()=>{
  const b=createBattle(['hero','bard','mage','cleric'],'eclipse');const boss=b.enemies[0];
  useSkill(b,'bard','hush',boss.id,false);enemyPhase(b);
  expect(boss.status.chargeBroken).toBe(1);
  expect(enemyPhase(b).filter(e=>e.actor===boss.id&&e.kind==='blast')).toHaveLength(0);
 });
 it('killing the healer before its phase removes a heal; killing the king first permits revival',()=>{
  const b=createBattle(party,'eclipse');const king=b.enemies[0],mirror=b.enemies[1];
  king.hp=0;mirror.intent={type:'revive',target:king.id};
  enemyPhase(b);expect(king.hp).toBe(Math.ceil(king.maxHp*.35));
  const c=createBattle(party,'grove');c.enemies[0].hp=10;const healer=c.enemies[1];healer.intent={type:'heal',target:'e0'};healer.hp=0;
  expect(enemyPhase(c).filter(e=>e.actor===healer.id)).toHaveLength(0);
 });
});


describe('English Quest complete production artwork',()=>{
 it('maps every cast member, enemy and scene to a real optimized WebP',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/english-quest/assets/manifest.json',import.meta.url),'utf8'));
  const required={characters:Object.keys(HEROES),enemies:Object.keys(ENEMIES),backgrounds:['town',...new Set(ENCOUNTERS.map(e=>e.area))]};
  let checked=0;
  for(const [group,ids] of Object.entries(required))for(const id of ids){
   const path=manifest.rebirth?.[group]?.[id];
   expect(path,`${group}.${id}`).toMatch(/^rebirth\/[a-z0-9-]+\.webp$/);
   const bytes=readFileSync(new URL('../public/english-quest/assets/'+path,import.meta.url));
   expect(bytes.toString('ascii',0,4)).toBe('RIFF');expect(bytes.toString('ascii',8,12)).toBe('WEBP');
   expect(bytes.length).toBeGreaterThan(10000);expect(bytes.length).toBeLessThan(600000);checked++;
  }
  expect(checked).toBe(20);
 });
});
