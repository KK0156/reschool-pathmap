from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.goto('http://localhost:8002/reschool.html#/finder');page.locator('[data-consult-mode=tree]').click();page.locator('[data-preview="0"]').click()
 assert page.locator('.mind-map-lines path').count()==9
 assert page.locator('.mind-map-node').count()==10
 root=page.locator('[data-node=root]').bounding_box()
 assert any(page.locator('[data-node='+n+']').bounding_box()['x']<root['x'] for n in ['reschool','roots','ai-semidX','cod'])
 assert any(page.locator('[data-node='+n+']').bounding_box()['x']>root['x'] for n in ['reschool','roots','ai-semidX','cod'])
 page.locator('[data-map-action=fit]').click()
 # Capture the actual map rather than the long sample picker.
 page.locator('.tree-board').screenshot(path='/workspace/mind-map-desktop.png')
 before=page.locator('.map-zoom output').inner_text();page.locator('[data-map-action=in]').click();assert page.locator('.map-zoom output').inner_text()!=before
 page.locator('[data-map-action=center]').click();assert page.locator('.map-zoom output').inner_text()=='100%'
 v=page.locator('.mind-map-viewport');v.focus();before_pan=page.locator('.mind-map-stage').get_attribute('style');page.keyboard.press('ArrowRight');assert page.locator('.mind-map-stage').get_attribute('style')!=before_pan
 box=v.bounding_box();start=page.locator('.mind-map-stage').get_attribute('style');page.mouse.move(box['x']+30,box['y']+30);page.mouse.down();page.mouse.move(box['x']+130,box['y']+30,steps=6);page.mouse.up();assert page.locator('.mind-map-stage').get_attribute('style')!=start
 page.locator('[data-map-mode=list]').click();assert page.locator('.mind-map-lines').count()==0 and page.locator('.tree-node').count()==10
 page.locator('[data-node=roots]').click();expect(page.locator('#node-detail h3')).to_contain_text('ROOTS')
 page.locator('[data-map-mode=map]').click();assert page.locator('[data-node=roots]').get_attribute('aria-pressed')=='true'
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844});page.locator('[data-map-action=fit]').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  bounds=page.locator('.mind-map-viewport').bounding_box()
  for node in page.locator('.mind-map-node').all():
   rect=node.bounding_box();assert rect['x']>=bounds['x'] and rect['y']>=bounds['y'],width
   assert rect['x']+rect['width']<=bounds['x']+bounds['width'] and rect['y']+rect['height']<=bounds['y']+bounds['height'],width
  page.locator('[data-map-action=center]').click();page.locator('[data-node=roots]').focus();page.keyboard.press('Enter');expect(page.locator('#node-detail h3')).to_contain_text('ROOTS')
  page.locator('[data-map-action=fit]').click()
  if width==390:page.locator('.tree-board').screenshot(path='/workspace/mind-map-mobile.png')
 page.locator('[data-map-mode=list]').click();page.locator('[data-node=root]').click();page.locator('[data-edit-start]').click()
 page.locator('#edit-label').fill('長い問い'*40);page.locator('#node-edit-form button[type=submit]').click()
 page.locator('[data-map-mode=map]').click();page.locator('[data-map-action=center]').click()
 assert page.locator('.mind-map-core').evaluate('(n)=>n.scrollHeight<=n.clientHeight+1')
 assert not errors,errors
 print('PASS: curved parent-child edges, two-sided layout, zoom/fit/center, keyboard/background panning, map/list toggle with selection, mobile containment and readable detail')
 b.close()
