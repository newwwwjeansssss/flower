"""Build a visual review sheet directly from the saved trial levels."""
import html
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
cards=[]
for n in range(31,43):
 level=json.loads((root/f'flower-trial/level-{n}.json').read_text())
 overlaps={tuple(o['cell']) for o in level['overlapCells']}
 parts=[];size=20
 for x,y in level['activeCells']:
  shared=(x,y) in overlaps
  parts.append(f'<rect x="{x*size+1}" y="{y*size+1}" width="18" height="18" rx="2" fill="{"#ecdbf8" if shared else "#eddbb9"}" stroke="{"#9760b5" if shared else "#fff7eb"}"/>')
  if shared:parts.append(f'<text x="{x*size+10}" y="{y*size+14}" text-anchor="middle" font-size="12" font-weight="700" fill="#6a3884">2</text>')
 for f in level['fences']:
  x,y=f['a'];xx,yy=f['b']
  if y==yy:
   x1=x2=max(x,xx)*size;y1=y*size+2;y2=y*size+size-2
  else:
   y1=y2=max(y,yy)*size;x1=x*size+2;x2=x*size+size-2
  parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#8a5936" stroke-width="3" stroke-linecap="round"/>')
 name=html.escape(level['name'].split(' · ')[1]);landmark=html.escape(level['design']['landmark'])
 cards.append(f'<article><h2>{n} · {name}</h2><div class="board"><svg viewBox="0 0 {level["width"]*size} {level["height"]*size}" width="{level["width"]*size}" height="{level["height"]*size}">{"".join(parts)}</svg></div><p>{landmark}</p><small>{len(level["activeCells"])}格 · {len(level["fences"])}段栅栏</small></article>')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>31—42关重叠线索总览</title><style>
*{box-sizing:border-box}body{margin:0;padding:16px 24px;background:#f5f1e9;color:#40372e;font-family:system-ui,"PingFang SC",sans-serif}h1{font-size:22px;margin:0 0 5px}header p{font-size:12px;color:#786f65;margin:0 0 12px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}article{background:#fffaf2;border:1px solid #e6dbcc;border-radius:10px;padding:9px 12px;text-align:center;height:198px}h2{margin:0;font-size:14px;font-weight:650}.board{height:124px;display:flex;align-items:center;justify-content:center}article p{font-size:12px;margin:1px 0 2px}small{font-size:10px;color:#85776b}svg{overflow:visible}@media(max-width:800px){main{grid-template-columns:repeat(3,1fr)}}
</style><header><h1>31—42 · 从明确落笔点进入重叠</h1><p>紫色数字＝两次覆盖位置　棕色短线＝实际栅栏　｜　与编辑器保存的关卡一致</p></header><main>'''+''.join(cards)+'</main></html>'
(root/'docs/overlap-silhouettes.html').write_text(page)
