import {HEROES,ENCOUNTERS,SKILLS} from '../public/english-quest/data.js';
import {createBattle,queueAction,resolveRound,resumePlanning,alive,availableSkills,targetsFor} from '../public/english-quest/engine.js';
export function simulate(team,chapter,strategy='support',answers='correct'){
 const e=ENCOUNTERS[chapter];
 const b=createBattle(team,e.id,1+Math.floor(chapter/2));let rounds=0,damage=0,deaths=0;
 while(!b.result&&rounds<40){
  if(b.phase==='feedback')resumePlanning(b);
  const targets=b.enemies.filter(alive).sort((a,c)=>{
   const rank=strategy==='support'?['revenant','mirror','acolyte','oracle','hound','wraith','sentinel','bellwarden','eclipse']:['oracle','hound','wraith','bellwarden','eclipse','sentinel','acolyte','mirror','revenant'];
   return strategy==='naive'?0:rank.indexOf(a.key)-rank.indexOf(c.key);
  });
  const low=b.party.filter(alive).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0],dead=b.party.find(u=>!alive(u));
  for(const a of b.party.filter(alive)){
   const can=k=>availableSkills(a).includes(k)&&a.mp>=SKILLS[k].cost&&targetsFor(b,a.id,k).length&&(!SKILLS[k].supply||b.plans.filter(p=>p.skillId===k).length<b.supplies[SKILLS[k].supply]);
   let skill='strike',target=targets[0].id;
   if(strategy==='naive'){}
   else if(dead&&can('revive')){skill='revive';target=dead.id;}
   else if(dead&&can('phoenix')){skill='phoenix';target=dead.id;}
   else if(low.hp/low.maxHp<.6&&can('mend')){skill='mend';target=low.id;}
   else if(low.hp/low.maxHp<.35&&can('herb')){skill='herb';target=low.id;}
   else if(can('hush')&&targets.some(t=>['blast','revive','heal'].includes(t.intent.type))){skill='hush';target=targets.find(t=>['blast','revive','heal'].includes(t.intent.type)).id;}
   else if(can('shelter')&&targets.some(t=>t.intent.type==='blast')){skill='shelter';target=a.id;}
   else if(can('interrupt')&&targets.some(t=>t.intent.type==='blast')){skill='interrupt';target=targets.find(t=>t.intent.type==='blast').id;}
   else if(can('frost')&&targets.some(t=>t.intent.type==='blast')){skill='frost';target=targets.find(t=>t.intent.type==='blast').id;}
   else if(can('ignite'))skill='ignite';
   else if(can('sever'))skill='sever';
   else if(can('pierce'))skill='pierce';
   else if(can('bash'))skill='bash';
   else if(can('break'))skill='break';
   queueAction(b,a.id,skill,target);
  }
  const events=resolveRound(b,answers==='correct'||rounds%3!==1);
  damage+=events.filter(e=>e.actor?.startsWith('e')&&!e.target?.startsWith('e')).reduce((n,e)=>n+e.amount,0);
  deaths+=events.filter(e=>e.kind==='defeat'&&!e.target?.startsWith('e')).length;rounds++;
 }
 return {team:team.slice(1).join('/'),encounter:e.id,strategy,answers,result:b.result||'timeout',rounds,hp:b.party.reduce((sum,u)=>sum+u.hp,0),damage,deaths,supplies:6-b.supplies.herb-b.supplies.antidote-b.supplies.phoenix};
}
export function balanceReport(){
 const ids=Object.keys(HEROES).filter(x=>x!=='hero'),teams=[];
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)for(let k=j+1;k<ids.length;k++)teams.push(['hero',ids[i],ids[j],ids[k]]);
 const results=[];
 for(const team of teams)for(let chapter=0;chapter<ENCOUNTERS.length;chapter++)for(const strategy of ['naive','support','threat'])for(const answers of ['correct','mixed'])results.push(simulate(team,chapter,strategy,answers));
 return {runs:results.length,summary:ENCOUNTERS.flatMap(e=>['correct','mixed'].map(answers=>({encounter:e.id,answers,policies:Object.fromEntries(['naive','support','threat'].map(strategy=>{const r=results.filter(x=>x.encounter===e.id&&x.answers===answers&&x.strategy===strategy);return [strategy,{wins:r.filter(x=>x.result==='victory').length,total:r.length,rounds:+(r.reduce((n,x)=>n+x.rounds,0)/r.length).toFixed(1),damage:+(r.reduce((n,x)=>n+x.damage,0)/r.length).toFixed(1),deaths:r.reduce((n,x)=>n+x.deaths,0)}];}))}))),results};
}
export function verifyBalance(report){
 const failures=[];
 for(const r of report.results)if(r.strategy!=='naive'&&r.result!=='victory')failures.push(`Tactical defeat: ${r.team}/${r.encounter}/${r.strategy}/${r.answers}`);
 for(const answers of ['correct','mixed']){
  if(simulate(['hero'],0,'naive',answers).result!=='victory')failures.push(`Solo introduction too hard: ${answers}`);
  const end=report.summary.find(r=>r.encounter==='eclipse'&&r.answers===answers);
  if(end.policies.naive.wins>=end.policies.support.wins)failures.push(`Final chapter needs a tactical advantage: ${answers}`);
  for(const encounter of ['belfry','procession']){
   const p=report.summary.find(r=>r.encounter===encounter&&r.answers===answers).policies;
   if(p.support.damage>=p.naive.damage*.8||p.threat.damage>=p.naive.damage*.8)failures.push(`Insufficient defensive benefit: ${encounter}/${answers}`);
  }
 }
 return failures;
}
if(process.argv[1]?.endsWith('english-quest-balance.mjs')){
 const report=balanceReport();report.failures=verifyBalance(report);console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
}
