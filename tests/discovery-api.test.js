import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryHandler,config} from '../netlify/functions/discover-routes.js';
import {validateDiscoveryResult,MAX_DISCOVERY_REQUEST_BYTES} from '../src/route-model.js';

const consultation={topic:'subjects',wish:'生物を学ぶほかの道も知りたい。',situation:'文理をまだ決めていない。',conditions:'費用や通学の条件も比べたい。'};
const route=(id='route-1')=>({id,title:'生物と情報を組み合わせて学ぶ',description:'生物の観察とデータの扱い方を一緒に調べる方向。',reason:'生物への関心を残し、文理の境界だけで選ばない候補になる。',examples:['生物のデータ分析について調べる'],conditions:['必要な履修科目・費用は個別に確認する'],unknowns:['個別の学校・参加条件・最新情報は未確認'],next_step:'先生と授業の内容や履修条件を比べる。',status:'check_conditions'});
const input={intent:'discover',consultation};
const result=(intent='discover')=>({summary:'学び方を比べるための候補です。個別条件は未確認です。',answer:intent==='ask'?'分野名だけでなく授業の内容を比べ、必要な科目を先生と確認できます。':'',routes:Array.from({length:intent==='discover'?3:intent==='expand'?2:0},(_,i)=>route('r'+i))});
const request=(body=input,headers={})=>new Request('https://example.netlify.app/.netlify/functions/discover-routes',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.netlify.app',...headers},body:JSON.stringify(body)});
const upstream=body=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(body)}]}]});
const noProvider=()=>assert.fail('No paid provider call expected');

