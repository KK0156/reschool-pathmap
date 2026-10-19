from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':900});errors=[];decision={'accept':True};requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept() if decision['accept'] else d.dismiss())
 page.goto('http://localhost:8002/')
 page.locator('.cover-paper a[href="#/tree?start=sample"]').click()
 expect(page.locator('.tree-node')).to_have_count(18)
 # Sample entry must reveal the map rather than scroll back to the top.
 page.wait_for_function("document.querySelector('#mind-tree').getBoundingClientRect().top<100")
 page.locator('#memo').fill('文系と理系について自分で考える')
 page.locator('#manual-from-memo').click()
 page.locator('[data-node=root]').focus();page.keyboard.press('Enter')
 page.locator('[data-edit-start]').click();page.locator('#edit-label').fill('消したくない自分の問い');page.locator('#node-edit-form button[type=submit]').click()
 page.locator('#node-detail [data-tree-go=tree-container]').click()
 assert page.locator('[data-node=root]').get_attribute('aria-pressed')=='true'
 # Provider failure must not replace manually edited work.
 page.route('**/.netlify/functions/generate-tree',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"接続のテスト"}'))
 page.locator('#send-consent').check();page.locator('#generate').click()
 expect(page.locator('#tree-status')).to_contain_text('今の図と手直しは残しています')
 assert '消したくない自分の問い' in page.locator('[data-node=root]').inner_text()
 assert page.locator('#memo').input_value()=='文系と理系について自分で考える'
 assert page.locator('#generate').inner_text()=='AIで相談を図にする'
 # Dismissing the clear confirmation must retain work and input.
 decision['accept']=False;page.locator('#clear-all').click()
 assert page.locator('.tree-node').count()==1 and page.locator('#memo').input_value()
 decision['accept']=True
 # Clipboard can be unavailable on some iPad/browser contexts: a selectable fallback remains.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('unavailable')}},configurable:true})")
 page.locator('#copy-summary').click();expect(page.locator('#copy-fallback')).to_be_visible()
 assert '消したくない自分の問い' in page.locator('#copy-fallback').input_value()
 assert page.locator('#copy-fallback').get_attribute('readonly') is not None
 # A supported clipboard writes only when explicitly requested.
 page.evaluate("navigator.clipboard.writeText=async(text)=>{window.copiedSummary=text}")
 page.locator('#copy-summary').click();expect(page.locator('#copy-status')).to_contain_text('コピーしました')
 assert '消したくない自分の問い' in page.evaluate('window.copiedSummary')
 page.locator('#clear-all').click();expect(page.locator('.tree-node')).to_have_count(0)
 assert page.locator('#copy-summary').is_disabled() and page.locator('#copy-fallback').input_value()==''
 assert not errors,errors
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 b.close()
print('PASS: visible sample entry, AI failure retains edited map/memo, honest button label, cancelled clear retains work, clipboard success/fallback and clear privacy')
