import {HEROES, ENCOUNTERS, ENEMIES, SKILLS, INTENTS} from './data.js';
import {makeHero} from './engine.js';
import {newCollection,validateCollection,grantDungeonTickets} from './collection.js';
import {enemyDefinition,pack,BASIC_IDS} from './expansion.js';
import {STATUS_NAMES} from './effects.js';
export const SAVE_KEY='english_quest_rebirth_v1';
export const LEGACY_KEY='english_quest_v2';
export const BACKUP_KEY='english_quest_v2_backup_before_rebirth';
export const COLLECTION_BACKUP_KEY=SAVE_KEY+'_before_collection_v2';
export const newSave=()=>({version:2,revision:0,collection:newCollection(),questionRecords:{},level:1,heroJob:'hero',gold:20,wins:0,ok:0,ng:0,words:{},phr:{},roster:['hero'],party:['hero'],completed:[],battle:null,settings:{sound:false,motion:'system'},legacy:null});
const number=(x,fall=0)=>Number.isFinite(x)?Math.max(0,Math.floor(x)):fall;
export function sanitizeSave(raw) {
  if(!raw||![1,2].includes(raw.version)||!Array.isArray(raw.party)||!raw.words||typeof raw.words!=='object'||Array.isArray(raw.words))throw Error('Invalid save');
  const s={...newSave(),...raw};
  s.version=2;s.revision=Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0;
  s.collection=validateCollection(raw.version===1?null:raw.collection);
  s.questionRecords=Object.fromEntries(Object.entries(raw.questionRecords||{}).filter(([id,v])=>/^q(?:_|e-)[a-z0-9_-]+$/i.test(id)&&v&&typeof v==='object').map(([id,v])=>[id,{correct:number(v.correct),wrong:number(v.wrong)}]));
  s.roster=[...new Set(['hero',...(Array.isArray(raw.roster)?raw.roster:[])])].filter(x=>HEROES[x]);
  s.party=[...new Set(['hero',...raw.party])].filter(x=>s.roster.includes(x)).slice(0,4);
  s.completed=(Array.isArray(raw.completed)?raw.completed:[]).filter(x=>ENCOUNTERS.some(e=>e.id===x));
  s.words=Object.fromEntries(Object.entries(raw.words).filter(([k,v])=>k.length<160&&v&&typeof v==='object').map(([k,v])=>[k,{o:number(v.o),n:number(v.n)}]));
  s.level=Math.min(50,Math.max(1,number(raw.level,1)));s.gold=number(raw.gold);s.ok=number(raw.ok);s.ng=number(raw.ng);s.wins=number(raw.wins);
  s.heroJob=HEROES[raw.heroJob]?raw.heroJob:'hero';
  s.presets=(Array.isArray(raw.presets)?raw.presets:[]).slice(0,4).map(p=>Array.isArray(p)&&p.length>0&&p.length<=4&&p[0]==='hero'&&new Set(p).size===p.length&&p.every(id=>s.roster.includes(id))?p:null);
  s.settings={sound:raw.settings?.sound===true,motion:['system','reduced'].includes(raw.settings?.motion)?raw.settings.motion:'system'};
  if(s.battle){
    const b=JSON.parse(JSON.stringify(s.battle));s.battle=b;
    if(b.version!==1||!ENCOUNTERS.some(e=>e.id===b.encounterId)||!['command','feedback','result'].includes(b.phase)||!Array.isArray(b.party)||!Array.isArray(b.enemies)||!Array.isArray(b.acted)||b.party.length<1||b.party.length>4||b.enemies.length<1||b.enemies.length>4||b.party.some(u=>!HEROES[u.id])||[...b.party,...b.enemies].some(u=>!Number.isFinite(u.hp)||!Number.isFinite(u.maxHp)||u.maxHp<=0||u.hp<0||u.hp>u.maxHp||!u.status||typeof u.status!=='object'))throw Error('Invalid battle snapshot');
    if(!Number.isInteger(b.round)||b.round<1||b.round>10000||!Array.isArray(b.reserve)||!Array.isArray(b.plans)||!b.supplies||!Array.isArray(b.log)||!Array.isArray(b.events))throw Error('Invalid battle state');
    const encounter=ENCOUNTERS.find(e=>e.id===b.encounterId);
    if(b.quiz){const q=b.quiz.question;if(b.phase!=='command'||!q||typeof q.prompt!=='string'||!Array.isArray(q.choices)||![3,4].includes(q.choices.length)||q.choices.filter(c=>c.correct===true).length!==1||q.choices.some(c=>typeof c.text!=='string'||typeof c.correct!=='boolean')||![null,true,false].includes(b.quiz.answered))throw Error('Invalid saved question');}
    const wave=Number.isInteger(b.wave)?b.wave:0;if(wave<0||wave>=(encounter.waves?.length||1))throw Error('Invalid wave');const keys=encounter.waves?.[wave]||encounter.enemies;
    if(b.enemies.length!==keys.length||new Set([...b.party,...b.reserve].map(u=>u.id)).size!==b.party.length+b.reserve.length||!b.party.some(u=>u.id==='hero'))throw Error('Invalid combat roster');
    const state=u=>{if(!u.status||Array.isArray(u.status))throw Error('Invalid status');return Object.fromEntries(Object.entries(u.status).filter(([key])=>['poison','exposed','marked','silence','stun','chill','inspired','chargeBroken','chargeWeak'].includes(key)).map(([key,n])=>[key,['poison','exposed'].includes(key)?Math.min(3,number(n)):Number.isFinite(n)?(n>=1?1:n>=.5?.5:0):0]));};
    const extra=u=>{
      const aura={};for(const [k,v] of Object.entries(u.aura||{})){if(!STATUS_NAMES[k]||!v||![v.power,v.turns,v.sourceAtk,v.order,v.born].every(Number.isFinite)||v.power<0||v.power>10||v.turns<1||v.turns>10||v.sourceAtk<0)throw Error('Invalid effect status');aura[k]={...v};}
      const cooldowns={};for(const [k,v] of Object.entries(u.cooldowns||{})){if(!SKILLS[k]||!Number.isInteger(v)||v<0||v>10)throw Error('Invalid cooldown');cooldowns[k]=v;}
      const remainders={};for(const [k,v] of Object.entries(u.remainders||{})){if(!Number.isFinite(v)||v<0||v>=1)throw Error('Invalid effect remainder');remainders[k]=v;}
      return {aura,cooldowns,remainders,shieldTurns:Math.min(10,number(u.shieldTurns))};
    };
    for(const list of [b.party,b.reserve])for(let i=0;i<list.length;i++){
      const u=list[i];if(!s.roster.includes(u.id)||!HEROES[u.job||u.id]||!Number.isFinite(u.hp)||!Number.isFinite(u.mp))throw Error('Invalid hero');
      const canonical=makeHero(u.id,s.level,u.job||u.id,encounter.expansion);
      list[i]={...canonical,...extra(u),hp:Math.min(canonical.maxHp,number(u.hp)),mp:Math.min(canonical.maxMp,number(u.mp)),status:state(u),shield:Math.min(Math.round(canonical.maxHp*.4),number(u.shield)),...(Number.isFinite(u.guardReduction)&&u.guardReduction>0?{guardReduction:Math.min(.5,Math.max(0,u.guardReduction))}:{})};
    }
    b.enemies=b.enemies.map((u,i)=>{
      if(u.key!==keys[i]||u.id!==`e${i}`||!INTENTS[u.intent?.type]||!Number.isInteger(u.cycle))throw Error('Invalid enemy');
      const d=enemyDefinition(u.key,encounter,ENEMIES);return {...d,...extra(u),id:u.id,key:u.key,maxHp:d.hp,hp:Math.min(d.hp,number(u.hp)),mp:0,status:state(u),shield:Math.min(Math.round(d.hp*.4),number(u.shield)),...(Number.isFinite(u.guardReduction)&&u.guardReduction>0?{guardReduction:Math.min(.5,Math.max(0,u.guardReduction))}:{}),cycle:u.cycle,protecting:b.enemies.some(e=>e.id===u.protecting)?u.protecting:null,intent:{type:u.intent.type,target:[...b.party,...b.enemies].some(e=>e.id===u.intent.target)?u.intent.target:b.party[0].id}};
    });
    if(b.plans.some(p=>!b.party.some(u=>u.id===p.actorId)||!(SKILLS[p.skillId]||p.skillId==='swap')||![...b.party,...b.reserve,...b.enemies].some(u=>u.id===p.targetId))||new Set(b.plans.map(p=>p.actorId)).size!==b.plans.length)throw Error('Invalid plan');
    b.plans=b.plans.map(({actorId,skillId,targetId})=>({actorId,skillId,targetId}));
    b.supplies={herb:Math.min(3,number(b.supplies.herb)),antidote:Math.min(2,number(b.supplies.antidote)),phoenix:Math.min(1,number(b.supplies.phoenix))};
    b.log=b.log.filter(t=>typeof t==='string').slice(-40).map(t=>t.slice(0,300));
    if(![null,'victory','defeat'].includes(b.result)||(b.result==='victory'&&b.enemies.some(u=>u.hp>0))||(b.result==='defeat'&&b.party.some(u=>u.hp>0)))throw Error('Invalid outcome');
  }
  return s;
}
export function loadSave(storage) {
  try {
    const current=storage.getItem(SAVE_KEY);
    if(current){const raw=JSON.parse(current),upgraded=sanitizeSave(raw);if(raw.version===1){if(!storage.getItem(COLLECTION_BACKUP_KEY))storage.setItem(COLLECTION_BACKUP_KEY,current);storage.setItem(SAVE_KEY,JSON.stringify(upgraded));}return {save:upgraded,notice:raw.version===1?'冒険の書を拡張しました。移行前の記録も保存しています。':''};}
    const old=storage.getItem(LEGACY_KEY);
    if(!old)return {save:newSave(),notice:''};
    const legacy=JSON.parse(old);
    if(!legacy||!Number.isFinite(legacy.lv))return {save:newSave(),notice:'旧データの形式を読み取れませんでした。元データは残っています。'};
    // Backup must succeed before migration; original key is never modified.
    if(!storage.getItem(BACKUP_KEY))storage.setItem(BACKUP_KEY,old);
    const s=newSave();s.level=Math.max(1,Math.min(30,legacy.lv));s.gold=number(legacy.gold,20);s.words=legacy.words||{};s.phr=legacy.phr||{};s.ok=number(legacy.ok);s.ng=number(legacy.ng);s.wins=number(legacy.wins);
    s.legacy={level:legacy.lv,exp:legacy.exp||0,cleared:!!legacy.cleared,talks:legacy.talks||0,importedAt:new Date().toISOString()};
    const valid=sanitizeSave(s);storage.setItem(SAVE_KEY,JSON.stringify(valid));
    return {save:valid,notice:'旧冒険のレベル・所持金・学習記録を引き継ぎました。旧データと移行前バックアップも保管しています。新しい物語は最初の街から始まります。'};
  } catch(error){return {save:newSave(),notice:'保存データを読み取れませんでした。元データは変更していません。設定からバックアップを保存できます。',blocked:true};}
}
export function persist(storage,s) {const previous=s.revision||0;try{s.revision=previous+1;storage.setItem(SAVE_KEY,JSON.stringify(s));return true;}catch{s.revision=previous;return false;}}
export function recordAnswer(s,word,correct) {
  const r=s.words[word]||(s.words[word]={o:0,n:0});r[correct?'o':'n']++;s[correct?'ok':'ng']++;
}
export function recruit(s,id){if(!BASIC_IDS.includes(id)||!HEROES[id]||s.roster.includes(id))return false;s.roster.push(id);if(s.party.length<4)s.party.push(id);return true;}
export function swapMember(s,incoming,outgoing) {
  if(s.battle||!s.roster.includes(incoming)||incoming==='hero'||outgoing==='hero')return false;
  if(s.party.includes(incoming)){s.party=s.party.filter(x=>x!==incoming);return true;}
  if(s.party.length<4){s.party.push(incoming);return true;}
  const i=s.party.indexOf(outgoing);if(i<0)return false;s.party[i]=incoming;return true;
}
export function settleBattle(s) {
  const b=s.battle;if(!b||b.phase!=='result'||!b.result)return false;
  if(b.result==='victory'){
    const e=ENCOUNTERS.find(x=>x.id===b.encounterId),first=!s.completed.includes(e.id);grantDungeonTickets(s,e);s.gold+=e.expansion?(first?e.first_clear_coins:e.repeat_clear_coins):e.reward;s.wins++;
    const gift=e.expansion&&first&&pack.progression.guaranteed_rewards[e.id];if(gift&&!s.roster.includes(gift))s.roster.push(gift);
    if(!s.completed.includes(e.id)){s.completed.push(e.id);if(!e.expansion)s.level=Math.max(s.level,1+Math.floor(s.completed.filter(id=>!ENCOUNTERS.find(e=>e.id===id)?.expansion).length/2));}
  }
  s.battle=null;return true;
}
