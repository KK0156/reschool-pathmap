import json,subprocess
from playwright.sync_api import sync_playwright,expect
sample=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {sampleTree} from './retree-mindmap/src/sample-tree.js';console.log(JSON.stringify(sampleTree))"],text=True))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.goto('http://localhost:8002/reschool.html#/finder');page.locator('[data-consult-mode=tree]').click()
 page.locator('[data-preview="0"]').click()
 page.locator('[data-node=reschool]').click();page.locator('[data-edit-start]').click()
 page.locator('#edit-label').fill('自分の研究 <img src=x>')
 page.locator('#edit-detail').fill('自分で書いた説明')
 page.locator('#edit-next_action').fill('先生と資料を見直す')
 page.locator('#node-edit-form button[type=submit]').click()
 assert '自分の研究 <img src=x>' in page.locator('[data-node=reschool]').inner_text()
 assert page.locator('#node-detail img').count()==0
 assert '先生と資料を見直す' in page.locator('#summary-content').inner_text()
 page.locator('[data-edit-add]').click();page.locator('#edit-label').fill('追加した枝');page.locator('#edit-type').select_option('evidence')
 page.locator('#node-edit-form button[type=submit]').click();assert page.locator('.tree-node').count()==11
 page.locator('[data-edit-delete]').click();assert page.locator('.tree-node').count()==10
 page.locator('[data-edit-undo]').click();assert page.locator('.tree-node').count()==11
 page.locator('[data-node=root]').click();page.locator('[data-edit-start]').click();page.locator('#edit-label').fill('自分が考えたい問い');page.locator('#node-edit-form button[type=submit]').click()
 assert '自分が考えたい問い' in page.locator('#tree-overview').inner_text()
 page.locator('[data-consult-mode=choices]').click();page.locator('[data-consult-mode=tree]').click();assert '自分が考えたい問い' in page.locator('#tree-overview').inner_text()
 page.locator('#memo').fill('どんな授業を見てみればよいか整理したい。')
 page.locator('.optional-context summary').click();page.locator('#context-grades').fill('評定3.5');page.locator('#context-subjects').fill('英語が好き');page.locator('#context-conditions').fill('自宅から通いたい')
 page.locator('.send-preview summary').click()
 assert '成績の目安：評定3.5' in page.locator('#send-preview-text').inner_text()
 def respond(route):
  requests.append(route.request.post_data_json)
  route.fulfill(status=200,content_type='application/json',body=json.dumps(sample,ensure_ascii=False))
 page.route('**/.netlify/functions/generate-tree',respond)
 page.locator('#send-consent').check();page.locator('#context-grades').fill('評定3.6');assert not page.locator('#send-consent').is_checked()
 original=page.locator('#memo').input_value()
 page.locator('#memo').fill('あ'*2990);page.locator('#send-consent').check();page.locator('#generate').click()
 expect(page.locator('#memo-error')).to_contain_text('3000文字')
 assert not requests
 page.locator('#memo').fill(original);page.locator('#send-consent').check();page.locator('#generate').click()
 expect(page.locator('#tree-status')).to_contain_text('生成しました')
 assert len(requests)==1 and list(requests[0])==['memo']
 assert '成績の目安：評定3.6' in requests[0]['memo']
 assert requests[0]['memo']==page.locator('#send-preview-text').inner_text()
 assert '自宅から通いたい' in requests[0]['memo']
 assert '気になっていること' not in requests[0]['memo']
 assert '自分の研究' not in requests[0]['memo']
 # Sample source is immutable after hand edits.
 page.locator('[data-preview="0"]').click();assert 'RE:School' in page.locator('[data-node=reschool]').inner_text()
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844})
  page.locator('[data-node=reschool]').click();page.locator('[data-edit-start]').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width==390:page.screenshot(path='/workspace/tree-edit-mobile.png')
  page.locator('[data-edit-cancel]').click()
 page.locator('#clear-all').click()
 assert all(page.locator('#context-'+k).input_value()=='' for k in ['grades','subjects','interests','conditions','concerns'])
 assert page.locator('#memo').input_value()=='' and page.locator('.tree-node').count()==0
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 page.reload();page.locator('[data-consult-mode=tree]').click();assert page.locator('#context-grades').input_value()==''
 assert not errors,errors
 print('PASS: node/root editing, safe text, add/delete/undo, mode retention, sample immutability, optional context preview/consent/payload, mobile editing, clear/reload and no storage')
 b.close()
