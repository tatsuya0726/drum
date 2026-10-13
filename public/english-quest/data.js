// Original characters. Every recruit and the protagonist is an adult.
export const HEROES = {
  hero: {name:'レイン', title:'継ぎ目の旅人', job:'言刃使い', age:24, role:'破甲・万能', hp:112, mp:12, atk:22, color:'#77d4c8', sigil:'◇', quote:'世界の綻び？ そこから光も入る。', story:'失われた言葉を拾う旅人。人の名前は忘れないのに、自分の過去だけが曖昧。', skills:['strike','break'], synergy:'破甲で敵の守りを崩す。剣士の連撃と好相性。'},
  guardian: {name:'ヴェラ', title:'緋鉄の誓い', job:'守護騎士', age:29, role:'護衛・防御', hp:160, mp:10, atk:18, color:'#e99d89', sigil:'▱', quote:'私の後ろに。説教は生きて帰ってから。', story:'規律嫌いの元近衛隊長。鎧の内側には、救えなかった街の鍵を下げている。', skills:['shelter','bash'], synergy:'全体の盾で詠唱への備え。回復役が行動する時間をつくる。'},
  mage: {name:'ノクス', title:'夜を読む者', job:'魔術師', age:27, role:'属性・範囲', hp:86, mp:16, atk:27, color:'#b3a0ec', sigil:'✧', quote:'禁書？ 読まない理由にはならないね。', story:'皮肉屋の天文術師。星図にない星を見つけるたびに、片眼鏡を磨く。', skills:['ignite','frost'], synergy:'射手の刻印へ炎が共鳴。凍結で次の敵の打撃を弱める。'},
  cleric: {name:'リュシア', title:'灰に咲く祈り', job:'祈祷師', age:25, role:'回復・浄化', hp:102, mp:16, atk:16, color:'#e9d8ab', sigil:'✦', quote:'神様は留守。だから私が治すの。', story:'教会を追われた治癒師。優しい手と辛辣な言葉で、仲間を現実に引き戻す。', skills:['mend','revive','cleanse'], synergy:'毒を浄化し、倒れた仲間を再起。守護騎士と組めば長期戦に強い。'},
  ranger: {name:'シオン', title:'月影の追跡者', job:'狩人', age:26, role:'刻印・貫通', hp:100, mp:12, atk:23, color:'#a5cba5', sigil:'⌖', quote:'足跡より、嘘のほうがよく残る。', story:'森の密輸人から転じた斥候。報酬より珍しい紅茶に弱い。', skills:['mark','pierce'], synergy:'護衛を無視して後列を狙う。刻印は次の味方の一撃を強化。'},
  duelist: {name:'レオン', title:'誓いを捨てた剣', job:'剣士', age:28, role:'連撃・中断', hp:106, mp:12, atk:25, color:'#dfa2bf', sigil:'⚔', quote:'美しい決闘に、綺麗なルールは要らない。', story:'貴族の名を捨てた決闘家。金髪と青い外套。勝ち名乗りよりも、負けた相手の冗談を覚えている。', skills:['sever','interrupt'], synergy:'破甲された相手に連撃。危険な詠唱は中断で止める。'},
  bard: {name:'ナディア', title:'嘘つきの銀刃', job:'盗賊', age:26, role:'煙幕・沈黙', hp:96, mp:14, atk:23, color:'#e6bd79', sigil:'⌁', quote:'鍵なら開ける。心のほうは別料金。', story:'赤銅色の短髪に、非対称の二振りの短剣。陽気な仮面をかぶった元密偵。嘘の数だけ命を救ってきた。', skills:['inspire','hush'], synergy:'煙幕が味方の次の一撃を援護。声を封じて回復・蘇生・詠唱を止める。'},
};
export const SKILLS = {
  strike:{en:'Strike',ja:'斬る',cost:0,target:'enemy',power:1,kind:'slash',text:'単体攻撃。集中力を2回復。'},
  guard:{en:'Guard',ja:'身を守る',cost:0,target:'self',kind:'guard',text:'次の敵ターンの被ダメージ50%軽減（誤答25%）。集中力を3回復。'},
  break:{en:'Break',ja:'守りを崩す',cost:3,target:'enemy',power:.8,effect:'exposed',kind:'slash',text:'単体攻撃＋破甲。次の2回の被ダメージが増える（誤答は1回）。'},
  shelter:{en:'Shelter',ja:'仲間をかばう',cost:4,target:'allies',kind:'guard',text:'次の敵ターン、味方全員の被ダメージ50%軽減（誤答25%）。重ね掛け不可。'},
  bash:{en:'Bash',ja:'盾で打つ',cost:3,target:'enemy',power:.9,effect:'stun',kind:'bash',text:'単体攻撃。次の敵行動を中断（ボスは威力半減）。誤答は通常敵50%・ボス25%軽減。'},
  ignite:{en:'Ignite',ja:'火をともす',cost:4,target:'enemy',power:1.65,element:'fire',kind:'fire',text:'炎の単体攻撃。刻印中なら追加で12ダメージ。'},
  frost:{en:'Freeze',ja:'凍らせる',cost:5,target:'enemies',power:.65,element:'ice',effect:'chill',kind:'ice',text:'敵全体を攻撃し、次の打撃を50%軽減（誤答25%）。'},
  mend:{en:'Mend',ja:'傷を癒やす',cost:3,target:'ally',kind:'heal',text:'仲間1人のHPを42回復。'},
  revive:{en:'Revive',ja:'再び立たせる',cost:6,target:'fallen',kind:'heal',text:'戦闘不能の仲間を最大HPの45%で蘇生（誤答22.5%・端数切り上げ）。'},
  cleanse:{en:'Cleanse',ja:'毒を浄める',cost:2,target:'ally',kind:'heal',text:'毒を解除しHP18回復。誤答は残り毒回数を半分に短縮しHP9回復。'},
  mark:{en:'Mark',ja:'狙いを定める',cost:2,target:'enemy',power:.6,effect:'marked',bypass:true,kind:'arrow',text:'護衛を無視。次の味方の攻撃を1.5倍（誤答1.25倍）に。'},
  pierce:{en:'Pierce',ja:'貫く',cost:4,target:'enemy',power:1.3,bypass:true,kind:'arrow',text:'護衛と盾を無視する単体攻撃。'},
  sever:{en:'Sever',ja:'断ち切る',cost:4,target:'enemy',power:1.6,kind:'slash',text:'鋭い連撃。破甲中は追加で10ダメージ。'},
  interrupt:{en:'Interrupt',ja:'詠唱を中断',cost:3,target:'enemy',power:.65,effect:'stun',bypass:true,kind:'bash',text:'護衛を無視して行動中断。ボスの大技は威力半減。誤答は通常敵50%・ボス25%軽減。'},
  inspire:{en:'Inspire',ja:'煙幕で援護',cost:4,target:'allies',kind:'song',text:'煙幕で全員の次の攻撃を1.4倍。誤答では1.2倍。行動前の仲間を援護。'},
  hush:{en:'Silence',ja:'声を封じる',cost:3,target:'enemy',power:.4,effect:'silence',bypass:true,kind:'song',text:'護衛を無視し、次の回復・蘇生・詠唱を封じる。誤答は魔法の威力50%軽減。'},
  herb:{en:'Heal',ja:'支給薬草',cost:0,target:'ally',kind:'heal',supply:'herb',text:'HPを35回復。1戦につき3個。'},
  antidote:{en:'Cleanse',ja:'支給解毒薬',cost:0,target:'ally',kind:'heal',supply:'antidote',text:'毒を解除しHP15回復。誤答は残り毒回数を半分に短縮しHP8回復。1戦2個。'},
  phoenix:{en:'Revive',ja:'支給復活薬',cost:0,target:'fallen',kind:'heal',supply:'phoenix',text:'HP45%で蘇生（誤答22.5%・端数切り上げ）。1戦1個。'},
};
const lesson = (word, meaning, core, example, translation, cases) => ({word,meaning,core,example,translation,cases});
export const LESSONS = {
  strike:lesson('strike','打つ・打撃を与える','力を一点にぶつける。攻撃にも、鐘を打つときにも使う。','Strike the enemy.','敵を打て。',[['敵へ一撃を加える命令は？','Strike the enemy.','Protect the enemy.','Heal the enemy.'],['Strike the bell. の意味は？','鐘を打て。','鐘を隠せ。','鐘を直せ。']]),
  guard:lesson('guard','守る・警戒する','大切なものの前に立ち、危険を防ぐ。','Guard the gate.','門を守れ。',[['自分の身を守る行動は？','Guard yourself.','Hurt yourself.','Lose yourself.'],['Guard the gate. 何をする？','門を守る','門を壊す','門を探す']]),
  break:lesson('break','壊す・断ち切る','つながっているものを切り離して、機能を止める。','Break the shield.','盾を壊せ。',[['敵の守りを崩す命令は？','Break the shield.','Mend the shield.','Hide the shield.'],['Break the spell. の意味は？','呪文を解く','呪文を覚える','呪文を続ける']]),
  shelter:lesson('shelter','かくまう・避難場所','危険を遮る屋根や囲いの中に入れるイメージ。','Shelter your allies.','仲間をかばえ。',[['敵の全体攻撃から仲間をかばいたい。','Shelter your allies.','Scatter your allies.','Forget your allies.'],['take shelter from the rain の意味は？','雨宿りする','雨を降らせる','雨を忘れる']]),
  bash:lesson('bash','強くたたく','重いものを勢いよくぶつける。軽く触れるより強い。','Bash the armor.','鎧を強く打て。',[['盾で勢いよく打つ命令は？','Bash the armor.','Polish the armor.','Wear the armor.'],['bash はどんな動き？','強くたたく','そっとなでる','静かに待つ']]),
  ignite:lesson('ignite','火をつける','火がつき始める瞬間。感情に火をつける比喩にも使う。','Ignite the torch.','松明に火をつけよ。',[['炎を生み出す命令は？','Ignite the flame.','Extinguish the flame.','Avoid the flame.'],['Ignite the torch. の意味は？','松明に火をつける','松明を消す','松明を借りる']]),
  frost:lesson('freeze','凍らせる・凍る','動きが止まるほど冷えて固まる。','Freeze the water.','水を凍らせよ。',[['敵を氷で止めたい。','Freeze the enemy.','Warm the enemy.','Follow the enemy.'],['The river froze. の意味は？','川が凍った','川が増えた','川が流れた']]),
  mend:lesson('mend','修復する・治す','壊れた部分をつなぎ直し、元の状態に近づける。','Mend her wounds.','彼女の傷を癒やせ。',[['傷ついた仲間を治す命令は？','Mend the wounds.','Open the wounds.','Count the wounds.'],['mend a torn coat は？','破れたコートを繕う','コートを脱ぐ','コートを売る']]),
  revive:lesson('revive','蘇生する・復活させる','re（再び）＋生きる。失われた活力を取り戻す。','Revive our friend.','仲間を蘇らせよ。',[['倒れた仲間を再び立たせたい。','Revive our friend.','Leave our friend.','Blame our friend.'],['revive an old tradition の意味は？','古い伝統を復活させる','伝統を禁止する','伝統を忘れる']]),
  cleanse:lesson('cleanse','浄化する・きれいにする','汚れや害になるものを取り除く。','Cleanse the poison.','毒を浄化せよ。',[['毒を取り除く命令は？','Cleanse the poison.','Spread the poison.','Drink the poison.'],['cleanse は何をする？','害になるものを取り除く','害を増やす','隠れて待つ']]),
  mark:lesson('mark','印をつける','後で見分けられるよう、目印を残す。','Mark the target.','標的に印をつけよ。',[['仲間に狙う敵を伝えたい。','Mark the target.','Miss the target.','Heal the target.'],['Mark this place on the map. は？','地図にこの場所の印をつける','地図を燃やす','場所を忘れる']]),
  pierce:lesson('pierce','突き通す','鋭い先端が表面を越えて向こう側に抜ける。','Pierce the armor.','鎧を貫け。',[['鎧を突き抜ける命令は？','Pierce the armor.','Repair the armor.','Carry the armor.'],['An arrow pierced the shield. は？','矢が盾を貫いた','矢が盾を直した','矢が盾を運んだ']]),
  sever:lesson('sever','切断する','つながりを完全に断つ。breakより切り離す意味が強い。','Sever the chain.','鎖を断ち切れ。',[['敵の鎖を断ち切りたい。','Sever the chain.','Lengthen the chain.','Join the chain.'],['sever ties の意味は？','関係を断つ','関係を結ぶ','関係を調べる']]),
  interrupt:lesson('interrupt','中断する・割り込む','進行中の流れに入り、一時的に止める。','Interrupt the chant.','詠唱を中断せよ。',[['敵が詠唱中。止める命令は？','Interrupt the chant.','Continue the chant.','Praise the chant.'],['Please do not interrupt. は？','話をさえぎらないでください','話を聞かないでください','話を始めてください']]),
  inspire:lesson('inspire','鼓舞する・刺激を与える','内側に息や力を吹き込み、行動する気持ちを起こす。','Inspire your allies.','仲間を鼓舞せよ。',[['仲間の勇気を引き出したい。','Inspire your allies.','Frighten your allies.','Ignore your allies.'],['Her story inspired me. は？','彼女の話に心を動かされた','彼女の話を忘れた','彼女の話を止めた']]),
  hush:lesson('silence','静けさ・黙らせる','音や声がなくなる。動詞なら声を封じること。','Silence the caster.','術師の声を封じよ。',[['敵の回復の祈りを封じたい。','Silence the caster.','Encourage the caster.','Revive the caster.'],['The room fell silent. は？','部屋が静かになった','部屋が明るくなった','部屋が暖かくなった']]),
};
export const ENEMIES = {
  hound:{name:'荊の猟犬',role:'毒牙',hp:62,atk:13,weak:'fire',pattern:['poison','attack'],lore:'毒は行動の終わりに傷を残す。浄化するか、盾で受け止めるか。'},
  wraith:{name:'煤の亡霊',role:'襲撃',hp:54,atk:16,weak:'fire',pattern:['attack','drain'],lore:'自身も回復する吸血。火に弱いが、狙い続ける間に術師が動く。'},
  sentinel:{name:'棘冠の衛兵',role:'護衛',hp:108,atk:12,weak:'ice',pattern:['protect','attack'],lore:'隣の敵をかばう。貫通で迂回するか、先に守りを崩そう。'},
  acolyte:{name:'縫い目の司祭',role:'回復',hp:66,atk:10,weak:'fire',pattern:['heal','attack'],lore:'傷ついた味方を癒やす。沈黙が効くが、無傷なら攻撃に転じる。'},
  revenant:{name:'骨灯の招魂師',role:'蘇生',hp:74,atk:12,weak:'ice',pattern:['revive','poison'],lore:'倒れた敵を蘇らせる。死者がいなければ毒を用意する。'},
  oracle:{name:'虚ろの星詠み',role:'詠唱',hp:78,atk:24,blastPower:2,weak:'physical',pattern:['charge','blast'],lore:'一度力を溜めて全体攻撃。中断なら完全停止、沈黙でも封じられる。'},
  bellwarden:{name:'弔鐘の番人',role:'中ボス',hp:235,atk:27,blastPower:2.5,boss:true,weak:'ice',pattern:['charge','blast','attack'],lore:'巨大な弔鐘の主。中断は完全には効かないが、大技の威力を半分にできる。'},
  eclipse:{name:'蝕王ヴェスパー',role:'大ボス',hp:320,atk:32,blastPower:2,boss:true,weak:'physical',pattern:['charge','blast','drain'],lore:'鏡と王は互いを修復する。回復を封じるか、大技に備えるか。'},
  mirror:{name:'忘却の鏡后',role:'大ボス',hp:210,atk:22,boss:true,weak:'fire',pattern:['heal','revive','poison'],lore:'王が倒れれば蘇生を試みる。沈黙はボスにも1行動だけ有効。'},
};
export const ENCOUNTERS = [
 {id:'path',chapter:'01',name:'霧を裂く街道',area:'forest',label:'街道 / 入門',enemies:['hound'],tip:'最初の一歩。敵の予告と属性を見て、全員の役割を試そう。',reward:25},
 {id:'grove',chapter:'02',name:'祈りを食む森',area:'forest',label:'森 / 回復と毒',enemies:['hound','acolyte','wraith'],tip:'司祭は傷ついた味方を回復する。猟犬の毒を先に止める手もある。',reward:45},
 {id:'gate',chapter:'03',name:'棘冠の関門',area:'abbey',label:'関門 / 護衛と詠唱',enemies:['sentinel','oracle','hound'],tip:'護衛を越えて詠唱を止めるか、全体攻撃に盾で備えるか。',reward:55},
 {id:'crypt',chapter:'04',name:'灯の消えない墓所',area:'abbey',label:'墓所 / 蘇生',enemies:['revenant','wraith','acolyte','hound'],tip:'招魂師は倒れた敵を蘇生する。倒す順番だけでなく、封じる順番も考えよう。',reward:65},
 {id:'belfry',chapter:'05',name:'弔鐘の双影',area:'abbey',label:'中ボス / 番人と司祭',enemies:['bellwarden','acolyte'],tip:'大技は中断で半減。司祭への沈黙と全体防御を使い分けよう。',reward:90},
 {id:'procession',chapter:'06',name:'帰らざる行列',area:'throne',label:'王城 / 混成部隊',enemies:['sentinel','revenant','oracle','wraith'],tip:'護衛・蘇生・全体攻撃。すべてを同時に止めることはできない。',reward:80},
 {id:'eclipse',chapter:'07',name:'名を失った王と鏡',area:'throne',label:'大ボス / 双王',enemies:['eclipse','mirror'],tip:'鏡后は王を蘇らせる。王を先に倒すなら、次の蘇生を封じる手を残そう。',reward:150},
];
export const INTENTS = {
 attack:{en:'Strike',ja:'単体攻撃',icon:'⚔'},poison:{en:'Poison',ja:'毒牙',icon:'☠'},drain:{en:'Drain',ja:'吸血',icon:'◈'},
 protect:{en:'Protect',ja:'護衛',icon:'▱'},heal:{en:'Heal',ja:'回復',icon:'✦'},revive:{en:'Revive',ja:'蘇生',icon:'↑'},
 charge:{en:'Channel',ja:'力を溜める',icon:'⌛'},blast:{en:'Unleash',ja:'全体大技',icon:'✧'},
};
LESSONS.herb=LESSONS.mend;LESSONS.antidote=LESSONS.cleanse;LESSONS.phoenix=LESSONS.revive;

import {installExpansion} from './expansion.js';
installExpansion({HEROES,SKILLS,LESSONS,ENEMIES,ENCOUNTERS});
