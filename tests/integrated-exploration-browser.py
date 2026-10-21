"""Shared Finder / growing RE:Tree journeys with fabricated AI fixtures only.

This suite exercises the browser UI and saved documents; it does not call a real
AI provider or measure educational effects. Existing guard rejects external hosts,
unexpected POSTs, storage, cookies, JavaScript errors, and CSP violations.
"""
from pathlib import Path
import importlib.util
import hashlib
import json
import os

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(os.environ.get('INTEGRATED_SCREENSHOT_DIR','/workspace/reschool-integrated-review/after'))
OUTPUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('integrated_guided_helpers',ROOT/'tests/guided-discovery-browser.py')
qa=importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
qa.OUTPUT=OUTPUT
PRIVATE_HASH='742926673940d84dfad15a5c15f414277068fdee576774628f957574ca2846cf'
MEMO='大学へ行くかまだ分かりません。学ぶことと働くこと、その後に学び直す道も知りたい。架空の相談です。'
NOTES='大学と働く道を残したまま、内容と日々の生活を比べたい。'
NEXT='二つの学びと生活の違いを一つずつメモして、次の面談で質問する。'


def guarded_hashes():
    qa.research_unchanged()
    assert hashlib.sha256((ROOT/'docs/RESCHOOL-PROJECT-REVIEW.md').read_bytes()).hexdigest()==PRIVATE_HASH


def stage(page,expected=None):
    steps=page.locator('#finder-flow [data-flow-step]')
    expect(steps).to_have_count(5)
    current=page.locator('#finder-flow [aria-current=step]')
    expect(current).to_have_count(1)
    if expected is not None:
        expect(current).to_have_attribute('data-flow-step',str(expected))
    return int(current.get_attribute('data-flow-step'))


def node(page,id):
    return page.locator('[data-exploration-node="'+id+'"]')


def exp_action(page,action):
    return qa.public_control(page.locator('[data-exploration-action="'+action+'"]'))


def capture(page,engine,width,name,full=False):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    qa.no_overflow(page,(engine,width,name))
    page.screenshot(path=str(OUTPUT/f'{engine}-{width}-{name}.png'),full_page=full)
    return {'stage':stage(page),'tree_nodes':page.locator('[data-exploration-node]').count(),
            'selected':page.locator('[data-exploration-node][aria-pressed=true]').get_attribute('data-exploration-node') if page.locator('[data-exploration-node][aria-pressed=true]').count() else None,
            'view':page.locator('.path-finder').get_attribute('data-finder-step')}


def activate(control,width):
    if width in (768,1024):
        control.tap()
    else:
        control.click()


def send_answer(page,guard,text=MEMO,*,to_map=False):
    qa.guide_answer(page).fill(text)
    page.locator('#guide-answer-form button[type=submit]').click()
    return qa.send_preview(page,guard,to_map=to_map)


def start(page,guard,width=390):
    page.goto(qa.BASE+'/')
    activate(page.locator('.home-finder-start'),width)
    expect(page.locator('#guide-capability')).to_contain_text('毎回')
    expect(page.locator('#exploration-tree-map')).to_be_visible()
    stage(page,1)
    assert not guard.posts


def read_university(page,width=390):
    activate(node(page,'atlas-route-university'),width)
    expect(page.locator('.atlas-detail #atlas-title')).to_have_text('大学・短大で学ぶ')
    expect(node(page,'atlas-route-university')).to_have_attribute('aria-pressed','true')
    stage(page,3)
    expect(page.locator('.atlas-facets > div')).to_have_count(8)


def choose_comparison(page,width=390):
    # Existing normal reading controls and the map must share the same IDs.
    qa.finder_action(page,'comparison-picker').click()
    expect(page.locator('#finder-comparison-picker')).to_be_visible()
    for id in ['route-work','route-university']:
        button=page.locator(f'#finder-comparison-picker [data-finder-action=route-compare][data-finder-node="{id}"]')
        if button.get_attribute('aria-pressed')!='true':
            activate(button,width)
        expect(node(page,'atlas-'+id)).to_have_attribute('data-exploration-compared','true')
    qa.finder_action(page,'compare').click()
    expect(page.locator('.atlas-compare-row')).to_have_count(8)
    stage(page,4)


