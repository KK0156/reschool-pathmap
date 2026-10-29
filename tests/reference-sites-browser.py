"""Reference sites stay part of Finder exploration, with no provider requests.

External destinations are synthetic landing pages. This tests navigation, memo
provenance and file round trips, not the external sites or real AI quality.
"""
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse
import hashlib
import importlib.util
import json
import os
import re

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('REFERENCE_BASE_URL','http://localhost:8025').rstrip('/')
OUTPUT=Path(os.environ.get('REFERENCE_SCREENSHOT_DIR','/workspace/reschool-reference-feature-review/after'))
OUTPUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('reference_guided_helpers',ROOT/'tests/guided-discovery-browser.py')
qa=importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
qa.BASE=BASE
qa.ORIGIN=urlparse(BASE).netloc
qa.OUTPUT=OUTPUT
ECONOMY='field-economics'
MANABI='https://manabi.benesse.ne.jp/shokugaku/learning/system/014/index.html'
STUDY='https://shingakunet.com/gakumon/b1040/'
PRIVATE_PATH=ROOT/'docs/RESCHOOL-PROJECT-REVIEW.md'
# A private, untracked file is not part of a fresh checkout. When present, guard
# its starting bytes without making it a dependency or publishing its content.
PRIVATE_HASH=hashlib.sha256(PRIVATE_PATH.read_bytes()).hexdigest() if PRIVATE_PATH.is_file() else None
ORIGINAL='授業と、日々の生活の違いを確かめたい。架空の確認メモです。'
SOURCE='https://example.org/official-note'
CHECKED='2026-10-01'


class ReferenceGuard(qa.NetworkGuard):
    def __init__(self,configured=False):
        super().__init__(configured)
        self.destinations=[]

    def handle(self,route):
        request=route.request
        if request.url in [MANABI,STUDY]:
            assert request.method=='GET'
            assert not request.headers.get('referer'),'An external tab must not carry the Finder URL.'
            self.destinations.append(request.url)
            route.fulfill(status=200,content_type='text/html; charset=utf-8',body='<html lang="ja"><meta charset="utf-8"><title>架空の外部資料</title><h1>検証用の外部ページ</h1><p>実サイトへのリクエストは送っていません。</p></html>')
            return
        super().handle(route)


@contextmanager
def fixture(browser,width=390,configured=False):
    context=browser.new_context(viewport={'width':width,'height':1000},has_touch=width in [768,1024],accept_downloads=True,reduced_motion='reduce')
    context.add_init_script('''window.__guidedLocal=localStorage;window.__guidedSession=sessionStorage;window.__guidedCsp=[];document.addEventListener('securitypolicyviolation',e=>window.__guidedCsp.push(e.violatedDirective));''')
    guard=ReferenceGuard(configured)
    context.route('**/*',guard.handle)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:dialog.accept())
    try:
        yield page,guard
        page.wait_for_load_state('networkidle')
        assert not errors,errors
        assert not guard.external and not guard.unexpected,(guard.external,guard.unexpected)
        assert page.evaluate('window.__guidedLocal.length+window.__guidedSession.length')==0
        assert context.cookies()==[]
        assert not page.evaluate('window.__guidedCsp')
    except Exception:
        page.screenshot(path=str(OUTPUT/'failure.png'))
        print('FAILED AT',page.url,flush=True)
        raise
    finally:
        guard.release()
        context.unroute_all(behavior='wait')
        context.close()


def protected_files():
    qa.research_unchanged()
    if PRIVATE_HASH is not None:
        assert PRIVATE_PATH.is_file() and hashlib.sha256(PRIVATE_PATH.read_bytes()).hexdigest()==PRIVATE_HASH


def activate(control,width):
    if width in [768,1024]:control.tap()
    else:control.click()


def action(page,name):
    return qa.public_control(page.locator(f'[data-reference-action="{name}"]'))


def card(page,id):
    return page.locator(f'.reference-site-card[data-reference-id="{id}"]')


def capture(page,engine,width,name):
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    qa.no_overflow(page,(engine,width,name))
    page.screenshot(path=str(OUTPUT/f'{engine}-{width}-{name}.png'))


