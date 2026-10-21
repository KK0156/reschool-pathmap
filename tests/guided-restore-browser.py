"""Focused Finder restore regression; all records are local, fictional fixtures."""
import json
import os
from pathlib import Path
import subprocess

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('GUIDED_BASE_URL','http://localhost:8003').rstrip('/')
OUTPUT=Path(os.environ.get('GUIDED_RESTORE_DIR','/workspace/reschool-guided-review/finder-files'))
OUTPUT.mkdir(parents=True,exist_ok=True)
fixtures=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {createFinderDocument} from './src/finder-file.js';
function document(id,corrections,includeConversation){
 const guide={summary:'復元の検証用に作った架空の整理です。',statements:[{id,text:'どの方法で確かめるかは、まだ分かっていません。',answerIds:[],kind:'unknown'}],routes:[],additionalIdeas:[],nextActions:[],unknowns:['参加条件は未確認です。'],userCorrections:corrections,conversation:{answers:[],corrections},requestsUsed:1,stale:false,correspondence:'included'};
 return createFinderDocument({revision:1,atlas:null,discovery:null,guide,notes:'復元後も残す架空のメモ',nextActions:'先生に参加条件を聞く',view:'ai'},{includeConversation});
}
console.log(JSON.stringify({initial:document('interpretation-old',[],true),restored:document('interpretation-new',[{id:'correction-52',text:'保存済みの本人訂正：条件を確認してから体験したい。'}],false)}));
"""],cwd=ROOT,text=True))

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1024,'height':1000},reduced_motion='reduce')
    errors=[];posts=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:dialog.accept())
    page.on('request',lambda request:posts.append(request.url) if request.method=='POST' and '/.netlify/functions/' in request.url else None)
    page.goto(BASE+'/#/finder?mode=all')

    def restore(document,name):
        page.locator('#finder-import').set_input_files({'name':name,'mimeType':'application/json','buffer':json.dumps(document).encode()})
        expect(page.locator('#finder-import')).to_have_value('')
        expect(page.locator('#finder-status')).to_contain_text('復元しました')

    restore(fixtures['initial'],'initial.json')
    page.locator('[data-guide-action=correct]').first.click()
    abandoned='この書きかけは別の保存ファイルへ持ち越さない。'
    page.locator('#guide-correction').fill(abandoned)
    expect(page.locator('#guide-correction')).to_have_value(abandoned)
    restore(fixtures['restored'],'redacted.json')
    assert page.locator('#guide-correction-form').count()==0
    assert abandoned not in page.locator('body').inner_text()
    expect(page.locator('.guide-corrections')).to_contain_text('保存済みの本人訂正')

    page.locator('[data-guide-action=correct]').first.click()
    new_correction='費用だけでなく、準備に必要な時間も確認したい。'
    page.locator('#guide-correction').fill(new_correction)
    page.locator('#guide-correction-form button[type=submit]').click()
    expect(page.locator('.guide-corrections')).to_contain_text(new_correction)
    page.locator('[data-finder-action=record]').first.click()
    page.locator('[data-finder-action=save-preview]').click()
    expect(page.locator('#finder-save-preview')).to_be_visible()
    raw=page.locator('#finder-save-preview pre').inner_text();saved=json.loads(raw)
    corrections=saved['session']['guide']['userCorrections']
    assert len(corrections)==2 and len({item['id'] for item in corrections})==2
    assert corrections[0]['id']=='correction-52'
    assert corrections[1]['id']!='correction-52'
    assert new_correction in corrections[1]['text']
    assert saved['session']['guide']['conversation'] is None
    assert saved['session']['guide']['correspondence']=='not_saved'
    assert abandoned not in raw
    assert saved['session']['notes']=='復元後も残す架空のメモ'
    assert page.evaluate("async document=>(await import('/src/finder-file.js')).validateFinderDocument(document)",saved)
    (OUTPUT/'guided-restore-no-leak.json').write_text(raw)
    page.screenshot(path=str(OUTPUT/'guided-restore-no-leak-1024.png'),full_page=True)
    assert not errors and not posts,(errors,posts)
    assert page.evaluate('localStorage.length+sessionStorage.length')==0
    browser.close()

print('PASS: importing a guide clears the previous unfinished correction form; redacted correction-52 is preserved and the next correction gets a distinct ID; default JSON remains valid with both corrections, no abandoned draft, no AI POST or browser storage')
