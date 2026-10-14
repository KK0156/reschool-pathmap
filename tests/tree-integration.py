from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:8002/')
 assert 'RE:School' in page.title()
 page.goto('http://localhost:8002/#/finder')
 page.locator('[data-consult-mode=tree]').click()
 assert '/retree-mindmap' not in page.url
 page.locator('#memo').fill('研究テーマが複数あり、どこから調べるか迷っている。')
 page.locator('#sample-without-api').click()
 assert page.locator('.tree-node').count()==10
 page.locator('[data-node=roots]').click()
 assert 'ROOTS' in page.locator('#node-detail h3').inner_text()
 page.locator('[data-consult-mode=choices]').click()
 assert page.locator('#finder').count()==1
 page.locator('[data-consult-mode=tree]').click()
 assert '研究テーマ' in page.locator('#memo').input_value()
 assert page.locator('.tree-node').count()==10
 page.locator('#send-consent').check();page.locator('#generate').click()
 page.wait_for_function("() => document.querySelector('#tree-status').textContent.includes('代わりにサンプル')")
 page.screenshot(path='/workspace/reschool-tree-integrated.png',full_page=True)
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.locator('#clear-all').click();assert page.locator('#memo').input_value()==''
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert not errors,errors
 print('PASS: School root, embedded consultation tree, no navigation/iframe, retained memo/map across modes, fallback, 320/390/768px, clear and no storage')
 b.close()
