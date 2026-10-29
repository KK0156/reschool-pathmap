import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReferenceSiteCard} from '../src/reference-library.js';

const reference=()=>({
  id:'reference-test',title:'学問の案内',publisher:'資料の発行元',url:'https://example.org/guide',kind:'editorial',
  purpose:'授業や実習の中身を読む。',checkItems:['授業で何をするか。','関連する学問との違いは何か。'],
  reason:'学ぶ内容を別の視点から読む入口です。',reviewedOn:'2026-10-29',reviewScope:'公開されている案内ページを確認。',
  limitations:'最新の募集や本人の利用条件は未確認。'
});

test('reference cards distinguish reading an external guide from confirming personal conditions',()=>{
  const value=reference(),before=structuredClone(value),html=renderReferenceSiteCard(value,{routeId:'route-university'});
  for(const text of [value.title,value.publisher,value.purpose,...value.checkItems,value.reason,value.reviewScope,value.limitations,'案内ページを確認した日','本人の利用条件を確認した日ではありません'])assert.ok(html.includes(text),text);
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(html.includes('data-reference-action="memo"'));
  assert.deepEqual(value,before);
});

test('external cards escape every label and never render an unsafe or credential-bearing URL',()=>{
  const attack='</h3><svg onload="bad()"> & "引用"';
  const value=reference();
  for(const key of ['id','title','publisher','purpose','reason','reviewScope','limitations','reviewedOn'])value[key]=attack;
  value.checkItems=[attack];value.url='https://example.org/guide?q="<bad>';
  const html=renderReferenceSiteCard(value,{routeId:'route-university'});
  assert.ok(!/<svg|onload="bad|<bad>/.test(html));
  assert.ok(html.includes('&lt;svg onload=&quot;bad()&quot;&gt;'));
  for(const url of ['javascript:alert(1)','data:text/html,bad','http://example.org','https://user:secret@example.org/guide','//example.org']){
    const rejected=renderReferenceSiteCard({...reference(),url},{routeId:'route-university'});
    assert.ok(!rejected.includes('<a '),url);
    assert.ok(!rejected.includes('data-reference-action="memo"'),url);
    assert.ok(rejected.includes('リンクを確認できません'),url);
  }
});

test('memo actions require an actual Atlas route and unknown reference kinds never gain an official label',()=>{
  const value={...reference(),kind:'invented',checkItems:null};
  for(const routeId of [null,'unknown','__proto__']){
    const html=renderReferenceSiteCard(value,{routeId});
    assert.ok(!html.includes('data-reference-action="memo"'));
    assert.ok(html.includes('情報の種類は未確認'));
    assert.ok(!html.includes('公的機関の資料'));
  }
});
