// Ordered, deterministic effects. New statuses are separate from legacy counters.
export const STATUS_NAMES={wet:'ぬれ',seed:'たね',mark:'しるし',burn:'火傷',poison:'毒',weaken:'攻撃低下',armor_break:'装甲崩し',attack_up:'攻撃強化',guard:'守り',regen:'継続回復',taunt:'おとり',slow:'鈍化',focus:'集中',thorns:'反撃',silence:'沈黙',heal_down:'回復低下'};
export const BUFFS=new Set(['attack_up','guard','regen','taunt','focus','thorns']);
export const mag=(u,k)=>u.aura?.[k]?.power||0;
export const has=(u,k)=>!!u.aura?.[k];
export const attackStat=u=>u.atk*(1+Math.min(.4,mag(u,'attack_up')))*(1-Math.min(.4,mag(u,'weaken')+mag(u,'slow')));
const living=xs=>xs.filter(u=>u.hp>0);
const lowest=xs=>[...living(xs)].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
export function effectTargets(b,actor,e,selected,enemy=false){
 const own=enemy?b.enemies:b.party,foes=enemy?b.party:b.enemies;
 switch(e.target){
 case 'self':case 'enemy_self':return [actor];
 case 'enemy':return living(foes).filter(u=>u.id===(selected?.id||selected));
 case 'all_enemies':return living(b.enemies);
 case 'all_allies':return living(b.party);
 case 'ally_lowest_hp':{const pool=enemy?foes:own;const taunt=enemy&&e.type==='damage'?living(pool).find(u=>has(u,'taunt')):null;return [taunt||lowest(pool)].filter(Boolean);}
 case 'enemy_lowest_hp':return [lowest(b.enemies)].filter(Boolean);
 case 'ally_highest_atk':return [...living(b.party)].sort((a,c)=>attackStat(c)-attackStat(a)).slice(0,1);
 default:throw Error('Unknown effect target '+e.target);
 }
}
function condition(c,b,a,t){
 if(!c)return true;
 return Object.entries(c).every(([k,v])=>{
  if(k==='target_has_status')return has(t,v);
  if(k==='target_lacks_status')return !has(t,v);
  if(k==='self_has_status')return has(a,v);
  if(k==='party_tag_count_gte')return b.party.filter(u=>u.hp>0&&u.tags?.includes(v.tag)).length>=v.count;
  if(k==='target_hp_below')return t.hp/t.maxHp<v;
  if(k==='ally_hp_below')return b.party.some(u=>u.hp>0&&u.hp/u.maxHp<v);
  if(k==='target_is_shielded')return (t.shield>0)===v;
  throw Error('Unknown effect condition '+k);
 });
}
export function applyEffects(b,actor,effects,selected,potency,api,{enemy=false,skillId='enemy'}={}){
 actor.remainders||={};
 effects.forEach((e,index)=>{
  if(actor.hp<=0)return;
  const targets=effectTargets(b,actor,e,selected,enemy).filter(t=>(!e.exclude_self||t!==actor)&&condition(e.condition,b,actor,t));
  if(!targets.length)return;
  let count=0;
  if(['cleanse','dispel','cooldown_reduce'].includes(e.type)){const key=skillId+':'+index,total=(actor.remainders[key]||0)+(e.count||1)*potency;count=Math.floor(total);actor.remainders[key]=total-count;}
  for(const t of targets){
   const value=Math.max(1,Math.round((e.max_hp_ratio?t.maxHp*e.max_hp_ratio:attackStat(actor)*(e.power||0))*potency));
   if(e.type==='damage')api.damage(b,actor,t,value,'slash',false,{single:!e.target.startsWith('all_')});
   else if(e.type==='heal')api.heal(b,actor,t,value);
   else if(e.type==='shield'){t.shield=Math.min(Math.round(t.maxHp*.4),(t.shield||0)+value);t.shieldTurns=Math.max(t.shieldTurns||0,e.duration||1);api.event(b,actor,t,t.name+'：盾 '+t.shield,'guard');}
   else if(e.type==='apply_status'&&t.hp>0){
    t.aura||={};const old=t.aura[e.status],duration=Math.max(1,(e.duration||1)-(t.traits?.includes(e.status+'_resist_duration_minus_1')?1:0));
    const power=(e.power||0)*potency,sourceAtk=attackStat(actor),numeric=['burn','poison','regen','thorns'].includes(e.status),strength=power*sourceAtk;
    const preserve=old&&(numeric?(old.strength??old.power*old.sourceAtk)>strength:old.power>power);
    t.aura[e.status]={power:preserve?old.power:power,turns:Math.max(old?.turns||0,e.status==='silence'?1:duration),sourceAtk:preserve?old.sourceAtk:sourceAtk,strength:preserve?(old.strength??old.power*old.sourceAtk):strength,source:preserve?old.source:actor.id,order:old?.order??(b.effectOrder=(b.effectOrder||0)+1),born:b.round};
    api.event(b,actor,t,t.name+'：'+STATUS_NAMES[e.status]+(potency===.5?'（半分）':''),'song');
   }else if(e.type==='cleanse'||e.type==='dispel'){
    const buff=e.type==='dispel';const keys=Object.entries(t.aura||{}).filter(([k])=>BUFFS.has(k)===buff).sort(([ka,a],[kb,c])=>a.order-c.order||ka.localeCompare(kb)).map(([k])=>k);
    if(buff&&t.shield>0)keys.unshift('$shield');
    if(!buff&&t.status?.poison)keys.push('$poison');
    keys.slice(0,count).forEach(k=>{if(k==='$shield'){t.shield=0;t.shieldTurns=0;}else if(k==='$poison')delete t.status.poison;else delete t.aura[k];});
    api.event(b,actor,t,t.name+'：'+(buff?'強化解除':'浄化')+(count?'':'（半分を蓄積）'),'song');
   }else if(e.type==='cooldown_reduce'){
    if(t.reductionRound!==b.round){t.reductionRound=b.round;t.reductionUsed=0;}
    const actual=Math.min(count,1-(t.reductionUsed||0));t.reductionUsed=(t.reductionUsed||0)+actual;
    for(const k of Object.keys(t.cooldowns||{}))t.cooldowns[k]=Math.max(0,t.cooldowns[k]-actual);
   }
  }
  if(e.consume_status){if(e.consume_status.startsWith('self:'))delete actor.aura?.[e.consume_status.slice(5)];else targets.forEach(t=>{delete t.aura?.[e.consume_status];});}
 });
}
export function tickEffects(b,api){
 const all=[...b.party,...b.enemies];
 for(const u of all){
  if(u.hp<=0)continue;
  for(const [key,s] of Object.entries(u.aura||{})){
   const source=all.find(x=>x.id===s.source)||u;
   if(['burn','poison'].includes(key)){const resist=u.traits?.includes(key+'_resist_50')?.5:1;api.damage(b,source,u,Math.max(1,Math.round((s.strength??s.power*s.sourceAtk)*resist)),key,false,{dot:true});}
   if(u.hp>0&&key==='regen')api.heal(b,source,u,Math.max(1,Math.round(s.strength??s.power*s.sourceAtk)));
   // Enemy-applied silence must survive to the next allied command round.
   const waiting=['silence','weaken','slow','heal_down'].includes(key)&&s.born===b.round&&b.enemies.some(e=>e.id===s.source)&&b.party.includes(u);
   if(!waiting&&--s.turns<=0)delete u.aura[key];
   if(u.hp<=0)break;
  }
  if(u.hp>0&&u.traits?.includes('regen_0.08_max_hp'))api.heal(b,u,u,Math.round(u.maxHp*.08));
  if(u.shieldTurns&&--u.shieldTurns<=0)u.shield=0;
 }
 for(const u of [...b.party,...b.reserve])for(const k of Object.keys(u.cooldowns||{}))u.cooldowns[k]=Math.max(0,u.cooldowns[k]-1);
}
