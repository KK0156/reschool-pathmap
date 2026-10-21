"""Phase 3 student journey and responsive review using only synthetic data.

Start a local preview with PATH_MAP_OFFLINE=1 before running this script.
No paid AI, external program lookup, deployment, or browser persistence is used.
"""
import json
import os
from pathlib import Path
import tomllib
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('PHASE3_BASE_URL', 'http://localhost:8002').rstrip('/')
OUTPUT = Path(os.environ.get('PHASE3_SCREENSHOT_DIR', '/workspace/reschool-phase3-review/after'))
OUTPUT.mkdir(parents=True, exist_ok=True)
CSP = tomllib.loads((ROOT / 'netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
ORIGIN = urlparse(BASE).netloc
TOPICS = [
    '文系か理系か迷っている', '大学で何を学べばいいか分からない',
    '学部・学科を比較したい', 'やりたい仕事がまだ決まっていない',
    '部活動と勉強を両立したい', '学校外の活動に挑戦したい',
    '自分に向いているか分からない分野がある', '二つの進路で迷っている',
]
NAV = ['ホーム', '道を探す', '事例を見る', '研究について', '開発の歴史']
DIALOG = {'accept': True}


def reveal(locator):
    """Use disclosure controls, rather than changing application state in JavaScript."""
    for details in locator.locator('xpath=ancestor::details[not(@open)]').all():
        details.locator('summary').first.click()


def overflow(page, label):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), label


def native_storage(page):
    assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length') == 0
    assert page.context.cookies() == []


def open_topic(page, title=TOPICS[0]):
    page.goto(BASE + '/')
    page.locator('.tree-entry-link').click()
    topic = page.locator('.student-sample-card').filter(has_text=title).first
    expect(topic).to_be_visible()
    topic.click()  # Optional RE:Tree retains its editable examples without AI.
    expect(page.locator('.tree-node')).not_to_have_count(0)
    assert page.locator('.tree-node').count() >= 8
    expect(page.locator('#generate')).to_be_disabled()
    return page.locator('.tree-node').count()


def journey(page, engine):
    count = open_topic(page)
    viewport = page.locator('.mind-map-viewport')
    expect(viewport).to_be_visible()
    expect(viewport).to_be_in_viewport(ratio=0.35)
    page.locator('[data-node=root]').click()
    expect(page.locator('#node-detail')).to_be_visible()
    expect(page.locator('#node-detail')).to_be_in_viewport(ratio=0.1)
    page.locator('[data-edit-start]').click()
    expect(page.locator('#edit-label')).to_be_focused()
    page.locator('#edit-label').fill('文理を選ぶ前に、授業で何を学ぶか比べたい')
    page.locator('#node-edit-form button[type=submit]').click()
    expect(page.locator('[data-node=root]')).to_contain_text('授業で何を学ぶか')

    page.locator('[data-edit-add]').click()
    page.locator('#edit-label').fill('公開授業で二つの分野を比べる')
    reveal(page.locator('#edit-type'))
    page.locator('#edit-type').select_option('project')
    reveal(page.locator('#edit-detail'))
    page.locator('#edit-detail').fill('どちらの授業も短く試して、分からない点を先生に聞く。')
    page.locator('#node-edit-form button[type=submit]').click()
    expect(page.locator('.tree-node')).to_have_count(count + 1)
    added_id = page.locator('.tree-node[aria-pressed=true]').get_attribute('data-node')
    page.locator('[data-edit-delete]').click()
    expect(page.locator('.tree-node')).to_have_count(count)
    undo = page.locator('[data-edit-undo]')
    reveal(undo)
    undo.click()
    expect(page.locator('.tree-node')).to_have_count(count + 1)
    expect(page.locator(f'[data-node="{added_id}"]')).to_contain_text('公開授業で二つの分野を比べる')
    if page.locator('#node-detail').get_attribute('data-open') == 'true':
        page.locator('#node-detail [data-tree-go=tree-container]').click()

    field = page.locator('#step-research')
    reveal(field)
    field.fill('気になる二分野の授業科目と履修条件')
    page.locator('#step-person').fill('進路担当の先生')
    page.locator('#step-try').fill('授業紹介を一つずつ読み、質問を三つ書く')
    page.locator('#step-when').fill('次の面談まで')
    page.locator('#next-step-form button[type=submit]').click()
    expect(page.locator('#step-error')).to_contain_text('追加しました')
    expect(page.locator('#summary-content')).to_contain_text('進路担当の先生')
    if page.locator('#node-detail').get_attribute('data-open') == 'true':
        page.locator('#node-detail [data-tree-go=tree-container]').click()

    export = page.locator('#export-tree')
    reveal(export)
    with page.expect_download() as downloaded:
        export.click()
    raw = Path(downloaded.value.path()).read_text()
    saved = json.loads(raw)
    assert saved['tree']['core_question'] == '文理を選ぶ前に、授業で何を学ぶか比べたい'
    assert saved['nodeOrigins']['root'] == 'user_edited'
    assert saved['nodeOrigins'][added_id] == 'user_edited'
    assert 'memo' not in saved and 'context' not in saved
    (OUTPUT / f'{engine}-journey.json').write_text(raw)
    page.screenshot(path=str(OUTPUT / f'{engine}-journey-edited.png'))

    page.reload()
    # A direct sample URL may legitimately reopen its pristine sample on reload;
    # accepted edits must only return through the user's explicit JSON import.
    if page.locator('[data-node=root]').count():
        expect(page.locator('[data-node=root]')).not_to_contain_text('授業で何を学ぶか')
    page.locator('#import-tree').set_input_files({'name': 'student-map.json', 'mimeType': 'application/json', 'buffer': raw.encode()})
    expect(page.locator('#file-status')).to_contain_text('復元しました')
    expect(page.locator('.tree-node')).to_have_count(len(saved['tree']['nodes']))
    expect(page.locator('[data-node=root]')).to_contain_text('授業で何を学ぶか')
    for position in saved['positions']:
        style = page.locator(f'[data-node="{position["id"]}"]').get_attribute('style')
        assert f'left:{position["x"]}px' in style and f'top:{position["y"]}px' in style

    # Invalid input must not erase the just-restored work.
    page.locator('#import-tree').set_input_files({'name': 'unsafe.json', 'mimeType': 'application/json', 'buffer': b'{"__proto__":{"polluted":true}}'})
    expect(page.locator('#file-status')).to_contain_text('変更していません')
    expect(page.locator('.tree-node')).to_have_count(len(saved['tree']['nodes']))
    assert page.evaluate('({}).polluted') is None

    # Reading the project background must not wipe a student's accepted edits.
    page.locator('.desk-nav a[href="#/research"]').click()
    expect(page.locator('[data-research-chapter]')).to_have_count(13)
    page.locator('.tree-entry-link').click()
    expect(page.locator('[data-node=root]')).to_contain_text('授業で何を学ぶか')
    DIALOG['accept'] = False
    page.locator('.desk-nav a[href="#/"]').click()
    page.locator('.tree-entry-link').click()
    page.locator('[data-start=sample]').click()
    page.locator('.student-sample-card').filter(has_text=TOPICS[1]).first.click()
    expect(page.locator('[data-node=root]')).to_contain_text('授業で何を学ぶか')
    expect(page.locator('.tree-node')).to_have_count(len(saved['tree']['nodes']))
    DIALOG['accept'] = True
    page.screenshot(path=str(OUTPUT / f'{engine}-journey-restored.png'))
    native_storage(page)
    return {'nodes_saved': len(saved['tree']['nodes']), 'download_restore': True, 'invalid_import_preserves_work': True, 'cancel_replacement_preserves_work': True}


def pages_and_examples(page, engine):
    for topic in TOPICS:
        open_topic(page, topic)
        assert 'ROOTS' not in page.locator('main').inner_text()
    case_links = []
    for width in [320, 390, 768, 1024, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.goto(BASE + '/')
        expect(page.locator('.desk-nav a')).to_have_count(5)
        labels = [link.inner_text().strip().split('\n')[0] for link in page.locator('.desk-nav a').all()]
        assert labels == NAV, labels
        expect(page.locator('.home-topic')).to_have_count(6)
        expect(page.locator('.home-route-demo')).to_have_count(4)
        expect(page.locator('.home-map-start')).to_be_in_viewport(ratio=0.1)
        expect(page.locator('.home-map-route')).to_have_count(7)
        assert 'ROOTS' not in page.locator('main').inner_text()
        overflow(page, (engine, width, 'home'))
        page.screenshot(path=str(OUTPUT / f'{engine}-{width}-home.png'))
        page.locator('.tree-entry-link').click()
        page.locator('.student-sample-card').filter(has_text=TOPICS[0]).first.click()
        expect(page.locator('.tree-node')).not_to_have_count(0)
        overflow(page, (engine, width, 'tree'))
        viewport = page.locator('.mind-map-viewport')
        expect(viewport).to_be_visible()
        root = page.locator('[data-node=root]')
        bounds, node = viewport.bounding_box(), root.bounding_box()
        assert bounds and node and node['x'] + node['width'] > bounds['x'] and node['x'] < bounds['x'] + bounds['width']
        assert node['y'] + node['height'] > bounds['y'] and node['y'] < bounds['y'] + bounds['height']
        nodes = page.locator('#tree-container .tree-node').evaluate_all('els=>els.map(el=>({id:el.dataset.node,rect:el.getBoundingClientRect().toJSON()}))')
        for index, first in enumerate(nodes):
            for second in nodes[index + 1:]:
                a, b = first['rect'], second['rect']
                intersection_x = min(a['right'], b['right']) - max(a['left'], b['left'])
                intersection_y = min(a['bottom'], b['bottom']) - max(a['top'], b['top'])
                assert intersection_x <= 1 or intersection_y <= 1, (engine, width, first['id'], second['id'], 'node overlap')
        page.screenshot(path=str(OUTPUT / f'{engine}-{width}-tree.png'))

        page.goto(BASE + '/#/cases')
        cases = page.locator('.student-case[data-case-id]')
        assert cases.count() >= 10
        for case in cases.all():
            text = case.inner_text()
            for required in ['最初の悩み', '考えられる選択肢', 'まだ分からないこと', '次にできる行動']:
                assert required in text, required
            link = case.locator('a[href*="#/tree?sample="]')
            expect(link).to_have_count(1)
            case_links.append(link.get_attribute('href'))
        assert '架空' in page.locator('main').inner_text() and 'ROOTS' not in page.locator('main').inner_text()
        overflow(page, (engine, width, 'cases'))
        page.screenshot(path=str(OUTPUT / f'{engine}-{width}-cases.png'))
        cases.first.locator('a[href*="#/tree?sample="]').click()
        expect(page.locator('.tree-node')).not_to_have_count(0)
        expect(page.locator('#generate')).to_be_disabled()

        page.goto(BASE + '/#/research')
        chapters = page.locator('details.research-chapter[data-research-chapter]')
        expect(chapters).to_have_count(13)
        for chapter in chapters.all():
            chapter.locator('summary').click()
            expect(chapter).to_have_attribute('open', '')
            assert len(chapter.inner_text()) >= 120
            overflow(page, (engine, width, chapter.get_attribute('data-research-chapter')))
            chapter.locator('summary').click()
        page.evaluate('scrollTo(0, 0)')
        page.screenshot(path=str(OUTPUT / f'{engine}-{width}-research.png'))

        page.goto(BASE + '/#/archive')
        items = page.locator('.archive-item')
        expect(items).to_have_count(4)
        for item in items.all():
            # Dates/features/findings must be readable before any disclosure opens.
            expect(item.locator('dl').first).to_be_visible()
            assert '当時' in item.inner_text()
        previews = page.locator('.archive-original-preview')
        expect(previews).to_have_count(2)
        assert {item.get_attribute('href') for item in previews.all()} == {'/original.html', '/reschool.html'}
        for image in previews.locator('img').all():
            image.scroll_into_view_if_needed()
            expect(image).to_be_visible()
            expect(image).to_have_js_property('complete', True)
            expect(image).to_have_js_property('naturalWidth', 1280)
        assert page.locator('.archive-item button:disabled').count() == 2
        page.evaluate('scrollTo(0, 0)')
        overflow(page, (engine, width, 'archive'))
        page.screenshot(path=str(OUTPUT / f'{engine}-{width}-archive.png'))
    for target in sorted(set(case_links)):
        page.goto(BASE + '/#/cases')
        page.locator(f'.student-case a[href="{target}"]').first.click()
        expect(page.locator('.tree-node')).not_to_have_count(0)
        expect(page.locator('#generate')).to_be_disabled()
    return {'topics_opened': len(TOPICS), 'case_sample_routes': len(set(case_links)), 'responsive_widths': [320,390,768,1024,1440]}


def aliases_and_archives(page, engine):
    for old, current in [('finder', 'finder'), ('paths', 'finder'), ('choices', 'research'), ('dashboard', 'archive')]:
        page.goto(BASE + '/#/' + old)
        expect(page.locator('.desk-nav a[aria-current=page]')).to_have_attribute('href', '#/' + current)
        assert page.locator('h1:visible').count() == 1
    page.goto(BASE + '/original.html')
    expect(page.get_by_role('heading', name='卒業の、その続きを。')).to_be_visible()
    assert page.locator('.app').evaluate('(el)=>getComputedStyle(el).backgroundColor') == 'rgb(242, 239, 231)'
    page.screenshot(path=str(OUTPUT / f'{engine}-v1-retained.png'))
    native_storage(page)
    page.goto(BASE + '/reschool.html#/paths')
    assert page.locator('.path-card').count() >= 10
    page.screenshot(path=str(OUTPUT / f'{engine}-pathmap-retained.png'))


def keyboard_review(page):
    page.goto(BASE + '/')
    expect(page.locator('.desk-nav')).to_be_visible()
    page.keyboard.press('Tab')
    expect(page.locator('.skip')).to_be_focused()
    page.keyboard.press('Enter')
    expect(page.locator('#main')).to_be_focused()
    found = False
    for _ in range(20):
        page.keyboard.press('Tab')
        if page.evaluate('document.activeElement.matches(".home-map-start")'):
            found = True
            break
    assert found, 'The whole route map must be keyboard reachable after the skip link.'
    page.keyboard.press('Enter')
    expect(page.locator('.atlas-card-grid').first.locator('.atlas-card')).to_have_count(7)
    page.locator('[data-finder-mode="ai"]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#guide-title')).to_be_visible()
    page.locator('[data-guide-choice]').first.focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-guide-choice]').first).to_have_attribute('aria-pressed', 'true')
    page.locator('.finder-retained > summary').focus()
    page.keyboard.press('Enter')
    page.locator('[data-finder-action=legacy]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-rd-step="1"]')).to_be_visible()
    page.locator('.tree-entry-link').focus()
    page.keyboard.press('Enter')
    page.locator('.student-sample-card').first.focus()
    page.keyboard.press('Enter')
    expect(page.locator('.tree-node')).not_to_have_count(0)
    page.locator('[data-node=root]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#node-detail')).to_be_visible()
    page.locator('[data-edit-start]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#edit-label')).to_be_focused()
    page.locator('[data-edit-cancel]').focus()
    page.keyboard.press('Enter')
    assert page.locator('#node-edit-form').count() == 0
    return {'skip_link': True, 'sample_keyboard_entry': True, 'node_selection_and_editor': True}


