import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
import {nodeOriginLabels} from '../retree-mindmap/src/tree-file.js';
import {createExplorationState,validateExplorationState,createExplorationStore,projectExploration,editExplorationNode,addExplorationNote,deleteExplorationNote,serializeExplorationTree} from '../src/exploration-model.js';

const atlas=()=>({view:'overview',lens:'after-school',selected:null,path:[],history:[],visited:[],considering:[],keep:[],compare:[],preferences:{wish:'',subjects:[],timing:'undecided',budget:'undecided'},records:{},recordDrafts:{},preferencesOpen:false,recordOpen:[],activeDemo:null});
const guide=(suffix='1',answerText='大学に行くか分からない。日々の違いから考えたい。')=>({
  summary:'大学へ進むか未定のまま、学び方と働き方の違いを確かめたいという仮の整理です。',
  statements:[{id:'statement-'+suffix,text:'日々の過ごし方を比べたいのかもしれません。',answerIds:['a-1'],kind:'interpretation'}],
  routes:[{atlasId:'route-university',reason:'回答との関係を考える一般的な入口です。',answerIds:['a-1'],unknowns:['本人の出願条件は未確認です。']}],
  additionalIdeas:[],nextActions:[{id:'next-'+suffix,text:'授業と仕事の一日の例を読んで比べる。',answerIds:['a-1']}],unknowns:['生活や費用の条件は未確認です。'],
  userCorrections:[],conversation:{answers:[{id:'a-1',questionId:'q-1',question:'まず何を知りたい？',text:answerText,state:'answered'}],corrections:[]},requestsUsed:1,stale:false,correspondence:'included'
});
const session=()=>({revision:1,atlas:atlas(),guide:null,discovery:null,notes:'',nextActions:'',view:'ai'});

test('all catalogue routes retain one identity and all typed connections, with seven equal after-school entrances',()=>{
  const state=session();state.atlas.compare=['route-university','route-work'];state.atlas.keep=['route-work'];state.atlas.visited=['route-university'];state.guide=guide();
  const graph=projectExploration(state),routes=graph.nodes.filter(node=>node.atlasId);
  assert.equal(routes.length,routeAtlas.nodes.length);
  assert.equal(new Set(routes.map(node=>node.atlasId)).size,routeAtlas.nodes.length);
  const entranceIds=routes.filter(node=>node.parent==='group-routes').map(node=>node.atlasId);
  assert.deepEqual(entranceIds,routeAtlas.lenses.find(lens=>lens.id==='after-school').rootIds);
  for(const edge of routeAtlas.edges)assert.ok(graph.edges.some(projected=>projected.from==='atlas-'+edge.from&&projected.to==='atlas-'+edge.to&&projected.type===edge.type));
  for(const node of graph.nodes)if(node.parent!==null)assert.ok(graph.edges.some(edge=>edge.from===node.parent&&edge.to===node.id&&edge.type==='contains'));
  const university=routes.find(node=>node.atlasId==='route-university');
  assert.equal(university.origin,'reference');assert.equal(university.highlighted,true);assert.equal(university.compared,true);assert.equal(university.visited,true);
  assert.equal(routes.find(node=>node.atlasId==='route-work').kept,true);
  assert.equal(routes.find(node=>node.atlasId==='field-math').parent.startsWith('atlas-'),true);
  assert.equal(routes.find(node=>node.atlasId==='field-science').parent,'lens-fields');
});