def record_and_preview(page):
    qa.finder_action(page,'record').click()
    stage(page,5)
    page.locator('#finder-notes').fill(NOTES)
    page.locator('#finder-next-actions').fill(NEXT)
    expect(page.locator('[data-exploration-kind=action]')).not_to_have_count(0)
    document=qa.save_preview(page)
    assert document['format']=='repath-finder-session' and document['schemaVersion']==2
    assert document['session']['notes']==NOTES and document['session']['nextActions']==NEXT
    assert document['session']['guide']['conversation'] is None
    assert set(document['session']['atlas']['compare'])=={'route-work','route-university'}
    assert document['session']['exploration']['step']==5
    return document



def initial_entry_review(browser,engine,width,height=1000):
    with qa.page_fixture(browser,width=width,touch=width in (768,1024)) as (page,guard):
        if height!=1000:
            page.set_viewport_size({'width':width,'height':height})
        start(page,guard,width)
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        tree=page.locator('#exploration-tree-map')
        first=page.locator('[data-guide-choice]').first
        expect(tree).to_be_in_viewport(ratio=.5)
        expect(first).to_be_in_viewport(ratio=.5)
        assert first.evaluate('(element)=>{const box=element.getBoundingClientRect();const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return hit===element||element.contains(hit);}')
        capture(page,engine,width,'01-start' if height==1000 else '01-start-landscape')
        assert not guard.posts
        return {'width':width,'height':height,'first_choice_in_viewport_and_tappable':True,'map_seed_in_viewport':True,'tree':tree.bounding_box(),'first_choice':first.bounding_box()}



def reading_title_visible(page):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    title=page.locator('.atlas-detail #atlas-title')
    expect(title).to_be_in_viewport(ratio=1)
    box=title.bounding_box()
    header=page.locator('.finder-journey').bounding_box()
    map_host=page.locator('#finder-tree-host')
    map_box=map_host.bounding_box()
    sticky=map_host.evaluate('(element)=>getComputedStyle(element).position')=='sticky'
    footer=page.locator('#finder-next-step').bounding_box()
    above=max(header['y']+header['height'],map_box['y']+map_box['height'] if sticky else 0)
    assert box['y']>=above-1,(box,above)
    assert box['y']+box['height']<=footer['y']+1,(box,footer)
    prose=page.locator('.atlas-node-summary').bounding_box()
    line=page.locator('.atlas-node-summary').evaluate('(element)=>parseFloat(getComputedStyle(element).lineHeight)')
    assert prose['y']+line<=footer['y']+1,(prose,line,footer)
    assert title.evaluate('(element)=>{const box=element.getBoundingClientRect();const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return hit===element||element.contains(hit);}')
    return {'title':box,'map_bottom':map_box['y']+map_box['height'],'footer_top':footer['y'],'first_description_line_bottom':prose['y']+line}


def tablet_reading_review(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=True) as (page,guard):
        start(page,guard,width)
        guard.action='explain'
        send_answer(page,guard)
        guard.action='show_routes'
        qa.guide_action(page,'prepare-routes').click()
        qa.send_preview(page,guard,to_map=True)
        read_university(page,width)
        direct=reading_title_visible(page)
        capture(page,engine,width,'04-tree-to-reading')
        connection=page.locator('.atlas-connections [data-atlas-action=connection]').first
        target=connection.get_attribute('data-atlas-node')
        connection.tap()
        expect(node(page,'atlas-'+target)).to_have_attribute('aria-pressed','true')
        related=reading_title_visible(page)
        capture(page,engine,width,'05-reading-to-tree')
        return {'width':width,'tree_to_detail':direct,'reading_to_related_detail':related,'selected_tree_route_matches':True}



