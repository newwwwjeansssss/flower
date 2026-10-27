"""Deterministic trial authoring and exact-cover audit of the actual runtime rules.

Shapes may be reused without a quota; every offered shape type must be used.
Fence endpoints cannot belong to one flower. Preset cells stay one flower.
Run with --generate to build the isolated trial collection; default audits it.
"""
import collections
import functools
import hashlib
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRIAL = ROOT / 'flower-trial'
ASSETS = {a['id']: a for c in json.loads((ROOT/'asset.json').read_text())['categories'] for a in c['items'] if a.get('type') == 'shape'}
HINT_LAYOUTS = json.loads((ROOT/'tools/trial-hint-layouts.json').read_text())

def variants(shape):
    out = {}
    for flip in (False, True):
        p = [(-x if flip else x, y) for x, y in shape]
        for turn in range(4):
            mx, my = min(x for x,y in p), min(y for x,y in p)
            norm = tuple(sorted(((x-mx,y-my) for x,y in p), key=lambda c:(c[1],c[0])))
            out.setdefault(norm, ('M' if flip else '') + f'R{turn*90}')
            p = [(-y,x) for x,y in p]
    return list(out.items())

def neighbors(p):
    x,y=p
    return ((x-1,y),(x+1,y),(x,y-1),(x,y+1))

def preset_completions(level):
    """Local legal ways to extend the initial preset group, before any moves."""
    preset={tuple(p['cell']) for p in level['given']['presetPots']}
    if not preset:return []
    cells=set(map(tuple,level['activeCells']))-{tuple(f['cell']) for f in level['given']['fixedFlowers']}
    fences=[{tuple(f['a']),tuple(f['b'])} for f in level['fences']]
    out=[]
    for name in sorted({t['assetId'] for t in level['targets']}):
        for shape,_ in variants(ASSETS[name]['cells']):
            for x in range(level['width']):
                for y in range(level['height']):
                    p={(x+a,y+b) for a,b in shape}
                    if preset<p and p<=cells and not any(f<=p for f in fences):
                        out.append(dict(assetId=name,cells=sorted(map(list,p),key=lambda c:(c[1],c[0]))))
    return out

def build_hint_revision(source, counts, number):
    recipe=HINT_LAYOUTS[str(number)];pattern=recipe['pattern'];targets=[]
    for letter in sorted(set(''.join(pattern))-set('.#')):
        cells=[[x,y] for y,row in enumerate(pattern) for x,c in enumerate(row) if c==letter]
        mx,my=min(x for x,y in cells),min(y for x,y in cells)
        norm=tuple((x-mx,y-my) for x,y in cells)
        matches=[(name,dict(variants(ASSETS[name]['cells']))[norm]) for name in counts if norm in dict(variants(ASSETS[name]['cells']))]
        assert len(matches)==1,(number,letter,matches)
        name,trans=matches[0]
        targets.append(dict(id=f'target-{len(targets)+1}',assetId=name,shape=ASSETS[name]['cells'],transform=trans,variant=trans,origin=[mx,my],solutionCells=cells))
    assert collections.Counter(t['assetId'] for t in targets)==counts
    return dict(id=200000+number,sourceId=number,collection='flower-trial',name=f'试玩 {number:02d} · {SPECS[number-1][3]}',type='flower-puzzle',
                width=max(map(len,pattern)),height=len(pattern),activeCells=[[x,y] for y,row in enumerate(pattern) for x,c in enumerate(row) if c!='.'],
                given=dict(fixedFlowers=[dict(cell=[x,y],color='coral') for y,row in enumerate(pattern) for x,c in enumerate(row) if c=='#'],presetPots=[dict(cell=p) for p in recipe['presetCells']]),
                fences=recipe['fences'],targets=targets,requirements=[dict(assetId=k,count=v) for k,v in counts.items()],timeLimit=source['timeLimit'])

