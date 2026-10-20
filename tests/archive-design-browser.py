from pathlib import Path
import tomllib,json
from playwright.sync_api import sync_playwright,expect
out=Path('/workspace/reschool-archive-review/after');out.mkdir(parents=True,exist_ok=True)
csp=tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
with sync_playwright() as p:
 for name in ['chromium','webkit']:
  if name=='webkit' and not Path('/workspace/webkit-runtime/run-webkit.sh').exists():print('SKIP: WebKit archive test runtime unavailable');continue
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']) if name=='chromium' else p.webkit.launch(executable_path='/workspace/webkit-runtime/run-webkit.sh')
  context=b.new_context(viewport={'width':1024,'height':1000});page=context.new_page();errors=[];sent=[];external=[];violations=[]
  context.add_init_script("window.__nativeLocal=window.localStorage;window.__nativeSession=window.sessionStorage;window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective))")
  def secure(route):
   r=route.fetch();route.fulfill(response=r,headers={**r.headers,'content-security-policy':csp})
  context.route('**/*',secure);page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  page.on('request',lambda r:sent.append(r.url) if r.method=='POST' else None)
  page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith('http://localhost:') else None)
  metrics=[]
  for width in [320,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':1000});page.goto('http://localhost:8002/#/archive')
   previews=page.locator('.archive-original-preview');expect(previews).to_have_count(2)
   assert previews.nth(0).get_attribute('href')=='/original.html' and previews.nth(1).get_attribute('href')=='/reschool.html'
   assert page.locator('.archive-item button:disabled').count()==2
   for image in previews.locator('img').all():
    image.scroll_into_view_if_needed();expect(image).to_be_visible();assert image.evaluate('(el)=>el.complete&&el.naturalWidth===1280')
   page.evaluate('scrollTo(0,0)');page.screenshot(path=str(out/f'{name}-{width}-archive.png'))
   previews.first.click();page.get_by_role('heading',name='卒業の、その続きを。').wait_for()
   styles=page.locator('.app').evaluate('(el)=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})')
   heading=page.locator('h1').evaluate('(el)=>({family:getComputedStyle(el).fontFamily,size:parseFloat(getComputedStyle(el).fontSize),weight:getComputedStyle(el).fontWeight})')
   assert styles=={'background':'rgb(242, 239, 231)','color':'rgb(24, 37, 54)'},styles
   assert heading['size']>=38 and heading['weight']=='600' and 'serif' in heading['family'],heading
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,'v1 overflow')
   assert page.evaluate('window.__nativeLocal.length+window.__nativeSession.length')==0
   assert not page.evaluate('window.__csp'),page.evaluate('window.__csp')
   page.screenshot(path=str(out/f'{name}-{width}-original.png'))
   metrics.append({'width':width,'styles':styles,'heading':heading,'overflow':False})
   page.locator('.back-to-pathmap').click();page.locator('.desk-cover').wait_for()
  page.goto('http://localhost:8002/original.html?view=%2Fgive%2Fdetails');expect(page.locator('textarea')).to_be_visible();assert page.locator('textarea').is_disabled()
  assert page.locator('textarea:enabled,input:not([type=checkbox]):not([type=radio]):enabled').count()==0
  page.screenshot(path=str(out/f'{name}-original-fields.png'))
  assert not errors and not sent and not external,(errors,sent,external)
  (out/f'{name}-audit.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2))
  print('PASS '+name+': original design/colors/fonts preserved at5 widths, actual screen previews, archive links/availability, read-only visible fields, CSP, zero external/POST/native storage')
  b.close()
