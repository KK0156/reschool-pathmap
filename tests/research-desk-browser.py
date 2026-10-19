from playwright.sync_api import sync_playwright,expect
import tomllib,json,subprocess
from pathlib import Path
csp=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
sample=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {samplePrompts} from './retree-mindmap/src/sample-tree.js';console.log(JSON.stringify(samplePrompts[24].tree))"],text=True))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1100})
 def with_csp(route):
  r=route.fetch();route.fulfill(response=r,headers={**r.headers,'content-security-policy':csp})
 context.route('**/*',with_csp);page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:requests.append(r.post_data_json) if '/.netlify/functions/generate-tree' in r.url else None)
 def go(route):
  page.locator(f'.desk-nav a[href="#/{route}"]').click();expect(page.locator(f'.desk-nav a[href="#/{route}"]')).to_have_attribute('aria-current','page')
 page.goto('http://localhost:8002/')
 assert 'RE:Tree' in page.title();assert '迷いを、地図にする。' in page.locator('h1').inner_text().replace('\n','')
 assert page.locator('.desk-nav a').count()==6
 page.screenshot(path='/workspace/research-desk-home.png',full_page=True)
 for route in ['tree','cases','choices','research','archive']:
  page.locator(f'.desk-nav a[href="#/{route}"]').click();expect(page.locator(f'.desk-nav a[href="#/{route}"]')).to_have_attribute('aria-current','page')
  assert page.locator('h1').count()==1
 go('archive')
 assert page.locator('.archive-item').count()==3 and page.locator('.archive-item button:disabled').count()==2
 assert page.locator('a[href="/original.html"]').count()==1 and page.locator('a[href="/reschool.html"]').count()==1
 go('research');assert page.locator('.research-timeline li').count()==7 and page.locator('.assumption-grid article').count()==6
 assert '未検証' in page.locator('.research-honesty').inner_text()
 page.screenshot(path='/workspace/research-desk-note.png',full_page=True)
 go('cases');assert page.locator('.case-sheet').count()==12
 page.locator('#desk-case-category').select_option('Teacher Workload');assert page.locator('.case-sheet').count()==1
 go('choices');assert page.locator('.choice-sheet').count()==7
 page.locator('[data-choice-seed="japan-design"]').click();expect(page.locator('#memo')).to_have_value(__import__('re').compile('日本比較'))
 go('tree');page.locator('[data-seed="1"]').click();assert '文系' in page.locator('#memo').input_value();page.locator('.desk-sample-drawer summary').click();page.locator('[data-prompt="24"]').click();page.locator('#memo').fill('日本比較の問いを、高校で試す小さな研究に戻したい。')
 page.locator('#sample-without-api').click();assert page.locator('.tree-node').count()==18
 assert page.locator('.type-counterargument.tree-node').count()==1
 for title in ['今日の中心問い','残すべき選択肢','足りない証拠','相談すべき人','次の一歩']:assert title in page.locator('#today-summary').inner_text()
 assert not requests
 # Edit and confirm clipboard updates while the original sample remains separate.
 page.locator('[data-node=root]').focus();page.keyboard.press('Enter');page.locator('[data-edit-start]').click();page.locator('#edit-label').fill('自分が残したい研究の問い');page.locator('#node-edit-form button[type=submit]').click()
 assert '自分が残したい研究の問い' in page.locator('#today-summary').inner_text()
 go('research');go('tree');assert '日本比較' in page.locator('#memo').input_value() and '自分が残したい研究の問い' in page.locator('[data-node=root]').inner_text()
 page.locator('#send-consent').check();page.locator('#generate').click();expect(page.locator('#tree-status')).to_contain_text('代わりにサンプル')
 assert requests and set(requests[-1])=={'memo'}
 # Mocked real-generation path includes the extended node enum and clipboard.
 def generated(route):route.fulfill(status=200,content_type='application/json',body=json.dumps(sample,ensure_ascii=False))
 page.route('**/.netlify/functions/generate-tree',generated);page.locator('#generate').click();expect(page.locator('#tree-status')).to_contain_text('生成しました');assert 'AIが作った地図' in page.locator('#today-summary').inner_text()
 page.locator('#map-workspace').screenshot(path='/workspace/research-desk-map.png')
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844})
  for route in ['','tree','cases','choices','research','archive']:
   go(route);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route)
  go('tree');page.locator('[data-map-action=expand]').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.keyboard.press('Escape')
  if width==390:page.screenshot(path='/workspace/research-desk-mobile.png')
 page.locator('#clear-all').click();assert page.locator('.tree-node').count()==0 and '消しました' in page.locator('#today-summary').inner_text()
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 page.reload();assert page.locator('#memo').input_value()==''
 page.goto('http://localhost:8002/#/finder');assert page.locator('#memo').count()==1
 page.goto('http://localhost:8002/');page.locator('.skip').focus();page.keyboard.press('Enter');assert page.locator('#main').evaluate('(el)=>el===document.activeElement')
 assert not errors,errors
 print('PASS: 6 desk pages, honest archive, 7 research stages/6 assumptions, cases/choice links, sticky map/clipboard, retained edits, API fallback/mocked generation, mobile/fullscreen, CSP/keyboard, reset/no storage and route compatibility')
 b.close()