def analyze(level, orientation=None):
    cells = set(map(tuple, level['activeCells'])) - {tuple(f['cell']) for f in level['given']['fixedFlowers']}
    ordered = sorted(cells)
    index = {p:i for i,p in enumerate(ordered)}
    fences = [set((tuple(f['a']),tuple(f['b']))) for f in level['fences']]
    preset = {tuple(p['cell']) for p in level['given']['presetPots']}
    shapes = {t['assetId']:t['shape'] for t in level['targets']}
    options = []
    for k,(name,shape) in enumerate(shapes.items()):
        for variant,_ in variants(shape):
            if name=='I4' and orientation is not None:
                horizontal=len({y for x,y in variant})==1
                if horizontal != (orientation=='horizontal'):continue
            for x in range(level['width']):
                for y in range(level['height']):
                    s = {(x+a,y+b) for a,b in variant}
                    if not s<=cells or any(f<=s for f in fences) or (s&preset and not preset<=s):
                        continue
                    options.append((k,sum(1<<index[p] for p in s)))
    by_cell = [[(k,p) for k,p in options if p>>i&1] for i in range(len(cells))]
    all_types = (1<<len(shapes))-1
    full = (1<<len(cells))-1
    @functools.lru_cache(None)
    def solve(mask, used):
        if not mask:
            return int(used==all_types)
        remaining = mask
        best = None
        while remaining:
            bit = remaining & -remaining
            remaining ^= bit
            opts = [(k,p) for k,p in by_cell[bit.bit_length()-1] if p&mask==p]
            if not opts:
                return 0
            if best is None or len(opts)<len(best):
                best=opts
        return sum(solve(mask^p,used|1<<k) for k,p in best)
    solutions = solve(full,0)
    dead = sum(solve(full^p,1<<k)==0 for k,p in options)
    return dict(solutions=solutions, placements=len(options), dead=dead,
                deadPct=round(dead/max(1,len(options))*100,1),
                playableCells=len(cells), pieces=len(level['targets']), types=len(shapes))

# source number, authored shapes, desired first-move trap percentage, curve role
SPECS = [
 (1, {'square4':2}, 20, '入门'),
 (2, {'L4':2}, 25, '转角入门'),
 (3, {'L4':3}, 30, '转角练习'),
 (4, {'I4':4}, 35, '直条练习'),
 (5, {'T4':3}, 20, '丁字入门'),
 (6, {'L4':4}, 45, '轻挑战'),
 (7, {'Z4':2,'square4':2}, 30, '折线初见'),
 (8, {'I4':5}, 30, '纵横直条'),
 (9, {'L3':5}, 35, '转角练习'),
 (10, {'L3':4}, 35, '转角回落'),
 (11, {'L4':3}, 25, '固定花朵初见'),
 (12, {'I4':5}, 45, '固定花朵轻挑战'),
 (13, {'L3':3,'L4':3}, 30, '双转角回落'),
 (14, {'L3':3}, 15, '围栏初见'),
 (15, {'L4':3,'L3':3}, 45, '双转角挑战'),
 (16, {'U5':2,'L3':2}, 45, '五格轻挑战'),
 (17, {'L4':5}, 35, '绕栏转角'),
 (18, {'L3':6}, 40, '围栏花径'),
 (19, {'L3':2,'T4':4}, 40, '阶段挑战'),
 (20, {'L4':5}, 25, '阶段回落'),
 (21, {'L3':3}, 15, '预置花盆初见'),
 (22, {'L3':3,'L4':3}, 40, '双转角练习'),
 (23, {'L4':6}, 45, '绕花转角'),
 (24, {'L3':4,'L4':3}, 50, '预置转角挑战'),
 (25, {'T4':4,'L4':4}, 50, '阶段挑战'),
]

# The shared corner cells admit both directions. Staggered joins prevent the
# silhouette from splitting into independent horizontal and vertical strips.
# Letters are authored I4 flowers; # preserves level 12's four fixed flowers.
STRAIGHT_PATTERNS = {
    4: ['AAAAB', 'D...B', 'D...B', 'D...B', 'DCCCC'],
    8: ['AAAABC', 'D...BC', 'D...BC', 'D...BC', 'D.EEEE'],
    12: ['....AC', 'BBBBAC', 'D.##AC', 'D.##AC', 'D.EEEE', 'D.....'],
}

def straight_interleaving(level):
    pieces=[set(map(tuple,t['solutionCells'])) for t in level['targets']]
    active=set.union(*pieces)
    horizontal=[len({y for x,y in p})==1 for p in pieces]
    cuts=[dict(axis='xy'[axis],after=cut) for axis in (0,1)
          for cut in range(min(p[axis] for p in active),max(p[axis] for p in active))
          if not any(min(p[axis] for p in piece)<=cut<max(p[axis] for p in piece) for piece in pieces)]
    choices=[set(),set()]
    for axis in (0,1):
        for x,y in active:
            placement={(x+k*(axis==0),y+k*(axis==1)) for k in range(4)}
            if placement<=active:choices[axis]|=placement
    return dict(horizontalPieces=sum(horizontal),verticalPieces=len(pieces)-sum(horizontal),
                separatingCuts=cuts,directionChoiceCells=len(choices[0]&choices[1]))

