import {mountRouteAtlas} from './route-atlas.js';
import {mountRouteDiscovery} from './route-discovery.js';
import {mountGuidedDiscovery} from './guided-discovery.js';
import {enrichGuideTransfer} from './guide-transfer.js';
import {routeAtlas} from './route-atlas-data.js';
import {createFinderDocument,stringifyFinderDocument,readFinderFile} from './finder-file.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nodes=new Map(routeAtlas.nodes.map(node=>[node.id,node]));
const action=(name,label,extra='',disabled=false)=>'<button type="button" data-finder-action="'+name+'" '+extra+(disabled?' disabled':'')+'>'+esc(label)+'</button>';

// The catalogue underlies whole-map, attention and comparison views. Legacy
// generated routes and fixed demos remain available as a retained tool.
export function mountPathFinder(container,{onTransfer=()=>false}={}){
  container.classList.add('path-finder');
  container.innerHTML='<div class="finder-modes" role="group" aria-label="道の探し方"><button type="button" data-finder-mode="ai" aria-pressed="false">AIの案内で考える</button><button type="button" data-finder-mode="all" aria-pressed="true">まず全体を見る</button></div><p class="finder-mode-note" id="finder-mode-note"></p><div class="finder-carry"><button type="button" data-finder-action="record">候補・メモと、端末への保存</button><label for="finder-import">端末ファイルを開く</label><input type="file" id="finder-import" accept=".json,application/json"></div><p id="finder-status" role="status" tabindex="-1"></p><p id="finder-error" role="alert" tabindex="-1"></p><nav class="finder-map-views" aria-label="マップと検討記録"><button type="button" data-finder-map-view="all" aria-pressed="true">全体像</button><button type="button" data-finder-map-view="attention" aria-pressed="false">今回注目した道</button><button type="button" data-finder-map-view="unopened" aria-pressed="false">まだ開いていない道</button><button type="button" data-finder-map-view="record" aria-pressed="false">自分の検討記録</button></nav><div id="finder-tool-host"></div><details class="finder-retained"><summary>以前の探索・固定デモを使う</summary><p>以前のAI探索と、用意された架空の相談例も残しています。デモは本人の回答を分析したものではありません。</p>'+action('legacy','以前の探索を開く')+'</details>';
  const host=container.querySelector('#finder-tool-host'),note=container.querySelector('#finder-mode-note');
  const atlasElement=document.createElement('div'),guideElement=document.createElement('div'),recordElement=document.createElement('div'),attentionElement=document.createElement('div');
  let mode='all',mapView='all',guide=null,guideState=null,discovery=null,discoveryElement=null,revision=0,notes='',nextActions='',includeConversation=false,saveDocument=null,restoredSources=null,restoreToken=0,emptyDiscovery=null;
  const $=selector=>container.querySelector(selector);
  function clear(){saveDocument=null;$('#finder-error').textContent='';$('#finder-status').textContent='';}
  function notify(text,error=false){const target=$(error?'#finder-error':'#finder-status');target.textContent=text;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}
  const atlas=mountRouteAtlas(atlasElement,{onTransfer:transferWithNotes,onConsult:()=>show('ai'),onDiscoveryReturn:()=>show('legacy'),onChange:()=>{revision++;saveDocument=null;}});
  const emptyAtlas=atlas.getSessionState();
  function transferWithNotes(base){const snapshot=atlas.getSessionState(),ids=snapshot.keep.length?snapshot.keep:snapshot.selected?[snapshot.selected]:[];try{const transfer=enrichGuideTransfer(base,{atlasIds:ids,guide:guide?.getSessionState()||guideState,notes,nextActions});if(Object.values(transfer.nodeOrigins).includes('ai_proposal')&&!confirm('一般資料に加えて、AIの未確認の理由・行動案と本人の記録を、由来を分けてRE:Treeへ渡しますか？'))return false;return onTransfer(transfer);}catch{notify('図に引き継ぐ内容を確認できませんでした。候補とメモは残っています。',true);return false;}}
  function guided(){if(!guide)guide=mountGuidedDiscovery(guideElement,{getRouteIds:()=>atlas.getSessionState().compare,onMap:options=>{if(options?.compare){const snapshot=atlas.getSessionState();snapshot.view='compare';snapshot.selected=null;snapshot.path=[];atlas.restoreSessionState(snapshot);mapView='all';}else mapView=options?.attention?'attention':'all';show('all',{},true);},onUpdate:snapshot=>{guideState=snapshot;atlas.setGuideOverlay({routes:snapshot.routes,stale:snapshot.stale});revision++;saveDocument=null;}});return guide;}
  function oldDiscovery(){if(!discovery){discoveryElement=document.createElement('div');discovery=mountRouteDiscovery(discoveryElement,{onTransfer,onResults:result=>atlas.setHighlights(result),onShowAtlas:()=>{mapView='all';show('all',{overview:true});},onChange:()=>{revision++;saveDocument=null;}});emptyDiscovery=discovery.getSessionState();}return discovery;}
  function state(){return {revision,atlas:atlas.getSessionState(),discovery:discovery?.getSessionState()||null,guide:guide?.getSessionState()||guideState,notes,nextActions,view:mode==='all'&&mapView==='record'?'record':mode};}
  function relation(route){const refs=route.answerIds.map(id=>guideState?.conversation?.answers.find(a=>a.id===id)||guideState?.userCorrections?.find(c=>c.id===id)).filter(Boolean);return refs.length?(guideState?.correspondence==='not_saved'?'<p class="finder-small">訂正は保存済みですが、元の回答は未保存です。対応関係は未確認です。</p>':'')+'<details><summary>理由と関係する本人の発言</summary><ul>'+refs.map(item=>'<li>'+esc(item.text||'分からない・回答なし')+'</li>').join('')+'</ul></details>':'<p class="finder-small">'+(guideState?.correspondence==='not_saved'?'元の回答は未保存・対応関係は未確認':'回答が少ない場合は、一般的な入口として読む')+'</p>';}
  function routeCard(id,route=null){const node=nodes.get(id),snapshot=atlas.getSessionState();return '<article class="finder-route-card" data-finder-route="'+esc(id)+'"><span class="guide-source">'+(route?'AIが注目した道・個別条件は未確認':'一般資料の入口・個別条件は未確認')+'</span><h3>'+esc(node.title)+'</h3><p>'+esc(node.summary)+'</p>'+(route?'<div class="finder-attention-reason"><h4>今回取り上げた理由</h4><p>'+esc(route.reason)+'</p>'+relation(route)+'<details><summary>確かめたい条件</summary><ul>'+route.unknowns.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></details></div>':'')+'<div class="finder-card-actions">'+action('route-detail','道の中身・生活・条件を見る →','data-finder-node="'+esc(id)+'"')+action('route-keep',snapshot.keep.includes(id)?'残した候補から外す':'候補に残す','data-finder-node="'+esc(id)+'" aria-pressed="'+snapshot.keep.includes(id)+'"')+action('route-compare',snapshot.compare.includes(id)?'比較から外す':'比べる','data-finder-node="'+esc(id)+'" aria-pressed="'+snapshot.compare.includes(id)+'"')+'</div></article>';}
  function attention(){
    const snapshot=atlas.getSessionState(),items=mapView==='attention'?(guideState?.routes||[]).map(route=>({id:route.atlasId,route})):routeAtlas.lenses.find(lens=>lens.id===snapshot.lens).rootIds.filter(id=>!snapshot.visited.includes(id)).map(id=>({id}));
    attentionElement.innerHTML='<section class="finder-attention"><h2 id="finder-attention-title" tabindex="-1">'+(mapView==='attention'?'今回注目した道':'まだ開いていない方向')+'</h2><p>'+(mapView==='attention'?'回答との関連をAIが考えた、全体の一部です。開くこと・候補に残すことは志望や決定を意味しません。':'この見方でまだ開いていない入口です。利用できない道、関心がない道という意味ではありません。中には閲覧済みの道を含む入口もあります。')+'</p>'+(guideState?.stale&&mapView==='attention'?'<p class="guide-stale">回答や条件が変わったため、この注目理由は見直しが必要です。候補は削除していません。</p>':'')+(mapView==='attention'&&guideState?.summary?'<details><summary>今回の整理と、まだ分からないこと</summary><p>'+esc(guideState.summary)+'</p><ul>'+(guideState.unknowns||[]).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></details>':'')+(!items.length?'<p class="finder-empty">'+(mapView==='attention'?'まだAIの注目候補はありません。全体像から探すか、AIの案内で考えられます。':'この見方の入口は一度ずつ開いています。別の見方や、中の道も探せます。')+'</p>':'')+'<div class="finder-attention-grid">'+items.map(item=>routeCard(item.id,item.route)).join('')+'</div>'+(guideState?.additionalIdeas.length&&mapView==='attention'?'<section><h3>追加で調べる候補（Atlas未収録・未確認）</h3><ul>'+guideState.additionalIdeas.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></section>':'')+'<div class="finder-card-actions">'+action('overview','全体像に戻る')+action('guide','AIの理解を確認・訂正する')+action('compare','選んだ二つを同じ8項目で比べる','',snapshot.compare.length!==2)+action('record','候補と次の一歩を残す')+'</div></section>';
  }
  function record(){
    const snapshot=atlas.getSessionState(),guideSnapshot=guide?.getSessionState()||guideState;
    recordElement.innerHTML='<section class="finder-record"><h2 id="finder-record-title" tabindex="-1">自分の検討記録</h2><p>進路は未定のままで構いません。候補と、次に確かめることを残せます。</p><p class="guide-stale">この画面の記録は自動保存されません。続きから開くには、JSONファイルを端末へ保存してください。</p><h3>残した候補</h3>'+(snapshot.keep.length?'<ul class="finder-kept-list">'+snapshot.keep.map(id=>'<li>'+action('route-detail',nodes.get(id).title,'data-finder-node="'+esc(id)+'"')+'</li>').join('')+'</ul>':'<p>まだ候補を残していません。どれか一つに決める必要はありません。</p>')+'<p>比較中：'+snapshot.compare.map(id=>esc(nodes.get(id).title)).join(' / ')+'</p>'+action('compare','二つの道を比べる','',snapshot.compare.length!==2)+(guideSnapshot?.nextActions.length?'<div class="finder-next-ideas"><h3>AIが挙げた次の一歩（提案・未確認）</h3>'+(guideSnapshot.stale?'<p>以前の条件に基づく提案です。見直しが必要です。</p>':'')+'<ul>'+guideSnapshot.nextActions.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></div>':'')+(guideSnapshot?.userCorrections?.length?'<section><h3>本人が直したこと</h3><ul>'+guideSnapshot.userCorrections.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></section>':'')+'<label for="finder-notes">気づいたこと・確認メモ</label><textarea id="finder-notes" rows="4" maxlength="3000" placeholder="何が気になったか、まだ決められないことなど。">'+esc(notes)+'</textarea><label for="finder-next-actions">次に、小さく確かめたいこと</label><textarea id="finder-next-actions" rows="4" maxlength="3000" placeholder="何を知りたい？ 何を少し試す？ 試したあと、どんな気づきを残す？">'+esc(nextActions)+'</textarea><p class="finder-small">一度の体験だけで向き・不向きを決めなくて大丈夫です。個人情報は書きすぎないでください。</p><section class="finder-file-section"><h3>端末ファイルとして持ち帰る</h3><p>候補・比較・本人メモ・閲覧位置・AIの整理・資料の確認範囲をJSONで保存します。本人が反映した訂正は含め、質問への回答は通常含めません。新しいAI案内で、まだ反映していない回答・訂正の書きかけは含みません。地図の書きかけの確認メモは含むため、内容を見直してください。</p><label class="guide-consent"><input type="checkbox" id="finder-include-conversation"'+(includeConversation?' checked':'')+'> 質問への回答も含める（以前の探索の入力・質問下書きも含みます。本人の訂正は常に保存）</label>'+action('save-preview','保存する内容を確認する','class="guide-primary"')+(saveDocument?'<div id="finder-save-preview"><h4>端末に保存する内容</h4><p>サーバーには送信しません。ファイルを渡す場合は、個人の記録が含まれていないか確認してください。</p><pre>'+esc(stringifyFinderDocument(saveDocument))+'</pre>'+action('download','この内容をJSONファイルで保存する','class="guide-primary"')+'</div>':'')+'<p class="finder-small">復元した資料の確認範囲・日付は記録です。最新の募集や本人の資格を確認した意味にはなりません。</p></section><details><summary>図にまとめたいときは（任意）</summary><p>全体マップで残した候補をRE:Treeへ渡せます。Path Finderのファイル保存だけで終えても構いません。</p>'+action('tree','残した候補をRE:Treeへ渡す','',!snapshot.keep.length)+'</details></section>';
  }
  function show(next,options={},sync=true){
    if(!['all','ai','legacy'].includes(next))return;
    if(mode!==next){guide?.pause();discovery?.pause();atlas.pause();}
    mode=next;
    for(const button of container.querySelectorAll('[data-finder-mode]'))button.setAttribute('aria-pressed',String(button.dataset.finderMode===mode));
    $('.finder-map-views').hidden=mode!=='all';
    for(const button of container.querySelectorAll('[data-finder-map-view]'))button.setAttribute('aria-pressed',String(button.dataset.finderMapView===mapView));
    note.textContent=mode==='ai'?'一つずつ答える・説明を聞く・先に地図を見る。いつでも行き来できます。地図のメモは自動でAIへ送りません。':mode==='legacy'?'以前のAI探索と固定デモです。全体マップや、新しいAIの案内も引き続き使えます。':'全体像、今回注目した道、自分の検討記録。どれか一つに決めずに考えられます。';
    let element;
    if(mode==='ai'){guided();element=guideElement;}
    else if(mode==='legacy'){oldDiscovery();element=discoveryElement;}
    else if(mapView==='record'){record();element=recordElement;}
    else if(mapView==='attention'||mapView==='unopened'){attention();element=attentionElement;}
    else element=atlasElement;
    const replaced=host.firstElementChild!==element;if(replaced)host.replaceChildren(element);
    if(mode==='legacy')discovery.open(options);else if(mode==='ai'){guide.open();if(replaced)requestAnimationFrame(()=>{if(container.isConnected)guideElement.querySelector('#guide-title')?.scrollIntoView({block:'start',behavior:'instant'});});}else if(mapView==='all')atlas.open(options);else if(replaced)requestAnimationFrame(()=>{if(container.isConnected)element.querySelector('h2')?.scrollIntoView({block:'start',behavior:'instant'});});
    if(sync&&location.hash.startsWith('#/finder'))history.replaceState(null,'','#/finder?mode='+(mode==='legacy'?'ai':mode));
  }
  async function restore(file){
    if(!file)return;const fileToken=++restoreToken;
    try{
      const doc=await readFinderFile(file);if(fileToken!==restoreToken)return;
      if(!confirm('この画面の探索を、選んだファイルの内容に置き換えます。現在の記録は先に端末へ保存してください。復元しますか？'))return;
      guide?.pause();discovery?.pause();
      const saved=doc.session;
      // The parser validates every tool before any runtime state is changed.
      if(!atlas.restoreSessionState(saved.atlas||emptyAtlas))throw new Error('atlas');
      if(saved.discovery&&!oldDiscovery().restoreSessionState(saved.discovery))throw new Error('discovery');else if(!saved.discovery&&discovery)discovery.restoreSessionState(emptyDiscovery);
      if(saved.guide){guideState=structuredClone(saved.guide);guided().restoreSessionState(saved.guide);}else{if(guide)guide.restoreSessionState({summary:'',userCorrections:[],statements:[],routes:[],additionalIdeas:[],nextActions:[],unknowns:[],conversation:{answers:[],corrections:[]},requestsUsed:0,stale:false,correspondence:'included'});guideState=null;atlas.setGuideOverlay({routes:[],stale:false});}
      notes=saved.notes;nextActions=saved.nextActions;revision=saved.revision+1;includeConversation=false;restoredSources=doc.catalogueSources;saveDocument=null;mapView=saved.view==='record'?'record':'all';show(saved.view==='legacy'?'legacy':saved.view==='ai'?'ai':'all');notify('ファイルから復元しました。外部AIへの送信は行っていません。元の回答を含めなかった場合、回答との対応関係は未確認です。');
    }catch{if(fileToken!==restoreToken)return;notify('ファイルの形式・版・サイズ・道のIDを確認できませんでした。現在の探索やメモは変更していません。',true);}
    finally{if(fileToken===restoreToken)$('#finder-import').value='';}
  }
  container.addEventListener('input',event=>{if(event.target.id==='finder-notes'){notes=event.target.value;revision++;saveDocument=null;$('#finder-save-preview')?.remove();}if(event.target.id==='finder-next-actions'){nextActions=event.target.value;revision++;saveDocument=null;$('#finder-save-preview')?.remove();}});
  container.addEventListener('change',event=>{if(event.target.id==='finder-import')restore(event.target.files?.[0]);if(event.target.id==='finder-include-conversation'){includeConversation=event.target.checked;saveDocument=null;$('#finder-save-preview')?.remove();}});
  container.addEventListener('click',event=>{
    const modeControl=event.target.closest('[data-finder-mode]');if(modeControl){clear();if(modeControl.dataset.finderMode==='all')mapView='all';show(modeControl.dataset.finderMode);return;}
    const viewControl=event.target.closest('[data-finder-map-view]');if(viewControl){clear();mapView=viewControl.dataset.finderMapView;show('all');return;}
    const control=event.target.closest('[data-finder-action]');if(!control||control.disabled)return;
    const name=control.dataset.finderAction,id=control.dataset.finderNode;
    if(name!=='download')clear();
    if(name==='record'){mapView='record';show('all');}
    else if(name==='overview'){mapView='all';show('all',{overview:true});}
    else if(name==='guide')show('ai');
    else if(name==='legacy')show('legacy');
    else if(name==='route-detail'){mapView='all';show('all',{node:id});}
    else if(name==='route-keep'||name==='route-compare'){
      const snapshot=atlas.getSessionState(),key=name==='route-keep'?'keep':'compare',limit=key==='keep'?6:2;
      if(snapshot[key].includes(id))snapshot[key]=snapshot[key].filter(value=>value!==id);else if(snapshot[key].length<limit)snapshot[key].push(id);else{notify(key==='keep'?'候補は六つまで残せます。前の候補を外してから追加してください。':'二つまで比較できます。一つ外してから追加してください。',true);return;}
      if(key==='keep')snapshot.considering=[...new Set([...snapshot.considering,...snapshot.keep])];
      atlas.restoreSessionState(snapshot);revision++;show('all');
    }
    else if(name==='compare'){const snapshot=atlas.getSessionState();if(snapshot.compare.length===2){snapshot.view='compare';snapshot.selected=null;snapshot.path=[];atlas.restoreSessionState(snapshot);mapView='all';show('all');}}
    else if(name==='save-preview'){try{saveDocument=createFinderDocument(state(),{includeConversation,...(restoredSources?{catalogueSources:restoredSources}:{})});record();$('#finder-save-preview').scrollIntoView({block:'start'});}catch{notify('保存する記録の形式を確認できませんでした。内容は画面に残っています。',true);}}
    else if(name==='download'&&saveDocument){const blob=new Blob([stringifyFinderDocument(saveDocument)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='repath-finder-'+new Date().toISOString().slice(0,10)+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSONファイルを作成しました。ダウンロード先に保存されていることを確認してください。');}
    else if(name==='tree'){mapView='all';show('all');atlasElement.querySelector('[data-atlas-action="transfer"]')?.click();}
  });
  return {
    open({mode:requested,lens,node,mapDemo,topic,demo}={}){if(topic||demo){show('legacy',{...(topic?{topic}:{}),...(demo?{demo}:{})},false);return;}if(mapDemo||lens||node){mapView='all';show('all',{...(lens?{lens}:{}),...(node?{node}:{}),...(mapDemo?{demo:mapDemo}:{})},false);return;}if(requested==='all')mapView='all';show(requested||mode,{},false);},
    pause(){restoreToken++;guide?.pause();discovery?.pause();atlas.pause();},
    getSessionState:state
  };
}
