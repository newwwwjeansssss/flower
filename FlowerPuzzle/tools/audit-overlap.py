"""Solve the repeatable-shape overlap rules, without treating target counts as inventory."""
import json
from hashlib import sha256
from pathlib import Path
from functools import lru_cache
root=Path(__file__).resolve().parents[1]
def variants(shape):
 result=set()
 for m in [1,-1]:
  p=[(m*x,y) for x,y in shape]
  for _ in range(4):
   ax=min(x for x,y in p);ay=min(y for x,y in p)
   result.add(tuple(sorted((x-ax,y-ay) for x,y in p)))
   p=[(-y,x) for x,y in p]
 return result
report=[]
for n in range(31,43):
 l=json.loads((root/f'flower-trial/level-{n}.json').read_text());cells=list(map(tuple,l['activeCells']));index={c:i for i,c in enumerate(cells)}
 cap=tuple(next((o['count'] for o in l['overlapCells'] if tuple(o['cell'])==c),1) for c in cells)
 types={t['assetId']:t['shape'] for t in l['targets']};moves=[];unfenced=[]
 for typ,shape in enumerate(types.values()):
  for v in variants(shape):
   for x in range(l['width']):
    for y in range(l['height']):
     cc=[(a+x,b+y) for a,b in v]
     if all(c in index for c in cc):unfenced.append((typ,tuple(sorted(index[c] for c in cc))))
     if all(c in index for c in cc) and not any(tuple(f['a']) in cc and tuple(f['b']) in cc for f in l.get('fences',[])):moves.append((typ,tuple(sorted(index[c] for c in cc))))
 moves=list(set(moves));full=(1<<len(types))-1
 @lru_cache(None)
 def solve(rem,used):
  if not any(rem):return used==full
  candidates=[(sum(all(rem[i]>0 for i in inds) for _,inds in moves if k in inds),k) for k,v in enumerate(rem) if v]
  _,k=min(candidates)
  for typ,inds in moves:
   if k in inds and all(rem[i]>0 for i in inds):
    rr=list(rem)
    for i in inds:rr[i]-=1
    if solve(tuple(rr),used|(1<<typ)):return True
  return False
 assert solve(cap,0)
 good=0;goodMoves=set()
 for typ,inds in moves:
  rr=list(cap)
  for i in inds:rr[i]-=1
  if solve(tuple(rr),1<<typ):good+=1;goodMoves.add((typ,inds))
 active=set(cells)
 outside={(x,y) for x in range(-1,l['width']+1) for y in range(-1,l['height']+1)}-active
 seen={(-1,-1)};queue=[(-1,-1)]
 while queue:
  x,y=queue.pop()
  for c in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if c in outside and c not in seen:seen.add(c);queue.append(c)
 holes=len(outside-seen)
 overlaps={tuple(o['cell']) for o in l['overlapCells']}
 core=[set(map(tuple,t['solutionCells'])) for t in l['targets'] if overlaps.intersection(map(tuple,t['solutionCells']))]
 coreUnion=set.union(*core)
 ordinary=[set(map(tuple,t['solutionCells'])) for t in l['targets'] if not overlaps.intersection(map(tuple,t['solutionCells']))]
 touching=sum(sum(any((x+dx,y+dy) in coreUnion for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]) for x,y in p)>=2 for p in ordinary)
 sharedPairs=[len(a&b) for i,a in enumerate(core) for b in core[i+1:] if a&b]
 # Propagate locally forced placements; no use of the supplied reference solution.
 remaining=list(cap);forced=0
 while any(remaining):
  fits=[m for m in moves if all(remaining[i]>0 for i in m[1])]
  certain=None
  for k,v in enumerate(remaining):
   options=[m for m in fits if k in m[1]]
   if v and len(options)==v:certain=options[0];break
  if certain is None:break
  for i in certain[1]:remaining[i]-=1
  forced+=1
 entries=[]
 for o,c in zip(sorted(overlaps),l['design']['entryCells']):
  c=tuple(c);choices=[m for m in moves if index[c] in m[1]]
  boundary=sum((c[0]+dx,c[1]+dy) not in active for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)])
  fences=sum(c in [tuple(f['a']),tuple(f['b'])] for f in l['fences'])
  continuations=[]
  for first in choices:
   rem=list(cap)
   for i in first[1]:rem[i]-=1
   nexts=[m for m in moves if index[o] in m[1] and all(rem[i] for i in m[1])]
   viable=0
   for typ,inds in nexts:
    rr=rem.copy()
    for i in inds:rr[i]-=1
    viable+=bool(solve(tuple(rr),(1<<typ)|(1<<first[0])))
   continuations.append({'nextChoicesAtOverlap':len(nexts),'solvableNextChoices':viable})
  entries.append({'continuations':continuations,'overlapCell':o,'entryCell':c,'entryBoundaryEdges':boundary,'entryFenceEdges':fences,'choicesWithoutFences':sum(index[c] in m[1] for m in set(unfenced)),'legalChoices':len(choices),'choicesReachingOverlap':sum(index[o] in m[1] for m in choices),'solvableChoices':sum(m in goodMoves for m in choices)})
 impacts=[]
 for f in l['fences']:
  a,b=index[tuple(f['a'])],index[tuple(f['b'])]
  impacts.append({'a':f['a'],'b':f['b'],'excludedPlacements':sum(a in inds and b in inds for _,inds in set(unfenced))})
 report.append({'level':n,'inputDigest':sha256((root/f'flower-trial/level-{n}.json').read_bytes()).hexdigest(),'localEntries':entries,'forcedPlacementsBeforeChoice':forced,'coverageRemainingAfterForcedMoves':sum(remaining),'fenceImpacts':impacts,'activeCells':len(cells),'boardDensity':round(len(cells)/(l['width']*l['height']),3),'enclosedHoleCells':holes,'ordinaryFlowersTouchingCoreAtTwoCells':touching,'sharedCellsPerCorePair':sharedPairs,'legalOpeningPlacements':len(moves),'solvableOpeningPlacements':good,'deadOpeningPlacements':len(moves)-good})
print(json.dumps(report,ensure_ascii=False,indent=2))
