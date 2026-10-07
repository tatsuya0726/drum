import {HEROES,ENCOUNTERS,SKILLS} from '../public/english-quest/data.js';
import {createBattle,queueAction,resolveRound,resumePlanning,alive,availableSkills,targetsFor} from '../public/english-quest/engine.js';
const ids=Object.keys(HEROES).filter(x=>x!=='hero'),teams=[];
for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)for(let k=j+1;k<ids.length;k++)teams.push(['hero',ids[i],ids[j],ids[k]]);
const results=[];
for(const team of teams)for(const [chapter,e] of ENCOUNTERS.entries())for(const strategy of ['support','threat']){
 const b=createBattle(team,e.id,1+Math.floor(chapter/2));let rounds=0;
 while(!b.result&&rounds<40){
  if(b.phase==='feedback')resumePlanning(b);
  const targets=b.enemies.filter(alive).sort((a,c)=>{
   const rank=strategy==='support'?['revenant','mirror','acolyte','oracle','hound','wraith','sentinel','bellwarden','eclipse']:['oracle','hound','wraith','bellwarden','eclipse','sentinel','acolyte','mirror','revenant'];
   return rank.indexOf(a.key)-rank.indexOf(c.key);
  });
  const low=b.party.filter(alive).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0],dead=b.party.find(u=>!alive(u));
  for(const a of b.party.filter(alive)){
   const can=k=>availableSkills(a).includes(k)&&a.mp>=SKILLS[k].cost&&targetsFor(b,a.id,k).length&&(!SKILLS[k].supply||b.plans.filter(p=>p.skillId===k).length<b.supplies[SKILLS[k].supply]);
   let skill='strike',target=targets[0].id;
   if(dead&&can('revive')){skill='revive';target=dead.id;}
   else if(dead&&can('phoenix')){skill='phoenix';target=dead.id;}
   else if(low.hp/low.maxHp<.6&&can('mend')){skill='mend';target=low.id;}
   else if(low.hp/low.maxHp<.35&&can('herb')){skill='herb';target=low.id;}
   else if(can('hush')&&targets.some(t=>['blast','revive','heal'].includes(t.intent.type))){skill='hush';target=targets.find(t=>['blast','revive','heal'].includes(t.intent.type)).id;}
   else if(can('shelter')&&targets.some(t=>t.intent.type==='blast')){skill='shelter';target=a.id;}
   else if(can('interrupt')&&targets.some(t=>t.intent.type==='blast')){skill='interrupt';target=targets.find(t=>t.intent.type==='blast').id;}
   else if(can('ignite'))skill='ignite';
   else if(can('sever'))skill='sever';
   else if(can('pierce'))skill='pierce';
   else if(can('bash'))skill='bash';
   else if(can('break'))skill='break';
   queueAction(b,a.id,skill,target);
  }
  resolveRound(b,false,'hero');rounds++;
 }
 results.push({team:team.slice(1).join('/'),encounter:e.id,strategy,result:b.result||'timeout',rounds,hp:b.party.reduce((sum,u)=>sum+u.hp,0)});
}
const failed=results.filter(x=>x.result!=='victory');
console.log(JSON.stringify({runs:results.length,wins:results.length-failed.length,failed,encounters:ENCOUNTERS.map(e=>{const r=results.filter(x=>x.encounter===e.id);return {id:e.id,min:Math.min(...r.map(x=>x.rounds)),max:Math.max(...r.map(x=>x.rounds)),mean:Number((r.reduce((s,x)=>s+x.rounds,0)/r.length).toFixed(2))};})},null,2));
if(failed.length)process.exitCode=1;