test('answers, interpretations, uncertainty, corrections and chosen actions remain distinct, never fabricated as verified facts',()=>{
  const store=createExplorationStore(session());
  assert.equal(projectExploration(store.getState()).nodes.some(node=>node.origin==='answer'),false);
  const result=guide('1','<script>not executable</script> 大学へ行くかは分からない。');
  result.userCorrections=[{id:'c-1',text:'大学が嫌いという意味ではない。'}];result.conversation.corrections=structuredClone(result.userCorrections);
  store.patch({guide:result,notes:'まだ決めずに考えたい。',nextActions:'授業の例を一つ読む。'});
  const graph=projectExploration(store.getState()),byId=new Map(graph.nodes.map(node=>[node.id,node]));
  assert.equal(byId.get('answer-a-1').origin,'answer');assert.ok(byId.get('answer-a-1').detail.includes('<script>not executable</script>'));
  assert.equal(byId.get('interpretation-statement-1').origin,'ai_proposal');assert.deepEqual(byId.get('interpretation-statement-1').answerIds,['a-1']);
  assert.equal(byId.get('correction-c-1').origin,'answer');
  assert.equal(byId.get('action-next-1').origin,'ai_proposal');assert.equal(byId.get('personal-actions').origin,'manual');
  assert.equal(graph.nodes.some(node=>node.status==='verified'),false);
  assert.ok(graph.expanded.includes('self-situation'));assert.ok(graph.expanded.includes('group-actions'));
  assert.equal(store.getState().guide.conversation.answers[0].text,result.conversation.answers[0].text);
  const corrected=guide();corrected.userCorrections=[{id:'corrected-1',text:'「'+('以前のAIの言葉。'.repeat(5)).slice(0,60)+'」への訂正：進学が嫌なのではなく、仕事内容も知りたい。'}];corrected.conversation.corrections=structuredClone(corrected.userCorrections);
  store.patch({guide:corrected});
  const correction=projectExploration(store.getState()).nodes.find(node=>node.id==='correction-corrected-1');
  assert.ok(correction.label.includes('進学が嫌なのではなく'));assert.equal(correction.label.includes('以前のAI'),false);assert.equal(correction.detail,corrected.userCorrections[0].text);
});

test('new AI data grows existing branches once; repeated snapshots deduplicate and respect an explicit collapse',()=>{
  const store=createExplorationStore(session());let notifications=0;store.subscribe(()=>notifications++);
  const result=guide();store.patch({guide:result,revision:2});
  const initial=projectExploration(store.getState());assert.ok(initial.expanded.includes('self-situation'));
  store.patch({guide:structuredClone(result),revision:2});assert.equal(notifications,1);
  store.updateWorkspace({expanded:store.getState().exploration.expanded.filter(id=>id!=='self-situation'),selected:'group-self'});
  store.patch({guide:structuredClone(result),revision:2});assert.equal(projectExploration(store.getState()).expanded.includes('self-situation'),false);
  const second=guide();second.conversation.answers.push({id:'a-2',questionId:'q-2',question:'生活では何が気になる？',text:'休む時間を残したい。',state:'answered'});
  store.patch({guide:second,revision:3});assert.ok(projectExploration(store.getState()).expanded.includes('self-situation'));
  const graph=projectExploration(store.getState());assert.equal(new Set(graph.nodes.map(node=>node.id)).size,graph.nodes.length);
  assert.equal(graph.nodes.filter(node=>node.id==='atlas-route-university').length,1);
});

test('opening a route grows its ancestors, but the same Atlas path cannot undo a later explicit fold',()=>{
  const store=createExplorationStore(session()),opened=atlas();
  opened.view='detail';opened.selected='university-general';opened.path=['route-university','university-options','university-general'];opened.visited=['university-general'];
  store.patch({atlas:opened,revision:2});
  assert.ok(projectExploration(store.getState()).expanded.includes('atlas-route-university'));
  store.updateWorkspace({expanded:store.getState().exploration.expanded.filter(id=>id!=='atlas-route-university'),selected:'atlas-route-university'});
  store.patch({atlas:structuredClone(opened),revision:2});
  assert.equal(projectExploration(store.getState()).expanded.includes('atlas-route-university'),false);
});

test('a person’s edited AI branch stays visible when a new response replaces its source ID',()=>{
  const store=createExplorationStore(session());store.patch({guide:guide(),revision:2});
  const target='interpretation-statement-1';
  store.updateWorkspace(editExplorationNode(store.getState().exploration,target,{label:'自分の言葉で残す',detail:'大学が嫌いという話ではない。働く道と学ぶ道を比べたい。'}));
  const next=guide('2');store.patch({guide:next,revision:3});
  const graph=projectExploration(store.getState()),edited=graph.nodes.find(node=>node.id===target);
  assert.equal(edited.origin,'user_edited');assert.equal(edited.stale,true);assert.equal(edited.parent,'self-situation');
  assert.equal(edited.detail,'大学が嫌いという話ではない。働く道と学ぶ道を比べたい。');
  assert.ok(graph.nodes.some(node=>node.id==='interpretation-statement-2'&&node.origin==='ai_proposal'));
  const unknown=graph.nodes.find(node=>node.kind==='unknown'&&node.id.startsWith('unknown-'));
  store.updateWorkspace(editExplorationNode(store.getState().exploration,unknown.id,{label:'この確認は残す',detail:'自分の費用の条件をあとで確かめたい。'}));
  const changed=guide('3');changed.unknowns=['募集時期も未確認です。'];store.patch({guide:changed,revision:4});
  const updated=projectExploration(store.getState());
  assert.equal(updated.nodes.find(node=>node.id===unknown.id).origin,'user_edited');
  assert.equal(updated.nodes.find(node=>node.id===unknown.id).detail,'自分の費用の条件をあとで確かめたい。');
  assert.ok(updated.nodes.some(node=>node.id.startsWith('unknown-')&&node.id!==unknown.id&&node.origin==='ai_proposal'));
});