def fence_effects(level):
    base=analyze(level)
    without=analyze(dict(level,fences=[]))
    individual=[analyze(dict(level,fences=level['fences'][:j]+level['fences'][j+1:]))['solutions']-base['solutions'] for j in range(len(level['fences']))]
    return dict(withoutFencesSolutions=without['solutions'],withoutFencesPlacements=without['placements'],additionalSolutionsPerRemovedFence=individual)

def prune_redundant_fences(level):
    # Every retained fence excludes a full solution even with all other fences present.
    base=analyze(level)['solutions']
    for j in range(len(level['fences'])-1,-1,-1):
        reduced=level['fences'][:j]+level['fences'][j+1:]
        if analyze(dict(level,fences=reduced))['solutions']==base:
            level['fences']=reduced

def build_candidate(source, counts, rng, number):
    if str(number) in HINT_LAYOUTS:return build_hint_revision(source,counts,number)
    # Grow a connected garden. Compact attachment is preferred but not mandatory.
    names = [name for name,n in counts.items() for _ in range(n)]
    rng.shuffle(names)
    directions=[True]*2+[False]*(len(names)-2)
    rng.shuffle(directions)
    placed=[]; occupied=set()
    max_width = 6 if number in (4,8,12) else (5 if len(names)<6 else 6)
    max_height = 7 if len(names)<6 else 9
    for piece_index,name in enumerate(names):
        candidates=[]
        for shape,transform in variants(ASSETS[name]['cells']):
            if number in (4,8,12) and (len({y for x,y in shape})==1)!=directions[piece_index]:continue
            if not occupied:
                candidates.append((0,set(shape),transform)); continue
            border={p for c in occupied for p in neighbors(c)}-occupied
            offsets={(p[0]-a,p[1]-b) for p in border for a,b in shape}
            for x,y in sorted(offsets):
                s={(x+a,y+b) for a,b in shape}
                if s&occupied:continue
                union=s|occupied
                w=max(a for a,b in union)-min(a for a,b in union)+1
                h=max(b for a,b in union)-min(b for a,b in union)+1
                if w>max_width or h>max_height:continue
                contact=sum(q in occupied for p in s for q in neighbors(p))
                cost=w*h-len(union)-contact*1.5+rng.uniform(0,10)
                candidates.append((cost,s,transform))
        if not candidates:return None
        _,s,transform=min(candidates,key=lambda c:c[0])
        placed.append((name,s,transform));occupied|=s
    if number==10 or number in STRAIGHT_PATTERNS:
        pattern=STRAIGHT_PATTERNS.get(number,['ABB','AAB','CCD','CDD'])
        asset='L3' if number==10 else 'I4'
        placed=[];occupied=set()
        for letter in sorted(set(''.join(pattern))-set('.#')):
            s={(x,y) for y,row in enumerate(pattern) for x,c in enumerate(row) if c==letter}
            mx,my=min(x for x,y in s),min(y for x,y in s)
            norm=tuple(sorted(((x-mx,y-my) for x,y in s),key=lambda c:(c[1],c[0])))
            placed.append((asset,s,dict(variants(ASSETS[asset]['cells']))[norm]));occupied|=s
    # Fixed flowers remain a readable contiguous region of the original size.
    fixed_count=len(source['given']['fixedFlowers'])
    fixed=set()
    if number in STRAIGHT_PATTERNS:
        fixed={(x,y) for y,row in enumerate(STRAIGHT_PATTERNS[number]) for x,c in enumerate(row) if c=='#'}
        assert len(fixed)==fixed_count
    elif fixed_count:
        fw,fh=2,fixed_count//2
        opts=[]
        for x in range(min(x for x,y in occupied)-fw,max(x for x,y in occupied)+2):
            for y in range(min(y for x,y in occupied)-fh,max(y for x,y in occupied)+2):
                s={(x+a,y+b) for a in range(fw) for b in range(fh)}
                if s&occupied or not any(q in occupied for p in s for q in neighbors(p)):continue
                union=s|occupied
                w=max(a for a,b in union)-min(a for a,b in union)+1
                h=max(b for a,b in union)-min(b for a,b in union)+1
                if w>max_width or h>max_height:continue
                contact=sum(q in occupied for p in s for q in neighbors(p))
                opts.append((w*h-contact*2+rng.uniform(0,8),s))
        if not opts:return None
        fixed=min(opts,key=lambda c:c[0])[1]
    active=occupied|fixed
    mx,my=min(x for x,y in active),min(y for x,y in active)
    shift=lambda s:sorted(([x-mx,y-my] for x,y in s),key=lambda c:(c[1],c[0]))
    targets=[dict(id=f'target-{j+1}',assetId=name,shape=ASSETS[name]['cells'],transform=trans,variant=trans,origin=[min(x for x,y in s)-mx,min(y for x,y in s)-my],solutionCells=shift(s)) for j,(name,s,trans) in enumerate(placed)]
    owners={p:j for j,(_,s,_) in enumerate(placed) for p in s}
    edges=[(p,q) for p in sorted(occupied) for q in neighbors(p) if q in occupied and p<q and owners[p]!=owners[q]]
    needed=len(source['fences'])
    if len(edges)<needed:return None
    rng.shuffle(edges)
    fences=[dict(a=[p[0]-mx,p[1]-my],b=[q[0]-mx,q[1]-my],role=source['fences'][j]['role']) for j,(p,q) in enumerate(edges[:needed])]
    preset=[]
    if source['given']['presetPots']:
        t=rng.choice(targets);s=set(map(tuple,t['solutionCells']))
        pairs=[(p,q) for p in sorted(s) for q in neighbors(p) if q in s and p<q]
        p,q=rng.choice(pairs);preset=[dict(cell=list(p)),dict(cell=list(q))]
    return dict(id=200000+number,sourceId=number,collection='flower-trial',name=f'试玩 {number:02d} · {SPECS[number-1][3]}',type='flower-puzzle',
                width=max(x for x,y in active)-mx+1,height=max(y for x,y in active)-my+1,activeCells=shift(active),
                given=dict(fixedFlowers=[dict(cell=c,color='coral') for c in shift(fixed)],presetPots=preset),fences=fences,targets=targets,
                requirements=[dict(assetId=k,count=v) for k,v in counts.items()],timeLimit=source['timeLimit'])

