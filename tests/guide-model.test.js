import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_GUIDE_ANSWERS,guideGoals,guideAnswerStates,validateGuideRequest,validateGuideResult,guideResponseSchema} from '../src/guide-model.js';
const request=()=>({intent:'guide',revision:2,answers:[{id:'a1',questionId:'q1',question:'今、少し気になることはありますか？',text:'生物も情報も気になっています。',state:'answered'}],corrections:[],context:{routeIds:[],goal:'continue'}});
const response=()=>({action:'ask',explanation:'二つの関心の中身を少し具体化します。',question:{id:'q2',text:'その分野では、どんなことをしてみたいですか？',why:'分野名だけでは分からない、やってみたい作業を確認するためです。',choices:[{id:'choice-observe',label:'観察や実験を試す'},{id:'choice-make',label:'データや仕組みを作る'}],multiple:false},statements:[{id:'s2',text:'生物と情報の両方に関心がある、という回答として受け取りました。',answerIds:['a1'],kind:'interpretation'}],routes:[],additionalIdeas:[],nextActions:[],unknowns:['どんな学び方をしたいかは未確認です。']});
const route=(atlasId,answerIds=['a1'])=>({atlasId,reason:answerIds.length?'本人が挙げた関心から、内容を比較する候補です。':'一般的な入口として比べられる道です。本人の条件は未確認です。',answerIds,unknowns:['本人の履修・費用・利用条件は未確認です。']});

test('guide request accepts bounded actual question-answer pairs, optional unknowns and explicit goals',()=>{
 assert.equal(MAX_GUIDE_ANSWERS,20);assert.ok(guideGoals.includes('show_routes'));assert.ok(guideAnswerStates.includes('different'));assert.ok(validateGuideRequest(request()));
 for(const state of ['unknown','skipped']){const input=request();input.answers[0]={...input.answers[0],state,text:''};assert.ok(validateGuideRequest(input));}
 const first=request();first.answers=[];assert.ok(validateGuideRequest(first));
 for(const goal of guideGoals){const input=request();input.context={routeIds:goal==='compare'?['route-work','route-university']:[],goal};assert.ok(validateGuideRequest(input));}
});
test('guide input rejects private extras, missing questions, forged IDs, duplicates and oversized turns',()=>{
 const invalid=[null,[],{...request(),studentName:'private'},{...request(),revision:-1},{...request(),revision:1.5},{...request(),revision:1000001}];
 for(const mutate of [r=>delete r.answers[0].question,r=>r.answers[0].text='x'.repeat(601),r=>r.answers[0].question='x'.repeat(501),r=>r.answers[0].state='profiled',r=>r.answers[0].text='',r=>r.answers.push({...r.answers[0],questionId:'q-new'}),r=>r.answers.push({...r.answers[0],id:'a2'}),r=>r.answers=Array.from({length:21},(_,i)=>({...r.answers[0],id:'a'+i,questionId:'q'+i})),r=>r.corrections=[{id:'a1',text:'訂正'}],r=>r.context.routeIds=['invented-route'],r=>r.context={routeIds:[],goal:'compare'},r=>r.context.routeIds=['route-work','route-work'],r=>r.context.school='private']){const input=request();mutate(input);invalid.push(input);}
 for(const value of invalid)assert.equal(validateGuideRequest(value),false);
 let accessed=false;const input=request();Object.defineProperty(input,'answers',{get(){accessed=true;return [];},enumerable:true});assert.equal(validateGuideRequest(input),false);assert.equal(accessed,false);
});
test('result validates source-linked interpretation, one new question and correction references',()=>{
 assert.ok(validateGuideResult(response(),request()));
 const input=request();input.corrections=[{id:'c1',text:'情報に興味があるのは授業で触れたから。得意とは言っていない。'}];const result=response();result.statements[0].answerIds=['c1'];assert.ok(validateGuideResult(result,input));
 const unknown=response();unknown.action='explain';unknown.question=null;unknown.statements=[{id:'s-unknown',text:'本人の経験や希望の中身は、まだ分かりません。',answerIds:[],kind:'unknown'}];assert.ok(validateGuideResult(unknown,request()));
 assert.equal(guideResponseSchema.additionalProperties,false);assert.ok(guideResponseSchema.required.includes('question'));
});
test('result rejects repeated questions, unknown references, duplicate output IDs and invented Atlas routes',()=>{
 const variants=[];
 for(const mutate of [r=>r.question.id='q1',r=>r.question=null,r=>r.question.multiple=true,r=>r.question.choices.push({...r.question.choices[0]}),r=>r.statements[0].id=r.question.id,r=>r.statements[0].answerIds=['not-an-answer'],r=>r.statements[0].answerIds=[],r=>r.statements[0].kind='fact',r=>r.routes=[route('invented-route')],r=>r.routes=[route('route-work'),route('route-work')],r=>r.verified=true,r=>r.additionalIdeas=[{id:'s2',text:'別の見方',answerIds:['a1']}],r=>r.unknowns=['x'.repeat(301)]]){const value=response();mutate(value);variants.push(value);}
 for(const value of variants)assert.equal(validateGuideResult(value,request()),false);
});
test('sparse answers may show general routes without pretending the user qualifies',()=>{
 const input=request();input.answers=[];input.context.goal='show_routes';const result={...response(),action:'show_routes',question:null,statements:[],routes:[route('route-work',[]),route('route-university',[])]};assert.ok(validateGuideResult(result,input));
 result.routes[0].reason='あなたに合う道として選びました。';assert.equal(validateGuideResult(result,input),false);
});
test('explicit comparison, trial and summary goals cannot be replaced by unrelated actions',()=>{
 const input=request();input.context={routeIds:['route-work','route-university'],goal:'compare'};
 const result={...response(),action:'compare',question:null,routes:[route('route-work'),route('route-university')]};assert.ok(validateGuideResult(result,input));
 result.routes[1]=route('route-specialist');assert.equal(validateGuideResult(result,input),false);
 result.routes=[route('route-work'),route('route-university'),route('route-specialist')];assert.equal(validateGuideResult(result,input),false);
 const trial=request();trial.context.goal='suggest_trial';const plan={...response(),action:'suggest_trial',question:null,nextActions:[{id:'trial-1',text:'先生と、気になる授業の公開資料を一つ読む。',answerIds:['a1']}]};assert.ok(validateGuideResult(plan,trial));plan.nextActions=[];assert.equal(validateGuideResult(plan,trial),false);
 const summary=request();summary.context.goal='summarize';assert.equal(validateGuideResult(response(),summary),false);
});