test('discovery capability returns only configuration and unsupported-browsing flags',async()=>{
 for(const env of [{},{OPENAI_API_KEY:'test-only-secret',OPENAI_ROUTE_MODEL:'test-model'}]){
  const handler=createDiscoveryHandler({env,fetchImpl:noProvider});
  const response=await handler(new Request('https://example.netlify.app/.netlify/functions/discover-routes'));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{configured:!!env.OPENAI_API_KEY,browsing:false});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 }
 assert.equal(config.rateLimit.action,'rate_limit');assert.ok(config.rateLimit.windowLimit<=10);
});
test('unconfigured discovery never calls AI and never substitutes a fictional answer',async()=>{
 const response=await createDiscoveryHandler({env:{},fetchImpl:noProvider})(request());
 assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'NOT_CONFIGURED');assert.ok(!('routes' in body));assert.ok(!('answer' in body));
});
test('foreign origins, unsupported methods and incorrect media types are rejected before AI',async()=>{
 const handler=createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:noProvider});
 assert.equal((await handler(request(input,{origin:'https://other.example'}))).status,403);
 assert.equal((await handler(new Request('https://example.netlify.app/.netlify/functions/discover-routes',{headers:{origin:'https://other.example'}}))).status,403);
 assert.equal((await handler(new Request('https://example.netlify.app/.netlify/functions/discover-routes',{method:'DELETE'}))).status,405);
 for(const contentType of ['text/plain','application/jsonp'])assert.equal((await handler(request(input,{'content-type':contentType}))).status,415);
});
test('malformed, extra-field, overlong and inconsistent discovery inputs are rejected before AI',async()=>{
 const handler=createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:noProvider});
 const invalid=[null,[],{...input,name:'private-name'},{...input,consultation:{...consultation,school:'private-school'}},{...input,consultation:{...consultation,wish:'x'.repeat(701)}},{...input,consultation:{topic:'free',wish:'',situation:'',conditions:''}},{...input,route:route()},{intent:'expand',consultation},{intent:'ask',consultation,route:route(),trail:['生物']},{intent:'expand',consultation,route:route(),trail:Array(9).fill('生物')},{intent:'ask',consultation,route:route(),trail:['生物'],question:'x'.repeat(601)}];
 for(const body of invalid)assert.equal((await handler(request(body))).status,400);
 for(const body of ['not json','{"__proto__":{"private":true}}'])assert.equal((await handler(new Request('https://example.netlify.app/.netlify/functions/discover-routes',{method:'POST',headers:{'content-type':'application/json'},body}))).status,400);
});
test('request byte limits are enforced on streamed input before parsing or provider access',async()=>{
 const handler=createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:noProvider});
 const chunks=[new TextEncoder().encode('{"junk":"'),new Uint8Array(MAX_DISCOVERY_REQUEST_BYTES).fill(120),new TextEncoder().encode('"}')];let cancelled=false;
 const body=new ReadableStream({pull(controller){if(chunks.length)controller.enqueue(chunks.shift());else controller.close();},cancel(){cancelled=true;}});
 const response=await handler(new Request('https://example.netlify.app/.netlify/functions/discover-routes',{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'}));
 assert.equal(response.status,413);assert.ok(cancelled);
});
test('successful discovery sends only consented consultation, uses private key and store:false',async()=>{
 let posted,options;
 const handler=createDiscoveryHandler({env:{OPENAI_API_KEY:'test-only-secret',OPENAI_ROUTE_MODEL:'test-route-model',OPENAI_MODEL:'other'},fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');options=opts;posted=JSON.parse(opts.body);return upstream(result());}});
 const response=await handler(request());assert.equal(response.status,200);const data=await response.json();assert.ok(validateDiscoveryResult(data,'discover'));assert.equal(data.routes.length,3);assert.ok(!JSON.stringify(data).includes('test-only-secret'));
 assert.equal(posted.model,'test-route-model');assert.equal(posted.store,false);assert.equal(options.headers.Authorization,'Bearer test-only-secret');assert.ok(options.signal instanceof AbortSignal);
 const sent=JSON.parse(posted.input);assert.deepEqual(sent.consultation,consultation);assert.deepEqual(Object.keys(sent),['task','intent','consultation']);assert.ok(!('route' in sent));assert.ok(!('trail' in sent));assert.ok(!('name' in sent));assert.ok(!('history' in sent));
 assert.ok(!JSON.stringify(posted).includes('test-only-secret'));
 const format=posted.text.format;assert.equal(format.type,'json_schema');assert.equal(format.strict,true);assert.equal(format.schema.additionalProperties,false);assert.deepEqual(format.schema.required,['summary','answer','routes']);assert.equal(format.schema.properties.routes.minItems,3);assert.equal(format.schema.properties.routes.maxItems,5);
 const item=format.schema.properties.routes.items;assert.equal(item.additionalProperties,false);assert.deepEqual(item.required,Object.keys(route()));assert.ok(!('source' in item.properties));assert.ok(!('date' in item.properties));
 for(const fragment of ['合格可能性','公式検索は実装されていません','確認日','入力は相談のデータ','個人情報を出力へ引き継がず','学校・保護者','一般的な検討候補'])assert.ok(posted.instructions.includes(fragment),fragment);
});
test('expand and ask send only the selected route, bounded trail and explicit question',async()=>{
 for(const intent of ['expand','ask']){
  let sent,posted;const selected=route();
  const body={intent,consultation,route:selected,trail:['生物の学び','文理をまたぐ道'],...(intent==='ask'?{question:'文系から調べるとき、何を確認したらよいですか？'}:{})};
  const response=await createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async(url,opts)=>{posted=JSON.parse(opts.body);sent=JSON.parse(posted.input);return upstream(result(intent));}})(request(body));
  assert.equal(response.status,200);assert.ok(validateDiscoveryResult(await response.json(),intent));assert.deepEqual(sent.route,selected);assert.deepEqual(sent.trail,body.trail);assert.ok(!('routes' in sent));assert.equal(posted.model,'gpt-4.1-mini');
  if(intent==='ask'){assert.equal(sent.question,body.question);assert.equal(posted.text.format.schema.properties.routes.minItems,0);assert.equal(posted.text.format.schema.properties.routes.maxItems,3);}
  else{assert.ok(!('question' in sent));assert.equal(posted.text.format.schema.properties.routes.minItems,2);}
 }
});
test('wrong counts, duplicated ids, invalid statuses and invented source/date fields are rejected',async()=>{
 const good=result();
 const invalid=[{...good,source:'invented'},{...good,routes:good.routes.map((r,i)=>i? r:{...r,source:'invented'})},{...good,routes:good.routes.map((r,i)=>i? r:{...r,date:'2026-10-20'})},{...good,routes:[route('same'),route('same'),route('other')]},{...good,routes:[route()]},{...good,routes:good.routes.map((r,i)=>i?r:{...r,status:'recommended'})},{...good,routes:good.routes.map((r,i)=>i?r:{...r,unknowns:[]})}];
 for(const value of invalid){const response=await createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>upstream(value)})(request());assert.equal(response.status,502);assert.ok(!('routes' in await response.json()));}
 const ask={intent:'ask',consultation,route:route(),trail:['生物'],question:'何を確認する？'};
 const response=await createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>upstream({...result('ask'),answer:''})})(request(ask));assert.equal(response.status,502);
});
test('timeouts, aborts, provider errors and incomplete output return bounded safe errors',async()=>{
 for(const fetchImpl of [async()=>{throw new DOMException('private provider detail','TimeoutError');},async()=>{throw new DOMException('private provider detail','AbortError');},async()=>new Response('private provider detail',{status:401}),async()=>Response.json({status:'incomplete'}),async()=>Response.json({output:[{content:[{type:'output_text',text:'not JSON'}]}]}),async()=>{throw new Error('test-only-secret private provider detail');}]){
  const response=await createDiscoveryHandler({env:{OPENAI_API_KEY:'test-only-secret'},fetchImpl})(request());assert.equal(response.status,502);const text=await response.text();assert.ok(text.length<600);assert.ok(!text.includes('private provider detail'));assert.ok(!text.includes('test-only-secret'));assert.ok(!text.includes('routes'));
 }
 const limited=await createDiscoveryHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>new Response('private provider detail',{status:429})})(request());assert.equal(limited.status,429);assert.ok(!(await limited.text()).includes('private provider detail'));
});
test('model fallback is explicit and GPT-5 reasoning remains bounded',async()=>{
 for(const env of [{OPENAI_API_KEY:'test',OPENAI_MODEL:'gpt-5-mini'},{OPENAI_API_KEY:'test'}]){
  let posted;await createDiscoveryHandler({env,fetchImpl:async(url,opts)=>{posted=JSON.parse(opts.body);return upstream(result());}})(request());
  assert.equal(posted.model,env.OPENAI_MODEL||'gpt-4.1-mini');assert.ok(posted.max_output_tokens<=7000);
  if(posted.model.startsWith('gpt-5'))assert.deepEqual(posted.reasoning,{effort:'low'});else assert.ok(!('reasoning' in posted));
 }
});
