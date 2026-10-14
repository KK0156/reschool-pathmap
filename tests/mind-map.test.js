import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
import {sampleTree,samplePrompts} from '../retree-mindmap/src/sample-tree.js';
function check(tree){
 const map=layoutMindMap(tree);assert.equal(map.nodes.length,tree.nodes.length);assert.equal(map.edges.length,tree.nodes.length-1);
 for(const n of map.nodes){assert.ok(n.x>=0&&n.y>=0&&n.x+n.width<=map.width&&n.y+n.height<=map.height);}
 for(let i=0;i<map.nodes.length;i++)for(let j=i+1;j<map.nodes.length;j++){
  const a=map.nodes[i],b=map.nodes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${a.id} overlaps ${b.id}`);
 }
 const root=map.nodes.find(n=>n.parent===null);
 for(const edge of map.edges){const n=map.nodes.find(n=>n.id===edge.child);assert.equal(n.parent,edge.parent);assert.ok(!/NaN|Infinity/.test(edge.path));}
 if(tree.nodes.filter(n=>n.parent===root.id).length>1){assert.ok(map.nodes.some(n=>n.side==='left'));assert.ok(map.nodes.some(n=>n.side==='right'));}
}
test('all 28 sample maps have two-sided branches, one connector per relationship, and no overlapping nodes',()=>samplePrompts.forEach(p=>check(p.tree)));
test('layout handles long labels, root-only trees, 40 siblings and deep branches',()=>{
 const t=structuredClone(sampleTree);t.nodes.forEach(n=>n.label='長い項目の見出し'.repeat(15));check(t);
 const root=sampleTree.nodes[0];check({...sampleTree,nodes:[root]});
 check({...sampleTree,nodes:[root,...Array.from({length:39},(_,i)=>({...sampleTree.nodes[1],id:`item-${i}`,parent:'root'}))]});
 check({...sampleTree,nodes:[root,...Array.from({length:12},(_,i)=>({...sampleTree.nodes[1],id:`item-${i}`,parent:i?`item-${i-1}`:'root'}))]});
});
