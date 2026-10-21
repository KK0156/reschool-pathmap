import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {getRouteDemo} from '../src/route-demos.js';
import {createFinderDocument,parseFinderDocument,stringifyFinderDocument,readFinderFile,validateFinderDocument,validateDiscoverySession,validateFinderGuide,MAX_FINDER_FILE_BYTES} from '../src/finder-file.js';

const target=routeAtlas.nodes.find(node=>node.kind==='route'&&node.sourceIds.length);
function discovery(){
  const demo=getRouteDemo('subjects');
  const graph=demo.routes.map((route,index)=>({key:'route-'+(index+1),route:structuredClone(route),origin:'demo',parent:null,children:[],related:[],revealed:false,answer:'',questionDraft:'保存に含めるか本人が選ぶ質問の下書き'}));
  const byId=new Map(graph.map(entry=>[entry.route.id,entry]));
  for(const entry of graph){
    entry.children=(demo.children[entry.route.id]||[]).map(id=>byId.get(id).key);
    entry.related=(demo.related[entry.route.id]||[]).map(id=>byId.get(id).key);
    for(const child of entry.children)graph.find(entry=>entry.key===child).parent=entry.key;
  }
  const roots=demo.rootIds.map(id=>byId.get(id).key);
  const additional={key:'route-'+(graph.length+1),route:{...structuredClone(demo.routes[0]),id:'ai-added',title:'モックAIからの別の方向'},origin:'ai',parent:roots[0],children:[],related:[],revealed:false,answer:'',questionDraft:''};
  graph[0].children.push(additional.key);graph.push(additional);
  return {draft:{topic:'free',wish:'これは保存範囲を選べる架空の下書き',situation:'架空の現在の状況',conditions:['費用を抑えたい'],conditionText:'架空の任意条件'},step:3,view:'detail',graph,roots,selected:roots[0],path:[roots[0]],back:[{view:'results',selected:null,path:[]}],compare:roots.slice(0,2),keep:[roots[0]],summary:demo.summary,answer:'',consultation:structuredClone(demo.consultation),demoId:demo.id,source:'demo',serial:graph.length};
}
function guide(){return {
  summary:'本人が確認した整理：学校の外で少し学んでから考えたい。条件は未確認。',
  statements:[{id:'statement-1',text:'体験してから考えたい、という希望があります。',answerIds:['answer-1'],kind:'interpretation'}],
  routes:[{atlasId:target.id,reason:'回答から、比較して条件を確かめる入口として挙げています。',answerIds:['answer-1'],unknowns:['開催条件は未確認です。']}],
  additionalIdeas:[],nextActions:[{id:'next-1',text:'公開情報で参加条件を調べる。',answerIds:['correction-1']}],unknowns:['本人が利用できるかは未確認です。'],
  userCorrections:[{id:'correction-1',text:'体験前に参加条件も調べたい。'}],
  conversation:{answers:[{id:'answer-1',questionId:'question-1',question:'どんな方法で確かめたい？',text:'まず体験してみたい。',state:'answered'}],corrections:[{id:'correction-1',text:'体験前に参加条件も調べたい。'}]},requestsUsed:1,stale:false,correspondence:'included'
};}
function session(){return {
  revision:4,
  atlas:{view:'overview',lens:'after-school',selected:null,path:[],history:[],visited:[target.id],considering:[target.id],keep:[target.id],compare:[],preferences:{wish:'まだ少し考えたい。',subjects:['数学'],timing:'undecided',budget:'concern'},records:{[target.id]:{state:'needs_check',note:'公式の公開情報で参加条件を確かめたい。',sourceUrl:routeAtlas.sources[0].url,checkedOn:'2026-10-01'}},recordDrafts:{},preferencesOpen:false,recordOpen:[],activeDemo:null},
  discovery:discovery(),guide:guide(),notes:'自分で残すメモ。',nextActions:'先生との面談で、確認したいことを一つ聞く。',view:'all'
};}
const full=()=>createFinderDocument(session(),{includeConversation:true});

