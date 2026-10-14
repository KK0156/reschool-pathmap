from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url) if '/.netlify/functions/generate-tree' in r.url else None)
 page.on('dialog',lambda d:d.accept())
 page.goto('http://localhost:8002/reschool.html#/finder');page.locator('[data-consult-mode=tree]').click();page.locator('[data-preview="0"]').click()
 page.locator('[data-map-action=expand]').click()
 expect(page.locator('#tree-container')).to_have_class('canvas-expanded')
 v=page.locator('.mind-map-viewport');bounds=v.bounding_box();assert bounds['width']>1300
 node=page.locator('[data-node=reschool]');before=node.get_attribute('style');old_edge=page.locator('[data-edge-child=reschool]').get_attribute('d')
 box=node.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']/2+120,box['y']+box['height']/2-70,steps=12);page.mouse.up()
 assert node.get_attribute('style')!=before
 assert page.locator('[data-edge-child=reschool]').get_attribute('d')!=old_edge
 assert page.locator('.canvas-expanded').count()==1 # Drag doesn't open details.
 moved=node.get_attribute('style');page.locator('[data-map-mode=list]').click();page.locator('[data-map-mode=map]').click();assert node.get_attribute('style')==moved
 page.locator('[data-map-action=undo]').click();assert node.get_attribute('style')==before
 page.locator('[data-map-action=expand]').click()
 # Pan many screen widths; no sheet edge stops the camera.
 v.focus();before_pan=page.locator('.mind-map-stage').get_attribute('style')
 for _ in range(120):page.keyboard.press('ArrowRight')
 assert page.locator('.mind-map-stage').get_attribute('style')!=before_pan
 page.locator('[data-map-action=center]').click()
 page.locator('[data-node=root]').focus();before_root=page.locator('[data-node=root]').get_attribute('style');page.keyboard.press('Alt+ArrowDown')
 assert page.locator('[data-node=root]').get_attribute('style')!=before_root
 page.locator('[data-map-action=fit]').click();bounds=v.bounding_box()
 page.mouse.move(bounds['x']+30,bounds['y']+30);zoom=page.locator('.map-zoom output').inner_text();page.mouse.wheel(0,-150);expect(page.locator('.map-zoom output')).not_to_have_text(zoom)
 # Add at a blank spot with explicit label, without API requests.
 v.dblclick(position={'x':30,'y':30})
 expect(page.locator('.canvas-add')).to_be_visible();page.locator('#canvas-label').fill('別の研究も試す');page.locator('.canvas-add button[type=submit]').click()
 assert page.locator('.tree-node').count()==11
 assert '別の研究も試す' in page.locator('[data-node=note-1]').inner_text()
 custom=page.locator('[data-node=note-1]').get_attribute('style')
 page.locator('[data-map-mode=list]').click();page.locator('[data-map-mode=map]').click();assert page.locator('[data-node=note-1]').get_attribute('style')==custom
 # Expanded view closes by Escape, and returns focus to its control.
 page.locator('[data-map-action=expand]').click();page.keyboard.press('Escape');assert page.locator('.canvas-expanded').count()==0
 assert page.locator('[data-map-action=expand]').evaluate('(el)=>el===document.activeElement')
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844});page.locator('[data-map-action=expand]').click();page.locator('[data-map-action=fit]').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.locator('.mind-map-viewport').bounding_box()['height']>140
  if width==390:
   cdp=page.context.new_cdp_session(page);cdp.send('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':2})
   rect=page.locator('.mind-map-viewport').bounding_box();cx=rect['x']+rect['width']/2;cy=rect['y']+rect['height']/2
   before_zoom=page.locator('.map-zoom output').inner_text()
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-30,'y':cy},{'x':cx+30,'y':cy}]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-65,'y':cy},{'x':cx+65,'y':cy}]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   expect(page.locator('.map-zoom output')).not_to_have_text(before_zoom)
   cdp.send('Emulation.setTouchEmulationEnabled',{'enabled':False})
   page.locator('[data-map-action=fit]').click();page.screenshot(path='/workspace/free-canvas-mobile.png')
  page.keyboard.press('Escape')
 page.set_viewport_size({'width':1440,'height':1100});page.locator('[data-map-action=expand]').click();page.locator('[data-map-action=fit]').click();page.screenshot(path='/workspace/free-canvas-desktop.png')
 page.keyboard.press('Escape');page.locator('#clear-all').click();assert page.locator('.tree-node').count()==0
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert not requests and not errors,(requests,errors)
 print('PASS: free node dragging with live edges, position undo/retention, unbounded camera, keyboard node placement, cursor zoom, blank-space addition, expanded view/Escape/mobile, no API or storage')
 b.close()
