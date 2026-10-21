"""Guided AI + whole atlas + Finder JSON acceptance tests.

All AI responses are fabricated local fixtures. Tests never call a provider,
deploy, push, or use real student information.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import tomllib
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('GUIDED_BASE_URL','http://localhost:8003').rstrip('/')
OUTPUT=Path(os.environ.get('GUIDED_SCREENSHOT_DIR','/workspace/reschool-guided-review/after'))
OUTPUT.mkdir(parents=True,exist_ok=True)
ORIGIN=urlparse(BASE).netloc
CSP=tomllib.loads((ROOT/'netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
RESEARCH_HASHES={
    'src/research-data.js':'9e2ad14e49a46b6d7a152c747f6541b4e2c01875e6ddd2b545d38d36eab762b4',
    'src/research-report.js':'6ed6b2933425512f545a0682a93454d4dc997b9bfd5337acdaed1063a4b1526c',
}


def guide_fixture(request,action=None):
    goal=request['context']['goal']
    action=goal if goal!='continue' else action or 'ask'
    revision=request['revision']
    refs=[request['corrections'][-1]['id']] if request['corrections'] else [request['answers'][-1]['id']] if request['answers'] else []
    suffix='step-'+str(revision)
    explanation='検証用の架空応答です。気になる作業と生活の条件を分けて、もう少し確かめられます。'
    if action=='explain':
        explanation='文系・理系という分け方と、大学で学ぶ内容は同じではありません。履修や出願の条件は、学校や公式の資料で別に確認できます。'
    question=None
    if action in ['ask','explain']:
        question={'id':'q-'+suffix,'text':'学ぶ内容と普段の生活、今はどちらを詳しく見たい？',
                  'why':'答えを決めるためではなく、比べる項目を増やすための質問です。',
                  'choices':[{'id':'content-'+suffix,'label':'学ぶ内容を知りたい'},{'id':'life-'+suffix,'label':'普段の生活を知りたい'}],
                  'multiple':False}
    routes=[]
    if action in ['show_routes','compare']:
        route_ids=request['context']['routeIds'] if action=='compare' else ['route-work','route-university']
        routes=[{'atlasId':node_id,'reason':('この回答から、内容と条件を比べる参考にできます。' if refs else '一般的な入口として、学ぶ方法と働く方法の両方を並べています。'),
                 'answerIds':refs,'unknowns':['本人の利用条件、募集時期、費用は未確認です。']}
                for node_id in route_ids]
    return {
        'action':action,'explanation':explanation,'question':question,
        'statements':[{'id':'interpret-'+suffix,'text':'学び方と日々の生活の両方を比べたいのかもしれません。本人が直せる、仮の整理です。','answerIds':refs,'kind':'interpretation' if refs else 'unknown'}],
        'routes':routes,
        'additionalIdeas':[{'id':'idea-'+suffix,'text':'働きながら学ぶ方法も、一般資料で確かめられます。','answerIds':refs}],
        'nextActions':[{'id':'next-'+suffix,'text':'履修条件と生活の違いを、先生に聞く質問にしてみる。','answerIds':refs}],
        'unknowns':['本人の適性・合格可能性を確認したものではありません。'],
    }


class NetworkGuard:
    def __init__(self,configured=True):
        self.configured=configured
        self.behavior='success'
        self.action='ask'
        self.posts=[]
        self.gets=[]
        self.external=[]
        self.unexpected=[]
        self.held=[]
        self.payload=None

    def json(self,route,body,status=200):
        route.fulfill(status=status,content_type='application/json',body=json.dumps(body,ensure_ascii=False))

    def handle(self,route):
        request=route.request
        parsed=urlparse(request.url)
        if parsed.netloc!=ORIGIN:
            self.external.append(request.url)
            route.abort()
            return
        if parsed.path=='/.netlify/functions/guide-discovery':
            if request.method=='GET':
                self.gets.append(parsed.path)
                self.json(route,{'configured':self.configured,'browsing':False})
                return
            if request.method=='POST':
                body=request.post_data_json
                assert set(body)=={'intent','revision','answers','corrections','context'}
                assert body['intent']=='guide' and isinstance(body['revision'],int)
                assert set(body['context'])=={'routeIds','goal'}
                assert all(set(answer)=={'id','questionId','question','text','state'} for answer in body['answers'])
                assert all(set(correction)=={'id','text'} for correction in body['corrections'])
                self.posts.append(body)
                if self.behavior=='hold':
                    self.held.append((route,body))
                elif self.behavior=='error':
                    self.json(route,{'error':'検証用：接続先で処理できませんでした。'},502)
                elif self.behavior=='malformed':
                    self.json(route,{'action':'ask','question':None})
                elif self.behavior=='unavailable':
                    self.json(route,{'error':'AI接続は未設定です。','code':'NOT_CONFIGURED'},503)
                else:
                    self.json(route,self.payload or guide_fixture(body,self.action))
                return
        if parsed.path.startswith('/.netlify/functions/') and request.method=='GET':
            self.gets.append(parsed.path)
            self.json(route,{'configured':False,'browsing':False})
            return
        if request.method!='GET':
            self.unexpected.append({'url':request.url,'method':request.method})
            route.abort()
            return
        response=route.fetch()
        route.fulfill(response=response,headers={**response.headers,'content-security-policy':CSP})

    def release(self):
        held,self.held=self.held,[]
        for route,body in held:
            try:
                self.json(route,guide_fixture(body,self.action))
            except Exception:
                pass


@contextmanager
def page_fixture(browser,*,configured=True,width=1024,touch=False):
    context=browser.new_context(viewport={'width':width,'height':1000},has_touch=touch,
                                accept_downloads=True,reduced_motion='reduce')
    context.add_init_script('''
        window.__guidedLocal=window.localStorage;
        window.__guidedSession=window.sessionStorage;
        window.__guidedCsp=[];
        document.addEventListener('securitypolicyviolation',e=>window.__guidedCsp.push(e.violatedDirective));
    ''')
    guard=NetworkGuard(configured)
    context.route('**/*',guard.handle)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    guard.dialog_handler=lambda dialog:dialog.accept()
    page.on('dialog',guard.dialog_handler)
    try:
        yield page,guard
        assert not errors,errors
        assert not guard.external and not guard.unexpected,(guard.external,guard.unexpected)
        assert page.evaluate('window.__guidedLocal.length+window.__guidedSession.length')==0
        assert context.cookies()==[]
        assert not page.evaluate('window.__guidedCsp'),page.evaluate('window.__guidedCsp')
    except Exception:
        page.screenshot(path=str(OUTPUT/'failure.png'))
        print('FAILED AT',page.url)
        raise
    finally:
        guard.release()
        context.unroute_all(behavior='wait')
        context.close()


def no_overflow(page,label):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),label


def research_unchanged():
    for filename,digest in RESEARCH_HASHES.items():
        assert hashlib.sha256((ROOT/filename).read_bytes()).hexdigest()==digest,filename


def open_disclosure(locator):
    # Keep ancestor indices stable while opening nested disclosures; filtering
    # by @open would change the next locator as soon as its parent was opened.
    for details in locator.locator('xpath=ancestor::details').all():
        if not details.evaluate('(el)=>el.open'):
            details.locator(':scope > summary').click()


def public_control(locator):
    """Reveal optional controls through their actual disclosure summaries."""
    open_disclosure(locator.first)
    return locator


def guide_action(page,action):
    return public_control(page.locator(f'[data-guide-action="{action}"]'))


def guide_answer(page):
    return public_control(page.locator('#guide-answer'))


def finder_view(page,name):
    return public_control(page.locator(f'[data-finder-map-view="{name}"]'))


def finder_import(page):
    return public_control(page.locator('#finder-import'))


def open_guided(page,guard):
    page.goto(BASE+'/')
    page.locator('.home-finder-start').click()
    expect(page.locator('#guide-title')).to_be_visible()
    expect(page.locator('#guide-capability')).to_contain_text('毎回')
    expect(page.locator('#guide-answer-form')).to_be_visible()
    assert not guard.posts


def send_preview(page,guard,*,to_map=False):
    open_disclosure(page.locator('#guide-send-preview'))
    expect(page.locator('#guide-send-preview')).to_be_visible()
    expect(page.locator('#guide-consent')).not_to_be_checked()
    body=json.loads(page.locator('#guide-send-preview').text_content())
    before=len(guard.posts)
    if guide_action(page,'send').is_enabled():
        guide_action(page,'send').click()
        expect(page.locator('#guide-error')).to_contain_text('同意')
    assert len(guard.posts)==before,'No request before the explicit checkbox.'
    page.locator('#guide-consent').check()
    guide_action(page,'send').click()
    if to_map:
        expect(page.locator('[data-finder-mode="all"]')).to_have_attribute('aria-pressed','true')
    else:
        expect(page.locator('.guide-loading')).to_have_count(0)
        expect(page.locator('.guide-explanation')).to_be_visible()
    assert len(guard.posts)==before+1
    assert guard.posts[-1]==body,'Preview must match the actual minimal request.'
    return body


def first_answer(page,guard,*,text='働くことと学ぶことを比べたい。架空メモ qa-guided-marker。'):
    open_guided(page,guard)
    guide_answer(page).fill(text)
    page.locator('#guide-answer-form button[type="submit"]').click()
    assert not guard.posts
    body=send_preview(page,guard)
    assert body['answers'][0]['state']=='answered'
    assert body['answers'][0]['text']==text
    return text


def ask_explain_correct_routes(page,guard,engine):
    memo=first_answer(page,guard)
    expect(page.locator('#guide-answer-form legend')).to_have_text('学ぶ内容と普段の生活、今はどちらを詳しく見たい？')
    expect(page.locator('.guide-understanding')).to_contain_text('AIの解釈')
    page.screenshot(path=str(OUTPUT/f'{engine}-dynamic-question.png'))
    guard.action='explain'
    guide_answer(page).fill('大学で学ぶ内容と、仕事の中で学ぶ内容の違いを知りたい。')
    page.locator('#guide-answer-form button[type="submit"]').click()
    second=send_preview(page,guard)
    assert len(second['answers'])==2
    expect(page.locator('.guide-explanation')).to_contain_text('文系・理系という分け方')
    page.screenshot(path=str(OUTPUT/f'{engine}-explanation.png'))
    guide_action(page,'correct').first.click()
    correction='接客が好きとは言っていない。人と制度の仕組みを調べたい。'
    page.locator('#guide-correction').fill(correction)
    before=len(guard.posts)
    page.locator('#guide-correction-form button[type="submit"]').click()
    assert len(guard.posts)==before
    expect(page.locator('.guide-corrections')).to_contain_text(correction)
    expect(page.locator('.guide-stale')).to_contain_text('見直しが必要')
    guide_action(page,'prepare-routes').click()
    preview=json.loads(page.locator('#guide-send-preview').text_content())
    assert len(preview['corrections'])==1 and correction in preview['corrections'][0]['text']
    assert preview['context']['goal']=='show_routes'
    assert preview['revision']>second['revision']
    send_preview(page,guard,to_map=True)
    expect(finder_view(page,'attention')).to_have_attribute('aria-pressed','true')
    page.screenshot(path=str(OUTPUT/f'{engine}-attention-routes.png'))
    finder_view(page,'all').click()
    expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
    page.screenshot(path=str(OUTPUT/f'{engine}-whole-map-after-ai.png'))
    page.locator('[data-finder-mode="ai"]').click()
    expect(page.locator('.guide-corrections')).to_contain_text(correction)
    assert len(guard.posts)==3
    return {'memo':memo,'correction':correction,'posts':3}


def unknown_different_skip_early_map(browser,engine):
    with page_fixture(browser) as (page,guard):
        open_guided(page,guard)
        guide_action(page,'map').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        assert not guard.posts
        page.locator('[data-finder-mode="ai"]').click()
        guide_action(page,'unknown').click()
        first=send_preview(page,guard)
        assert first['answers'][-1]['state']=='unknown' and first['answers'][-1]['text']==''
        guide_action(page,'different').click()
        second=send_preview(page,guard)
        assert second['answers'][-1]['state']=='different'
        assert second['answers'][-1]['text']=='用意された選択肢のどれも違う。'
        before=len(guard.posts)
        guide_action(page,'skip').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        assert len(guard.posts)==before
        return {'early_map_without_post':True,'unknown_and_different_distinct':True,'skip_without_send':True}


def finder_action(page,name,node=None):
    selector=f'[data-finder-action="{name}"]'
    if node is not None:
        selector+=f'[data-finder-node="{node}"]'
    controls=page.locator(selector)
    for control in controls.all():
        if control.is_visible():
            return control
    # A previous step can retain a hidden footer with the same action. Use the
    # current screen's disclosure entry rather than acting on that stale footer.
    for control in controls.all():
        if control.locator('xpath=ancestor::*[@hidden]').count()==0:
            public_control(control)
            if control.is_visible():
                return control
    return controls


def comparison_heading_clear_of_sticky(page):
    heading=page.locator('#atlas-title')
    expect(heading).to_be_in_viewport(ratio=1)
    title=heading.bounding_box()
    sticky=page.locator('.finder-modes').bounding_box()
    assert title['y']>=sticky['y']+sticky['height']-1,(title,sticky)
    return {'heading_top':round(title['y'],2),'sticky_bottom':round(sticky['y']+sticky['height'],2)}


def save_preview(page,include=False):
    edit=page.locator('[data-finder-action="edit-save"]')
    if edit.count():
        public_control(edit).click()
    page.locator('#finder-include-conversation').set_checked(include)
    finder_action(page,'save-preview').click()
    expect(page.locator('#finder-save-preview')).to_be_visible()
    raw=public_control(page.locator('#finder-save-preview pre'))
    expect(raw).to_be_visible()
    document=json.loads(raw.text_content())
    # Inspect the exact optional data, then return to the human-readable review.
    # This keeps raw JSON secondary to the candidate names and personal memo.
    raw.locator('xpath=ancestor::details[1]').locator(':scope > summary').click()
    return document


def download_finder(page):
    with page.expect_download() as downloaded:
        finder_action(page,'download').click()
    return Path(downloaded.value.path()).read_text()


def full_journey(browser,engine):
    with page_fixture(browser) as (page,guard):
        info=ask_explain_correct_routes(page,guard,engine)
        page.locator('[data-finder-mode="all"]').click()
        finder_view(page,'attention').click()
        expect(page.locator('.finder-route-card')).to_have_count(2)
        for node_id in ['route-work','route-university']:
            finder_action(page,'route-keep',node_id).click()
            expect(finder_action(page,'route-keep',node_id)).to_have_attribute('aria-pressed','true')
            finder_action(page,'route-compare',node_id).click()
            expect(finder_action(page,'route-compare',node_id)).to_have_attribute('aria-pressed','true')
        finder_action(page,'compare').click()
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        comparison_heading_clear_of_sticky(page)
        page.screenshot(path=str(OUTPUT/f'{engine}-comparison.png'))
        finder_action(page,'record').first.click()
        notes='本人が書いた検証メモ。働くことと、後から学ぶことの条件を確認する。'
        next_step='次の面談までに、費用と授業の違いについて質問を一つ用意する。'
        page.locator('#finder-notes').fill(notes)
        page.locator('#finder-next-actions').fill(next_step)
        redacted=save_preview(page)
        assert redacted['format']=='repath-finder-session' and redacted['schemaVersion']==2
        assert set(redacted['session']['exploration'])=={'expanded','selected','emphasis','notes','overrides','positions','serial','step'}
        assert redacted['session']['guide']['conversation'] is None
        assert redacted['session']['guide']['correspondence']=='not_saved'
        assert info['memo'] not in json.dumps(redacted,ensure_ascii=False)
        doc=save_preview(page,include=True)
        assert doc['session']['notes']==notes and doc['session']['nextActions']==next_step
        assert set(doc['session']['atlas']['compare'])=={'route-work','route-university'}
        assert set(doc['session']['atlas']['keep'])=={'route-work','route-university'}
        assert len(doc['session']['guide']['conversation']['answers'])==2
        assert len(doc['session']['guide']['conversation']['corrections'])==1
        assert doc['catalogueSources'] and all('scope' in source and 'limitations' in source for source in doc['catalogueSources'])
        raw=download_finder(page)
        assert json.loads(raw)==doc
        (OUTPUT/f'{engine}-finder-session.json').write_text(raw)
        page.screenshot(path=str(OUTPUT/f'{engine}-save-preview.png'))
        before=len(guard.posts)
        page.reload()
        finder_import(page).set_input_files({'name':'finder.json','mimeType':'application/json','buffer':raw.encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        expect(page.locator('#finder-notes')).to_have_value(notes)
        expect(page.locator('#finder-next-actions')).to_have_value(next_step)
        assert len(guard.posts)==before
        page.screenshot(path=str(OUTPUT/f'{engine}-restored-record.png'))
        finder_view(page,'attention').click()
        expect(page.locator('.finder-route-card')).to_have_count(2)
        for node_id in ['route-work','route-university']:
            expect(finder_action(page,'route-compare',node_id)).to_have_attribute('aria-pressed','true')
            expect(finder_action(page,'route-keep',node_id)).to_have_attribute('aria-pressed','true')
        page.locator('[data-finder-mode="ai"]').click()
        expect(page.locator('.guide-corrections')).to_contain_text(info['correction'])
        assert len(guard.posts)==before
        finder_action(page,'record').first.click()
        sentinel='不正なファイルを開いても、この本人メモは消さない。'
        page.locator('#finder-notes').fill(sentinel)
        unknown=json.loads(raw)
        unknown['session']['atlas']['keep'].append('not-an-existing-atlas-node')
        wrong_version=json.loads(raw)
        wrong_version['schemaVersion']=999
        invalid=[b'{',b'{"__proto__":{}}',json.dumps(unknown).encode(),json.dumps(wrong_version).encode(),b' '*(1024*1024+1)]
        for value in invalid:
            finder_import(page).set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':value})
            expect(page.locator('#finder-error')).to_contain_text('変更していません')
            expect(page.locator('#finder-notes')).to_have_value(sentinel)
            assert len(guard.posts)==before
        # Default redaction must remain a usable file, including another save.
        finder_import(page).set_input_files({'name':'redacted.json','mimeType':'application/json','buffer':json.dumps(redacted,ensure_ascii=False).encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        page.locator('[data-finder-mode="ai"]').click()
        expect(page.locator('.guide-understanding')).to_contain_text('元の回答はこのファイルに保存されていません')
        finder_action(page,'record').first.click()
        resaved=save_preview(page)
        assert resaved['session']['guide']['conversation'] is None
        assert resaved['session']['guide']['correspondence']=='not_saved'
        assert len(guard.posts)==before
        return {'dynamic_actions':['ask','explain','show_routes'],'correction_preserved':True,
                'comparison_facets':8,'finder_json_roundtrip_without_auto_send':True,
                'conversation_opt_in_and_redacted_resave':True,'invalid_files_preserve_edits':5,
                'mock_posts':before}


def prepare_pending(page,guard,goal='explain'):
    guide_action(page,goal).click()
    expect(page.locator('#guide-consent')).not_to_be_checked()
    page.locator('#guide-consent').check()
    guide_action(page,'send').click()
    expect(page.locator('.guide-loading')).to_be_visible()


def failure_and_stale_review(browser,engine):
    findings={}
    with page_fixture(browser,configured=False) as (page,guard):
        page.goto(BASE+'/')
        page.locator('.home-finder-start').click()
        expect(page.locator('#guide-capability')).to_contain_text('現在利用できません')
        public_control(page.locator('#guide-answer-form button[type=submit]'))
        expect(page.locator('#guide-answer-form button[type=submit]')).to_be_disabled()
        expect(guide_action(page,'prepare-routes')).to_have_count(0)
        expect(page.locator('.guide-explanation')).to_have_count(0)
        guide_action(page,'map').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        assert not guard.posts
        findings['unconfigured_honest_and_map_works']=True
    for behavior,message in [('error','受け取れません'),('malformed','形式'),('unavailable','利用できません')]:
        with page_fixture(browser) as (page,guard):
            open_guided(page,guard)
            guard.behavior=behavior
            memo='架空の失敗検証。学び方と働き方を比べたい。'
            guide_answer(page).fill(memo)
            page.locator('#guide-answer-form button[type=submit]').click()
            page.locator('#guide-consent').check()
            guide_action(page,'send').click()
            expect(page.locator('#guide-error')).to_contain_text(message)
            expect(page.locator('.guide-loading')).to_have_count(0)
            expect(page.locator('.guide-explanation')).to_have_count(0)
            expect(page.locator('.guide-answer-history')).to_contain_text(memo)
            guide_action(page,'map').click()
            expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
            assert len(guard.posts)==1
    findings['failed_malformed_unavailable_keep_answer_no_fake_result']=True
    with page_fixture(browser) as (page,guard):
        open_guided(page,guard)
        guide_answer(page).fill('時間切れになっても消さない架空の回答。')
        page.locator('#guide-answer-form button[type=submit]').click()
        page.clock.install()
        guard.behavior='hold'
        page.locator('#guide-consent').check()
        guide_action(page,'send').click()
        expect(page.locator('.guide-loading')).to_be_visible()
        page.clock.fast_forward(56000)
        expect(page.locator('#guide-error')).to_contain_text('時間がかかっています')
        expect(page.locator('.guide-answer-history')).to_contain_text('消さない架空の回答')
        guard.release()
        expect(page.locator('.guide-explanation')).to_have_count(0)
        guide_action(page,'prepare-routes').click()
        expect(page.locator('#guide-consent')).not_to_be_checked()
        findings['virtual_timeout_keeps_answer_new_consent_required']=True
    with page_fixture(browser) as (page,guard):
        memo=first_answer(page,guard)
        guard.behavior='hold'
        guard.action='explain'
        prepare_pending(page,guard)
        guide_action(page,'correct').first.click()
        page.locator('#guide-correction').fill('前の説明に補足したい。まだ仕事内容は分かっていない。')
        page.locator('#guide-correction-form button[type=submit]').click()
        guard.release()
        expect(page.locator('.guide-loading')).to_have_count(0)
        expect(page.locator('.guide-explanation')).not_to_contain_text('文系・理系という分け方')
        expect(page.locator('.guide-stale')).to_contain_text('見直しが必要')
        prepare_pending(page,guard,'prepare-routes')
        guide_action(page,'map').click()
        guard.release()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        page.locator('[data-finder-mode="ai"]').click()
        expect(page.locator('.guide-explanation')).not_to_contain_text('文系・理系という分け方')
        prepare_pending(page,guard,'explain')
        page.locator('.desk-nav a[href="#/"]').click()
        guard.release()
        page.locator('.home-finder-start').click()
        expect(page.locator('.guide-answer-history')).to_contain_text(memo)
        expect(page.locator('.guide-explanation')).not_to_contain_text('文系・理系という分け方')
        prepare_pending(page,guard,'explain')
        edit=guide_action(page,'edit-answer').first
        open_disclosure(edit)
        edit.click()
        guide_answer(page).fill('元の回答を本人が直した。仕事の内容をまだ知らない。')
        page.locator('#guide-answer-form button[type=submit]').click()
        guard.release()
        expect(page.locator('#guide-consent')).not_to_be_checked()
        expect(page.locator('.guide-loading')).to_have_count(0)
        preview=json.loads(page.locator('#guide-send-preview').text_content())
        assert preview['answers'][0]['text'].startswith('元の回答を本人が直した')
        assert len(preview['answers'])==1,'Editing replaces the answer; it must not silently duplicate it.'
        assert len(guard.posts)==5
        findings['late_responses_ignored_after_correction_map_home_answer_edit']=True
    with page_fixture(browser) as (page,guard):
        open_guided(page,guard)
        draft='まだ送っていない、途中の入力を残す。'
        guide_answer(page).fill(draft)
        page.locator('[data-finder-mode="all"]').click()
        page.locator('[data-finder-mode="ai"]').click()
        expect(page.locator('#guide-answer')).to_have_value(draft)
        page.locator('.desk-nav a[href="#/"]').click()
        page.locator('.home-finder-start').click()
        expect(page.locator('#guide-answer')).to_have_value(draft)
        assert not guard.posts
        findings['unsent_draft_survives_map_home']=True
    return findings


def explicit_guide_actions(browser,engine):
    with page_fixture(browser) as (page,guard):
        first_answer(page,guard)
        guide_action(page,'prepare-routes').click()
        send_preview(page,guard,to_map=True)
        for node_id in ['route-work','route-university']:
            finder_action(page,'route-compare',node_id).click()
        page.locator('[data-finder-mode="ai"]').click()
        guide_action(page,'compare').click()
        body=send_preview(page,guard,to_map=True)
        assert body['context']['goal']=='compare'
        assert set(body['context']['routeIds'])=={'route-work','route-university'}
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        comparison_heading_clear_of_sticky(page)
        assert set(page.locator('.atlas-compare-heading [data-atlas-action=node]').evaluate_all('els=>els.map(el=>el.dataset.atlasNode)'))==set(body['context']['routeIds'])
        page.locator('[data-finder-mode="ai"]').click()
        guide_action(page,'trial').click()
        body=send_preview(page,guard)
        assert body['context']['goal']=='suggest_trial'
        expect(page.locator('#guide-title')).to_have_text('小さく確かめること')
        guide_action(page,'summarize').click()
        body=send_preview(page,guard)
        assert body['context']['goal']=='summarize'
        expect(page.locator('#guide-title')).to_have_text('ここまでの整理')
        assert len(guard.posts)==5
    with page_fixture(browser) as (page,guard):
        open_guided(page,guard)
        guide_action(page,'explain').click()
        body=json.loads(page.locator('#guide-send-preview').text_content())
        guard.payload=guide_fixture(body,'explain')
        guard.payload['question']=None
        send_preview(page,guard)
        expect(page.locator('.guide-explanation')).to_contain_text('文系・理系という分け方')
        expect(page.locator('#guide-answer-form')).to_have_count(0)
        guide_action(page,'map').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        assert len(guard.posts)==1
    return {'compare_exact_selected_ids':True,'trial_and_summary':True,'explanation_can_pause_questions':True}


def suspended_draft_review(browser,engine):
    with page_fixture(browser) as (page,guard):
        memo=first_answer(page,guard)
        draft='次の問いへの未送信の下書き。費用と生活の例をもっと知りたい。'
        question=page.locator('#guide-answer-form legend').text_content()
        choice=page.locator('[data-guide-choice]').first
        choice_id=choice.get_attribute('data-guide-choice')
        choice.click()
        guide_answer(page).fill(draft)
        edit=guide_action(page,'edit-answer').first
        open_disclosure(edit)
        edit.click()
        expect(page.locator('#guide-answer')).to_have_value(memo)
        guide_answer(page).fill('取り消す予定の、過去の回答の修正。')
        guide_action(page,'cancel-edit').click()
        expect(page.locator('#guide-answer-form legend')).to_have_text(question)
        expect(page.locator('#guide-answer')).to_have_value(draft)
        expect(page.locator(f'[data-guide-choice="{choice_id}"]')).to_have_attribute('aria-pressed','true')
        edit=guide_action(page,'edit-answer').first
        open_disclosure(edit)
        edit.click()
        corrected='元の回答だけを直した。仕事も学びもまだ調べている。'
        guide_answer(page).fill(corrected)
        page.locator('#guide-answer-form button[type=submit]').click()
        preview=json.loads(page.locator('#guide-send-preview').text_content())
        assert len(preview['answers'])==1 and preview['answers'][0]['text']==corrected
        guide_action(page,'cancel-preview').click()
        guide_action(page,'resume-draft').click()
        expect(page.locator('#guide-answer-form legend')).to_have_text(question)
        expect(page.locator('#guide-answer')).to_have_value(draft)
        assert len(guard.posts)==1,'Editing and resuming must not send a request.'
        return {'cancel_edit_keeps_next_question_draft_choice':True,'resume_draft_after_saved_answer_edit':True,'no_automatic_send':True}


def optional_tree_handoff_review(browser,engine):
    with page_fixture(browser) as (page,guard):
        raw=(OUTPUT/f'{engine}-finder-session.json').read_bytes()
        page.goto(BASE+'/#/finder?mode=all')
        finder_import(page).set_input_files({'name':'guided.json','mimeType':'application/json','buffer':raw})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        transfer=finder_action(page,'tree')
        open_disclosure(transfer)
        transfer.click()
        expect(page.locator('h1:visible')).to_have_text('RE:Treeで整理する')
        expect(page.locator('#tree-overview')).to_contain_text('AIの補足')
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        doc=json.loads(Path(downloaded.value.path()).read_text())
        assert set(doc['nodeOrigins'].values())=={'reference','manual','ai_proposal'}
        assert doc['provenance']['origin']=='reference'
        ai_node=next(node for node in doc['tree']['nodes'] if doc['nodeOrigins'][node['id']]=='ai_proposal')
        assert ai_node['type']=='hypothesis' and '未確認' in ai_node['label']
        # The source is visible at each node; editing an AI supplement changes its origin.
        page.locator(f'[data-node="{ai_node["id"]}"]').click(force=True)
        expect(page.locator('#node-detail .node-origin')).to_contain_text('AI')
        page.locator('[data-edit-start]').click()
        label='本人が確認したいことを追記した、仮の理由。'
        page.locator('#edit-label').fill(label)
        page.locator('#node-edit-form button[type=submit]').click()
        page.locator('#node-detail [data-tree-go=tree-container]').click()
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        edited_raw=Path(downloaded.value.path()).read_text()
        edited=json.loads(edited_raw)
        assert edited['nodeOrigins'][ai_node['id']]=='user_edited'
        (OUTPUT/f'{engine}-guided-tree.json').write_text(edited_raw)
        page.reload()
        page.locator('#import-tree').set_input_files({'name':'tree.json','mimeType':'application/json','buffer':edited_raw.encode()})
        expect(page.locator('#file-status')).to_contain_text('復元しました')
        expect(page.locator(f'[data-node="{ai_node["id"]}"]')).to_have_attribute('data-origin','user_edited')
        expect(page.locator(f'[data-node="{ai_node["id"]}"]')).to_contain_text(label)
        page.screenshot(path=str(OUTPUT/f'{engine}-guided-tree-restored.png'))
        assert not guard.posts
        return {'reference_manual_ai_hypothesis_separated':True,'edited_ai_origin_changed':True,'tree_json_reload_restore':True,'provider_posts':0}


def responsive_review(browser,engine):
    results=[]
    for width in [320,390,768,1024,1440]:
        with page_fixture(browser,width=width,touch=width in(768,1024)) as (page,guard):
            def capture(name):
                no_overflow(page,(engine,width,name))
                page.screenshot(path=str(OUTPUT/f'{engine}-{width}-{name}.png'))
            page.goto(BASE+'/')
            primary=page.locator('.home-finder-start')
            secondary=page.locator('.home-map-start')
            expect(primary).to_be_visible()
            expect(secondary).to_be_visible()
            one,two=primary.bounding_box(),secondary.bounding_box()
            # Both are full-size entrances; allow ordinary font metric rounding.
            assert abs(one['width']-two['width'])<=1 and abs(one['height']-two['height'])<=3,(width,one,two)
            capture('home-equal-entries')
            primary.click()
            expect(page.locator('#guide-capability')).to_contain_text('毎回')
            capture('guide-initial')
            guide_answer(page).fill('進学するか働くか、まだ分からない。授業と生活の違いを見たい。')
            page.locator('#guide-answer-form button[type=submit]').click()
            capture('send-preview')
            send_preview(page,guard)
            capture('dynamic-question')
            guide_action(page,'correct').first.click()
            page.locator('#guide-correction').fill('まだ職業は決めていない。授業と仕事の具体例を知りたい。')
            capture('correction')
            page.locator('#guide-correction-form button[type=submit]').click()
            guide_action(page,'prepare-routes').click()
            send_preview(page,guard,to_map=True)
            expect(page.locator('.finder-route-card')).to_have_count(2)
            capture('attention')
            for node_id in ['route-work','route-university']:
                finder_action(page,'route-keep',node_id).click()
                finder_action(page,'route-compare',node_id).click()
            finder_action(page,'compare').click()
            expect(page.locator('.atlas-compare-row')).to_have_count(8)
            comparison_heading_clear_of_sticky(page)
            capture('comparison')
            finder_view(page,'all').click()
            # The whole view may retain comparison until the explicit overview.
            if page.locator('.atlas-card-grid > .atlas-card').count()!=7:
                page.locator('[data-atlas-action="overview"]').first.click()
            expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
            capture('whole-map')
            finder_view(page,'unopened').click()
            expect(page.locator('#finder-attention-title')).to_have_text('まだ開いていない方向')
            capture('unopened')
            finder_action(page,'record').first.click()
            page.locator('#finder-notes').fill('比べてから、先生に質問する。')
            page.locator('#finder-next-actions').fill('次の面談までに授業の説明を二つ読む。')
            capture('record')
            save_preview(page)
            capture('save-preview')
            assert len(guard.posts)==2
            results.append({'width':width,'screenshots':11,'overflow':False,'comparable_entry_dimensions':True,'touch_context':width in(768,1024)})
    return results


def touch_keyboard_security(browser,engine):
    with page_fixture(browser,width=768,touch=True) as (page,guard):
        page.goto(BASE+'/')
        page.locator('.home-finder-start').tap()
        expect(page.locator('#guide-capability')).to_contain_text('毎回')
        guide_action(page,'unknown').tap()
        page.locator('#guide-consent').tap()
        guide_action(page,'send').tap()
        expect(page.locator('#guide-answer-form legend')).to_have_text('学ぶ内容と普段の生活、今はどちらを詳しく見たい？')
        page.locator('[data-guide-choice]').first.tap()
        expect(page.locator('[data-guide-choice]').first).to_have_attribute('aria-pressed','true')
        guide_action(page,'map').tap()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        no_overflow(page,(engine,'touch768'))
        page.screenshot(path=str(OUTPUT/f'{engine}-touch768-whole-map.png'))
        assert len(guard.posts)==1
    with page_fixture(browser) as (page,guard):
        page.goto(BASE+'/')
        page.keyboard.press('Tab')
        expect(page.locator('.skip')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main')).to_be_focused()
        page.locator('.home-finder-start').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#guide-title')).to_be_visible()
        expect(page.locator('.desk-nav a[href="#/finder"]')).to_have_attribute('aria-current','page')
        choice=page.locator('[data-guide-choice]').first
        choice.focus()
        page.keyboard.press('Enter')
        expect(choice).to_have_attribute('aria-pressed','true')
        attack='<img src=x onerror="window.__guidedInjected=true">文字として扱う架空の入力。'
        guide_answer(page).fill(attack)
        page.locator('#guide-answer-form button[type=submit]').click()
        body=json.loads(page.locator('#guide-send-preview').text_content())
        guard.payload=guide_fixture(body)
        guard.payload['question']['text']=attack
        guard.payload['statements'][0]['text']='<svg onload="window.__guidedInjected=true">AIの解釈という文字列。'
        send_preview(page,guard)
        expect(page.locator('#guide-answer-form legend')).to_have_text(attack)
        expect(page.locator('.guide-paper img,.guide-paper svg,.guide-paper script')).to_have_count(0)
        assert not page.evaluate('Boolean(window.__guidedInjected)')
        expect(page.locator('#guide-title')).to_be_focused()
        return {'ipad_sized_touch_question_choice_map':True,'keyboard_skip_current_focus_choice':True,'input_and_ai_output_xss_escaped':True}


def retained_pages_review(browser,engine):
    with page_fixture(browser,configured=False) as (page,guard):
        page.goto(BASE+'/#/finder?demo=subjects')
        expect(page.locator('.rd-route-card')).to_have_count(3)
        expect(page.locator('.rd-source-note')).to_contain_text('固定デモ')
        page.goto(BASE+'/#/cases')
        expect(page.locator('.student-case')).to_have_count(12)
        page.goto(BASE+'/#/research')
        chapters=page.locator('[data-research-chapter]')
        expect(chapters).to_have_count(13)
        for chapter in chapters.all():
            if not chapter.evaluate('(el)=>el.open'):
                chapter.locator('summary').click()
            expect(chapter).to_have_attribute('open','')
            assert len(chapter.inner_text())>120
            chapter.locator('summary').click()
        page.goto(BASE+'/#/archive')
        expect(page.locator('.archive-item')).to_have_count(4)
        for item in page.locator('.archive-item').all():
            expect(item.locator('dl').first).to_be_visible()
        assert {link.get_attribute('href') for link in page.locator('.archive-original-preview').all()}=={'/original.html','/reschool.html'}
        page.goto(BASE+'/original.html')
        expect(page.get_by_role('heading',name='卒業の、その続きを。')).to_be_visible()
        assert page.locator('.app').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(242, 239, 231)'
        page.screenshot(path=str(OUTPUT/f'{engine}-v1-retained.png'))
        page.goto(BASE+'/reschool.html#/paths')
        assert page.locator('.path-card').count()>=10
        page.screenshot(path=str(OUTPUT/f'{engine}-pathmap-retained.png'))
        assert not guard.posts
        return {'legacy_fixed_demo':True,'cases':12,'research_chapters':13,'archive_items':4,'old_designs':2}


def main():
    research_unchanged()
    audit={}
    with sync_playwright() as playwright:
        for engine in ['chromium','webkit']:
            options={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {'executable_path':'/workspace/webkit-runtime/run-webkit.sh'}
            browser=getattr(playwright,engine).launch(**options)
            try:
                print(engine,'adaptive questions/explanation/correction/routes/compare/JSON',flush=True)
                audit[engine]={'journey':full_journey(browser,engine)}
                print(engine,'unknown/different/skip/map',flush=True)
                audit[engine]['unanswered_choices']=unknown_different_skip_early_map(browser,engine)
                print(engine,'unconfigured/errors/timeout/stale/drafts',flush=True)
                audit[engine]['failure_and_stale']=failure_and_stale_review(browser,engine)
                print(engine,'AI compare/trial/summary/explanation-only',flush=True)
                audit[engine]['explicit_actions']=explicit_guide_actions(browser,engine)
                print(engine,'suspended next-question draft / optional Tree handoff',flush=True)
                audit[engine]['suspended_draft']=suspended_draft_review(browser,engine)
                audit[engine]['tree_handoff']=optional_tree_handoff_review(browser,engine)
                print(engine,'fivewidthscreens',flush=True)
                audit[engine]['responsive']=responsive_review(browser,engine)
                print(engine,'touch/keyboard/XSS and retained pages',flush=True)
                audit[engine]['input_security']=touch_keyboard_security(browser,engine)
                audit[engine]['retained']=retained_pages_review(browser,engine)
            finally:
                browser.close()
            (OUTPUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    research_unchanged()
    print(json.dumps(audit,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
