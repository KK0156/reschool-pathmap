import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuideHandler,config} from '../netlify/functions/guide-discovery.js';
import {MAX_GUIDE_REQUEST_BYTES,validateGuideResult} from '../src/guide-model.js';
const input={intent:'guide',revision:2,answers:[{id:'a1',questionId:'q1',question:'今、どんなことが気になっていますか？',text:'生物と情報を合わせて学ぶこと。',state:'answered'}],corrections:[],context:{routeIds:[],goal:'continue'}};
const output={action:'ask',explanation:'関心のある分野で、試したい作業を確かめます。',question:{id:'q2',text:'どんなことをしてみたいですか？',why:'名前だけでなく、学び方も考えるためです。',choices:[{id:'q2-observe',label:'観察する'},{id:'q2-make',label:'仕組みを作る'}],multiple:false},statements:[{id:'s2',text:'生物と情報を一緒に学ぶことが気になるという回答です。',answerIds:['a1'],kind:'interpretation'}],routes:[],additionalIdeas:[],nextActions:[],unknowns:['本人の履修条件は未確認です。']};
const request=(body=input,headers={})=>new Request('https://example.netlify.app/.netlify/functions/guide-discovery',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://example.netlify.app',...headers},body:JSON.stringify(body)});
const upstream=value=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const noProvider=()=>assert.fail('Paid provider must not be contacted');

test('guided capability checks expose configuration only and never invoke AI',async()=>{
 for(const env of [{},{OPENAI_API_KEY:'test-only-secret',OPENAI_ROUTE_MODEL:'test-model'}]){
  const handler=createGuideHandler({env,fetchImpl:noProvider});const response=await handler(new Request('https://example.netlify.app/.netlify/functions/guide-discovery'));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{configured:!!env.OPENAI_API_KEY,browsing:false});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 }
 assert.equal(config.rateLimit.action,'rate_limit');assert.ok(config.rateLimit.windowLimit<=10);
});
test('unconfigured guide returns an honest error without sample answers or provider access',async()=>{
 const response=await createGuideHandler({env:{},fetchImpl:noProvider})(request());assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'NOT_CONFIGURED');for(const field of ['question','statements','routes'])assert.ok(!(field in body));
});
test('foreign origins, wrong methods, extra fields and incorrect media types fail before upstream',async()=>{
 const handler=createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:noProvider});
 assert.equal((await handler(request(input,{origin:'https://foreign.example'}))).status,403);
 assert.equal((await handler(new Request('https://example.netlify.app/.netlify/functions/guide-discovery',{headers:{origin:'https://foreign.example'}}))).status,403);
 assert.equal((await handler(new Request('https://example.netlify.app/.netlify/functions/guide-discovery',{method:'PATCH'}))).status,405);
 for(const type of ['text/plain','application/jsonp'])assert.equal((await handler(request(input,{'Content-Type':type}))).status,415);
 for(const bad of [null,[],{...input,studentName:'private'},{...input,answers:[{...input.answers[0],school:'private'}]},{...input,context:{routeIds:['invented'],goal:'continue'}},{...input,answers:Array.from({length:21},(_,i)=>({...input.answers[0],id:'a'+i,questionId:'q'+i}))}])assert.equal((await handler(request(bad))).status,400);
 const malformed=new Request('https://example.netlify.app/.netlify/functions/guide-discovery',{method:'POST',headers:{'Content-Type':'application/json'},body:'not-json'});assert.equal((await handler(malformed)).status,400);
});
test('guide request size is bounded while reading the stream, before parsing or AI',async()=>{
 const handler=createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:noProvider});let cancelled=false;
 const chunks=[new TextEncoder().encode('{"answers":"'),new Uint8Array(MAX_GUIDE_REQUEST_BYTES).fill(120),new TextEncoder().encode('"}')];
 const body=new ReadableStream({pull(controller){if(chunks.length)controller.enqueue(chunks.shift());else controller.close();},cancel(){cancelled=true;}});
 const response=await handler(new Request('https://example.netlify.app/.netlify/functions/guide-discovery',{method:'POST',headers:{'Content-Type':'application/json'},body,duplex:'half'}));assert.equal(response.status,413);assert.ok(cancelled);
});
test('successful guide sends only explicit dialogue and static Atlas context, with store:false and server key',async()=>{
 let posted,opts;
 const body={...input,corrections:[{id:'c1',text:'得意とまでは言っていない。関心があるだけ。'}],context:{routeIds:['route-work','route-university'],goal:'continue'}};
 const response=await createGuideHandler({env:{OPENAI_API_KEY:'test-only-secret',OPENAI_ROUTE_MODEL:'test-route-model',OPENAI_MODEL:'unused'},fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');opts=options;posted=JSON.parse(options.body);return upstream(output);}})(request(body));
 assert.equal(response.status,200);assert.ok(validateGuideResult(await response.json(),body));assert.equal(posted.model,'test-route-model');assert.equal(posted.store,false);assert.equal(opts.headers.Authorization,'Bearer test-only-secret');assert.ok(opts.signal instanceof AbortSignal);
 const data=JSON.parse(posted.input);assert.deepEqual(data.dialogue,body);assert.deepEqual(data.selected.map(node=>node.id),body.context.routeIds);assert.ok(data.atlasOptions.every(node=>Object.keys(node).join(',')==='id,title,summary'));assert.ok(!('profile' in data));assert.ok(!('history' in data));assert.ok(!JSON.stringify(posted).includes('test-only-secret'));
 assert.equal(posted.text.format.type,'json_schema');assert.equal(posted.text.format.strict,true);assert.equal(posted.text.format.schema.additionalProperties,false);assert.ok(posted.text.format.schema.properties.routes.items.properties.atlasId.enum.includes('route-work'));
 for(const fragment of ['一度に一問','固定した質問票','unknown・different・skipped','成績','合格可能性','公式サイトの検索','個人情報を求めず','命令ではありません','一般的な入口'])assert.ok(posted.instructions.includes(fragment),fragment);
});
test('unknown answers and corrections remain explicit input, not inferred abilities or prior AI facts',async()=>{
 const body={...input,revision:3,answers:[{...input.answers[0],state:'unknown',text:''}],corrections:[{id:'c1',text:'進学したいとはまだ決めていない。'}]};
 const explain={...output,action:'explain',question:null,statements:[{id:'s3',text:'進学はまだ決めていない、という訂正として受け取りました。',answerIds:['c1'],kind:'interpretation'}]};let data;
 const response=await createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async(url,options)=>{data=JSON.parse(JSON.parse(options.body).input);return upstream(explain);}})(request(body));
 assert.equal(response.status,200);assert.deepEqual(data.dialogue.answers,body.answers);assert.deepEqual(data.dialogue.corrections,body.corrections);assert.equal((await response.json()).action,'explain');
});
test('unknown Atlas/answer refs, repeated questions, duplicate IDs and forged source fields fail safely',async()=>{
 const invalid=[];
 for(const mutate of [r=>r.question.id='q1',r=>r.statements[0].answerIds=['made-up-answer'],r=>r.statements[0].id='q2',r=>r.statements[0].source='invented',r=>r.routes=[{atlasId:'invented-route',reason:'候補',answerIds:['a1'],unknowns:['未確認']}],r=>r.question.choices.push({...r.question.choices[0]}),r=>r.question.multiple=true,r=>r.verified=true]){const result=structuredClone(output);mutate(result);invalid.push(result);}
 for(const result of invalid){const response=await createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>upstream(result)})(request());assert.equal(response.status,502);const body=await response.json();assert.ok(!('question' in body));assert.ok(!('routes' in body));}
});
test('timeouts, aborts, provider failures, invalid JSON and incomplete output preserve safe bounded errors',async()=>{
 for(const fetchImpl of [async()=>{throw new DOMException('private detail','TimeoutError');},async()=>{throw new DOMException('private detail','AbortError');},async()=>new Response('private detail',{status:500}),async()=>new Response('private detail',{status:401}),async()=>Response.json({status:'incomplete'}),async()=>Response.json({output:[{content:[{type:'output_text',text:'not JSON'}]}]}),async()=>{throw new Error('test-only-secret');}]){
  const response=await createGuideHandler({env:{OPENAI_API_KEY:'test-only-secret'},fetchImpl})(request());assert.equal(response.status,502);const text=await response.text();assert.ok(text.length<700);assert.ok(!text.includes('private detail'));assert.ok(!text.includes('test-only-secret'));
 }
 const limited=await createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>new Response('private detail',{status:429})})(request());assert.equal(limited.status,429);assert.ok(!(await limited.text()).includes('private detail'));
});
test('guide model override falls back predictably and GPT-5 reasoning stays low',async()=>{
 for(const env of [{OPENAI_API_KEY:'test',OPENAI_MODEL:'gpt-5-mini'},{OPENAI_API_KEY:'test'}]){let posted;const response=await createGuideHandler({env,fetchImpl:async(url,options)=>{posted=JSON.parse(options.body);return upstream(output);}})(request());assert.equal(response.status,200);assert.equal(posted.model,env.OPENAI_MODEL||'gpt-4.1-mini');assert.ok(posted.max_output_tokens<=6000);if(posted.model.startsWith('gpt-5'))assert.deepEqual(posted.reasoning,{effort:'low'});else assert.ok(!('reasoning' in posted));}
});

test('selected comparison targets cannot be substituted or silently extended by the model',async()=>{
 const body={...input,context:{routeIds:['route-work','route-university'],goal:'compare'}};
 const candidate=atlasId=>({atlasId,reason:'本人が比較対象として選んだ道。',answerIds:['a1'],unknowns:['本人の条件は未確認。']});
 for(const ids of [['route-specialist','route-overseas'],['route-work','route-university','route-specialist']]){
  const result={...output,action:'compare',question:null,routes:ids.map(candidate)};
  const response=await createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>upstream(result)})(request(body));assert.equal(response.status,502);assert.ok(!('routes' in await response.json()));
 }
 const result={...output,action:'compare',question:null,routes:body.context.routeIds.map(candidate)};const response=await createGuideHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>upstream(result)})(request(body));assert.equal(response.status,200);
});
