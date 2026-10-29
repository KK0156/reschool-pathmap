import {renderFinderSavePreview} from './finder-save-view.js';
import {mountRouteAtlas} from './route-atlas.js';
import {mountRouteDiscovery} from './route-discovery.js';
import {mountGuidedDiscovery} from './guided-discovery.js';
import {enrichGuideTransfer} from './guide-transfer.js';
import {routeAtlas} from './route-atlas-data.js';
import {createFinderDocument,stringifyFinderDocument,readFinderFile} from './finder-file.js';
import {createExplorationState,createExplorationStore,projectExploration,editExplorationNode,addExplorationNote,deleteExplorationNote,serializeExplorationTree} from './exploration-model.js';
import {mountExplorationTree} from './exploration-tree.js';
import {createTreeDocument,stringifyTreeDocument} from '../retree-mindmap/src/tree-file.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
import {mountReferenceLibrary} from './reference-library.js';
import {getAllReferences,getRouteReferences} from './reference-sites.js';
import {appendReferenceMemo} from './reference-memo.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nodes=new Map(routeAtlas.nodes.map(node=>[node.id,node]));
const action=(name,label,extra='',disabled=false)=>'<button type="button" data-finder-action="'+name+'" '+extra+(disabled?' disabled':'')+'>'+esc(label)+'</button>';

