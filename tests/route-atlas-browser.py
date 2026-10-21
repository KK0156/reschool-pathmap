"""Whole route atlas browser acceptance tests; local data and mocked AI only.

Run with PATH_MAP_OFFLINE=1 on port 8002. No provider is called, no student data
is used, and no changes are pushed or deployed by this test.
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
BASE = os.environ.get('ATLAS_BASE_URL', 'http://localhost:8002').rstrip('/')
OUTPUT = Path(os.environ.get('ATLAS_SCREENSHOT_DIR', '/workspace/reschool-atlas-review/after'))
OUTPUT.mkdir(parents=True, exist_ok=True)
ORIGIN = urlparse(BASE).netloc
CSP = tomllib.loads((ROOT / 'netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
RESEARCH_HASHES = {
    'src/research-data.js': '9e2ad14e49a46b6d7a152c747f6541b4e2c01875e6ddd2b545d38d36eab762b4',
    'src/research-report.js': '6ed6b2933425512f545a0682a93454d4dc997b9bfd5337acdaed1063a4b1526c',
}


def candidate(route_id, title):
    return {
        'id': route_id, 'title': title,
        'description': '就職・働きながら学ぶ・後から学び直す方向を比較する検証用の架空の案です。',
        'reason': 'AIが注目した一部の方向であり、全体マップや本人の適性を決めるものではありません。',
        'examples': ['公開資料を読む', '先生に条件を聞く'],
        'conditions': ['費用、時期、履修条件は未確認です。'],
        'unknowns': ['本人の参加資格や、実際の募集は未確認です。'],
        'next_step': '条件を確認するための質問を一つ用意する。',
        'status': 'check_conditions',
    }


class NetworkGuard:
    def __init__(self, configured=False):
        self.configured = configured
        self.posts = []
        self.function_gets = []
        self.external = []
        self.unexpected = []

    def handle(self, route):
        request=route.request
        parsed=urlparse(request.url)
        if parsed.netloc != ORIGIN:
            self.external.append(request.url)
            route.abort()
            return
        if parsed.path.startswith('/.netlify/functions/'):
            if request.method=='GET':
                self.function_gets.append(parsed.path)
                body={'configured':self.configured and parsed.path.endswith('/discover-routes'),'browsing':False}
                route.fulfill(content_type='application/json',body=json.dumps(body))
                return
            if request.method=='POST' and self.configured and parsed.path.endswith('/discover-routes'):
                body=request.post_data_json
                assert body['intent']=='discover' and set(body)=={'intent','consultation'}
                self.posts.append(body)
                response={'summary':'架空のAI応答です。全体の分類を狭めず、一部の方向を考えます。','answer':'','routes':[
                    candidate('mock-work','就職から考える'),
                    candidate('mock-work-study','働きながら学ぶ方法を調べる'),
                    candidate('mock-later','後から学び直す方向を残す'),
                ]}
                route.fulfill(content_type='application/json',body=json.dumps(response,ensure_ascii=False))
                return
            self.unexpected.append({'url':request.url,'method':request.method})
            route.abort()
            return
        if request.method!='GET':
            self.unexpected.append({'url':request.url,'method':request.method})
            route.abort()
            return
        response=route.fetch()
        route.fulfill(response=response,headers={**response.headers,'content-security-policy':CSP})


@contextmanager
def page_fixture(browser, *, width=1024, configured=False, touch=False):
    context=browser.new_context(viewport={'width':width,'height':1000},has_touch=touch,
                                accept_downloads=True,reduced_motion='reduce')
    context.add_init_script('''
        window.__atlasLocal=window.localStorage;
        window.__atlasSession=window.sessionStorage;
        window.__atlasCsp=[];
        document.addEventListener('securitypolicyviolation',e=>window.__atlasCsp.push(e.violatedDirective));
    ''')
    guard=NetworkGuard(configured)
    context.route('**/*',guard.handle)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:dialog.accept())
    try:
        yield page,guard
        assert not errors,errors
        assert not guard.external and not guard.unexpected,(guard.external,guard.unexpected)
        assert page.evaluate('window.__atlasLocal.length+window.__atlasSession.length')==0
        assert context.cookies()==[]
        assert not page.evaluate('window.__atlasCsp'),page.evaluate('window.__atlasCsp')
    except Exception:
        page.screenshot(path=str(OUTPUT/'failure.png'))
        print('FAILED AT',page.url)
        raise
    finally:
        context.unroute_all(behavior='wait')
        context.close()


def no_overflow(page,label):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),label


def research_unchanged():
    for filename,digest in RESEARCH_HASHES.items():
        assert hashlib.sha256((ROOT/filename).read_bytes()).hexdigest()==digest,filename


def open_disclosure(locator):
    for details in locator.locator('xpath=ancestor::details[not(@open)]').all():
        details.locator('summary').first.click()


def download_tree(page):
    with page.expect_download() as downloaded:
        page.locator('#export-tree').click()
    return Path(downloaded.value.path()).read_text()


def close_tree_detail(page):
    if page.locator('#node-detail').get_attribute('data-open')=='true':
        page.locator('#node-detail [data-tree-go=tree-container]').click()


def atlas_action(page, action, node=None):
    selector=f'.route-atlas [data-atlas-action="{action}"]'
    if node is not None:
        selector+=f'[data-atlas-node="{node}"]'
    return page.locator(selector)


def catalogue(page):
    return page.evaluate("async()=>structuredClone((await import('/src/route-atlas-data.js')).routeAtlas)")


def roots(page):
    return page.locator('.atlas-card-grid').first.locator(':scope > .atlas-card').evaluate_all('els=>els.map(el=>el.dataset.atlasCard)')


def open_map(page, guard):
    page.goto(BASE+'/')
    page.locator('.home-map-start').click()
    expect(page.locator('.route-atlas')).to_be_visible()
    expect(page.locator('[data-finder-mode="all"]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
    expect(page.locator('.atlas-card-open h3').first).to_be_in_viewport(ratio=.8)
    assert not page.locator('.rd-wizard:visible').count()
    assert not guard.posts and not guard.function_gets
    data=catalogue(page)
    first_lens=data['lenses'][0]
    assert len(first_lens['rootIds'])==7 and roots(page)==first_lens['rootIds']
    styles=page.locator('.atlas-card-open h3').evaluate_all('els=>els.map(el=>({font:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight,color:getComputedStyle(el).color}))')
    assert len({json.dumps(style,sort_keys=True) for style in styles})==1,'Seven routes must have neutral, consistent headings.'
    return data


def traverse(page, data, lens_id, path):
    page.locator(f'[data-atlas-lens="{lens_id}"]').click()
    by_id={node['id']:node for node in data['nodes']}
    for depth,node_id in enumerate(path):
        if depth:
            atlas_action(page,'children').click()
            button=page.locator(f'.atlas-children [data-atlas-action="node"][data-atlas-node="{node_id}"]')
        else:
            button=page.locator(f'.atlas-card-grid [data-atlas-action="node"][data-atlas-node="{node_id}"]')
        button.click()
        expect(page.locator('#atlas-title')).to_have_text(by_id[node_id]['title'])
        expect(atlas_action(page,'breadcrumb')).to_have_count(depth+1)
        expect(atlas_action(page,'breadcrumb').last).to_have_attribute('aria-current','page')
    assert len(path)>=3


def path_to_depth(data,start,depth=3):
    children={}
    for edge in data['edges']:
        if edge['type']=='contains':
            children.setdefault(edge['from'],[]).append(edge['to'])
    def search(path):
        if len(path)>=depth:
            return path
        for child in children.get(path[-1],[]):
            found=search(path+[child])
            if found:
                return found
        return None
    path=search([start])
    assert path,'Expected an actual 3-level path.'
    return path


def preferences_and_record(page,root_ids,record_id):
    prefs=page.locator('.atlas-preferences')
    if not prefs.evaluate('(el)=>el.open'):
        prefs.locator('summary').click()
    page.locator('#atlas-wish').fill('進学を決める前に、働くことと後から学ぶ方法を比べたい。')
    page.locator('[data-atlas-subject="1"]').check()
    page.locator('input[name="atlas-budget"][value="concern"]').check()
    page.locator('input[name="atlas-timing"][value="later"]').check()
    assert roots(page)==root_ids,'Conditions must never hide or reorder the seven routes.'
    atlas_action(page,'node',record_id).click()
    form=page.locator('#atlas-record-form')
    open_disclosure(form)
    page.locator('#atlas-record-state').select_option('constraint_recorded')
    page.locator('[data-atlas-action="save-record"]').click()
    expect(page.locator('#atlas-error')).to_contain_text('12文字以上')
    expect(page.locator('.atlas-record-saved')).to_have_count(0)
    page.locator('#atlas-record-note').fill('募集の時期と必要な書類について、学校で確認する必要があると分かった。')
    page.locator('[data-atlas-action="save-record"]').click()
    expect(page.locator('#atlas-error')).to_contain_text('参照URL')
    expect(page.locator('.atlas-record-saved')).to_have_count(0)
    page.locator('#atlas-record-source').fill('https://www.mext.go.jp/')
    page.locator('[data-atlas-action="save-record"]').click()
    expect(page.locator('.atlas-record-saved')).to_have_count(0)
    today=page.evaluate('new Date().toISOString().slice(0,10)')
    page.locator('#atlas-record-date').fill(today)
    page.locator('[data-atlas-action="save-record"]').click()
    expect(page.locator('#atlas-status')).to_contain_text('本人の確認メモ')
    expect(page.locator('#atlas-status')).to_contain_text('検証した表示ではありません')
    expect(page.locator('.atlas-record-saved')).to_contain_text('確認した制約（本人の記録）')
    atlas_action(page,'overview').first.click()
    assert roots(page)==root_ids
    expect(page.locator(f'[data-atlas-card="{record_id}"] .atlas-node-status')).to_contain_text('本人の記録')
    return today


def compare_keep(page,first,second):
    for node_id in [first,second]:
        atlas_action(page,'compare',node_id).click()
        expect(atlas_action(page,'compare',node_id)).to_have_attribute('aria-pressed','true')
        atlas_action(page,'keep',node_id).click()
    others=[node_id for node_id in roots(page) if node_id not in [first,second]]
    atlas_action(page,'compare',others[0]).click()
    expect(page.locator('#atlas-error')).to_contain_text('二つまで')
    expect(atlas_action(page,'compare',others[0])).to_have_attribute('aria-pressed','false')
    atlas_action(page,'show-compare').click()
    expect(page.locator('.atlas-compare-heading > article')).to_have_count(2)
    expect(page.locator('.atlas-compare-row')).to_have_count(8)
    for row in page.locator('.atlas-compare-row').all():
        expect(row.locator('article')).to_have_count(2)
        assert all(len(article.inner_text())>30 for article in row.locator('article').all())


def edit_save_restore(page,engine):
    transfer=atlas_action(page,'transfer')
    open_disclosure(transfer)
    transfer.click()
    expect(page.locator('h1:visible')).to_have_text('RE:Treeで整理する')
    expect(page.locator('.tree-node')).to_have_count(13)
    initial=json.loads(download_tree(page))
    assert set(initial['nodeOrigins'].values())=={'reference','manual'}
    assert initial['nodeOrigins']['root']=='manual'
    assert initial['nodeOrigins']['atlas-1-record']=='manual'
    assert initial['nodeOrigins']['atlas-2-record']=='reference'
    assert initial['provenance']['origin']=='reference'
    for node in initial['tree']['nodes']:
        assert '本人' in node['evidence']
        if initial['nodeOrigins'][node['id']]=='reference':
            assert '未確認' in node['evidence']
    assert '適格性を示すものではありません' in initial['tree']['nodes'][0]['evidence']
    assert '検証した記録ではありません' in next(node for node in initial['tree']['nodes'] if node['id']=='atlas-1-record')['evidence']
    page.locator('.student-overview-center [data-open-node=root]').click()
    page.locator('[data-edit-start]').click()
    page.locator('#edit-label').fill('働く道と、あとから学ぶ道を、自分で比較してみたい')
    page.locator('#node-edit-form button[type=submit]').click()
    close_tree_detail(page)
    raw=download_tree(page)
    edited=json.loads(raw)
    assert edited['nodeOrigins']['root']=='user_edited'
    assert set(edited['nodeOrigins'].values())=={'reference','manual','user_edited'}
    (OUTPUT/f'{engine}-atlas-map.json').write_text(raw)
    page.reload()
    expect(page.locator('.tree-node')).to_have_count(0)
    page.locator('#import-tree').set_input_files({'name':'atlas.json','mimeType':'application/json','buffer':raw.encode()})
    expect(page.locator('#file-status')).to_contain_text('復元しました')
    expect(page.locator('.tree-node')).to_have_count(13)
    for node_id,origin in edited['nodeOrigins'].items():
        expect(page.locator(f'[data-node="{node_id}"]')).to_have_attribute('data-origin',origin)
    for item in edited['positions']:
        style=page.locator(f'[data-node="{item["id"]}"]').get_attribute('style')
        assert f'left:{item["x"]}px' in style and f'top:{item["y"]}px' in style
    page.locator('#import-tree').set_input_files({'name':'unsafe.json','mimeType':'application/json','buffer':b'{"__proto__":{}}'})
    expect(page.locator('#file-status')).to_contain_text('変更していません')
    expect(page.locator('.tree-node')).to_have_count(13)
    # Existing tree-only JSON is still a supported import format.
    old=json.dumps(edited['tree'],ensure_ascii=False).encode()
    page.locator('#import-tree').set_input_files({'name':'older-tree.json','mimeType':'application/json','buffer':old})
    expect(page.locator('#file-status')).to_contain_text('復元しました')
    expect(page.locator('[data-node=root]')).to_contain_text('自分で比較')
    page.screenshot(path=str(OUTPUT/f'{engine}-reference-tree-restored.png'))


def whole_map_journey(browser,engine):
    with page_fixture(browser) as (page,guard):
        data=open_map(page,guard)
        root_ids=roots(page)
        nodes={node['id']:node for node in data['nodes']}
        work='route-work'
        assert work in root_ids
        later=next(node_id for node_id in root_ids if '学び直' in nodes[node_id]['title'] or '後から' in nodes[node_id]['title'])
        traverse(page,data,data['lenses'][0]['id'],path_to_depth(data,work))
        page.screenshot(path=str(OUTPUT/f'{engine}-three-level-route.png'))
        # Use a real published graph edge; do not infer a guaranteed transition.
        edges=[edge for edge in data['edges'] if edge['type']=='transition' and (edge['from']==work or edge['to']==work)]
        assert edges,'Working paths need visible later-study links.'
        atlas_action(page,'breadcrumb',work).click()
        edge=edges[0]
        target=edge['to'] if edge['from']==work else edge['from']
        expect(page.locator('.atlas-connections')).to_contain_text('条件')
        atlas_action(page,'connection',target).first.click()
        expect(page.locator('#atlas-title')).to_have_text(nodes[target]['title'])
        atlas_action(page,'back').click()
        expect(page.locator('#atlas-title')).to_have_text(nodes[work]['title'])
        atlas_action(page,'overview').first.click()
        assert roots(page)==root_ids
        expect(page.locator('.atlas-progress')).to_contain_text('まだ開いていない項目')
        expect(page.locator(f'[data-atlas-card="{work}"] .atlas-node-status')).to_contain_text('閲覧した項目')
        preferences_and_record(page,root_ids,work)
        compare_keep(page,work,later)
        page.screenshot(path=str(OUTPUT/f'{engine}-eight-facet-comparison.png'))
        edit_save_restore(page,engine)
        assert not guard.posts
        return {'immediate_neutral_roots':7,'ai_questions_before_map':0,'depth':3,
                'transition_back_and_overview':True,'preferences_never_hide_routes':True,
                'constraint_note_url_date_required':True,'self_report_not_eligibility':True,
                'comparison_facets':8,'reference_tree_edit_json_restore':True,'provider_posts':0}


def lenses_and_walkthroughs(browser,engine):
    with page_fixture(browser) as (page,guard):
        data=open_map(page,guard)
        expect(page.locator('.atlas-lenses button')).to_have_count(4)
        results=[]
        for lens in data['lenses']:
            page.locator(f'[data-atlas-lens="{lens["id"]}"]').click()
            expect(page.locator(f'[data-atlas-lens="{lens["id"]}"]')).to_have_attribute('aria-pressed','true')
            assert roots(page)==lens['rootIds']
            no_overflow(page,(engine,lens['id']))
        for demo in data['demos']:
            page.goto(BASE+'/')
            page.locator(f'.home-atlas-demo[data-home-map-demo="{demo["id"]}"]').click()
            expect(page.locator('.atlas-demo-notice')).to_be_visible()
            assert len(demo['path'])>=3
            expect(atlas_action(page,'breadcrumb')).to_have_count(1)
            for depth in range(1,len(demo['path'])):
                expect(atlas_action(page,'demo-next')).to_be_in_viewport(ratio=.8)
                atlas_action(page,'demo-next').click()
                expect(atlas_action(page,'breadcrumb')).to_have_count(depth+1)
            traverse(page,data,demo['lensId'],demo['path'])
            results.append(demo['id'])
        assert not guard.posts and not guard.function_gets
        return {'lenses':4,'walkthroughs_depth_at_least_three':results,'no_ai':True}


def ai_is_optional(browser,engine):
    with page_fixture(browser,configured=True) as (page,guard):
        data=open_map(page,guard)
        root_ids=roots(page)
        prefs=page.locator('.atlas-preferences')
        prefs.locator('summary').click()
        private_marker='この希望メモはAIに自動送信しない。'
        page.locator('#atlas-wish').fill(private_marker)
        page.locator('[data-finder-mode="ai"]').click()
        # Guided consultation is the main AI entry; this regression exercises
        # the explicitly retained Phase 4 API tool and its keyword-only overlay.
        page.locator('.finder-retained > summary').click()
        page.locator('[data-finder-action="legacy"]').click()
        expect(page.locator('[data-rd-step="1"]')).to_be_visible()
        page.locator('[data-rd-topic="undecided"]').click()
        page.locator('[data-rd-action="next"]').click()
        page.locator('#rd-wish').fill('働くことと、あとから学ぶことを比べたい。')
        page.locator('[data-rd-action="next"]').click()
        expect(page.locator('[data-rd-action="discover"]')).to_be_disabled()
        assert not guard.posts
        page.locator('#rd-consent').check()
        page.locator('[data-rd-action="discover"]').click()
        expect(page.locator('.rd-route-card')).to_have_count(3)
        expect(page.locator('#rd-view-title')).to_have_text('今回AIが注目した候補')
        assert len(guard.posts)==1
        assert private_marker not in json.dumps(guard.posts,ensure_ascii=False)
        page.locator('[data-rd-action="atlas"]').click()
        expect(page.locator('.route-atlas')).to_be_visible()
        expect(page.locator('.atlas-ai-reference')).to_contain_text('キーワード参照')
        expect(page.locator('.atlas-ai-reference')).to_contain_text('道は隠さず')
        assert roots(page)==root_ids and len(root_ids)==7
        assert page.locator('.atlas-keyword-mark').count()>0
        expect(page.locator('#atlas-wish')).to_have_value(private_marker)
        page.screenshot(path=str(OUTPUT/f'{engine}-ai-candidates-reference-whole-map.png'))
        page.locator('[data-finder-action="legacy"]').click()
        expect(page.locator('.rd-route-card')).to_have_count(3)
        page.locator('[data-finder-mode="all"]').click()
        assert roots(page)==root_ids
        return {'ai_candidates':3,'whole_map_roots_still':7,'keyword_not_eligibility':True,
                'map_preferences_not_sent_to_ai':True,'consented_mock_posts':len(guard.posts)}


def responsive_review(browser,engine):
    results=[]
    for width in [320,390,768,1024,1440]:
        with page_fixture(browser,width=width,touch=width in (768,1024)) as (page,guard):
            def capture(name):
                no_overflow(page,(engine,width,name))
                page.screenshot(path=str(OUTPUT/f'{engine}-{width}-{name}.png'))
            page.goto(BASE+'/')
            expect(page.locator('.home-map-start')).to_be_visible()
            capture('home')
            page.locator('.home-map-start').click()
            expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
            expect(page.locator('.atlas-card-open h3').first).to_be_in_viewport(ratio=.8)
            data=catalogue(page)
            root_ids=roots(page)
            capture('whole-map')
            atlas_action(page,'node','route-work').click()
            expect(page.locator('.atlas-detail .atlas-facets > div')).to_have_count(8)
            capture('route-detail')
            atlas_action(page,'overview').first.click()
            prefs=page.locator('.atlas-preferences')
            prefs.locator('summary').click()
            page.locator('#atlas-wish').fill('大学だけでなく、働く・学ぶ・あとから学ぶ方法も残したい。')
            page.locator('input[name="atlas-budget"][value="concern"]').check()
            prefs.scroll_into_view_if_needed()
            capture('optional-conditions')
            assert roots(page)==root_ids
            atlas_action(page,'node','route-work').click()
            form=page.locator('#atlas-record-form')
            open_disclosure(form)
            page.locator('#atlas-record-state').select_option('constraint_recorded')
            form.scroll_into_view_if_needed()
            capture('constraint-record')
            atlas_action(page,'overview').first.click()
            compare_keep(page,'route-work','route-work-learn')
            capture('eight-facet-comparison')
            for lens in data['lenses'][1:]:
                page.locator(f'[data-atlas-lens="{lens["id"]}"]').click()
                assert roots(page)==lens['rootIds']
                capture('lens-'+lens['id'])
            page.goto(BASE+'/#/cases')
            expect(page.locator('.student-case')).to_have_count(12)
            capture('cases')
            page.goto(BASE+'/#/research')
            chapters=page.locator('[data-research-chapter]')
            expect(chapters).to_have_count(13)
            for chapter in chapters.all():
                if not chapter.evaluate('(el)=>el.open'):
                    chapter.locator('summary').click()
                expect(chapter).to_have_attribute('open','')
                assert len(chapter.inner_text())>120
                no_overflow(page,(engine,width,chapter.get_attribute('data-research-chapter')))
                chapter.locator('summary').click()
            page.evaluate('scrollTo(0,0)')
            capture('research')
            page.goto(BASE+'/#/archive')
            expect(page.locator('.archive-item')).to_have_count(4)
            for item in page.locator('.archive-item').all():
                expect(item.locator('dl').first).to_be_visible()
            assert {a.get_attribute('href') for a in page.locator('.archive-original-preview').all()}=={'/original.html','/reschool.html'}
            capture('archive')
            assert not guard.posts and not guard.function_gets
            results.append({'width':width,'screenshots':12,'touch_context':width in(768,1024),'overflow':False})
    return results


def keyboard_touch_security(browser,engine):
    with page_fixture(browser,width=768,touch=True) as (page,guard):
        page.goto(BASE+'/')
        page.locator('.home-map-start').tap()
        expect(page.locator('.atlas-card')).to_have_count(7)
        atlas_action(page,'node','route-work').tap()
        atlas_action(page,'children').tap()
        page.locator('.atlas-children [data-atlas-action="node"]').first.tap()
        expect(atlas_action(page,'breadcrumb')).to_have_count(2)
        atlas_action(page,'back').tap()
        expect(page.locator('#atlas-title')).to_have_text('働く')
        atlas_action(page,'overview').first.tap()
        for node_id in ['route-work','route-work-learn']:
            atlas_action(page,'compare',node_id).tap()
        atlas_action(page,'show-compare').tap()
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        no_overflow(page,(engine,'touch768'))
        page.screenshot(path=str(OUTPUT/f'{engine}-touch768-comparison.png'))
        assert not guard.posts and not guard.function_gets
    with page_fixture(browser) as (page,guard):
        page.goto(BASE+'/')
        page.keyboard.press('Tab')
        expect(page.locator('.skip')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main')).to_be_focused()
        page.locator('.home-map-start').focus()
        page.keyboard.press('Enter')
        expect(page.locator('.route-atlas')).to_be_visible()
        expect(page.locator('.desk-nav a[href="#/finder"]')).to_have_attribute('aria-current','page')
        atlas_action(page,'node','route-work').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#atlas-title')).to_be_focused()
        expect(atlas_action(page,'breadcrumb').last).to_have_attribute('aria-current','page')
        atlas_action(page,'back').focus()
        page.keyboard.press('Enter')
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        atlas_action(page,'node','route-work').click()
        open_disclosure(page.locator('#atlas-record-form'))
        page.locator('#atlas-record-state').select_option('constraint_recorded')
        attack='<img src=x onerror="window.__atlasInjected=true">この記録は本人によるメモです。'
        page.locator('#atlas-record-note').fill(attack)
        page.locator('#atlas-record-source').fill('javascript:window.__atlasInjected=true')
        page.locator('#atlas-record-date').fill(page.evaluate('new Date().toISOString().slice(0,10)'))
        page.locator('[data-atlas-action="save-record"]').click()
        expect(page.locator('#atlas-error')).to_contain_text('https')
        expect(page.locator('.atlas-record-saved')).to_have_count(0)
        page.locator('#atlas-record-source').fill('https://www.mext.go.jp/')
        page.locator('[data-atlas-action="save-record"]').click()
        expect(page.locator('.atlas-record-saved')).to_have_count(1)
        expect(page.locator('.route-atlas img,.route-atlas script,.route-atlas a[href^="javascript:"]')).to_have_count(0)
        assert not page.evaluate('Boolean(window.__atlasInjected)')
        assert not guard.posts and not guard.function_gets
        return {'touch_depth_compare':True,'keyboard_skip_current_focus_back':True,'xss_escaped_and_unsafe_url_rejected':True}


def archives_and_old_urls(browser,engine):
    with page_fixture(browser) as (page,guard):
        for old,current in [('paths','finder'),('choices','research'),('dashboard','archive')]:
            page.goto(BASE+'/#/'+old)
            expect(page.locator('.desk-nav a[aria-current=page]')).to_have_attribute('href','#/'+current)
        page.goto(BASE+'/original.html')
        expect(page.get_by_role('heading',name='卒業の、その続きを。')).to_be_visible()
        assert page.locator('.app').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(242, 239, 231)'
        page.screenshot(path=str(OUTPUT/f'{engine}-v1-retained.png'))
        page.goto(BASE+'/reschool.html#/paths')
        assert page.locator('.path-card').count()>=10
        page.screenshot(path=str(OUTPUT/f'{engine}-pathmap-retained.png'))
        return {'old_aliases':True,'v1_original_design':True,'pathmap_saved_design':True}


def main():
    research_unchanged()
    audit={}
    with sync_playwright() as playwright:
        for engine in ['chromium','webkit']:
            options={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {'executable_path':'/workspace/webkit-runtime/run-webkit.sh'}
            browser=getattr(playwright,engine).launch(**options)
            try:
                print(engine,'whole map→3levels→transition→conditions→8facetcompare→referenceTree→JSON',flush=True)
                audit[engine]={'whole_map_journey':whole_map_journey(browser,engine)}
                print(engine,'four lenses and guided paths',flush=True)
                audit[engine]['lenses_walkthroughs']=lenses_and_walkthroughs(browser,engine)
                print(engine,'AI optional and nonfiltering',flush=True)
                audit[engine]['optional_ai']=ai_is_optional(browser,engine)
                print(engine,'fivewidth screenshots',flush=True)
                audit[engine]['responsive']=responsive_review(browser,engine)
                print(engine,'touch, keyboard, XSS, archives',flush=True)
                audit[engine]['input_security']=keyboard_touch_security(browser,engine)
                audit[engine]['archives']=archives_and_old_urls(browser,engine)
            finally:
                browser.close()
            (OUTPUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    research_unchanged()
    print(json.dumps(audit,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
