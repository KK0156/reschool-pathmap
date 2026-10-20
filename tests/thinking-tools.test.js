import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
import {reflectionPrompts,addReflection,addNextStep} from '../retree-mindmap/src/thinking-tools.js';
import {printMemo} from '../retree-mindmap/src/research-print.js';
import {createTreeDocument,parseTreeDocument} from '../retree-mindmap/src/tree-file.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
test('reflection prompts append explicit unverified possibilities without changing original content',()=>{
 for(const p of reflectionPrompts){const next=addReflection(sampleTree,'root',p.id);assert.equal(next.tree.nodes.length,sampleTree.nodes.length+1);assert.deepEqual(next.tree.nodes.slice(0,-1),sampleTree.nodes);assert.ok(next.tree.nodes.at(-1).evidence.includes('未確認'));}assert.throws(()=>addReflection(sampleTree,'root','unknown'));
});
test('next steps preserve concrete research/person/try/timing as an editable action, not a final judgment',()=>{
 assert.throws(()=>addNextStep(sampleTree,'root',{research:'',person:'',try:'',when:'明日'}));
 const next=addNextStep(sampleTree,'root',{research:'公開授業の内容',person:'進路担当の先生',try:'講座を一つ見る',when:'次の面談まで'});assert.equal(next.tree.nodes.at(-1).type,'action');assert.ok(next.tree.nodes.at(-1).detail.includes('進路担当の先生'));assert.ok(next.tree.nodes.at(-1).risk.includes('確認'));
});
test('node origin metadata roundtrips without claiming verified facts and rejects partial or invented origins',()=>{
 const origins=Object.fromEntries(sampleTree.nodes.map(n=>[n.id,'sample']));origins.reschool='user_edited';origins.roots='ai_proposal';
 const positions=new Map(layoutMindMap(sampleTree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));const doc=createTreeDocument(sampleTree,positions,'roots','sample',true,origins);
 assert.deepEqual(parseTreeDocument(JSON.stringify(doc)).nodeOrigins,origins);
 for(const change of [d=>delete d.nodeOrigins.root,d=>d.nodeOrigins.root='verified',d=>d.nodeOrigins.missing='manual',d=>d.nodeOrigins.root=['sample']]){const d=structuredClone(doc);change(d);assert.throws(()=>parseTreeDocument(JSON.stringify(d)));}
});
test('print memo is a safe excerpt by default, with full node details only when requested',()=>{
 const tree=structuredClone(sampleTree);tree.core_question='<img src=x>';tree.nodes[0].detail='<script>alert(1)</script>';
 const short=printMemo(tree,'sample');assert.ok(short.includes('架空の相談例'));assert.ok(!short.includes('<img'));assert.ok(!short.includes('<script>'));assert.ok(!short.includes('図に残したすべての項目'));
 const full=printMemo(tree,'sample',{},true);assert.ok(full.includes('図に残したすべての項目'));assert.ok(full.includes('&lt;script&gt;'));
});

test('dangerous JSON property IDs cannot create non-roundtrippable origin metadata',()=>{
 for(const id of ['__proto__','constructor','prototype']){const tree=structuredClone(sampleTree);tree.nodes[1].id=id;const p=new Map(layoutMindMap(sampleTree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));assert.throws(()=>createTreeDocument(tree,p,'root'));}
});
