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
 page.goto('http://localhost:8002/reschool.html')
 page.screenshot(path='/tmp/pathmap-desktop.png',full_page=True)
 for route in ['finder','paths','cases','dashboard','research']:
  page.goto('http://localhost:8002/reschool.html#/'+route)
  assert page.locator('h1').count()==1
 page.goto('http://localhost:8002/reschool.html#/finder')
 page.locator('[data-next-question]').click()
 assert '一つ以上選んで' in page.locator('#form-error').inner_text()
 page.get_by_label('プログラミング・AI',exact=True).check()
 page.locator('[data-next-question]').click()
 page.get_by_label('プログラムや道具を作る',exact=True).check()
 page.locator('[data-next-question]').click()
 page.get_by_label('専門的な技術を身につけたい',exact=True).check()
 page.locator('[data-question="1"]').first.click()
 assert page.get_by_label('プログラミング・AI',exact=True).is_checked()
 page.locator('[data-question="3"]').first.click()
 page.locator('[data-offline]').click()
 assert 1 <= page.locator('#finder-results .path-card').count() <= 6
 assert '情報を学び' in page.locator('#finder-results .path-card').first.inner_text()
 page.locator('[data-reset]').click()
 page.get_by_label('まだ決まっていない',exact=True).check()
 page.locator('[data-next-question]').click()
 page.get_by_label('まだ分からない',exact=True).check()
 page.locator('[data-next-question]').click()
 page.get_by_label('今は特にない',exact=True).check()
 page.locator('[data-offline]').click()
 assert page.locator('#finder-results .path-card').count()==6
 assert 'まず確認できる' in page.locator('#finder-results h2').first.inner_text()
 page.goto('http://localhost:8002/reschool.html#/paths')
 for id in ['care','environment','technology']:
  page.locator('[data-compare='+id+']').click()
 assert page.locator('.comparison thead th').count()==4
 page.locator('[data-compare=design]').click()
 assert '3件まで' in page.locator('.status').inner_text()
 page.locator('#filter-select').select_option('プログラミング・AI')
 assert page.locator('.path-card').count()==1
 page.locator('[data-clear-compare]').click()
 assert page.locator('.comparison').count()==0
 page.goto('http://localhost:8002/reschool.html#/paths/technology')
 page.locator('[data-consult]').click()
 assert page.locator('.consult').is_visible()
 page.reload()
 assert page.locator('.consult').count()==0
 page.goto('http://localhost:8002/reschool.html#/cases')
 page.locator('[data-record=B]').first.click()
 assert '農学系' in page.locator('.case-card h2').inner_text()
 assert page.locator('[data-record=B]').first.get_attribute('aria-pressed')=='true'
 page.locator('#case-filter-select').select_option('語学・海外')
 assert page.locator('.case-card').count()==1
 assert page.locator('.record-options button').count()==2
 page.goto('http://localhost:8002/reschool.html#/dashboard')
 assert page.locator('.school-profile').count()==0
 page.locator('#school-select').select_option('general')
 assert 'サンプル校A' in page.locator('.school-profile').inner_text()
 assert '進路面談' in page.locator('.school-activities').inner_text()
 page.locator('#school-select').select_option('technical')
 assert '実習の振り返り' in page.locator('.school-activities').inner_text()
 page.locator('.school-profile a.primary').click()
 page.locator('.empty-results').wait_for()
 page.locator('#case-filter-select').select_option('すべて')
 assert page.locator('.record-options button').count()==5
 assert page.evaluate('localStorage.length + sessionStorage.length')==0
 mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True)
 for route in ['','finder','paths','paths/technology','cases','dashboard','research']:
  mobile.goto('http://localhost:8002/reschool.html#/'+route)
  assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'),route
 mobile.goto('http://localhost:8002/reschool.html#/cases')
 mobile.locator('.site-contents summary').click()
 assert mobile.locator('.site-nav a[aria-current]').is_visible()
 mobile.locator('.record-toc summary').click()
 mobile.locator('[data-record=B]').first.click()
 assert '農学系' in mobile.locator('.case-card h2').inner_text()
 mobile.goto('http://localhost:8002/reschool.html')
 mobile.screenshot(path='/tmp/pathmap-mobile.png',full_page=True)
 page.goto('http://localhost:8002/original.html')
 page.get_by_role('heading',name='卒業の、その続きを。').wait_for()
 assert page.locator('.back-to-pathmap').get_attribute('href')=='/'
 assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length')==0
 page.get_by_role('button',name='母校に戻ってみる →').click()
 assert '/original.html?view=' in page.url
 page.reload()
 page.locator('.app').wait_for()
 assert page.locator('.app').count()==1
 assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length')==0
 page.goto('http://localhost:8002/original.html?view=%2Fgive%2Fdetails')
 page.locator('textarea').wait_for(state='visible');assert page.locator('textarea').is_disabled()
 assert page.locator('textarea:enabled').count()==0
 page.locator('.back-to-pathmap').click()
 page.locator('.student-home-intro h1').wait_for()
 assert 'まだ知らない道' in page.locator('.student-home-intro h1').inner_text()
 assert page.locator('.home-map-start').is_visible() and page.locator('.home-map-start').get_attribute('href')=='#/finder?mode=all'
 assert page.locator('.home-finder-start').is_visible() and page.locator('.home-finder-start').get_attribute('href')=='#/finder?mode=ai'
 assert page.locator('.tree-entry-link').is_visible() and page.locator('.tree-entry-link').get_attribute('href')=='#/tree'
 page.keyboard.press('Tab')
 assert page.locator('.skip').evaluate('(el)=>el===document.activeElement')
 page.keyboard.press('Enter')
 assert page.locator('#main').evaluate('(el)=>el===document.activeElement')
 page.wait_for_load_state('networkidle')
 context.unroute_all(behavior='wait')
 assert not errors,errors
 print('PASS: 6 screens, validation, Finder results, 3-card comparison limit, filters, consultation, reload reset, no storage, mobile overflow, no JS errors, v1 navigation and reload, native storage untouched, Netlify CSP, keyboard skip link')
 browser.close()