test('Finder JSON is separate from Tree JSON and default save omits raw conversation while preserving the confirmed summary and graph origins',()=>{
  const original=session(),document=createFinderDocument(original),raw=stringifyFinderDocument(document),restored=parseFinderDocument(raw);
  assert.equal(document.format,'repath-finder-session');assert.equal(document.schemaVersion,1);
  assert.equal(document.session.guide.summary,original.guide.summary);
  assert.equal(document.session.guide.conversation,null);assert.equal(document.session.guide.correspondence,'not_saved');
  assert.deepEqual(document.session.guide.userCorrections,original.guide.userCorrections);
  assert.ok(raw.includes('体験前に参加条件も調べたい。'));
  assert.deepEqual(document.session.guide.statements[0].answerIds,['answer-1']);
  assert.deepEqual(document.session.discovery.draft,{topic:'',wish:'',situation:'',conditions:[],conditionText:''});
  assert.equal(document.session.discovery.consultation,null);assert.equal(document.session.discovery.step,1);
  assert.ok(document.session.discovery.graph.every(entry=>entry.questionDraft===''));
  assert.ok(document.session.discovery.graph.some(entry=>entry.origin==='demo'));
  assert.ok(document.session.discovery.graph.some(entry=>entry.origin==='ai'));
  assert.ok(!raw.includes('これは保存範囲を選べる架空の下書き'));
  assert.deepEqual(restored,document);
  assert.equal(original.guide.conversation.answers.length,1);assert.equal(original.discovery.draft.topic,'free');
  assert.throws(()=>parseFinderDocument(JSON.stringify({format:'re-tree',version:1,tree:{}})));
});

test('explicit conversation inclusion preserves answers, corrections, raw draft and graph without changing provenance',()=>{
  const document=full(),restored=parseFinderDocument('\uFEFF'+stringifyFinderDocument(document));
  assert.deepEqual(restored.session,session());
  assert.equal(restored.session.guide.correspondence,'included');
  restored.session.discovery.graph[0].route.title='別のメモ';
  assert.notEqual(document.session.discovery.graph[0].route.title,'別のメモ');
});

test('catalogue sources and personal confirmation dates survive resaving without being recalculated',()=>{
  const document=full(),sources=structuredClone(document.catalogueSources);
  const source=sources.find(source=>source.status==='reviewed');
  source.reviewedOn='2026-09-01';source.scope='保存時点の一般資料の確認範囲。現在の条件は未確認です。';
  const saved=createFinderDocument(document.session,{includeConversation:true,catalogueSources:sources});
  const restored=parseFinderDocument(stringifyFinderDocument(saved));
  assert.deepEqual(restored.catalogueSources,sources);
  assert.equal(restored.session.atlas.records[target.id].checkedOn,'2026-10-01');
  assert.ok(restored.catalogueSources.every(source=>Object.hasOwn(source,'limitations')));
});

test('wrong schema, extra fields, unsafe source metadata and missing referenced source snapshots are rejected',()=>{
  const changes=[document=>document.schemaVersion=2,document=>document.format='re-tree',document=>document.session.unexpected=true,document=>document.session.view='tree',document=>document.session.revision=-1,document=>document.catalogueSources[0].url='javascript:alert(1)',document=>document.catalogueSources[0].url='https://user:pass@example.com/',document=>document.catalogueSources[0].id='unknown-source',document=>document.catalogueSources.push(structuredClone(document.catalogueSources[0])),document=>{const source=document.catalogueSources.find(source=>source.status==='reviewed');source.reviewedOn='2999-01-01';},document=>{const source=document.catalogueSources.find(source=>source.status==='reviewed');source.reviewedOn='2026-02-30';},document=>document.catalogueSources=document.catalogueSources.filter(source=>source.id!==target.sourceIds[0])];
  for(const change of changes){const document=full();change(document);assert.equal(validateFinderDocument(document),false);assert.throws(()=>parseFinderDocument(JSON.stringify(document)));}
});

test('discovery restore validates graph links, depth, origin labels and fixed demo content',()=>{
  const valid=discovery();assert.equal(validateDiscoverySession(valid),true);
  const changes=[snapshot=>snapshot.graph[0].parent='missing',snapshot=>snapshot.graph[0].children.push('missing'),snapshot=>snapshot.graph[0].children.push(snapshot.graph[0].children[0]),snapshot=>snapshot.graph[0].key='constructor',snapshot=>snapshot.graph[0].origin='manual',snapshot=>snapshot.graph[0].route.title='架空デモを勝手に書き換える',snapshot=>snapshot.roots.pop(),snapshot=>snapshot.graph[0].parent=snapshot.graph[1].key,snapshot=>snapshot.selected='missing',snapshot=>snapshot.path=['missing'],snapshot=>snapshot.compare.push(snapshot.compare[0]),snapshot=>snapshot.serial=0,snapshot=>snapshot.back[0].path=['missing'],snapshot=>snapshot.graph.push(structuredClone(snapshot.graph[0])),snapshot=>snapshot.source='ai',snapshot=>snapshot.graph[0].route.status='verified',snapshot=>snapshot.consent=true];
  for(const change of changes){const snapshot=structuredClone(valid);change(snapshot);assert.equal(validateDiscoverySession(snapshot),false);}
});