def reference_entry_visibility(page):
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    back=page.locator('[data-reference-action=back]')
    expect(back).to_be_in_viewport(ratio=1)
    box=back.bounding_box()
    header=page.locator('.finder-journey').bounding_box()
    assert box['y']>=header['y']+header['height']-1,(box,header)
    assert back.evaluate('''element => {const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}''')
    expect(page.locator('.reference-site-card h3').first).to_be_in_viewport(ratio=.5)
    return {'back_clear_of_sticky_header':True,'back_center_hit_test':True,'first_site_heading_visible':True}


def reference_memo_visibility(page,note):
    page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    label=page.locator('label[for=atlas-record-note]')
    field=page.locator('#atlas-record-note')
    expect(label).to_be_in_viewport(ratio=1)
    box=label.bounding_box();header=page.locator('.finder-journey').bounding_box()
    assert box['y']>=header['y']+header['height']-1,(box,header)
    assert label.evaluate('''element => {const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}''')
    values=field.evaluate('(element)=>({start:element.selectionStart,end:element.selectionEnd,scrollTop:element.scrollTop,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight})')
    assert values['start']==values['end']==len(note),values
    assert values['scrollTop']>=values['scrollHeight']-values['clientHeight']-2,values
    return {'memo_label_visible_and_uncovered':True,'caret_at_new_plan_end':True,'latest_plan_scrolled_into_field':True}


def open_route_references(page,width):
    activate(page.locator('.atlas-reference-entry [data-atlas-action=references]'),width)
    expect(page.locator('#reference-library-title')).to_contain_text('経済学')
    expect(page.locator('.path-finder')).to_have_attribute('data-reference-open','true')
    expect(page.locator('#finder-tree-host')).to_be_hidden()
    expect(page.locator('[data-exploration-node="atlas-'+ECONOMY+'"]').first).to_have_attribute('aria-pressed','true')
    expect(page.locator('.reference-boundary')).to_contain_text('AIへ読み込まれません')
    for id,url in [('ref-manabijon',MANABI),('ref-study-sapuri',STUDY)]:
        link=card(page,id).locator('a.reference-external')
        expect(link).to_have_attribute('href',url)
        expect(link).to_have_attribute('target','_blank')
        expect(link).to_have_attribute('rel','noopener noreferrer')


def assert_original_record_fields(page):
    expect(page.locator('#atlas-record-state')).to_have_value('needs_check')
    expect(page.locator('#atlas-record-source')).to_have_value(SOURCE)
    expect(page.locator('#atlas-record-date')).to_have_value(CHECKED)


def open_external(page,guard,id,url):
    before=len(guard.destinations)
    with page.expect_popup() as event:
        card(page,id).locator('a.reference-external').click()
    popup=event.value
    expect(popup.locator('h1')).to_have_text('検証用の外部ページ')
    assert popup.evaluate('window.opener===null')
    assert popup.url==url and guard.destinations[before:]==[url]
    popup.close()
    expect(page.locator('#reference-library-title')).to_contain_text('経済学')