def touch_review(browser):
    context = browser.new_context(viewport={'width': 1024, 'height': 1000}, has_touch=True, reduced_motion='reduce')
    page = context.new_page()
    page.on('dialog', lambda dialog: dialog.accept())
    open_topic(page)
    viewport = page.locator('.mind-map-viewport')
    viewport.scroll_into_view_if_needed()
    cdp = context.new_cdp_session(page)
    cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 2})
    rect = viewport.bounding_box()
    x, y = rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2
    zoom = page.locator('.map-zoom output').inner_text()
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x':x-25,'y':y},{'x':x+25,'y':y}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x':x-55,'y':y},{'x':x+55,'y':y}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    expect(page.locator('.map-zoom output')).not_to_have_text(zoom)
    center = page.locator('[data-map-action=center]')
    reveal(center)
    center.click()
    viewport.scroll_into_view_if_needed()
    node = page.locator('[data-node=root]')
    before, rect = node.get_attribute('style'), node.bounding_box()
    x, y = rect['x'] + rect['width'] / 2, rect['y'] + rect['height'] / 2
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x':x,'y':y}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x':x+55,'y':y+30}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    expect(node).not_to_have_attribute('style', before)
    undo = page.locator('[data-map-action=undo]')
    reveal(undo)
    undo.click()
    expect(page.locator('[data-node=root]')).to_have_attribute('style', before)
    for width in [768, 1024]:
        page.set_viewport_size({'width': width, 'height': 1000})
        center.click()
        overflow(page, ('touch', width))
        page.screenshot(path=str(OUTPUT / f'chromium-touch-{width}.png'))
    context.close()
    return {'pinch': True, 'node_drag': True, 'placement_undo': True, 'scope': 'Chromium CDP touch on iPad-sized viewports; not physical iPad validation'}


