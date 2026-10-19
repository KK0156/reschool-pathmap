from pathlib import Path
import json
from playwright.sync_api import sync_playwright,expect
out=Path('/workspace/reschool-pathmap-review');out.mkdir(exist_ok=True)
widths=[320,390,768,1024,1440];routes=['','tree','cases','choices','research','archive'];report=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith('http://localhost:') else None)
 for width in widths:
  page.set_viewport_size({'width':width,'height':1000})
  for route in routes:
   page.goto('http://localhost:8002/#/'+route)
   expect(page.locator('.desk-nav a[aria-current=page]')).to_have_attribute('href','#/'+route)
   assert page.locator('h1').count()==1
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route,'page overflow')
   nav=page.locator('.desk-nav a').all()
   for n in nav:assert n.bounding_box()['height']>=44
   # Navigation items may wrap to rows, but must not cover each other.
   boxes=[n.bounding_box() for n in nav]
   for i,a in enumerate(boxes):
    for z in boxes[i+1:]:assert a['x']+a['width']<=z['x']+1 or z['x']+z['width']<=a['x']+1 or a['y']+a['height']<=z['y']+1 or z['y']+z['height']<=a['y']+1,(width,route,'overlapping nav')
   if route=='':
    action=page.locator('.cover-paper a.desk-button');r=action.bounding_box();assert r['y']+r['height']<=1000,(width,'primary action below first screen',r)
   if route=='research':
    assert '日本とアメリカ' in page.locator('.research-summary').inner_text()
    assert page.locator('.research-timeline li').count()==7
    assert '原記録' in page.locator('#stage-interview-followup').inner_text()
   page.screenshot(path=str(out/f'{width}-{route or "home"}.png'))
   report.append({'width':width,'page':route or 'home','horizontalOverflow':False,'navigationUsable':True})
  page.goto('http://localhost:8002/#/tree')
  expect(page.locator('#memo')).to_be_visible();page.locator('#memo').fill('文系と理系、まだどちらも考えていたい。')
  page.locator('#manual-from-memo').click();expect(page.locator('.tree-node')).to_have_count(1)
  page.locator('[data-map-mode=map]').click()
  page.locator('[data-map-action=add]').click();page.locator('#canvas-label').fill('調べること');page.locator('.canvas-add button[type=submit]').click()
  page.locator('[data-node=note-1]').focus();page.keyboard.press('Enter');page.locator('[data-edit-start]').click();page.locator('#edit-type').select_option('hypothesis');page.locator('#edit-detail').fill('一度体験すると、考えやすくなるかもしれない。');page.locator('#node-edit-form button[type=submit]').click()
  page.locator('[data-node=note-1]').focus();page.keyboard.press('Alt+ArrowRight')
  assert page.locator('[data-node=note-1]').get_attribute('aria-pressed')=='true'
  page.locator('[data-map-action=expand]').click();assert page.locator('.mind-map-viewport').bounding_box()['height']>=100
  page.locator('[data-map-action=selected]').click();assert page.locator('.map-zoom output').inner_text()=='100%'
  page.screenshot(path=str(out/f'{width}-canvas.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.keyboard.press('Escape');page.locator('[data-map-mode=list]').click();assert page.locator('.tree-node').count()==2
  page.locator('[data-node=note-1]').click();page.locator('[data-edit-delete]').click();expect(page.locator('.tree-node')).to_have_count(1)
  # Clear is explicit and covers file-related status as well.
  page.locator('#clear-all').click();expect(page.locator('.tree-node')).to_have_count(0)
 assert not errors and not external,(errors,external)
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 (out/'layout-results.json').write_text(json.dumps({'screens':report,'widths':widths,'jsErrors':errors,'externalRequests':external},ensure_ascii=False,indent=2))
 print('PASS: all 6 pages at 320/390/768/1024/1440px, first-screen primary action, nonoverlapping usable nav, honest chronology, add/edit/hypothesis/move/delete/zoom/fullscreen at each width, no overflow/JS errors/external requests/storage; 35 screenshots')
 b.close()
