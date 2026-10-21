import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {getRouteDemo} from '../src/route-demos.js';
import {createFinderDocument,stringifyFinderDocument} from '../src/finder-file.js';
import {renderFinderSavePreview} from '../src/finder-save-view.js';

const questionText='PRIVATE_QUESTION_ONLY_WHEN_INCLUDED';
const answerText='PRIVATE_ANSWER_ONLY_WHEN_INCLUDED';
const correction='まず体験したいと書いたが、費用を先に確認したい。';
function session(){return {
  revision:1,
  atlas:{view:'overview',lens:'after-school',selected:null,path:[],history:[],visited:['route-work'],considering:['route-work'],keep:['route-work'],compare:['route-work','route-relearn'],preferences:{wish:'働きながら学ぶことも知りたい。',subjects:['情報'],timing:'later',budget:'concern'},records:{'route-work':{state:'needs_check',note:'応募する前に条件を調べたい。',sourceUrl:routeAtlas.sources[0].url,checkedOn:'2026-10-01'}},recordDrafts:{'route-work':{state:'constraint_recorded',note:'まだ書きかけの確認メモ',sourceUrl:'https://',checkedOn:'2026-'}},preferencesOpen:false,recordOpen:['route-work'],activeDemo:null},
  discovery:null,
  guide:{summary:'学ぶ方法と働く方法を、決めずに比べている。',statements:[],routes:[],additionalIdeas:[],nextActions:[],unknowns:['個人の応募条件は未確認。'],userCorrections:[{id:'correction-1',text:correction}],conversation:{answers:[{id:'answer-1',questionId:'question-1',question:questionText,text:answerText,state:'answered'}],corrections:[{id:'correction-1',text:correction}]},requestsUsed:1,stale:false,correspondence:'included'},
  notes:'二つとも気になる。\nまだ一つに決めていない。',nextActions:'先生に募集条件を聞く。',view:'record'
};}
function legacy(){
  const demo=getRouteDemo('subjects'),route=demo.routes.find(item=>item.id===demo.rootIds[0]);
  return {draft:{topic:'free',wish:'LEGACY_PRIVATE_WISH',situation:'LEGACY_PRIVATE_SITUATION',conditions:['時間を確かめたい'],conditionText:'自宅から参加できるか'},step:3,view:'detail',graph:[{key:'route-1',route,parent:null,children:[],related:[],origin:'demo',revealed:false,answer:'',questionDraft:'LEGACY_PRIVATE_DRAFT'}],roots:['route-1'],selected:'route-1',path:['route-1'],back:[],compare:[],keep:['route-1'],summary:demo.summary,answer:'',consultation:demo.consultation,demoId:demo.id,source:'demo',serial:1};
}
const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');

test('default save review shows human candidate names and retained personal writing without revealing omitted answers',()=>{
  const document=createFinderDocument(session()),before=structuredClone(document),html=renderFinderSavePreview(document);
  assert.ok(html.includes(routeAtlas.nodes.find(node=>node.id==='route-work').title));
  assert.ok(html.includes(routeAtlas.nodes.find(node=>node.id==='route-relearn').title));
  for(const value of [session().notes,session().nextActions,correction,session().atlas.preferences.wish,'まだ書きかけの確認メモ','書きかけ（未反映）'])assert.ok(html.includes(value),value);
  assert.ok(!html.includes(questionText));assert.ok(!html.includes(answerText));
  assert.ok(html.includes('AIの案内で答えた質問と回答：含めません。'));
  assert.ok(html.includes('質問への回答を含めない場合も、これらの文章は残ります。'));
  assert.ok(html.includes('確認済みとして反映しません'));
  assert.deepEqual(document,before);
});

test('explicitly included conversation and legacy draft are reviewable and map client IDs to visible candidate names',()=>{
  const value=session();value.discovery=legacy();
  const full=createFinderDocument(value,{includeConversation:true}),html=renderFinderSavePreview(full);
  for(const phrase of [questionText,answerText,'LEGACY_PRIVATE_WISH','LEGACY_PRIVATE_SITUATION','LEGACY_PRIVATE_DRAFT',value.discovery.graph[0].route.title])assert.ok(html.includes(phrase),phrase);
  assert.ok(html.includes('AIの案内で答えた質問と回答：1件を含めます。'));
  assert.ok(html.includes('以前の探索に書いた相談文・質問の下書き：含めます。'));
  const redacted=renderFinderSavePreview(createFinderDocument(value));
  for(const phrase of [questionText,answerText,'LEGACY_PRIVATE_WISH','LEGACY_PRIVATE_SITUATION','LEGACY_PRIVATE_DRAFT'])assert.ok(!redacted.includes(phrase),phrase);
  assert.ok(redacted.includes(value.discovery.graph[0].route.title));
});

test('review text escapes personal writing, draft URLs and restored source labels; optional raw JSON is byte-for-byte the intended file',()=>{
  const value=session(),attack='</p><svg onload="alert(1)"><script>bad()</script> & "引用"';
  value.notes=attack;value.nextActions="次に\n'別のこと'を調べる";value.atlas.recordDrafts['route-work'].sourceUrl='javascript:alert(1)';
  const sources=structuredClone(routeAtlas.sources);sources[0].title=attack;
  const document=createFinderDocument(value,{includeConversation:true,catalogueSources:sources}),html=renderFinderSavePreview(document);
  assert.ok(!/<svg|<script|onload="alert/.test(html));
  assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'));
  assert.ok(!/href="javascript:/.test(html));
  assert.ok(html.includes('javascript:alert(1)'));
  const raw=html.match(/<details class="flow-save-raw">[\s\S]*?<pre>([\s\S]*?)<\/pre>/);
  assert.ok(raw);assert.equal(decode(raw[1]),stringifyFinderDocument(document));
  assert.ok(html.indexOf('data-finder-action="download"')<html.indexOf('class="flow-save-raw"'));
});

test('an invalid or executable document is rejected before preview construction without invoking getters',()=>{
  const document=createFinderDocument(session());let invoked=false;
  Object.defineProperty(document.session,'notes',{enumerable:true,get(){invoked=true;return 'private';}});
  assert.throws(()=>renderFinderSavePreview(document));assert.equal(invoked,false);
  assert.throws(()=>renderFinderSavePreview({format:'re-tree'}));
});

test('equivalent saved and draft records are not mislabelled as unfinished merely because JSON key order differs',()=>{
  const value=session(),record=value.atlas.records['route-work'];
  value.atlas.recordDrafts['route-work']={checkedOn:record.checkedOn,sourceUrl:record.sourceUrl,note:record.note,state:record.state};
  const html=renderFinderSavePreview(createFinderDocument(value));
  assert.ok(html.includes('記録済み 1件・書きかけ 0件'));
  assert.ok(!html.includes('働く · 書きかけ（未反映）'));
  const empty=createFinderDocument({revision:0,atlas:null,discovery:null,guide:null,notes:'',nextActions:'',view:'all'});
  assert.doesNotThrow(()=>renderFinderSavePreview(empty));
});