with sync_playwright() as playwright:
    for engine in ['chromium', 'webkit']:
        executable = Path('/workspace/webkit-runtime/run-webkit.sh')
        if engine == 'webkit' and not executable.exists():
            print('SKIP: WebKit runtime unavailable; no Safari hardware claim.')
            continue
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox']) if engine == 'chromium' else playwright.webkit.launch(executable_path=str(executable))
        context = browser.new_context(viewport={'width':1024,'height':1000}, accept_downloads=True, reduced_motion='reduce')
        context.add_init_script('window.__nativeLocal=window.localStorage;window.__nativeSession=window.sessionStorage;window.__csp=[];document.addEventListener("securitypolicyviolation",e=>window.__csp.push(e.violatedDirective))')
        errors, posts, external = [], [], []

        def secure(route):
            request = route.request
            if urlparse(request.url).netloc != ORIGIN:
                external.append(request.url)
                route.abort()
            elif request.method == 'POST':
                posts.append(request.url)
                route.abort()
            else:
                response = route.fetch()
                route.fulfill(response=response, headers={**response.headers, 'content-security-policy': CSP})

        context.route('**/*', secure)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept() if DIALOG['accept'] else dialog.dismiss())
        try:
            review = {'engine': engine, 'journey': journey(page, engine), 'pages': pages_and_examples(page, engine)}
            aliases_and_archives(page, engine)
            review['keyboard'] = keyboard_review(page)
        except Exception:
            page.screenshot(path=str(OUTPUT / f'{engine}-failure.png'))
            print('FAILED AT', page.url)
            raise
        assert not errors and not posts and not external, (errors, posts, external)
        assert not page.evaluate('window.__csp'), page.evaluate('window.__csp')
        native_storage(page)
        if engine == 'chromium':
            review['touch'] = touch_review(browser)
        review.update({'js_errors': errors, 'ai_posts': posts, 'external_requests': external})
        (OUTPUT / f'{engine}-phase3-audit.json').write_text(json.dumps(review, ensure_ascii=False, indent=2))
        context.close()
        browser.close()
        print(f'PASS {engine}: optional RE:Tree → general sample → edit/add/delete/undo → next action → JSON/reload/restore, 8 retained examples, cases→tree, 13 research chapters, visible archive notes, five widths, discovery keyboard entry, retained pages, no AI POST/storage/errors.')
