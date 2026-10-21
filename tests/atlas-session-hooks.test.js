import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {validateAtlasSessionState,validateAtlasGuideOverlay} from '../src/route-atlas.js';
import {validateGuideRequest,validateGuideResult} from '../src/guide-model.js';

const session=()=>({view:'overview',lens:'after-school',selected:null,path:[],history:[],visited:[],considering:[],keep:[],compare:[],preferences:{wish:'',subjects:[],timing:'undecided',budget:'undecided'},records:{},recordDrafts:{},preferencesOpen:false,recordOpen:[],activeDemo:null});
const navigation=()=>({view:'overview',lens:'after-school',selected:null,path:[],activeDemo:null});
const record=()=>({state:'constraint_recorded',note:'公式の説明ページに必要な履修科目が記載されていた。',sourceUrl:'https://example.org/official',checkedOn:'2025-01-02'});

test('Atlas session validator imports without a DOM and preserves a complete unfinished workspace',()=>{
  const value=session();assert.ok(validateAtlasSessionState(value));
  Object.assign(value,{view:'detail',selected:'work-company',path:['route-work','work-entry','work-company'],visited:['route-work','work-entry','work-company'],considering:['route-work'],keep:['route-work'],compare:['route-work','route-relearn'],history:[navigation()],preferencesOpen:true,recordOpen:['work-company'],activeDemo:'undecided'});
  value.preferences={wish:'働くことと学び直すことを比べたい。',subjects:['情報','国語'],timing:'later',budget:'concern'};
  value.records['route-work']=record();
  value.recordDrafts['work-company']={state:'constraint_recorded',note:'まだ書きかけのメモ',sourceUrl:'https://',checkedOn:'2026-'};
  const original=structuredClone(value);assert.ok(validateAtlasSessionState(value));assert.deepEqual(value,original);
  for(const view of ['overview','compare','kept']){const other={...value,view,selected:null,path:[]};assert.ok(validateAtlasSessionState(other));}
});

test('Atlas restore schema rejects unknown IDs, disconnected paths, invalid histories and invalid record promotion',()=>{
  const mutations=[
    value=>{value.extra=true;},value=>{delete value.activeDemo;},value=>{value.lens='ranking';},
    value=>{value.selected='route-work';},value=>{value.path=['route-work'];},
    value=>{value.view='detail';value.selected='route-work';value.path=[];},
    value=>{value.view='detail';value.selected='route-relearn';value.path=['route-work','work-company','route-relearn'];},
    value=>{value.view='detail';value.selected='route-work';value.path=['route-work','work-entry','route-work'];},
    value=>{value.view='detail';value.selected='route-work';value.path=['work-entry'];},
    value=>{value.visited=['missing'];},value=>{value.considering=['route-work','route-work'];},
    value=>{value.keep=routeAtlas.lenses[0].rootIds.slice(0,7);},value=>{value.compare=routeAtlas.lenses[0].rootIds.slice(0,3);},
    value=>{value.history=Array.from({length:51},navigation);},value=>{value.history=[{...navigation(),selected:'missing'}];},
    value=>{value.preferences.school='not-required';},value=>{value.records['route-work']={...record(),sourceUrl:'https://'};},
    value=>{value.recordDrafts['missing']={state:'unresearched',note:'',sourceUrl:'',checkedOn:''};},
    value=>{value.recordDrafts['route-work']={state:'verified',note:'',sourceUrl:'',checkedOn:''};},
    value=>{value.recordDrafts['route-work']={state:'unresearched',note:'x'.repeat(701),sourceUrl:'',checkedOn:''};},
    value=>{value.recordDrafts['route-work']={state:'unresearched',note:'',sourceUrl:'',checkedOn:'2026-10-21-extra'};},
    value=>{value.recordOpen=['missing'];},value=>{value.activeDemo='missing';},value=>{value.preferencesOpen=1;}
  ];
  for(const mutate of mutations){const value=session();mutate(value);assert.equal(validateAtlasSessionState(value),false,mutate.toString());}
});

