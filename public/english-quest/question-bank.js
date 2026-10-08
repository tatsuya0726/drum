// Parent-authored four-choice bank. Counts are approved records, never permutations.
const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function validateQuestionBank(rows,{approvedIds=[]}={}){
 if(!Array.isArray(rows))throw Error('Question bank must be an array');
 const ids=new Set(),content=new Set(),approved=new Set(approvedIds),warnings=[];
 const questions=rows.map(q=>{
  if(!q||typeof q.id!=='string'||!/^q_[a-z0-9_-]+$/i.test(q.id)||ids.has(q.id))throw Error('Duplicate or invalid question ID');ids.add(q.id);
  for(const k of ['category','prompt','explanation','englishText'])if(typeof q[k]!=='string'||!q[k].trim())throw Error(q.id+': missing '+k);
  if(!Number.isInteger(q.level)||q.level<1||q.level>6||!Array.isArray(q.options)||q.options.length!==4||q.options.some(v=>typeof v!=='string'||!v.trim())||new Set(q.options.map(normalize)).size!==4||!Number.isInteger(q.answerIndex)||q.answerIndex<0||q.answerIndex>3)throw Error(q.id+': invalid choices or level');
  const signature=normalize(q.prompt)+'|'+normalize(q.options[q.answerIndex]);if(content.has(signature))throw Error(q.id+': duplicate question content');content.add(signature);
  if(q.prompt.length>110||q.options.some(x=>x.length>90)||q.explanation.length>180)warnings.push({id:q.id,kind:'long-mobile-text'});
  return {...q,reviewed:approved.has(q.id),options:[...q.options]};
 });
 for(const id of approved)if(!ids.has(id))throw Error('Approval refers to missing question '+id);
 return {questions,approved:questions.filter(q=>q.reviewed),warnings,count:questions.filter(q=>q.reviewed).length};
}
export function chooseBankQuestion(bank,records={},options={},rng=Math.random){
 const pool=bank.filter(q=>q.reviewed&&q.level<=(options.level||6)&&(!options.category||q.category===options.category));
 if(!pool.length)return null;
 // Least-practiced questions first; mistakes increase priority. Stable ID tie-breaking.
 const rank=q=>{const r=records[q.id]||{correct:0,wrong:0};return r.correct-r.wrong*2;};
 pool.sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id));const lowest=rank(pool[0]),candidates=pool.filter(q=>rank(q)===lowest&&q.id!==options.previousId);const candidates2=candidates.length?candidates:pool.filter(q=>rank(q)===lowest);
 const roll=()=>{const n=rng();if(!Number.isFinite(n)||n<0||n>=1)throw Error('RNG must be in [0,1)');return n;};
 const q=candidates2[Math.floor(roll()*candidates2.length)],choices=q.options.map((text,i)=>({text,correct:i===q.answerIndex}));
 for(let i=choices.length-1;i>0;i--){const j=Math.floor(roll()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
 return {id:q.id,word:q.englishText,prompt:q.prompt,choices,meaning:q.category,core:q.explanation,example:q.englishText,translation:q.options[q.answerIndex],level:q.level};
}
