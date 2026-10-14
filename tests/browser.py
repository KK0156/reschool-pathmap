from playwright.sync_api import sync_playwright
import tomllib
from pathlib import Path
csp = tomllib.loads(Path('netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 def with_csp(route):
  response=route.fetch()
  route.fulfill(response=response,headers={**response.headers,'content-security-policy':csp})
 context.route('**/*',with_csp)
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.add_init_script('window.__nativeLocal = window.localStorage; window.__nativeSession = window.sessionStorage;')
 page.goto('http://localhost:8000')
 page.screenshot(path='/tmp/pathmap-desktop.png',full_page=True)
 for route in ['finder','paths','cases','dashboard','research']:
  page.goto('http://localhost:8000/#/'+route)
  assert page.locator('h1').count()==1
 page.goto('http://localhost:8000/#/finder')
 page.locator('button[type=submit]').click()
 assert '印のない問い' in page.locator('#form-error').inner_text()
 page.get_by_label('技術・データ',exact=True).check()
 page.get_by_label('つくって試す',exact=True).check()
 page.get_by_label('新しいものを生む',exact=True).check()
 page.locator('button[type=submit]').click()
 assert page.locator('#finder-results .path-card').count()==3
 assert '技術で可能性' in page.locator('#finder-results .path-card').first.inner_text()
 page.goto('http://localhost:8000/#/paths')
 for id in ['care','environment','technology']:
  page.locator('[data-compare='+id+']').click()
 assert page.locator('.comparison thead th').count()==4
 page.locator('[data-compare=design]').click()
 assert '3件まで' in page.locator('.status').inner_text()
 page.locator('[data-filter="技術・データ"]').click()
 assert page.locator('.path-card').count()==1
 page.locator('[data-clear-compare]').click()
 assert page.locator('.comparison').count()==0
 page.goto('http://localhost:8000/#/paths/technology')
 page.locator('[data-consult]').click()
 assert page.locator('.consult').is_visible()
 page.reload()
 assert page.locator('.consult').count()==0
 page.goto('http://localhost:8000/#/cases')
 page.locator('[data-case-filter="世界・ことば"]').click()
 assert page.locator('.case-card').count()==1
 assert page.evaluate('localStorage.length + sessionStorage.length')==0
 mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True)
 for route in ['','finder','paths','paths/technology','cases','dashboard','research']:
  mobile.goto('http://localhost:8000/#/'+route)
  assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'),route
 mobile.goto('http://localhost:8000')
 mobile.screenshot(path='/tmp/pathmap-mobile.png',full_page=True)
 page.goto('http://localhost:8000/original.html')
 page.get_by_role('heading',name='卒業の、その続きを。').wait_for()
 assert page.locator('.back-to-pathmap').get_attribute('href')=='/'
 assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length')==0
 page.get_by_role('button',name='母校に戻ってみる →').click()
 assert '/original.html?view=' in page.url
 page.reload()
 page.locator('.app').wait_for()
 assert page.locator('.app').count()==1
 assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length')==0
 page.goto('http://localhost:8000/original.html?view=%2Fgive%2Fdetails')
 page.locator('textarea').wait_for(state='hidden')
 assert page.locator('textarea:enabled').count()==0
 page.locator('.back-to-pathmap').click()
 page.locator('.hero h1').wait_for()
 assert 'まだ知らない道が、' in page.locator('.hero h1').inner_text()
 page.keyboard.press('Tab')
 assert page.locator('.skip').evaluate('(el)=>el===document.activeElement')
 page.keyboard.press('Enter')
 assert page.locator('#main').evaluate('(el)=>el===document.activeElement')
 page.wait_for_load_state('networkidle')
 context.unroute_all(behavior='wait')
 assert not errors,errors
 print('PASS: 6 screens, validation, Finder results, 3-card comparison limit, filters, consultation, reload reset, no storage, mobile overflow, no JS errors, v1 navigation and reload, native storage untouched, Netlify CSP, keyboard skip link')
 browser.close()
