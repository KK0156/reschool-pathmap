from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.goto('http://localhost:8002/reschool.html')
 assert 'RE:School' in page.title()
 page.goto('http://localhost:8002/reschool.html#/finder')
 page.locator('[data-consult-mode=tree]').click()
 assert '/retree-mindmap' not in page.url
 assert page.locator('[data-prompt]').count()==32
 requests=[]
 page.on('request',lambda r:requests.append(r.url) if '/.netlify/functions/generate-tree' in r.url else None)
 page.locator('[data-preview="4"]').click()
 assert '文系' in page.locator('#tree-overview').inner_text()
 assert page.locator('.tree-node').count()==15
 assert not requests
 for i in range(32):
  page.locator('#tree-example').select_option(str(i))
  page.locator('#preview-tree-example').click()
  assert page.locator('.tree-node').count()>=10
  assert page.locator('#tree-example').input_value()==str(i)
 assert not requests
 page.locator('[data-tree-go="memo"]').last.click()
 page.locator('[data-prompt="5"]').click()
 assert '専門学校' in page.locator('#memo').input_value()
 assert not page.locator('#send-consent').is_checked()
 page.locator('[data-preview="0"]').click()
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
  page.locator('#tree-example').select_option('12')
  page.locator('#preview-tree-example').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.locator('#clear-all').click();assert page.locator('#memo').input_value()==''
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert not errors,errors
 print('PASS: School archive, embedded consultation tree, no navigation/iframe, retained memo/map across modes, 32 offline tree examples, fallback, 320/390/768px, clear and no storage')
 b.close()
