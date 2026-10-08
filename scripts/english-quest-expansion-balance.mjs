import {HEROES,SKILLS,ENCOUNTERS} from '../public/english-quest/data.js';
import {pack,STARTERS,GUARANTEED_REWARDS,collectionLevelCap} from '../public/english-quest/expansion.js';
import {createBattle,queueAction,resolveRound,resumePlanning,alive,targetsFor} from '../public/english-quest/engine.js';
import {has} from '../public/english-quest/effects.js';
import {newSave,settleBattle} from '../public/english-quest/save.js';
import {initializeExpansion} from '../public/english-quest/expansion.js';
export function simulateExpansion(team,d,offset=0,naive=false){
 const b=createBattle(team,d.id,d.recommendedLevel,0,team);let turns=0,correctCount=0,wrongCount=0;
 while(!b.result&&turns<100){
  if(b.phase==='feedback')resumePlanning(b);
  const targets=b.enemies.filter(alive).sort((a,c)=>((a.action?.effects.some(e=>e.type==='heal')?-2:0)+(a.traits?.includes('regen_0.08_max_hp')?-1:0)) - ((c.action?.effects.some(e=>e.type==='heal')?-2:0)+(c.traits?.includes('regen_0.08_max_hp')?-1:0))||a.hp-c.hp);
  for(const a of b.party.filter(alive)){
   let skill='strike',target=targets[0].id;const low=[...b.party].filter(alive).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0],dead=b.party.find(u=>!alive(u));
   if(naive){}
   else if(dead&&b.supplies.phoenix>b.plans.filter(p=>p.skillId==='phoenix').length){skill='phoenix';target=dead.id;}
   else if(low.hp/low.maxHp<.3&&b.supplies.herb>b.plans.filter(p=>p.skillId==='herb').length){skill='herb';target=low.id;}
   else if(a.id==='hero'){if(a.mp>=3)skill='break';}
   else {
    const id=HEROES[a.id].skills[0],s=SKILLS[id];
    if(!(a.cooldowns?.[id]>0)&&!has(a,'silence')){
      const healing=s.effects?.every(e=>e.type==='heal'||e.type==='cleanse'||e.status==='regen');
      if(!healing||low.hp/low.maxHp<.8){skill=id;if(s.target!=='enemy')target=targetsFor(b,a.id,id)[0]?.id||target;}
    }
   }
   queueAction(b,a.id,skill,target);
  }
  const correct=(turns+offset)%10>=3;if(correct)correctCount++;else wrongCount++;resolveRound(b,correct);turns++;
 }
 return {dungeon:d.id,team,offset,result:b.result||'timeout',turns,correctCount,wrongCount,hp:b.party.reduce((n,u)=>n+u.hp,0),battle:b};
}
export function chronologicalCampaign(offset=0){
 const s=newSave();initializeExpansion(s);const runs=[];let questionIndex=offset,correctCount=0,wrongCount=0;
 const plans={grass:['ember_mole','beetle-knight','lantern-moth'],dew:['dew_slime','steam_otter','lantern-moth'],ember:['ember_mole','coal_apprentice','lantern-moth'],forest:['leaf_mouse','moss-turtle','lantern-moth'],dusk:['raven-oracle','reed_archer','lantern-moth'],stone:['mushroom-alchemist','beetle-knight','moss-turtle'],marsh:['mushroom-alchemist','pond_nurse','beetle-knight'],sky:['bell_robot','storm_kite','moss-turtle'],mirror:['mushroom-alchemist','shade_hare','pond_nurse'],clock:['bell_robot','storm_kite','pond_nurse'],garden:['ember_mole','coal_apprentice','moss-turtle'],words:['raven-oracle','reed_archer','moss-turtle']};
 for(const d of ENCOUNTERS.filter(e=>e.expansion)){
  if(d.requires&&!s.completed.includes(d.requires))throw Error('Locked '+d.id);
  const cap=collectionLevelCap(s);if(cap<d.recommendedLevel)throw Error('Illegal level '+d.id);
  while(s.level<d.recommendedLevel){const cost=20+5*s.level;if(s.gold<cost)throw Error('Cannot afford recommended level before '+d.id);s.gold-=cost;s.level++;}
  // The fourth final-region stage has sustained multi-wave pressure; use the
  // already-owned tank/healer core rather than the mark burst formation.
  const team=['hero',...(d.id==='words_04'?plans.grass:plans[d.regionId])];if(team.some(id=>!s.roster.includes(id)))throw Error('Future reward used '+d.id);s.party=[...team];
  const r=simulateExpansion(team,d,questionIndex);runs.push({dungeon:d.id,team,level:s.level,cap,goldBefore:s.gold,ownedBefore:[...s.roster],answerStartIndex:questionIndex,correctCount:r.correctCount,wrongCount:r.wrongCount,result:r.result,turns:r.turns,hp:r.hp});questionIndex+=r.turns;correctCount+=r.correctCount;wrongCount+=r.wrongCount;
  if(r.result!=='victory')return {offset,failed:d.id,runs};
  s.battle=r.battle;settleBattle(s);
 }
 return {offset,failed:null,runs,final:{gold:s.gold,level:s.level,tickets:s.collection.tickets,drawCount:s.collection.drawCount,owned:s.roster.length,correctCount,wrongCount,accuracy:correctCount/(correctCount+wrongCount)}};
}
export function expansionBalance(){
 const owned=new Set(STARTERS),results=[];
 const choices=[['ember_mole','beetle-knight','lantern-moth'],['dew_slime','steam_otter','lantern-moth'],['raven-oracle','reed_archer','lantern-moth'],['leaf_mouse','moss-turtle','lantern-moth'],['mushroom-alchemist','beetle-knight','moss-turtle'],['ember_mole','coal_apprentice','moss-turtle'],['bell_robot','storm_kite','moss-turtle'],['mushroom-alchemist','shade_hare','pond_nurse']];
 for(const d of ENCOUNTERS.filter(e=>e.expansion)){
  const teams=choices.filter(t=>t.every(id=>owned.has(id))).map(t=>['hero',...t]);
  const runs=teams.flatMap(t=>[0,3,7].map(o=>{const {battle,...r}=simulateExpansion(t,d,o);return r;}));
  results.push({id:d.id,level:d.recommendedLevel,teams:teams.length,wins:runs.filter(r=>r.result==='victory').length,runs});
  for(const gift of GUARANTEED_REWARDS[d.id]||[])owned.add(gift);
 }
 return {count:results.length,failures:results.filter(r=>!r.wins).map(r=>r.id),results};
}
if(process.argv[1]?.endsWith('english-quest-expansion-balance.mjs'))console.log(JSON.stringify({errorSequence:'Chronological campaign: continuous question index across battles, incorrect on (questionIndex+offset)%10 in [0,1,2], correct otherwise; offsets 0,3,7. Composition probes restart that pattern per battle. No answer retry restores potency.',campaigns:[0,3,7].map(chronologicalCampaign),compositions:expansionBalance()},null,2));
