import test from 'node:test';
import assert from 'node:assert/strict';
import {createProposalHandler} from '../netlify/functions/deepen-tree.js';
import {createTreeHandler} from '../netlify/functions/generate-tree.js';
import {createProposalRequest,validateProposal} from '../retree-mindmap/src/tree-proposal.js';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
const input=createProposalRequest(sampleTree,'reschool','alternatives');
const proposal={summary:'まだ確かめていない検討候補です。',suggestions:[{label:'地域の学習支援を調べる',type:'project',detail:'卒業生への相談以外に、地域活動を通して学ぶ方法を比べる。',evidence:'活動の有無・参加条件は未確認。',risk:'時間や費用が合わない可能性。',next_action:'先生と自治体・主催者の公式案内を確認する。'}]};
const request=(body=input,headers={})=>new Request('https://example.netlify.app/.netlify/functions/deepen-tree',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.netlify.app',...headers},body:JSON.stringify(body)});
const upstream=value=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
test('capability checks disclose only a boolean and never call a provider',async()=>{
 for(const create of [createProposalHandler,createTreeHandler])for(const env of [{},{OPENAI_API_KEY:'test-only-key'}]){
  const handler=create({env,fetchImpl:()=>assert.fail('no provider during GET')});
  const response=await handler(new Request('https://example.netlify.app/.netlify/functions/generate-tree'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{configured:!!env.OPENAI_API_KEY});assert.equal(response.headers.get('cache-control'),'no-store');
  const denied=await handler(new Request('https://example.netlify.app/.netlify/functions/generate-tree',{headers:{origin:'https://elsewhere.example'}}));assert.equal(denied.status,403);
 }
});
test('unconfigured branch proposals and invalid requests never contact AI',async()=>{
 const handler=createProposalHandler({env:{},fetchImpl:()=>assert.fail('no provider')});
 const response=await handler(request());assert.equal(response.status,503);assert.equal((await response.json()).code,'NOT_CONFIGURED');
 assert.equal((await handler(request(input,{origin:'https://elsewhere.example'}))).status,403);
 assert.equal((await handler(request(input,{'content-type':'text/plain'}))).status,415);
 assert.equal((await handler(request({...input,memo:'private'}))).status,400);
 assert.equal((await handler(request({...input,intent:'compare'}))).status,400);
 assert.equal((await handler(request({...input,node:{...input.node,type:'invented'}}))).status,400);
 assert.equal((await handler(request({value:'x'.repeat(32768)}))).status,413);
 const malformed=new Request('https://example.netlify.app/.netlify/functions/deepen-tree',{method:'POST',headers:{'content-type':'application/json'},body:'not-json'});assert.equal((await handler(malformed)).status,400);
 const put=new Request('https://example.netlify.app/.netlify/functions/deepen-tree',{method:'PUT'});assert.equal((await handler(put)).status,405);
});
test('branch proposal uses server credentials, strict schema and selected context without persistence',async()=>{
 let posted,options;
 const handler=createProposalHandler({env:{OPENAI_API_KEY:'test-only-secret'},fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');options=opts;posted=JSON.parse(opts.body);return upstream(proposal);}});
 const response=await handler(request());assert.equal(response.status,200);assert.ok(validateProposal(await response.json()));assert.equal(posted.store,false);assert.equal(options.headers.Authorization,'Bearer test-only-secret');assert.equal(posted.text.format.strict,true);assert.equal(posted.text.format.schema.additionalProperties,false);assert.ok(options.signal instanceof AbortSignal);
 const data=JSON.parse(posted.input);assert.deepEqual(data.node,input.node);assert.equal(data.comparison,null);assert.ok(!('nodes' in data));assert.ok(!('memo' in data));assert.ok(!('grades' in data));assert.ok(!JSON.stringify(data).includes('ROOTS'));
 assert.ok(posted.instructions.includes('合格可能性を断定しない'));assert.ok(posted.instructions.includes('実在しない資料'));assert.ok(posted.instructions.includes('上書き'));assert.ok(!JSON.stringify(posted).includes('test-only-secret'));
});
test('timeouts, rate limits and malformed upstream proposals are contained with no leaked details',async()=>{
 for(const fetchImpl of [async()=>new Response('private upstream error',{status:401}),async()=>{throw new DOMException('private upstream error','TimeoutError');},async()=>{throw new DOMException('private upstream error','AbortError');},async()=>upstream({...proposal,suggestions:[{...proposal.suggestions[0],parent:'root'}]}),async()=>Response.json({status:'incomplete'}),async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'invalid-json'}]}]})]){
  const response=await createProposalHandler({env:{OPENAI_API_KEY:'test'},fetchImpl})(request());assert.equal(response.status,502);assert.ok(!(await response.text()).includes('private upstream error'));
 }
 const limited=await createProposalHandler({env:{OPENAI_API_KEY:'test'},fetchImpl:async()=>new Response('internal details',{status:429})})(request());assert.equal(limited.status,429);assert.ok(!(await limited.text()).includes('internal details'));
});
