from playwright.sync_api import sync_playwright, expect
import tomllib, json, subprocess
from pathlib import Path
from browser_support import TreeApiMock, reveal, memo_entry, close_student_detail

csp=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
samples=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {studentSamples,featuredSampleIds} from './src/student-data.js';console.log(JSON.stringify(featuredSampleIds.map(id=>studentSamples.find(s=>s.id===id))))"],text=True))
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {samplePrompts} from './retree-mindmap/src/sample-tree.js';console.log(JSON.stringify(samplePrompts[24].tree))"],text=True))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1100})
 def secure(route):
  r=route.fetch();route.fulfill(response=r,headers={**r.headers,'content-security-policy':csp})
 context.route('**/*',secure)
 page=context.new_page();errors=[];requests=[];api=TreeApiMock(page)
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:requests.append(r.post_data_json) if '/.netlify/functions/generate-tree' in r.url and r.method=='POST' else None)
 def go(route):
  entry=page.locator('.tree-entry-link') if route=='tree' else page.locator(f'.desk-nav a[href="#/{route}"]')
  entry.click()
  expect(entry).to_have_attribute('aria-current','page')
 page.goto('http://localhost:8002/')
 assert 'RE:Path Finder' in page.title()
 expect(page.locator('.desk-nav')).to_be_visible()
 assert page.locator('.desk-nav a').count()==5
 assert page.locator('.desk-nav a[href="#/choices"]').count()==0
 expect(page.locator('.desk-nav a[href="#/finder"]')).to_contain_text('道を探す')
 assert page.locator('.desk-nav a[href="#/tree"]').count()==0
 for route in ['finder','tree','cases','research','archive']:
  go(route);assert page.locator('h1').count()==1
 go('archive')
 assert page.locator('.archive-item').count()==4 and page.locator('.archive-item button:disabled').count()==2
 assert page.locator('a[href="/original.html"]').count()==1 and page.locator('a[href="/reschool.html"]').count()==1
 for card in page.locator('.archive-item').all():
  assert card.locator('dl').first.is_visible(), 'Archive explanation must be readable before opening a saved page'
 go('research')
 assert page.locator('[data-research-chapter]').count()==13
 assert page.locator('.research-timeline > ol > li').count()==7
 assert page.locator('.assumption-grid article').count()==6
 assert '未検証' in page.locator('.research-honesty').inner_text()
 go('cases')
 assert page.locator('.student-case').count()>=10
 category=page.locator('#desk-case-category option').nth(1).inner_text()
 page.locator('#desk-case-category').select_option(category)
 assert 0 < page.locator('.student-case').count() < 12
 case_link=page.locator('.student-case a[href*="/tree?sample="]').first
 case_sample=case_link.get_attribute('href').split('sample=')[1]
 case_link.click();expect(page.locator('.tree-node')).not_to_have_count(0)
 assert not requests
 # Editing and leaving the page must not regenerate or erase the current map.
 page.locator('[data-node=root]').focus();page.keyboard.press('Enter')
 page.locator('[data-edit-start]').click();page.locator('#edit-label').fill('自分が残したい進路の問い')
 page.locator('#node-edit-form button[type=submit]').click()
 assert '自分が残したい進路の問い' in page.locator('#today-summary').inner_text()
 close_student_detail(page)
 go('research');go('tree')
 assert '自分が残したい進路の問い' in page.locator('[data-node=root]').inner_text()
 # A provider failure keeps the student's edits and the explicit memo.
 memo_entry(page).fill('大学で学ぶ内容を比べ、先生に聞くことを整理したい。')
 reveal(page,'#send-consent').check();reveal(page,'#generate').click()
 expect(page.locator('#tree-status')).to_contain_text('今の図と手直しは残しています')
 assert '自分が残したい進路の問い' in page.locator('[data-node=root]').inner_text()
 assert requests and set(requests[-1])=={'memo'}
 # A mocked AI response may contain extended node kinds but requires approval.
 api.post_handler=lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps(fixture,ensure_ascii=False))
 reveal(page,'#generate').click();expect(page.locator('#generation-review')).to_be_visible()
 assert '自分が残したい進路の問い' in page.locator('[data-node=root]').inner_text()
 page.locator('[data-generation-accept]').click()
 expect(page.locator('#tree-status')).to_contain_text('承認した新しい図')
 assert page.locator('.type-counterargument.tree-node').count()>=1
 assert 'AIが作った地図' in page.locator('#today-summary').inner_text()
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844})
  for route in ['','finder','tree','cases','research','archive']:
   go(route);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route)
  go('tree');reveal(page,'[data-map-action=expand]').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.keyboard.press('Escape')
 reveal(page,'#clear-all').click()
 assert page.locator('.tree-node').count()==0 and '消しました' in page.locator('#today-summary').inner_text()
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 page.reload();assert page.locator('#memo').input_value()==''
 # Old public URLs still lead somewhere explicit; saved prototypes retain their routes.
 for old,target in [('finder','finder'),('choices','research'),('paths','finder'),('dashboard','archive')]:
  page.goto('http://localhost:8002/#/'+old)
  expect(page.locator('.desk-nav a[aria-current=page]')).to_have_attribute('href','#/'+target)
 page.goto('http://localhost:8002/')
 expect(page.locator('.desk-nav')).to_be_visible()
 page.locator('.skip').focus();page.keyboard.press('Enter')
 expect(page.locator('#main')).to_be_focused()
 assert not errors,errors
 print('PASS: 5 primary pages and optional Tree, 13 report chapters/7 stages, honest 4-entry archive, public case→editable tree, retained edits, failed AI preservation and approved mocked generation, mobile/fullscreen, CSP/keyboard, no storage and old URL destinations')
 context.unroute_all(behavior='wait')
 b.close()
