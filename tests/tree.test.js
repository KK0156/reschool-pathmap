import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
import {validateTree,renderTree,renderDetail} from '../retree-mindmap/src/tree-renderer.js';
import {createTreeHandler} from '../netlify/functions/generate-tree.js';
const copy=()=>structuredClone(sampleTree);
const req=memo=>new Request('https://example.netlify.app/.netlify/functions/generate-tree',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.netlify.app'},body:JSON.stringify({memo})});
test('sample tree renders every node and its detail without hover',()=>{
 assert.ok(validateTree(sampleTree));assert.equal(sampleTree.nodes.length,10);
 const html=renderTree(sampleTree,'root');assert.equal((html.match(/data-node=/g)||[]).length,10);
 for(const n of sampleTree.nodes){const detail=renderDetail(n,'sample');assert.ok(detail.includes('証拠・資料'));assert.ok(detail.includes('次にできること'));}
});
test('duplicate ids, multiple roots, missing parents and disconnected cycles are rejected',()=>{
 for(const mutate of [t=>t.nodes[1].id='root',t=>t.nodes[1].parent=null,t=>t.nodes[1].parent='missing',t=>{t.nodes[1].parent='reschool-risk';},t=>t.nodes.push(...Array(40).fill(t.nodes[0]))]){const t=copy();mutate(t);assert.equal(validateTree(t),false);}
});
test('all generated text is escaped in map and detail',()=>{
 const t=copy();t.nodes[1].label='<img src=x onerror=alert(1)>';t.nodes[1].evidence='<script>alert(1)</script>';
 assert.ok(!renderTree(t,'root').includes('<img'));
 assert.ok(!renderDetail(t.nodes[1],'generated').includes('<script>'));
});
test('invalid memo or unconfigured API does not call OpenAI',async()=>{
 const handler=createTreeHandler({env:{},fetchImpl:()=>assert.fail('no provider call')});
 assert.equal((await handler(req(''))).status,400);assert.equal((await handler(req('x'.repeat(3001)))).status,400);
 assert.equal((await handler(req('研究テーマを整理したい。'))).status,503);
 assert.equal((await handler(new Request('https://example.netlify.app/.netlify/functions/generate-tree'))).status,405);
});
test('server key stays private and store:false is set; valid structured tree is returned',async()=>{
 let posted;
 const handler=createTreeHandler({env:{OPENAI_API_KEY:'test-key'},fetchImpl:async(url,opts)=>{posted=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,'Bearer test-key');return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(sampleTree)}]}]});}});
 const response=await handler(req('RE:SchoolとROOTSをどうつなげるか整理したい。'));
 assert.equal(response.status,200);assert.ok(validateTree(await response.json()));assert.equal(posted.store,false);assert.equal(posted.text.format.type,'json_schema');assert.ok(!JSON.stringify(posted).includes('test-key'));
});
test('malformed or invalid upstream trees are rejected for client fallback',async()=>{
 const invalid=copy();invalid.nodes[1].parent='missing';
 for(const text of ['not json',JSON.stringify(invalid)]){
  const response=await createTreeHandler({env:{OPENAI_API_KEY:'test-key'},fetchImpl:async()=>Response.json({output:[{content:[{type:'output_text',text}]}]})})(req('調べたことを整理したい。'));assert.equal(response.status,502);
 }
});

test('all consultation samples have valid trees and distinct everyday examples',async()=>{const {samplePrompts}=await import('../retree-mindmap/src/sample-tree.js');assert.equal(samplePrompts.length,12);for(const p of samplePrompts){assert.ok(p.memo.length<=3000);assert.ok(validateTree(p.tree));}assert.equal(new Set(samplePrompts.map(p=>p.tree.core_question)).size,9);});
