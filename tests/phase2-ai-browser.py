import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
proposal={'summary':'比較のための提案です。実際の参加条件は未確認です。','suggestions':[{'label':'別の場所で少し学んでみる','type':'project','detail':'学校外の公開講座などを調べる方法も考えられます。','evidence':'利用できる講座と情報源は未確認。','risk':'費用や参加条件が合わない可能性。','next_action':'先生に、参加条件の調べ方を聞く。'},{'label':'情報を増やすだけでは決められないかもしれない','type':'counterargument','detail':'時間や費用の制約のほうが大きい場合も考えられます。','evidence':'本人の条件は未確認。','risk':'調べる負担が増える可能性。','next_action':'何が一番気になっているか言葉にする。'}]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':1024,'height':1000},reduced_motion='reduce');errors=[];posts=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:posts.append(r.post_data_json) if r.method=='POST' and '/deepen-tree' in r.url else None)
 page.goto('http://localhost:8002/#/tree');page.locator('#memo').fill('教育をどこで学ぶか、自分の言葉で考える');page.locator('#manual-from-memo').click()
 expect(page.locator('#generate')).to_be_disabled();page.locator('.branch-consultation summary').first.click();expect(page.locator('#branch-request')).to_be_disabled();assert not posts
 # Capability is explicitly mocked; no paid endpoint is reachable from the offline server.
 page.route('**/.netlify/functions/generate-tree',lambda r:r.fulfill(status=200,content_type='application/json',body='{"configured":true}'))
 page.locator('#check-ai').click();expect(page.locator('#generate')).to_be_enabled()
 page.locator('.optional-context summary').click();page.locator('#context-grades').fill('成績の非公開メモはこの枝相談に送らない')
 page.locator('#branch-request').click();expect(page.locator('#branch-status')).to_contain_text('チェック');assert not posts
 page.route('**/.netlify/functions/deepen-tree',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps(proposal,ensure_ascii=False)))
 page.locator('#branch-consent').check();page.locator('#branch-request').click();expect(page.locator('#branch-status')).to_contain_text('まだ図は変わっていません')
 assert page.locator('.tree-node').count()==1 and page.locator('#branch-accept').is_disabled()
 assert set(posts[-1])=={'question','node','intent','comparison'} and posts[-1]['comparison'] is None
 assert '成績の非公開メモ' not in json.dumps(posts[-1],ensure_ascii=False) and 'memo' not in posts[-1]
 assert json.loads(page.locator('#branch-preview').text_content())==posts[-1]
 page.locator('[data-proposal-index="0"]').check();page.locator('#branch-accept').click();expect(page.locator('.tree-node')).to_have_count(2)
 assert page.locator('[data-node=root] .node-label').inner_text()=='教育をどこで学ぶか、自分の言葉で考える'
 assert 'AI提案を本人が追加承認' in page.locator('.node-origin').inner_text()
 assert '自分で書き始めた' not in page.locator('#node-detail .detail-note').inner_text()
 page.locator('[data-edit-start]').click();page.locator('#edit-label').fill('自分で選び直した案');page.locator('#node-edit-form button[type=submit]').click();assert '自分で書き直し' in page.locator('.node-origin').inner_text()
 # Compare only selected context and one explicit second item. Discard never changes nodes.
 page.locator('#branch-intent').select_option('compare');page.locator('#branch-compare').select_option('root');page.locator('#branch-consent').check();page.locator('#branch-request').click();expect(page.locator('#branch-discard')).to_be_visible()
 assert posts[-1]['comparison']['label'].startswith('教育をどこで') and posts[-1]['node']['label']=='自分で選び直した案'
 page.locator('#branch-discard').click();expect(page.locator('.tree-node')).to_have_count(2)
 # Invalid output and provider errors keep the existing work and never fabricate a proposal.
 for status,body in [(200,'{"summary":"invalid","suggestions":[]}'),(502,'{"error":"接続できません"}')]:
  page.unroute('**/.netlify/functions/deepen-tree');page.route('**/.netlify/functions/deepen-tree',lambda r,_request,status=status,body=body:r.fulfill(status=status,content_type='application/json',body=body))
  page.locator('#branch-consent').check();page.locator('#branch-request').click();expect(page.locator('#branch-status')).to_contain_text('編集内容は残っています');assert page.locator('.tree-node').count()==2 and page.locator('#branch-proposals article').count()==0
 # A request can be abandoned, and the stale response must not appear after editing.
 held=[];page.unroute('**/.netlify/functions/deepen-tree');page.route('**/.netlify/functions/deepen-tree',lambda r:held.append(r))
 page.locator('#branch-consent').check();page.locator('#branch-request').click();expect(page.locator('#branch-cancel')).to_be_visible()
 page.locator('#branch-consent').uncheck();expect(page.locator('#branch-status')).to_contain_text('回答の待機をやめました')
 assert page.locator('#branch-proposals article').count()==0
 for route in held:
  try:route.fulfill(status=200,content_type='application/json',body=json.dumps(proposal,ensure_ascii=False))
  except Exception:pass
 assert page.locator('#branch-proposals article').count()==0
 # Deterministic frontend timeout with a stalled mock; browser clock does not call AI.
 held.clear();page.clock.install();page.locator('#branch-consent').check();page.locator('#branch-request').click();page.clock.fast_forward(45001)
 expect(page.locator('#branch-status')).to_contain_text('時間がかかった');assert page.locator('.tree-node').count()==2
 for route in held:
  try:route.abort('failed')
  except Exception:pass
 held.clear()
 # Clear must remove all proposal previews and delayed clipboard errors must not restore old text.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>new Promise((resolve,reject)=>window.rejectOldCopy=reject)},configurable:true})")
 page.locator('#copy-summary').click();page.locator('#clear-all').click();page.evaluate('window.rejectOldCopy(new Error("late"))');page.clock.run_for(1)
 assert page.locator('#branch-preview').inner_text()=='' and page.locator('#branch-compare option').count()==0
 assert page.locator('#copy-fallback').is_hidden() and page.locator('#copy-fallback').input_value()==''
 # Whole-map generation timeout also preserves the existing diagram.
 page.locator('#memo').fill('タイムアウトでも残す相談');page.locator('#manual-from-memo').click()
 page.unroute('**/.netlify/functions/generate-tree')
 def stalled_generation(route):
  if route.request.method=='GET':route.fulfill(status=200,content_type='application/json',body='{"configured":true}')
  else:held.append(route)
 page.route('**/.netlify/functions/generate-tree',stalled_generation)
 page.locator('#send-consent').check();page.locator('#generate').click();page.clock.fast_forward(55001)
 expect(page.locator('#tree-status')).to_contain_text('回答に時間がかかっています');assert page.locator('.tree-node').count()==1
 for route in held:
  try:route.abort('failed')
  except Exception:pass
 assert not errors,errors
 print('PASS: real unavailable gate, explicit minimal consent, append-only proposal approval, per-node origins, compare/discard, malformed/error/timeout, consent cancellation/stale response and clear after delayed copy')
 b.close()