def phone_growth_visibility(page):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    expect(page.locator('#exploration-tree-map')).to_be_in_viewport(ratio=.5)
    page.wait_for_function('''() => {
        const map=document.getElementById('exploration-tree-map').getBoundingClientRect();
        return [...document.querySelectorAll('[data-exploration-kind=answer],[data-exploration-kind=interpretation]')].some(element=>{
            const box=element.getBoundingClientRect();
            const width=Math.max(0,Math.min(box.right,map.right,innerWidth)-Math.max(box.left,map.left,0));
            const height=Math.max(0,Math.min(box.bottom,map.bottom,innerHeight)-Math.max(box.top,map.top,0));
            return box.width*box.height>0&&width*height/(box.width*box.height)>=.5;
        });
    }''')
    prose=page.locator('.guide-explanation p').bounding_box()
    line=page.locator('.guide-explanation p').evaluate('(element)=>parseFloat(getComputedStyle(element).lineHeight)')
    font_size=page.locator('.guide-explanation p').evaluate('(element)=>parseFloat(getComputedStyle(element).fontSize)')
    assert prose['y']>=0 and prose['y']+font_size<=page.viewport_size['height'],(prose,font_size)
    visible_fraction=max(0,min(line,page.viewport_size['height']-prose['y']))/line
    return {'map_and_personal_growth_visible':True,'normal_ai_explanation_start_visible':True,'first_line_visible_fraction':visible_fraction,'explanation':prose}


def phone_growth_review(browser,engine,width):
    with qa.page_fixture(browser,width=width) as (page,guard):
        start(page,guard,width)
        guard.action='explain'
        send_answer(page,guard)
        result=phone_growth_visibility(page)
        capture(page,engine,width,'02-self-grows')
        prose=page.locator('.guide-explanation p')
        prose.scroll_into_view_if_needed()
        expect(prose).to_be_in_viewport(ratio=.9)
        header=page.locator('.finder-journey').bounding_box()
        assert prose.bounding_box()['y']>=header['y']+header['height']-1
        result['explanation_fully_readable_after_scroll']=True
        assert len(guard.posts)==1
        return {'width':width,**result,'mock_posts':1,'provider_posts':0}


