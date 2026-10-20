import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
import {addNode} from '../retree-mindmap/src/tree-edit.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
import {proposalIntents,buildProposalContext,createProposalRequest,validateProposalRequest,validateProposal,applyProposal} from '../retree-mindmap/src/tree-proposal.js';
const suggestion={label:'公開講座で試す',type:'project',detail:'気になる分野の公開講座を探し、内容を比べる候補です。',evidence:'公開日程・参加条件・出典は未確認。',risk:'費用や対象年齢が合わない可能性。',next_action:'先生と、主催者の公式案内にある参加条件を確認する。'};
const proposal={summary:'比較するための候補です。参加できるかは未確認です。',suggestions:[suggestion]};
test('branch request carries selected context only and comparison is explicit',()=>{
 const tree=structuredClone(sampleTree);tree.nodes[1].private='not sent';tree.nodes[1].detail='a'.repeat(1800);
 const context=buildProposalContext(tree.nodes[1]);assert.equal(context.detail.length,900);assert.ok(!('private' in context));assert.ok(!('parent' in context));assert.ok(!('id' in context));
 delete tree.nodes[1].private;
 const body=createProposalRequest(tree,'reschool','alternatives');assert.ok(validateProposalRequest(body));assert.deepEqual(Object.keys(body),['question','node','intent','comparison']);assert.equal(body.comparison,null);assert.ok(!JSON.stringify(body).includes('ROOTS'));
 for(const intent of Object.keys(proposalIntents)){const request=createProposalRequest(tree,'reschool',intent,intent==='compare'?'roots':null);assert.ok(validateProposalRequest(request));}
 assert.throws(()=>createProposalRequest(tree,'reschool','compare','reschool'));assert.throws(()=>createProposalRequest(tree,'reschool','compare','missing'));assert.throws(()=>createProposalRequest(tree,'missing','action'));
});
test('proposal validation rejects unknown keys, types, oversized fields and missing comparison',()=>{
 const request=createProposalRequest(sampleTree,'reschool','action');
 for(const value of [null,[],{...request,memo:'private'},{...request,question:''},{...request,intent:'decide'},{...request,comparison:request.node},{...request,node:{...request.node,id:'reschool'}},{...request,node:{...request.node,detail:'x'.repeat(901)}},{...request,intent:'compare'}])assert.equal(validateProposalRequest(value),false);
 assert.ok(validateProposal(proposal));
 for(const value of [null,[],{...proposal,source:'made-up'},{...proposal,summary:''},{...proposal,suggestions:[]},{...proposal,suggestions:Array(6).fill(suggestion)},{...proposal,suggestions:[{...suggestion,id:'injected'}]},{...proposal,suggestions:[{...suggestion,parent:null}]},{...proposal,suggestions:[{...suggestion,type:'core_question'}]},{...proposal,suggestions:[{...suggestion,label:'x'.repeat(181)}]},{...proposal,suggestions:[{...suggestion,evidence:''}]}])assert.equal(validateProposal(value),false);
});
test('accepting proposals appends unique children and never overwrites existing edits',()=>{
 const tree=structuredClone(sampleTree);tree.nodes[1].detail='本人が書き直した内容';tree.nodes.push({id:'proposal-1',parent:'root',...suggestion});const original=structuredClone(tree);
 const result=applyProposal(tree,'reschool',{...proposal,suggestions:[suggestion,{...suggestion,type:'counterargument',label:'別の説明'}]});
 assert.deepEqual(tree,original);assert.deepEqual(result.tree.nodes.slice(0,tree.nodes.length),original.nodes);assert.deepEqual(result.addedIds,['proposal-2','proposal-3']);assert.ok(validateTree(result.tree));assert.ok(result.tree.nodes.slice(-2).every(n=>n.parent==='reschool'));assert.deepEqual(result.tree.core_question,tree.core_question);
});
test('capacity, invalid parent and excessive depth fail atomically',()=>{
 let full=structuredClone(sampleTree);while(full.nodes.length<200)full=addNode(full,'root').tree;const copy=structuredClone(full);
 assert.throws(()=>applyProposal(full,'root',proposal));assert.deepEqual(full,copy);assert.throws(()=>applyProposal(sampleTree,'missing',proposal));
 let deep={core_question:'問い',summary:'検証用の図',nodes:[{id:'root',parent:null,...suggestion,type:'core_question'}]};let parent='root';for(let i=1;i<=12;i++){deep.nodes.push({id:'n'+i,parent,...suggestion});parent='n'+i;}
 assert.ok(validateTree(deep));assert.throws(()=>applyProposal(deep,'n12',proposal));assert.equal(deep.nodes.length,13);
});
