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
 it('enemy protection stays at 40 percent and bypass reaches the selected target',()=>{const b=createBattle(['hero','ranger'],'gate');b.enemies[0].protecting='e1';const hp=b.enemies[1].hp;const events=useSkill(b,'ranger','pierce','e1');expect(events.find(e=>e.kind==='arrow').target).toBe('e1');expect(b.enemies[1].hp).toBeLessThan(hp);expect(b.enemies[0].hp).toBe(b.enemies[0].maxHp);});
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
  useSkill(b,'duelist','interrupt',caster.id,true);
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
  useSkill(s.battle,'duelist','interrupt',boss.id,true);enemyPhase(s.battle);
  s.battle=sanitizeSave(JSON.parse(JSON.stringify(s))).battle;boss=s.battle.enemies[0];
  expect(boss.status.chargeWeak).toBe(1);
  const hits=enemyPhase(s.battle).filter(e=>e.actor===boss.id&&e.kind==='blast');
  expect(hits).toHaveLength(4);expect(hits.every(e=>e.amount===Math.round(boss.atk*(boss.blastPower||1)*.5))).toBe(true);
  expect(boss.status.chargeWeak).toBeUndefined();
 });
 it('silencing a charge prevents the following blast even on a boss',()=>{
  const b=createBattle(['hero','bard','mage','cleric'],'eclipse');const boss=b.enemies[0];
  useSkill(b,'bard','hush',boss.id,true);enemyPhase(b);
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
  const required={characters:Object.keys(HEROES).filter(id=>!HEROES[id].expansion),enemies:Object.keys(ENEMIES).filter(id=>!ENEMIES[id].expansion),backgrounds:['town',...new Set(ENCOUNTERS.filter(e=>!e.expansion).map(e=>e.area))]};
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


describe('English Quest answer potency regressions',()=>{
 const enemyPhase=b=>{b.phase='feedback';b.acted=b.party.map(u=>u.id);return continueBattle(b);};
 it.each([true,false])('scales every queued attack without a first-answer bonus (correct=%s)',correct=>{
  const b=createBattle(party,'eclipse');
  b.enemies.forEach(e=>{e.weak='none';e.intent={type:'attack',target:'hero'};});
  planStrikes(b);
  const events=resolveRound(b,correct,'hero');
  for(const actor of b.party){
   const hits=events.filter(e=>e.actor===actor.id&&e.kind==='slash');
   expect(hits).toHaveLength(1);expect(hits[0].amount).toBe(Math.round(actor.atk*(correct?1:.5)));
  }
  expect(events.filter(e=>e.actor?.startsWith('e')&&e.kind==='slash')).toHaveLength(2);
  expect(b.round).toBe(2);
 });
 it.each([true,false])('scales healing and spends full MP and supplies (correct=%s)',correct=>{
  for(const [skill,actor,base,cost,supply] of [['mend','cleric',42,3,null],['herb','hero',35,0,'herb']]){
   const b=createBattle(party,'eclipse');b.party[0].hp=10;
   const caster=b.party.find(u=>u.id===actor),mp=caster.mp,stock=b.supplies[supply];
   const events=useSkill(b,actor,skill,'hero',correct);
   expect(events.find(e=>e.kind==='heal').amount).toBe(Math.round(base*(correct?1:.5)));
   expect(b.party[0].hp).toBe(10+Math.round(base*(correct?1:.5)));
   expect(caster.mp).toBe(mp-cost);if(supply)expect(b.supplies[supply]).toBe(stock-1);
  }
  const b=createBattle(party,'eclipse');b.enemies[0].weak='none';
  const mp=b.party[2].mp;
  const hit=useSkill(b,'mage','ignite','e0',correct).find(e=>e.kind==='fire');
  expect(hit.amount).toBe(Math.round(b.party[2].atk*1.65*(correct?1:.5)));expect(b.party[2].mp).toBe(mp-4);
 });
 it.each([true,false])('revives at 45 or 22.5 percent with the same resource cost (correct=%s)',correct=>{
  for(const [skill,actor] of [['revive','cleric'],['phoenix','mage']]){
   const b=createBattle(party,'eclipse');b.party[0].hp=0;b.party[0].status.poison=3;
   const caster=b.party.find(u=>u.id===actor),mp=caster.mp;
   useSkill(b,actor,skill,'hero',correct);
   expect(b.party[0].hp).toBe(Math.ceil(b.party[0].maxHp*(correct?.45:.225)));
   expect(b.party[0].status).toEqual({});
   expect(caster.mp).toBe(mp-(skill==='revive'?6:0));
   expect(b.supplies.phoenix).toBe(skill==='phoenix'?0:1);
  }
 });
 it.each([true,false])('scales cleansing duration and healing (correct=%s)',correct=>{
  for(const [skill,base] of [['cleanse',18],['antidote',15]])for(const poison of [1,3,4]){
   const b=createBattle(party,'eclipse');b.party[0].hp=10;b.party[0].status.poison=poison;
   useSkill(b,'cleric',skill,'hero',correct);
   expect(b.party[0].status.poison).toBe(correct?undefined:Math.floor(poison/2));
   expect(b.party[0].hp).toBe(10+Math.round(base*(correct?1:.5)));
   expect(b.party[3].mp).toBe(b.party[3].maxMp-(skill==='cleanse'?2:0));
   expect(b.supplies.antidote).toBe(skill==='antidote'?1:2);
  }
 });
 it.each([true,false])('guard and shelter use nonstacking percent reduction for one enemy phase (correct=%s)',correct=>{
  const b=createBattle(party,'eclipse'),reduction=correct?.5:.25;
  useSkill(b,'hero','guard','hero',correct);b.phase='command';
  const mp=b.party[1].mp;useSkill(b,'guardian','shelter','hero',correct);
  expect(b.party[1].mp).toBe(mp-4);
  expect(b.party.map(u=>u.guardReduction)).toEqual(party.map(()=>reduction));
  b.enemies.forEach(e=>{e.intent={type:'blast',target:'hero'};});
  const events=enemyPhase(b);
  for(const enemy of b.enemies){
   const hits=events.filter(e=>e.actor===enemy.id&&e.kind==='blast');
   expect(hits).toHaveLength(4);expect(hits.map(e=>e.amount)).toEqual(party.map(()=>Math.round(Math.round(enemy.atk*(enemy.blastPower||1))*(1-reduction))));
  }
  expect(b.party.every(u=>u.guardReduction===undefined&&u.shield===0)).toBe(true);
  b.enemies.forEach(e=>{e.intent={type:'attack',target:'hero'};});
  expect(enemyPhase(b).filter(e=>e.kind==='slash').map(e=>e.amount)).toEqual(b.enemies.map(e=>e.atk));
 });
 it('guard never reduces self-inflicted poison damage',()=>{
  const b=createBattle(party,'eclipse');b.party[0].status.poison=3;
  const hp=b.party[0].hp,events=useSkill(b,'hero','guard','hero',true);
  expect(events.find(e=>e.kind==='poison').amount).toBe(Math.ceil(b.party[0].maxHp*.05));
  expect(b.party[0].hp).toBe(hp-Math.ceil(b.party[0].maxHp*.05));
 });
 it('does not let a weaker shelter overwrite a stronger guard',()=>{
  const b=createBattle(party,'eclipse');useSkill(b,'hero','guard','hero',true);b.phase='command';
  useSkill(b,'guardian','shelter','hero',false);
  expect(b.party.map(u=>u.guardReduction)).toEqual([.5,.25,.25,.25]);
 });
 it.each([['gate','oracle',.5],['belfry','bellwarden',.75]])('wrong interrupt deterministically weakens %s without cancelling', (encounter,key,factor)=>{
  const b=createBattle(['hero','duelist','mage','cleric'],encounter),caster=b.enemies.find(e=>e.key===key);
  caster.intent={type:'blast',target:'hero'};
  useSkill(b,'duelist','interrupt',caster.id,false);expect(caster.status.stun).toBe(.5);
  const hits=enemyPhase(b).filter(e=>e.actor===caster.id&&e.kind==='blast');
  expect(hits).toHaveLength(4);expect(hits.every(e=>e.amount===Math.round(caster.atk*(caster.blastPower||1)*factor))).toBe(true);
  expect(caster.status.stun).toBeUndefined();
 });
 it.each([['gate','oracle',.5],['belfry','bellwarden',.75]])('wrong interrupt carries deterministic weakening through %s charge', (encounter,key,factor)=>{
  const b=createBattle(['hero','duelist','mage','cleric'],encounter),caster=b.enemies.find(e=>e.key===key);
  useSkill(b,'duelist','interrupt',caster.id,false);enemyPhase(b);
  expect(caster.intent.type).toBe('blast');expect(caster.status.chargeBroken).toBeUndefined();
  const hits=enemyPhase(b).filter(e=>e.actor===caster.id&&e.kind==='blast');
  expect(hits).toHaveLength(4);expect(hits.every(e=>e.amount===Math.round(caster.atk*(caster.blastPower||1)*factor))).toBe(true);
  expect(caster.status.chargeWeak).toBeUndefined();
 });
 it.each(['blast','heal','revive','charge'])('wrong silence halves %s magic instead of cancelling',type=>{
  const b=createBattle(['hero','bard','mage','cleric'],'eclipse'),caster=b.enemies[0],other=b.enemies[1];
  if(type==='heal')other.hp=10;if(type==='revive')other.hp=0;
  caster.intent={type,target:['heal','revive'].includes(type)?other.id:'hero'};
  useSkill(b,'bard','hush',caster.id,false);expect(caster.status.silence).toBe(.5);
  let events=enemyPhase(b);if(type==='charge')events=enemyPhase(b);
  const hits=events.filter(e=>e.actor===caster.id&&e.kind===(['heal','revive'].includes(type)?'heal':'blast'));
  expect(hits).toHaveLength(['heal','revive'].includes(type)?1:4);
  const expected=type==='heal'?15:type==='revive'?Math.ceil(other.maxHp*.35*.5):Math.round(caster.atk*(caster.blastPower||1)*.5);
  expect(hits.every(e=>e.amount===expected)).toBe(true);
 });
 it('preserves fractional status potency and guard reduction across save/reload',()=>{
  const s=newSave();s.party=['hero','guardian','duelist','bard'];s.roster=s.party;
  s.battle=createBattle(s.party,'eclipse');
  useSkill(s.battle,'guardian','shelter','hero',false);s.battle.phase='command';
  useSkill(s.battle,'duelist','interrupt','e0',false);s.battle.phase='command';
  useSkill(s.battle,'bard','hush','e1',false);
  s.battle.party[0].status.inspired=.5;s.battle.enemies[0].status.chill=.5;s.battle.enemies[0].status.marked=.5;s.battle.enemies[0].status.chargeWeak=.5;
  const restored=sanitizeSave(JSON.parse(JSON.stringify(s))).battle;
  expect(restored.party.map(u=>u.guardReduction)).toEqual([.25,.25,.25,.25]);
  expect(restored.party[0].status.inspired).toBe(.5);
  expect(restored.enemies[0].status).toEqual(s.battle.enemies[0].status);
  expect(restored.enemies[1].status.silence).toBe(.5);
  for(const b of [restored,s.battle])b.enemies.forEach(e=>{e.intent={type:'blast',target:'hero'};});
  expect(enemyPhase(restored)).toEqual(enemyPhase(s.battle));
 });
});

describe('English Quest tactical balance contract',()=>{
 it('keeps all compositions viable with two kill priorities and mixed answers',async()=>{
  const {balanceReport,verifyBalance}=await import('../scripts/english-quest-balance.mjs');
  const report=balanceReport();expect(report.runs).toBe(840);expect(verifyBalance(report)).toEqual([]);
  expect(report.results.filter(r=>r.strategy!=='naive'&&r.result==='victory')).toHaveLength(560);
 });
 it('shows the actual telegraphed blast damage before and after a weakened charge',async()=>{
  const {intentText}=await import('../public/english-quest/engine.js');
  const b=createBattle(party,'eclipse'),king=b.enemies[0];
  expect(intentText(b,king)).toContain('64');king.intent.type='blast';king.status.chargeWeak=.5;
  expect(intentText(b,king)).toContain('48');
 });
 it('scales attack buffs and exposure deterministically without random failure',()=>{
  const b=createBattle(['hero','ranger','mage','bard'],'eclipse');
  useSkill(b,'bard','inspire','hero',false);expect(b.party.every(u=>u.status.inspired===.5)).toBe(true);b.phase='command';
  useSkill(b,'ranger','mark','e0',false);expect(b.enemies[0].status.marked).toBe(.5);b.phase='command';
  useSkill(b,'hero','break','e1',false);expect(b.enemies[1].status.exposed).toBe(1);
 });
 it('does not advertise the removed one-ally bonus rule',()=>{
  const app=readFileSync(new URL('../public/english-quest/app.js',import.meta.url),'utf8');
  expect(app).not.toContain('+25%');expect(app).not.toContain('正解で1人');
  expect(app).toContain('初回正解で全員100%');expect(app).toContain('このラウンドの効果は50%');
 });
});
