import {routeAtlas} from './route-atlas-data.js';
import {atlasFacetLabels,atlasStatusLabels,subjectOptions,validateAtlasPreferences,validateAtlasRecord,assessAtlasNode,matchAtlasHighlights,createAtlasTransfer} from './route-atlas-model.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nodeById=new Map(routeAtlas.nodes.map(node=>[node.id,node]));
const sourceById=new Map(routeAtlas.sources.map(source=>[source.id,source]));
const edgeTypes={related:'関連する道',combine:'組み合わせて考える道',transition:'あとから移る・学び直す道'};
const linkLabels={general:'一般的なつながりの例',unverified:'個別の条件は未確認'};
const emptyPreferences=()=>({wish:'',subjects:[],timing:'undecided',budget:'undecided'});
const emptyRecord=()=>({state:'unresearched',note:'',sourceUrl:'',checkedOn:''});
const today=()=>new Date().toISOString().slice(0,10);
const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const textList=values=>'<ul>'+values.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>';
const button=(action,label,attrs='',disabled=false)=>'<button type="button" data-atlas-action="'+action+'" '+attrs+(disabled?' disabled':'')+'>'+label+'</button>';
const childrenOf=id=>routeAtlas.edges.filter(edge=>edge.type==='contains'&&edge.from===id).map(edge=>nodeById.get(edge.to)).filter(Boolean);
const rootsOf=lens=>{const definition=routeAtlas.lenses.find(item=>item.id===lens);return (definition?.rootIds||[]).map(id=>nodeById.get(id)).filter(Boolean);};
const facetMarkup=(node,entries=Object.entries(atlasFacetLabels))=>'<dl class="atlas-facets">'+entries.map(([key,label])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(node.facets[key])+'</dd></div>').join('')+'</dl>';

const sessionKeys=['view','lens','selected','path','history','visited','considering','keep','compare','preferences','records','recordDrafts','preferencesOpen','recordOpen','activeDemo'];
const navigationKeys=['view','lens','selected','path','activeDemo'];
const recordKeys=['state','note','sourceUrl','checkedOn'];
const views=new Set(['overview','detail','compare','kept']);
const lensIds=new Set(routeAtlas.lenses.map(item=>item.id));
const demoIds=new Set(routeAtlas.demos.map(item=>item.id));
const knownStates=new Set(Object.keys(atlasStatusLabels));
const adjacent=(from,to)=>routeAtlas.edges.some(edge=>edge.from===from&&edge.to===to||edge.type!=='contains'&&edge.to===from&&edge.from===to);
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
// Inspect descriptors before reading values. Imported JSON must never invoke an
// accessor, accept a prototype-bearing object, or allocate an unbounded graph.
function safeSessionJSON(value){
  const seen=new Set();let count=0;
  function visit(item,depth){
    if(++count>15000||depth>12)return false;
    if(item===null||typeof item==='boolean')return true;
    if(typeof item==='string')return item.length<=4000;
    if(typeof item==='number')return Number.isFinite(item);
    if(typeof item!=='object'||seen.has(item))return false;
    const array=Array.isArray(item),proto=Object.getPrototypeOf(item);
    if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)return false;
    seen.add(item);
    const descriptors=Object.getOwnPropertyDescriptors(item),keys=Reflect.ownKeys(descriptors);
    if(array&&(!Number.isSafeInteger(item.length)||item.length>1500))return false;
    for(const key of keys){
      if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))return false;
      const descriptor=descriptors[key];
      if(!Object.hasOwn(descriptor,'value'))return false;
      if(array&&key==='length')continue;
      if(!descriptor.enumerable||array&&!/^(0|[1-9]\d*)$/.test(key))return false;
      if(!visit(descriptor.value,depth+1))return false;
    }
    return !array||keys.length===item.length+1;
  }
  try{return visit(value,0)&&new TextEncoder().encode(JSON.stringify(value)).length<=1024*1024;}catch{return false;}
}
const knownIds=(value,max=nodeById.size)=>Array.isArray(value)&&value.length<=max&&new Set(value).size===value.length&&value.every(id=>typeof id==='string'&&nodeById.has(id));
function validNavigation(value){
  if(!exactKeys(value,navigationKeys)||!views.has(value.view)||!lensIds.has(value.lens)||!(value.activeDemo===null||demoIds.has(value.activeDemo))||!knownIds(value.path,20))return false;
  if(value.view!=='detail')return value.selected===null&&value.path.length===0;
  return nodeById.has(value.selected)&&value.path.length>0&&value.path.at(-1)===value.selected&&value.path.every((id,index)=>index===0||adjacent(value.path[index-1],id));
}
/** Validate a complete, portable Atlas snapshot without touching the DOM. */
export function validateAtlasSessionState(value){
  if(!safeSessionJSON(value)||!exactKeys(value,sessionKeys))return false;
  const navigation=Object.fromEntries(navigationKeys.map(key=>[key,value[key]]));
  if(!validNavigation(navigation)||!Array.isArray(value.history)||value.history.length>50||!value.history.every(validNavigation))return false;
  if(!['visited','considering','recordOpen'].every(key=>knownIds(value[key]))||!knownIds(value.keep,6)||!knownIds(value.compare,2)||typeof value.preferencesOpen!=='boolean'||!validateAtlasPreferences(value.preferences))return false;
  for(const [key,strict] of [['records',true],['recordDrafts',false]]){
    const records=value[key];if(!records||typeof records!=='object'||Array.isArray(records)||Object.keys(records).length>nodeById.size)return false;
    for(const [id,record] of Object.entries(records)){
      if(!nodeById.has(id)||!exactKeys(record,recordKeys))return false;
      if(strict){if(!validateAtlasRecord(record))return false;}
      else if(!knownStates.has(record.state)||typeof record.note!=='string'||record.note.length>700||typeof record.sourceUrl!=='string'||record.sourceUrl.length>2000||typeof record.checkedOn!=='string'||record.checkedOn.length>10)return false;
    }
  }
  return true;
}

