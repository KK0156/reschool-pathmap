"""Progressive Finder journey review, using fabricated AI fixtures only.

This test reuses the network/storage/CSP guard from the guided acceptance suite.
It checks the navigation sequence, rather than adding new product features.
"""
import importlib.util
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(os.environ.get('FINDER_FLOW_OUTPUT','/workspace/reschool-flow-review/after'))
OUTPUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('guided_flow_helpers',ROOT/'tests/guided-discovery-browser.py')
qa=importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
qa.OUTPUT=OUTPUT


def current_step(page,number):
    current=page.locator('#finder-flow [data-flow-step][aria-current="step"]')
    expect(current).to_have_count(1)
    expect(current).to_have_attribute('data-flow-step',str(number))
    expect(current).to_contain_text({1:'自分を知る',2:'可能性を広げる',3:'道を深く知る',4:'比較して考える',5:'次の行動を整理する'}[number])
    expect(current).to_be_visible()


def next_primary(page,action=None):
    primary=page.locator('.finder-next-step .flow-primary')
    expect(primary).to_have_count(1)
    expect(primary).to_be_visible()
    expect(primary).to_be_in_viewport(ratio=.85)
    if action is not None:
        expect(primary).to_have_attribute('data-finder-action',action)
    return primary


def safe_heading(page,selector):
    heading=page.locator(selector)
    expect(heading).to_be_in_viewport(ratio=1)
    sticky=page.locator('.finder-journey').bounding_box()
    title=heading.bounding_box()
    if sticky and sticky['y']>=-1 and sticky['y']<100:
        assert title['y']>=sticky['y']+sticky['height']-1,(selector,title,sticky)


def capture(page,engine,width,name):
    qa.no_overflow(page,(engine,width,name))
    page.screenshot(path=str(OUTPUT/f'{engine}-{width}-{name}.png'))


def activate(control,width):
    if width in (768,1024):
        control.tap()
    else:
        control.click()


def send_answer(page,guard,on_preview=lambda:None):
    page.locator('#guide-answer').fill('大学で学ぶことと働くこと、内容や生活の違いを知りたい。架空の相談。')
    page.locator('#guide-answer-form button[type=submit]').click()
    assert not guard.posts
    expect(page.locator('#guide-consent')).not_to_be_checked()
    on_preview()
    # Sending without consent is rejected, and the payload can be inspected.
    qa.guide_action(page,'send').click()
    expect(page.locator('#guide-error')).to_contain_text('同意')
    assert not guard.posts
    preview=json.loads(page.locator('#guide-send-preview').text_content())
    page.locator('#guide-consent').check()
    qa.guide_action(page,'send').click()
    expect(page.locator('.finder-route-card')).to_have_count(2)
    assert guard.posts==[preview]


