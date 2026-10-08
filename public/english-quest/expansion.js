import pack from './expansion-pack.js';
export {pack};
export const STARTERS=['ember_mole','dew_slime','beetle-knight','lantern-moth'];
export const BASIC_IDS=['hero','guardian','mage','cleric','ranger','duelist','bard'];
export const REGIONS=pack.regions;
export function installExpansion({HEROES,SKILLS,LESSONS,ENEMIES,ENCOUNTERS}){
 const colors={fire:'#ef9b72',water:'#80cbe5',wind:'#a3d8b0',earth:'#c6bd87',light:'#ead8a0',dark:'#b9a1e0'};
 for(const a of pack.allies){
  if(HEROES[a.id])throw Error('Duplicate ally '+a.id);
  const id='sig_'+a.id,effects=a.skill.effects,first=effects[0];
  const target=first.target==='enemy'?'enemy':first.target==='all_enemies'?'enemies':first.target==='self'?'self':first.target==='ally_lowest_hp'?'ally':'allies';
  SKILLS[id]={id,en:'Invoke',ja:a.skill.name,cost:0,target,power:0,kind:'song',text:a.skill.description,effects,cooldown:a.skill.cooldown};
  const lesson=effects.some(e=>e.type==='heal')?'mend':effects.some(e=>e.type==='shield')?'shelter':effects.some(e=>e.type==='cleanse')?'cleanse':effects.some(e=>e.status==='mark')?'mark':'strike';
  LESSONS[id]=LESSONS[lesson];
  HEROES[a.id]={...a,title:a.kind,job:a.role,age:a.kind==='人'?25:null,mp:12,color:colors[a.element],sigil:'✧',quote:a.skill.description,story:a.kind+'の仲間。'+a.skill.description,skills:[id],expansion:true,artId:a.art_id||a.id};
 }
 for(const e of pack.enemies){if(ENEMIES[e.id])throw Error('Duplicate enemy '+e.id);ENEMIES[e.id]={...e,hp:100,atk:20,role:e.kind,weak:null,pattern:['attack'],expansion:true};}
 for(const d of pack.dungeons){
  if(!d.waves.length||d.waves.some(w=>!w.length||w.length>4))throw Error('Unsupported wave '+d.id);
  const r=REGIONS.find(r=>r.id===d.region);
  ENCOUNTERS.push({...d,regionId:d.region,stage:d.index,chapter:r.index,area:r.id,label:'星ことばの旅',tip:r.hint,enemies:d.waves[0],reward:d.repeat_clear_coins,firstClearTickets:d.first_clear_tickets,tickets:0,requires:d.unlock,recommendedLevel:d.recommended_level,questionDifficulty:Math.min(6,Math.ceil(r.index/2)),expansion:true});
 }
}
export function enemyDefinition(key,encounter,definitions){
 const d=definitions[key];if(!encounter.expansion)return d;
 const boss=key===encounter.boss_enemy;
 return {...d,boss,hp:Math.round(encounter.enemy_base_hp*d.hp_multiplier*(boss?encounter.boss_hp_multiplier:1)),atk:Math.round(encounter.enemy_base_atk*d.atk_multiplier*(boss?encounter.boss_atk_multiplier:1))};
}
export const isUnlocked=(save,e)=>!e.requires||save.completed.includes(e.requires);
export function collectionLevelCap(save){
 const ready=pack.dungeons.filter(d=>!d.unlock||save.completed.includes(d.unlock));
 const region=Math.max(1,...ready.map(d=>REGIONS.find(r=>r.id===d.region).index));
 const milestone=region>=9?50:region>=6?35:region>=3?20:10;
 return Math.min(50,Math.max(milestone,...ready.map(d=>d.recommended_level)));
}
export function initializeExpansion(save){
 if(save.collection?.initialized)return false;
 save.collection.initialized=true;save.collection.tickets+=5;
 for(const id of STARTERS)if(!save.roster.includes(id))save.roster.push(id);
 return true;
}