test('workspace Undo never rolls back a later answer, correction, route comparison or request revision',()=>{
  const store=createExplorationStore(session());
  store.updateWorkspace(addExplorationNote(store.getState().exploration,'group-checks','自分のメモ','残してから考える。'));
  const manual=store.getState().exploration.selected;
  store.updateWorkspace(editExplorationNode(store.getState().exploration,manual,{label:'修正したメモ',detail:'学校と家で条件を確かめる。'}));
  const latest=guide('2'),comparison=atlas();comparison.compare=['route-work','route-university'];
  store.patch({guide:latest,atlas:comparison,revision:9});
  store.updateWorkspace({selected:'group-routes',emphasis:'text',step:4});
  assert.equal(store.canUndo(),true);assert.equal(store.undoWorkspace(),true);
  assert.equal(store.getState().exploration.notes[0].label,'自分のメモ');
  assert.equal(store.getState().exploration.step,4);assert.equal(store.getState().exploration.emphasis,'text');assert.equal(store.getState().exploration.selected,'group-routes');
  assert.equal(store.getState().revision,9);assert.deepEqual(store.getState().guide,latest);assert.deepEqual(store.getState().atlas.compare,comparison.compare);
  assert.equal(store.undoWorkspace(),false);
  const clone=store.getState();clone.guide.summary='outside mutation';assert.notEqual(store.getState().guide.summary,clone.guide.summary);
  const old=guide('old');store.patch({guide:old,revision:8});assert.equal(store.getState().revision,9);assert.deepEqual(store.getState().guide,latest);
});

test('redacted saved references stay valid without inventing the omitted answers',()=>{
  const state=session();state.guide=guide('1','原文は保存しない架空の回答');
  state.exploration=createExplorationState();state.exploration.selected='answer-a-1';state.exploration.expanded.push('answer-a-1');state.exploration.positions=[{id:'answer-a-1',x:20,y:30}];
  state.guide.conversation=null;state.guide.correspondence='not_saved';
  assert.equal(validateExplorationState(state.exploration,state),true);
  const graph=projectExploration(state);
  assert.equal(graph.nodes.some(node=>node.kind==='answer'),false);assert.equal(graph.selectedId,'exploration-root');
  assert.equal(JSON.stringify(graph).includes('原文は保存しない架空の回答'),false);
  const legacy=createExplorationStore(session());assert.equal(legacy.getState().exploration.step,1);
  legacy.replace(state);assert.deepEqual(legacy.getState().exploration,state.exploration);assert.equal(legacy.canUndo(),false);
});

test('workspace rejects getters, dangerous keys, unknown Atlas IDs, cycles, size excess and invalid positions atomically',()=>{
  const base=createExplorationState();assert.equal(validateExplorationState(base),true);
  let called=0;const getter={...base};Object.defineProperty(getter,'selected',{get(){called++;return null;},enumerable:true});
  assert.equal(validateExplorationState(getter),false);assert.equal(called,0);
  const changes=[
    workspace=>workspace.step=0,workspace=>workspace.step=6,workspace=>workspace.selected='atlas-not-a-route',workspace=>workspace.expanded.push('atlas-fake'),
    workspace=>workspace.expanded.push(workspace.expanded[0]),workspace=>workspace.emphasis='diagnose',workspace=>workspace.extra=true,
    workspace=>workspace.positions=[{id:'atlas-route-work',x:Infinity,y:0}],workspace=>workspace.positions=[{id:'atlas-route-work',x:10000001,y:0}],
    workspace=>workspace.overrides=[{id:'atlas-route-work',label:'',detail:'a'}],workspace=>workspace.overrides=[{id:'atlas-fiction',label:'a',detail:'b'}],
    workspace=>workspace.overrides=[{id:'personal-notes',label:'本人のメモ',detail:'あ'.repeat(3001)}],
    workspace=>{workspace.serial=1;workspace.notes=[{id:'manual-1',parent:'group-checks',label:'本人のメモ',detail:'あ'.repeat(3001)}];},
    workspace=>{workspace.serial=2;workspace.notes=[{id:'manual-1',parent:'manual-2',label:'一',detail:''},{id:'manual-2',parent:'manual-1',label:'二',detail:''}];},
    workspace=>workspace.expanded=Array(201).fill('group-routes'),workspace=>workspace.selected='constructor',workspace=>Object.defineProperty(workspace,'__proto__',{value:{danger:true},enumerable:true})
  ];
  for(const change of changes){const bad=structuredClone(base);change(bad);assert.equal(validateExplorationState(bad),false);}
  const store=createExplorationStore(session()),before=store.getState();assert.throws(()=>store.updateWorkspace({selected:'atlas-fake'}));assert.deepEqual(store.getState(),before);
  assert.throws(()=>store.patch({guide:getter}));assert.equal(called,0);
});

