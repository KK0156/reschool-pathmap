import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTree} from '../retree-mindmap/src/sample-tree.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
import {createTreeDocument,stringifyTreeDocument,parseTreeDocument,readTreeFile,MAX_TREE_FILE_BYTES} from '../retree-mindmap/src/tree-file.js';
import {renderTree} from '../retree-mindmap/src/tree-renderer.js';
const positions=()=>new Map(layoutMindMap(sampleTree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
const document=()=>createTreeDocument(sampleTree,positions(),'roots','sample',true);
test('JSON round trip preserves nodes, selection, negative positions and unverified origin without memo fields',()=>{
 const p=positions();p.set('roots',{x:-1400.5,y:2100});const d=createTreeDocument(sampleTree,p,'roots','sample',true),text=stringifyTreeDocument(d),restored=parseTreeDocument(text);
 assert.deepEqual(restored,d);assert.deepEqual(restored.positions.find(p=>p.id==='roots'),{id:'roots',x:-1400.5,y:2100});assert.equal(restored.provenance.verification,'unverified');assert.equal(Object.hasOwn(restored,'memo'),false);
 restored.tree.nodes[0].label='変更';assert.notEqual(sampleTree.nodes[0].label,'変更');
});
test('legacy tree-only JSON and BOM files are validated and given fresh positions',()=>{
 const d=parseTreeDocument('\uFEFF'+JSON.stringify(sampleTree));assert.equal(d.positions.length,sampleTree.nodes.length);assert.equal(d.provenance.origin,'imported');assert.equal(d.provenance.verification,'unverified');
});
test('wrong format/version, fields, roots, cycles and disconnected nodes are rejected',()=>{
 for(const change of [d=>d.version=2,d=>d.format='other',d=>d.memo='private',d=>d.tree.nodes[1].parent=null,d=>d.tree.nodes[1].parent='teacher-workload',d=>d.tree.nodes[1].parent='missing',d=>d.tree.nodes[1].id='root',d=>d.selected='missing',d=>d.tree.nodes[1].type='unknown',d=>d.tree.nodes[1].type='core_question',d=>d.tree.nodes[1].label='',d=>d.tree.nodes[1].detail='x'.repeat(1801),d=>d.tree.nodes.push(...Array.from({length:201},()=>d.tree.nodes[0]))]){
  const d=document();change(d);assert.throws(()=>parseTreeDocument(JSON.stringify(d)));
 }
});
test('coordinates and source metadata cannot bypass validation',()=>{
 for(const change of [d=>d.positions.pop(),d=>d.positions[1].id=d.positions[0].id,d=>d.positions[0].x='20',d=>d.positions[0].x=1e20,d=>d.positions[0].x=null,d=>d.provenance.verification='verified',d=>d.provenance.origin='trusted']){const d=document();change(d);assert.throws(()=>parseTreeDocument(JSON.stringify(d)));}
 assert.throws(()=>parseTreeDocument(JSON.stringify(document()).replace('"x":60','"x":1e309').replace('"version":1','"version":1e309')));
});
test('dangerous property names, invalid JSON and oversized input fail safely',async()=>{
 assert.throws(()=>parseTreeDocument('{"__proto__":{"polluted":true}}'));assert.equal({}.polluted,undefined);
 assert.throws(()=>parseTreeDocument('<script>alert(1)</script>'));assert.throws(()=>parseTreeDocument(' '.repeat(MAX_TREE_FILE_BYTES+1)));
 let read=false;await assert.rejects(readTreeFile({name:'huge.json',size:MAX_TREE_FILE_BYTES+1,text:async()=>{read=true;return '{}';}}));assert.equal(read,false);
 await assert.rejects(readTreeFile({name:'map.html',size:20,text:async()=>'{}'}));
});
test('text remains literal, not executable, in restored nodes',()=>{
 const d=document();d.tree.nodes[1].label='<img src=x onerror=alert(1)>';const restored=parseTreeDocument(JSON.stringify(d));assert.ok(!renderTree(restored.tree,'root').includes('<img'));assert.ok(renderTree(restored.tree,'root').includes('&lt;img'));
});
