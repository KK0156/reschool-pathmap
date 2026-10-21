import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {createExplorationState} from '../src/exploration-model.js';
import {createFinderDocument,parseFinderDocument,stringifyFinderDocument,readFinderFile,validateFinderDocument,MAX_FINDER_FILE_BYTES} from '../src/finder-file.js';
import {renderFinderSavePreview} from '../src/finder-save-view.js';

const privateAnswer='PRIVATE_ANSWER_NOT_COPIED_INTO_PROJECTION';
const work=routeAtlas.nodes.find(node=>node.id==='route-work');
function session(){return {
  revision:3,atlas:null,discovery:null,
  guide:{summary:'大学に行くかは、まだ決めていない。',statements:[],routes:[],additionalIdeas:[],nextActions:[],unknowns:['費用と時期は未確認。'],userCorrections:[],conversation:{answers:[{id:'answer-1',questionId:'start',question:'今、何を知りたい？',text:privateAnswer,state:'answered'}],corrections:[]},requestsUsed:1,stale:false,correspondence:'included'},
  notes:'仕事と学びの生活の違いを調べたい。',nextActions:'授業と仕事の一日の例を一つずつ読む。',view:'record'
};}
function integrated(){
  const value=session();
  value.exploration={...createExplorationState(),expanded:['group-self','group-routes','atlas-route-work','answer-answer-1'],selected:'manual-1',emphasis:'map',step:5,
    notes:[{id:'manual-1',parent:'atlas-route-work',label:'自分で確かめたいこと',detail:'働きながら学べる時間を確認したい。'}],
    overrides:[{id:'atlas-route-work',label:'仕事から考える道',detail:'私が書き直したメモ。一般資料の内容とは分ける。'},{id:'answer-answer-1',label:'まだ決めていない',detail:'本人が書き直した枝の文章。元の回答とは別の保存対象。'}],
    positions:[{id:'atlas-route-work',x:140,y:-80},{id:'manual-1',x:200,y:30}],serial:1};
  return value;
}

test('Finder v1 stays unchanged while integrated v2 restores edits, layout and collapsed state without inventing omitted answers',()=>{
  const old=createFinderDocument(session(),{includeConversation:true});
  assert.equal(old.schemaVersion,1);assert.ok(!Object.hasOwn(old.session,'exploration'));
  assert.deepEqual(parseFinderDocument(stringifyFinderDocument(old)),old);
  const value=integrated(),original=structuredClone(value),document=createFinderDocument(value),raw=stringifyFinderDocument(document),restored=parseFinderDocument(raw);
  assert.equal(document.format,'repath-finder-session');assert.equal(document.schemaVersion,2);
  assert.deepEqual(restored.session.exploration,original.exploration);
  assert.equal(restored.session.guide.conversation,null);assert.equal(restored.session.guide.correspondence,'not_saved');
  assert.ok(!raw.includes(privateAnswer));assert.ok(raw.includes('本人が書き直した枝の文章'));
  assert.deepEqual(value,original,'Preparing a redacted file must not modify the live workspace or answers.');
  const resaved=createFinderDocument(restored.session,{catalogueSources:restored.catalogueSources});
  assert.deepEqual(resaved.session.exploration,restored.session.exploration);
});

test('explicitly included v2 answers are separate from manually edited projection labels and notes',()=>{
  const value=integrated(),document=createFinderDocument(value,{includeConversation:true}),restored=parseFinderDocument(stringifyFinderDocument(document));
  assert.deepEqual(restored.session,value);
  assert.equal(restored.session.guide.conversation.answers[0].text,privateAnswer);
  assert.equal(restored.session.exploration.overrides[1].detail,value.exploration.overrides[1].detail);
});