test('manual additions, edits and branch deletion retain parents, safe literal text and bounded layout',()=>{
  let workspace=createExplorationState();
  workspace=addExplorationNote(workspace,'atlas-route-work','自分で足した道','<img src=x onerror=alert(1)> は文章のまま。');
  const parent=workspace.selected;workspace=addExplorationNote(workspace,parent,'確かめること','相談先を一つ考える。');
  const child=workspace.selected;workspace.positions=[{id:parent,x:5,y:10},{id:child,x:10,y:20}];
  const graph=projectExploration({...session(),exploration:workspace});
  assert.equal(graph.nodes.find(node=>node.id===child).parent,parent);assert.equal(graph.nodes.find(node=>node.id===parent).origin,'manual');
  assert.ok(graph.nodes.find(node=>node.id===parent).detail.includes('<img'));
  const long='本文'.repeat(1500),editedLong=editExplorationNode(workspace,parent,{label:'見出しだけ直す',detail:long});
  assert.equal(editedLong.notes.find(note=>note.id===parent).detail,long);
  assert.equal(editExplorationNode(workspace,'personal-notes',{label:'長い本人メモの見出し',detail:long}).overrides.find(note=>note.id==='personal-notes').detail,long);
  const deleted=deleteExplorationNote(workspace,parent);assert.equal(deleted.notes.length,0);assert.equal(deleted.positions.length,0);assert.equal(deleted.selected,null);
  assert.equal(workspace.notes.length,2);
  for(let i=0;i<40;i++)if(workspace.notes.length<40)workspace=addExplorationNote(workspace,'group-checks','メモ'+i,'');
  assert.throws(()=>addExplorationNote(workspace,'group-checks','41個目',''));
});

test('Tree v1 projection preserves all personal text with continuation nodes and clear provenance',()=>{
  const state=session();state.guide=guide();state.notes='あ'.repeat(1699)+'🌳'+'い'.repeat(1299);state.nextActions='う'.repeat(3000);
  const {tree,nodeOrigins}=serializeExplorationTree(state);
  assert.equal(validateTree(tree),true);assert.ok(tree.nodes.length<=200);
  assert.ok(tree.nodes.every(node=>node.id.length<=64));assert.ok(Object.values(nodeOrigins).every(origin=>Object.hasOwn(nodeOriginLabels,origin)));
  const notes=tree.nodes.filter(node=>node.label.startsWith('自分で記録した気づき')).map(node=>node.detail).join('');
  const actions=tree.nodes.filter(node=>node.label.startsWith('自分が次に確かめたいこと')).map(node=>node.detail).join('');
  assert.equal(notes,state.notes);assert.equal(actions,state.nextActions);
  state.exploration=editExplorationNode(createExplorationState(),'exploration-root',{label:'今の暮らしを変えずに、どんな学びを試せる？',detail:'自分で書き直した中心問い。'});
  const edited=serializeExplorationTree(state);
  assert.equal(edited.tree.core_question,state.exploration.overrides[0].label);assert.equal(edited.nodeOrigins[edited.tree.nodes.find(node=>node.parent===null).id],'user_edited');
  const workspace=createExplorationState();workspace.serial=120;
  workspace.overrides=Array.from({length:120},(_,i)=>({id:'interpretation-old-'+i,label:'本人が残す'+i,detail:'自分の記録'}));
  assert.equal(validateExplorationState(workspace),true);
  assert.throws(()=>serializeExplorationTree({...session(),exploration:workspace}),/200項目/);
});