def journey(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=width in (768,1024)) as (page,guard):
        audit=[]
        start(page,guard,width)
        audit.append(capture(page,engine,width,'01-start'))
        before=page.locator('[data-exploration-node]').count()
        guard.action='explain'
        send_answer(page,guard)
        expect(page.locator('[data-exploration-origin=answer]')).not_to_have_count(0)
        expect(page.locator('[data-exploration-kind=interpretation]')).not_to_have_count(0)
        expect(page.locator('#finder-thinking-summary')).to_contain_text('AI')
        expect(page.locator('#finder-thinking-summary')).to_contain_text('本人')
        if width in (320,390):
            phone_growth_visibility(page)
        audit.append(capture(page,engine,width,'02-self-grows'))
        guard.action='show_routes'
        qa.guide_action(page,'prepare-routes').click()
        qa.send_preview(page,guard,to_map=True)
        stage(page,2)
        for id in ['atlas-route-work','atlas-route-university']:
            expect(node(page,id)).to_have_attribute('data-exploration-highlighted','true')
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        page.wait_for_function('''() => {
            const map=document.getElementById('exploration-tree-map').getBoundingClientRect();
            return [...document.querySelectorAll('[data-exploration-highlighted=true]')].some(element=>{
                const box=element.getBoundingClientRect();
                const width=Math.max(0,Math.min(box.right,map.right,innerWidth)-Math.max(box.left,map.left,0));
                const height=Math.max(0,Math.min(box.bottom,map.bottom,innerHeight)-Math.max(box.top,map.top,0));
                return box.width*box.height>0 && width*height/(box.width*box.height)>=.5;
            });
        }''')
        # Reference directions not highlighted by this fabricated response remain.
        expect(node(page,'atlas-route-specialist')).to_have_count(1)
        audit.append(capture(page,engine,width,'03-routes-grow'))
        read_university(page,width)
        if width in (768,1024):
            reading_title_visible(page)
        audit.append(capture(page,engine,width,'04-tree-to-reading'))
        connection=page.locator('.atlas-connections [data-atlas-action=connection]').first
        target=connection.get_attribute('data-atlas-node')
        activate(connection,width)
        expect(node(page,'atlas-'+target)).to_have_attribute('aria-pressed','true')
        if width in (768,1024):
            reading_title_visible(page)
        audit.append(capture(page,engine,width,'05-reading-to-tree'))
        read_university(page,width)
        choose_comparison(page,width)
        audit.append(capture(page,engine,width,'06-comparison'))
        document=record_and_preview(page)
        audit.append(capture(page,engine,width,'07-action-save'))
        raw=qa.download_finder(page)
        assert json.loads(raw)==document
        (OUTPUT/f'{engine}-{width}-finder.json').write_text(raw)
        before_posts=len(guard.posts)
        page.reload()
        qa.finder_import(page).set_input_files({'name':'saved-finder.json','mimeType':'application/json','buffer':raw.encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        expect(page.locator('#finder-notes')).to_have_value(NOTES)
        expect(page.locator('#finder-next-actions')).to_have_value(NEXT)
        for id in ['atlas-route-work','atlas-route-university']:
            expect(node(page,id)).to_have_attribute('data-exploration-compared','true')
        stage(page,5)
        assert len(guard.posts)==before_posts
        audit.append(capture(page,engine,width,'08-restored'))
        qa.finder_action(page,'overview').click() if page.locator('[data-finder-action=overview]').count() and page.locator('[data-finder-action=overview]').first.is_visible() else page.locator('[data-finder-mode=all]').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        for id in ['atlas-route-work','atlas-route-university','atlas-route-specialist']:
            expect(node(page,id)).to_have_count(1)
        assert len(guard.posts)==2
        return {'width':width,'states':audit,'tree_growth_after_answer':True,'two_way_route_navigation':True,'comparison_facets':8,'json_v2_roundtrip_no_send':True,'provider_posts':0,'mock_posts':2}


def edit_selected(page,label,detail):
    exp_action(page,'edit').click()
    page.locator('#exploration-note-label').fill(label)
    page.locator('#exploration-note-detail').fill(detail)
    page.locator('#exploration-note-form button[type=submit]').click()


def edited_node_and_ai(browser,engine):
    with qa.page_fixture(browser,width=768,touch=True) as (page,guard):
        start(page,guard,768)
        send_answer(page,guard)
        interpretation=page.locator('[data-exploration-kind=interpretation]').first
        selected_id=interpretation.get_attribute('data-exploration-node')
        interpretation.tap()
        expect(page.locator('#finder-node-detail')).to_contain_text('解釈')
        label='自分で直した見方'
        detail='大学に興味がないわけではない。内容を知らないので、まず違いを見たい。'
        edit_selected(page,label,detail)
        expect(node(page,selected_id)).to_contain_text(label)
        expect(node(page,selected_id)).to_have_attribute('data-exploration-origin','user_edited')
        # Exercise real Undo in the shared view, then reapply the deliberate edit.
        exp_action(page,'undo').click()
        expect(node(page,selected_id)).not_to_contain_text(label)
        node(page,selected_id).tap()
        edit_selected(page,label,detail)
        if page.locator('[data-finder-mode=ai]').is_visible():
            page.locator('[data-finder-mode=ai]').click()
        guard.action='show_routes'
        qa.guide_action(page,'prepare-routes').click()
        qa.send_preview(page,guard,to_map=True)
        expect(node(page,selected_id)).to_contain_text(label)
        expect(node(page,selected_id)).to_have_attribute('data-exploration-origin','user_edited')
        node(page,selected_id).tap()
        expect(page.locator('#finder-node-detail')).to_contain_text(detail)
        # A newly added manual note is also kept when the AI has new content.
        exp_action(page,'add').click()
        page.locator('#exploration-note-label').fill('見学で確かめたいこと')
        page.locator('#exploration-note-detail').fill('説明だけでなく、日々の活動を見てから考えたい。')
        page.locator('#exploration-note-form button[type=submit]').click()
        manual=page.locator('[data-exploration-origin=manual]').filter(has_text='見学で確かめたいこと')
        expect(manual).to_have_count(1)
        manual_id=manual.get_attribute('data-exploration-node')
        capture(page,engine,768,'manual-edits-protected')
        qa.finder_action(page,'record').click()
        doc=qa.save_preview(page)
        assert any(entry['id']==selected_id and entry['label']==label for entry in doc['session']['exploration']['overrides'])
        assert any(entry['id']==manual_id for entry in doc['session']['exploration']['notes'])
        assert label in page.locator('#finder-save-preview').inner_text()
        raw=qa.download_finder(page)
        page.reload();qa.finder_import(page).set_input_files({'name':'edited.json','mimeType':'application/json','buffer':raw.encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        expect(node(page,selected_id)).to_contain_text(label)
        expect(node(page,manual_id)).to_contain_text('見学で確かめたいこと')
        # Export the same current projection through the existing Tree document contract.
        with page.expect_download() as result:
            exp_action(page,'export').click()
        tree_doc=json.loads(Path(result.value.path()).read_text())
        assert tree_doc['format']=='re-tree' and tree_doc['version']==1
        assert any(entry['label']==label for entry in tree_doc['tree']['nodes'])
        return {'manual_override_survives_new_ai':True,'shared_undo':True,'manual_note_roundtrip':True,'tree_v1_export':True,'provider_posts':0}



def corrected_and_delayed(browser,engine):
    with qa.page_fixture(browser,width=768,touch=True) as (page,guard):
        start(page,guard,768)
        guard.action='explain'
        send_answer(page,guard)
        interpretation=page.locator('[data-exploration-kind=interpretation]').first
        original_id=interpretation.get_attribute('data-exploration-node')
        interpretation.tap()
        qa.finder_action(page,'correct-shared').click()
        correction='大学が嫌なのではなく、学ぶ中身をまだ知らない。'
        page.locator('#guide-correction').fill(correction)
        page.locator('#guide-correction-form button[type=submit]').click()
        expect(page.locator('[data-exploration-kind=correction]')).to_have_count(1)
        page.locator('[data-exploration-kind=correction]').first.tap()
        expect(page.locator('#finder-node-detail')).to_contain_text(correction)
        expect(node(page,original_id)).to_have_attribute('data-exploration-stale','true')
        assert len(guard.posts)==1,'A local correction is not consent to transmit.'
        guard.behavior='hold'
        qa.guide_action(page,'prepare-routes').click()
        page.locator('#guide-consent').check()
        qa.guide_action(page,'send').click()
        expect(page.locator('.guide-loading')).to_be_visible()
        assert len(guard.posts)==2
        assert correction in guard.posts[-1]['corrections'][-1]['text']
        qa.guide_action(page,'correct').first.click()
        latest='追加の訂正。学び方だけでなく、働く生活との違いも知りたい。'
        page.locator('#guide-correction').fill(latest)
        page.locator('#guide-correction-form button[type=submit]').click()
        guard.release()
        expect(page.locator('.guide-loading')).to_have_count(0)
        expect(page.locator('[data-exploration-kind=correction]')).to_have_count(2)
        expect(node(page,original_id)).to_have_attribute('data-exploration-stale','true')
        expect(page.locator('[data-exploration-highlighted=true]')).to_have_count(0)
        guard.behavior='success'
        guard.action='show_routes'
        qa.guide_action(page,'prepare-routes').click()
        body=qa.send_preview(page,guard,to_map=True)
        assert latest in body['corrections'][-1]['text']
        expect(page.locator('[data-exploration-kind=correction]')).to_have_count(2)
        capture(page,engine,768,'corrected-after-delayed-response')
        return {'local_correction_shared_without_send':True,'old_response_does_not_revert_correction':True,'next_consent_contains_latest_correction':True,'mock_posts':3,'provider_posts':0}


def unavailable_cancel_and_keyboard(browser,engine):
    with qa.page_fixture(browser,width=390,configured=False) as (page,guard):
        page.goto(qa.BASE+'/')
        page.locator('.home-map-start').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        expect(page.locator('#exploration-tree-map')).to_be_visible()
        assert not guard.posts and not guard.gets
        target=node(page,'atlas-route-university')
        target.focus();page.keyboard.press('Enter')
        expect(page.locator('.atlas-detail #atlas-title')).to_have_text('大学・短大で学ぶ')
        expect(target).to_have_attribute('aria-pressed','true')
        choose_comparison(page)
        qa.finder_action(page,'record').click()
        expect(qa.finder_action(page,'summarize-guide')).to_be_disabled()
        page.locator('#finder-notes').fill('架空の持ち帰りメモ。まだ一つには決めていない。')
        doc=qa.save_preview(page)
        # Returning to editing a preview must not silently download or discard it.
        downloads=[];page.on('download',lambda item:downloads.append(item))
        qa.finder_action(page,'edit-save').click()
        expect(page.locator('#finder-notes')).to_have_value(doc['session']['notes'])
        assert not downloads
        # Restore cancellation keeps both the shared map and the normal text.
        page.remove_listener('dialog',guard.dialog_handler)
        page.on('dialog',lambda dialog:dialog.dismiss())
        with page.expect_event('dialog') as cancelled:
            qa.finder_import(page).set_input_files({'name':'cancel.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        assert cancelled.value.type=='confirm'
        expect(page.locator('#finder-notes')).to_have_value(doc['session']['notes'])
        expect(node(page,'atlas-route-university')).to_have_attribute('data-exploration-compared','true')
        assert not guard.posts and not guard.gets
        capture(page,engine,390,'unavailable-keyboard-cancel')
        return {'no_ai_map_and_compare':True,'unconfigured_summary_disabled':True,'keyboard_tree_to_reading':True,'save_preview_edit_keeps_notes':True,'restore_cancel_keeps_state':True,'function_posts':0,'function_gets':0}



def unfinished_draft_and_reading_geometry(browser,engine):
    with qa.page_fixture(browser,width=768,touch=True,configured=False) as (page,guard):
        page.goto(qa.BASE+'/#/finder?mode=all')
        read_university(page,768)
        exp_action(page,'add').click()
        label='まだ反映していないメモ'
        detail='文章をなくさず、反映する前にファイル操作へ行った場合を確かめる。'
        page.locator('#exploration-note-label').fill(label)
        page.locator('#exploration-note-detail').fill(detail)
        downloads=[];page.on('download',lambda item:downloads.append(item))
        exp_action(page,'export').click()
        expect(page.locator('#finder-error')).to_contain_text('書きかけ')
        expect(page.locator('#exploration-note-label')).to_have_value(label)
        qa.finder_action(page,'record').click()
        page.locator('#finder-notes').fill('復元で消してはいけないメモ。')
        qa.finder_action(page,'save-preview').click()
        expect(page.locator('#finder-error')).to_contain_text('書きかけ')
        expect(page.locator('#finder-save-preview')).to_have_count(0)
        expect(page.locator('#exploration-note-detail')).to_have_value(detail)
        raw=(OUTPUT/f'{engine}-390-finder.json').read_bytes()
        qa.finder_import(page).set_input_files({'name':'draft-guard.json','mimeType':'application/json','buffer':raw})
        expect(page.locator('#finder-import')).to_have_value('')
        expect(page.locator('#exploration-note-label')).to_have_value(label)
        expect(page.locator('#finder-notes')).to_have_value('復元で消してはいけないメモ。')
        assert not downloads
        page.locator('#exploration-note-form button[type=submit]').click()
        read_university(page,768)
        page.locator('.atlas-detail [data-atlas-action=children]').click()
        children=page.locator('#atlas-children')
        expect(children).to_be_in_viewport()
        title=children.bounding_box()
        sticky=page.locator('.finder-journey').bounding_box()
        host=page.locator('#finder-tree-host')
        host_position=host.evaluate('(element)=>getComputedStyle(element).position')
        assert title['y']>=sticky['y']+sticky['height']-1,(title,sticky)
        if host_position=='sticky':
            box=host.bounding_box()
            assert title['y']>=box['y']+box['height']-1,(title,box)
        capture(page,engine,768,'manual-tools-reading-geometry')
        # Display preference is part of the same exploration, not another app.
        page.locator('#exploration-emphasis').select_option('text')
        expect(page.locator('#finder-shared-workspace')).to_have_attribute('data-exploration-emphasis','text')
        expect(node(page,'atlas-route-university')).to_have_attribute('aria-pressed','true')
        page.locator('#exploration-emphasis').select_option('map')
        expect(page.locator('#finder-shared-workspace')).to_have_attribute('data-exploration-emphasis','map')
        expect(node(page,'atlas-route-university')).to_have_attribute('aria-pressed','true')
        assert not guard.posts and not guard.gets
        return {'unfinished_tree_blocks_file_export_save_restore':True,'draft_and_notes_kept':True,'reading_not_covered_after_manual_tools':True,'emphasis_changes_keep_same_selection':True}



def optional_summary_review(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=width==768) as (page,guard):
        start(page,guard,width)
        guard.action='show_routes'
        send_answer(page,guard,to_map=True)
        read_university(page,width)
        label='大学の学びも、保留で残す'
        edit_selected(page,label,'授業の中身を知らないので、急いで一つには決めない。')
        choose_comparison(page,width)
        qa.finder_action(page,'record').click()
        page.locator('#finder-notes').fill(NOTES)
        page.locator('#finder-next-actions').fill(NEXT)
        before=len(guard.posts)
        qa.finder_action(page,'summarize-guide').click()
        expect(page.locator('#guide-consent')).not_to_be_checked()
        expect(page.locator('#guide-preview-title')).to_be_visible()
        assert len(guard.posts)==before
        preview=json.loads(page.locator('#guide-send-preview').text_content())
        assert preview['context']['goal']=='summarize'
        assert NOTES not in json.dumps(preview,ensure_ascii=False) and label not in json.dumps(preview,ensure_ascii=False)
        qa.guide_action(page,'cancel-preview').click()
        assert len(guard.posts)==before
        # Cancelling a summary must not redirect a later, different AI reply.
        guard.action='explain'
        qa.guide_action(page,'explain').click()
        qa.send_preview(page,guard)
        stage(page,1)
        expect(page.locator('#guide-title')).to_be_visible()
        qa.finder_action(page,'record').click()
        expect(page.locator('#finder-notes')).to_have_value(NOTES)
        expect(page.locator('#finder-next-actions')).to_have_value(NEXT)
        expect(node(page,'atlas-route-university')).to_contain_text(label)
        qa.finder_action(page,'summarize-guide').click()
        expect(page.locator('#guide-consent')).not_to_be_checked()
        latest=json.loads(page.locator('#guide-send-preview').text_content())
        result=qa.guide_fixture(latest)
        summary='学びの中身と日々の生活を並べ、未確認の条件を残した、検証用の架空のまとめです。'
        result['explanation']=summary
        guard.payload=result
        before=len(guard.posts)
        page.locator('#guide-consent').check()
        qa.guide_action(page,'send').click()
        expect(page.locator('#finder-record-title')).to_be_visible()
        stage(page,5)
        assert len(guard.posts)==before+1 and guard.posts[-1]==latest
        expect(page.locator('#finder-notes')).to_have_value(NOTES)
        expect(page.locator('#finder-next-actions')).to_have_value(NEXT)
        expect(node(page,'atlas-route-university')).to_contain_text(label)
        for id in ['atlas-route-work','atlas-route-university']:
            expect(node(page,id)).to_have_attribute('data-exploration-compared','true')
        expect(page.locator('.finder-review-progress')).to_contain_text(summary)
        recap=page.locator('.finder-review-progress')
        recap.locator('details').last.locator('summary').click()
        recap.evaluate('element => {const flow=document.querySelector("#finder-flow");const offset=flow?Math.max(0,flow.getBoundingClientRect().bottom):0;window.scrollBy(0,element.getBoundingClientRect().top-offset-16)}')
        capture(page,engine,width,'09-ai-summary')
        doc=qa.save_preview(page)
        assert doc['session']['guide']['summary']==summary
        assert doc['session']['notes']==NOTES and doc['session']['nextActions']==NEXT
        assert any(entry['label']==label for entry in doc['session']['exploration']['overrides'])
        page.locator('[data-finder-mode=ai]').click()
        guard.payload=None
        guard.action='compare'
        qa.guide_action(page,'compare').click()
        qa.send_preview(page,guard,to_map=True)
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        page.locator('.atlas-compare-heading [data-atlas-action=node][data-atlas-node=route-university]').click()
        expect(page.locator('.atlas-guide-mark[data-atlas-guide=route-university]')).to_contain_text('この回答から、内容と条件を比べる参考にできます。')
        expect(node(page,'atlas-route-university')).to_contain_text(label)
        capture(page,engine,width,'10-ai-compare-reason')
        page.wait_for_load_state('networkidle')
    return {'width':width,'ai_compare_keeps_reason_and_alias':True,'summary_preview_fresh_consent_no_autosend':True,'personal_notes_and_alias_not_sent':True,'cancel_does_not_redirect_different_reply':True,'accepted_summary_returns_to_step5':True,'notes_actions_alias_comparison_preserved':True}


def standalone_tree_kept(browser,engine):
    with qa.page_fixture(browser,width=1024) as (page,guard):
        page.goto(qa.BASE+'/#/tree')
        page.locator('[data-start=blank]').click()
        page.locator('.tree-feature [data-node]').first.click()
        page.locator('[data-edit-start]').click()
        page.locator('#edit-label').fill('元の編集用Treeを残す')
        page.locator('#node-edit-form button[type=submit]').click()
        expect(page.locator('.tree-feature [data-node]').filter(has_text='元の編集用Treeを残す')).to_have_count(1)
        page.locator('a[href="#/finder"]').first.click()
        expect(page.locator('#guide-capability')).to_contain_text('毎回')
        guard.action='show_routes'
        send_answer(page,guard,to_map=True)
        expect(page.locator('#exploration-tree-map')).to_be_visible()
        # Navigate inside the same app; reloading would deliberately reset memory.
        page.locator('a[href="#/"]').first.click()
        page.locator('a[href="#/tree"]').first.click()
        expect(page.locator('.tree-feature [data-node]').filter(has_text='元の編集用Treeを残す')).to_have_count(1)
        with page.expect_download() as result:
            qa.public_control(page.locator('#export-tree')).click()
        old_doc=json.loads(Path(result.value.path()).read_text())
        assert old_doc['format']=='re-tree' and old_doc['version']==1
        assert any(entry['label']=='元の編集用Treeを残す' for entry in old_doc['tree']['nodes'])
        capture_path=OUTPUT/f'{engine}-standalone-manual-tree-kept.png'
        page.screenshot(path=str(capture_path))
        return {'legacy_editor_not_overwritten_by_growth':True,'legacy_tree_v1_export':True}


def main():
    guarded_hashes()
    widths=[int(value) for value in os.environ.get('INTEGRATED_WIDTHS','320,390,768,1024,1440').split(',')]
    engines=os.environ.get('INTEGRATED_ENGINES','chromium,webkit').split(',')
    audit={}
    with sync_playwright() as p:
        for engine in engines:
            options={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {'executable_path':'/workspace/webkit-runtime/run-webkit.sh'}
            browser=getattr(p,engine).launch(**options)
            try:
                audit[engine]={'journeys':[],'initial_entry':[]}
                for width in widths:
                    print(engine,width,'shared journey',flush=True)
                    audit[engine]['initial_entry'].append(initial_entry_review(browser,engine,width))
                    audit[engine]['journeys'].append(journey(browser,engine,width))
                if os.environ.get('INTEGRATED_MATRIX_ONLY')!='1':
                    audit[engine]['edited_and_ai']=edited_node_and_ai(browser,engine)
                    audit[engine]['corrected_delayed']=corrected_and_delayed(browser,engine)
                    audit[engine]['unavailable_cancel_keyboard']=unavailable_cancel_and_keyboard(browser,engine)
                    audit[engine]['draft_guard_geometry']=unfinished_draft_and_reading_geometry(browser,engine)
                    # Keep the extra consent/AI lifecycle isolated from the large
                    # journey browser; no route handlers or pages cross cases.
                    summary_browser=getattr(p,engine).launch(**options)
                    try:
                        audit[engine]['optional_summary']=optional_summary_review(summary_browser,engine,390)
                    finally:
                        summary_browser.close()
                    audit[engine]['standalone_kept']=standalone_tree_kept(browser,engine)
            finally:
                browser.close()
            (OUTPUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    guarded_hashes()
    print(json.dumps(audit,ensure_ascii=False),flush=True)


if __name__=='__main__':
    main()