/** An overlay is a reference to a validated conversation, never a filter. */
export function validateAtlasGuideOverlay(value){
  if(!safeSessionJSON(value)||!exactKeys(value,['routes','stale'])||typeof value.stale!=='boolean'||!Array.isArray(value.routes)||value.routes.length>80)return false;
  const ids=new Set();
  for(const route of value.routes){
    if(!exactKeys(route,['atlasId','reason','answerIds','unknowns'])||!nodeById.has(route.atlasId)||ids.has(route.atlasId)||typeof route.reason!=='string'||!route.reason.trim()||route.reason.length>1200||!Array.isArray(route.answerIds)||route.answerIds.length>32||new Set(route.answerIds).size!==route.answerIds.length||!route.answerIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=100)||!Array.isArray(route.unknowns)||route.unknowns.length>12||!route.unknowns.every(note=>typeof note==='string'&&note.length>0&&note.length<=700))return false;
    ids.add(route.atlasId);
  }
  return true;
}

export function mountRouteAtlas(container,{onTransfer=()=>false,onConsult=()=>{},onDiscoveryReturn=()=>{},onChange=()=>{},onReferences=null}={}) {
  container.classList.add('route-atlas');
  const state={lens:'after-school',view:'overview',selected:null,path:[],history:[],visited:new Set(),considering:new Set(),compare:[],keep:[],preferences:emptyPreferences(),records:{},recordDrafts:{},highlights:new Map(),guideOverlay:new Map(),guideStale:false,notice:'',error:'',preferencesOpen:false,recordOpen:new Set(),activeDemo:null};
  let lastSessionJSON=null,restoring=false,changeQueued=false;
  function getSessionState(){return structuredClone({view:state.view,lens:state.lens,selected:state.selected,path:state.path,history:state.history,visited:[...state.visited],considering:[...state.considering],keep:state.keep,compare:state.compare,preferences:state.preferences,records:state.records,recordDrafts:state.recordDrafts,preferencesOpen:state.preferencesOpen,recordOpen:[...state.recordOpen],activeDemo:state.activeDemo});}
  function changed(){
    if(restoring||changeQueued)return;changeQueued=true;
    queueMicrotask(()=>{changeQueued=false;if(restoring)return;const snapshot=getSessionState(),json=JSON.stringify(snapshot);if(lastSessionJSON===json)return;const initial=lastSessionJSON===null;lastSessionJSON=json;if(!initial&&typeof onChange==='function')onChange(snapshot);});
  }
  function pushHistory(){state.history.push(snapshot());if(state.history.length>50)state.history.shift();}
  const $=selector=>container.querySelector(selector);
  const lens=()=>routeAtlas.lenses.find(item=>item.id===state.lens)||routeAtlas.lenses[0];
  const assessment=node=>assessAtlasNode(node,{preferences:state.preferences,considering:state.considering,visited:state.visited,records:state.records});
  function focus(selector,scroll=true){const target=$(selector);if(!target)return;target.focus({preventScroll:true});if(scroll){const top=selector==='#atlas-title'?(state.view==='detail'?(state.activeDemo?$('.atlas-demo-notice'):$('.atlas-breadcrumbs')):state.view==='overview'?$('.atlas-lenses'):target):target;(top||target).scrollIntoView({block:'start',behavior:'instant'});}}
  function notify(message,error=false){state[error?'error':'notice']=message;const target=$(error?'#atlas-error':'#atlas-status');if(target){target.textContent=message;if(error)target.focus({preventScroll:true});}}
  function clear(){state.notice='';state.error='';}
  function reachable(){const found=new Set();const visit=id=>{if(found.has(id))return;found.add(id);childrenOf(id).forEach(node=>visit(node.id));};rootsOf(state.lens).forEach(node=>visit(node.id));return found;}
  function pathFor(id){
    const queue=rootsOf(state.lens).map(node=>[node.id]),seen=new Set();
    while(queue.length){const path=queue.shift(),current=path.at(-1);if(current===id)return path;if(seen.has(current))continue;seen.add(current);childrenOf(current).forEach(node=>queue.push([...path,node.id]));}
    return [id];
  }
  function snapshot(){return {view:state.view,lens:state.lens,selected:state.selected,path:[...state.path],activeDemo:state.activeDemo};}
  function navigate(view,{node=null,path=null,push=true}={}){
    if(push)pushHistory();
    state.view=view;state.selected=node;state.path=path|| (node?pathFor(node):[]);if(node)state.visited.add(node);clear();render();focus('#atlas-title');
  }
  function openNode(id){if(nodeById.has(id))navigate('detail',{node:id});}
  function overview(push=true){navigate('overview',{push});}
  function sourceLinks(ids){return ids.map(id=>sourceById.get(id)).filter(Boolean).map(source=>{const url=safeUrl(source.url);return url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.title)+' ↗</a>':'<span>'+esc(source.title)+'（リンク未確認）</span>';}).join('');}
  function sourceDetails(ids){
    const sources=ids.map(id=>sourceById.get(id)).filter(Boolean);
    return '<details class="atlas-sources"><summary>この説明の参照先と、確認していないこと</summary><p>一般的な制度や道の存在を考えるための資料です。本人の参加・入学資格、募集中の機会、最新の費用を確認したものではありません。</p>'+sources.map(source=>'<article><h4>'+esc(source.title)+'</h4><p>'+esc(source.authority||'')+' · '+(source.status==='reviewed'?'資料ページを確認':'資料の確認状況は未確認')+(source.reviewedOn?' · '+esc(source.reviewedOn):'')+'</p><p>'+esc(source.scope||'')+'</p><p class="atlas-source-limit">'+esc(source.limitations||'個別の条件は未確認です。')+'</p>'+sourceLinks([source.id])+'</article>').join('')+(sources.length?'':'<p>この項目に対応する資料は、まだ掲載していません。</p>')+'</details>';
  }
  function statusMarkup(node){const value=assessment(node);return '<div class="atlas-node-status"><span>'+(state.visited.has(node.id)?'閲覧した項目':'まだ開いていない項目')+'</span><span>'+esc(value.label||atlasStatusLabels[value.state]||'未調査')+'</span></div>';}
  function highlightMarkup(node){const match=state.highlights.get(node.id);return match?'<p class="atlas-keyword-mark">AI候補に含まれる語との関連：'+match.terms.map(esc).join('・')+' <span>（キーワード参照）</span></p>':'';}
  function guideMarkup(node,compact=false){
    const proposal=state.guideOverlay.get(node.id);if(!proposal)return '';
    const stale=state.guideStale;
    return '<aside class="atlas-guide-mark'+(stale?' atlas-guide-stale':'')+'" data-atlas-guide="'+esc(node.id)+'"><p class="atlas-guide-label">'+(stale?'前の回答からのAI提案（再確認が必要）':'回答をもとにAIが挙げた関連候補・未確認')+'</p><p>'+esc(proposal.reason)+'</p>'+(compact?'':'<p class="atlas-small">'+(proposal.answerIds.length?'本人の回答・訂正 '+proposal.answerIds.length+'件を参照しています。発言との対応は「今回注目した道」で確認できます。':'元の回答との対応は未確認です。一般的な入口として、条件を確かめながら読んでください。')+'</p>'+(proposal.unknowns.length?'<h3>まだ確かめていないこと</h3>'+textList(proposal.unknowns):'<p class="atlas-small">個別の入学・応募条件、費用、本人との関係は未確認です。</p>'))+'<p class="atlas-small">'+(stale?'回答が変わったため、現在の希望に対応する提案とは限りません。':'道の優劣や適性の判定ではありません。')+'</p></aside>';
  }
  function preferenceMarkup(node,compact=false){const points=assessment(node).highlights||[];return points.length?(compact?'<p class="atlas-preference-tag">自分のメモと照らす点：'+esc(points[0])+'</p>':'<aside class="atlas-preference-notes"><h3>自分の希望と照らして、確かめること</h3><p>入力した希望や科目を手がかりにした確認メモです。道を隠したり、向いている順に並べたりする表示ではありません。</p>'+textList(points)+'</aside>'):'';}
  function refreshPreferenceNotes(){
    for(const card of container.querySelectorAll('[data-atlas-card]')){
      const node=nodeById.get(card.dataset.atlasCard);if(!node)continue;
      card.querySelector('.atlas-preference-tag')?.remove();
      const markup=preferenceMarkup(node,true);if(markup)card.querySelector('.atlas-card-actions')?.insertAdjacentHTML('beforebegin',markup);
    }
    const detail=$('.atlas-detail'),node=nodeById.get(state.selected);
    if(detail&&node){detail.querySelector('.atlas-preference-notes')?.remove();const markup=preferenceMarkup(node);if(markup)detail.querySelector('.atlas-facets')?.insertAdjacentHTML('beforebegin',markup);}
  }
  function card(node){return '<article class="atlas-card" data-atlas-card="'+esc(node.id)+'">'+statusMarkup(node)+'<button type="button" class="atlas-card-open" data-atlas-action="node" data-atlas-node="'+esc(node.id)+'"><h3>'+esc(node.title)+'</h3><p>'+esc(node.summary)+'</p><span>中の道・生活・条件を見る →</span></button>'+guideMarkup(node,true)+highlightMarkup(node)+preferenceMarkup(node,true)+'<div class="atlas-card-actions">'+button('compare',state.compare.includes(node.id)?'比較から外す':'比較に加える','data-atlas-node="'+esc(node.id)+'" aria-pressed="'+state.compare.includes(node.id)+'"')+button('keep',state.keep.includes(node.id)?'残した候補から外す':'候補に残す','data-atlas-node="'+esc(node.id)+'" aria-pressed="'+state.keep.includes(node.id)+'"')+'</div></article>';}
  function lensTabs(){return '<nav class="atlas-lenses" aria-label="全体の見方">'+routeAtlas.lenses.map(item=>button('lens',esc(item.title),'data-atlas-lens="'+esc(item.id)+'" aria-pressed="'+(state.lens===item.id)+'"')).join('')+'</nav>';}
  function progress(){const ids=reachable(),visited=[...ids].filter(id=>state.visited.has(id)).length;return '<p class="atlas-progress">いまの見方：<b>'+esc(lens().title)+'</b>　閲覧した項目 '+visited+' / '+ids.size+'　まだ開いていない項目 '+(ids.size-visited)+'</p>';}
  function overviewMarkup(){return '<section class="atlas-paper atlas-overview-intro"><p class="atlas-kicker">まず全体を見る</p><h2 id="atlas-title" tabindex="-1">'+esc(lens().title)+'</h2><p>'+esc(lens().description)+'</p><p class="atlas-small">並び順は、優劣やあなたへの適性の判定ではありません。</p>'+(onReferences?button('references','参考サイトからも調べる →'):'')+'</section><div class="atlas-card-grid" aria-label="'+esc(lens().title)+'の入口">'+rootsOf(state.lens).map(card).join('')+'</div>';}
  function breadcrumbs(){return '<nav class="atlas-breadcrumbs" aria-label="今見ている道の位置">'+button('overview','全体に戻る')+state.path.map((id,index)=>'<span aria-hidden="true">›</span>'+button('breadcrumb',esc(nodeById.get(id)?.title||id),'data-atlas-node="'+esc(id)+'" data-atlas-depth="'+index+'" '+(index===state.path.length-1?'aria-current="page"':''))).join('')+'</nav>';}
  function connections(node){
    const edges=routeAtlas.edges.filter(edge=>edge.type!=='contains'&&(edge.from===node.id||edge.to===node.id));
    if(!edges.length)return '';
    return '<section class="atlas-connections" aria-labelledby="atlas-links-title"><h3 id="atlas-links-title">一本で決めなくても。つながる道を見る</h3><p>あとで移る、組み合わせる、学び直すことも含めた例です。移るための条件は、学校・仕事・制度によって異なります。</p>'+edges.map(edge=>{const outward=edge.from===node.id,target=nodeById.get(outward?edge.to:edge.from);if(!target)return '';return '<article class="atlas-connection"><span>'+esc(edgeTypes[edge.type]||'関連する道')+' · '+(outward?'この道から':'この道へつながる別の入口')+'</span><h4>'+esc(edge.label)+'</h4>'+button('connection',esc(target.title)+' →','data-atlas-node="'+esc(target.id)+'"')+'<p>'+esc(edge.condition)+'</p><p class="atlas-small">'+esc(linkLabels[edge.verification]||'条件は未確認')+'</p><div class="atlas-inline-sources">'+sourceLinks(edge.sourceIds)+'</div></article>';}).join('')+'</section>';
  }
  function recordMarkup(node){
    const value=state.recordDrafts[node.id]||structuredClone(state.records[node.id]||emptyRecord());state.recordDrafts[node.id]=value;
    const saved=state.records[node.id];
    return '<details class="atlas-record" data-atlas-record-node="'+esc(node.id)+'" '+(state.recordOpen.has(node.id)?'open':'')+'><summary>この道について、自分の確認メモを残す</summary><p>状態はあなた自身の記録です。AIやサイトが参加できる・できないと判断したものではありません。</p>'+(saved?'<p class="atlas-record-saved">現在の記録：'+esc(atlasStatusLabels[saved.state])+(saved.checkedOn?' · 本人が記録した日付 '+esc(saved.checkedOn):'')+'</p>':'')+'<form id="atlas-record-form" novalidate><label for="atlas-record-state">自分の状況</label><select id="atlas-record-state" data-atlas-record="state">'+Object.entries(atlasStatusLabels).map(([id,label])=>'<option value="'+esc(id)+'" '+(value.state===id?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select><label for="atlas-record-note">考えたこと・確かめたいこと <span>'+(value.state==='constraint_recorded'?'12文字以上の具体的な内容が必要':'任意')+'</span></label><textarea id="atlas-record-note" data-atlas-record="note" rows="3" maxlength="700" placeholder="例：費用の負担が気になる。奨学金や働きながら学ぶ方法も確認したい。">'+esc(value.note)+'</textarea><label for="atlas-record-source">参照した公式ページのURL <span>'+(value.state==='constraint_recorded'?'httpsのURLが必要':'任意')+'</span></label><input id="atlas-record-source" type="url" data-atlas-record="sourceUrl" maxlength="2000" value="'+esc(value.sourceUrl)+'" placeholder="https://"><label for="atlas-record-date">自分で資料を見た日 <span>'+(value.state==='constraint_recorded'?'必要':'任意')+'</span></label><input id="atlas-record-date" type="date" data-atlas-record="checkedOn" max="'+today()+'" value="'+esc(value.checkedOn)+'"><p class="atlas-small">「確認した制約」は、具体的なメモ・参照したURL・過去または今日の日付がそろったときだけ記録できます。サイトが内容を検証したという意味ではありません。</p><button type="submit" data-atlas-action="save-record">確認メモを画面内に残す</button>'+(saved?button('clear-record','この道の確認メモを消す','data-atlas-node="'+esc(node.id)+'"'):'')+'</form></details>';
  }
  function detailMarkup(){
    const node=nodeById.get(state.selected);if(!node)return overviewMarkup();
    const children=childrenOf(node.id);
    const references=onReferences?'<aside class="atlas-reference-entry"><h3>別のサイトでも確かめる</h3><p>授業の例、仕事の内容、制度の条件。知りたいことに応じて、複数の参照先を選べます。</p>'+button('references','この道の参考サイトを見る →','data-atlas-node="'+esc(node.id)+'"')+'</aside>':'';
    return breadcrumbs()+'<section class="atlas-paper atlas-detail"><div class="atlas-back">'+button('back','← 一つ前の画面へ')+'</div>'+statusMarkup(node)+'<h2 id="atlas-title" tabindex="-1">'+esc(node.title)+'</h2><p class="atlas-node-summary">'+esc(node.summary)+'</p>'+guideMarkup(node)+highlightMarkup(node)+
      '<div class="atlas-detail-actions">'+(children.length?button('children','この中の道をもう少し見る ↓'):'')+button('compare',state.compare.includes(node.id)?'比較から外す':'この道を比較に加える','data-atlas-node="'+esc(node.id)+'" aria-pressed="'+state.compare.includes(node.id)+'"')+button('keep',state.keep.includes(node.id)?'残した候補から外す':'候補に残す','data-atlas-node="'+esc(node.id)+'" aria-pressed="'+state.keep.includes(node.id)+'"')+'</div>'+references+
      preferenceMarkup(node)+facetMarkup(node)+(node.examples.length?'<h3>具体的には</h3>'+textList(node.examples):'')+(node.questions.length?'<h3>先生や信頼できる大人に聞きたいこと</h3>'+textList(node.questions):'')+'<aside class="atlas-next"><h3>次にできる小さな一歩</h3><p>'+esc(node.nextStep)+'</p></aside>'+sourceDetails(node.sourceIds)+recordMarkup(node)+'</section>'+
      (children.length?'<section class="atlas-children" id="atlas-children" tabindex="-1"><h3>この中にも、いくつか道があります</h3><div class="atlas-card-grid">'+children.map(card).join('')+'</div></section>':'')+connections(node);
  }
  function comparisonMarkup(){const nodes=state.compare.map(id=>nodeById.get(id)).filter(Boolean);return '<section class="atlas-paper"><h2 id="atlas-title" tabindex="-1">二つの道を、同じ項目で比べる</h2><p>順位をつけるための比較ではありません。自分の条件と、まだ確かめていない点を見つけるために読みます。</p>'+button('back','← 前の画面に戻る')+'</section><div class="atlas-comparison"><div class="atlas-compare-pair atlas-compare-heading">'+nodes.map(node=>'<article class="atlas-paper"><h3>'+esc(node.title)+'</h3>'+statusMarkup(node)+button('node','この道を詳しく見る →','data-atlas-node="'+esc(node.id)+'"')+(onReferences?button('references','参考サイトで確かめる','data-atlas-node="'+esc(node.id)+'"'):'')+'</article>').join('')+'</div>'+Object.entries(atlasFacetLabels).map(([key,label])=>'<section class="atlas-compare-row"><h3>'+esc(label)+'</h3><div class="atlas-compare-pair">'+nodes.map(node=>'<article><p class="atlas-compare-name">'+esc(node.title)+'</p><p>'+esc(node.facets[key])+'</p></article>').join('')+'</div></section>').join('')+'</div>';}
  function keptMarkup(){return '<section class="atlas-paper"><h2 id="atlas-title" tabindex="-1">いま、考えている候補</h2><p>候補に残すことは、進路を決めたり、ほかの道を閉じたりすることではありません。</p>'+button('back','← 前の画面に戻る')+'</section><div class="atlas-card-grid">'+state.keep.map(id=>nodeById.get(id)).filter(Boolean).map(card).join('')+'</div>';}
  function preferencesMarkup(){return '<details class="atlas-preferences" '+(state.preferencesOpen?'open':'')+'><summary>自分の希望をメモする（任意・道は絞り込みません）</summary><p>書かなくてもすべての道を見られます。書いた内容で道を隠したり、適性や合格可能性を判断したりしません。AIにも自動送信しません。名前・学校名・連絡先は書かないでください。</p><label for="atlas-wish">気になること・希望 <span>任意</span></label><textarea id="atlas-wish" data-atlas-preference="wish" rows="3" maxlength="300" placeholder="例：働くことと、あとで学び直す方法の両方を知りたい。">'+esc(state.preferences.wish)+'</textarea><fieldset><legend>履修科目・気になる分野 <span>任意</span></legend><div class="atlas-subjects">'+subjectOptions.map((subject,index)=>'<label class="atlas-check"><input type="checkbox" data-atlas-subject="'+index+'" '+(state.preferences.subjects.includes(subject)?'checked':'')+'>'+esc(subject)+'</label>').join('')+'</div></fieldset><fieldset><legend>いつごろ考えたい？</legend>'+[['undecided','まだ決まっていない'],['soon','近いうちに試したい'],['later','あとからも考えたい']].map(([value,label])=>'<label class="atlas-check"><input type="radio" name="atlas-timing" data-atlas-preference="timing" value="'+value+'" '+(state.preferences.timing===value?'checked':'')+'>'+label+'</label>').join('')+'</fieldset><fieldset><legend>費用について</legend>'+[['undecided','まだ分からない'],['concern','費用や支援制度を確かめたい']].map(([value,label])=>'<label class="atlas-check"><input type="radio" name="atlas-budget" data-atlas-preference="budget" value="'+value+'" '+(state.preferences.budget===value?'checked':'')+'>'+label+'</label>').join('')+'</fieldset><p class="atlas-small">希望は画面内のメモだけです。相談へ進むときも、この内容を勝手に送信しません。</p>'+button('clear-preferences','希望のメモを空欄にする')+'</details>';}
  function coverageMarkup(){return '<details class="atlas-coverage"><summary>この地図に載せた範囲と、まだ載せていないこと</summary><p>'+esc(routeAtlas.coverage.scope)+'</p><h3>この資料でできないこと</h3>'+textList(routeAtlas.coverage.limitations)+'<h3>まだ含めていないこと</h3>'+textList(routeAtlas.coverage.notIncluded)+'<p>すべての制度・学校・仕事・生き方を載せたものではありません。記載した道が、誰でも今すぐ選べることを保証しません。</p>'+sourceDetails(routeAtlas.sources.map(source=>source.id))+'</details>';}
  function selections(){return '<section class="atlas-selection-bar"><p>比較 '+state.compare.length+' / 2　残した候補 '+state.keep.length+' / 6</p><div>'+button('show-compare','二つを比較する','',state.compare.length!==2)+button('show-kept','残した候補を見る','',!state.keep.length)+button('overview','全体に戻る')+'</div><details><summary>考えを図にしたいとき（任意）</summary><p>一般資料から残した候補と、自分で記録した確認事項を、RE:Treeの図へ渡せます。何も残していなければ、いま開いている道を使います。自分の希望と確認メモも図に含まれます。共有・保存する前に、個人情報がないか確認してください。</p><p class="atlas-small">図へ渡す確認メモは、「確認メモを画面内に残す」で反映した内容だけです。書きかけのメモはこの地図の画面内に残り、図には含めません。</p>'+button('transfer','RE:Treeで整理する（任意）','',!state.keep.length&&!state.selected)+'</details></section>';}
  function demosMarkup(){return '<details class="atlas-demos"><summary>道の行き来を、例で見てみる</summary><p>用意した読み方の例です。実在する人の経歴や、本人に勧める順序ではありません。</p><div>'+routeAtlas.demos.map(demo=>button('demo',esc(demo.title),'data-atlas-demo="'+esc(demo.id)+'"')).join('')+'</div></details>';}
  function demoMarkup(){
    const demo=routeAtlas.demos.find(item=>item.id===state.activeDemo);if(!demo)return '';
    const index=demo.path.indexOf(state.selected),next=index<0?demo.path[0]:demo.path[index+1];
    return '<aside class="atlas-demo-notice"><p><b>読み方の例：'+esc(demo.title)+'</b></p><p>'+esc(demo.description)+'実在する人の経験や効果を示す記録ではありません。</p><p>'+(index>=0?'いま '+(index+1)+' / '+demo.path.length+' 段目を見ています。':'例とは別の道も、自由に見られます。')+'</p><div>'+(next?button('demo-next',(index<0?'例の入口へ戻る：':'次の段へ進む：')+esc(nodeById.get(next)?.title||next),'data-atlas-node="'+esc(next)+'"'):'<p>ここまでがこの読み方の例です。ほかの道とのつながりも見てみてください。</p>')+button('end-demo','例を閉じて全体を見る')+'</div></aside>';
  }
  function render(){
    const active=container.contains(document.activeElement)?document.activeElement:null;
    const selector=active?.id?'#'+CSS.escape(active.id):active?.hasAttribute('data-atlas-subject')?'[data-atlas-subject="'+active.dataset.atlasSubject+'"]':active?.name&&active?.value?'[name="'+active.name+'"][value="'+active.value+'"]':active?.dataset.atlasAction?'[data-atlas-action="'+active.dataset.atlasAction+'"]'+(active.dataset.atlasNode?'[data-atlas-node="'+active.dataset.atlasNode+'"]':''):null;
    const selection=active?.tagName==='TEXTAREA'?[active.selectionStart,active.selectionEnd]:null;
    container.innerHTML='<div class="atlas-shell"><p id="atlas-error" class="atlas-error" role="alert" tabindex="-1">'+esc(state.error)+'</p><p id="atlas-status" class="atlas-status" role="status" aria-live="polite">'+esc(state.notice)+'</p>'+lensTabs()+progress()+(state.highlights.size?'<aside class="atlas-ai-reference"><strong>AI候補に含まれる語との関連（キーワード参照）</strong><p>AIからの候補に出てきた語を、掲載した道のタグと照らしています。適性や選択の可否を判断した表示ではありません。道は隠さず、同じ並びで見られます。</p></aside>':'')+demoMarkup()+(state.view==='detail'?detailMarkup():state.view==='compare'?comparisonMarkup():state.view==='kept'?keptMarkup():overviewMarkup())+selections()+preferencesMarkup()+demosMarkup()+coverageMarkup()+'<section class="atlas-consult"><h3>全体を見たあと、相談したくなったら</h3><p>気になることをAIに相談することもできます。希望のメモや確認メモを勝手に送ることはありません。</p><div>'+button('consult','AIに相談する（任意）')+button('discovery-return','相談で出ていた候補に戻る')+'</div></section><footer class="atlas-footer"><p>研究用の参考資料です。個別の制度・募集・費用・入学や応募条件は、公式情報と先生・保護者などに確認してください。希望・閲覧履歴・確認メモは自動保存しません。持ち帰るときは、自分で作業ファイルを保存してください。</p></footer></div>';
    const replacement=selector?$(selector):null;if(replacement&&!replacement.disabled){replacement.focus({preventScroll:true});if(selection)replacement.setSelectionRange(...selection);}
    changed();
  }
  function loadDemo(id){const demo=routeAtlas.demos.find(item=>item.id===id);if(!demo){notify('この読み方の例は見つかりませんでした。',true);return;}pushHistory();state.lens=demo.lensId;state.activeDemo=demo.id;state.view='detail';state.selected=demo.path[0];state.path=[demo.path[0]];state.visited.add(state.selected);clear();render();focus('#atlas-title');}
  container.addEventListener('input',event=>{const target=event.target;if(target.dataset.atlasPreference==='wish'){state.preferences.wish=target.value;if(validateAtlasPreferences(state.preferences))refreshPreferenceNotes();}if(target.dataset.atlasRecord&&state.selected){state.recordDrafts[state.selected]??=structuredClone(state.records[state.selected]||emptyRecord());state.recordDrafts[state.selected][target.dataset.atlasRecord]=target.value;}});
  container.addEventListener('change',event=>{const target=event.target;if(target.hasAttribute('data-atlas-subject')){const value=subjectOptions[Number(target.dataset.atlasSubject)];state.preferences.subjects=target.checked?[...new Set([...state.preferences.subjects,value])]:state.preferences.subjects.filter(subject=>subject!==value);refreshPreferenceNotes();notify('希望を画面内に記録しました。道の表示や並び順は変えていません。');}else if(['timing','budget'].includes(target.dataset.atlasPreference)){state.preferences[target.dataset.atlasPreference]=target.value;refreshPreferenceNotes();notify('希望を画面内に記録しました。すべての道を引き続き見られます。');}else if(target.dataset.atlasRecord==='state'&&state.selected){state.recordDrafts[state.selected]??=structuredClone(state.records[state.selected]||emptyRecord());state.recordDrafts[state.selected].state=target.value;state.recordOpen.add(state.selected);render();focus('#atlas-record-state',false);}});
  container.addEventListener('toggle',event=>{if(event.target.classList?.contains('atlas-preferences'))state.preferencesOpen=event.target.open;if(event.target.hasAttribute?.('data-atlas-record-node')){const id=event.target.dataset.atlasRecordNode;if(event.target.open)state.recordOpen.add(id);else state.recordOpen.delete(id);}},true);
  container.addEventListener('submit',event=>{if(event.target.id!=='atlas-record-form')return;event.preventDefault();const record=state.recordDrafts[state.selected];record.note=record.note.trim();record.sourceUrl=record.sourceUrl.trim();record.checkedOn=record.checkedOn.trim();if(!validateAtlasRecord(record)){notify('確認メモを見直してください。「確認した制約」には12文字以上の具体的な内容、httpsの参照URL、今日以前の日付が必要です。',true);focus(record.state==='constraint_recorded'&&record.note.trim().replace(/\s/g,'').length<12?'#atlas-record-note':record.sourceUrl&&!safeUrl(record.sourceUrl)||record.state==='constraint_recorded'&&!record.sourceUrl?'#atlas-record-source':'#atlas-record-date',false);return;}state.records[state.selected]=structuredClone(record);if(record.state==='considering')state.considering.add(state.selected);else if(!state.keep.includes(state.selected))state.considering.delete(state.selected);clear();state.notice='本人の確認メモとして画面内に残しました。サイトやAIが内容を検証した表示ではありません。';render();focus('#atlas-status');});
  container.addEventListener('click',event=>{
    const control=event.target.closest('[data-atlas-action]');if(!control||control.disabled)return;
    const action=control.dataset.atlasAction,id=control.dataset.atlasNode;clear();
    if(action==='node'||action==='connection')openNode(id);
    else if(action==='lens'){if(!routeAtlas.lenses.some(item=>item.id===control.dataset.atlasLens))return;pushHistory();state.lens=control.dataset.atlasLens;state.activeDemo=null;navigate('overview',{push:false});}
    else if(action==='overview')overview();
    else if(action==='breadcrumb'){const index=Number(control.dataset.atlasDepth);navigate('detail',{node:id,path:state.path.slice(0,index+1)});}
    else if(action==='back'){const previous=state.history.pop();if(previous){Object.assign(state,previous);clear();render();focus('#atlas-title');}else overview(false);}
    else if(action==='children')focus('#atlas-children');
    else if(action==='references')onReferences?.({routeId:nodeById.has(id)?id:null});
    else if(action==='compare'||action==='keep'){
      if(!nodeById.has(id))return;const target=state[action],max=action==='compare'?2:6;
      if(target.includes(id)){state[action]=target.filter(value=>value!==id);if(action==='keep'&&state.records[id]?.state!=='considering')state.considering.delete(id);}
      else if(target.length>=max){notify(action==='compare'?'比較は二つまでです。比較から一つ外してから選んでください。':'残せる候補は六つまでです。候補を見直してから追加してください。',true);return;}
      else{target.push(id);if(action==='keep')state.considering.add(id);}
      render();focus('[data-atlas-action="'+action+'"][data-atlas-node="'+id+'"]',false);
    }
    else if(action==='show-compare'&&state.compare.length===2)navigate('compare');
    else if(action==='show-kept'&&state.keep.length)navigate('kept');
    else if(action==='demo')loadDemo(control.dataset.atlasDemo);
    else if(action==='demo-next'){const demo=routeAtlas.demos.find(item=>item.id===state.activeDemo);if(demo&&demo.path.includes(id))navigate('detail',{node:id,path:demo.path.slice(0,demo.path.indexOf(id)+1)});}
    else if(action==='end-demo'){state.activeDemo=null;overview();}
    else if(action==='clear-preferences'){if(!confirm('希望のメモを空欄にしますか？閲覧した道や残した候補は変わりません。'))return;state.preferences=emptyPreferences();render();notify('希望のメモを空欄にしました。');}
    else if(action==='clear-record'){if(!confirm('この道についての確認メモを消しますか？'))return;delete state.records[id];delete state.recordDrafts[id];if(!state.keep.includes(id))state.considering.delete(id);render();notify('この道の確認メモを消しました。');}
    else if(action==='consult')onConsult({topic:'undecided'});
    else if(action==='discovery-return')onDiscoveryReturn();
    else if(action==='transfer'){
      const selected=(state.keep.length?state.keep:state.selected?[state.selected]:[]).map(value=>nodeById.get(value)).filter(Boolean);if(!selected.length)return;
      if(!validateAtlasPreferences(state.preferences)){notify('希望のメモの形式を確認してください。',true);return;}
      try{const transfer=createAtlasTransfer(selected,{records:state.records,preferences:state.preferences});if(onTransfer(transfer)===false)notify('図への移動を取り消しました。地図のメモや候補はそのままです。');}catch{notify('図に渡す内容を確認できませんでした。地図のメモや候補は残っています。',true);}
    }
  });
  for(const eventName of ['input','change','submit','click'])container.addEventListener(eventName,changed);
  container.addEventListener('toggle',changed,true);
  render();
  return {
    open({lens:nextLens,node,demo,overview:showOverview=false}={}){if(nextLens&&routeAtlas.lenses.some(item=>item.id===nextLens)){state.lens=nextLens;state.view='overview';state.selected=null;state.path=[];state.activeDemo=null;}if(showOverview){state.view='overview';state.selected=null;state.path=[];state.activeDemo=null;}if(demo){loadDemo(demo);return;}if(node&&nodeById.has(node)){openNode(node);return;}render();if(container.isConnected)focus('#atlas-title');},
    setHighlights({routes,source}={}){if(source!=='ai'){state.highlights.clear();render();return;}state.highlights=new Map(matchAtlasHighlights(routes,routeAtlas).map(match=>[match.nodeId,match]));render();},
    getSessionState,
    setReferenceDraft(nodeId,note){
      if(!nodeById.has(nodeId)||typeof note!=='string'||note.length>700)return false;
      if(state.selected!==nodeId)openNode(nodeId);
      const previous=state.recordDrafts[nodeId]||state.records[nodeId]||emptyRecord();
      state.recordDrafts[nodeId]={...structuredClone(previous),note};
      state.recordOpen.add(nodeId);
      state.notice='これから調べることを、確認メモの下書きに追加しました。資料を読んだ記録や、条件を確認した状態にはしていません。';
      render();focus('#atlas-record-note',false);
      const field=$('#atlas-record-note');
      field.setSelectionRange(field.value.length,field.value.length);
      field.scrollTop=field.scrollHeight;
      field.previousElementSibling?.scrollIntoView({block:'start',behavior:'instant'});
      return true;
    },
    restoreSessionState(snapshot){
      if(!validateAtlasSessionState(snapshot))return false;
      // Validation and cloning both finish before the first assignment. A bad
      // import therefore cannot replace only part of an existing work session.
      let next;try{next=structuredClone(snapshot);}catch{return false;}
      restoring=true;
      try{
        for(const key of ['view','lens','selected','path','history','compare','keep','preferences','records','recordDrafts','preferencesOpen','activeDemo'])state[key]=next[key];
        for(const key of ['visited','considering','recordOpen'])state[key]=new Set(next[key]);
        state.highlights.clear();state.guideOverlay.clear();state.guideStale=false;clear();render();
        lastSessionJSON=JSON.stringify(getSessionState());
      }finally{restoring=false;}
      return true;
    },
    setGuideOverlay(value){
      if(!validateAtlasGuideOverlay(value))return false;
      state.guideOverlay=new Map(structuredClone(value.routes).map(route=>[route.atlasId,route]));state.guideStale=value.stale;render();return true;
    },
    pause(){}
  };
}