def journey(browser,engine,width):
    with fixture(browser,width) as (page,guard):
        page.goto(BASE+'/')
        activate(page.locator('.home-reference-start'),width)
        expect(page.locator('#reference-library-title')).to_have_text('参考サイトから調べる')
        expect(page.locator('#reference-library-count')).to_contain_text('18件')
        expect(page.locator('.reference-site-card')).to_have_count(6)
        assert not guard.gets and not guard.posts
        global_geometry=reference_entry_visibility(page)
        capture(page,engine,width,'01-all-sites')
        activate(qa.public_control(page.locator('[data-reference-category=work]')),width)
        expect(page.locator('[data-reference-category=work]')).to_have_attribute('aria-pressed','true')
        expect(page.locator('.reference-site-card[data-reference-id=ref-mhlw-jobtag]')).to_have_count(1)
        activate(page.locator('[data-reference-category=all]'),width)
        action(page,'more').click();expect(page.locator('.reference-site-card')).to_have_count(12)
        action(page,'more').click();expect(page.locator('.reference-site-card')).to_have_count(18)
        expect(page.locator('[data-reference-action=more]')).to_have_count(0)
        page.locator('.reference-category-menu > summary').click()
        action(page,'back').click()
        activate(page.locator('[data-atlas-action=lens][data-atlas-lens=fields]'),width)
        activate(page.locator('.atlas-card-open[data-atlas-node=field-economy]'),width)
        activate(page.locator('.atlas-children [data-atlas-action=node][data-atlas-node='+ECONOMY+']'),width)
        expect(page.locator('.atlas-detail #atlas-title')).to_contain_text('経済学')
        capture(page,engine,width,'02-route-description')
        qa.public_control(page.locator('#atlas-record-note')).fill(ORIGINAL)
        page.locator('#atlas-record-state').select_option('needs_check')
        page.locator('#atlas-record-source').fill(SOURCE)
        page.locator('#atlas-record-date').fill(CHECKED)
        page.locator('#atlas-record-form [type=submit]').click()
        open_route_references(page,width)
        related_geometry=reference_entry_visibility(page)
        capture(page,engine,width,'03-economics-references')
        open_external(page,guard,'ref-manabijon',MANABI)
        card(page,'ref-manabijon').locator('[data-reference-action=memo]').click()
        expect(page.locator('#atlas-record-note')).to_contain_text(ORIGINAL)
        expect(page.locator('#atlas-record-note')).to_have_value(re.compile('.*'+re.escape(MANABI)+'.*',re.S))
        assert_original_record_fields(page)
        open_route_references(page,width)
        open_external(page,guard,'ref-study-sapuri',STUDY)
        card(page,'ref-study-sapuri').locator('[data-reference-action=memo]').click()
        expected_note=page.locator('#atlas-record-note').input_value()
        assert expected_note.startswith(ORIGINAL) and MANABI in expected_note and STUDY in expected_note
        assert expected_note.count('これから調べる：')==2
        assert_original_record_fields(page)
        memo_geometry=reference_memo_visibility(page,expected_note)
        capture(page,engine,width,'04-two-site-research-memo')
        # Re-adding the same source cannot duplicate the plan or delete text.
        open_route_references(page,width)
        card(page,'ref-manabijon').locator('[data-reference-action=memo]').click()
        expect(page.locator('#atlas-record-note')).to_have_value(expected_note)
        qa.finder_action(page,'record').click()
        page.locator('#finder-notes').fill('異なる二つの説明を読んで、授業で行うことを比べたい。')
        doc=qa.save_preview(page)
        draft=doc['session']['atlas']['recordDrafts'][ECONOMY]
        saved=doc['session']['atlas']['records'][ECONOMY]
        assert draft['note']==expected_note and saved['note']==ORIGINAL
        for value in [draft,saved]:
            assert value['state']=='needs_check' and value['sourceUrl']==SOURCE and value['checkedOn']==CHECKED
        assert doc['schemaVersion']==2 and len(doc['catalogueSources'])==12
        assert not any(source['id'].startswith('ref-') for source in doc['catalogueSources'])
        raw=qa.download_finder(page)
        (OUTPUT/f'{engine}-{width}-reference-memo.json').write_text(raw)
        page.reload()
        qa.finder_import(page).set_input_files({'name':'reference-memo.json','mimeType':'application/json','buffer':raw.encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        qa.finder_action(page,'route-detail',ECONOMY).first.click()
        qa.public_control(page.locator('#atlas-record-note'))
        expect(page.locator('#atlas-record-note')).to_have_value(expected_note)
        assert_original_record_fields(page)
        # The restored route opens at its description. Read its existing memo
        # through the ordinary disclosure, then scroll the label into view.
        page.locator('#atlas-record-note').focus()
        page.locator('#atlas-record-note').press('ControlOrMeta+End')
        page.locator('label[for=atlas-record-note]').evaluate('(element)=>element.scrollIntoView({block:"start"})')
        capture(page,engine,width,'05-restored-research-memo')
        assert not guard.gets and not guard.posts
        assert guard.destinations==[MANABI,STUDY]
        return {'width':width,'global_catalogue_without_ai':True,'contextual_deep_links':True,'two_mock_external_tabs':True,
                'memo_and_check_state_preserved':True,'finder_v2_round_trip_existing12sources':True,
                'global_reference_geometry':global_geometry,'related_reference_geometry':related_geometry,
                'memo_geometry':memo_geometry,
                'function_gets':0,'function_posts':0,'real_external_requests':0}


def edge_cases(browser,engine):
    with fixture(browser,390) as (page,guard):
        page.goto(BASE+'/#/finder?mode=all&lens=fields&node='+ECONOMY)
        expect(page.locator('.atlas-detail #atlas-title')).to_contain_text('経済学')
        qa.public_control(page.locator('#atlas-record-note')).fill('長'*700)
        open_route_references(page,390)
        card(page,'ref-manabijon').locator('[data-reference-action=memo]').click()
        expect(page.locator('#finder-error')).to_contain_text('700文字')
        expect(page.locator('#reference-library-title')).to_be_visible()
        action(page,'back').click()
        qa.public_control(page.locator('#atlas-record-note'))
        expect(page.locator('#atlas-record-note')).to_have_value('長'*700)
        expect(page.locator('#atlas-record-state')).to_have_value('unresearched')
        expect(page.locator('#atlas-record-source')).to_have_value('')
        expect(page.locator('#atlas-record-date')).to_have_value('')
        page.locator('.atlas-detail-actions [data-atlas-action=compare]').click()
        page.locator('.atlas-breadcrumbs [data-atlas-action=breadcrumb][data-atlas-node=field-economy]').click()
        page.locator('.atlas-children [data-atlas-action=node][data-atlas-node=field-business]').click()
        page.locator('.atlas-detail-actions [data-atlas-action=compare]').click()
        page.locator('[data-atlas-action=show-compare]').click()
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        page.locator('.atlas-compare-heading [data-atlas-action=references][data-atlas-node='+ECONOMY+']').click()
        expect(page.locator('#reference-library-title')).to_contain_text('経済学')
        action(page,'back').click()
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        for id in [ECONOMY,'field-business']:
            expect(page.locator('[data-exploration-node=atlas-'+id+']')).to_have_attribute('data-exploration-compared','true')
        capture(page,engine,390,'06-comparison-after-references')
        assert not guard.gets and not guard.posts
    with fixture(browser,768,configured=True) as (page,guard):
        page.goto(BASE+'/');page.locator('.home-finder-start').click()
        expect(page.locator('#guide-capability')).to_contain_text('毎回')
        draft='まだ答えていない相談の下書きです。'
        qa.guide_answer(page).fill(draft)
        page.locator('[data-finder-mode=all]').click()
        page.locator('[data-exploration-node=atlas-route-university]').click()
        qa.public_control(page.locator('[data-exploration-action=edit]')).click()
        page.locator('#exploration-note-label').fill('本人が書き直した大学の見方')
        page.locator('#exploration-note-detail').fill('授業や活動を知ってから考えたい。')
        page.locator('#exploration-note-form [type=submit]').click()
        page.locator('.atlas-reference-entry [data-atlas-action=references]').click()
        action(page,'back').click()
        expect(page.locator('[data-exploration-node=atlas-route-university]')).to_contain_text('本人が書き直した大学の見方')
        expect(page.locator('[data-exploration-node=atlas-route-university]')).to_have_attribute('data-exploration-origin','user_edited')
        page.locator('[data-finder-mode=ai]').click()
        expect(qa.guide_answer(page)).to_have_value(draft)
        assert not guard.posts
        capture(page,engine,768,'07-draft-and-manual-tree-protected')
    return {'long_memo_rejected_atomically':True,'no_check_state_promotion':True,'comparison_back_keeps_two_routes':True,
            'unsubmitted_guide_draft_preserved':True,'manual_tree_override_preserved':True}


def main():
    protected_files()
    widths=[int(value) for value in os.environ.get('REFERENCE_WIDTHS','320,390,768,1024,1440').split(',')]
    engines=os.environ.get('REFERENCE_ENGINES','chromium,webkit').split(',')
    audit={}
    with sync_playwright() as pw:
        for engine in engines:
            options={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {'executable_path':'/workspace/webkit-runtime/run-webkit.sh'}
            browser=getattr(pw,engine).launch(**options)
            try:
                audit[engine]={'journeys':[]}
                for width in widths:
                    print(engine,width,'reference journey',flush=True)
                    audit[engine]['journeys'].append(journey(browser,engine,width))
                if os.environ.get('REFERENCE_MATRIX_ONLY')!='1':audit[engine]['edge_cases']=edge_cases(browser,engine)
            finally:browser.close()
            (OUTPUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    protected_files()
    print(json.dumps(audit,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
