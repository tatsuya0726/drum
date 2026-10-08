import {HEROES, SKILLS, ENEMIES, ENCOUNTERS, LESSONS, INTENTS} from './data.js';
export const alive = u => u.hp > 0;
const clone = x => JSON.parse(JSON.stringify(x));
export function makeHero(id, level=1, job=null) {
  const d=HEROES[job||id], bonus=Math.min(20, Math.max(0,level-1)*3);
  return {id,job:job||id,name:HEROES[id].name,maxHp:d.hp+bonus,hp:d.hp+bonus,maxMp:d.mp,mp:d.mp,atk:d.atk+Math.floor(bonus/3),status:{},shield:0};
}
export function createBattle(party, encounterId, level=1, variant=0, roster=party, heroJob='hero') {
  const encounter=ENCOUNTERS.find(x=>x.id===encounterId);
  if (!encounter || !Array.isArray(party) || party.length<1 || party.length>4 || new Set(party).size!==party.length || party.some(id=>!HEROES[id])) throw Error('Invalid party or encounter');
  const b={version:1,encounterId,round:1,phase:'command',party:party.map(id=>makeHero(id,level,id==='hero'?heroJob:null)),reserve:roster.filter(id=>!party.includes(id)).map(id=>makeHero(id,level)),enemies:encounter.enemies.map((key,i)=>({...clone(ENEMIES[key]),id:`e${i}`,key,maxHp:ENEMIES[key].hp,mp:0,status:{},shield:0,cycle:ENEMIES[key].pattern.includes('charge')?0:(variant+i)%ENEMIES[key].pattern.length})),acted:[],plans:[],supplies:{herb:3,antidote:2,phoenix:1},log:[],events:[],feedback:null,result:null};
  planEnemies(b);return b;
}
export const currentActor = b => b.party.find(u=>alive(u)&&!b.acted.includes(u.id));
export function targetsFor(b, actorId, skillId) {
  const s=SKILLS[skillId]; if(!s)return [];
  if(s.target==='self')return b.party.filter(u=>u.id===actorId&&alive(u));
  if(s.target==='fallen')return b.party.filter(u=>!alive(u));
  return (['ally','allies'].includes(s.target)?b.party:b.enemies).filter(alive);
}
export function availableSkills(actor) {return ['strike',...HEROES[actor.job||actor.id].skills.filter(x=>x!=='strike'),'guard','herb','antidote','phoenix'];}
function event(b, actor, target, text, kind, amount=0) {
  b.events.push({actor:actor?.id,target:target?.id,text,kind,amount,hp:target?.hp,shield:target?.shield,guardReduction:target?.guardReduction||0});
  b.log.push(text); b.log=b.log.slice(-40);
}
export function planEnemies(b) {
  const living=b.party.filter(alive);
  b.enemies.filter(alive).forEach((e,i)=>{
    let type=e.pattern[(b.round-1+e.cycle)%e.pattern.length];
    if(type==='revive'&&!b.enemies.some(x=>!alive(x)))type='poison';
    if(type==='heal'&&!b.enemies.some(x=>alive(x)&&x.hp<x.maxHp))type='attack';
    if(type==='protect'&&b.enemies.filter(alive).length<2)type='attack';
    const target=type==='revive'?b.enemies.find(x=>!alive(x)):
      type==='heal'?[...b.enemies].filter(alive).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0]:
      type==='protect'?b.enemies.find(x=>alive(x)&&x.id!==e.id):living[(b.round+i-1)%Math.max(1,living.length)];
    e.intent={type,target:target?.id};
    // A protection telegraph is already a stance. It is broken when its guardian falls or is interrupted.
    e.protecting=type==='protect'?target?.id:null;
  });
}
export function intentText(b,e) {
  const d=INTENTS[e.intent?.type]; if(!d)return '行動済み';
  const t=[...b.party,...b.enemies].find(u=>u.id===e.intent.target);
  if(e.intent.type==='blast'&&e.status.chargeBroken)return '◇ 詠唱中断済み · この大技は不発';
  const value=e.intent.type==='heal'?' +30':e.intent.type==='revive'?' HP35%':e.intent.type==='protect'?' 軽減40%':e.intent.type==='charge'?` 次回全体 ${Math.round(e.atk*(e.blastPower||1))}`:` ${e.intent.type==='blast'?Math.round(e.atk*(e.blastPower||1)*(1-.5*(e.status.chargeWeak||0))):e.atk}${e.intent.type==='blast'&&e.status.chargeWeak?'（詠唱妨害で軽減）':''}`;
  return `${d.icon} ${d.en} · ${d.ja}${value}${['charge','blast'].includes(e.intent.type)?'':t?' → '+t.name:''}`;
}
function damage(b,actor,target,amount,kind,bypass=false) {
  if(actor!==target)amount *= 1-(target.guardReduction||0);
  const absorbed=bypass?0:Math.min(target.shield||0,amount);
  target.shield=Math.max(0,(target.shield||0)-absorbed);
  const hit=Math.max(0,Math.round(amount-absorbed));target.hp=Math.max(0,target.hp-hit);
  event(b,actor,target,`${actor.name} → ${target.name}：${hit}ダメージ${absorbed?' / 盾が'+absorbed+'吸収':''}`,kind,hit);
  if(!alive(target)){target.status={};target.protecting=null;event(b,actor,target,`${target.name}は倒れた。`,'defeat');}
}
function heal(b,actor,target,amount,revive=false) {
  if(!alive(target)&&!revive)return;
  const n=Math.min(target.maxHp-target.hp,amount);target.hp+=n;
  if(revive)target.status={};
  event(b,actor,target,`${actor.name} → ${target.name}：${revive?'蘇生 / ':''}HP +${n}`,'heal',n);
}
export function outcome(b) {
  if(!b.party.some(alive))return 'defeat';
  if(!b.enemies.some(alive))return 'victory';
  return null;
}
export function useSkill(b,actorId,skillId,targetId,correct=true) {
  if(b.phase!=='command'||b.result)throw Error('Action is locked');
  const actor=b.party.find(x=>x.id===actorId),skill=SKILLS[skillId];
  if(!actor||!alive(actor)||b.acted.includes(actorId)||!availableSkills(actor).includes(skillId))throw Error('Actor cannot act');
  if(actor.mp<skill.cost)throw Error('Not enough focus');
  if(skill.supply&&!b.supplies[skill.supply])throw Error('No supplies');
  const candidates=targetsFor(b,actorId,skillId);
  const target=candidates.find(x=>x.id===targetId);
  if(!target)throw Error('Choose a living / valid target again');
  b.events=[];actor.mp-=skill.cost;b.acted.push(actorId);if(skill.supply)b.supplies[skill.supply]--;
  const potency=correct?1:.5;
  const teamSkill=['allies','enemies'].includes(skill.target);
  let targets=teamSkill?candidates:[target];
  if(['enemy','enemies'].includes(skill.target)&&!teamSkill&&!skill.bypass){
    const protector=b.enemies.find(e=>alive(e)&&e.protecting===target.id&&e.status.stun!==1&&e.status.silence!==1);
    if(protector)event(b,protector,target,`${protector.name}が${target.name}を護衛。ダメージ${40*(1-Math.max(protector.status.stun||0,protector.status.silence||0))}%軽減。`,'guard');
  }
  if(skill.power)targets.forEach(t=>{
    const exposed=t.status.exposed>0,marked=t.status.marked>0;
    const weak=t.weak===(skill.element||'physical') || (skillId==='frost'&&t.weak==='ice');
    const protector=!skill.bypass&&b.enemies.find(e=>alive(e)&&e.protecting===t.id);
    const protection=protector ? .4*(1-Math.max(protector.status.stun||0,protector.status.silence||0)):0;
    let amount=actor.atk*skill.power*(weak?1.3:1)*(exposed?1.35:1)*(1+.5*(t.status.marked||0))*(1+.4*(actor.status.inspired||0))*(1-protection);
    if(skillId==='ignite'&&marked)amount+=12*t.status.marked;
    if(skillId==='sever'&&exposed)amount+=10;
    damage(b,actor,t,Math.round(amount*potency),skill.kind,skill.bypass);
    if(exposed)t.status.exposed--;if(marked)t.status.marked=0;
    if(skill.effect&&alive(t))t.status[skill.effect]=skill.effect==='exposed'?(correct?2:1):potency;
  });
  if(skill.power)actor.status.inspired=0;
  {
    if(skillId==='mend'||skillId==='herb')heal(b,actor,target,Math.round((skillId==='mend'?42:35)*potency));
    if(skillId==='revive'||skillId==='phoenix')heal(b,actor,target,Math.ceil(target.maxHp*.45*potency),true);
    if(skillId==='cleanse'||skillId==='antidote'){if(correct)delete target.status.poison;else if(target.status.poison)target.status.poison=Math.floor(target.status.poison/2);heal(b,actor,target,Math.round((skillId==='antidote'?15:18)*potency));}
    if(skillId==='guard'||skillId==='shelter')targets.forEach(t=>{t.guardReduction=Math.max(t.guardReduction||0,.5*potency);event(b,actor,t,`${t.name}：次の敵ターンのダメージを${50*potency}%軽減`,'guard');});
    if(skillId==='inspire')targets.forEach(t=>{t.status.inspired=potency;event(b,actor,t,`${t.name}の次の一撃を鼓舞。`,'song');});
  }
  if(skillId==='strike'||skillId==='guard')actor.mp=Math.min(actor.maxMp,actor.mp+(skillId==='guard'?3:2));
  if(actor.status.poison&&alive(actor))damage(b,actor,actor,Math.ceil(actor.maxHp*.05),'poison',true);
  b.phase='feedback';b.result=outcome(b);
  return clone(b.events);
}
export function continueBattle(b) {
  if(b.phase!=='feedback')throw Error('No result to continue');
  b.feedback=null;
  if(b.result){b.phase='result';return [];}
  if(currentActor(b)){b.phase='command';return [];}
  b.events=[];
  b.enemies.filter(alive).forEach(e=>{
    if(!b.party.some(alive))return;
    const type=e.intent.type;
    if(type==='charge'&&(e.status.silence===1||(e.status.stun===1&&!e.boss)))e.status.chargeBroken=1;
    if(type==='charge'&&!e.status.chargeBroken&&(e.status.stun||e.status.silence))e.status.chargeWeak=e.status.silence*2||e.status.stun*(e.boss?1:2);
    if(type==='blast'&&e.status.chargeBroken){event(b,e,e,`${e.name}：詠唱が崩れ、大技は不発。`,'stun');delete e.status.chargeBroken;delete e.status.chargeWeak;delete e.status.stun;delete e.status.silence;delete e.status.chill;return;}
    if(e.status.stun===1&&!e.boss){event(b,e,e,`${e.name}：行動を中断された。`,'stun');delete e.status.stun;delete e.status.silence;delete e.status.chill;if(type==='blast')delete e.status.chargeWeak;e.protecting=null;return;}
    if(e.status.silence===1&&['heal','revive','charge','blast'].includes(type)){
      event(b,e,e,`${e.name}：沈黙で${INTENTS[type].ja}を封じた。`,'silence');e.status={...e.status,silence:0,stun:0,chill:0};if(type==='blast')delete e.status.chargeWeak;return;
    }
    const reduction=Math.max(.5*(e.status.chill||0),(e.boss ? .5 : 1)*(e.status.stun||0),['heal','revive','blast'].includes(type)?(e.status.silence||0):0,type==='blast'?.5*(e.status.chargeWeak||0):0);
    const amount=Math.round(e.atk*(type==='blast'?(e.blastPower||1):1)*(1-reduction));
    const target=b.party.find(u=>u.id===e.intent.target&&alive(u))||b.party.find(alive);
    if(type==='heal'){
      const t=b.enemies.find(u=>u.id===e.intent.target&&alive(u))||b.enemies.filter(alive).sort((a,c)=>a.hp-c.hp)[0];
      if(t)heal(b,e,t,Math.round(30*(1-reduction)));
    }else if(type==='revive'){
      const t=b.enemies.find(u=>u.id===e.intent.target&&!alive(u))||b.enemies.find(u=>!alive(u));
      if(t)heal(b,e,t,Math.ceil(t.maxHp*.35*(1-reduction)),true);else event(b,e,e,`${e.name}：蘇生対象がいない。`,'miss');
    }else if(type==='charge')event(b,e,e,`${e.name}は力を蓄えている。次の大技に備えよう。`,'charge');
    else if(type==='protect')event(b,e,e,`${e.name}は護衛の構えを維持した。`,'guard');
    else if(type==='blast')b.party.filter(alive).forEach(t=>damage(b,e,t,amount,'blast'));
    else if(target){
      damage(b,e,target,amount,type==='poison'?'poison':'slash');
      if(type==='poison'&&alive(target)){target.status.poison=3;event(b,e,target,`${target.name}に毒。行動後に最大HPの5%ダメージ。`,'poison');}
      if(type==='drain')heal(b,e,e,Math.round(amount/2));
    }
    delete e.status.stun;delete e.status.chill;delete e.status.silence;if(type==='blast')delete e.status.chargeWeak;e.protecting=null;
  });
  b.party.forEach(u=>{u.shield=0;delete u.guardReduction;u.mp=Math.min(u.maxMp,u.mp+2);if(u.status.poison)u.status.poison--;});
  b.result=outcome(b);b.phase=b.result?'result':'command';b.round++;b.acted=[];
  if(!b.result)planEnemies(b);
  return clone(b.events);
}
export function queueAction(b,actorId,skillId,targetId) {
  if(b.phase!=='command'||b.result)throw Error('現在は計画を変更できません。');
  const actor=b.party.find(u=>u.id===actorId&&alive(u));
  if(!actor)throw Error('行動できる仲間を選んでください。');
  if(skillId==='swap') {
    if(actorId==='hero'||!b.reserve.some(u=>u.id===targetId&&alive(u))||b.plans.some(p=>p.actorId!==actorId&&p.skillId==='swap'&&p.targetId===targetId))throw Error('その交代はできません。');
  } else {
    const s=SKILLS[skillId];
    if(!s||!availableSkills(actor).includes(skillId)||actor.mp<s.cost)throw Error('集中力が不足しています。');
    if(!targetsFor(b,actorId,skillId).some(t=>t.id===targetId))throw Error('対象を選び直してください。');
    if(s.supply&&b.plans.filter(p=>p.actorId!==actorId&&p.skillId===skillId).length>=b.supplies[s.supply])throw Error('支給品が不足しています。');
  }
  const plan={actorId,skillId,targetId};const i=b.plans.findIndex(p=>p.actorId===actorId);
  if(i<0)b.plans.push(plan);else b.plans[i]=plan;
  return plan;
}
export function resolveRound(b, correct) {
  if(b.phase!=='command'||b.result||b.party.filter(alive).some(u=>!b.plans.some(p=>p.actorId===u.id)))throw Error('全員の行動を決めてください。');
  const events=[];
  for(const p of b.plans){
    if(outcome(b))break;
    const actor=b.party.find(u=>u.id===p.actorId&&alive(u));if(!actor)continue;
    if(p.skillId==='swap'){
      const i=b.reserve.findIndex(u=>u.id===p.targetId&&alive(u));if(i<0)continue;
      const incoming=b.reserve[i],slot=b.party.indexOf(actor);b.party[slot]=incoming;b.reserve[i]=actor;b.acted.push(incoming.id);
      b.events=[];event(b,actor,incoming,`${actor.name} → ${incoming.name}に交代。次ラウンドから行動。`,'swap');events.push(...b.events);continue;
    }
    const choices=targetsFor(b,actor.id,p.skillId);
    const target=choices.find(t=>t.id===p.targetId)||([...choices].sort((a,c)=>a.hp-c.hp)[0]);
    if(!target){b.acted.push(actor.id);b.events=[];event(b,actor,actor,`${actor.name}：有効な対象なし。資源は消費しない。`,'miss');events.push(...b.events);continue;}
    events.push(...useSkill(b,actor.id,p.skillId,target.id,correct));
    b.phase='command';
  }
  b.phase='feedback';b.result=outcome(b);b.plans=[];b.acted=b.party.map(u=>u.id);
  // Complete one enemy phase after every allied round, regardless of the answer.
  events.push(...continueBattle(b));b.phase=b.result?'result':'feedback';b.events=events;
  return clone(events);
}
export function resumePlanning(b){if(b.phase==='feedback'&&!b.result){b.phase='command';b.feedback=null;}}
export function makeQuestion(skillId, records={}, rng=Math.random) {
  const l=LESSONS[skillId];
  // Alternate command meaning and transfer to an everyday sentence. Mistakes keep both contexts active.
  const record=records[l.word]||{o:0,n:0};
  const item=l.cases[(record.o+record.n)%l.cases.length];
  const choices=item.slice(1).map((text,i)=>({text,correct:i===0}));
  for(let i=choices.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
  return {skillId,word:l.word,prompt:item[0],choices,meaning:l.meaning,core:l.core,example:l.example,translation:l.translation};
}