test('Atlas imported session rejects executable values, accessors, prototype keys and oversized data safely',()=>{
  let invoked=false;const accessor=session();Object.defineProperty(accessor,'view',{enumerable:true,get(){invoked=true;return 'overview';}});
  assert.equal(validateAtlasSessionState(accessor),false);assert.equal(invoked,false);
  const danger=session();danger.records=JSON.parse('{"__proto__":{"polluted":true}}');assert.equal(validateAtlasSessionState(danger),false);assert.equal({}.polluted,undefined);
  const inherited=Object.assign(Object.create({secret:true}),session());assert.equal(validateAtlasSessionState(inherited),false);
  const cycle=session();cycle.records.self=cycle;assert.equal(validateAtlasSessionState(cycle),false);
  const sparse=session();sparse.visited=new Array(5);assert.equal(validateAtlasSessionState(sparse),false);
  const badArray=session();badArray.visited.extra='private';assert.equal(validateAtlasSessionState(badArray),false);
  const symbolic=session();symbolic[Symbol('secret')]='private';assert.equal(validateAtlasSessionState(symbolic),false);
  const huge=session();huge.recordDrafts['route-work']={state:'unresearched',note:'x'.repeat(1024*1024),sourceUrl:'',checkedOn:''};assert.equal(validateAtlasSessionState(huge),false);
  for(const value of [undefined,null,[],()=>{},new Date(),{...session(),view:Promise.resolve('overview')}])assert.equal(validateAtlasSessionState(value),false);
});

test('Atlas navigation accepts catalogue cross-links without claiming they are eligibility proof',()=>{
  const edge=routeAtlas.edges.find(item=>item.type==='transition');assert.ok(edge);
  const value=session();Object.assign(value,{view:'detail',selected:edge.to,path:[edge.from,edge.to]});assert.ok(validateAtlasSessionState(value));
  value.path=[edge.to,edge.from];value.selected=edge.from;assert.ok(validateAtlasSessionState(value));
  const before=structuredClone(routeAtlas);validateAtlasSessionState(value);assert.deepEqual(routeAtlas,before);
});

test('AI overlay accepts all 20 answer and 12 correction references permitted by a long valid consultation',()=>{
  const request={intent:'guide',revision:32,answers:Array.from({length:20},(_,index)=>({id:'answer-'+index,questionId:'question-'+index,question:'今、どんなことを確かめたい？',text:'働くことと学び直すことを比べたい。',state:'answered'})),corrections:Array.from({length:12},(_,index)=>({id:'correction-'+index,text:'どちらかを決めたのではなく、両方を知りたい。'})),context:{routeIds:[],goal:'show_routes'}};
  const answerIds=[...request.answers,...request.corrections].map(item=>item.id);
  const routes=['route-work','route-relearn'].map(atlasId=>({atlasId,reason:'本人の回答と訂正から、比較の対象として取り上げた参考候補。',answerIds:[...answerIds],unknowns:['本人の条件は未確認。']}));
  const response={action:'show_routes',explanation:'どちらも決定せず、条件を比べるための候補です。',question:null,statements:[],routes,additionalIdeas:[],nextActions:[],unknowns:['現在の募集・費用は未確認。']};
  assert.ok(validateGuideRequest(request));assert.ok(validateGuideResult(response,request));
  assert.ok(validateAtlasGuideOverlay({routes,stale:false}));assert.ok(validateAtlasGuideOverlay({routes,stale:true}));
  const tooMany=structuredClone(routes);tooMany[0].answerIds.push('answer-overflow');assert.equal(validateAtlasGuideOverlay({routes:tooMany,stale:false}),false);
  const unknown=structuredClone(routes);unknown[0].atlasId='invented-route';assert.equal(validateAtlasGuideOverlay({routes:unknown,stale:false}),false);
  assert.ok(validateAtlasGuideOverlay({routes:[],stale:false}));
});
