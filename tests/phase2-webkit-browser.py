from browser_support import reveal, memo_entry, close_student_detail
"""Optional WebKit engine check. Records a truthful skip if the runtime is absent."""
from pathlib import Path
import os,json
from playwright.sync_api import sync_playwright,expect
out=Path('/workspace/reschool-phase4-review/regressions');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 custom=os.environ.get('WEBKIT_EXECUTABLE')
 if not custom and Path('/workspace/webkit-runtime/run-webkit.sh').exists():custom='/workspace/webkit-runtime/run-webkit.sh'
 try:b=p.webkit.launch(**({'executable_path':custom} if custom else {}))
 except Exception as e:
  print('SKIP: WebKit engine unavailable; install Playwright WebKit/runtime dependencies to run this test. '+str(e).splitlines()[0]);raise SystemExit(0)
 context=b.new_context(viewport={'width':834,'height':1194},is_mobile=True,has_touch=True,accept_downloads=True)
 page=context.new_page();errors=[];posts=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:posts.append(r.url) if '/.netlify/functions/' in r.url and r.method=='POST' else None)
 for width in [320,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  for route in ['','finder','tree','cases','research','archive']:
   page.goto('http://localhost:8002/#/'+route)
   if route=='tree':expect(page.locator('.tree-entry-link[aria-current=page]')).to_have_attribute('href','#/tree')
   else:expect(page.locator('.desk-nav a[aria-current=page]')).to_have_attribute('href','#/'+route)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,route)
   page.screenshot(path=str(out/f'webkit-{width}-{route or "home"}.png'))
 page.set_viewport_size({'width':834,'height':1194});page.goto('http://localhost:8002/#/tree');memo_entry(page).fill('文系と理系を比べ、先生に聞くことを考えたい。');page.locator('#manual-from-memo').tap()
 expect(page.locator('.tree-node')).to_have_count(1)
 reveal(page,'[data-map-action=expand]').tap();page.locator('[data-map-action=center]').tap();assert page.locator('.desk-nav').evaluate('(el)=>el.inert')
 page.locator('[data-node=root]').tap();expect(page.locator('#node-detail')).to_be_visible();assert page.locator('.canvas-expanded').count()==0
 page.locator('[data-edit-start]').tap();page.locator('#edit-label').fill('WebKitで残した問い');page.locator('#node-edit-form button[type=submit]').tap()
 reveal(page,'[data-map-action=add]').tap();expect(page.locator('.canvas-add')).to_be_visible()
 page.locator('#canvas-label').fill('資料を比較する');page.locator('.canvas-add button[type=submit]').tap();expect(page.locator('.tree-node')).to_have_count(2)
 page.locator('[data-node=note-1]').focus();before=page.locator('[data-node=note-1]').get_attribute('style');page.keyboard.press('Alt+ArrowRight');assert page.locator('[data-node=note-1]').get_attribute('style')!=before
 with page.expect_download() as dl:page.locator('#export-tree').tap()
 text=Path(dl.value.path()).read_text();doc=json.loads(text);assert 'WebKitで残した問い'==doc['tree']['core_question']
 page.reload();page.locator('#import-tree').set_input_files({'name':'webkit.json','mimeType':'application/json','buffer':text.encode()});expect(page.locator('.tree-node')).to_have_count(2)
 assert 'WebKitで残した問い' in page.locator('[data-node=root]').inner_text()
 for n in doc['positions']:
  style=page.locator('[data-node="'+n['id']+'"]').get_attribute('style');assert f'left:{n["x"]}px' in style and f'top:{n["y"]}px' in style
 close_student_detail(page);reveal(page,'[data-map-action=expand]').tap();reveal(page,'[data-map-action=selected]').tap();page.screenshot(path=str(out/'webkit-ipad-canvas.png'));page.keyboard.press('Escape')
 assert not errors and not posts,(errors,posts)
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 b.close()
print('PASS: WebKit engine, 5 widths × 6 pages, iPad-sized touch taps, modal/selection/edit/add/keyboard placement, download/reload/restore exact positions, no overflow/AI POST/storage. Not a Safari/iPad hardware test.')
