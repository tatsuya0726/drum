import {HEROES,SKILLS,ENCOUNTERS} from '../public/english-quest/data.js';
import {pack,STARTERS} from '../public/english-quest/expansion.js';
import {createBattle,queueAction,resolveRound,resumePlanning,alive,targetsFor} from '../public/english-quest/engine.js';
import {has} from '../public/english-quest/effects.js';
export function simulateExpansion(team,d,offset=0){
 const b=createBattle(team,d.id,d.recommendedLevel,0,team);let turns=0;
 while(!b.result&&turns<100){
  if(b.phase==='feedback')resumePlanning(b);
  const targets=b.enemies.filter(alive).sort((a,c)=>((a.action?.effects.some(e=>e.type==='heal')?-2:0)+(a.traits?.includes('regen_0.08_max_hp')?-1:0)) - ((c.action?.effects.some(e=>e.type==='heal')?-2:0)+(c.traits?.includes('regen_0.08_max_hp')?-1:0))||a.hp-c.hp);
  for(const a of b.party.filter(alive)){
   let skill='strike',target=targets[0].id;const low=[...b.party].filter(alive).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0],dead=b.party.find(u=>!alive(u));
   if(dead&&b.supplies.phoenix>b.plans.filter(p=>p.skillId==='phoenix').length){skill='phoenix';target=dead.id;}
   else if(low.hp/low.maxHp<.3&&b.supplies.herb>b.plans.filter(p=>p.skillId==='herb').length){skill='herb';target=low.id;}
   else if(a.id==='hero'){if(a.mp>=3)skill='break';}
   else {
    const id=HEROES[a.id].skills[0],s=SKILLS[id];
    if(!(a.cooldowns?.[id]>0)&&!has(a,'silence')){
      const healing=s.effects?.every(e=>e.type==='heal'||e.type==='cleanse'||e.status==='regen');
      if(!healing||low.hp/low.maxHp<.8){skill=id;target=targetsFor(b,a.id,id)[0]?.id||target;}
    }
   }
   queueAction(b,a.id,skill,target);
  }
  resolveRound(b,(turns+offset)%10>=3);turns++;
 }
 return {dungeon:d.id,team,offset,result:b.result||'timeout',turns,hp:b.party.reduce((n,u)=>n+u.hp,0)};
}
export function expansionBalance(){
 const owned=new Set(STARTERS),results=[];
 const choices=[['ember_mole','beetle-knight','lantern-moth'],['dew_slime','steam_otter','lantern-moth'],['raven-oracle','reed_archer','lantern-moth'],['leaf_mouse','moss-turtle','lantern-moth'],['mushroom-alchemist','beetle-knight','moss-turtle'],['ember_mole','coal_apprentice','moss-turtle'],['bell_robot','storm_kite','moss-turtle'],['mushroom-alchemist','shade_hare','pond_nurse']];
 for(const d of ENCOUNTERS.filter(e=>e.expansion)){
  const teams=choices.filter(t=>t.every(id=>owned.has(id))).map(t=>['hero',...t]);
  const runs=teams.flatMap(t=>[0,3,7].map(o=>simulateExpansion(t,d,o)));
  results.push({id:d.id,level:d.recommendedLevel,teams:teams.length,wins:runs.filter(r=>r.result==='victory').length,runs});
  const gift=pack.progression.guaranteed_rewards[d.id];if(gift)owned.add(gift);
 }
 return {count:results.length,failures:results.filter(r=>!r.wins).map(r=>r.id),results};
}
if(process.argv[1]?.endsWith('english-quest-expansion-balance.mjs'))console.log(JSON.stringify(expansionBalance(),null,2));
