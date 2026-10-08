// Earned tickets only. Pure, injected-RNG operations; persistence happens before reveal.
export const RECRUITMENT_RULES=Object.freeze({version:1,cost:1,rates:{R:.70,SR:.25,SSR:.05},srGuarantee:10,ssrGuarantee:40,duplicateShards:{R:1,SR:5,SSR:20},exchangeCost:{R:10,SR:40,SSR:120}});
const copy=x=>JSON.parse(JSON.stringify(x));
const integer=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid '+label);return n;};
export const newCollection=()=>({version:1,tickets:0,shards:0,drawCount:0,srMisses:0,ssrMisses:0,sequence:0,lastReceipt:null});
export function validateCollection(raw){
 const c={...newCollection(),...copy(raw||{})};if(c.version!==1)throw Error('Unknown collection version');
 for(const k of ['tickets','shards','drawCount','sequence','srMisses','ssrMisses'])integer(c[k],k);
 if(c.srMisses>=10||c.ssrMisses>=40)throw Error('Invalid guarantee counter');
 if(c.lastReceipt&&(c.lastReceipt.sequence!==c.sequence||typeof c.lastReceipt.operation!=='string'))throw Error('Invalid receipt');
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
 const pools=Object.fromEntries(['R','SR','SSR'].map(t=>[t,catalog.filter(x=>x.rarity===t&&x.recruitable!==false).sort((a,b)=>a.id.localeCompare(b.id))]));
 if(Object.values(pools).some(p=>!p.length)||new Set(catalog.map(x=>x.id)).size!==catalog.length)throw Error('Incomplete recruitment catalog');
 const roll=random(rng),pick=random(rng),guarantee=c.ssrMisses>=39?'SSR':c.srMisses>=9?'SR+':null;
 const rarity=guarantee==='SSR'?'SSR':guarantee==='SR+'?(roll<.95?'SR':'SSR'):roll<.70?'R':roll<.95?'SR':'SSR';
 const unit=pools[rarity][Math.floor(pick*pools[rarity].length)],duplicate=r.state.roster.includes(unit.id),shards=duplicate?RECRUITMENT_RULES.duplicateShards[rarity]:0;
 c.tickets--;c.drawCount++;c.shards+=shards;c.srMisses=rarity==='R'?c.srMisses+1:0;c.ssrMisses=rarity==='SSR'?0:c.ssrMisses+1;
 if(!duplicate)r.state.roster.push(unit.id);
 return complete(r,sequence,'draw',{unitId:unit.id,rarity,duplicate,shards,guarantee,rulesVersion:1});
}
export function exchangeRecruit(save,catalog,id,sequence){
 const operation='exchange:'+id,r=prepare(save,sequence,operation);if(r.replayed)return r;
 const unit=catalog.find(x=>x.id===id&&x.recruitable!==false),cost=unit&&RECRUITMENT_RULES.exchangeCost[unit.rarity];
 if(!cost||r.state.roster.includes(id))throw Error('Choose an unowned recruit');
 if(r.state.collection.shards<cost)throw Error('Not enough archive shards');
 r.state.collection.shards-=cost;r.state.roster.push(id);
 return complete(r,sequence,operation,{unitId:id,rarity:unit.rarity,cost});
}
// Caller invokes only on a validated victory snapshot, before clearing that snapshot.
// Receipt on the battle makes repeated settlement a no-op, including after reload.
export function grantDungeonTickets(save,dungeon){
 const b=save.battle;if(!b||b.phase!=='result'||b.result!=='victory'||b.encounterId!==dungeon.id)return null;
 if(b.ticketReceipt)return copy(b.ticketReceipt);
 const c=validateCollection(save.collection),base=integer(dungeon.tickets||0,'ticket reward'),first=!save.completed.includes(dungeon.id),bonus=first?integer(dungeon.firstClearTickets||0,'first clear tickets'):0;
 c.tickets=integer(c.tickets+base+bonus,'ticket balance');save.collection=c;
 b.ticketReceipt={dungeonId:dungeon.id,tickets:base+bonus,firstClear:first};return copy(b.ticketReceipt);
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