def main():
    generate='--generate' in sys.argv
    selected=next((set(map(int,a.split('=',1)[1].split(','))) for a in sys.argv if a.startswith('--levels=')),set(range(1,26)))
    TRIAL.mkdir(exist_ok=True)
    report=[]
    for number,counts,desired,role in SPECS:
        original_path=ROOT/'level'/f'level-{number}.json'
        source=json.loads(original_path.read_text())
        original=analyze(source)
        if generate and number in selected:
            rng=random.Random(2026102700+number)
            best=None
            for attempt in range(1 if number in STRAIGHT_PATTERNS or str(number) in HINT_LAYOUTS else 450):
                candidate=build_candidate(source,counts,rng,number)
                if not candidate:continue
                if number in (4,8,12):
                    horizontal=sum(len({y for x,y in t['solutionCells']})==1 for t in candidate['targets'])
                    if not 2<=horizontal<=len(candidate['targets'])-2:continue
                    if any(analyze(candidate,orientation)['solutions'] for orientation in ('horizontal','vertical')):continue
                if source['fences']:
                    prune_redundant_fences(candidate)
                    minimum=1 if number in (14,16) else (3 if number in (19,25) else 2)
                    if len(candidate['fences'])<minimum:continue
                metrics=analyze(candidate)
                if not metrics['solutions']:continue
                # Prefer a compact, readable silhouette and fewer misleading options.
                fill=len(candidate['activeCells'])/(candidate['width']*candidate['height'])
                cost=abs(metrics['deadPct']-desired)+max(0,0.7-fill)*60 + max(0,metrics['placements']-len(candidate['targets'])*5)*0.4
                cost+=max(0,candidate['height']-7)*2
                if best is None or cost<best[0]:best=cost,candidate,metrics
            if best is None:raise RuntimeError(f'No candidate for {number}')
            _,level,new=best
            (TRIAL/f'level-{number}.json').write_text(json.dumps(level,ensure_ascii=False,indent=2)+'\n')
        else:
            level=json.loads((TRIAL/f'level-{number}.json').read_text());new=analyze(level)
        row=dict(level=number,role=role,shapes=dict(collections.Counter(t['assetId'] for t in level['targets'])),original=original,trial=new,originalSha256=hashlib.sha256(original_path.read_bytes()).hexdigest())
        if level['fences']:row['fenceEffect']=fence_effects(level)
        if number in (22,23,25):row['presetHint']=dict(cells=[p['cell'] for p in level['given']['presetPots']],completions=preset_completions(level))
        if number in (4,8,12):
            row['orientationOnlySolutions']={o:analyze(level,o)['solutions'] for o in ('horizontal','vertical')}
            row['interleaving']=straight_interleaving(level)
        report.append(row)
        print(f"{number:02d}: {original['deadPct']:5.1f}% -> {new['deadPct']:5.1f}%; choices {original['placements']} -> {new['placements']}; solutions={new['solutions']}; {level['width']}x{level['height']}",flush=True)
    (ROOT/'docs'/'flower-trial-audit.json').write_text(json.dumps(dict(rule='Unlimited repetitions; every offered type used at least once; no enclosed fence; preset group indivisible.',levels=report),ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
