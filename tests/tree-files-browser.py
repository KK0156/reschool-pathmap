import json,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100},accept_downloads=True);errors=[];sent=[]
 decision={'accept':True}
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept() if decision['accept'] else d.dismiss())
 page.on('request',lambda r:sent.append(r.url) if '/.netlify/functions/' in r.url and r.method=='POST' else None)
 page.goto('http://localhost:8002/#/tree')
 assert page.locator('#export-tree').is_disabled()
 page.locator('#memo').fill('二つの選択肢を、自分の言葉で比べたい')
 page.locator('.optional-context summary').click();page.locator('#context-grades').fill('これは保存しない成績のメモ')
 page.locator('#manual-from-memo').click();expect(page.locator('.tree-node')).to_have_count(1)
 page.locator('[data-node=root]').focus();page.keyboard.press('Alt+ArrowRight')
 page.locator('[data-map-action=add]').click();page.locator('#canvas-label').fill('一つ目の選択肢');page.locator('.canvas-add button[type=submit]').click()
 expect(page.locator('.tree-node')).to_have_count(2)
 page.locator('[data-node=note-1]').focus();page.keyboard.press('Enter');page.locator('[data-edit-start]').click();page.locator('#edit-type').select_option('hypothesis');page.locator('#edit-label').fill('まだ仮説のこと');page.locator('#node-edit-form button[type=submit]').click()
 page.locator('[data-node=note-1]').focus();page.keyboard.press('Alt+ArrowDown')
 with page.expect_download() as dl:page.locator('#export-tree').click()
 download=dl.value;assert download.suggested_filename.endswith('.json');text=Path(download.path()).read_text();doc=json.loads(text)
 assert doc['format']=='re-tree' and doc['version']==1
 assert doc['tree']['nodes'][1]['type']=='hypothesis'
 assert 'これは保存しない' not in text and 'memo' not in doc and 'context' not in doc
 original_positions={n['id']:(n['x'],n['y']) for n in doc['positions']}
 page.reload();assert page.locator('#memo').input_value()==''
 page.locator('#import-tree').set_input_files({'name':'re-tree-map.json','mimeType':'application/json','buffer':text.encode()})
 expect(page.locator('#file-status')).to_contain_text('復元しました');expect(page.locator('.tree-node')).to_have_count(2)
 assert 'JSONから復元' in page.locator('#tree-overview').inner_text()
 for n in doc['positions']:
  style=page.locator('[data-node="'+n['id']+'"]').get_attribute('style');assert f'left:{n["x"]}px' in style and f'top:{n["y"]}px' in style
 assert page.locator('#memo').input_value()=='' and page.locator('#context-grades').input_value()==''
 # Rejected inputs must leave the current map and its selection intact.
 bads=[b'not json',json.dumps({**doc,'version':999}).encode(),json.dumps({**doc,'positions':[{'id':'root','x':1e100,'y':0}]}).encode(),json.dumps({**doc,'tree':{**doc['tree'],'nodes':[{**n,'parent':'missing'} for n in doc['tree']['nodes']]}}).encode(),b'{"__proto__":{"polluted":true}}',b' '*(8*1024*1024+1)]
 for raw in bads:
  page.locator('#import-tree').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':raw})
  expect(page.locator('#file-status')).to_contain_text('変更していません');assert page.locator('.tree-node').count()==2
 assert not page.evaluate('Object.prototype.polluted')
 # Cancel replacing an existing tree.
 decision['accept']=False
 page.locator('#import-tree').set_input_files({'name':'cancelled.json','mimeType':'application/json','buffer':text.encode()})
 expect(page.locator('#file-status')).to_contain_text('復元をやめました');assert page.locator('.tree-node').count()==2
 decision['accept']=True
 # A valid file containing HTML text displays literal text only.
 xss=json.loads(text);xss['tree']['nodes'][1]['label']='<img src=x onerror=alert(1)>'
 page.locator('#import-tree').set_input_files({'name':'literal.json','mimeType':'application/json','buffer':json.dumps(xss).encode()})
 expect(page.locator('#file-status')).to_contain_text('復元しました');assert page.locator('#tree-container img').count()==0
 assert '<img' in page.locator('[data-node=note-1]').inner_text()
 assert not sent and not errors,(sent,errors)
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 print('PASS: manual start, hypothesis edits, JSON download/import with exact placement, excluded memo/grades, invalid/oversized/prototype input rejection without tree loss, literal HTML and zero API/storage')
 b.close()
