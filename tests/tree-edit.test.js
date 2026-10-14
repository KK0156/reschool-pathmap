import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
import {editNode,addNode,deleteNode,composeMemo,editorView} from '../retree-mindmap/src/tree-edit.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
test('editing clones source data, changes root question, and escapes HTML in editor',()=>{
 const next=editNode(sampleTree,'root',{label:'自分の問い <script>',detail:'自分で確かめたいこと'});
 assert.equal(next.core_question,'自分の問い <script>');assert.notEqual(sampleTree.core_question,next.core_question);assert.ok(validateTree(next));assert.ok(!editorView(next,'root').includes('<script>'));assert.ok(editorView(next,'root').includes('&lt;script&gt;'));
});
test('branch editing supports moves and rejects cycles and invalid text',()=>{
 const next=editNode(sampleTree,'roots',{parent:'reschool'});assert.equal(next.nodes.find(n=>n.id==='roots').parent,'reschool');
 assert.throws(()=>editNode(sampleTree,'reschool',{parent:'teacher-workload'}));assert.throws(()=>editNode(sampleTree,'reschool',{label:'  '}));assert.throws(()=>editNode(sampleTree,'reschool',{detail:'a'.repeat(1801)}));
});
test('adding uses unique ids, deletion removes descendants and protects root and original data',()=>{
 const first=addNode(sampleTree,'reschool'),second=addNode(first.tree,'reschool');assert.notEqual(first.id,second.id);assert.ok(validateTree(second.tree));
 const deleted=deleteNode(second.tree,'reschool');assert.ok(!deleted.nodes.some(n=>['reschool','teacher-workload',first.id,second.id].includes(n.id)));assert.ok(validateTree(deleted));assert.equal(sampleTree.nodes.length,10);assert.throws(()=>deleteNode(sampleTree,'root'));
 let full=sampleTree;while(full.nodes.length<200)full=addNode(full,'root').tree;assert.throws(()=>addNode(full,'root'));
});
test('optional background is omitted when blank and included only for known nonempty fields',()=>{
 assert.equal(composeMemo('  相談  ',{grades:' ',subjects:''}),'相談');
 assert.equal(composeMemo('相談',{grades:'  評定3.5 ',subjects:'数学',school:'秘密',conditions:''}),'相談\n\n相談の背景（本人のメモ・未確認）：\n成績の目安：評定3.5\n得意・苦手な科目：数学');
});
