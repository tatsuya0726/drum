// Earned tickets only. Pure, injected-RNG operations; persistence happens before reveal.
import {pack} from './expansion.js';
export const RECRUITMENT_RULES=Object.freeze({version:2,cost:1,rates:{1:.45,2:.35,3:.16,4:.04},srGuarantee:10,ssrGuarantee:30,duplicateShards:{1:1,2:1,3:1,4:1},exchangeCost:{1:6,2:10,3:18,4:30}});
const copy=x=>JSON.parse(JSON.stringify(x));
const integer=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid '+label);return n;};
export const newCollection=()=>({version:1,tickets:0,shards:0,drawCount:0,srMisses:0,ssrMisses:0,sequence:0,pages:0,stamps:0,initialized:false,rewardedRuns:[],lastReceipt:null});
export const nextRarityOdds=c=>c.ssrMisses>=29?{1:0,2:0,3:0,4:1}:c.srMisses>=9?{1:0,2:0,3:.8,4:.2}:{...RECRUITMENT_RULES.rates};
export function validateCollection(raw){
 const c={...newCollection(),...copy(raw||{})};if(c.version!==1)throw Error('Unknown collection version');
 for(const k of ['tickets','shards','drawCount','sequence','srMisses','ssrMisses','pages','stamps'])integer(c[k],k);
 if(c.srMisses>=10||c.ssrMisses>=30||c.stamps>=3)throw Error('Invalid guarantee counter');
 if(c.lastReceipt&&(c.lastReceipt.sequence!==c.sequence||typeof c.lastReceipt.operation!=='string'))throw Error('Invalid receipt');
 if(!Array.isArray(c.rewardedRuns)||c.rewardedRuns.some(x=>typeof x!=='string'))throw Error('Invalid rewarded runs');
 return c;
}
function random(rng){const x=rng();if(!Number.isFinite(x)||x<0||x>=1)throw Error('RNG must be in [0,1)');return x;}
function prepare(save,sequence,operation){
 const next=copy(save);next.collection=validateCollection(next.collection);const c=next.collection;
 integer(sequence,'sequence');
 if(c.lastReceipt?.sequence===sequence&&c.lastReceipt.operation===operation)return {state:next,receipt:copy(c.lastReceipt),replayed:true};
 if(sequence!==c.sequence+1)throw Error('Stale collection operation');
 if(save.battle)throw Error('Return to town first');
 return {state:next,receipt:null,replayed:false};
}
function complete(result,sequence,operation,receipt){const c=result.state.collection;c.sequence=sequence;c.lastReceipt={sequence,operation,...receipt};validateCollection(c);result.receipt=copy(c.lastReceipt);return result;}
export function drawRecruit(save,catalog,sequence,rng=Math.random){
 const r=prepare(save,sequence,'draw');if(r.replayed)return r;const c=r.state.collection;
 if(c.tickets<1)throw Error('Not enough earned tickets');
 const pools=Object.fromEntries([1,2,3,4].map(t=>[t,catalog.filter(x=>x.rarity===t&&x.recruitable!==false).sort((a,b)=>a.id.localeCompare(b.id))]));
 if(Object.values(pools).some(p=>!p.length)||new Set(catalog.map(x=>x.id)).size!==catalog.length)throw Error('Incomplete recruitment catalog');
 const roll=random(rng),pick=random(rng),guarantee=c.ssrMisses>=29?'4':c.srMisses>=9?'3+':null;
 const rarity=guarantee==='4'?4:guarantee==='3+'?(roll<.8?3:4):roll<.45?1:roll<.80?2:roll<.96?3:4;
 const unit=pools[rarity][Math.floor(pick*pools[rarity].length)],duplicate=r.state.roster.includes(unit.id),shards=duplicate?RECRUITMENT_RULES.duplicateShards[rarity]:0;
 c.tickets--;c.drawCount++;c.shards+=shards;c.srMisses=rarity<3?c.srMisses+1:0;c.ssrMisses=rarity===4?0:c.ssrMisses+1;if(c.drawCount%40===0)c.pages++;
 if(!duplicate)r.state.roster.push(unit.id);
 return complete(r,sequence,'draw',{unitId:unit.id,rarity,duplicate,shards,guarantee,rulesVersion:2});
}
export function exchangeRecruit(save,catalog,id,sequence,usePage=false){
 const operation=(usePage?'page:':'exchange:')+id,r=prepare(save,sequence,operation);if(r.replayed)return r;
 const unit=catalog.find(x=>x.id===id&&x.recruitable!==false),cost=unit&&RECRUITMENT_RULES.exchangeCost[unit.rarity];
 if(!cost||r.state.roster.includes(id))throw Error('Choose an unowned recruit');
 if(usePage?r.state.collection.pages<1:r.state.collection.shards<cost)throw Error('Not enough archive shards');
 if(usePage)r.state.collection.pages--;else r.state.collection.shards-=cost;r.state.roster.push(id);
 return complete(r,sequence,operation,{unitId:id,rarity:unit.rarity,cost:usePage?1:cost,usePage});
}
export function drawRecruitBatch(save,catalog,sequence,count=1,rng=Math.random){
 if(count===1)return drawRecruit(save,catalog,sequence,rng);
 if(count!==10)throw Error('Choose 1 or 10 draws');
 const initial=prepare(save,sequence,'draw10');if(initial.replayed)return initial;
 if(initial.state.collection.tickets<10)throw Error('Not enough earned tickets');
 let state=initial.state;const results=[];
 for(let i=0;i<10;i++){const r=drawRecruit(state,catalog,sequence+i,rng);state=r.state;results.push(r.receipt);}
 return complete({state,replayed:false},sequence,'draw10',{results,rulesVersion:2});
}
export function dungeonStamps(save,dungeon){
 if(!dungeon.expansion)return 0;
 if(!save.completed.includes(dungeon.id))return 1;
 const deepest=Math.max(1,...pack.dungeons.filter(d=>save.completed.includes(d.id)).map(d=>pack.regions.find(r=>r.id===d.region).index));
 const region=dungeon.chapter||pack.regions.find(r=>r.id===dungeon.region)?.index||1;
 if(region<deepest-1)return 0;
 return Math.min(3,(dungeon.waves?.length||1)+(dungeon.boss_enemy?1:0));
}
// Caller invokes only on a validated victory snapshot, before clearing that snapshot.
// Receipt on the battle makes repeated settlement a no-op, including after reload.
export function grantDungeonTickets(save,dungeon){
 const b=save.battle;if(!b||b.phase!=='result'||b.result!=='victory'||b.encounterId!==dungeon.id)return null;
 if(b.ticketReceipt)return copy(b.ticketReceipt);
 const c=validateCollection(save.collection),base=integer(dungeon.tickets||0,'ticket reward'),first=!save.completed.includes(dungeon.id),bonus=first?integer(dungeon.firstClearTickets||0,'first clear tickets'):0;
 let stampTicket=0;if(dungeon.expansion){if(typeof b.runId!=='string'||c.rewardedRuns.includes(b.runId))throw Error('Clear already rewarded or invalid run');c.rewardedRuns.push(b.runId);c.stamps+=dungeonStamps(save,dungeon);stampTicket=Math.floor(c.stamps/3);c.stamps%=3;}
 c.tickets=integer(c.tickets+base+bonus+stampTicket,'ticket balance');save.collection=c;
 b.ticketReceipt={dungeonId:dungeon.id,tickets:base+bonus+stampTicket,firstClear:first};return copy(b.ticketReceipt);
}
// Web Locks coordinate this local save across tabs. No permissions or remote account.
export async function commitCollection({storage,key,expectedRevision,sequence,operation,decode,mutate,locks=globalThis.navigator?.locks}){
 if(!locks?.request)throw Error('This browser cannot safely coordinate recruitment. Use a browser with Web Locks.');
 return locks.request(key+':collection',{mode:'exclusive'},()=>{
  const raw=storage.getItem(key);if(!raw)throw Error('Save the adventure before recruitment');
  const current=decode(JSON.parse(raw));
  if(current.collection?.lastReceipt?.sequence===sequence&&current.collection.lastReceipt.operation===operation)return {state:current,receipt:copy(current.collection.lastReceipt),replayed:true};
  if(current.revision!==expectedRevision)throw Error('The adventure changed in another tab. Reload first.');
  const result=mutate(copy(current));result.state.revision=integer(current.revision+1,'revision');
  storage.setItem(key,JSON.stringify(result.state)); // May throw. Nothing is revealed until this succeeds.
  return result;
 });
}