test('guide references match saved answers and corrections, or explicitly remain not_saved',()=>{
  assert.equal(validateFinderGuide(guide()),true);
  const changes=[snapshot=>snapshot.statements[0].answerIds=['not-an-answer'],snapshot=>snapshot.routes[0].atlasId='missing-route',snapshot=>snapshot.conversation.answers[0].state='diagnosed',snapshot=>snapshot.conversation.answers[0].text='x'.repeat(601),snapshot=>snapshot.conversation.answers.push(structuredClone(snapshot.conversation.answers[0])),snapshot=>snapshot.requestsUsed=13,snapshot=>snapshot.nextActions[0].id=snapshot.statements[0].id,snapshot=>snapshot.correspondence='not_saved',snapshot=>snapshot.userCorrections[0].text='会話内の訂正とは異なる文',snapshot=>snapshot.userCorrections.push(structuredClone(snapshot.userCorrections[0])),snapshot=>snapshot.userCorrections[0].text='x'.repeat(401)];
  for(const change of changes){const snapshot=guide();change(snapshot);assert.equal(validateFinderGuide(snapshot),false);}
  const without=guide();without.conversation=null;without.correspondence='not_saved';
  assert.equal(validateFinderGuide(without),true);
  without.statements[0].answerIds=['constructor'];assert.equal(validateFinderGuide(without),false);
});

test('personal corrections stay saved even when original answers are absent, without fabricating conversation',()=>{
  const document=createFinderDocument(session());
  assert.equal(document.session.guide.conversation,null);
  document.session.guide.userCorrections.push({id:'correction-2',text:'学校の授業の中で確かめる方法も考えたい。'});
  const restored=parseFinderDocument(stringifyFinderDocument(document));
  assert.equal(restored.session.guide.conversation,null);
  assert.deepEqual(restored.session.guide.userCorrections,document.session.guide.userCorrections);
  assert.equal(restored.session.guide.correspondence,'not_saved');
  const included=guide();included.userCorrections=included.conversation.corrections;
  assert.equal(validateFinderGuide(included),true,'plain JSON aliases are serializable, unlike cycles or accessors');
});

test('prototype, accessor, sparse array, cyclic and non-JSON input is rejected before executing hooks',()=>{
  let reads=0;
  const document=full();Object.defineProperty(document.session,'notes',{get(){reads++;return '読み取らない';},enumerable:true});
  assert.equal(validateFinderDocument(document),false);assert.equal(reads,0);assert.throws(()=>stringifyFinderDocument(document));assert.equal(reads,0);
  const prototype=full();Object.setPrototypeOf(prototype.session,{extra:true});assert.equal(validateFinderDocument(prototype),false);
  const sparse=full();delete sparse.session.discovery.roots[0];assert.equal(validateFinderDocument(sparse),false);
  const cyclic=full();cyclic.session.notes=cyclic;assert.equal(validateFinderDocument(cyclic),false);
  assert.throws(()=>parseFinderDocument('{"__proto__":{"polluted":true}}'));assert.equal({}.polluted,undefined);
  assert.throws(()=>parseFinderDocument('{"constructor":{}}'));
  const hook=full();hook.session.toJSON=()=>{reads++;return {};};assert.equal(validateFinderDocument(hook),false);assert.equal(reads,0);
});

test('file extension and 1MiB limits are checked before reading or accepting malformed data',async()=>{
  let reads=0;
  await assert.rejects(readFinderFile({name:'oversized.json',size:MAX_FINDER_FILE_BYTES+1,text:async()=>{reads++;return '{}';}}));
  await assert.rejects(readFinderFile({name:'map.html',size:20,text:async()=>{reads++;return '{}';}}));
  assert.equal(reads,0);
  assert.throws(()=>parseFinderDocument(' '.repeat(MAX_FINDER_FILE_BYTES+1)));
  assert.throws(()=>parseFinderDocument('<script>alert(1)</script>'));
  const raw=stringifyFinderDocument(full());
  assert.deepEqual(await readFinderFile({name:'MAP.JSON',size:new TextEncoder().encode(raw).length,text:async()=>raw}),parseFinderDocument(raw));
});
