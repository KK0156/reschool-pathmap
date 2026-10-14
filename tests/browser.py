from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto('http://localhost:8000')
 page.screenshot(path='/tmp/pathmap-desktop.png',full_page=True)
 for route in ['finder','paths','cases','dashboard','research']:
  page.goto('http://localhost:8000/#/'+route)
  assert page.locator('h1').count()==1
 page.goto('http://localhost:8000/#/finder')
 page.locator('button[type=submit]').click()
 assert '選んでください' in page.locator('#form-error').inner_text()
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
 assert not errors,errors
 print('PASS: 6 screens, validation, Finder results, 3-card comparison limit, filters, consultation, reload reset, no storage, mobile overflow, no JS errors')
 browser.close()
