from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':1000})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def select_answers():
  page.goto('http://localhost:8001/#/finder')
  page.get_by_label('プログラミング・AI',exact=True).check()
  page.locator('[data-next-question]').click()
  page.get_by_label('プログラムや道具を作る',exact=True).check()
  page.locator('[data-next-question]').click()
  page.get_by_label('専門的な技術を身につけたい',exact=True).check()
 select_answers()
 requests=[]
 page.on('request',lambda r:requests.append(r) if '/.netlify/functions/path-consult' in r.url else None)
 page.locator('button[type=submit]').click()
 assert not requests
 assert '同意' in page.locator('#form-error').inner_text()
 page.locator('#ai-consent').check()
 page.locator('button[type=submit]').click()
 page.locator('.ai-error').wait_for()
 assert 'まだ設定されていません' in page.locator('.ai-error').inner_text()
 assert page.locator('.ai-reply').count()==0
 assert set(json.loads(requests[0].post_data))=={'selection','turns'}
 page.screenshot(path='/workspace/pathmap-ai-unconfigured.png',full_page=True)
 # Mocked browser responses validate interaction, not live model quality.
 def respond(route):
  route.fulfill(status=200,content_type='application/json',body=json.dumps({'reply':'テスト用の返答。<img src=x onerror=alert(1)>','pathIds':['technology'],'nextQuestionId':'compare','teacherQuestions':['実習の内容はどう違いますか？']},ensure_ascii=False))
 page.route('**/.netlify/functions/path-consult',respond)
 page.locator('[data-ai-retry]').click()
 page.locator('.ai-reply').wait_for()
 assert page.locator('.ai-reply img').count()==0
 page.locator('[data-ai-answer="1"]').click()
 page.wait_for_function("document.querySelectorAll('.ai-reply').length===2")
 last=json.loads(requests[-1].post_data)
 assert last['turns']==[{'questionId':'compare','answerIndex':1}]
 assert 'test' not in last
 page.locator('[data-ai-clear]').click()
 assert page.locator('.ai-reply').count()==0
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 page.reload()
 assert page.locator('.ai-reply').count()==0
 assert not errors,errors
 page.unroute_all(behavior='wait')
 print('PASS: consent gates requests, real unconfigured error, mocked replies and follow-up, XSS escaping, clear/reload, no storage')
 b.close()
