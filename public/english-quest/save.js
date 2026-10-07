import {HEROES, ENCOUNTERS, ENEMIES, SKILLS, INTENTS} from './data.js';
import {makeHero} from './engine.js';
export const SAVE_KEY='english_quest_rebirth_v1';
export const LEGACY_KEY='english_quest_v2';
export const BACKUP_KEY='english_quest_v2_backup_before_rebirth';
export const newSave=()=>({version:1,level:1,heroJob:'hero',gold:20,wins:0,ok:0,ng:0,words:{},phr:{},roster:['hero'],party:['hero'],completed:[],battle:null,settings:{sound:false,motion:'system'},legacy:null});
const number=(x,fall=0)=>Number.isFinite(x)?Math.max(0,Math.floor(x)):fall;
export function sanitizeSave(raw) {
  if(!raw||raw.version!==1||!Array.isArray(raw.party)||!raw.words||typeof raw.words!=='object'||Array.isArray(raw.words))throw Error('Invalid save');
  const s={...newSave(),...raw};
  s.roster=[...new Set(['hero',...(Array.isArray(raw.roster)?raw.roster:[])])].filter(x=>HEROES[x]);
  s.party=[...new Set(['hero',...raw.party])].filter(x=>s.roster.includes(x)).slice(0,4);
  s.completed=(Array.isArray(raw.completed)?raw.completed:[]).filter(x=>ENCOUNTERS.some(e=>e.id===x));
  s.words=Object.fromEntries(Object.entries(raw.words).filter(([k,v])=>k.length<160&&v&&typeof v==='object').map(([k,v])=>[k,{o:number(v.o),n:number(v.n)}]));
  s.level=Math.min(30,Math.max(1,number(raw.level,1)));s.gold=number(raw.gold);s.ok=number(raw.ok);s.ng=number(raw.ng);s.wins=number(raw.wins);
  s.heroJob=HEROES[raw.heroJob]?raw.heroJob:'hero';
  s.settings={sound:raw.settings?.sound===true,motion:['system','reduced'].includes(raw.settings?.motion)?raw.settings.motion:'system'};
  if(s.battle){
    const b=JSON.parse(JSON.stringify(s.battle));s.battle=b;
    if(b.version!==1||!ENCOUNTERS.some(e=>e.id===b.encounterId)||!['command','feedback','result'].includes(b.phase)||!Array.isArray(b.party)||!Array.isArray(b.enemies)||!Array.isArray(b.acted)||b.party.length<1||b.party.length>4||b.enemies.length<1||b.enemies.length>4||b.party.some(u=>!HEROES[u.id])||[...b.party,...b.enemies].some(u=>!Number.isFinite(u.hp)||!Number.isFinite(u.maxHp)||u.maxHp<=0||u.hp<0||u.hp>u.maxHp||!u.status||typeof u.status!=='object'))throw Error('Invalid battle snapshot');
    if(!Number.isInteger(b.round)||b.round<1||b.round>10000||!Array.isArray(b.reserve)||!Array.isArray(b.plans)||!b.supplies||!Array.isArray(b.log)||!Array.isArray(b.events))throw Error('Invalid battle state');
    const encounter=ENCOUNTERS.find(e=>e.id===b.encounterId);
    if(b.enemies.length!==encounter.enemies.length||new Set([...b.party,...b.reserve].map(u=>u.id)).size!==b.party.length+b.reserve.length||!b.party.some(u=>u.id==='hero'))throw Error('Invalid combat roster');
    const state=u=>{if(!u.status||Array.isArray(u.status))throw Error('Invalid status');return Object.fromEntries(Object.entries(u.status).filter(([key])=>['poison','exposed','marked','silence','stun','chill','inspired','chargeBroken','chargeWeak'].includes(key)).map(([key,n])=>[key,Math.min(3,number(n))]));};
    for(const list of [b.party,b.reserve])for(let i=0;i<list.length;i++){
      const u=list[i];if(!s.roster.includes(u.id)||!HEROES[u.job||u.id]||!Number.isFinite(u.hp)||!Number.isFinite(u.mp))throw Error('Invalid hero');
      const canonical=makeHero(u.id,s.level,u.job||u.id);
      list[i]={...canonical,hp:Math.min(canonical.maxHp,number(u.hp)),mp:Math.min(canonical.maxMp,number(u.mp)),status:state(u),shield:Math.min(72,number(u.shield))};
    }
    b.enemies=b.enemies.map((u,i)=>{
      if(u.key!==encounter.enemies[i]||u.id!==`e${i}`||!INTENTS[u.intent?.type]||!Number.isInteger(u.cycle))throw Error('Invalid enemy');
      const d=ENEMIES[u.key];return {...d,id:u.id,key:u.key,maxHp:d.hp,hp:Math.min(d.hp,number(u.hp)),mp:0,status:state(u),shield:Math.min(72,number(u.shield)),cycle:u.cycle,protecting:b.enemies.some(e=>e.id===u.protecting)?u.protecting:null,intent:{type:u.intent.type,target:[...b.party,...b.enemies].some(e=>e.id===u.intent.target)?u.intent.target:b.party[0].id}};
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
    if(current)return {save:sanitizeSave(JSON.parse(current)),notice:''};
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
export function persist(storage,s) {try{storage.setItem(SAVE_KEY,JSON.stringify(s));return true;}catch{return false;}}
export function recordAnswer(s,word,correct) {
  const r=s.words[word]||(s.words[word]={o:0,n:0});r[correct?'o':'n']++;s[correct?'ok':'ng']++;
}
export function recruit(s,id){if(!HEROES[id]||s.roster.includes(id))return false;s.roster.push(id);if(s.party.length<4)s.party.push(id);return true;}
export function swapMember(s,incoming,outgoing) {
  if(s.battle||!s.roster.includes(incoming)||incoming==='hero'||outgoing==='hero')return false;
  if(s.party.includes(incoming)){s.party=s.party.filter(x=>x!==incoming);return true;}
  if(s.party.length<4){s.party.push(incoming);return true;}
  const i=s.party.indexOf(outgoing);if(i<0)return false;s.party[i]=incoming;return true;
}
export function settleBattle(s) {
  const b=s.battle;if(!b||b.phase!=='result'||!b.result)return false;
  if(b.result==='victory'){
    const e=ENCOUNTERS.find(x=>x.id===b.encounterId);s.gold+=e.reward;s.wins++;
    if(!s.completed.includes(e.id)){s.completed.push(e.id);s.level=Math.max(s.level,1+Math.floor(s.completed.length/2));}
  }
  s.battle=null;return true;
}
