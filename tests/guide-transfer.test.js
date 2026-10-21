import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {createAtlasTransfer} from '../src/route-atlas-model.js';
import {enrichGuideTransfer} from '../src/guide-transfer.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
import {createTreeDocument,stringifyTreeDocument,parseTreeDocument} from '../retree-mindmap/src/tree-file.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
const selected=routeAtlas.nodes.filter(node=>['route-work','route-university'].includes(node.id));
const snapshot=()=>({summary:'候補を考えるための整理',statements:[],routes:[{atlasId:selected[0].id,reason:'一般的な入口として、仕事と学びの組み合わせを考える。',answerIds:[],unknowns:['個別の募集・採用条件は未確認']}],additionalIdeas:[],nextActions:[{id:'trial',text:'仕事の一日の例を二つ読んで、知りたいことを残す。',answerIds:[]}],unknowns:[],userCorrections:[{id:'correction-1',text:'大学に興味がないのではなく、中身をまだ知らない。'}],conversation:null,requestsUsed:1,stale:true,correspondence:'not_saved'});

test('reference material, AI supplements and personal corrections retain separate origins through Tree JSON',()=>{
 const base=createAtlasTransfer(selected),before=structuredClone(base);
 const result=enrichGuideTransfer(base,{atlasIds:selected.map(n=>n.id),guide:snapshot(),notes:'本人が残した気づき',nextActions:'授業の内容を二つ比べる'});
 assert.deepEqual(base,before);assert.ok(validateTree(result.tree));
 assert.equal(result.nodeOrigins['atlas-1'],'reference');
 const reason=result.tree.nodes.find(n=>n.label==='AIがこの道を挙げた理由（未確認）');
 assert.equal(result.nodeOrigins[reason.id],'ai_proposal');assert.match(reason.detail,/元の回答は未保存/);assert.match(reason.detail,/見直し/);
 const correction=result.tree.nodes.find(n=>n.detail===snapshot().userCorrections[0].text);assert.equal(result.nodeOrigins[correction.id],'manual');
 const positions=new Map(layoutMindMap(result.tree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
 const doc=createTreeDocument(result.tree,positions,'root','reference',false,result.nodeOrigins);
 const restored=parseTreeDocument(stringifyTreeDocument(doc));assert.deepEqual(restored.nodeOrigins,result.nodeOrigins);assert.equal(restored.provenance.verification,'unverified');
});
test('an unselected AI route is not made a selected branch; full personal notes are kept without truncation',()=>{
 const base=createAtlasTransfer([selected[1]]),guide=snapshot(),notes='仮'.repeat(3000);
 const result=enrichGuideTransfer(base,{atlasIds:[selected[1].id],guide,notes});
 assert.equal(result.tree.nodes.filter(n=>n.label==='AIがこの道を挙げた理由（未確認）').length,0);
 assert.equal(result.tree.nodes.filter(n=>n.id.startsWith('guide-note-')&&n.label.startsWith('本人の確認メモ')).map(n=>n.detail).join(''),notes);
 assert.equal(result.tree.nodes.filter(n=>n.type==='project').length,1);
});
test('invalid or misaligned guide handoffs fail without altering the general map',()=>{
 const base=createAtlasTransfer(selected),before=structuredClone(base),guide=snapshot();guide.routes[0].atlasId='nonexistent-route';
 assert.throws(()=>enrichGuideTransfer(base,{atlasIds:selected.map(n=>n.id),guide}));
 assert.throws(()=>enrichGuideTransfer(base,{atlasIds:selected.map(n=>n.id).reverse()}));assert.deepEqual(base,before);
});