// The catalogue underlies whole-map, attention and comparison views. Legacy
// generated routes and fixed demos remain available as a retained tool.
export function mountPathFinder(container,{onTransfer=()=>false}={}){
  container.classList.add('path-finder');
  container.innerHTML='<header class="finder-journey"><ol id="finder-flow" aria-label="進路を考える流れ">'+['自分を知る','可能性を広げる','道を深く知る','比較して考える','次の行動を整理する'].map((label,index)=>'<li data-flow-step="'+(index+1)+'" aria-label="'+label+'"><span aria-hidden="true">'+(index+1)+'</span>'+label+'</li>').join('')+'</ol><p id="finder-flow-current" role="status"></p><div class="finder-modes" role="group" aria-label="相談と全体マップの行き来"><button type="button" data-finder-mode="ai" aria-pressed="false">相談に戻る</button><button type="button" data-finder-mode="all" aria-pressed="false">全体の道を見る</button><button type="button" data-finder-action="show-map">地図を見る</button></div></header><p class="finder-mode-note" id="finder-mode-note"></p><details class="finder-map-menu"><summary>道の見方を変える</summary><nav class="finder-map-views" aria-label="マップと検討記録"><button type="button" data-finder-map-view="all" aria-pressed="true">全体像</button><button type="button" data-finder-map-view="attention" aria-pressed="false">相談から見えてきた道</button><button type="button" data-finder-map-view="unopened" aria-pressed="false">まだ開いていない道</button><button type="button" data-finder-map-view="record" aria-pressed="false">次の一歩と保存</button><button type="button" data-finder-action="references">参考サイトで調べる</button></nav></details><p id="finder-status" role="status" tabindex="-1"></p><p id="finder-error" role="alert" tabindex="-1"></p><section id="finder-shared-workspace" data-exploration-emphasis="balanced"><div id="finder-tree-host"></div><div id="finder-reading-panel"><div id="finder-node-detail" hidden></div><div id="finder-tool-host"></div><div id="finder-thinking-summary" hidden></div></div></section><section id="finder-next-step" class="finder-next-step" aria-label="ここからの進め方" hidden></section><details class="finder-session-tools"><summary>途中の記録・保存したファイルを開く</summary><div class="finder-carry"><button type="button" data-finder-action="record">途中の候補・メモをファイルに残す</button><label for="finder-import">端末ファイルを開く</label><input type="file" id="finder-import" accept=".json,application/json"></div></details><details class="finder-retained"><summary>以前の探索・固定デモを使う</summary><p>以前のAI探索と、用意された架空の相談例も残しています。デモは本人の回答を分析したものではありません。</p>'+action('legacy','以前の探索を開く')+'</details>';

  const host=container.querySelector('#finder-tool-host'),note=container.querySelector('#finder-mode-note');
  const atlasElement=document.createElement('div'),guideElement=document.createElement('div'),recordElement=document.createElement('div'),attentionElement=document.createElement('div'),pickerElement=document.createElement('div'),referenceElement=document.createElement('div');
  let mode='ai',mapView='all',pickingComparison=false,guide=null,guideState=null,discovery=null,discoveryElement=null,revision=0,notes='',nextActions='',includeConversation=false,saveDocument=null,restoredSources=null,restoreToken=0,emptyDiscovery=null;
  const $=selector=>container.querySelector(selector);
  let explorationStore=null,treeView=null,syncing=false,restoringSession=false,lastSharedGraph=null,summaryReturn=false;
  let referenceLibrary=null,referenceActive=false,referenceReturn=null;
  function clear(){saveDocument=null;$('#finder-error').textContent='';$('#finder-status').textContent='';}
  function notify(text,error=false){const target=$(error?'#finder-error':'#finder-status');target.textContent=text;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}
  const atlas=mountRouteAtlas(atlasElement,{onTransfer:transferWithNotes,onConsult:()=>show('ai'),onReferences:({routeId})=>openReferences(routeId),onDiscoveryReturn:()=>show('legacy'),onChange:snapshot=>{if(restoringSession)return;const changed=snapshot.selected!==explorationStore?.getState().atlas?.selected;revision++;saveDocument=null;renderFlow();if(changed&&!referenceActive)alignReadingTitle();}});
  const emptyAtlas=atlas.getSessionState();
  explorationStore=createExplorationStore({revision,atlas:emptyAtlas,guide:null,discovery:null,notes,nextActions,view:mode,exploration:createExplorationState()});
  treeView=mountExplorationTree($('#finder-tree-host'),{
    onSelect:selectSharedNode,
    onToggle(id){const expanded=new Set(lastSharedGraph.expanded),closing=expanded.has(id);if(closing)expanded.delete(id);else expanded.add(id);return updateWorkspace({expanded:[...expanded],...(closing?{selected:id}:{})},false);},
    onEmphasis(emphasis){return updateWorkspace({emphasis},false);},
    onEdit(id,fields){try{return updateWorkspace(editExplorationNode(explorationStore.getState().exploration,id,fields));}catch(error){notify(error.message,true);return false;}},
    onAdd(parent,fields){try{return updateWorkspace(addExplorationNote(explorationStore.getState().exploration,parent,fields.label,fields.detail));}catch(error){notify(error.message,true);return false;}},
    onDelete(id){try{return updateWorkspace(deleteExplorationNote(explorationStore.getState().exploration,id));}catch(error){notify(error.message,true);return false;}},
    onUndo(){if(!explorationStore.undoWorkspace())return false;revision++;saveDocument=null;syncShared();return true;},
    onExport:exportSharedTree
  });
  explorationStore.subscribe(renderSharedExploration);
  renderSharedExploration(explorationStore.getState());

  function currentStep(snapshot=atlas.getSessionState()){
    if(mode==='ai'||mode==='legacy')return 1;
    if(mapView==='record')return 5;
    if(!pickingComparison&&mapView==='all'&&snapshot.view==='compare')return 4;
    if(!pickingComparison&&mapView==='all'&&snapshot.view==='detail')return 3;
    return 2;
  }
  function alignReadingTitle(){
    if(innerWidth>=1200||mode!=='all'||mapView!=='all'||pickingComparison||referenceActive||atlas.getSessionState().view!=='detail')return;
    if(innerWidth<700&&explorationStore.getState().exploration.emphasis==='map')return;
    const id=atlas.getSessionState().selected;
    requestAnimationFrame(()=>{if(container.isConnected&&host.firstElementChild===atlasElement&&atlas.getSessionState().selected===id){updateFlowSpacing();const title=!$('#finder-node-detail').hidden?$('#finder-shared-node-title'):atlasElement.querySelector('#atlas-title');title?.scrollIntoView({block:'start',behavior:'instant'});}});
  }
  function alignMobileScene(element){
    if(innerWidth>=700||explorationStore.getState().exploration.emphasis!=='balanced'||treeView.hasDraft())return;
    if(element===atlasElement&&atlas.getSessionState().view==='detail')return;
    requestAnimationFrame(()=>{if(container.isConnected&&host.firstElementChild===element)$('#finder-shared-workspace').scrollIntoView({block:'start',behavior:'instant'});});
  }
  function captureSession(){
    return {revision,atlas:atlas.getSessionState(),discovery:discovery?.getSessionState()||null,guide:guide?.getSessionState()||guideState,notes,nextActions,view:mode==='all'&&mapView==='record'?'record':mode};
  }
  function syncShared(){
    if(!explorationStore||syncing||restoringSession)return;
    syncing=true;
    try{
      const snapshot=captureSession(),previous=explorationStore.getState(),workspace=previous.exploration;
      // Widgets retain unfinished input. Committed snapshots and all route
      // references meet here; projection never restores a widget or sends AI.
      const changedRoute=snapshot.atlas.selected!==previous.atlas?.selected||previous.view!=='all'||workspace.step!==3;
      const selected=changedRoute&&mode==='all'&&mapView==='all'&&!pickingComparison&&snapshot.atlas.view==='detail'?'atlas-'+snapshot.atlas.selected:workspace.selected;
      explorationStore.patch({...snapshot,exploration:{...workspace,selected,step:currentStep(snapshot.atlas)}});
    }finally{syncing=false;}
  }
  function updateWorkspace(patch,undoable=true){
    try{
      explorationStore.updateWorkspace(patch,{undoable});revision++;saveDocument=null;
      $('#finder-save-preview')?.remove();if($('#finder-preview-start'))$('#finder-preview-start').hidden=false;
      syncShared();treeView.setUndoAvailable(explorationStore.canUndo());return true;
    }catch(error){notify(error.message,true);return false;}
  }
  function renderSharedExploration(session){
    const graph=projectExploration(session);lastSharedGraph=graph;
    if(!saveDocument&&$('#finder-save-preview')){$('#finder-save-preview').remove();if($('#finder-preview-start'))$('#finder-preview-start').hidden=false;}
    $('#finder-shared-workspace').dataset.explorationEmphasis=session.exploration.emphasis;
    $('#finder-shared-workspace').dataset.hasExplorationContent=String(!!(session.guide?.summary||session.guide?.conversation?.answers.length||session.atlas?.visited.length||session.exploration.notes.length||session.notes||session.nextActions));
    treeView.update(session,graph);treeView.setUndoAvailable(explorationStore.canUndo());
    renderSharedText(session,graph);updateFlowSpacing();
  }
  function renderSharedText(session,graph){
    const node=graph.nodes.find(item=>item.id===graph.selectedId),panel=$('#finder-node-detail');
    if(referenceActive){panel.hidden=true;$('#finder-thinking-summary').hidden=true;return;}
    const personal=node&&(!['root','group','route'].includes(node.kind)||node.origin==='user_edited');
    panel.hidden=!personal;
    if(personal){
      const origin={answer:'本人が話したこと',ai_proposal:'AIの解釈・提案（未確認）',manual:'自分で残したメモ',user_edited:'自分で書き直した内容',reference:'一般資料'}[node.origin]||'内容は未確認';
      const refs=(node.answerIds||[]).map(id=>session.guide?.conversation?.answers.find(answer=>answer.id===id)||session.guide?.userCorrections.find(item=>item.id===id)).filter(Boolean);
      const canCorrect=node.id.startsWith('interpretation-')&&session.guide?.statements.some(item=>'interpretation-'+item.id===node.id);
      panel.innerHTML='<section class="finder-shared-note"><span class="guide-source">'+esc(origin)+'</span><h2 id="finder-shared-node-title" tabindex="-1">'+esc(node.label)+'</h2><p class="finder-shared-prose">'+esc(node.detail||'まだ詳しいメモはありません。')+'</p>'+(node.atlasId?'<p class="finder-small">一般資料の項目「'+esc(nodes.get(node.atlasId).title)+'」に、自分の言葉を添えています。元の説明は下に残しています。</p>':'')+(node.stale?'<p class="guide-stale">以前の回答による内容です。本人が書き直した言葉を残したまま、見直せます。</p>':'')+(refs.length?'<details><summary>関係する本人の発言</summary><ul>'+refs.map(item=>'<li>'+esc(item.text||'まだ分からない・回答なし')+'</li>').join('')+'</ul></details>':'')+(canCorrect?action('correct-shared','AIの理解が違うところを直す','data-finder-node="'+esc(node.id)+'"'):'')+'</section>';
    }else panel.replaceChildren();
    const summary=$('#finder-thinking-summary'),guideSnapshot=session.guide;
    summary.hidden=!guideSnapshot||(!guideSnapshot.summary&&!guideSnapshot.conversation?.answers.length);
    if(!summary.hidden){
      const open=!!summary.querySelector('details[open]'),latest=guideSnapshot.conversation?.answers.at(-1);
      summary.innerHTML='<details'+(open?' open':'')+'><summary>ここまでの話の整理</summary>'+(latest?'<h3>本人が話したこと</h3><p>'+esc(latest.text||'この問いは、まだ分からないまま進みました。')+'</p>':'<p>元の回答は保存されていません。回答との対応関係は未確認です。</p>')+(guideSnapshot.summary?'<h3>AIによる整理・未確認</h3><p>'+esc(guideSnapshot.summary)+'</p>':'')+(guideSnapshot.stale?'<p>訂正や条件の変更があるため、以前の整理は見直しが必要です。</p>':'')+action('guide','話した内容を振り返る・直す')+'</details>';
    }
  }
  function selectSharedNode(id){
    const node=lastSharedGraph?.nodes.find(item=>item.id===id);if(!node)return false;
    updateWorkspace({selected:id},false);
    if(node.atlasId){pickingComparison=false;mapView='all';show('all',{node:node.atlasId});}
    else if(id==='group-routes'||id==='exploration-root'){pickingComparison=false;mapView='all';show('all',{overview:true});}
    else if(id==='group-actions'||id==='group-checks'||['action','note','unknown'].includes(node.kind)){pickingComparison=false;mapView='record';show('all');}
    else show('ai');
    // AI statements and personal notes have their own reading panel. Selecting
    // one never turns it into a route decision or edits the catalogue.
    if(!node.atlasId||node.origin==='user_edited'){if(!node.atlasId)updateWorkspace({selected:id},false);if(!['root','group'].includes(node.kind))requestAnimationFrame(()=>{const heading=$('#finder-shared-node-title');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start'});});}
    return true;
  }
  function exportSharedTree(){
    if(blockUnfinishedTree())return false;
    try{
      const {tree,nodeOrigins}=serializeExplorationTree(state()),layout=layoutMindMap(tree),positions=new Map(layout.nodes.map(node=>[node.id,{x:node.x,y:node.y}]));
      const file=createTreeDocument(tree,positions,tree.nodes.find(node=>node.parent===null).id,'reference',explorationStore.getState().exploration.overrides.length>0,nodeOrigins);
      downloadText(stringifyTreeDocument(file),'re-tree-exploration.json');
      notify('Tree形式のファイルを作成しました。比較や探索位置も再開する場合は、Finderのファイルで保存してください。');return true;
    }catch(error){notify(error.message,true);return false;}
  }
  function blockUnfinishedTree(){
    if(!treeView?.hasDraft())return false;
    notify('地図に書きかけの言葉があります。「自分の言葉を地図に残す」で反映するか、「書き直しをやめる」を選んでから、ファイルの保存・復元をしてください。文章は残っています。',true);
    $('#exploration-note-label')?.focus();return true;
  }
  function downloadText(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function transferWithNotes(base){if(blockUnfinishedTree())return false;const snapshot=atlas.getSessionState(),ids=snapshot.keep.length?snapshot.keep:snapshot.selected?[snapshot.selected]:[];try{const transfer=enrichGuideTransfer(base,{atlasIds:ids,guide:guide?.getSessionState()||guideState,notes,nextActions});if(Object.values(transfer.nodeOrigins).includes('ai_proposal')&&!confirm('一般資料に加えて、AIの未確認の理由・行動案と本人の記録を、由来を分けてRE:Treeへ渡しますか？'))return false;return onTransfer(transfer);}catch{notify('図に引き継ぐ内容を確認できませんでした。候補とメモは残っています。',true);return false;}}
  function guided(){if(!guide)guide=mountGuidedDiscovery(guideElement,{getRouteIds:()=>atlas.getSessionState().compare,onAvailability:available=>{const button=$('[data-finder-action=summarize-guide]');if(button)button.disabled=!available;},onMap:options=>{if(options?.compare){const snapshot=atlas.getSessionState();snapshot.view='compare';snapshot.selected=null;snapshot.path=[];atlas.restoreSessionState(snapshot);if(guideState)atlas.setGuideOverlay({routes:guideState.routes,stale:guideState.stale});mapView='all';}else mapView=options?.attention?'attention':'all';show('all',{},true);},onUpdate:snapshot=>{const receivedAI=!!snapshot.summary&&(snapshot.summary!==guideState?.summary||snapshot.requestsUsed!==guideState?.requestsUsed);guideState=snapshot;atlas.setGuideOverlay({routes:snapshot.routes,stale:snapshot.stale});if(!restoringSession){revision++;saveDocument=null;syncShared();if(receivedAI&&summaryReturn&&guide?.getLastAction()==='summarize'){summaryReturn=false;pickingComparison=false;mapView='record';show('all');}else if(receivedAI){summaryReturn=false;alignMobileScene(guideElement);}}}});return guide;}
  function oldDiscovery(){if(!discovery){discoveryElement=document.createElement('div');discovery=mountRouteDiscovery(discoveryElement,{onTransfer,onResults:result=>atlas.setHighlights(result),onShowAtlas:()=>{mapView='all';show('all',{overview:true});},onChange:()=>{if(restoringSession)return;revision++;saveDocument=null;renderFlow();}});emptyDiscovery=discovery.getSessionState();}return discovery;}
  function state(){syncShared();return explorationStore.getState();}
  function closeReferences(){
    referenceActive=false;container.dataset.referenceOpen='false';referenceReturn=null;referenceLibrary?.close();
  }
  function returnFromReferences(){
    const previous=referenceReturn||{mode:'all',mapView:'all',pickingComparison:false};
    closeReferences();mapView=previous.mapView;pickingComparison=previous.pickingComparison;
    show(previous.mode);
  }
  function prepareReferenceMemo({routeId,referenceId,url}){
    if(!nodes.has(routeId))return;
    const reference=[...getRouteReferences(routeId),...getAllReferences()].find(site=>site.id===referenceId&&site.url===url);
    if(!reference){notify('参照先を確認できませんでした。今の探索は残っています。',true);return;}
    const snapshot=atlas.getSessionState(),previous=snapshot.recordDrafts[routeId]||snapshot.records[routeId];
    let planned;try{planned=appendReferenceMemo(previous?.note||'',reference);}catch(error){notify(error.message,true);return;}
    closeReferences();pickingComparison=false;mapView='all';
    show('all',snapshot.selected===routeId?{}:{node:routeId});
    // Let the normal route heading align first, then take the user to the draft.
    requestAnimationFrame(()=>{if(container.isConnected&&host.firstElementChild===atlasElement)atlas.setReferenceDraft(routeId,planned.note);});
  }
  function openReferences(routeId=null,allSites=false){
    const validId=nodes.has(routeId)?routeId:null;
    if(!referenceActive)referenceReturn={mode,mapView,pickingComparison};
    guide?.pause();discovery?.pause();atlas.pause();summaryReturn=false;
    if(!referenceLibrary)referenceLibrary=mountReferenceLibrary(referenceElement,{onBack:returnFromReferences,onMemo:prepareReferenceMemo});
    referenceActive=true;container.dataset.referenceOpen='true';host.replaceChildren(referenceElement);
    referenceLibrary.open({routeId:validId,allSites:allSites||!validId});
    renderFlow();renderSharedText(explorationStore.getState(),lastSharedGraph);updateFlowSpacing();
    requestAnimationFrame(()=>{if(referenceActive&&container.isConnected){$('#reference-library-title')?.focus({preventScroll:true});referenceElement.querySelector('.reference-return')?.scrollIntoView({block:'start',behavior:'instant'});}});
  }
  function sourcesForSave(){if(!restoredSources)return routeAtlas.sources;const restoredIds=new Set(restoredSources.map(source=>source.id));return [...restoredSources,...routeAtlas.sources.filter(source=>!restoredIds.has(source.id))];}
  function renderFlow(){
    const snapshot=atlas.getSessionState(),step=currentStep(snapshot);
    for(const item of container.querySelectorAll('[data-flow-step]')){if(Number(item.dataset.flowStep)===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');}
    container.dataset.finderStep=String(step);
    const currentMessage=['今の状況や、気になることから話せます。','まだ知らなかった学び方・働き方も見渡せます。','選んだ道の中身と、確かめたい条件を読みます。','同じ項目で読み、気になる違いを見つけます。','未定のまま、次に確かめたいことを一つ残せます。'][step-1];if($('#finder-flow-current').textContent!==currentMessage)$('#finder-flow-current').textContent=currentMessage;
    const next=$('#finder-next-step');next.hidden=referenceActive||step===1||step===5;
    $('[data-finder-mode=ai]').textContent=guide?'相談に戻る':'相談してみる';
    if(step===2||step===3){const count=snapshot.compare.length,kept=snapshot.keep.length;
      const primary=count===2?action('compare','この二つの違いを見る →','class="flow-primary"'):count===0&&kept&&!pickingComparison?action('record','残した候補から、次の一歩へ →','class="flow-primary"'):action('comparison-picker',count===1?'もう一つ、比べる道を選ぶ →':'気になる道を二つ比べてみる →','class="flow-primary"',pickingComparison&&count<2);
      next.innerHTML='<div><strong>'+ (count===2?'比べる二つがそろいました':count===1?'あと一つ、比べる道を選びます':pickingComparison?'比べる道を、二つ選んでください（0 / 2）':kept?'候補を'+kept+'件、残しています':'気になる道を、並べて見られます')+'</strong>'+(count?'<p>'+snapshot.compare.map(id=>esc(nodes.get(id).title)).join(' / ')+'</p>':'')+'</div><div class="flow-next-actions">'+primary+(count===0&&kept&&!pickingComparison?action('comparison-picker','ほかの道とも比べる'):action('record','比べずに、次の一歩を残す'))+'</div>';
    }else if(step===4)next.innerHTML='<div><strong>違いを見たら、次に確かめたいことへ</strong><p>どちらか一つを選ばなくても大丈夫です。</p></div><div class="flow-next-actions">'+action('record','次の一歩をメモする →','class="flow-primary"')+action('comparison-picker','比べる道を選び直す')+'</div>';
    syncShared();
  }
  function updateFlowSpacing(){const header=$('.finder-journey').getBoundingClientRect().height,footer=$('#finder-next-step').getBoundingClientRect().height;if(header)container.style.setProperty('--flow-header-space',Math.ceil(header+14)+'px');container.style.setProperty('--flow-footer-space',Math.ceil(footer+20)+'px');const map=$('#finder-tree-host'),sticky=innerWidth>=700&&innerWidth<1200&&map.getClientRects().length>0&&getComputedStyle(map).position==='sticky',extra=sticky?map.getBoundingClientRect().height+24:0;container.style.setProperty('--flow-reading-space',Math.ceil(header+14+extra)+'px');}
  if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(updateFlowSpacing);observer.observe($('.finder-journey'));observer.observe($('#finder-next-step'));observer.observe($('#finder-tree-host'));}else window.addEventListener('resize',updateFlowSpacing);
  function comparisonPicker(){
    const snapshot=atlas.getSessionState(),roots=routeAtlas.lenses.find(lens=>lens.id===snapshot.lens).rootIds;
    const ids=[...new Set([...snapshot.compare,...(guideState?.routes.map(route=>route.atlasId)||[]),...snapshot.keep,...snapshot.visited,...roots])].slice(0,20);
    pickerElement.innerHTML='<section id="finder-comparison-picker" class="finder-attention"><p class="guide-source">二つの違いを見る準備</p><h2 id="finder-picker-title" tabindex="-1">比べたい道を、二つ選んでください</h2><p>相談で出た道や、見ていた道を並べています。ここで二つに決めても、ほかの進路が閉じるわけではありません。</p><div class="flow-picker-grid">'+ids.map(id=>{const node=nodes.get(id),selected=snapshot.compare.includes(id);return '<article class="flow-picker-card"><button type="button" data-finder-action="route-compare" data-finder-node="'+esc(id)+'" aria-pressed="'+selected+'"><span>'+ (selected?'✓ 比較に選択中':'比較に加える')+'</span><strong>'+esc(node.title)+'</strong><span>'+esc(node.summary)+'</span></button>'+action('route-detail','内容を先に読む','data-finder-node="'+esc(id)+'"')+'</article>';}).join('')+'</div>'+action('overview','全体から別の道を探す')+'</section>';
  }
  function relation(route){const refs=route.answerIds.map(id=>guideState?.conversation?.answers.find(a=>a.id===id)||guideState?.userCorrections?.find(c=>c.id===id)).filter(Boolean);return refs.length?(guideState?.correspondence==='not_saved'?'<p class="finder-small">訂正は保存済みですが、元の回答は未保存です。対応関係は未確認です。</p>':'')+'<details><summary>理由と関係する本人の発言</summary><ul>'+refs.map(item=>'<li>'+esc(item.text||'分からない・回答なし')+'</li>').join('')+'</ul></details>':'<p class="finder-small">'+(guideState?.correspondence==='not_saved'?'元の回答は未保存・対応関係は未確認':'回答が少ない場合は、一般的な入口として読む')+'</p>';}
  function routeCard(id,route=null){const node=nodes.get(id),snapshot=atlas.getSessionState();return '<article class="finder-route-card" data-finder-route="'+esc(id)+'"><span class="guide-source">'+(route?'AIが注目した道・個別条件は未確認':'一般資料の入口・個別条件は未確認')+'</span><h3>'+esc(node.title)+'</h3><p>'+esc(node.summary)+'</p>'+(route?'<div class="finder-attention-reason"><h4>今回取り上げた理由</h4><p>'+esc(route.reason)+'</p>'+relation(route)+'<details><summary>確かめたい条件</summary><ul>'+route.unknowns.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></details></div>':'')+'<div class="finder-card-actions">'+action('route-detail','道の中身・生活・条件を見る →','data-finder-node="'+esc(id)+'"')+action('route-compare',snapshot.compare.includes(id)?'比較から外す':'比較に加える','data-finder-node="'+esc(id)+'" aria-pressed="'+snapshot.compare.includes(id)+'"')+'</div><details class="flow-bookmark"><summary>あとで読み返したいとき</summary>'+action('route-keep',snapshot.keep.includes(id)?'読み返す道から外す':'この道を残す','data-finder-node="'+esc(id)+'" aria-pressed="'+snapshot.keep.includes(id)+'"')+'</details></article>';}
  function attention(){
    const snapshot=atlas.getSessionState(),items=mapView==='attention'?(guideState?.routes||[]).map(route=>({id:route.atlasId,route})):routeAtlas.lenses.find(lens=>lens.id===snapshot.lens).rootIds.filter(id=>!snapshot.visited.includes(id)).map(id=>({id}));
    attentionElement.innerHTML='<section class="finder-attention"><h2 id="finder-attention-title" tabindex="-1">'+(mapView==='attention'?'相談から見えてきた道':'まだ開いていない方向')+'</h2><p>'+(mapView==='attention'?'回答との関連をAIが考えた、全体の一部です。開くこと・候補に残すことは志望や決定を意味しません。':'この見方でまだ開いていない入口です。利用できない道、関心がない道という意味ではありません。中には閲覧済みの道を含む入口もあります。')+'</p>'+(guideState?.stale&&mapView==='attention'?'<p class="guide-stale">回答や条件が変わったため、この注目理由は見直しが必要です。候補は削除していません。</p>':'')+(mapView==='attention'&&guideState?.summary?'<details><summary>今回の整理と、まだ分からないこと</summary><p>'+esc(guideState.summary)+'</p><ul>'+(guideState.unknowns||[]).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></details>':'')+(!items.length?'<p class="finder-empty">'+(mapView==='attention'?'まだAIの注目候補はありません。全体像から探すか、AIの案内で考えられます。':'この見方の入口は一度ずつ開いています。別の見方や、中の道も探せます。')+'</p>':'')+'<div class="finder-attention-grid">'+items.map(item=>routeCard(item.id,item.route)).join('')+'</div>'+(guideState?.additionalIdeas.length&&mapView==='attention'?'<section><h3>追加で調べる候補（Atlas未収録・未確認）</h3><ul>'+guideState.additionalIdeas.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></section>':'')+'<div class="finder-card-actions">'+action('overview','全体像に戻る')+action('guide','AIの理解を確認・訂正する')+action('comparison-picker','比べる道を選ぶ')+'</div></section>';
  }
  function explorationReview(snapshot,guideSnapshot){
    const opened=snapshot.visited.slice(-6);
    return '<section class="finder-review-progress"><h3>ここまでの探索</h3>'+(opened.length?'<details><summary>最近開いた道を振り返る（'+opened.length+'件）</summary><ul>'+opened.map(id=>'<li>'+action('route-detail',nodes.get(id).title,'data-finder-node="'+esc(id)+'"')+'<p>'+esc(nodes.get(id).summary)+'</p></li>').join('')+'</ul></details>':'<p>まだ道の詳しい説明を開いていません。未定のままメモを残すこともできます。</p>')+(guideSnapshot?.unknowns.length?'<details><summary>まだ分からないこと</summary><ul>'+guideSnapshot.unknowns.map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></details>':'')+(guideSnapshot?.summary?'<details><summary>最後にAIから届いた整理（未確認）</summary><p>'+esc(guideSnapshot.summary)+'</p>'+(guideSnapshot.stale?'<p>回答や条件が変わったため、見直しが必要です。</p>':'')+'</details>':'')+action('summarize-guide','AIと、ここまでを整理する（任意）','',!guide?.isConfigured())+'<p class="finder-small">AIへは改めて内容を確認して送信します。この画面のメモや地図の手書きは自動では送りません。</p></section>';
  }
  function record(){
    const snapshot=atlas.getSessionState(),guideSnapshot=guide?.getSessionState()||guideState;
    recordElement.innerHTML='<section class="finder-record"><h2 id="finder-record-title" tabindex="-1">次に、何を確かめてみる？</h2><p>一つに決めなくても大丈夫です。気になったことと、小さく試したいことを持ち帰れます。</p><p class="guide-stale">この画面の記録は自動保存されません。続きから開くには、JSONファイルを端末へ保存してください。</p><h3>残した候補</h3>'+(snapshot.keep.length?'<ul class="finder-kept-list">'+snapshot.keep.map(id=>'<li>'+action('route-detail',nodes.get(id).title,'data-finder-node="'+esc(id)+'"')+'</li>').join('')+'</ul>':'<p>まだ候補を残していません。どれか一つに決める必要はありません。</p>')+'<p>比べていた道：'+snapshot.compare.map(id=>esc(nodes.get(id).title)).join(' / ')+'</p>'+action('compare','二つの道を比べる','',snapshot.compare.length!==2)+explorationReview(snapshot,guideSnapshot)+(guideSnapshot?.nextActions.length?'<div class="finder-next-ideas"><h3>AIが挙げた次の一歩（提案・未確認）</h3>'+(guideSnapshot.stale?'<p>以前の条件に基づく提案です。見直しが必要です。</p>':'')+'<ul>'+guideSnapshot.nextActions.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></div>':'')+(guideSnapshot?.userCorrections?.length?'<section><h3>本人が直したこと</h3><ul>'+guideSnapshot.userCorrections.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></section>':'')+'<label for="finder-notes">気になったこと・まだ決められないこと</label><textarea id="finder-notes" rows="4" maxlength="3000" placeholder="何が気になったか、まだ決められないことなど。">'+esc(notes)+'</textarea><label for="finder-next-actions">次に、一つだけ確かめたいこと</label><textarea id="finder-next-actions" rows="4" maxlength="3000" placeholder="例：二つの授業紹介を読んで、気になる違いを一つメモする。">'+esc(nextActions)+'</textarea><p class="finder-small">一度の体験だけで向き・不向きを決めなくて大丈夫です。個人情報は書きすぎないでください。</p><section class="finder-file-section"><h3>端末ファイルとして持ち帰る</h3><p>候補・比較・本人メモ・閲覧位置・AIの整理・資料の確認範囲をJSONで保存します。本人が反映した訂正は含め、質問への回答は通常含めません。新しいAI案内で、まだ反映していない回答・訂正の書きかけは含みません。地図の書きかけの確認メモは含むため、内容を見直してください。</p><label class="guide-consent"><input type="checkbox" id="finder-include-conversation"'+(includeConversation?' checked':'')+'> 質問への回答も含める（以前の探索の入力・質問下書きも含みます。本人の訂正は常に保存）</label>'+('<div id="finder-preview-start"'+(saveDocument?' hidden':'')+'>'+action('save-preview','今日のメモをファイルに残す →','class="guide-primary flow-primary"')+'</div>'+(saveDocument?renderFinderSavePreview(saveDocument)+action('edit-save','内容を書き直す'):''))+'<p class="finder-small">復元した資料の確認範囲・日付は記録です。最新の募集や本人の資格を確認した意味にはなりません。</p></section><details><summary>図にまとめたいときは（任意）</summary><p>全体マップで残した候補をRE:Treeへ渡せます。Path Finderのファイル保存だけで終えても構いません。</p>'+action('tree','残した候補をRE:Treeへ渡す','',!snapshot.keep.length)+'</details></section>';
  }
  function show(next,options={},sync=true){
    if(!['all','ai','legacy'].includes(next))return;
    if(referenceActive)closeReferences();
    if(next!=='ai')summaryReturn=false;
    if(mode!==next){guide?.pause();discovery?.pause();atlas.pause();}
    mode=next;
    for(const button of container.querySelectorAll('[data-finder-mode]'))button.setAttribute('aria-pressed',String(button.dataset.finderMode===mode));
    $('.finder-map-menu').hidden=mode!=='all';
    for(const button of container.querySelectorAll('[data-finder-map-view]'))button.setAttribute('aria-pressed',String(button.dataset.finderMapView===mapView));
    note.textContent=mode==='ai'?'一つずつ答える・説明を聞く・先に地図を見る。いつでも行き来できます。地図のメモは自動でAIへ送りません。':mode==='legacy'?'以前のAI探索と固定デモです。全体マップや、新しいAIの案内も引き続き使えます。':'全体像、今回注目した道、自分の検討記録。どれか一つに決めずに考えられます。';
    let element;
    if(mode==='ai'){pickingComparison=false;guided();element=guideElement;}
    else if(mode==='legacy'){oldDiscovery();element=discoveryElement;}
    else if(mapView==='record'){pickingComparison=false;record();element=recordElement;}
    else if(pickingComparison){comparisonPicker();element=pickerElement;}
    else if(mapView==='attention'||mapView==='unopened'){attention();element=attentionElement;}
    else element=atlasElement;
    const replaced=host.firstElementChild!==element;if(replaced)host.replaceChildren(element);
    if(mode==='legacy')discovery.open(options);else if(mode==='ai'){guide.open();if(replaced)requestAnimationFrame(()=>{if(container.isConnected&&host.firstElementChild===guideElement){const heading=guideElement.querySelector('#guide-title');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});}});}else if(mapView==='all'&&!pickingComparison)atlas.open(options);else if(replaced)requestAnimationFrame(()=>{if(container.isConnected&&host.firstElementChild===element){const heading=element.querySelector('h2');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});}});
    renderFlow();updateFlowSpacing();
    alignReadingTitle();
    alignMobileScene(element);
    if(sync&&location.hash.startsWith('#/finder'))history.replaceState(null,'','#/finder?mode='+(mode==='legacy'?'ai':mode));
  }
  async function restore(file){
    if(!file)return;const fileToken=++restoreToken,startRevision=revision;
    try{
      const doc=await readFinderFile(file);if(fileToken!==restoreToken)return;
      if(blockUnfinishedTree())return;
      if(startRevision!==revision){notify('読み込み中に探索が変わったため、復元を見送りました。今の記録は残っています。もう一度ファイルを選んでください。',true);return;}
      if(!confirm('この画面の探索を、選んだファイルの内容に置き換えます。現在の記録は先に端末へ保存してください。復元しますか？'))return;
      restoringSession=true;summaryReturn=false;
      guide?.pause();discovery?.pause();
      const saved=doc.session;
      // The parser validates every tool before any runtime state is changed.
      if(!atlas.restoreSessionState(saved.atlas||emptyAtlas))throw new Error('atlas');
      if(saved.discovery&&!oldDiscovery().restoreSessionState(saved.discovery))throw new Error('discovery');else if(!saved.discovery&&discovery)discovery.restoreSessionState(emptyDiscovery);
      if(saved.guide){guideState=structuredClone(saved.guide);guided().restoreSessionState(saved.guide);}else{if(guide)guide.restoreSessionState({summary:'',userCorrections:[],statements:[],routes:[],additionalIdeas:[],nextActions:[],unknowns:[],conversation:{answers:[],corrections:[]},requestsUsed:0,stale:false,correspondence:'included'});guideState=null;atlas.setGuideOverlay({routes:[],stale:false});}
      notes=saved.notes;nextActions=saved.nextActions;revision=saved.revision+1;includeConversation=false;restoredSources=doc.catalogueSources;saveDocument=null;pickingComparison=false;mapView=saved.view==='record'?'record':'all';
      const restoredMode=saved.view==='legacy'?'legacy':saved.view==='ai'?'ai':'all';mode=restoredMode;
      explorationStore.replace({...captureSession(),exploration:saved.exploration||{...createExplorationState(),step:currentStep()}});
      restoringSession=false;show(restoredMode);notify('ファイルから復元しました。外部AIへの送信は行っていません。元の回答を含めなかった場合、回答との対応関係は未確認です。');
    }catch{if(fileToken!==restoreToken)return;notify('ファイルの形式・版・サイズ・道のIDを確認できませんでした。現在の探索やメモは変更していません。',true);}
    finally{restoringSession=false;if(fileToken===restoreToken)$('#finder-import').value='';}
  }
  container.addEventListener('input',event=>{if(event.target.id==='finder-notes'){notes=event.target.value;revision++;saveDocument=null;syncShared();$('#finder-save-preview')?.remove();if($('#finder-preview-start'))$('#finder-preview-start').hidden=false;}if(event.target.id==='finder-next-actions'){nextActions=event.target.value;revision++;saveDocument=null;syncShared();$('#finder-save-preview')?.remove();if($('#finder-preview-start'))$('#finder-preview-start').hidden=false;}});
  container.addEventListener('change',event=>{if(event.target.id==='finder-import')restore(event.target.files?.[0]);if(event.target.id==='finder-include-conversation'){includeConversation=event.target.checked;saveDocument=null;$('#finder-save-preview')?.remove();if($('#finder-preview-start'))$('#finder-preview-start').hidden=false;}});
  container.addEventListener('click',event=>{
    const guideAction=event.target.closest('[data-guide-action]');if(guideAction&&guideAction.dataset.guideAction!=='send')summaryReturn=false;
    const modeControl=event.target.closest('[data-finder-mode]');if(modeControl){clear();pickingComparison=false;if(modeControl.dataset.finderMode==='all')mapView='all';show(modeControl.dataset.finderMode,modeControl.dataset.finderMode==='all'?{overview:true}:{});return;}
    const viewControl=event.target.closest('[data-finder-map-view]');if(viewControl){clear();pickingComparison=false;mapView=viewControl.dataset.finderMapView;show('all',mapView==='all'?{overview:true}:{});return;}
    const control=event.target.closest('[data-finder-action]');if(!control||control.disabled)return;
    const name=control.dataset.finderAction,id=control.dataset.finderNode;
    if(name!=='download')clear();
    if(name==='show-map'){if(referenceActive)returnFromReferences();updateWorkspace({emphasis:'map'},false);$('#exploration-tree-title')?.focus({preventScroll:true});$('#finder-tree-host').scrollIntoView({block:'start'});}
    else if(name==='correct-shared'){show('ai');const statementId=id.slice('interpretation-'.length),control=[...guideElement.querySelectorAll('[data-guide-action=correct]')].find(button=>button.dataset.guideStatement===statementId);control?.click();}
    else if(name==='summarize-guide'){summaryReturn=true;show('ai');guide.prepareSummary();}
    else if(name==='record'){pickingComparison=false;mapView='record';show('all');}
    else if(name==='overview'){pickingComparison=false;mapView='all';show('all',{overview:true});}
    else if(name==='references')openReferences(null,true);
    else if(name==='guide')show('ai');
    else if(name==='legacy')show('legacy');
    else if(name==='route-detail'){pickingComparison=false;mapView='all';show('all',{node:id});}
    else if(name==='route-keep'||name==='route-compare'){
      const snapshot=atlas.getSessionState(),key=name==='route-keep'?'keep':'compare',limit=key==='keep'?6:2;
      if(snapshot[key].includes(id))snapshot[key]=snapshot[key].filter(value=>value!==id);else if(snapshot[key].length<limit)snapshot[key].push(id);else{notify(key==='keep'?'候補は六つまで残せます。前の候補を外してから追加してください。':'二つまで比較できます。一つ外してから追加してください。',true);return;}
      if(key==='keep')snapshot.considering=[...new Set([...snapshot.considering,...snapshot.keep])];
      atlas.restoreSessionState(snapshot);if(guideState)atlas.setGuideOverlay({routes:guideState.routes,stale:guideState.stale});revision++;show('all');const selected=container.querySelector('[data-finder-action="'+name+'"][data-finder-node="'+id+'"]');if(selected){const disclosure=selected.closest('details');if(disclosure)disclosure.open=true;selected.focus({preventScroll:true});}
    }
    else if(name==='comparison-picker'){pickingComparison=true;mapView='all';show('all');}
    else if(name==='compare'){pickingComparison=false;const snapshot=atlas.getSessionState();if(snapshot.compare.length===2){snapshot.view='compare';snapshot.selected=null;snapshot.path=[];atlas.restoreSessionState(snapshot);if(guideState)atlas.setGuideOverlay({routes:guideState.routes,stale:guideState.stale});mapView='all';show('all');}}
    else if(name==='edit-save'){saveDocument=null;record();$('#finder-notes')?.focus();}
    else if(name==='save-preview'){if(blockUnfinishedTree())return;try{saveDocument=createFinderDocument(state(),{includeConversation,catalogueSources:sourcesForSave()});record();$('#finder-save-preview-title')?.focus({preventScroll:true});$('#finder-save-preview').scrollIntoView({block:'start'});}catch{notify('保存する記録の形式を確認できませんでした。内容は画面に残っています。',true);}}
    else if(name==='download'&&saveDocument){if(blockUnfinishedTree())return;const blob=new Blob([stringifyFinderDocument(saveDocument)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='repath-finder-'+new Date().toISOString().slice(0,10)+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSONファイルを作成しました。ダウンロード先に保存されていることを確認してください。');}
    else if(name==='tree'){mapView='all';show('all');atlasElement.querySelector('[data-atlas-action="transfer"]')?.click();}
  });
  return {
    open({mode:requested,lens,node,mapDemo,topic,demo,references}={}){if(references==='all'){pickingComparison=false;mapView='all';show('all',{},false);openReferences(null,true);return;}if(topic||demo){pickingComparison=false;show('legacy',{...(topic?{topic}:{}),...(demo?{demo}:{})},false);return;}if(mapDemo||lens||node){pickingComparison=false;mapView='all';show('all',{...(lens?{lens}:{}),...(node?{node}:{}),...(mapDemo?{demo:mapDemo}:{})},false);return;}if(requested==='all'){pickingComparison=false;mapView='all';}show(requested||mode,requested==='all'?{overview:true}:{},false);},
    pause(){summaryReturn=false;restoreToken++;closeReferences();guide?.pause();discovery?.pause();atlas.pause();},
    getSessionState:state,
    getExploration:()=>({session:state(),graph:projectExploration(state())})
  };
}
