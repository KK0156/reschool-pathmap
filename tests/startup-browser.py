"""Startup remains readable when modules/styles are blocked or initialization fails.

Run against a local preview; every API response is mocked as unavailable. This
checks the application document, not a private Codespaces authentication page.
"""
import json
import os
from pathlib import Path
import tomllib
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('STARTUP_BASE_URL', 'http://localhost:8002').rstrip('/')
OUTPUT = Path(os.environ.get('STARTUP_SCREENSHOT_DIR', '/workspace/reschool-startup-review'))
OUTPUT.mkdir(parents=True, exist_ok=True)
ORIGIN = urlparse(BASE).netloc
CSP = tomllib.loads((ROOT / 'netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
PARTIAL_RENDER = """
    document.querySelector('#root').innerHTML = '<form id="startup-draft"><label for="draft-note">書きかけのメモ</label><input id="draft-note" value="残してほしい編集内容"></form>';
    throw new Error('Synthetic failure after a partial render.');
"""


def check_cancel_keeps_draft(page, desk_requests):
    expect(page.locator('#draft-note')).to_have_value('残してほしい編集内容')
    expect(page.locator('#startup-draft')).to_be_visible()
    before_retry = page.url
    confirmations = []

    def cancel_retry(dialog):
        confirmations.append(dialog.message)
        dialog.dismiss()

    page.once('dialog', cancel_retry)
    page.locator('#app-startup-retry').click()
    assert len(confirmations) == 1
    assert '入力は消えます' in confirmations[0]
    assert page.url == before_retry
    assert len(desk_requests) == 1
    expect(page.locator('#draft-note')).to_have_value('残してほしい編集内容')


def run_scenario(browser, engine, scenario):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    context.add_init_script("""
        window.__nativeLocal = window.localStorage;
        window.__nativeSession = window.sessionStorage;
        window.__startupCsp = [];
        document.addEventListener('securitypolicyviolation', event => {
            window.__startupCsp.push(event.violatedDirective);
        });
    """)
    page = context.new_page()
    offsite, posts, desk_requests, page_errors, held_routes = [], [], [], [], []
    page.on('pageerror', lambda error: page_errors.append(str(error)))

    def route_request(route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != ORIGIN:
            offsite.append(request.url)
            route.abort()
            return
        if request.method != 'GET':
            posts.append({'method': request.method, 'url': request.url})
            route.abort()
            return
        if parsed.path.startswith('/.netlify/functions/'):
            route.fulfill(status=200, content_type='application/json', body='{"configured":false}')
            return
        if scenario == 'scripts-and-css-blocked' and request.resource_type in ['script', 'stylesheet']:
            route.abort()
            return
        if scenario == 'css-blocked' and request.resource_type == 'stylesheet':
            route.abort()
            return
        if parsed.path == '/src/desk-app.js':
            desk_requests.append(request.url)
            if scenario in ['skip-during-startup', 'slow-startup', 'slow-partial-root-error']:
                held_routes.append(route)
                return
            if scenario == '404-retry' and len(desk_requests) == 1:
                route.fulfill(status=404, content_type='text/javascript', body='// deliberately missing module')
                return
            if scenario == 'invalid-export':
                route.fulfill(status=200, content_type='text/javascript', body="import { absentStartupExport } from './student-data.js';")
                return
            if scenario in ['runtime-error', 'css-blocked']:
                route.fulfill(status=200, content_type='text/javascript', body="throw new Error('Synthetic startup failure.');")
                return
            if scenario == 'partial-root-error':
                route.fulfill(status=200, content_type='text/javascript', body=PARTIAL_RENDER)
                return
        if request.resource_type == 'document':
            response = route.fetch()
            route.fulfill(response=response, headers={**response.headers, 'content-security-policy': CSP})
        else:
            route.continue_()

    context.route('**/*', route_request)
    if scenario in ['skip-during-startup', 'slow-startup', 'slow-partial-root-error']:
        with page.expect_request(lambda request: urlparse(request.url).path == '/src/desk-app.js'):
            page.goto(BASE + '/', wait_until='domcontentloaded')
    else:
        page.goto(BASE + '/', wait_until='domcontentloaded')
    assert 'RE:Path Finder' in page.title()

    if scenario in ['slow-startup', 'slow-partial-root-error']:
        expect(page.locator('#app-startup')).to_be_visible()
        assert page.evaluate('window.__rePathStartup?.state') == 'loading'
        assert len(held_routes) == 1
        # Use the real production timer for the visible slow-startup message.
        expect(page.locator('#app-startup-status')).to_contain_text('時間がかかっています', timeout=15000)
        expect(page.locator('#app-startup-retry')).to_be_visible()
        assert page.evaluate('window.__rePathStartup.state') == 'slow'
        assert len(desk_requests) == 1
        if engine == 'chromium':
            page.screenshot(path=str(OUTPUT / f'{engine}-{scenario}-waiting.png'))
        # WebKit keeps load/fonts.ready pending while the imported resource is
        # held, so its screenshot cannot complete yet. The visible notice is
        # asserted above; capture WebKit after releasing that resource below.
        if scenario == 'slow-partial-root-error':
            held_routes[0].fulfill(status=200, content_type='text/javascript', body=PARTIAL_RENDER)
            expect(page.locator('#app-startup-status')).to_contain_text('読み込めませんでした')
            assert page.evaluate('window.__rePathStartup.state') == 'error'
            check_cancel_keeps_draft(page, desk_requests)
        else:
            response = held_routes[0].fetch()
            held_routes[0].fulfill(response=response)
            expect(page.locator('.desk-nav')).to_be_visible()
            expect(page.locator('.home-topic')).to_have_count(8)
            expect(page.locator('#app-startup')).to_have_count(0)
            assert page.evaluate('window.__rePathStartup.state') == 'ready'
        assert not page_errors, page_errors
        outcome = 'error' if scenario == 'slow-partial-root-error' else 'restored'
        page.screenshot(path=str(OUTPUT / f'{engine}-{scenario}-{outcome}.png'))
    elif scenario == 'skip-during-startup':
        expect(page.locator('#app-startup')).to_be_visible()
        assert page.evaluate('window.__rePathStartup?.state') == 'loading'
        # The module request is intentionally held until keyboard navigation has
        # moved into the static fallback. The app replaces this main element.
        page.keyboard.press('Tab')
        expect(page.locator('a.skip')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main')).to_be_focused()
        assert page.url.endswith('#main')
        assert len(held_routes) == 1
        response = held_routes[0].fetch()
        held_routes[0].fulfill(response=response, headers={**response.headers, 'content-security-policy': CSP})
        expect(page.locator('.desk-nav')).to_be_visible()
        expect(page.locator('.home-topic')).to_have_count(8)
        expect(page.locator('#app-startup')).to_have_count(0)
        expect(page.locator('#main')).to_be_focused()
        assert page.evaluate('window.__rePathStartup.state') == 'ready'
        assert not page_errors, page_errors
        page.screenshot(path=str(OUTPUT / f'{engine}-{scenario}.png'))
    elif scenario == 'normal':
        expect(page.locator('.desk-nav')).to_be_visible()
        assert page.evaluate('window.__rePathStartup.state') == 'ready'
        expect(page.locator('#app-startup')).to_have_count(0)
        page.locator('.home-topic').first.click()
        expect(page.locator('.tree-node')).to_have_count(15)
        expect(page.locator('#generate')).to_be_disabled()
        page.screenshot(path=str(OUTPUT / f'{engine}-normal-tree.png'))
        assert not page_errors, page_errors
    elif scenario == 'scripts-and-css-blocked':
        fallback = page.locator('#app-startup')
        expect(fallback).to_be_visible()
        assert 'RE:Path Finder' in fallback.inner_text()
        assert len(fallback.inner_text()) >= 60
        assert fallback.locator('a[href="/original.html"]').count() == 1
        assert fallback.locator('a[href="/reschool.html"]').count() == 1
        assert page.locator('#app-startup').evaluate("el => [el, document.body, document.documentElement].some(node => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)')")
        expect(page.locator('#app-startup-retry')).to_be_hidden()
        page.screenshot(path=str(OUTPUT / f'{engine}-{scenario}.png'))
    else:
        expect(page.locator('#app-startup')).to_be_visible()
        expect(page.locator('#app-startup-retry')).to_be_visible()
        expect(page.locator('#app-startup-status')).not_to_have_text('')
        assert page.evaluate('window.__rePathStartup.state') == 'error'
        assert page.locator('#app-startup').locator('a[href="/original.html"]').count() == 1
        assert not page.locator('#app-startup script').count()
        if scenario == 'partial-root-error':
            check_cancel_keeps_draft(page, desk_requests)
        if scenario == 'css-blocked':
            assert page.locator('#app-startup').bounding_box()['width'] <= 390
            assert page.locator('#app-startup').evaluate("el => [el, document.body, document.documentElement].some(node => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)')")
        page.screenshot(path=str(OUTPUT / f'{engine}-{scenario}.png'))
        if scenario == '404-retry':
            page.locator('#app-startup-retry').click()
            expect(page.locator('.desk-nav')).to_be_visible()
            expect(page.locator('#app-startup')).to_have_count(0)
            assert page.evaluate('window.__rePathStartup.state') == 'ready'
            assert len(desk_requests) >= 2 and desk_requests[0] != desk_requests[-1], desk_requests
            page.screenshot(path=str(OUTPUT / f'{engine}-retry-restored.png'))
            assert not page_errors, page_errors

    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), scenario
    assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length') == 0
    assert context.cookies() == []
    assert not offsite and not posts, (offsite, posts)
    assert not page.evaluate('window.__startupCsp'), page.evaluate('window.__startupCsp')
    result = {
        'engine': engine, 'scenario': scenario, 'passed': True,
        'desk_module_requests': len(desk_requests), 'external_requests': offsite,
        'non_get_requests': posts, 'handled_fixture_page_errors': page_errors,
        'overflow': False, 'storage': False,
    }
    # Finish in-flight image/favicon routes before disposing their API request
    # context. Otherwise a fast successful run can race the test teardown.
    context.unroute_all(behavior='wait')
    context.close()
    return result


results = []
with sync_playwright() as playwright:
    for engine in ['chromium', 'webkit']:
        executable = Path('/usr/bin/chromium') if engine == 'chromium' else Path('/workspace/webkit-runtime/run-webkit.sh')
        if not executable.exists():
            print(f'SKIP: {engine} runtime unavailable; this does not verify physical Safari/iPad.')
            continue
        browser = (
            playwright.chromium.launch(executable_path=str(executable), args=['--no-sandbox'])
            if engine == 'chromium'
            else playwright.webkit.launch(executable_path=str(executable))
        )
        for scenario in ['normal', 'skip-during-startup', 'slow-startup', 'slow-partial-root-error', '404-retry', 'invalid-export', 'runtime-error', 'partial-root-error', 'css-blocked', 'scripts-and-css-blocked']:
            results.append(run_scenario(browser, engine, scenario))
            print(f'PASS {engine}: {scenario}', flush=True)
        browser.close()

(OUTPUT / 'startup-audit.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print('PASS: static readable startup, caught module/runtime failures, fresh retry, preserved partial draft, CSP, zero external/AI/storage. This is not a private Codespaces connectivity test.')