test('Finder versions, shared-route references and malformed workspace structures are rejected',()=>{
  const mutations=[
    doc=>doc.schemaVersion=3,doc=>doc.schemaVersion=1,doc=>delete doc.session.exploration,
    doc=>doc.session.exploration.expanded.push('atlas-missing-route'),
    doc=>doc.session.exploration.selected='atlas-missing-route',
    doc=>doc.session.exploration.notes[0].parent='atlas-missing-route',
    doc=>doc.session.exploration.notes[0].parent='manual-1',
    doc=>doc.session.exploration.notes.push(structuredClone(doc.session.exploration.notes[0])),
    doc=>doc.session.exploration.overrides[0].id='atlas-missing-route',
    doc=>doc.session.exploration.positions[0].id='atlas-missing-route',
    doc=>doc.session.exploration.positions[0].x=Infinity,
    doc=>doc.session.exploration.positions[0].x=10000001,
    doc=>doc.session.exploration.expanded.push('constructor'),
    doc=>doc.session.exploration.emphasis='AI決定',doc=>doc.session.exploration.serial=-1,doc=>doc.session.exploration.step=6,
    doc=>doc.session.exploration.verified=true
  ];
  for(const mutate of mutations){
    const document=createFinderDocument(integrated(),{includeConversation:true});mutate(document);
    assert.equal(validateFinderDocument(document),false,String(mutate));
    assert.throws(()=>parseFinderDocument(JSON.stringify(document)),String(mutate));
  }
  const legacy=createFinderDocument(session());legacy.schemaVersion=2;
  assert.equal(validateFinderDocument(legacy),false,'Version two without a workspace is not a valid upgrade.');
});

test('workspace-only Atlas references need their saved source metadata',()=>{
  const value=integrated(),document=createFinderDocument(value);
  assert.ok(work.sourceIds.length);
  document.catalogueSources=document.catalogueSources.filter(source=>source.id!==work.sourceIds[0]);
  assert.equal(validateFinderDocument(document),false);
  assert.throws(()=>parseFinderDocument(JSON.stringify(document)));
});

test('unsafe workspace objects and oversized files fail before any getter executes or live state changes',async()=>{
  const value=integrated(),before=structuredClone(value);let executed=false;
  Object.defineProperty(value.exploration,'notes',{enumerable:true,get(){executed=true;return [];}});
  assert.throws(()=>createFinderDocument(value));assert.equal(executed,false);
  const accessorSession=session();Object.defineProperty(accessorSession,'exploration',{enumerable:true,get(){executed=true;return createExplorationState();}});
  assert.throws(()=>createFinderDocument(accessorSession));assert.equal(executed,false);
  assert.throws(()=>parseFinderDocument('{"__proto__":{"polluted":true}}'));
  const stable=integrated();
  await assert.rejects(()=>readFinderFile({name:'large.json',size:MAX_FINDER_FILE_BYTES+1,text(){throw new Error('Must not read an oversized file.');}}));
  await assert.rejects(()=>readFinderFile({name:'notes.txt',size:1,text(){throw new Error('Must not read a non-JSON file.');}}));
  assert.deepEqual(stable,before);
  const huge=createFinderDocument(integrated());huge.session.exploration.notes[0].detail='x'.repeat(MAX_FINDER_FILE_BYTES);
  assert.equal(validateFinderDocument(huge),false);assert.throws(()=>stringifyFinderDocument(huge));
});

test('v2 save preview includes exact manual writing and privacy scope, escaping labels and preserving the intended raw file',()=>{
  const value=integrated(),attack='</h6><img src=x onerror="alert(1)"> & 私のメモ';
  value.exploration.notes[0].label=attack;value.exploration.notes[0].detail='次の面談で\n聞きたいこと。';
  value.exploration.overrides[0].label='自分の呼び方';
  const document=createFinderDocument(value),before=structuredClone(document),html=renderFinderSavePreview(document);
  assert.ok(html.includes('RE:Treeに書いたこと'));
  assert.ok(html.includes('追加した枝・書き直した文章は、質問への回答を含めない場合も保存します。'));
  assert.ok(html.includes('自分で追加'));assert.ok(html.includes('自分で書き直し'));
  assert.ok(html.includes('次の面談で\n聞きたいこと。'));
  assert.ok(html.includes('本人が書き直した枝の文章。元の回答とは別の保存対象。'));
  assert.ok(!html.includes(privateAnswer));assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('図を大きく見る'));assert.ok(html.includes('開いた枝 4件・自分で置いた位置 2件'));
  assert.ok(html.includes('いまの段階：次の行動を整理する'));
  const encoded=html.match(/<details class="flow-save-raw">[\s\S]*?<pre>([\s\S]*?)<\/pre>/)[1];
  const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  assert.equal(decode(encoded),stringifyFinderDocument(document));assert.deepEqual(document,before);
});
