"""Phase 4 route discovery: mocked AI, demos, comparison and optional Tree.

Run against PATH_MAP_OFFLINE=1. Every provider request is intercepted here; the
test never calls a paid API, deploys, or persists a student's consultation.
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import tomllib
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('PHASE4_BASE_URL', 'http://localhost:8002').rstrip('/')
OUTPUT = Path(os.environ.get('PHASE4_SCREENSHOT_DIR', '/workspace/reschool-phase4-review/after'))
OUTPUT.mkdir(parents=True, exist_ok=True)
ORIGIN = urlparse(BASE).netloc
CSP = tomllib.loads((ROOT / 'netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
RESEARCH_HASHES = {
    'src/research-data.js': '9e2ad14e49a46b6d7a152c747f6541b4e2c01875e6ddd2b545d38d36eab762b4',
    'src/research-report.js': '6ed6b2933425512f545a0682a93454d4dc997b9bfd5337acdaed1063a4b1526c',
}
DECISION = {'accept': True}


def route_fixture(route_id, title):
    return {
        'id': route_id,
        'title': title,
        'description': '授業や活動の内容を、公開資料と小さな体験で比べる方向です。',
        'reason': '相談で挙げられた関心を、まだ一つに決めず調べるための案です。',
        'examples': ['授業の説明を二つ読む', '先生に、違いを確かめる質問をする'],
        'conditions': ['履修条件、費用、時間は学校や公式資料で確認する'],
        'unknowns': ['実際の制度、参加先、本人の希望との重なりは未確認'],
        'next_step': '二つの説明を読み、分かったことと質問を分けてメモする。',
        'status': 'check_conditions',
    }


def result_fixture(request):
    intent = request['intent']
    if intent == 'discover':
        routes = [
            route_fixture('mock-study', '授業の内容から比べる'),
            route_fixture('mock-try', '短い体験から確かめる'),
            route_fixture('mock-ask', '先生と条件を整理する'),
        ]
    elif intent == 'expand':
        parent = request['route']['id']
        routes = [
            route_fixture(parent + '-read', '資料を読んで違いを比べる'),
            route_fixture(parent + '-try', '小さく試して疑問を残す'),
            route_fixture(parent + '-ask', '質問を用意して相談する'),
        ]
    else:
        routes = []
    return {
        'summary': '検証用の架空のAI応答です。候補の並び順は優劣や適性を示しません。',
        'answer': 'この点は未確認です。公式資料と先生への質問に分けて確かめられます。' if intent == 'ask' else '',
        'routes': routes,
    }


class DiscoveryMock:
    def __init__(self, configured=True):
        self.configured = configured
        self.behavior = 'success'
        self.posts = []
        self.held = []
        self.offsite = []
        self.unexpected_posts = []
        self.payload = None
        self.tree_configured = False
        self.tree_response = None
        self.tree_posts = []

    def respond(self, route, body, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(body, ensure_ascii=False))

    def handle(self, route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != ORIGIN:
            self.offsite.append(request.url)
            route.abort()
            return
        if parsed.path == '/.netlify/functions/discover-routes':
            if request.method == 'GET':
                self.respond(route, {'configured': self.configured, 'browsing': False})
                return
            if request.method == 'POST':
                body = request.post_data_json
                self.posts.append(body)
                expected = {
                    'discover': {'intent', 'consultation'},
                    'expand': {'intent', 'consultation', 'route', 'trail'},
                    'ask': {'intent', 'consultation', 'route', 'trail', 'question'},
                }
                assert set(body) == expected[body['intent']], body
                assert set(body['consultation']) == {'topic', 'wish', 'situation', 'conditions'}
                if self.behavior == 'hold':
                    self.held.append((route, body))
                    return
                if self.behavior == 'error':
                    self.respond(route, {'error': '検証用：接続先でエラーが発生しました。'}, 502)
                elif self.behavior == 'malformed':
                    self.respond(route, {'summary': '形が不正な検証応答', 'answer': '', 'routes': []})
                elif self.behavior == 'unavailable':
                    self.respond(route, {'error': 'AI接続は未設定です。', 'code': 'NOT_CONFIGURED'}, 503)
                else:
                    self.respond(route, self.payload or result_fixture(body))
                return
        if parsed.path == '/.netlify/functions/generate-tree' and self.tree_configured:
            if request.method == 'GET':
                self.respond(route, {'configured': True})
                return
            if request.method == 'POST' and self.tree_response:
                body=request.post_data_json
                assert set(body)=={'memo'} and isinstance(body['memo'],str)
                self.tree_posts.append(body)
                self.respond(route,self.tree_response)
                return
        if parsed.path.startswith('/.netlify/functions/') and request.method == 'GET':
            self.respond(route, {'configured': False})
            return
        if request.method != 'GET':
            self.unexpected_posts.append({'url': request.url, 'method': request.method})
            route.abort()
            return
        response = route.fetch()
        route.fulfill(response=response, headers={**response.headers, 'content-security-policy': CSP})

    def release(self):
        held, self.held = self.held, []
        for route, body in held:
            try:
                self.respond(route, result_fixture(body))
            except Exception:
                # The browser may already have aborted its request on cancel.
                pass

    def assert_safe(self):
        assert not self.offsite and not self.unexpected_posts, (self.offsite, self.unexpected_posts)


@contextmanager
def page_fixture(browser, *, configured=True, width=1024, touch=False):
    context = browser.new_context(viewport={'width': width, 'height': 1000},
                                  accept_downloads=True, has_touch=touch, reduced_motion='reduce')
    context.add_init_script('''
        window.__nativeLocal=window.localStorage;
        window.__nativeSession=window.sessionStorage;
        window.__csp=[];
        document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));
    ''')
    mock = DiscoveryMock(configured)
    context.route('**/*', mock.handle)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept() if DECISION['accept'] else dialog.dismiss())
    try:
        yield page, mock
        assert not errors, errors
        mock.assert_safe()
        assert page.evaluate('window.__nativeLocal.length+window.__nativeSession.length') == 0
        assert context.cookies() == []
        assert not page.evaluate('window.__csp'), page.evaluate('window.__csp')
    except Exception:
        page.screenshot(path=str(OUTPUT / 'failure.png'))
        print('FAILED AT', page.url)
        raise
    finally:
        mock.release()
        context.unroute_all(behavior='wait')
        context.close()


def open_details(locator):
    for details in locator.locator('xpath=ancestor::details[not(@open)]').all():
        details.locator('summary').first.click()


def no_overflow(page, label):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), label


def assert_research_unchanged():
    for filename, expected in RESEARCH_HASHES.items():
        assert hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() == expected, filename


def action(page, name, key=None):
    selector = f'.route-discovery [data-rd-action="{name}"]'
    if key is not None:
        selector += f'[data-rd-route="{key}"]'
    return page.locator(selector)


def fill_consultation(page, mock, topic='subjects'):
    page.goto(BASE + '/')
    page.locator('.home-finder-start').click()
    expect(page.locator('[data-rd-step="1"]')).to_be_visible()
    page.locator(f'[data-rd-topic="{topic}"]').click()
    action(page, 'next').click()
    expect(page.locator('[data-rd-step="2"]')).to_be_visible()
    page.locator('#rd-wish').fill('数学と文章を読むことの両方を学ぶ方法を知りたい。')
    page.locator('#rd-situation').fill('架空の高校生の検証メモ。まだ文理を決めていない。')
    action(page, 'next').click()
    expect(page.locator('[data-rd-step="3"]')).to_be_visible()
    page.locator('[data-rd-condition="2"]').check()
    page.locator('#rd-conditions').fill('移動や費用も比べたい。')
    assert not mock.posts
    return page.locator('#rd-wish')


def discover(page, mock):
    expect(action(page, 'discover')).to_be_disabled()
    expect(page.locator('#rd-consent')).to_be_enabled()
    page.locator('#rd-consent').check()
    expect(action(page, 'discover')).to_be_enabled()
    action(page, 'discover').click()
    expect(page.locator('.rd-route-card')).to_have_count(3)
    expect(page.locator('.rd-source-note')).to_contain_text('AIからの提案')


def reveal_children(page, mock):
    before = len(mock.posts)
    action(page, 'expand').click()
    expect(page.locator('#rd-ai-panel')).to_be_visible()
    expect(page.locator('#rd-panel-consent')).not_to_be_checked()
    expect(action(page, 'send-panel')).to_be_disabled()
    assert len(mock.posts) == before
    page.locator('#rd-panel-consent').check()
    action(page, 'send-panel').click()
    expect(page.locator('.rd-children .rd-route-card')).to_have_count(3)
    assert len(mock.posts) == before + 1


def select_first(page, scope='.rd-route-grid'):
    option = page.locator(scope + ' [data-rd-action="select"]').first
    key = option.get_attribute('data-rd-route')
    title = option.locator('h3').inner_text()
    option.click()
    expect(page.locator('#rd-view-title')).to_have_text(title)
    return key, title


def keep_comparison(page):
    keys = action(page, 'compare').evaluate_all('els=>els.map(el=>el.dataset.rdRoute)')[:3]
    assert len(keys) == 3
    for key in keys[:2]:
        action(page, 'compare', key).click()
        expect(action(page, 'compare', key)).to_have_attribute('aria-pressed', 'true')
    action(page, 'compare', keys[2]).click()
    expect(page.locator('#rd-error')).to_contain_text('2つまで')
    expect(action(page, 'compare', keys[2])).to_have_attribute('aria-pressed', 'false')
    action(page, 'show-compare').click()
    expect(page.locator('.rd-compare-heading > article')).to_have_count(2)
    expect(page.locator('.rd-compare-row')).to_have_count(6)
    for label in ['確認したい条件', 'まだ分からないこと', '次にできること']:
        expect(page.locator('.rd-comparison')).to_contain_text(label)
    for key in keys[:2]:
        action(page, 'keep', key).click()
        expect(action(page, 'keep', key)).to_have_attribute('aria-pressed', 'true')
    action(page, 'show-kept').click()
    expect(page.locator('.rd-comparison > article')).to_have_count(2)
    return keys[:2]


def transfer(page):
    button = action(page, 'transfer')
    open_details(button)
    button.click()
    expect(page.locator('h1:visible')).to_have_text('RE:Treeで整理する')
    expect(page.locator('.tree-node')).not_to_have_count(0)


def close_tree_detail(page):
    if page.locator('#node-detail').get_attribute('data-open') == 'true':
        page.locator('#node-detail [data-tree-go=tree-container]').click()


def full_journey(browser, engine):
    with page_fixture(browser) as (page, mock):
        fill_consultation(page, mock)
        page.locator('#rd-consent').check()
        page.locator('#rd-conditions').fill('移動・費用と、授業の内容を比べたい。')
        expect(page.locator('#rd-consent')).not_to_be_checked()
        discover(page, mock)
        assert mock.posts[0]['intent'] == 'discover'
        assert mock.posts[0]['consultation']['conditions'].endswith('授業の内容を比べたい。')
        page.screenshot(path=str(OUTPUT / f'{engine}-ai-directions.png'))
        root_key, root_title = select_first(page)
        for depth in [1, 2]:
            reveal_children(page, mock)
            select_first(page, '.rd-children')
            expect(action(page, 'breadcrumb')).to_have_count(depth + 1)
        page.screenshot(path=str(OUTPUT / f'{engine}-deep-detail.png'))
        action(page, 'prepare-ai').click()
        page.locator('input[name="rd-intent"][value="ask"]').check()
        page.locator('#rd-question').fill('二つの方向で、普段することはどう違う？')
        page.locator('#rd-panel-consent').check()
        page.locator('#rd-question').fill('授業で取り組む作業は、どう違う？')
        expect(page.locator('#rd-panel-consent')).not_to_be_checked()
        page.locator('#rd-panel-consent').check()
        action(page, 'send-panel').click()
        expect(page.locator('.rd-answer')).to_contain_text('この点は未確認です')
        assert [post['intent'] for post in mock.posts] == ['discover', 'expand', 'expand', 'ask']
        assert len(mock.posts[-1]['trail']) == 3
        action(page, 'back-view').first.click()
        expect(action(page, 'breadcrumb')).to_have_count(2)
        action(page, 'breadcrumb', root_key).click()
        expect(page.locator('#rd-view-title')).to_have_text(root_title)
        expect(action(page, 'breadcrumb')).to_have_count(1)
        action(page, 'results').click()
        keep_comparison(page)
        page.screenshot(path=str(OUTPUT / f'{engine}-kept-comparison.png'))

        # Browsing the Home page must not clear accepted results or the draft.
        page.locator('.desk-nav a[href="#/"]').click()
        page.locator('.desk-nav a[href="#/finder"]').click()
        expect(page.locator('#rd-view-title')).to_have_text('残している候補')
        expect(page.locator('.rd-comparison > article')).to_have_count(2)
        action(page, 'edit-consultation').click()
        expect(page.locator('#rd-conditions')).to_have_value('移動・費用と、授業の内容を比べたい。')
        action(page, 'back-step').click()
        expect(page.locator('#rd-wish')).to_have_value('数学と文章を読むことの両方を学ぶ方法を知りたい。')
        action(page, 'resume').click()
        action(page, 'show-kept').click()
        transfer(page)
        expect(page.locator('.tree-node')).to_have_count(13)
        page.locator('.student-overview-center [data-open-node=root]').click()
        expect(page.locator('#node-detail')).to_be_visible()
        page.locator('[data-edit-start]').click()
        page.locator('#edit-label').fill('二つの方向の授業と条件を、自分で比べてみたい')
        page.locator('#node-edit-form button[type=submit]').click()
        close_tree_detail(page)
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        raw = Path(downloaded.value.path()).read_text()
        saved = json.loads(raw)
        assert saved['tree']['core_question'] == '二つの方向の授業と条件を、自分で比べてみたい'
        assert saved['nodeOrigins']['root'] == 'user_edited'
        assert 'consultation' not in saved and 'memo' not in saved and 'context' not in saved
        (OUTPUT / f'{engine}-handoff-map.json').write_text(raw)
        page.screenshot(path=str(OUTPUT / f'{engine}-optional-tree.png'))

        # A later handoff must ask before replacing an edited Tree.
        page.locator('.desk-nav a[href="#/finder"]').click()
        expect(page.locator('#rd-view-title')).to_have_text('残している候補')
        DECISION['accept'] = False
        button = action(page, 'transfer')
        open_details(button)
        button.click()
        expect(page.locator('#rd-status')).to_contain_text('取り消しました')
        assert page.evaluate('location.hash') == '#/finder'
        DECISION['accept'] = True
        page.locator('.tree-entry-link').click()
        expect(page.locator('[data-node=root]')).to_contain_text('自分で比べてみたい')
        page.reload()
        expect(page.locator('.tree-node')).to_have_count(0)
        page.locator('#import-tree').set_input_files({'name':'routes.json', 'mimeType':'application/json', 'buffer':raw.encode()})
        expect(page.locator('#file-status')).to_contain_text('復元しました')
        expect(page.locator('.tree-node')).to_have_count(13)
        for position in saved['positions']:
            style = page.locator(f'[data-node="{position["id"]}"]').get_attribute('style')
            assert f'left:{position["x"]}px' in style and f'top:{position["y"]}px' in style
        page.locator('#import-tree').set_input_files({'name':'unsafe.json','mimeType':'application/json','buffer':b'{"__proto__":{"unsafe":true}}'})
        expect(page.locator('#file-status')).to_contain_text('変更していません')
        expect(page.locator('.tree-node')).to_have_count(13)
        page.screenshot(path=str(OUTPUT / f'{engine}-restored-tree.png'))
        return {'ai_intents': ['discover','expand','expand','ask'], 'depth':3, 'compare_keep':2,
                'home_draft_results_preserved':True, 'tree_handoff_edit_json':True,
                'tree_replacement_cancelled_safely':True, 'invalid_json_preserved_work':True}


def demo_review(browser, engine):
    reviewed = []
    with page_fixture(browser, configured=False) as (page, mock):
        for demo in ['subjects', 'university', 'undecided', 'activities']:
            page.goto(BASE + '/')
            page.locator(f'.home-route-demo[data-home-demo="{demo}"]').click()
            expect(page.locator('.rd-route-grid > .rd-route-card')).to_have_count(3)
            expect(page.locator('.rd-route-grid .rd-route-open h3').first).to_be_in_viewport()
            expect(page.locator('.rd-source-note')).to_contain_text('固定デモ・架空')
            expect(page.locator('.rd-source-note')).to_contain_text('分析したデモではありません')
            key, title = select_first(page)
            expect(action(page, 'prepare-ai')).to_be_disabled()
            for depth in [1, 2, 3]:
                action(page, 'expand').click()
                expect(page.locator('.rd-children .rd-route-card')).to_have_count(2)
                select_first(page, '.rd-children')
                expect(action(page, 'breadcrumb')).to_have_count(depth + 1)
            assert '次にできること' in page.locator('.rd-detail').inner_text()
            action(page, 'breadcrumb', key).click()
            expect(page.locator('#rd-view-title')).to_have_text(title)
            action(page, 'results').click()
            keep_comparison(page)
            transfer(page)
            expect(page.locator('.tree-node')).to_have_count(13)
            expect(page.locator('#generate')).to_be_disabled()
            assert not mock.posts
            reviewed.append(demo)
        return {'offline_demos': reviewed, 'each_depth': 4, 'comparison_keep_and_optional_tree': True, 'posts': len(mock.posts)}


def failure_review(browser, engine):
    findings = {}
    with page_fixture(browser, configured=False) as (page, mock):
        fill_consultation(page, mock)
        expect(page.locator('#rd-consent')).to_be_disabled()
        expect(action(page, 'discover')).to_be_disabled()
        expect(page.locator('.rd-availability')).to_contain_text('AIは未接続')
        expect(page.locator('.rd-route-card')).to_have_count(0)
        assert not mock.posts
        findings['unconfigured_honestly_disabled'] = True
        mock.configured = True
        action(page, 'retry-capability').click()
        expect(page.locator('#rd-consent')).to_be_enabled()
        for behavior, message in [('error', '接続先'), ('malformed', '形式を確認'), ('unavailable', '未設定')]:
            mock.behavior = behavior
            page.locator('#rd-consent').check()
            action(page, 'discover').click()
            expect(page.locator('#rd-error')).to_contain_text(message)
            expect(page.locator('#rd-consent')).not_to_be_checked()
            expect(action(page, 'discover')).to_be_disabled()
            expect(page.locator('.rd-route-card')).to_have_count(0)
            expect(page.locator('#rd-conditions')).to_have_value('移動や費用も比べたい。')
        findings['errors_consume_consent_preserve_draft_no_fake_results'] = True

    with page_fixture(browser) as (page, mock):
        fill_consultation(page, mock)
        discover(page, mock)
        action(page, 'edit-consultation').click()
        mock.behavior = 'error'
        page.locator('#rd-consent').check()
        action(page, 'discover').click()
        expect(page.locator('#rd-error')).to_contain_text('接続先')
        action(page, 'resume').click()
        expect(page.locator('.rd-route-card')).to_have_count(3)
        select_first(page)
        action(page, 'expand').click()
        page.locator('#rd-panel-consent').check()
        action(page, 'send-panel').click()
        expect(page.locator('#rd-error')).to_contain_text('接続先')
        expect(page.locator('#rd-panel-consent')).not_to_be_checked()
        expect(action(page, 'send-panel')).to_be_disabled()
        expect(page.locator('.rd-children')).to_have_count(0)
        findings['failed_regeneration_and_expansion_keep_accepted_work'] = True

    # Held responses never reach a provider. Virtual time exercises the real
    # timeout without blocking the review for a minute.
    with page_fixture(browser) as (page, mock):
        fill_consultation(page, mock)
        page.clock.install()
        mock.behavior = 'hold'
        page.locator('#rd-consent').check()
        action(page, 'discover').click()
        expect(action(page, 'cancel-ai')).to_be_visible()
        page.clock.fast_forward(56000)
        expect(page.locator('#rd-error')).to_contain_text('時間がかかっています')
        expect(page.locator('#rd-consent')).not_to_be_checked()
        expect(action(page, 'discover')).to_be_disabled()
        mock.release()
        expect(page.locator('.rd-route-card')).to_have_count(0)
        findings['timeout_preserves_draft_and_requires_new_consent'] = True

    with page_fixture(browser) as (page, mock):
        fill_consultation(page, mock)
        mock.behavior = 'hold'
        for change in ['condition', 'text', 'cancel', 'home']:
            page.locator('#rd-consent').check()
            action(page, 'discover').click()
            expect(action(page, 'cancel-ai')).to_be_visible()
            if change == 'condition':
                page.locator('[data-rd-condition="0"]').check()
            elif change == 'text':
                page.locator('#rd-conditions').fill('変更した条件は残し、前の返答は使わない。')
            elif change == 'cancel':
                action(page, 'cancel-ai').click()
            else:
                page.locator('.desk-nav a[href="#/"]').click()
                page.locator('.desk-nav a[href="#/finder"]').click()
            mock.release()
            expect(action(page, 'cancel-ai')).to_have_count(0)
            expect(page.locator('#rd-consent')).not_to_be_checked()
            expect(page.locator('.rd-route-card')).to_have_count(0)
        expect(page.locator('#rd-conditions')).to_have_value('変更した条件は残し、前の返答は使わない。')
        findings['stale_discover_after_condition_text_cancel_home_ignored'] = True

    with page_fixture(browser) as (page, mock):
        page.goto(BASE + '/#/finder?demo=subjects')
        select_first(page)
        action(page, 'prepare-ai').click()
        mock.behavior = 'hold'
        page.locator('#rd-panel-consent').check()
        action(page, 'send-panel').click()
        expect(action(page, 'cancel-ai')).to_be_visible()
        page.locator('input[name="rd-intent"][value="ask"]').check()
        mock.release()
        expect(action(page, 'cancel-ai')).to_have_count(0)
        expect(page.locator('#rd-question')).to_be_visible()
        expect(page.locator('#rd-panel-consent')).not_to_be_checked()
        expect(page.locator('.rd-children')).to_have_count(0)
        page.locator('#rd-question').fill('この候補で確認することは？')
        page.locator('#rd-panel-consent').check()
        action(page, 'send-panel').click()
        expect(action(page, 'cancel-ai')).to_be_visible()
        page.locator('.desk-nav a[href="#/"]').click()
        page.locator('.home-route-demo[data-home-demo="subjects"]').click()
        mock.release()
        expect(page.locator('.rd-route-grid > .rd-route-card')).to_have_count(3)
        expect(page.locator('.rd-source-note')).not_to_contain_text('AIの提案を追加')
        assert not page.locator('.rd-answer').count()
        findings['pending_intent_change_same_demo_return_ignored'] = True
    return findings


def mixed_origin_review(browser, engine):
    with page_fixture(browser) as (page, mock):
        page.goto(BASE + '/#/finder?demo=subjects')
        select_first(page)
        root_key = action(page, 'keep').first.get_attribute('data-rd-route')
        action(page, 'keep', root_key).click()
        action(page, 'prepare-ai').click()
        page.locator('#rd-panel-consent').check()
        action(page, 'send-panel').click()
        expect(page.locator('.rd-children .rd-route-card')).to_have_count(5)
        candidate=page.locator('.rd-children [data-rd-action=select]').nth(2)
        child_key=candidate.get_attribute('data-rd-route')
        candidate.click()
        expect(page.locator('.rd-origin').first).to_contain_text('AIからの提案')
        action(page, 'keep', child_key).click()
        action(page, 'show-kept').click()
        expect(page.locator('.rd-source-note')).to_contain_text('固定デモにAIの提案を追加')
        transfer(page)
        expect(page.locator('#tree-overview')).to_contain_text('固定デモとAI提案')
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        doc=json.loads(Path(downloaded.value.path()).read_text())
        sample_id, ai_id=[node['id'] for node in doc['tree']['nodes'] if node['type']=='project']
        for node in doc['tree']['nodes']:
            expected='sample' if node['id']==sample_id or node['parent']==sample_id else 'generated' if node['id']==ai_id or node['parent']==ai_id else 'manual'
            assert doc['nodeOrigins'][node['id']]==expected, (node['id'], doc['nodeOrigins'])
        page.locator(f'.student-main-branches [data-open-node="{ai_id}"]').click()
        page.locator('[data-edit-start]').click()
        page.locator('#edit-label').fill('AIの案を読んで、自分の疑問に書き換える')
        page.locator('#node-edit-form button[type=submit]').click()
        close_tree_detail(page)
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        raw=Path(downloaded.value.path()).read_text()
        edited=json.loads(raw)
        assert edited['nodeOrigins'][ai_id]=='user_edited'
        assert set(edited['nodeOrigins'].values())=={'sample','generated','manual','user_edited'}
        page.reload()
        page.locator('#import-tree').set_input_files({'name':'mixed.json','mimeType':'application/json','buffer':raw.encode()})
        expect(page.locator('#file-status')).to_contain_text('復元しました')
        expect(page.locator(f'[data-node="{ai_id}"]')).to_have_attribute('data-origin','user_edited')
        expect(page.locator(f'[data-node="{sample_id}"]')).to_have_attribute('data-origin','sample')
        assert len(mock.posts)==1
        return {'demo_ai_manual_user_edited_distinct':True,'round_trip':True}


def touch_and_injection_review(browser, engine):
    with page_fixture(browser, configured=False, width=768, touch=True) as (page, mock):
        page.goto(BASE+'/')
        page.locator('.home-route-demo[data-home-demo="subjects"]').tap()
        expect(page.locator('.rd-route-card')).to_have_count(3)
        action(page,'select').first.tap()
        action(page,'expand').tap()
        page.locator('.rd-children [data-rd-action=select]').first.tap()
        expect(action(page,'breadcrumb')).to_have_count(2)
        action(page,'results').tap()
        keys=action(page,'compare').evaluate_all('els=>els.slice(0,2).map(el=>el.dataset.rdRoute)')
        for key in keys:
            action(page,'compare',key).tap()
        action(page,'show-compare').tap()
        expect(page.locator('.rd-compare-row')).to_have_count(6)
        no_overflow(page,(engine,'touch768'))
        page.screenshot(path=str(OUTPUT/f'{engine}-touch768-comparison.png'))
        assert not mock.posts
    with page_fixture(browser) as (page, mock):
        fill_consultation(page,mock)
        mock.payload=result_fixture({'intent':'discover'})
        malicious='<img src=x onerror="window.__injected=true">'
        mock.payload['routes'][0]['title']=malicious
        mock.payload['routes'][0]['unknowns']=['</dd><script>window.__injected=true</script>']
        discover(page,mock)
        expect(page.locator('.rd-route-card h3').first).to_have_text(malicious)
        expect(page.locator('.rd-route-card img,.rd-route-card script')).to_have_count(0)
        select_first(page)
        expect(page.locator('.rd-detail img,.rd-detail script')).to_have_count(0)
        assert not page.evaluate('Boolean(window.__injected)')
        no_overflow(page,(engine,'escapedAIoutput'))
    return {'ipad_sized_taps_depth_compare':True,'html_in_ai_output_escaped':True}


def mixed_origin_undo_review(browser, engine):
    with page_fixture(browser) as (page,mock):
        mock.tree_configured=True
        page.goto(BASE+'/#/finder?demo=subjects')
        select_first(page)
        action(page,'keep').first.click()
        action(page,'prepare-ai').click()
        page.locator('#rd-panel-consent').check()
        action(page,'send-panel').click()
        expect(page.locator('.rd-children .rd-route-card')).to_have_count(5)
        page.locator('.rd-children [data-rd-action=select]').nth(2).click()
        action(page,'keep').first.click()
        action(page,'show-kept').click()
        transfer(page)
        expect(page.locator('#tree-overview')).to_contain_text('固定デモとAI提案')
        expect(page.locator('#today-summary')).to_contain_text('架空デモとAI提案')
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        original=json.loads(Path(downloaded.value.path()).read_text())
        # Reuse a known valid shape; only mocked content changes. No provider is called.
        mock.tree_response=json.loads(json.dumps(original['tree']))
        mock.tree_response['core_question']='AIが再整理した問い（検証用）'
        for node in mock.tree_response['nodes']:
            if node['parent'] is None:
                node['label']=mock.tree_response['core_question']
        memo=page.locator('#memo')
        open_details(memo)
        memo.fill('検証用の架空メモ。条件と授業の違いをもう一度整理したい。')
        open_details(page.locator('#send-consent'))
        page.locator('#send-consent').check()
        page.locator('#generate').click()
        expect(page.locator('#generation-review')).to_be_visible()
        expect(page.locator('#tree-overview')).to_contain_text('固定デモとAI提案')
        page.locator('[data-generation-accept]').click()
        expect(page.locator('#tree-overview')).to_contain_text('AIが再整理した問い')
        expect(page.locator('#tree-overview')).not_to_contain_text('固定デモとAI提案')
        expect(page.locator('#today-summary')).to_contain_text('AIが作った地図')
        page.locator('#workspace-undo').click()
        expect(page.locator('#tree-overview')).to_contain_text('固定デモとAI提案')
        expect(page.locator('#today-summary')).to_contain_text('架空デモとAI提案')
        for node_id,origin in original['nodeOrigins'].items():
            expect(page.locator(f'[data-node="{node_id}"]')).to_have_attribute('data-origin',origin)
        with page.expect_download() as downloaded:
            page.locator('#export-tree').click()
        restored=json.loads(Path(downloaded.value.path()).read_text())
        assert restored['tree']==original['tree'] and restored['nodeOrigins']==original['nodeOrigins']
        assert len(mock.tree_posts)==1
        page.screenshot(path=str(OUTPUT/f'{engine}-mixed-generation-undo.png'))
        return {'approved_full_generation_then_undo_restores_tree':True,'mixed_overview_summary_and_node_origins':True}


def responsive_review(browser, engine):
    results = []
    for width in [320, 390, 768, 1024, 1440]:
        with page_fixture(browser, configured=False, width=width, touch=width in (768, 1024)) as (page, mock):
            def capture(name):
                no_overflow(page, (engine, width, name))
                page.screenshot(path=str(OUTPUT / f'{engine}-{width}-{name}.png'))

            page.goto(BASE + '/')
            expect(page.locator('.desk-nav a')).to_have_count(5)
            expect(page.locator('.home-discovery-topic')).to_have_count(6)
            expect(page.locator('.home-route-demo')).to_have_count(4)
            expect(page.locator('.home-finder-start')).to_be_in_viewport(ratio=.1)
            capture('home')
            page.locator('.home-discovery-topic[data-home-topic="subjects"]').click()
            expect(page.locator('[data-rd-step="1"]')).to_be_visible()
            expect(page.locator('[data-rd-topic="subjects"]')).to_have_attribute('aria-pressed', 'true')
            capture('consultation')
            action(page,'next').click()
            expect(page.locator('[data-rd-step="2"]')).to_be_visible()
            page.locator('#rd-wish').fill('文理を決める前に、学ぶことと選べる方向を比べたい。')
            capture('consultation-memo')
            action(page,'next').click()
            expect(page.locator('[data-rd-step="3"]')).to_be_visible()
            expect(action(page,'discover')).to_be_disabled()
            capture('consultation-conditions')
            page.locator('[data-rd-demo="subjects"]').click()
            expect(page.locator('.rd-route-card')).to_have_count(3)
            capture('directions')
            select_first(page)
            capture('detail')
            action(page, 'expand').click()
            expect(page.locator('.rd-children .rd-route-card')).to_have_count(2)
            select_first(page, '.rd-children')
            expect(action(page, 'breadcrumb')).to_have_count(2)
            capture('deep-detail')
            action(page, 'results').click()
            for button in action(page, 'compare').all()[:2]:
                key=button.get_attribute('data-rd-route')
                action(page, 'compare', key).click()
            action(page, 'show-compare').click()
            expect(page.locator('.rd-compare-heading > article')).to_have_count(2)
            expect(page.locator('.rd-compare-row')).to_have_count(6)
            capture('comparison')
            for row in page.locator('.rd-compare-row').all():
                assert row.locator('article').count() == 2
            action(page, 'keep').first.click()
            action(page, 'show-kept').click()
            transfer(page)
            expect(page.locator('.tree-node')).to_have_count(7)
            capture('optional-tree')

            page.goto(BASE + '/#/cases')
            expect(page.locator('.student-case')).to_have_count(12)
            assert '架空' in page.locator('main').inner_text()
            capture('cases')
            page.locator('.student-case').first.locator('a[href*="#/tree?sample="]').click()
            expect(page.locator('.tree-node')).not_to_have_count(0)
            expect(page.locator('#generate')).to_be_disabled()

            page.goto(BASE + '/#/research')
            chapters=page.locator('[data-research-chapter]')
            expect(chapters).to_have_count(13)
            for chapter in chapters.all():
                if not chapter.evaluate('(el)=>el.open'):
                    chapter.locator('summary').click()
                expect(chapter).to_have_attribute('open', '')
                assert len(chapter.inner_text()) > 120
                no_overflow(page, chapter.get_attribute('data-research-chapter'))
                chapter.locator('summary').click()
            page.evaluate('scrollTo(0,0)')
            capture('research')

            page.goto(BASE + '/#/archive')
            items=page.locator('.archive-item')
            expect(items).to_have_count(4)
            for item in items.all():
                expect(item.locator('dl').first).to_be_visible()
                assert '当時' in item.inner_text()
            expect(page.locator('.archive-original-preview')).to_have_count(2)
            assert {link.get_attribute('href') for link in page.locator('.archive-original-preview').all()} == {'/original.html','/reschool.html'}
            capture('archive')
            assert not mock.posts
            results.append({'width':width,'touch_context':width in (768,1024),'screenshots':12,'overflow':False})
    return results


def keyboard_archive_review(browser, engine):
    with page_fixture(browser, configured=False) as (page, mock):
        page.goto(BASE + '/')
        page.keyboard.press('Tab')
        expect(page.locator('.skip')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main')).to_be_focused()
        page.locator('.home-finder-start').focus()
        page.keyboard.press('Enter')
        expect(page.locator('.desk-nav a[href="#/finder"]')).to_have_attribute('aria-current','page')
        page.locator('[data-rd-topic="subjects"]').focus()
        page.keyboard.press('Enter')
        expect(action(page,'next')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#rd-view-title')).to_be_focused()
        expect(page.get_by_label('知りたいこと・やってみたいこと',exact=False)).to_be_visible()
        action(page,'next').focus()
        page.keyboard.press('Enter')
        page.locator('[data-rd-demo="subjects"]').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#rd-view-title')).to_be_focused()
        action(page,'select').first.focus()
        page.keyboard.press('Enter')
        expect(page.locator('#rd-view-title')).to_be_focused()
        expect(action(page,'breadcrumb').last).to_have_attribute('aria-current','page')
        action(page,'back-view').focus()
        page.keyboard.press('Enter')
        expect(page.locator('.rd-route-grid > .rd-route-card')).to_have_count(3)
        for old, current in [('paths','finder'),('choices','research'),('dashboard','archive')]:
            page.goto(BASE+'/#/'+old)
            expect(page.locator('.desk-nav a[aria-current=page]')).to_have_attribute('href','#/'+current)
        page.goto(BASE+'/original.html')
        expect(page.get_by_role('heading',name='卒業の、その続きを。')).to_be_visible()
        assert page.locator('.app').evaluate('(el)=>getComputedStyle(el).backgroundColor') == 'rgb(242, 239, 231)'
        page.screenshot(path=str(OUTPUT/f'{engine}-v1-retained.png'))
        page.goto(BASE+'/reschool.html#/paths')
        assert page.locator('.path-card').count() >= 10
        page.screenshot(path=str(OUTPUT/f'{engine}-pathmap-retained.png'))
        return {'keyboard_wizard_demo_detail_back':True,'focus_and_current':True,
                'legacy_routes':True,'v1_original_design':True,'pathmap_retained':True}


def main():
    assert_research_unchanged()
    audit = {}
    with sync_playwright() as playwright:
        for engine in ['chromium','webkit']:
            browser_type=getattr(playwright,engine)
            options={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {'executable_path':'/workspace/webkit-runtime/run-webkit.sh'}
            browser=browser_type.launch(**options)
            print(engine,'full journey',flush=True)
            try:
                audit[engine]={'journey':full_journey(browser,engine)}
                print(engine,'offline demos',flush=True)
                audit[engine]['demos']=demo_review(browser,engine)
                print(engine,'errors, timeout and stale requests',flush=True)
                audit[engine]['failure_recovery']=failure_review(browser,engine)
                print(engine,'mixed demo and AI provenance',flush=True)
                audit[engine]['mixed_origin']=mixed_origin_review(browser,engine)
                audit[engine]['touch_security']=touch_and_injection_review(browser,engine)
                audit[engine]['mixed_origin_undo']=mixed_origin_undo_review(browser,engine)
                print(engine,'responsive screenshots',flush=True)
                audit[engine]['responsive']=responsive_review(browser,engine)
                print(engine,'keyboard and archives',flush=True)
                audit[engine]['keyboard_archives']=keyboard_archive_review(browser,engine)
            finally:
                browser.close()
            (OUTPUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    assert_research_unchanged()
    print(json.dumps(audit,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