def route_to_action_journey(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=width in (768,1024)) as (page,guard):
        screenshots=[]
        def shot(name):
            capture(page,engine,width,name)
            screenshots.append(name)
        page.goto(qa.BASE+'/')
        shot('home')
        activate(page.locator('.home-finder-start'),width)
        expect(page.locator('#guide-capability')).to_contain_text('毎回')
        current_step(page,1)
        expect(page.locator('#guide-answer-form button[type=submit]')).to_be_visible()
        # Extra AI operations remain available through disclosure, away from the first action.
        expect(page.locator('[data-guide-action="explain"]')).not_to_be_visible()
        expect(page.locator('[data-guide-action="trial"]')).not_to_be_visible()
        expect(page.locator('[data-guide-action="summarize"]')).not_to_be_visible()
        expect(page.locator('[data-finder-mode="all"]')).to_be_visible()
        assert not guard.posts
        shot('consultation')
        guard.action='show_routes'
        send_answer(page,guard,on_preview=lambda:shot('send-preview'))
        current_step(page,2)
        shot('routes')
        # The integrated journey now separates reading a route from seeing the
        # overall directions, without losing the same map or previous answers.
        activate(qa.finder_action(page,'route-detail','route-university'),width)
        current_step(page,3)
        expect(page.locator('.atlas-detail')).to_contain_text('大学・短大で学ぶ')
        expect(page.locator('[data-exploration-node="atlas-route-university"]')).to_have_attribute('aria-pressed','true')
        shot('route-detail')
        activate(qa.finder_view(page,'attention'),width)
        current_step(page,2)
        activate(next_primary(page,'comparison-picker'),width)
        expect(page.locator('#finder-comparison-picker')).to_be_visible()
        current_step(page,2)
        primary=next_primary(page,'comparison-picker')
        expect(primary).to_be_disabled()
        shot('compare-pick-zero')
        picker=page.locator('#finder-comparison-picker')
        for count,node_id in enumerate(['route-work','route-university'],start=1):
            activate(picker.locator(f'[data-finder-action="route-compare"][data-finder-node="{node_id}"]'),width)
            expect(picker.locator(f'[data-finder-action="route-compare"][data-finder-node="{node_id}"]')).to_have_attribute('aria-pressed','true')
            primary=next_primary(page,'comparison-picker' if count==1 else 'compare')
            if count==1:
                expect(primary).to_contain_text('もう一つ')
            else:
                expect(primary).to_be_enabled()
            shot('compare-pick-'+str(count))
        activate(next_primary(page,'compare'),width)
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        current_step(page,4)
        safe_heading(page,'#atlas-title')
        shot('comparison')
        activate(next_primary(page,'record'),width)
        current_step(page,5)
        expect(page.locator('#finder-record-title')).to_be_visible()
        expect(page.locator('.finder-record')).to_contain_text('働く')
        expect(page.locator('.finder-record')).to_contain_text('大学・短大で学ぶ')
        notes='比べた二つとも残しておきたい。授業と仕事の具体例を確かめたい。'
        action='次の面談で、費用と生活の違いを先生に一つ質問する。'
        page.locator('#finder-notes').fill(notes)
        page.locator('#finder-next-actions').fill(action)
        shot('next-step')
        doc=qa.save_preview(page)
        assert set(doc['session']['atlas']['compare'])=={'route-work','route-university'}
        assert doc['session']['notes']==notes and doc['session']['nextActions']==action
        assert doc['session']['guide']['conversation'] is None
        assert not page.locator('#finder-save-preview pre').is_visible(),'Raw file data stays secondary to the save action.'
        shot('save-preview')
        raw=qa.download_finder(page)
        assert json.loads(raw)==doc
        (OUTPUT/f'{engine}-{width}-finder.json').write_text(raw)
        before=len(guard.posts)
        page.reload()
        page.locator('#finder-import').set_input_files({'name':'flow.json','mimeType':'application/json','buffer':raw.encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        current_step(page,5)
        expect(page.locator('#finder-notes')).to_have_value(notes)
        expect(page.locator('#finder-next-actions')).to_have_value(action)
        assert len(guard.posts)==before
        shot('restored')
        activate(page.locator('[data-finder-mode="all"]'),width)
        # The whole catalogue remains reachable even after a saved comparison.
        overview=page.locator('[data-finder-action="overview"]')
        if overview.count() and not page.locator('.atlas-card-grid > .atlas-card').count()==7:
            overview.first.click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        current_step(page,2)
        shot('whole-map-after-restore')
        assert len(guard.posts)==1
        return {'width':width,'screenshots':len(screenshots),'flow':[1,2,3,4,5],
                'single_contextual_next':True,'comparison_selection_states':[0,1,2],
                'comparison_facets':8,'saved_comparison_and_notes':True,
                'json_reload_restore_without_send':True,'all_seven_routes_remain_reachable':True,
                'ipad_sized_touch_activation':width in (768,1024),'mocked_posts':1}


def offline_path(browser,engine):
    with qa.page_fixture(browser,width=390,configured=False) as (page,guard):
        page.goto(qa.BASE+'/')
        page.locator('.home-map-start').click()
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        current_step(page,2)
        assert not guard.posts and not guard.gets
        next_primary(page,'comparison-picker').focus()
        page.keyboard.press('Enter')
        current_step(page,2)
        picker=page.locator('#finder-comparison-picker')
        for node in ['route-work','route-university']:
            toggle=picker.locator(f'[data-finder-action=route-compare][data-finder-node="{node}"]')
            toggle.focus()
            page.keyboard.press('Space')
            expect(toggle).to_be_focused()
        expect(next_primary(page,'compare')).to_be_enabled()
        # Changing one's mind must update the main action instead of advancing with stale picks.
        picker.locator('[data-finder-action=route-compare][data-finder-node=route-university]').focus()
        page.keyboard.press('Space')
        expect(picker.locator('[data-finder-action=route-compare][data-finder-node=route-university]')).to_be_focused()
        expect(next_primary(page,'comparison-picker')).to_contain_text('もう一つ')
        picker.locator('[data-finder-action=route-compare][data-finder-node=route-specialist]').focus()
        page.keyboard.press('Space')
        expect(picker.locator('[data-finder-action=route-compare][data-finder-node=route-specialist]')).to_be_focused()
        expect(next_primary(page,'compare')).to_be_enabled()
        next_primary(page,'compare').focus()
        page.keyboard.press('Enter')
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        assert set(page.locator('.atlas-compare-heading [data-atlas-action=node]').evaluate_all('els=>els.map(el=>el.dataset.atlasNode)'))=={'route-work','route-specialist'}
        next_primary(page,'record').focus()
        page.keyboard.press('Enter')
        current_step(page,5)
        page.locator('#finder-next-actions').fill('公式資料の生活・費用の違いを読む。')
        qa.save_preview(page)
        assert not guard.posts and not guard.gets
        capture(page,engine,390,'offline-next-step')
        return {'all_map_comparison_next_step_save_without_ai':True,'keyboard_primary_and_comparison':True,'deselect_and_rechoose_second_route':True,'function_gets':0,'function_posts':0}


def normal_question_to_routes(browser,engine):
    with qa.page_fixture(browser,width=390) as (page,guard):
        qa.first_answer(page,guard)
        current_step(page,1)
        expect(page.locator('#guide-answer-form')).to_be_visible()
        page.locator('#guide-answer').fill('学ぶ内容が日々の暮らしや仕事とどうつながるのか知りたい。')
        page.locator('#guide-answer-form button[type=submit]').click()
        second=qa.send_preview(page,guard)
        assert len(second['answers'])==2
        expect(page.locator('#guide-answer-form')).not_to_be_visible()
        primary=page.locator('.guide-stage-next .flow-primary')
        expect(primary).to_have_count(1)
        expect(primary).to_have_attribute('data-guide-action','prepare-routes')
        expect(primary).to_be_in_viewport(ratio=.85)
        capture(page,engine,390,'normal-question-next')
        primary.click()
        expect(page.locator('#guide-consent')).not_to_be_checked()
        assert len(guard.posts)==2
        guard.action='show_routes'
        body=qa.send_preview(page,guard,to_map=True)
        assert body['context']['goal']=='show_routes' and len(body['answers'])==2
        current_step(page,2)
        expect(page.locator('.finder-route-card')).to_have_count(2)
        assert len(guard.posts)==3
        return {'two_ask_responses_have_one_route_next_action':True,'further_question_optional':True,'each_send_requires_new_consent':True}


def selected_answer_next_review(browser,engine):
    results=[]
    for width in [320,390,768,1024,1440]:
        with qa.page_fixture(browser,width=width,touch=width in (768,1024)) as (page,guard):
            page.goto(qa.BASE+'/')
            activate(page.locator('.home-finder-start'),width)
            expect(page.locator('#guide-capability')).to_contain_text('毎回')
            choices=page.locator('[data-guide-choice]')
            tested=[]
            for position in range(5):
                chosen=choices.nth(position)
                if width==390:
                    chosen.focus()
                    page.keyboard.press('Space')
                else:
                    activate(chosen,width)
                expect(chosen).to_have_attribute('aria-pressed','true')
                expect(chosen).to_be_focused()
                next_button=page.locator('#guide-answer-form button[type=submit]')
                expect(next_button).to_have_count(1)
                expect(next_button).to_be_in_viewport(ratio=.85)
                assert next_button.locator('xpath=ancestor::*[contains(@class,"guide-choice-row")]').locator('[data-guide-choice]').get_attribute('data-guide-choice')==chosen.get_attribute('data-guide-choice')
                tested.append(position)
                if position==0:
                    capture(page,engine,width,'selected-answer-next')
            assert not guard.posts
            results.append({'width':width,'choice_positions':tested,'inline_single_next_in_viewport':True,'focus_preserved':True,'keyboard_selection':width==390,'mock_posts':0})
    return results


def save_review_invalidation(browser,engine):
    with qa.page_fixture(browser,width=390) as (page,guard):
        page.goto(qa.BASE+'/#/finder?mode=all')
        raw=(OUTPUT/f'{engine}-390-finder.json').read_bytes()
        page.locator('#finder-import').set_input_files({'name':'flow.json','mimeType':'application/json','buffer':raw})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        current_step(page,5)
        initial=qa.save_preview(page)
        memo='保存の確認後に、本人がもう一度書き直した確認メモ。'
        page.locator('#finder-notes').fill(memo)
        expect(page.locator('#finder-save-preview')).to_have_count(0)
        expect(qa.finder_action(page,'save-preview')).to_be_visible()
        updated=qa.save_preview(page)
        assert updated['session']['notes']==memo
        assert updated['session']['atlas']['compare']==initial['session']['atlas']['compare']
        include=page.locator('#finder-include-conversation')
        qa.open_disclosure(include)
        include.check()
        expect(page.locator('#finder-save-preview')).to_have_count(0)
        expect(qa.finder_action(page,'save-preview')).to_be_visible()
        qa.finder_action(page,'save-preview').click()
        reviewed=json.loads(page.locator('#finder-save-preview pre').text_content())
        assert reviewed['format']==initial['format'] and reviewed['schemaVersion']==initial['schemaVersion']
        assert reviewed['session']['notes']==memo
        include.uncheck()
        expect(page.locator('#finder-save-preview')).to_have_count(0)
        expect(qa.finder_action(page,'save-preview')).to_be_visible()
        reviewed=qa.save_preview(page)
        assert reviewed['session']['notes']==memo
        assert json.loads(qa.download_finder(page))==reviewed
        assert not guard.posts
        capture(page,engine,390,'save-review-after-edit')
        return {'note_change_invalidates_snapshot_and_restores_save_action':True,'include_toggle_both_directions_restores_save_action':True,'memo_comparison_and_format_preserved':True,'provider_posts':0}


def picker_navigation_and_restore(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=width==768) as (page,guard):
        page.goto(qa.BASE+'/')
        activate(page.locator('.home-map-start'),width)
        data=page.evaluate("async()=>(await import('/src/route-atlas-data.js')).routeAtlas")
        by_id={node['id']:node for node in data['nodes']}
        activate(next_primary(page,'comparison-picker'),width)
        expect(page.locator('#finder-comparison-picker')).to_be_visible()
        page.locator('.desk-nav a[href="#/"]').click()
        activate(page.locator('[data-home-map-node="route-work"]'),width)
        expect(page.locator('#atlas-title')).to_have_text(by_id['route-work']['title'])
        expect(page.locator('#finder-comparison-picker')).to_have_count(0)
        # Save a real, validated detail position. Only the top-level view changes
        # to resume the map; the atlas node/path is never fabricated by the test.
        record=qa.finder_action(page,'record').first
        qa.open_disclosure(record)
        record.click()
        doc=qa.save_preview(page)
        assert doc['session']['atlas']['selected']=='route-work'
        assert doc['session']['atlas']['view']=='detail'
        doc['session']['view']='all'
        activate(page.locator('[data-finder-mode="all"]'),width)
        activate(next_primary(page,'comparison-picker'),width)
        page.locator('#finder-import').set_input_files({'name':'detail.json','mimeType':'application/json','buffer':json.dumps(doc,ensure_ascii=False).encode()})
        expect(page.locator('#finder-status')).to_contain_text('復元しました')
        expect(page.locator('#finder-comparison-picker')).to_have_count(0)
        expect(page.locator('#atlas-title')).to_have_text(by_id['route-work']['title'])
        capture(page,engine,width,'final-restored-from-picker')
        # Explicit lens and walkthrough links must also replace a pending picker.
        activate(next_primary(page,'comparison-picker'),width)
        lens=data['lenses'][1]
        page.evaluate('hash=>{location.hash=hash}', '#/finder?mode=all&lens='+lens['id'])
        expect(page.locator('#finder-comparison-picker')).to_have_count(0)
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(len(lens['rootIds']))
        activate(next_primary(page,'comparison-picker'),width)
        demo=data['demos'][0]
        page.evaluate('hash=>{location.hash=hash}', '#/finder?mapDemo='+demo['id'])
        expect(page.locator('#finder-comparison-picker')).to_have_count(0)
        expect(page.locator('#atlas-title')).to_have_text(by_id[demo['path'][0]]['title'])
        activate(next_primary(page,'comparison-picker'),width)
        page.locator('.desk-nav a[href="#/"]').click()
        activate(page.locator('.home-map-start'),width)
        expect(page.locator('#finder-comparison-picker')).to_have_count(0)
        expect(page.locator('.atlas-card-grid > .atlas-card')).to_have_count(7)
        expect(page.locator('#atlas-title')).to_have_text(data['lenses'][0]['title'])
        assert not guard.posts and not guard.gets
        return {'width':width,'home_route_replaces_picker':True,'valid_saved_detail_replaces_picker':True,'lens_and_demo_replace_picker':True,'home_all_resets_to_seven_roots':True,'function_posts':0}


def optional_question_disclosure_review(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=width==768) as (page,guard):
        guard.action='explain'
        qa.first_answer(page,guard)
        disclosure=page.locator('.guide-next-question')
        expect(disclosure).not_to_have_attribute('open','')
        activate(disclosure.locator(':scope > summary'),width)
        choice=disclosure.locator('[data-guide-choice]').first
        if width==390:
            choice.focus()
            page.keyboard.press('Space')
        else:
            choice.tap()
        expect(disclosure).to_have_attribute('open','')
        expect(choice).to_be_focused()
        submit=disclosure.locator('button[type=submit]')
        expect(submit).to_be_enabled()
        expect(submit).to_be_in_viewport(ratio=.85)
        capture(page,engine,width,'final-optional-question-selected')
        activate(submit,width)
        expect(page.locator('#guide-consent')).not_to_be_checked()
        second=qa.send_preview(page,guard)
        assert len(second['answers'])==2 and second['answers'][-1]['text']=='学ぶ内容を知りたい'
        qa.guide_action(page,'prepare-routes').click()
        guard.action='show_routes'
        qa.send_preview(page,guard,to_map=True)
        expect(page.locator('#finder-attention-title')).to_be_focused()
        page.keyboard.press('Tab')
        assert page.evaluate("Boolean(document.activeElement.closest('.finder-attention'))")
        assert len(guard.posts)==3
    with qa.page_fixture(browser,width=width,touch=width==768,configured=False) as (page,guard):
        page.goto(qa.BASE+'/')
        activate(page.locator('.home-finder-start'),width)
        expect(page.locator('#guide-capability')).to_contain_text('現在利用できません')
        disclosure=page.locator('.guide-inactive-question')
        activate(disclosure.locator(':scope > summary'),width)
        choice=disclosure.locator('[data-guide-choice]').last
        activate(choice,width)
        expect(disclosure).to_have_attribute('open','')
        expect(choice).to_be_focused()
        expect(choice).to_have_attribute('aria-pressed','true')
        expect(disclosure.locator('button[type=submit]')).to_be_disabled()
        capture(page,engine,width,'final-unavailable-question-selected')
        assert not guard.posts
    return {'width':width,'optional_question_stays_open_on_choice_and_submits':True,'unavailable_question_stays_open_and_does_not_send':True,'attention_heading_focus_and_nearby_tab':True}


def transition_focus_review(browser,engine,width):
    with qa.page_fixture(browser,width=width,touch=width==768) as (page,guard):
        page.goto(qa.BASE+'/')
        activate(page.locator('.home-map-start'),width)
        next_primary(page,'comparison-picker').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#finder-picker-title')).to_be_focused()
        page.keyboard.press('Tab')
        expect(page.locator('#finder-comparison-picker [data-finder-action=route-compare]').first).to_be_focused()
        for node in ['route-work','route-university']:
            toggle=page.locator(f'#finder-comparison-picker [data-finder-action=route-compare][data-finder-node="{node}"]')
            toggle.focus()
            page.keyboard.press('Space')
            expect(toggle).to_be_focused()
        next_primary(page,'compare').focus()
        page.keyboard.press('Enter')
        expect(page.locator('.atlas-compare-row')).to_have_count(8)
        next_primary(page,'record').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#finder-record-title')).to_be_focused()
        page.keyboard.press('Tab')
        assert page.evaluate("Boolean(document.activeElement.closest('.finder-record'))")
        page.locator('#finder-notes').fill('キーボードで移動しても、現在の画面から続けたい。')
        qa.finder_action(page,'save-preview').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#finder-save-preview-title')).to_be_focused()
        if width==390:
            capture(page,engine,width,'final-save-preview-focus')
        page.keyboard.press('Tab')
        assert page.evaluate("Boolean(document.activeElement.closest('#finder-save-preview'))")
        qa.finder_action(page,'edit-save').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#finder-notes')).to_be_focused()
        page.locator('[data-finder-mode="ai"]').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#guide-capability')).to_contain_text('毎回')
        expect(page.locator('#guide-title')).to_be_focused()
        assert not guard.posts
        return {'width':width,'picker_record_save_heading_focus':True,'tab_continues_in_new_view':True,'edit_save_focuses_notes':True,'header_ai_return_focuses_guide_title':True,'provider_posts':0}


def delayed_capability_focus_review(browser,engine):
    checks=[]
    for configured in (True,False):
        with qa.page_fixture(browser,width=390) as (page,guard):
            held=[]
            def hold_capability(route):
                if route.request.method=='GET':
                    held.append(route)
                else:
                    guard.handle(route)
            page.context.route('**/.netlify/functions/guide-discovery',hold_capability)
            try:
                page.goto(qa.BASE+'/')
                page.locator('.home-finder-start').click()
                expect(page.locator('#guide-capability')).to_contain_text('確認しています')
                memo='接続の確認が終わる前から、自分の考えを書き始めている。'
                field=page.locator('#guide-answer')
                field.fill(memo)
                field.focus()
                field.evaluate('(el)=>el.setSelectionRange(5,13)')
                assert len(held)==1
                held.pop().fulfill(status=200,content_type='application/json',body=json.dumps({'configured':configured,'browsing':False}))
                expect(page.locator('#guide-capability')).to_contain_text('毎回' if configured else '現在利用できません')
                expect(field).to_have_value(memo)
                expect(field).to_be_focused()
                expect(field).to_be_in_viewport(ratio=.85)
                assert field.evaluate('(el)=>[el.selectionStart,el.selectionEnd]')==[5,13]
                if not configured:
                    expect(page.locator('.guide-inactive-question')).to_have_attribute('open','')
                    capture(page,engine,390,'final-delayed-unavailable-input')
                assert not guard.posts
                checks.append({'configured':configured,'draft_focus_caret_preserved':True,'focused_input_visible':True,'optional_fieldset_reopened':not configured})
            finally:
                for route in held:
                    route.fulfill(status=200,content_type='application/json',body='{"configured":false,"browsing":false}')
    with qa.page_fixture(browser,width=390) as (page,guard):
        held=[]
        page.context.route('**/.netlify/functions/guide-discovery',lambda route:held.append(route) if route.request.method=='GET' else guard.handle(route))
        try:
            page.goto(qa.BASE+'/')
            page.locator('.home-finder-start').click()
            expect(page.locator('#guide-capability')).to_contain_text('確認しています')
            page.locator('.desk-nav a[href="#/"]').click()
            target=page.locator('.home-map-start')
            target.focus()
            with page.expect_response('**/.netlify/functions/guide-discovery') as completed:
                held.pop().fulfill(status=200,content_type='application/json',body='{"configured":true,"browsing":false}')
            assert completed.value.json()=={'configured':True,'browsing':False}
            page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            # A subsequent render in the detached guide must not steal Home focus.
            expect(target).to_be_focused()
            page.locator('.home-finder-start').click()
            expect(page.locator('#guide-capability')).to_contain_text('毎回')
            assert not guard.posts
            checks.append({'focused_outside_guide_not_stolen':True})
        finally:
            for route in held:
                route.fulfill(status=200,content_type='application/json',body='{"configured":false,"browsing":false}')
    return checks


def final_state_followup(browser,engine):
    return [{
        'width':width,
        'navigation':picker_navigation_and_restore(browser,engine,width),
        'disclosures':optional_question_disclosure_review(browser,engine,width),
        'focus':transition_focus_review(browser,engine,width),
    } for width in (390,768)]


def main():
    qa.research_unchanged()
    audit={}
    with sync_playwright() as p:
        for engine in ['chromium','webkit']:
            options={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {'executable_path':'/workspace/webkit-runtime/run-webkit.sh'}
            browser=getattr(p,engine).launch(**options)
            try:
                audit[engine]={'journeys':[]}
                for width in [320,390,768,1024,1440]:
                    print(engine,width,'consultation→routes→compare→next step→save/restore',flush=True)
                    audit[engine]['journeys'].append(route_to_action_journey(browser,engine,width))
                print(engine,'offline all-map path',flush=True)
                audit[engine]['offline']=offline_path(browser,engine)
                print(engine,'normal ask→contextual route action→new consent',flush=True)
                audit[engine]['normal_question']=normal_question_to_routes(browser,engine)
                print(engine,'choice → one inline next action',flush=True)
                audit[engine]['selected_answer_next']=selected_answer_next_review(browser,engine)
                print(engine,'save review invalidation retains a visible action',flush=True)
                audit[engine]['save_review_invalidation']=save_review_invalidation(browser,engine)
                print(engine,'final picker navigation/disclosures/transition focus',flush=True)
                audit[engine]['final_state_followup']=final_state_followup(browser,engine)
                print(engine,'delayed capability preserves focus, draft and caret',flush=True)
                audit[engine]['delayed_capability_focus']=delayed_capability_focus_review(browser,engine)
            finally:
                browser.close()
            (OUTPUT/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    qa.research_unchanged()
    print(json.dumps(audit,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
