#!/usr/bin/env python3
"""Validate an English Quest question array; optionally compare an older bank.
Usage: python validate_questions.py questions.json [existing_questions.json]
The optional comparison flags exact content repeats, not semantic equivalence.
"""
import collections,hashlib,json,re,sys
from pathlib import Path
FIELDS={'id','level','category','prompt','options','answerIndex','explanation','englishText'}
CATEGORIES={'vocabulary/context','grammar','word order','conversation','meaning/idioms'}
def norm(s):return re.sub(r'\s+',' ',s.replace('’',"'").strip().casefold())
def tokens(s):return collections.Counter(re.findall(r"[a-z]+(?:['’][a-z]+)?",s.lower()))
def validate(path):
 data=json.loads(Path(path).read_text());assert isinstance(data,list)
 errors=[];ids=set();stimuli={};pairs={};levels=collections.Counter();categories=collections.Counter();positions=collections.defaultdict(collections.Counter)
 for q in data:
  label=q.get('id','<missing>')
  if set(q)!=FIELDS:errors.append(f'{label}: invalid fields')
  if label in ids:errors.append(f'{label}: duplicate ID')
  ids.add(label)
  if type(q.get('level'))!=int or q['level'] not in range(1,7):errors.append(f'{label}: invalid level')
  if q.get('category') not in CATEGORIES:errors.append(f'{label}: invalid category')
  for k in ('id','prompt','englishText','explanation'):
   if not isinstance(q.get(k),str) or not q[k].strip():errors.append(f'{label}: missing {k}')
  op=q.get('options',[])
  if len(op)!=4 or len(set(norm(o) for o in op))!=4:errors.append(f'{label}: options must be four distinct strings')
  if any(not isinstance(o,str) or not o.strip() for o in op):errors.append(f'{label}: empty option')
  if type(q.get('answerIndex'))!=int or q['answerIndex'] not in range(4):errors.append(f'{label}: invalid answerIndex')
  st=norm(q['englishText'])
  if st in stimuli:errors.append(f'{label}: duplicate English stimulus with {stimuli[st]}')
  stimuli[st]=label
  pair=(norm(q['prompt']),st)
  if pair in pairs:errors.append(f'{label}: duplicate question with {pairs[pair]}')
  pairs[pair]=label
  if q['category']=='word order' and q['englishText'].lower().startswith('words:'):
   source=tokens(q['englishText'].split(':',1)[1])
   for i,opt in enumerate(op):
    if tokens(opt)!=source:errors.append(f'{label}: option {i} changes the supplied word multiset')
  levels[q['level']]+=1;categories[(q['level'],q['category'])]+=1;positions[q['level']][q['answerIndex']]+=1
 return data,dict(total=len(data),sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),perLevel=dict(levels),perLevelAnswerPositions={str(k):dict(v) for k,v in positions.items()},perLevelCategories={str(l):{c:categories[l,c] for c in sorted(CATEGORIES)} for l in sorted(levels)},errors=errors)
if __name__=='__main__':
 data,report=validate(sys.argv[1]);report['existingCorpusComparison']='not supplied'
 if len(sys.argv)>2:
  old=json.loads(Path(sys.argv[2]).read_text());lookup={norm(q.get('englishText',q.get('question',''))):q.get('id','?') for q in old}
  report['existingCorpusComparison']=[{'newId':q['id'],'existingId':lookup[norm(q['englishText'])]} for q in data if norm(q['englishText']) in lookup]
 print(json.dumps(report,ensure_ascii=False,indent=2));sys.exit(bool(report['errors']))
