"""Retained v1 remains styled even when external stylesheets cannot be loaded.

Run against an already running local preview. This never calls a paid API.
"""
import json
import os
from pathlib import Path
import re
import tomllib
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('V1_BASE_URL', 'http://localhost:8003').rstrip('/')
OUTPUT = Path(os.environ.get('V1_SCREENSHOT_DIR', '/workspace/reschool-v1-delivery-review'))
OUTPUT.mkdir(parents=True, exist_ok=True)
CSP = tomllib.loads((ROOT / 'netlify.toml').read_text())['headers'][0]['values']['Content-Security-Policy']
ORIGIN = urlparse(BASE).netloc
CANONICAL = {
    'reschool-v1-styles': (ROOT / 'assets/index-dibtv9up.css').read_text(),
    'reschool-v1-archive-styles': (ROOT / 'src/original.css').read_text(),
}


with sync_playwright() as playwright:
    for engine in ['chromium', 'webkit']:
        webkit = Path('/workspace/webkit-runtime/run-webkit.sh')
        if engine == 'webkit' and not webkit.exists():
            print('SKIP: WebKit runtime is unavailable; this is not a Safari hardware test.')
            continue
        browser = (
            playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            if engine == 'chromium'
            else playwright.webkit.launch(executable_path=str(webkit))
        )
        errors, external, posts, css_requests, audit = [], [], [], [], []
        for width in [320, 768, 1024]:
            context = browser.new_context(viewport={'width': width, 'height': 900})
            context.add_init_script("""
                window.__nativeLocal = window.localStorage;
                window.__nativeSession = window.sessionStorage;
                window.__csp = [];
                document.addEventListener('securitypolicyviolation', event => {
                    window.__csp.push(event.violatedDirective);
                });
            """)

            def protect(route):
                request = route.request
                if urlparse(request.url).netloc != ORIGIN:
                    external.append(request.url)
                    route.abort()
                elif request.method != 'GET':
                    posts.append({'method': request.method, 'url': request.url})
                    route.abort()
                elif request.resource_type == 'stylesheet':
                    # An omitted or broken CSS file must never turn the archive into bare text.
                    css_requests.append(request.url)
                    route.abort()
                else:
                    response = route.fetch()
                    route.fulfill(response=response, headers={**response.headers, 'content-security-policy': CSP})

            context.route('**/*', protect)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE + '/original.html')
            heading = page.get_by_role('heading', name='卒業の、その続きを。')
            expect(heading).to_be_visible()
            for style_id, source in CANONICAL.items():
                assert page.locator('#' + style_id).text_content().strip() == source.strip(), style_id
            assert page.locator('link[rel="stylesheet"]').count() == 0
            styles = page.locator('.app').evaluate("""element => ({
                background: getComputedStyle(element).backgroundColor,
                color: getComputedStyle(element).color
            })""")
            assert styles == {'background': 'rgb(242, 239, 231)', 'color': 'rgb(24, 37, 54)'}, styles
            typography = heading.evaluate("""element => ({
                family: getComputedStyle(element).fontFamily,
                size: parseFloat(getComputedStyle(element).fontSize),
                weight: getComputedStyle(element).fontWeight
            })""")
            assert 'serif' in typography['family'] and typography['size'] >= 38 and typography['weight'] == '600', typography
            action = page.get_by_role('button', name='母校に戻ってみる →')
            expect(action).to_be_visible()
            button = action.evaluate("""element => ({
                background: getComputedStyle(element).backgroundColor,
                height: element.getBoundingClientRect().height
            })""")
            assert button['background'] == 'rgb(24, 37, 54)' and button['height'] >= 44, button
            assert page.locator('.back-to-pathmap').evaluate("element => getComputedStyle(element).position") == 'fixed'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length') == 0
            assert not page.evaluate('window.__csp'), page.evaluate('window.__csp')
            page.screenshot(path=str(OUTPUT / f'{engine}-{width}-v1.png'), full_page=True)

            if width == 1024:
                navigation = page.locator('.app nav').evaluate("element => getComputedStyle(element).display")
                assert navigation == 'flex', navigation
                page.get_by_role('button', name='卒業生の方へ', exact=True).click()
                expect(page).to_have_url(re.compile(r'[?&]view=(?:%2F|/)return(?:[&#]|$)'))
                page.screenshot(path=str(OUTPUT / f'{engine}-alumni-v1.png'), full_page=True)
                page.get_by_role('button', name='ホーム', exact=True).click()
                expect(page.get_by_role('heading', name='卒業の、その続きを。')).to_be_visible()
                page.goto(BASE + '/original.html?view=%2Fgive%2Fdetails')
                expect(page.locator('textarea')).to_be_visible()
                assert page.locator('textarea').is_disabled()
                assert page.locator('textarea:enabled,input:not([type=checkbox]):not([type=radio]):enabled').count() == 0
                page.reload()
                expect(page.locator('textarea')).to_be_visible()
                assert page.locator('textarea').is_disabled()
                assert page.evaluate('window.__nativeLocal.length + window.__nativeSession.length') == 0
                assert not page.evaluate('window.__csp'), page.evaluate('window.__csp')
                assert context.cookies() == []
            audit.append({'width': width, 'styles': styles, 'typography': typography, 'button': button, 'overflow': False})
            context.unroute_all(behavior='wait')
            context.close()

        browser.close()
        assert not errors, errors
        assert not external, external
        assert not posts, posts
        assert not css_requests, css_requests
        (OUTPUT / f'{engine}-audit.json').write_text(json.dumps({
            'engine': engine, 'screens': audit, 'js_errors': errors,
            'external_requests': external, 'non_get_requests': posts,
            'external_stylesheets': css_requests,
        }, ensure_ascii=False, indent=2))
        print(f'PASS {engine}: v1 at 320/768/1024px with all external CSS blocked; exact retained styles, paper/nav/type/buttons, navigation, read-only forms, no storage/cookies, CSP, zero external or AI requests.')
