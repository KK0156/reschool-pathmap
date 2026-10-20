from browser_support import reveal, memo_entry, close_student_detail
from pathlib import Path
import json,time
from playwright.sync_api import sync_playwright,expect
out=Path('/workspace/reschool-phase4-review/regressions');out.mkdir(parents=True,exist_ok=True)
def node(i,parent,t='action'):
 return dict(id=i,parent=parent,label='比較して確かめる '+i,type=t,detail='架空の検証用データです。',evidence='未確認',risk='未確認',next_action='学校の先生に相談する。')
nodes=[node('root',None,'core_question')]
for group in range(10):
 nodes.append(node('g'+str(group),'root','project'))
 for i in range(19 if group<9 else 18):nodes.append(node(f'g{group}n{i}','g'+str(group)))
tree=dict(core_question='多くの選択肢を整理するには？',summary='性能確認用の架空の200項目。',nodes=nodes)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1024,'height':1000},has_touch=True);page=context.new_page();errors=[];calls=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:calls.append(r.url) if '/.netlify/functions/' in r.url and r.method=='POST' else None)
 page.goto('http://localhost:8002/#/tree')
 page.locator('#import-tree').set_input_files({'name':'large.json','mimeType':'application/json','buffer':json.dumps(tree).encode()})
 expect(page.locator('.tree-node')).to_have_count(200)
 reveal(page,'[data-map-action=expand]').click()
 assert page.locator('#tree-container').get_attribute('aria-modal')=='true'
 assert page.locator('.desk-nav').evaluate('(el)=>el.inert')
 page.locator('[data-map-action=center]').click()
 # Moving 200-item tree must keep buttons and other notes stable. Measure, don't assert
 # a machine-specific speed threshold; structural work is asserted instead.
 page.evaluate("window.first=document.querySelector('[data-node=root]');window.rebuilds=0;window.observer=new MutationObserver(ms=>window.rebuilds+=ms.filter(m=>m.type==='childList'&&m.addedNodes.length).length);window.observer.observe(document.querySelector('.mind-map-space'),{childList:true,subtree:true})")
 original=page.locator('[data-node=root]').get_attribute('style');edge=page.locator('[data-edge-child=g0]').get_attribute('d');n=page.locator('[data-node=root]').bounding_box();x=n['x']+n['width']/2;y=n['y']+n['height']/2
 t=time.perf_counter();page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+100,y+50,steps=20);page.mouse.up();duration=round((time.perf_counter()-t)*1000)
 assert page.locator('[data-node=root]').get_attribute('style')!=original
 assert page.locator('[data-edge-child=g0]').get_attribute('d')!=edge
 assert page.evaluate("window.first===document.querySelector('[data-node=root]')")
 assert page.evaluate('window.rebuilds')==0
 reveal(page,'[data-map-action=undo]').click();assert page.locator('[data-node=root]').get_attribute('style')==original
 reveal(page,'[data-map-action=add]').click();expect(page.locator('.canvas-message')).to_contain_text('200個まで');assert page.locator('.canvas-add').is_hidden()
 for width in [320,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':1000});page.locator('[data-map-action=center]').click()
  assert page.locator('.map-zoom output').inner_text()=='100%'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(out/f'{width}-canvas200.png'))
 # iPad-like touch pan, pinch and node drag through Chromium's real touch protocol.
 page.set_viewport_size({'width':1024,'height':1000});page.locator('[data-map-action=center]').click()
 cdp=context.new_cdp_session(page);cdp.send('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':2})
 rect=page.locator('.mind-map-viewport').bounding_box();cx=rect['x']+rect['width']/2;cy=rect['y']+rect['height']/2
 zoom=page.locator('.map-zoom output').inner_text()
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-30,'y':cy},{'x':cx+30,'y':cy}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-60,'y':cy},{'x':cx+60,'y':cy}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 expect(page.locator('.map-zoom output')).not_to_have_text(zoom)
 page.locator('[data-map-action=center]').click();n=page.locator('[data-node=root]').bounding_box();x=n['x']+n['width']/2;y=n['y']+n['height']/2
 before=page.locator('[data-node=root]').get_attribute('style')
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+50,'y':y+30}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert page.locator('[data-node=root]').get_attribute('style')!=before
 assert page.locator('.canvas-expanded').count()==1
 cdp.send('Emulation.setTouchEmulationEnabled',{'enabled':False})
 page.keyboard.press('Escape');assert not page.locator('.desk-nav').evaluate('(el)=>el.inert')
 # Add dialog traps focus and restores it on cancellation; Escape closes the small
 # dialog before closing the expanded canvas.
 reveal(page,'#clear-all').click();page.locator('#manual-from-memo').click();reveal(page,'[data-map-action=expand]').click();reveal(page,'[data-map-action=add]').click()
 expect(page.locator('.canvas-add')).to_be_visible();assert page.locator('.canvas-add').get_attribute('role')=='dialog'
 page.keyboard.press('Shift+Tab');assert page.locator('[data-canvas-add-cancel]').evaluate('(el)=>el===document.activeElement')
 page.keyboard.press('Tab');assert page.locator('#canvas-label').evaluate('(el)=>el===document.activeElement')
 page.keyboard.press('Escape');assert page.locator('.canvas-add').is_hidden() and page.locator('.canvas-expanded').count()==1
 assert page.locator('[data-map-action=add]').evaluate('(el)=>el===document.activeElement')
 page.keyboard.press('Escape');assert page.locator('.canvas-expanded').count()==0
 assert not page.locator('.desk-nav').evaluate('(el)=>el.inert')
 # Browser navigation is possible even while a modal is open. It must release
 # isolation and preserve the tree when returning to the consultation.
 reveal(page,'[data-map-action=expand]').click();page.evaluate("location.hash='/research'")
 reveal(page,'.research-timeline');expect(page.locator('.research-timeline')).to_be_visible()
 assert not page.locator('.skip').evaluate('(el)=>el.inert')
 page.locator('.tree-entry-link').click()
 assert page.locator('.canvas-expanded').count()==0 and page.locator('.tree-node').count()==1
 assert not errors and not calls,(errors,calls)
 (out/'canvas-performance.json').write_text(json.dumps({'nodes':200,'drag20stepsMs':duration,'sceneReplacements':0,'originalButtonRetained':True,'touchProtocol':'Chromium CDP, not an iPad hardware test'},indent=2))
 b.close()
print('PASS: 200-note stable DOM drag/connectors/undo, capacity error, five widths, iPad-sized touch pinch/drag, modal inert background, nested focus traps/Escape and no AI POST; performance recorded')
