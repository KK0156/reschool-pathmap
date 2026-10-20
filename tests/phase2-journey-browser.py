from browser_support import reveal, memo_entry, close_student_detail
from pathlib import Path
import json,subprocess,re
from playwright.sync_api import sync_playwright,expect
out=Path('/workspace/reschool-atlas-review/regressions');out.mkdir(parents=True,exist_ok=True)
featured=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {studentSamples,featuredSampleIds} from './src/student-data.js';console.log(JSON.stringify(studentSamples.find(s=>s.id===featuredSampleIds[0])))"],text=True))
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  if engine=='webkit' and not Path('/workspace/webkit-runtime/run-webkit.sh').exists():
   print('SKIP: WebKit journey runtime not installed');continue
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']) if engine=='chromium' else p.webkit.launch(executable_path='/workspace/webkit-runtime/run-webkit.sh')
  ctx=b.new_context(viewport={'width':1024,'height':1000},accept_downloads=True,reduced_motion='reduce');page=ctx.new_page();errors=[];sent=[];decision={'accept':True};page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept() if decision['accept'] else d.dismiss())
  page.on('request',lambda r:sent.append(r.url) if r.method=='POST' else None)
  page.goto('http://localhost:8002/');page.locator('.tree-entry-link').click();expect(page.locator('.tree-entry-link')).to_have_attribute('aria-current','page');page.locator(f'[data-student-sample="{featured["id"]}"]').click()
  expect(page.locator('.tree-node')).to_have_count(len(featured['tree']['nodes']))
  expect(page.locator('#generate')).to_be_disabled();expect(page.locator('#ai-availability')).to_contain_text(re.compile('未設定|未接続'))
  page.locator('[data-node=root]').focus();page.keyboard.press('Enter');page.locator('[data-edit-start]').click();page.locator('#edit-label').fill('文理を決める前に、授業を比べたい');page.locator('#node-edit-form button[type=submit]').click()
  page.locator('[data-edit-add]').click();page.locator('#edit-label').fill('文理以外の組み合わせも調べる');reveal(page,'#edit-type').select_option('project');page.locator('#edit-detail').fill('大学の科目や、学校外で学ぶ方法も比べたい');page.locator('#node-edit-form button[type=submit]').click()
  reveal(page,'[data-reflection=try]').click();assert '一般的な問いかけ' in page.locator('.node-origin').inner_text()
  close_student_detail(page);reveal(page,'#step-research').fill('大学と専門学校の公開授業');page.locator('#step-person').fill('進路担当の先生');page.locator('#step-try').fill('授業紹介を一つ見て、違いをメモする');page.locator('#step-when').fill('次の面談まで');page.locator('#next-step-form button[type=submit]').click()
  expect(page.locator('#step-error')).to_contain_text('追加しました');assert '進路担当の先生' in page.locator('#summary-content').inner_text()
  # Keep a deliberate manual placement in the saved document.
  selected=page.locator('.tree-node[aria-pressed=true]').get_attribute('data-node');reveal(page,'[data-map-mode=map]').click();page.locator(f'[data-node="{selected}"]').focus();page.keyboard.press('Alt+ArrowRight')
  with page.expect_download() as d:page.locator('#export-tree').click()
  raw=Path(d.value.path()).read_text();saved=json.loads(raw);assert saved['nodeOrigins']['root']=='user_edited';assert saved['nodeOrigins'][selected]=='manual'
  assert 'memo' not in saved and 'context' not in saved
  page.reload();expect(page.locator('.tree-node')).to_have_count(0)
  page.locator('#import-tree').set_input_files({'name':'journey.json','mimeType':'application/json','buffer':raw.encode()})
  expect(page.locator('#file-status')).to_contain_text('復元しました');expect(page.locator('.tree-node')).to_have_count(len(saved['tree']['nodes']))
  assert '文理を決める前に' in page.locator('[data-node=root]').inner_text()
  assert '自分で追加' in page.locator('.node-origin').inner_text()
  for pos in saved['positions']:
   style=page.locator(f'[data-node="{pos["id"]}"]').get_attribute('style');assert f'left:{pos["x"]}px' in style and f'top:{pos["y"]}px' in style
  # Reopen editor, verify fields, cancel without losing accepted content.
  page.locator(f'[data-node="{selected}"]').click();page.locator('[data-edit-start]').click();assert '授業紹介を一つ' in page.locator('#edit-detail').input_value();page.locator('[data-edit-cancel]').click()
  close_student_detail(page)
  page.evaluate('window.print=()=>{window.printCalled=true}')
  reveal(page,'#print-summary').click();assert page.evaluate('window.printCalled')
  assert '進路担当の先生' in page.locator('#tree-print').inner_text()
  assert page.locator('#tree-print').locator('h2',has_text='図に残したすべての項目').count()==0
  # Browser print shortcut prepares the latest committed content and hides navigation only in print.
  page.evaluate('dispatchEvent(new Event("beforeprint"))');page.emulate_media(media='print')
  assert page.locator('#tree-print').is_visible() and not page.locator('.desk-nav').is_visible()
  if engine=='chromium':page.pdf(path=str(out/'consultation-memo.pdf'),format='A4',print_background=False)
  page.evaluate('dispatchEvent(new Event("beforeprint"))')
  page.screenshot(path=str(out/f'{engine}-print.png'))
  page.emulate_media(media='screen');page.evaluate('dispatchEvent(new Event("afterprint"))');assert page.locator('.desk-nav').is_visible()
  # White-paper mode is genuinely blank and never silently clears the memo.
  memo_entry(page).fill('ここに書いた相談は残す');page.locator('[data-start=blank]').click()
  assert page.locator('[data-node=root] .node-label').inner_text()=='今、考えたいことは？'
  assert page.locator('#memo').input_value()=='ここに書いた相談は残す'
  decision['accept']=False;page.locator('[data-start=sample]').click();page.locator('[data-student-sample]').first.click()
  assert page.locator('#memo').input_value()=='ここに書いた相談は残す' and page.locator('.tree-node').count()==1
  assert not sent and not errors,(sent,errors)
  assert page.evaluate('localStorage.length+sessionStorage.length')==0
  print('PASS '+engine+': Home→optional Tree→sample→edit→branch→reflection→concrete next step→JSON→reload→restore exact origins/positions→edit→print/PDF, unavailable AI disabled, zero POST/storage')
  b.close()
