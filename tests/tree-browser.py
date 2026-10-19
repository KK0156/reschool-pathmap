from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import json, subprocess, tomllib
sample=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {sampleTree} from './retree-mindmap/src/sample-tree.js';console.log(JSON.stringify(sampleTree))"],text=True))
csp=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1000})
 def secure(route):
  response=route.fetch();route.fulfill(response=response,headers={**response.headers,'content-security-policy':csp})
 context.route('**/*',secure)
 page=context.new_page();errors=[];sent=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:sent.append(r) if '/generate-tree' in r.url else None)
 page.goto('http://localhost:8002/retree-mindmap/')
 page.locator('#generate').click();assert '書いてください' in page.locator('#memo-error').inner_text();assert not sent
 page.locator('[data-prompt="0"]').click();assert '教育に興味' in page.locator('#memo').input_value()
 page.locator('#generate').click();assert 'チェック' in page.locator('#memo-error').inner_text();assert not sent
 page.locator('#send-consent').check();page.locator('#generate').click()
 page.locator('#map-workspace').wait_for(state='visible')
 assert '代わりにサンプル' in page.locator('#tree-status').inner_text()
 assert '入力メモの分析結果ではありません' in page.locator('#tree-overview').inner_text()
 assert page.locator('.tree-node').count()==10
 assert set(json.loads(sent[0].post_data))=={'memo'}
 page.locator('[data-node="teacher-workload"]').click()
 assert '先生の負担' in page.locator('#node-detail').inner_text()
 for term in ['内容','証拠・資料','リスク・未確認','次にできること']:assert term in page.locator('#node-detail').inner_text()
 assert page.locator('#summary-content article').count()==6
 page.screenshot(path='/workspace/retree-desktop.png',full_page=True)
 # API rendering success is tested with a fixture, not a real paid model call.
 def generated(route):route.fulfill(status=200,content_type='application/json',body=json.dumps(sample,ensure_ascii=False))
 page.route('**/.netlify/functions/generate-tree',generated)
 page.locator('#generate').click()
 expect(page.locator('#tree-status')).to_contain_text('メモから')
 assert '生成したツリー' in page.locator('#tree-overview').inner_text()
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 page.locator('#clear-all').click();assert page.locator('#memo').input_value()=='';assert page.locator('#map-workspace').is_hidden()
 page.reload();assert page.locator('#memo').input_value()=='';assert page.locator('#map-workspace').is_hidden()
 page.locator('#show-sample').click();assert page.locator('.tree-node').count()==10
 page.locator('[data-node="roots"]').focus();page.keyboard.press('Enter');assert 'ROOTS' in page.locator('#node-detail h3').inner_text()
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844});page.locator('#show-sample').click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.locator('[data-node="roots"]').focus();page.locator('[data-node="roots"]').click();assert page.locator('#node-detail').evaluate('(el)=>el===document.activeElement')
  if width==390:page.screenshot(path='/workspace/retree-mobile.png',full_page=True)
 page.wait_for_load_state('networkidle');page.unroute_all(behavior='wait');context.unroute_all(behavior='wait')
 assert not errors,errors
 print('PASS: textarea, consent, real missing-key fallback, sample labels, nodes/details, summaries, mocked generation, keyboard, 320/390/768px, no storage, clear/reload, CSP')
 b.close()
