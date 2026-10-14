import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasLayout,syncPositions} from '../retree-mindmap/src/canvas-state.js';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
import {addNode,deleteNode} from '../retree-mindmap/src/tree-edit.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
test('free coordinates extend beyond the original sheet and connectors follow moved items',()=>{
 const positions=new Map(layoutMindMap(sampleTree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));const before=canvasLayout(sampleTree,positions);
 positions.set('reschool',{x:-20000,y:30000});const after=canvasLayout(sampleTree,positions);
 assert.equal(after.nodes.find(n=>n.id==='reschool').x,-20000);assert.ok(after.bounds.left<-20000);assert.ok(after.bounds.bottom>30000);
 assert.notEqual(before.edges.find(e=>e.child==='reschool').path,after.edges.find(e=>e.child==='reschool').path);assert.notEqual(before.edges.find(e=>e.parent==='reschool').path,after.edges.find(e=>e.parent==='reschool').path);
});
test('adding and deleting preserve positions of surviving nodes',()=>{
 const p=new Map([['root',{x:4000,y:-5000}],['reschool',{x:-1000,y:400}]]);const next=addNode(sampleTree,'root');syncPositions(next.tree,p);
 assert.deepEqual(p.get('root'),{x:4000,y:-5000});assert.deepEqual(p.get('reschool'),{x:-1000,y:400});assert.ok(p.has(next.id));syncPositions(deleteNode(next.tree,next.id),p);assert.ok(!p.has(next.id));
});
test('manual maps can exceed 40 items while the AI response limit remains 40',()=>{
 const root=sampleTree.nodes[0],tree={...sampleTree,nodes:[root,...Array.from({length:99},(_,i)=>({...sampleTree.nodes[1],id:`n-${i}`,parent:'root'}))]};
 assert.ok(validateTree(tree));assert.ok(!validateTree(tree,{maxNodes:40}));assert.equal(canvasLayout(tree,new Map()).nodes.length,100);
});
