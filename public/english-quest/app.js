import {REVIEWED_QUESTION_IDS} from './expansion/questions/reviewed-ids.js';
import {ENEMY_ART,REGION_ART} from './art-map.js';
import {HEROES,SKILLS,LESSONS,ENEMIES,ENCOUNTERS} from './data.js';
import {alive,createBattle,makeHero,targetsFor,availableSkills,queueAction,resolveRound,resumePlanning,makeQuestion} from './engine.js';
import {SAVE_KEY,LEGACY_KEY,BACKUP_KEY,loadSave,persist,sanitizeSave,recordAnswer,recruit,swapMember,settleBattle} from './save.js';
import {speakText,playEffect} from './audio.js';
import {pack,REGIONS,BASIC_IDS,initializeExpansion,isUnlocked,collectionLevelCap} from './expansion.js';
import {STATUS_NAMES,has} from './effects.js';
import {RECRUITMENT_RULES,commitCollection,drawRecruitBatch,exchangeRecruit,dungeonStamps} from './collection.js';
import {validateQuestionBank,chooseBankQuestion} from './question-bank.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Unavailable');}};}
let releaseWriter;
const ownsWriter=await new Promise(resolve=>{if(!navigator.locks){resolve(false);return;}navigator.locks.request(SAVE_KEY+':writer',{ifAvailable:true},lock=>{resolve(!!lock);return lock?new Promise(r=>releaseWriter=r):undefined;}).catch(()=>resolve(false));});
const loaded=loadSave(storage);let S=loaded.save,blocked=!!loaded.blocked,notice=loaded.notice;try{notice=notice||storage.getItem(SAVE_KEY+'_notice')||'';}catch{}
let screen=S.battle?'battle':'town',selectedActor=null,selectedSkill='strike',selectedTarget=null,question=null,answered=null,questionActor=null,reviewQuestion=null,reviewAnswered=null;
let guildPage=0,mapPage=0,wordPage=0,detailTab='overview';
let busy=false,paused=false,stale=false,animationToken=0,toastTimer,modalMode=null,compareWith='hero',manifest={},vocabulary=[],pendingEncounter=null,visualBattle=null;
const recruits=BASIC_IDS.filter(x=>x!=='hero');
if(S.battle?.quiz){question=S.battle.quiz.question;answered=S.battle.quiz.answered;questionActor=S.battle.quiz.actor;}
let collectionPage=0,collectionFilter='all',mapRegion='grass',bank=[],lastSaved=JSON.stringify(S);
if(!ownsWriter){stale=true;paused=true;}
if(ownsWriter&&!blocked&&initializeExpansion(S)){if(!persist(storage,S)){S=sanitizeSave(JSON.parse(lastSaved));blocked=true;}else lastSaved=JSON.stringify(S);}
function save(){if(blocked||stale)throw Error('保存できないため操作を停止しました。冒険の書を確認してください。');const ok=persist(storage,S);if(!ok){S=sanitizeSave(JSON.parse(lastSaved));throw Error('保存できませんでした。操作前の状態へ戻しました。');}lastSaved=JSON.stringify(S);return true;}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function announce(text){$('#announcer').textContent=text;}
function asset(id,group='characters'){const mapped=group==='characters'?HEROES[id]?.artId||id:group==='enemies'?ENEMY_ART[id]||id:REGION_ART[id]||id;const path=manifest.expansion?.[group]?.[mapped]||manifest.rebirth?.[group]?.[mapped];return path&&typeof path==='string'&&!path.includes('..')?`./assets/${path}`:null;}
function art(id,cls='portrait',group='characters'){
  const path=asset(id,group),d=HEROES[id];
  if(path&&group==='characters'&&cls==='portrait')return `<span class="portrait portrait-frame" aria-hidden="true"><img src="${esc(path)}" alt="" decoding="async" loading="eager"></span>`;
  return path?`<img class="${cls}" src="${esc(path)}" alt="" decoding="async" loading="${cls==='town-person'?'eager':'lazy'}" ${cls==='town-person'?'fetchpriority="high"':''}>`:`<span class="${cls} art-placeholder" aria-hidden="true" style="--accent:${d?.color||'#b9acbc'}">${d?.expansion?'画像準備中':d?.sigil||'◇'}</span>`;
}
function background(id){const p=asset(id,'backgrounds');return p?`<img class="scene-bg" src="${esc(p)}" alt="">`:'';}
function btn(action,text,extra=''){return `<button data-action="${action}" ${extra}>${text}</button>`;}
function heading(kicker,title,text=''){return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2>${text?`<p class="muted">${text}</p>`:''}</div><span class="pill">冒険の書 · Lv ${S.level}</span></div>`;}
function shell(content){
 const navs=[['town','街'],['guild','仲間'],['map','冒険'],['notebook','復習']];
 return `<header class="site-header"><button class="brand" data-action="nav" data-to="town" aria-label="はじまりの街"><span class="brand-mark">✧</span><strong>ENGLISH QUEST</strong></button><div class="header-meta"><span>Lv ${S.level}</span>${btn('settings','設定','class="small ghost"')}</div></header><main class="page ${screen==='battle'?'battle-page':''}" data-screen="${screen}">${content}</main>${screen!=='battle'?`<nav class="nav" aria-label="冒険メニュー">${navs.map(([id,name])=>btn('nav',name,`data-to="${id}" class="${screen===id?'active':''}"`)).join('')}</nav>`:''}`;
}
function pager(kind,index,count){return `<div class="pager">${btn('page-prev','‹',`data-kind="${kind}" aria-label="前のページ" ${index===0?'disabled':''}`)}<span>${index+1} / ${Math.max(1,count)}</span>${btn('page-next','›',`data-kind="${kind}" aria-label="次のページ" ${index>=count-1?'disabled':''}`)}</div>`;}

function partyCards(){return `<div class="party-grid">${Array.from({length:4},(_,i)=>{const id=S.party[i],d=HEROES[id];return d?`<button class="party-card" data-action="detail" data-id="${id}" style="--accent:${d.color}"><span class="slot-label">${i===0?'YOU':`PARTY ${i+1}`}</span>${art(id)}<div class="card-bottom"><strong>${d.name}</strong><small>${id==='hero'?HEROES[S.heroJob].job:d.job} · ${d.role}</small></div></button>`:`<button class="party-card empty" data-action="nav" data-to="guild"><span class="empty-plus">＋</span><small>仲間をスカウト</small></button>`;}).join('')}</div>`;}
function town(){const next=ENCOUNTERS.find(e=>e.expansion&&!S.completed.includes(e.id)&&isUnlocked(S,e));return `<section class="town-hero">${background('town')}${art('hero','town-person')}<div class="town-copy"><div class="eyebrow">灯環の街・ルーメン</div><h1>その言葉が、<br>運命を変える。</h1><p>星の仲間と、十二の地域へ。</p><div class="actions">${btn('nav',S.party.length<4?'仲間を探す →':'冒険へ →',`class="primary" data-to="${S.party.length<4?'guild':'map'}"`)}${btn('lesson-town','ことばを学ぶ','class="ghost"')}</div></div></section><div class="chapter-strip">${next?'次の旅：'+next.name:'全章クリア · 新たな旅へ'} <span>${S.completed.filter(id=>ENCOUNTERS.find(e=>e.id===id)?.expansion).length}/60</span></div><section class="town-party"><div class="section-heading"><h2>旅の仲間</h2>${btn('nav','編成','class="small ghost" data-to="guild"')}</div>${partyCards()}</section>`;}

function guild(){return `<div class="section-heading"><h2>冒険者ギルド</h2>${btn('collection','図鑑・召喚','class="small ghost"')}${btn('party-tools','編成保存','class="small ghost"')}</div>${partyCards()}<div class="guild-grid">${recruits.slice(guildPage*2,guildPage*2+2).map(id=>{const d=HEROES[id];return `<button class="recruit-card" data-action="detail" data-id="${id}">${art(id)}<div class="recruit-info"><h3>${d.name}</h3><div class="job">${d.job} · ${d.age}歳</div><p>${d.role}</p><span class="pill">${S.party.includes(id)?'編成中':S.roster.includes(id)?'控え':'＋ スカウト'}</span></div></button>`;}).join('')}</div>${pager('guild',guildPage,3)}`;}

function map(){
 const list=ENCOUNTERS.filter(e=>mapRegion==='classic'?!e.expansion:e.regionId===mapRegion);mapPage=Math.max(0,Math.min(mapPage,list.length-1));const e=list[mapPage],index=ENCOUNTERS.indexOf(e),unlocked=e.expansion?isUnlocked(S,e):index===0||S.completed.includes(ENCOUNTERS[index-1].id),cleared=S.completed.includes(e.id);
 return `<div class="section-heading"><h2>冒険の地図</h2><select id="region-select" aria-label="地域"><option value="classic" ${mapRegion==='classic'?'selected':''}>灯環の七章</option>${REGIONS.map(r=>`<option value="${r.id}" ${mapRegion===r.id?'selected':''}>${r.index}. ${r.name}</option>`).join('')}</select></div><section class="quest">${background(e.area)}<div class="eyebrow">${e.expansion?'STAGE '+e.stage+' · 推奨 Lv '+e.recommendedLevel:'CHAPTER '+e.chapter}</div><h3>${e.name}</h3><div class="map-enemies">${(e.waves?.at(-1)||e.enemies).map(k=>art(k,'map-enemy','enemies')).join('')}</div><div class="actions">${btn('encounter',cleared?'もう一度挑む':unlocked?'この地へ進む →':'前の冒険をクリアで解放',`class="primary" data-id="${e.id}" ${unlocked?'':'disabled'}`)}</div></section>${pager('map',mapPage,list.length)}`;
}

function collection(){
 const all=pack.allies.filter(a=>collectionFilter==='owned'?S.roster.includes(a.id):collectionFilter==='all'||a.rarity===Number(collectionFilter));
 collectionPage=Math.min(collectionPage,Math.max(0,Math.ceil(all.length/2)-1));
 return `<div class="section-heading"><h2>星の仲間図鑑</h2><small>${S.roster.filter(id=>HEROES[id].expansion).length}/36</small></div><div class="collection-toolbar"><select id="collection-filter" aria-label="図鑑の絞り込み">${[['all','全員'],['owned','所持'],['1','★1'],['2','★2'],['3','★3'],['4','★4']].map(([v,t])=>`<option value="${v}" ${collectionFilter===v?'selected':''}>${t}</option>`).join('')}</select>${btn('gacha','召喚 · 券 '+S.collection.tickets,'class="primary"')}${btn('party-tools','育成','class="ghost"')}</div><div class="guild-grid">${all.slice(collectionPage*2,collectionPage*2+2).map(a=>`<button class="recruit-card" data-action="detail" data-id="${a.id}">${art(a.id)}<div class="recruit-info"><small>${'★'.repeat(a.rarity)} · ${a.kind}</small><h3>${a.name}</h3><p>${a.role}</p><span class="pill">${S.party.includes(a.id)?'編成中':S.roster.includes(a.id)?'控え':'未加入'}</span></div></button>`).join('')}</div>${pager('collection',collectionPage,Math.ceil(all.length/2))}`;
}
function showGacha(){const c=S.collection;modal('星の召喚',`<p>冒険で得た券だけを使います。課金・広告・期限はありません。</p><div class="stat-grid"><div class=stat><strong>${c.tickets}</strong><small>召喚券</small></div><div class=stat><strong>${c.shards}</strong><small>思い出の葉</small></div><div class=stat><strong>${c.pages}</strong><small>選択の頁</small></div></div><p>★1 45% / ★2 35% / ★3 16% / ★4 4%<br>同レア内は均等：1体あたり ${[1,2,3,4].map(r=>'★'+r+' '+(RECRUITMENT_RULES.rates[r]/pack.allies.filter(a=>a.rarity===r).length*100).toFixed(3)+'%').join(' / ')}</p><p>★3以上まで最大 ${10-c.srMisses}回（保証時 ★3 80% / ★4 20%）<br>★4まで最大 ${30-c.ssrMisses}回。★4保証を優先。<br>選択の頁まで ${40-c.drawCount%40}回 / 通算 ${c.drawCount}回</p><p>重複は全レア共通で葉1枚。能力は上がりません。葉6/10/18/30枚で★1/2/3/4を選択。頁1枚ならレア不問です。図鑑で未加入の仲間を選んで交換できます。</p><p>クリアスタンプ ${c.stamps}/3。スタンプ3個で券1枚。初回クリアは全域で1個。再戦は最深地域と一つ手前で、波数＋守り手1個（最大3個）。古い地域でもコインは獲得できます。</p><div class=actions>${btn('draw','1回 · 券1枚',`data-count="1" class="primary" ${c.tickets<1?'disabled':''}`)}${btn('draw','10回 · 券10枚',`data-count="10" class="ghost" ${c.tickets<10?'disabled':''}`)}</div>`,{type:'gacha'});}
function showExchange(id){const a=HEROES[id],cost=RECRUITMENT_RULES.exchangeCost[a.rarity];modal(a.name+'を迎える',`<p>${'★'.repeat(a.rarity)} · ${a.role}</p><p>所持：葉 ${S.collection.shards}枚 / 頁 ${S.collection.pages}枚</p><div class=actions>${btn('exchange','葉 '+cost+'枚で交換',`data-id="${id}" class="primary" ${S.collection.shards<cost?'disabled':''}`)}${btn('page-exchange','頁 1枚で交換',`data-id="${id}" class="ghost" ${S.collection.pages<1?'disabled':''}`)}</div>`,{type:'exchange'});}
async function collectAction(kind,id,count=1){
 if(busy||blocked||stale||S.battle)return;busy=true;
 try{const seq=S.collection.sequence+1,operation=kind==='draw'?(count===10?'draw10':'draw'):(kind==='page-exchange'?'page:':'exchange:')+id;
 const r=await commitCollection({storage,key:SAVE_KEY,expectedRevision:S.revision,sequence:seq,operation,decode:sanitizeSave,mutate:s=>kind==='draw'?drawRecruitBatch(s,pack.allies,seq,count):exchangeRecruit(s,pack.allies,id,seq,kind==='page-exchange')});
 S=r.state;lastSaved=JSON.stringify(S);render();const rows=r.receipt.results||[r.receipt];
 modal('仲間との出会い',`<div class="summon-results">${rows.map(x=>`<div>${art(x.unitId)}<strong>${HEROES[x.unitId].name}</strong><small>${'★'.repeat(x.rarity)} · ${x.duplicate?'思い出の葉 +1':'新しい仲間'}</small></div>`).join('')}</div><p>結果は保存済みです。新しい仲間は控えから編成できます。</p>${btn('collection','図鑑で編成する','class="primary"')}`,{type:'summon-result'});
 }finally{busy=false;}
}
function levelCap(){return collectionLevelCap(S);}
function partyTools(){modal('育成と編成の記録',`<p>全員 Lv ${S.level} / 上限 ${levelCap()} · ${S.gold} G<br>新しい仲間も同じレベルで参加。レア度による育成差はありません。</p>${btn('upgrade','全員を強化 · '+(20+5*S.level)+' G',`class="primary" ${S.level>=levelCap()||S.gold<20+5*S.level?'disabled':''}`)}<div class=stack style="margin-top:15px">${Array.from({length:4},(_,i)=>`<div><p>編成${i+1}：${S.presets?.[i]?.map(id=>HEROES[id]?.name).join(' / ')||'未保存'}</p><div class=actions>${btn('save-preset','現在の編成を保存',`data-slot="${i}"`)}${btn('load-preset','呼び出す',`data-slot="${i}" ${S.presets?.[i]?'':'disabled'}`)}</div></div>`).join('')}</div>`,{type:'party-tools'});}
function enemyTraits(e){return (e.traits||[]).map(t=>({burn_resist_50:'火傷半減',poison_resist_50:'毒半減',wet_resist_duration_minus_1:'ぬれ短縮',seed_resist_duration_minus_1:'たね短縮',mark_resist_duration_minus_1:'しるし短縮',single_target_damage_resist_25:'単体攻撃25%軽減',shield_damage_bonus_25:'盾への攻撃強化','regen_0.08_max_hp':'継続回復',formation_swarm:'群れ'}[t]||t.startsWith('thorns_')&&'反撃'||t)).join(' / ')||'特殊耐性なし';}
function notebook(){
 const known=Object.keys(S.words),weak=known.filter(w=>S.words[w].n>S.words[w].o),rate=S.ok+S.ng?Math.round(S.ok/(S.ok+S.ng)*100):0;
 const all=[...new Set([...Object.values(LESSONS).map(l=>l.word),...known])].sort((a,b)=>(S.words[b]?.n||0)-(S.words[b]?.o||0)-((S.words[a]?.n||0)-(S.words[a]?.o||0)));
 return `<div class="section-heading"><h2>ことばノート</h2><small>${bank.length}問 · 間違いから復習</small></div><div class="stat-grid"><div class="stat"><strong>${known.length}</strong><small>出会ったことば</small></div><div class="stat"><strong>${weak.length}</strong><small>復習したいことば</small></div><div class="stat"><strong>${rate}%</strong><small>初回正答率</small></div></div><div class="word-grid">${all.slice(wordPage*4,wordPage*4+4).map(w=>{const l=Object.values(LESSONS).find(l=>l.word===w),v=vocabulary.find(x=>x.en===w),r=S.words[w]||{o:0,n:0};return btn('review',`<strong>${esc(w)}</strong><small>${esc(l?.meaning||v?.ja||S.phr[w]||'引き継いだことば')}</small><small>正解 ${r.o} / 再挑戦 ${r.n}</small>`,`class="word ${r.n>r.o?'weak':''}" data-word="${esc(w)}"`);}).join('')}</div>${pager('word',wordPage,Math.ceil(all.length/4))}`;
}
function statuses(u){const extra=Object.keys(u.aura||{}).map(k=>STATUS_NAMES[k]).join(' / ');return extra+(extra?' / ':'')+ Object.entries(u.status||{}).filter(([,n])=>n>0).map(([k,n])=>({poison:`☠ 毒 ${n}回`,exposed:`◇ 破甲 ${n}撃`,marked:'⌖ 刻印',silence:'声封じ',stun:'中断',chill:'凍結',inspired:'援護',chargeBroken:'詠唱中断済み',chargeWeak:'次の大技軽減'}[k]||k)+(n===.5?'（効果半分）':'')).join(' / ');}
function meter(u){return `<div class="meter" aria-hidden="true"><i style="width:${Math.max(0,u.hp/u.maxHp*100)}%"></i></div><div class="hp-text"><span>HP ${u.hp}/${u.maxHp}</span>${u.guardReduction?`<span>防御 ${u.guardReduction*100}%軽減</span>`:u.shield?`<span>盾 ${u.shield}</span>`:''}</div>`;}
function battle(){
 const b=visualBattle||S.battle;if(!b){screen='town';return town();}const e=ENCOUNTERS.find(e=>e.id===b.encounterId);
 if(b.phase==='result'&&!busy)return resultView(b,e);
 if(!b.party.some(u=>u.id===selectedActor&&alive(u)))selectedActor=b.party.find(alive)?.id;
 const actor=b.party.find(u=>u.id===selectedActor)||b.party[0];if(!availableSkills(actor).includes(selectedSkill))selectedSkill='strike';
 const targets=targetsFor(b,selectedActor,selectedSkill);if(!targets.some(t=>t.id===selectedTarget))selectedTarget=targets[0]?.id;
 const canPlan=b.phase==='command'&&!question&&!busy;
 return `<div class="battle-heading"><h1>${e.name} <small>${e.waves?'W'+((b.wave||0)+1)+'/'+e.waves.length+' · ':''}R${b.round}</small></h1>${btn('battle-menu','Ⅱ','class="small ghost" aria-label="戦闘メニュー"')}</div><section class="arena" aria-label="敵の陣営">${background(e.area)}<div class="enemy-grid" style="--count:${b.enemies.length}">${b.enemies.map(u=>`<div class="unit ${alive(u)?'':'dead'}" data-unit="${u.id}"><button class="enemy-card ${selectedTarget===u.id&&canPlan?'is-target':''}" data-action="target" data-id="${u.id}" ${!canPlan||!alive(u)?'disabled':''} aria-label="${u.name} HP ${u.hp}"><div class="enemy-art">${art(u.key,'portrait','enemies')}</div><div class="unit-meta"><strong class="unit-name">${u.name}</strong>${meter(u)}</div></button></div>`).join('')}</div></section><div class="ally-grid" aria-label="味方の陣営">${b.party.map(u=>{const index=b.plans?.findIndex(p=>p.actorId===u.id)??-1;return `<div class="unit ${alive(u)?'':'dead'}" data-unit="${u.id}"><button class="ally-card ${selectedActor===u.id&&canPlan?'selected':''}" data-action="ally" data-id="${u.id}" ${!canPlan?'disabled':''} aria-label="${u.name} HP ${u.hp} 集中力 ${u.mp}">${index>=0?`<span class="number-badge">${index+1}</span>`:''}${art(u.id)}<div><strong class="unit-name">${u.name}</strong>${meter(u)}<div class="hp-text">MP ${u.mp}</div><div class="status-label">${statuses(u)}</div></div></button></div>`;}).join('')}</div>${question?questionView():b.phase==='feedback'?feedbackView(b.feedback):canPlan?commandView(b,actor):'<div class="battle-busy" aria-live="polite">行動中…</div>'}`;
}

function commandView(b,actor){
 const skill=SKILLS[selectedSkill],target=[...b.party,...b.enemies].find(u=>u.id===selectedTarget),allPlanned=b.party.filter(alive).every(u=>b.plans.some(p=>p.actorId===u.id));
 return `<section class="battle-controls command-panel"><div class="command-row"><label for="battle-skill">${actor.name}</label><select id="battle-skill" aria-label="行動">${availableSkills(actor).map(id=>{const a=SKILLS[id],off=(actor.cooldowns?.[id]||0)>0||(has(actor,'silence')&&!['strike','guard','herb','antidote','phoenix'].includes(id))||actor.mp<a.cost||(a.supply&&b.supplies[a.supply]<=0)||!targetsFor(b,actor.id,id).length;return `<option value="${id}" ${selectedSkill===id?'selected':''} ${off?'disabled':''}>${a.en} · ${a.ja} ${actor.cooldowns?.[id]?'待ち'+actor.cooldowns[id]:''} ${a.supply?'残'+b.supplies[a.supply]:a.cost?'MP'+a.cost:''}</option>`;}).join('')}${actor.id!=='hero'&&b.reserve.some(alive)?'<option value="swap">控えと交代</option>':''}</select>${btn('skill-info','?','aria-label="技の説明" class="small ghost"')}</div><div class="target-row"><span>→ ${['allies','enemies'].includes(skill.target)?skill.target==='allies'?'味方全員':'敵全員':target?.name||'対象なし'}</span>${btn('queue','決定',`class="primary" ${!target?'disabled':''}`)}</div><div class="plan-chips" aria-label="行動順">${b.plans.map((p,i)=>btn('edit-plan',`${i+1} ${HEROES[p.actorId].name}`,`data-id="${p.actorId}" aria-label="${HEROES[p.actorId].name}の計画を変更"`)).join('')||'<small>仲間 → 技 → 対象を選択</small>'}</div><div class="actions final-actions">${btn('auto-plan','残りは攻撃','class="ghost"')}${btn('prepare-question','英語へ →',`class="primary" ${!allPlanned?'disabled':''}`)}</div></section>`;
}

function questionView(){const q=question;return `<section class="battle-controls question" id="learning">${answered===null?`<div class="question-heading"><h2>${esc(q.prompt)}${q.id?'<span class=question-english>'+esc(q.example)+'</span>':''}</h2>${btn('cancel-question','戻る','class="small ghost"')}</div><div class="choices">${q.choices.map((c,i)=>btn('answer',esc(c.text),`class="choice" data-index="${i}"`)).join('')}</div><small>正解100% / 誤答50%</small>`:`<div class="feedback ${answered?'':'wrong'}"><strong class="answer-result">${answered?'正解 · 全員100%':'このラウンドの効果は50%'}</strong><div class="english">${esc(q.word)} <small>${esc(q.meaning)}</small></div><p>${esc(q.core)}</p><p class="correct-meaning">${esc(q.choices.find(c=>c.correct).text)}</p>${!answered&&!q.corrected?btn('correct-answer','正解を確認して続ける','class="primary"'):btn('execute','行動する →','class="primary"')}</div>`}</section>`;}

function feedbackView(f){return `<section class="battle-controls feedback round-feedback"><strong>ROUND COMPLETE</strong>${f?`<p><b>${esc(f.word)}</b> · ${esc(f.meaning)}</p><p>${esc(f.example)} <small>${esc(f.translation)}</small></p>`:''}<div class="actions">${btn('next-round','次のラウンドへ →','class="primary"')}${btn('speak-feedback','音声','class="ghost"')}</div></section>`;}

function resultView(b,e){const won=b.result==='victory';return `<section class="result-screen"><div class="result-emblem">${won?'✧':'◇'}</div><h1>${won?'言葉は、闇を越えた。':'旅は、まだ終わらない。'}</h1><p>${won?e.name+' · '+e.reward+' G':'街で回復して、もう一度。'}</p>${b.feedback?`<div class="panel"><b>${esc(b.feedback.word)}</b><p>${esc(b.feedback.example)}<br><small>${esc(b.feedback.translation)}</small></p></div>`:''}<div class="actions">${btn('finish','街へ戻る','class="primary"')}${btn('retry','再挑戦','class="ghost"')}</div></section>`;}

function render(){document.body.classList.toggle('reduced',S.settings.motion==='reduced');document.body.dataset.screen=screen;document.body.dataset.phase=question?'question':busy?'busy':S.battle?.phase||'';$('#app').innerHTML=shell(({town,guild,map,notebook,battle,collection}[screen]||town)());if(paused)showPause();}
function navigate(to){if(busy)return;if(S.battle&&to!=='battle'){openRetreat();return;}screen=to;if(to==='map'){const next=ENCOUNTERS.find(e=>e.expansion&&!S.completed.includes(e.id)&&isUnlocked(S,e));if(next){mapRegion=next.regionId;mapPage=next.stage-1;}}render();window.scrollTo({top:0,behavior:'instant'});announce(({town:'はじまりの街',guild:'冒険者ギルド',map:'冒険の地図',notebook:'ことばノート'})[to]||'星の仲間図鑑');}
function modal(title,body,mode){modalMode=mode;$('#modal').dataset.mode=mode?.type||'';$('#modal').innerHTML=`<div class="modal-heading"><h2>${title}</h2>${btn('close-modal','閉じる','class="small ghost"')}</div>${body}`;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){$('#modal').close();modalMode=null;}
function detail(id){
 const d=HEROES[id],job=id==='hero'?S.heroJob:id,stats=makeHero(id,S.level,job);
 const controls=id==='hero'?`<div class="job-grid">${recruits.map(k=>btn('hero-job',HEROES[k].job,`data-id="${k}" class="${S.heroJob===k?'selected':''}"`)).join('')}</div>`:!S.roster.includes(id)?(d.expansion?btn('exchange-choice','交換方法を見る',`class="primary" data-id="${id}"`):btn('recruit',d.name+'をスカウト（無料）',`class="primary" data-id="${id}"`)):S.party.includes(id)?btn('bench','控えに回す',`class="ghost" data-id="${id}"`):`${S.party.length>=4?`<label>交代相手<select id="swap-member">${S.party.filter(x=>x!=='hero').map(x=>`<option value="${x}">${HEROES[x].name}</option>`).join('')}</select></label>`:''}${btn('join-party','パーティに編成',`class="primary" data-id="${id}"`)}`;
 const tabs=`<div class="detail-tabs">${[['overview','編成'],['skills','技'],['compare','比較'],['story','人物']].map(([k,v])=>btn('detail-tab',v,`data-id="${id}" data-tab="${k}" class="${detailTab===k?'selected':''}"`)).join('')}</div>`;
 const peer=makeHero(compareWith,S.level,compareWith==='hero'?S.heroJob:null);
 const body=detailTab==='compare'?`<label>比較する仲間<select id="compare-member" data-id="${id}">${S.roster.map(k=>`<option value="${k}" ${k===compareWith?'selected':''}>${HEROES[k].name}</option>`).join('')}</select></label><table class=compare><tr><th>能力</th><th>${d.name}</th><th>${HEROES[compareWith].name}</th></tr><tr><td>HP</td><td>${stats.hp}</td><td>${peer.hp}</td></tr><tr><td>MP</td><td>${stats.mp}</td><td>${peer.mp}</td></tr><tr><td>攻撃</td><td>${stats.atk}</td><td>${peer.atk}</td></tr></table>`:detailTab==='overview'?`<div class="compact-profile">${art(id,'detail-art')}<div><h3>${HEROES[job].job}</h3><p>${d.role}</p><p>HP ${stats.hp} / MP ${stats.mp}<br>攻撃 ${stats.atk}</p></div></div><div class="stack formation-controls">${controls}</div>`:detailTab==='skills'?`<div class="compact-skills">${HEROES[job].skills.map(k=>`<div class="skill-info"><strong>${SKILLS[k].en} · ${SKILLS[k].ja}</strong><p>${SKILLS[k].text}</p></div>`).join('')}</div>`:`<div class="compact-profile">${art(id,'detail-art')}<div><p>${d.age?d.age+'歳 · ':''}${d.title}</p><p>「${d.quote}」</p><p>${d.story}</p></div></div>`;
 modal(d.name,tabs+body,{type:'detail',id});
}

function settings(){modal('冒険の設定',`${notice?'<p class=notice>'+esc(notice)+'</p>':''}<div class="settings-row"><div><strong>音声・効果音</strong><p>初期設定はOFF。音声がなくても全問解けます。</p></div>${btn('sound',S.settings.sound?'ON':'OFF','class="small" aria-pressed="'+S.settings.sound+'"')}</div><div class="settings-row"><div><strong>画面の動き</strong><p>OS設定にも対応しています。</p></div><select id="motion" aria-label="画面の動き"><option value="system" ${S.settings.motion==='system'?'selected':''}>端末に合わせる</option><option value="reduced" ${S.settings.motion==='reduced'?'selected':''}>動きを減らす</option></select></div><div class="settings-group"><h3>冒険の書</h3><p class="muted">行動確定時・加入時に自動保存。旧版のセーブはそのまま残しています。</p><div class="actions" style="margin:12px 0">${btn('export','バックアップを保存','class="ghost"')}${btn('import','バックアップを読み込む','class="ghost"')}</div><input id="import-file" type="file" accept="application/json,.json" hidden>${blocked?'<p class="notice warning">元データを保護するため保存を停止しています。バックアップを保存してから、正常な冒険の書を読み込んでください。</p>':''}<p><a href="./classic.html">旧版の冒険を開く</a> · <a href="./pixelize.html">旧版の画像メーカー</a></p></div><div class="settings-group"><h3>ことばの勇者</h3><p class="muted">オリジナルキャラクター・オリジナルの物語。新しい冒険は旧版から独立した7章です。旧進行・所持品・会話は旧版と移行前バックアップで保管されます。</p></div>`,{type:'settings'});}
function help(){modal('言葉を選ぶ。仲間を信じる。',`<div class="stack"><p><strong>1. 相手を選ぶ</strong><br>敵の行動・標的を見よう。回復、蘇生、護衛、詠唱には、それぞれ対処が違う。</p><p><strong>2. 仲間の行動を組む</strong><br>味方 → 行動メニュー → 標的 → 決定。追加した順に行動する。刻印から炎、破甲から連撃が強い。↑で順番を変えられる。</p><p><strong>3. 1問のことばを選ぶ</strong><br>時間制限なし。初回正解で全員100%、誤答では攻撃・回復・防御の効果が50%。選び直しても判定は変わらない。防御は50%軽減→25%軽減。蘇生HPは45%→22.5%、浄化は残り毒回数を半分にする。中断・沈黙の誤答は完全停止せず威力を軽減（通常敵50%、ボス中断25%）。</p><p><strong>4. 敵の行動へ</strong><br>生き残った敵が1回ずつ行動。沈黙は回復・蘇生・詠唱を封じ、中断は通常敵を止める。ボスへの中断は威力半減。護衛は最大40%軽減、貫通で無視できる。</p><p><strong>支給品と控え</strong><br>薬草3・解毒薬2・復活薬1を毎戦支給。交代は1行動を使い、入った仲間は次ラウンドから。主人公が倒れても仲間が戦い続ける。</p><p><strong>休憩しても大丈夫</strong><br>戦闘中に画面を離れると一時停止。再読込で直前の確定状態から再開。音声OFF・低モーション・キーボードでも遊べる。</p></div>`,{type:'help'});}
function openEncounter(id){pendingEncounter=id;const e=ENCOUNTERS.find(x=>x.id===id);modal(e.name,`<p>${e.tip}</p>${e.expansion?'<p>全'+e.waves.length+'波 / 推奨Lv '+e.recommendedLevel+'<br>勝利スタンプ '+dungeonStamps(S,e)+'個 / 初回券 '+(S.completed.includes(e.id)?0:e.firstClearTickets)+'枚</p><div class=stack>'+[...new Set(e.waves.flat())].map(k=>'<p><strong>'+ENEMIES[k].name+'</strong> · 装甲 '+Math.round((ENEMIES[k].armor||0)*100)+'% · '+enemyTraits(ENEMIES[k])+'</p>').join('')+'</div>':''}<p class="notice">${S.party.length}人で出発します。HP・集中力と支給品は全回復。${S.party.length<4?'ギルドでは無料で4人まで編成できます。':''}</p><div class="actions">${btn('start-battle','この編成で出発','class="primary"')}${btn('go-guild','仲間を見直す','class="ghost"')}</div>`,{type:'encounter'});}
function startBattle(id){S.battle=createBattle(S.party,id,S.level,S.wins,S.roster,S.heroJob);screen='battle';question=null;answered=null;selectedActor=S.party[0];selectedSkill='strike';selectedTarget=null;save();closeModal();render();window.scrollTo(0,0);}
function openRetreat(){if(busy)return;modal('灯環の街へ戻る',`<p>この戦闘の報酬は得られません。学習記録は保存され、街で全員回復します。</p><div class="actions" style="margin-top:18px">${btn('confirm-retreat','街へ帰還','class="primary"')}${btn('close-modal','戦闘を続ける','class="ghost"')}</div>`,{type:'retreat'});}
function speak(text){if(!S.settings.sound){toast('音声はOFFです。設定でONにできます。問題文はそのまま読めます。');return;}speakText(text,window,()=>toast('音声を再生できません。表示された英文で続けられます。'));}
function sound(kind){if(S.settings.sound)void playEffect(kind,window);}
const reduced=()=>S.settings.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function gate(token){while(paused&&token===animationToken)await delay(80);return token===animationToken;}
async function animate(events,token){
 for(const e of events){
  if(!await gate(token))return;announce(e.text);
  const update=()=>{if(visualBattle&&e.hp!==undefined){const u=[...visualBattle.party,...visualBattle.enemies].find(u=>u.id===e.target);if(u){u.hp=e.hp;u.shield=e.shield||0;u.guardReduction=e.guardReduction||0;}}};
  if(reduced()){update();continue;}
  const actor=document.querySelector(`[data-unit="${e.actor}"]`),target=document.querySelector(`[data-unit="${e.target}"]`);
  const attack=e.actor?.startsWith('e')&&e.target!==e.actor&&e.amount>0&&e.kind!=='heal';
  if(actor){actor.dataset.fx=e.kind;actor.classList.add('acting',attack?'acting-enemy':'acting-ally');}
  const cap=$('.battle-busy');if(cap)cap.textContent=e.text;
  await delay(attack?360:120);if(!await gate(token))return;
  update();
  if(target&&e.hp!==undefined){const bar=target.querySelector('.meter i'),hp=target.querySelector('.hp-text span'),u=[...visualBattle.party,...visualBattle.enemies].find(u=>u.id===e.target);if(bar&&u)bar.style.width=Math.max(0,u.hp/u.maxHp*100)+'%';if(hp&&u)hp.textContent='HP '+u.hp+'/'+u.maxHp;}
  if(target)target.dataset.fx=e.kind;
  const cls=e.kind==='defeat'?'fallen':e.kind==='heal'?'healing':'impact';target?.classList.add(cls);
  if(target&&e.amount){const label=document.createElement('span');label.className='fx-label';label.textContent=(e.kind==='heal'?'+':'−')+e.amount;target.append(label);}
  sound(e.kind);await delay(attack?290:200);if(!await gate(token))return;
  actor?.classList.remove('acting','acting-enemy','acting-ally');target?.classList.remove(cls);target?.querySelector('.fx-label')?.remove();render();
 }
}
async function execute(){
 if(busy||answered===null||!question||(!answered&&!question.corrected))return;
 busy=true;const token=++animationToken,b=S.battle,q=question;visualBattle=JSON.parse(JSON.stringify(b));
 try{delete b.quiz;const events=resolveRound(b,answered);b.feedback={word:q.word,meaning:q.meaning,core:q.core,example:q.example,translation:q.translation};question=null;answered=null;save();render();await animate(events,token);}catch(e){toast(e.message);}finally{visualBattle=null;busy=false;if(token===animationToken)render();}
}
function showPause(){if($('.pause-cover'))return;const el=document.createElement('section');el.className='pause-cover';el.innerHTML=`<div class="eyebrow">TAKE YOUR TIME</div><h2>${stale?'別のタブで冒険が更新されました':'冒険を、一休み。'}</h2><p>${stale?'競合を防ぐため、このタブからの保存を停止しました。最新の冒険の書を読み直してください。':'時間制限はありません。行動と学習記録は保持されています。準備ができたら再開してください。'}</p>${btn(stale?'reload':'resume',stale?'最新の状態を読み込む':'冒険を再開','class="primary"')}`;document.body.append(el);el.querySelector('button').focus();}
function pause(){paused=true;try{speechSynthesis?.cancel();}catch{}showPause();}
function review(word){
 const questionEntry=bank.find(q=>q.englishText===word);
 if(questionEntry){reviewQuestion=chooseBankQuestion([questionEntry],S.questionRecords);reviewAnswered=null;renderReview();return;}
 const entry=Object.entries(LESSONS).find(([,l])=>l.word===word);
 if(entry){reviewQuestion=makeQuestion(entry[0],S.words);reviewAnswered=null;}
 else {const v=vocabulary.find(v=>v.en===word);if(!v){modal(word,`<p>${esc(word)}</p><p class="muted">旧冒険から引き継いだ学習記録です。</p>`,{type:'word'});return;}const choices=[{text:v.ja,correct:true},...vocabulary.filter(w=>w.tier===v.tier&&w.ja!==v.ja).slice(0,2).map(v=>({text:v.ja,correct:false}))].sort(()=>Math.random()-.5);reviewQuestion={word,prompt:`${word} の意味は？`,choices,meaning:v.ja,core:'語の意味を確かめ、次に出会う文の中でも探してみよう。',example:word,translation:v.ja};reviewAnswered=null;}
 renderReview();
}
function renderReview(){const q=reviewQuestion;modal('ことばを、もう一度。',`<div class="eyebrow">RECALL & CONNECT</div><h3 style="margin:15px 0">${esc(q.prompt)}</h3>${q.id?'<p class=question-english>'+esc(q.example)+'</p>':''}${reviewAnswered===null?`<div class="stack">${q.choices.map((c,i)=>btn('review-answer',esc(c.text),`data-index="${i}" class="ghost"`)).join('')}</div>`:`<div class="feedback ${reviewAnswered?'':'wrong'}"><h3>${reviewAnswered?'正解です':'意味を確かめよう'}</h3><p><strong>${esc(q.word)}</strong> — ${esc(q.meaning)}</p><p>${esc(q.core)}</p><p>${esc(q.example)}<br><small>${esc(q.translation)}</small></p></div><div class="actions" style="margin-top:15px">${btn('review-again','別の場面でもう一度','class="primary"')}${btn('close-modal','ノートに戻る','class="ghost"')}</div>`}`,{type:'review'});}
function exportSave(){const data={format:'english-quest-backup',version:1,current:S,legacy:storage.getItem(LEGACY_KEY),legacyBackup:storage.getItem(BACKUP_KEY),rawCurrent:blocked?storage.getItem(SAVE_KEY):null};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='english-quest-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importSave(file){if(!file)return;if(file.size>2_000_000){toast('冒険の書が大きすぎます。');return;}try{const raw=JSON.parse(await file.text());const candidate=sanitizeSave(raw.format==='english-quest-backup'?raw.current:raw);modal('冒険の書を読み込む',`<p>レベル ${candidate.level} · 仲間 ${candidate.roster.length}人 · 記録 ${Object.keys(candidate.words).length}語</p><p>現在のデータを端末内にバックアップしてから切り替えます。</p><div class="actions" style="margin-top:18px">${btn('confirm-import','この冒険の書を読み込む','class="primary"')}${btn('close-modal','キャンセル','class="ghost"')}</div>`,{type:'import',candidate});}catch{toast('このファイルは有効な冒険の書ではありません。現在のデータは変更していません。');}}
document.addEventListener('click',async ev=>{
 const el=ev.target.closest('[data-action]');if(!el||el.disabled)return;const a=el.dataset.action,id=el.dataset.id;
 if(stale&&a!=='reload')return;
 if(paused&&!['resume','reload'].includes(a))return;
 if(busy&&!['pause','resume','reload'].includes(a))return;
 try{switch(a){
 case 'collection':closeModal();navigate('collection');break;
 case 'gacha':showGacha();break;
 case 'draw':await collectAction('draw',null,Number(el.dataset.count));break;
 case 'exchange-choice':showExchange(id);break;
 case 'exchange':case 'page-exchange':await collectAction(a,id);break;
 case 'party-tools':partyTools();break;
 case 'save-preset':S.presets||=[];S.presets[Number(el.dataset.slot)]=[...S.party];save();partyTools();break;
 case 'load-preset':{const p=S.presets?.[Number(el.dataset.slot)];if(p?.length&&p.every(id=>S.roster.includes(id))){S.party=[...p];save();closeModal();render();}break;}
 case 'upgrade':{const cap=levelCap();if(S.level>=cap)throw Error('次の地域で上限が解放されます。');const cost=20+5*S.level;if(S.gold<cost)throw Error('コインが足りません。');S.gold-=cost;S.level++;save();partyTools();render();break;}
 case 'nav':navigate(el.dataset.to);break;
 case 'settings':settings();break;case 'help':help();break;case 'close-modal':closeModal();break;
 case 'detail':detailTab='overview';detail(id);break;
 case 'detail-tab':detailTab=el.dataset.tab;detail(id);break;
 case 'page-prev':case 'page-next':{const n=a==='page-next'?1:-1;if(el.dataset.kind==='guild')guildPage+=n;if(el.dataset.kind==='map')mapPage+=n;if(el.dataset.kind==='word')wordPage+=n;if(el.dataset.kind==='collection')collectionPage+=n;render();break;}
 case 'battle-status':modal('状態と耐性',`<div class=stack>${[...S.battle.party,...S.battle.enemies].map(u=>'<p><strong>'+u.name+'</strong><br>'+statuses(u)+(u.traits?'<br>'+enemyTraits(u):'')+'</p>').join('')}</div>`,{type:'battle-status'});break;
 case 'skill-info':modal(SKILLS[selectedSkill].en,`<p>${SKILLS[selectedSkill].text}</p>${S.battle.plans.some(p=>p.actorId===selectedActor)?btn('plan-first','この仲間を最初に行動させる','class=ghost'):''}`,{type:'skill'});break;
 case 'plan-first':{const i=S.battle.plans.findIndex(p=>p.actorId===selectedActor);if(i>0)S.battle.plans.unshift(...S.battle.plans.splice(i,1));save();closeModal();render();break;}
 case 'ack-notice':try{storage.setItem(SAVE_KEY+'_notice',notice);}catch{}closeModal();break;
 case 'battle-menu':modal('戦闘メニュー',`<div class=stack>${btn('pause','一時停止')}${btn('retreat','帰還')}${btn('battle-status','状態・耐性')}${btn('help','戦い方')}</div>`,{type:'battle-menu'});break;
 case 'recruit':if(recruit(S,id)){save();render();detail(id);toast(`${HEROES[id].name}が仲間になりました。`);}break;
 case 'bench':case 'join-party':if(swapMember(S,id,$('#swap-member')?.value)){save();render();detail(id);}break;
 case 'hero-job':S.heroJob=id;save();render();detail('hero');break;
 case 'rest':toast('全員の支度が整いました。次の戦闘はHP・集中力ともに全快で出発します。');break;
 case 'lesson-town':{const keys=Object.keys(LESSONS).filter(k=>!['herb','antidote','phoenix'].includes(k));const ranked=keys.sort((a,b)=>((S.words[LESSONS[b].word]?.n||0)-(S.words[LESSONS[b].word]?.o||0))-((S.words[LESSONS[a].word]?.n||0)-(S.words[LESSONS[a].word]?.o||0)));review(LESSONS[ranked[Math.floor(Math.random()*Math.min(3,ranked.length))]].word);break;}
 case 'encounter':openEncounter(id);break;case 'start-battle':startBattle(pendingEncounter);break;
 case 'go-guild':closeModal();navigate('guild');break;
 case 'target':if(targetsFor(S.battle,selectedActor,selectedSkill).some(t=>t.id===id)){selectedTarget=id;render();}else toast('この技ではその対象を選べません。');break;
 case 'ally':if(['ally','fallen'].includes(SKILLS[selectedSkill].target)&&targetsFor(S.battle,selectedActor,selectedSkill).some(t=>t.id===id)){selectedTarget=id;}else if(S.battle.party.find(u=>u.id===id&&alive(u))){selectedActor=id;selectedSkill='strike';selectedTarget=null;}render();break;
 case 'skill':selectedSkill=id;selectedTarget=null;render();break;
 case 'queue':queueAction(S.battle,selectedActor,selectedSkill,selectedTarget);selectedActor=S.battle.party.find(u=>alive(u)&&!S.battle.plans.some(p=>p.actorId===u.id))?.id||selectedActor;selectedSkill='strike';selectedTarget=null;save();render();break;
 case 'auto-plan':for(const u of S.battle.party.filter(alive)){if(!S.battle.plans.some(p=>p.actorId===u.id))queueAction(S.battle,u.id,'strike',S.battle.enemies.find(alive).id);}save();render();break;
 case 'move-plan':{const i=Number(el.dataset.index),p=S.battle.plans;[p[i-1],p[i]]=[p[i],p[i-1]];save();render();break;}
 case 'edit-plan':selectedActor=id;selectedSkill=S.battle.plans.find(p=>p.actorId===id)?.skillId||'strike';if(selectedSkill==='swap')selectedSkill='strike';render();break;
 case 'swap-battle':modal('控えから交代する',`<p>交代で1行動を使います。入った仲間は次のラウンドから行動できます。</p><div class="stack" style="margin-top:15px">${S.battle.reserve.filter(alive).map(u=>btn('queue-swap',`${u.name} / ${HEROES[u.id].job}`,`data-id="${u.id}" class="ghost"`)).join('')}</div>`,{type:'battle-swap'});break;
 case 'queue-swap':queueAction(S.battle,selectedActor,'swap',id);closeModal();save();render();break;
 case 'prepare-question':{const plans=S.battle.plans.filter(p=>p.skillId!=='swap');if(!plans.length)throw Error('少なくとも1人は行動を計画してください。');const weighted=plans.flatMap(p=>{const r=S.words[LESSONS[p.skillId].word];return Array(r&&r.n>r.o?3:1).fill(p);});const p=weighted[Math.floor(Math.random()*weighted.length)];questionActor=p.actorId;question=(S.battle.round%4!==0?chooseBankQuestion(bank,S.questionRecords,{level:ENCOUNTERS.find(e=>e.id===S.battle.encounterId).questionDifficulty||6,previousId:S.lastQuestionId}):null)||makeQuestion(p.skillId,S.words);answered=null;S.battle.quiz={question,answered,actor:questionActor};save();render();break;}
 case 'cancel-question':question=null;answered=null;delete S.battle.quiz;save();render();break;
 case 'answer':if(question&&answered===null){answered=question.choices[Number(el.dataset.index)].correct;recordAnswer(S,question.word,answered);if(question.id){const r=S.questionRecords[question.id]||={correct:0,wrong:0};r[answered?'correct':'wrong']++;S.lastQuestionId=question.id;}S.battle.quiz={question,answered,actor:questionActor};save();render();}break;
 case 'correct-answer':question.corrected=true;S.battle.quiz={question,answered,actor:questionActor};save();render();break;case 'execute':await execute();break;
 case 'next-round':resumePlanning(S.battle);save();render();window.scrollTo(0,0);break;
 case 'speak':speak(question?.example||'');break;case 'speak-feedback':speak(S.battle.feedback?.example||'');break;
 case 'pause':closeModal();pause();break;case 'resume':paused=false;$('.pause-cover')?.remove();break;case 'reload':location.reload();break;
 case 'retreat':openRetreat();break;case 'confirm-retreat':animationToken++;S.battle=null;question=null;save();closeModal();navigate('town');break;
 case 'finish':settleBattle(S);save();navigate('town');break;
 case 'retry':{const id=S.battle.encounterId;settleBattle(S);startBattle(id);break;}
 case 'sound':S.settings.sound=!S.settings.sound;save();settings();if(S.settings.sound)speak('Welcome, adventurer.');else try{speechSynthesis.cancel();}catch{}break;
 case 'export':exportSave();break;case 'import':$('#import-file').click();break;
 case 'confirm-import':{const candidate=modalMode.candidate;const old=storage.getItem(SAVE_KEY);if(old)storage.setItem(SAVE_KEY+'_before_import',old);storage.setItem(SAVE_KEY,JSON.stringify(candidate));S=candidate;lastSaved=JSON.stringify(S);blocked=false;notice='冒険の書を読み込みました。';question=null;screen=S.battle?'battle':'town';closeModal();render();break;}
 case 'review':review(el.dataset.word);break;
 case 'review-answer':if(reviewAnswered===null){reviewAnswered=reviewQuestion.choices[Number(el.dataset.index)].correct;recordAnswer(S,reviewQuestion.word,reviewAnswered);if(reviewQuestion.id){const r=S.questionRecords[reviewQuestion.id]||={correct:0,wrong:0};r[reviewAnswered?'correct':'wrong']++;}save();renderReview();}break;
 case 'review-again':review(reviewQuestion.word);break;
 }}catch(error){toast(error.message||'操作を完了できませんでした。');}
});
document.addEventListener('change',ev=>{if(ev.target.id==='region-select'){mapRegion=ev.target.value;mapPage=0;render();}if(ev.target.id==='collection-filter'){collectionFilter=ev.target.value;collectionPage=0;render();}if(ev.target.id==='battle-skill'){if(ev.target.value==='swap'){modal('控えと交代',`<div class=stack>${S.battle.reserve.filter(alive).map(u=>btn('queue-swap',u.name,`data-id="${u.id}"`)).join('')}</div>`,{type:'battle-swap'});}else{selectedSkill=ev.target.value;selectedTarget=null;render();}} if(ev.target.id==='compare-member'){compareWith=ev.target.value;detail(ev.target.dataset.id);}if(ev.target.id==='motion'){S.settings.motion=ev.target.value;save();render();}if(ev.target.id==='import-file')importSave(ev.target.files[0]);});
$('#modal').addEventListener('close',()=>{modalMode=null;if(screen==='notebook')render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.battle)pause();});
addEventListener('keydown',e=>{if(e.key==='Escape'&&S.battle&&!$('#modal').open){e.preventDefault();paused?(!stale&&(paused=false,$('.pause-cover')?.remove())):pause();}});
addEventListener('storage',e=>{if(e.key===SAVE_KEY){stale=true;pause();}});
addEventListener('popstate',()=>{if(S.battle){history.pushState({quest:true},'',location.href);pause();}else navigate('town');});
history.replaceState({quest:true},'',location.href);history.pushState({quest:true},'',location.href);
Promise.allSettled([fetch('./assets/manifest.json').then(r=>r.json()).then(m=>manifest={...m,...manifest}),fetch('./vocabulary.json').then(r=>r.json()).then(v=>vocabulary=v),fetch('./expansion/art-manifest.json').then(r=>{if(!r.ok)throw Error('Art pending');return r.json();}).then(m=>manifest.expansion=m.expansion||m),fetch('./expansion/questions/english-quest-600-questions.json').then(r=>{if(!r.ok)throw Error('Questions pending');return r.json();}).then(q=>{bank=validateQuestionBank(q,{approvedIds:REVIEWED_QUESTION_IDS}).approved;})]).then(()=>{render();if(notice){let ack;try{ack=storage.getItem(SAVE_KEY+'_notice');}catch{}if(ack!==notice)modal('冒険の書',`<p>${esc(notice)}</p><div class=actions>${btn('ack-notice','確認','class=primary')}</div>`,{type:'notice'});}});
render();

