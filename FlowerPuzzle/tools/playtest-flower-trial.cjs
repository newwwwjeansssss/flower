const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const output=process.env.QA_DIR || path.join(require('node:os').tmpdir(),'flower-trial-qa');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.EDITOR_URL || 'http://127.0.0.1:8766');
 await page.waitForSelector('.level-card');
 await page.selectOption('#level-collection','flower-trial');
 await page.waitForFunction(()=>document.querySelectorAll('.level-card').length===37);
 await page.screenshot({path:path.join(output,'editor.png')});
 const levels=process.env.PLAYTEST_LEVELS ? process.env.PLAYTEST_LEVELS.split(',').map(Number) : [4,6,8,10,12,14,16,17,18,20,21,22,23,24,25];
 for(const n of levels){
  await page.locator(`.level-card[data-id="${200000+n}"]`).click();
  await page.locator('#play-result').waitFor({state:'hidden'});
  const routes=await page.evaluate(async n=>{
   const l=await (await fetch(`flower-trial/level-${n}.json`)).json();
   const canvas=document.querySelector('#game-canvas'),r=canvas.getBoundingClientRect();
   const b=window.FlowerPuzzleRuntime.computeBoardLayout({x:28,y:152,width:334,height:540},l);
   const hasPreset=t=>l.given.presetPots.some(p=>t.solutionCells.some(c=>c.join(',')===p.cell.join(',')));
   return [...l.targets].sort((a,b)=>Number(hasPreset(b))-Number(hasPreset(a))).map(t=>{
    const all=new Set(t.solutionCells.map(c=>c.join(','))),seen=new Set(),path=[];
    const start=l.given.presetPots.find(p=>all.has(p.cell.join(',')))?.cell||t.solutionCells[0];
    function visit(p){seen.add(p.join(','));path.push(p);for(const q of [[p[0]+1,p[1]],[p[0]-1,p[1]],[p[0],p[1]+1],[p[0],p[1]-1]])if(all.has(q.join(','))&&!seen.has(q.join(','))){visit(q);path.push(p);}}
    visit(start);
    return path.map(([x,y])=>({x:r.left+(b.x+(x+.5)*b.cellSize)*r.width/canvas.width,y:r.top+(b.y+(y+.5)*b.cellSize)*r.height/canvas.height}));
   });
  },n);
  await page.screenshot({path:path.join(output,`level-${n}.png`)});
  for(const path of routes){await page.mouse.move(path[0].x,path[0].y);await page.mouse.down();for(const p of path.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();}
  await page.locator('#play-result').waitFor({state:'visible',timeout:10000});
  if((await page.locator('#edit-status').innerText()).includes('已选择'))throw Error('play stroke leaked into editor selection');
  console.log(`UI pointer win ${n}`);
  if(n===42){if(!(await page.locator('#next-level').isDisabled()))throw Error('last trial next must be disabled');}
  if(n===6){await page.screenshot({path:path.join(output,'win-6.png')});await page.locator('#next-level').click();await page.waitForFunction(()=>document.querySelector('.level-card.active')?.dataset.id==='200007');}
 }
 await page.selectOption('#level-collection','flower');
 if(await page.locator('.level-card').count()!==500)throw Error('main count changed');
 await page.selectOption('#level-collection','shape-fill');
 if(await page.locator('.level-card').count()!==140)throw Error('Shape Fill count changed');
 await page.selectOption('#level-collection','flower-trial');
 await page.reload();await page.waitForSelector('.level-card');await page.selectOption('#level-collection','flower-trial');
 if(await page.locator('.level-card').count()!==37)throw Error('reload failed');
 await page.evaluate(async()=>{
  const {renderEditorScene}=await import('./static/js/editor-tools.js?v=20261022-mechanics-audit');
  const assets=await(await fetch('asset.json')).json();
  document.body.innerHTML='';document.body.style='display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:18px;background:#e8e4dc;color:#333;overflow:auto;height:auto';
  for(let n=1;n<=25;n++){
   const l=await(await fetch(`flower-trial/level-${n}.json`)).json();
   const card=document.createElement('div');card.style='background:#fff8ee;padding:10px;border-radius:12px';
   const title=document.createElement('div');title.textContent=l.name;title.style='font:bold 16px sans-serif;margin-bottom:8px';card.append(title);
   const c=document.createElement('canvas');c.width=250;c.height=245;c.style='width:100%';card.append(c);document.body.append(card);
   const b=window.FlowerPuzzleRuntime.computeBoardLayout({x:10,y:10,width:230,height:225},l);renderEditorScene(window.FlowerPuzzleRuntime,c.getContext('2d'),l,b,assets);
  }
 });
 await page.screenshot({path:path.join(output,'contact-sheet.png'),fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
