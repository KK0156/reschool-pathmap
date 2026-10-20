import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {atlasFacetLabels,atlasStatusLabels,subjectOptions,validateRouteAtlas,getAtlasNode,getAtlasChildren,getAtlasConnections,getAtlasRoots,validateAtlasPreferences,assessAtlasNode,validateAtlasRecord,matchAtlasHighlights,createAtlasTransfer} from '../src/route-atlas-model.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
import {createTreeDocument,stringifyTreeDocument,parseTreeDocument} from '../retree-mindmap/src/tree-file.js';
const clone=()=>structuredClone(routeAtlas);
const preferences=()=>({wish:'',subjects:[],timing:'undecided',budget:'undecided'});
const record=()=>({state:'constraint_recorded',note:'公式の募集案内に必要な履修科目が記載されていた。',sourceUrl:'https://example.org/official/requirements',checkedOn:'2025-01-02'});

test('atlas exposes four lenses, seven neutral after-school entrances and all eight comparison facets',()=>{
 assert.ok(validateRouteAtlas(routeAtlas));assert.deepEqual(Object.keys(atlasFacetLabels),['learning','life','cost','income','requirements','duration','future','change']);
 assert.equal(routeAtlas.lenses.length,4);assert.equal(getAtlasRoots('after-school').length,7);
 assert.deepEqual(new Set(getAtlasRoots('after-school').map(n=>n.id)),new Set(['route-work','route-specialist','route-university','route-overseas','route-explore','route-work-learn','route-relearn']));
 for(const node of routeAtlas.nodes){assert.deepEqual(Object.keys(node.facets).sort(),Object.keys(atlasFacetLabels).sort());assert.ok(node.nextStep);}
 assert.ok(routeAtlas.coverage.limitations.length&&routeAtlas.coverage.notIncluded.length);
});
test('catalogue rejects dangling links, duplicate IDs, missing facets, unknown keys and contains cycles',()=>{
 for(const mutate of [c=>c.nodes.push(structuredClone(c.nodes[0])),c=>c.edges.push({...c.edges[0],to:'not-there'}),c=>delete c.nodes[0].facets.cost,c=>c.nodes[0].verified=true,c=>c.nodes[0].sourceIds.push('not-there'),c=>c.lenses[0].rootIds.push('not-there'),c=>c.sources[0].url='javascript:alert(1)',c=>{const e=c.edges.find(e=>e.type==='contains');c.edges.push({...e,from:e.to,to:e.from});}]){const c=clone();mutate(c);assert.equal(validateRouteAtlas(c),false);}
 assert.equal(validateRouteAtlas(null),false);assert.equal(validateRouteAtlas([]),false);
});
test('hierarchy supports shared children while non-hierarchy cross-links may form cycles',()=>{
 const c=clone(),edge=c.edges.find(e=>e.type==='contains');assert.ok(edge);
 const spare=c.nodes.find(n=>n.id!==edge.from&&n.id!==edge.to&&!c.edges.some(e=>e.type==='contains'&&e.from===n.id&&e.to===edge.to)&&!c.edges.some(e=>e.type==='contains'&&e.from===edge.to&&e.to===n.id));
 // Place a second parent on a leaf, avoiding an accidental hierarchy cycle.
 const leaf=c.nodes.find(n=>!c.edges.some(e=>e.type==='contains'&&e.from===n.id));
 const parent=c.nodes.find(n=>n.id!==leaf.id&&!c.edges.some(e=>e.type==='contains'&&e.from===n.id&&e.to===leaf.id));
 c.edges.push({from:parent.id,to:leaf.id,type:'contains',label:'別の入口から見る',condition:'一般的な分類上の参照。個人の条件は未確認。',sourceIds:[],verification:'general'});
 const [a,b]=c.nodes.slice(0,2);
 c.edges=c.edges.filter(e=>!(e.type==='combine'&&[a.id,b.id].includes(e.from)&&[a.id,b.id].includes(e.to)));
 c.edges.push({from:a.id,to:b.id,type:'combine',label:'組み合わせを考える',condition:'実際の組み合わせ条件は未確認。',sourceIds:[],verification:'unverified'},{from:b.id,to:a.id,type:'combine',label:'別の順序も考える',condition:'制度上認められることを保証しない。',sourceIds:[],verification:'unverified'});
 assert.ok(validateRouteAtlas(c));
});
test('getters preserve whole-map membership and direction without making eligibility judgments',()=>{
 for(const lens of routeAtlas.lenses)assert.deepEqual(getAtlasRoots(lens.id).map(n=>n.id),lens.rootIds);
 for(const node of routeAtlas.nodes){assert.equal(getAtlasNode(node.id),node);assert.deepEqual(new Set(getAtlasChildren(node.id).map(n=>n.id)),new Set(routeAtlas.edges.filter(e=>e.type==='contains'&&e.from===node.id).map(e=>e.to)));assert.ok(getAtlasConnections(node.id).every(e=>e.type!=='contains'&&(e.from===node.id||e.to===node.id)));}
 assert.equal(getAtlasNode('missing'),undefined);assert.deepEqual(getAtlasChildren('missing'),[]);assert.deepEqual(getAtlasRoots('missing'),[]);
});
test('optional preferences add notes, never remove, rank or declare an impossible route',()=>{
 const prefs={wish:'数学とデータを調べたい',subjects:['数学'],timing:'soon',budget:'concern'};assert.ok(validateAtlasPreferences(preferences()));assert.ok(validateAtlasPreferences(prefs));
 for(const invalid of [{...prefs,school:'real'},{...prefs,subjects:['invented']},{...prefs,subjects:['数学','数学']},{...prefs,wish:'a'.repeat(301)},{...prefs,timing:'impossible'},{...prefs,budget:'exclude'}])assert.equal(validateAtlasPreferences(invalid),false);
 const ids=routeAtlas.nodes.map(n=>n.id);
 const overlay=routeAtlas.nodes.map(node=>assessAtlasNode(node,{preferences:prefs,considering:new Set([ids[0]]),visited:new Set([ids[1]])}));
 assert.equal(overlay.length,ids.length);assert.equal(overlay[0].state,'considering');assert.equal(overlay[1].visited,true);assert.equal(overlay[1].state,'unresearched');
 for(const item of overlay){assert.ok(Object.hasOwn(atlasStatusLabels,item.state));assert.ok(Array.isArray(item.highlights));for(const key of ['score','rank','hidden','eligible','impossible'])assert.ok(!(key in item));}
 assert.deepEqual(routeAtlas.nodes.map(n=>n.id),ids);
});
test('constraint records require substantive note, HTTPS source and a valid past date without verification claims',()=>{
 assert.ok(validateAtlasRecord(record()));
 for(const state of ['considering','needs_check','unresearched'])assert.ok(validateAtlasRecord({state,note:'',sourceUrl:'',checkedOn:''}));
 for(const value of [null,[],{...record(),state:'impossible'},{...record(),verified:true},{...record(),studentName:'private'},{...record(),note:'未確認'},{...record(),note:'...................'},{...record(),note:'未確認未確認未確認未確認'},{...record(),sourceUrl:''},{...record(),sourceUrl:'http://example.org'},{...record(),sourceUrl:'javascript:alert(1)'},{...record(),sourceUrl:'https://user:secret@example.org'},{...record(),checkedOn:''},{...record(),checkedOn:'2099-01-01'},{...record(),checkedOn:'2025-02-30'}])assert.equal(validateAtlasRecord(value),false);
 const node=routeAtlas.nodes[0];assert.throws(()=>assessAtlasNode(node,{records:{[node.id]:false}}));const overlay=assessAtlasNode(node,{records:{[node.id]:record()}});assert.equal(overlay.state,'constraint_recorded');assert.equal(overlay.label,'確認した制約（本人の記録）');assert.equal(overlay.note,record().note);assert.ok(!('verified' in overlay));
 let accessed=false;const dangerous=Object.defineProperty({...record()},'state',{get(){accessed=true;return 'constraint_recorded';},enumerable:true});assert.equal(validateAtlasRecord(dangerous),false);assert.equal(accessed,false);
});
test('AI highlights use only actual title/description words and never manufacture eligibility',()=>{
 const node=routeAtlas.nodes.find(n=>n.tags.some(tag=>tag.length>=2));const term=node.tags.find(tag=>tag.length>=2);
 const result=matchAtlasHighlights([{id:'ai-route',title:term,description:'一般的な比較のための説明。' }]);const hit=result.find(x=>x.nodeId===node.id);assert.ok(hit);assert.ok(hit.routeIds.includes('ai-route'));assert.ok(hit.terms.includes(term));
 assert.deepEqual(matchAtlasHighlights([{id:'ai-route',title:'zxqv12345',description:'zxqv98765'}]),[]);assert.deepEqual(matchAtlasHighlights(null),[]);
 for(const item of result){assert.deepEqual(Object.keys(item),['nodeId','routeIds','terms']);assert.ok(getAtlasNode(item.nodeId));}
 // Deep exploration can retain up to 80 AI entries; highlighting must not
 // disappear merely because the user has opened more than twenty proposals.
 const large=Array.from({length:80},(_,index)=>({id:'ai-'+index,title:term,description:'比較のための一般的な候補。'}));
 assert.equal(matchAtlasHighlights(large).find(item=>item.nodeId===node.id).routeIds.length,80);
 assert.deepEqual(matchAtlasHighlights([...large,{...large[0],id:'overflow'}]),[]);
});
test('one to six reference nodes transfer with eight facets and unverified personal conditions',()=>{
 const nodes=getAtlasRoots('after-school').slice(0,6),records={[nodes[0].id]:record()};const snapshot=structuredClone(nodes);
 const transfer=createAtlasTransfer(nodes,{records,preferences:{...preferences(),wish:'卒業後の道を比べたい'}});
 assert.equal(transfer.origin,'reference');assert.ok(validateTree(transfer.tree,{maxNodes:40}));assert.equal(transfer.tree.nodes.length,37);assert.equal(Object.keys(transfer.nodeOrigins).length,transfer.tree.nodes.length);
 assert.equal(transfer.nodeOrigins.root,'manual');assert.equal(transfer.nodeOrigins['atlas-1-record'],'manual');
 for(const [id,origin] of Object.entries(transfer.nodeOrigins))if(!['root','atlas-1-record'].includes(id))assert.equal(origin,'reference',id);
 assert.deepEqual(nodes,snapshot);assert.ok(transfer.tree.summary.includes('本人の履修'));assert.ok(transfer.tree.summary.includes('未確認'));assert.ok(!transfer.tree.summary.includes('架空'));
 const body=JSON.stringify(transfer.tree);for(const label of Object.values(atlasFacetLabels))assert.ok(body.includes(label),label);assert.ok(body.includes('本人の記録'));assert.ok(body.includes(record().checkedOn));assert.ok(body.includes(record().sourceUrl));
 assert.throws(()=>createAtlasTransfer([]));assert.throws(()=>createAtlasTransfer([...nodes,nodes[0]]));assert.throws(()=>createAtlasTransfer([{...nodes[0],verified:true}]));assert.throws(()=>createAtlasTransfer(nodes,{records:{[nodes[0].id]:{...record(),checkedOn:'2099-01-01'}}}));
});
test('reference tree and provenance survive existing JSON roundtrip without becoming AI or sample data',()=>{
 const transfer=createAtlasTransfer(getAtlasRoots('after-school').slice(0,2));const positions=new Map(layoutMindMap(transfer.tree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
 const doc=createTreeDocument(transfer.tree,positions,'root','reference',false,transfer.nodeOrigins),restored=parseTreeDocument(stringifyTreeDocument(doc));
 assert.equal(restored.provenance.origin,'reference');assert.equal(restored.provenance.verification,'unverified');assert.deepEqual(restored.tree,transfer.tree);assert.deepEqual(restored.nodeOrigins,transfer.nodeOrigins);
 assert.ok(Object.values(transfer.nodeOrigins).every(origin=>origin==='reference'));
 const personal=createAtlasTransfer(getAtlasRoots('after-school').slice(0,2),{preferences:{...preferences(),wish:'働きながら学ぶ方法も考えたい'},records:{'route-work':record()}});
 const mixed=createTreeDocument(personal.tree,positions,'root','reference',false,personal.nodeOrigins);
 assert.deepEqual(parseTreeDocument(stringifyTreeDocument(mixed)).nodeOrigins,personal.nodeOrigins);
 assert.equal(personal.nodeOrigins.root,'manual');assert.equal(personal.nodeOrigins['atlas-1-record'],'manual');assert.equal(personal.nodeOrigins['atlas-1'],'reference');
});
