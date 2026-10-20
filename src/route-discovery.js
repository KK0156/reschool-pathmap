import {discoveryTopics,discoveryStatusLabels,validateDiscoveryRequest,validateDiscoveryResult,createDiscoveryTransfer} from './route-model.js';
import {routeDemos,getRouteDemo} from './route-demos.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const topicName = topic => discoveryTopics.find(item => item.id === topic)?.label || '進路';
const list = items => '<ul>' + items.map(item => '<li>' + escape(item) + '</li>').join('') + '</ul>';
const conditionChoices = ['費用を抑えたい','学校や家から通える範囲で考えたい','短い時間から試したい','学校や保護者に相談してから考えたい'];
const fields = [['何をする・学ぶ方向か','description'],['この方向を考える理由','reason'],['たとえば','examples'],['確認したい条件','conditions'],['まだ分からないこと','unknowns'],['次にできること','next_step']];
const fieldList = (route,items=fields) => '<dl>' + items.map(([title,key]) => '<div><dt>' + title + '</dt><dd>' + (Array.isArray(route[key]) ? list(route[key]) : escape(route[key])) + '</dd></div>').join('') + '</dl>';

/** A retained, memory-only consultation. The parent owns routing and tree replacement. */
export function mountRouteDiscovery(container,{onTransfer=()=>false}={}) {
  container.classList.add('route-discovery');
  const state = {
    draft:{topic:'',wish:'',situation:'',conditions:[],conditionText:''}, step:1, view:'wizard',
    graph:new Map(),roots:[],selected:null,path:[],back:[],compare:[],keep:[],summary:'',answer:'',
    consultation:null,demoId:null,source:null,serial:0,sequence:0,pending:false,capability:'checking',
    error:'',notice:'',consent:false,panel:null,job:null,capController:null,capSequence:0
  };
  const $ = selector => container.querySelector(selector);
  const consultation = () => ({topic:state.draft.topic,wish:state.draft.wish.trim(),situation:state.draft.situation.trim(),conditions:[...state.draft.conditions,state.draft.conditionText.trim()].filter(Boolean).join('\n')});
  const routes = keys => keys.map(key => state.graph.get(key)).filter(Boolean);
  const originLabel = entry => entry?.origin === 'demo' ? '固定デモ・架空の表示例' : 'AIからの提案・未確認';
  const canUseAI = () => state.capability === 'ready';
  function action(name,label,extra='',disabled=false) {return '<button type="button" data-rd-action="' + name + '"' + (disabled?' disabled':'') + ' ' + extra + '>' + label + '</button>';}
  function focus(selector) {const target=$(selector);if(target){target.focus({preventScroll:true});const top=selector==='#rd-view-title'&&state.view==='detail'?$('.rd-breadcrumbs'):null;(top||target).scrollIntoView({block:selector==='#rd-view-title'?'start':'nearest',behavior:'instant'});}}
  function tell(message,error=false) {state[error?'error':'notice']=message;const target=$(error?'#rd-error':'#rd-status');if(target){target.textContent=message;if(error)target.focus({preventScroll:true});}}
  function clearMessages() {state.error='';state.notice='';}
  function cancelJob(message='処理を中断しました。入力と表示中の候補は残っています。') {
    state.sequence++;state.job?.abort();state.job=null;state.consent=false;if(state.panel)state.panel.consent=false;
    const wasPending=state.pending;state.pending=false;if(wasPending)state.notice=message;
  }
  function startView(view,selected=state.selected,path=state.path) {
    cancelJob();
    state.back.push({view:state.view,selected:state.selected,path:[...state.path]});
    if(state.back.length>40)state.back.shift();
    state.view=view;state.selected=selected;state.path=[...path];state.panel=null;state.consent=false;clearMessages();render();focus('#rd-view-title');
  }
  function routePath(key) {
    const path=[],seen=new Set();let entry=state.graph.get(key);
    while(entry&&!seen.has(entry.key)){seen.add(entry.key);path.unshift(entry.key);entry=state.graph.get(entry.parent);}
    return path;
  }
  function selectRoute(key) {
    if(!state.graph.has(key))return;
    startView('detail',key,routePath(key));
  }
  function appendEntries(routeItems,origin,parent=null) {
    const keys=[];
    for(const route of routeItems){const key='route-'+(++state.serial);state.graph.set(key,{key,route:structuredClone(route),origin,parent,children:[],related:[],revealed:false,answer:'',questionDraft:''});keys.push(key);}
    return keys;
  }
  function replaceGraph(result,origin,context,demoId=null) {
    state.graph=new Map();state.roots=[];state.compare=[];state.keep=[];state.path=[];state.selected=null;state.back=[];
    state.summary=result.summary;state.answer=result.answer||'';state.consultation=structuredClone(context);state.source=origin;state.demoId=demoId;
    state.roots=appendEntries(result.routes,origin);state.view='results';state.panel=null;state.consent=false;
  }
  function loadDemo(id) {
    const demo=getRouteDemo(id);if(!demo){tell('このデモは見つかりませんでした。',true);return;}
    if(state.demoId===id&&state.graph.size){cancelJob();state.view='results';state.path=[];state.selected=null;state.panel=null;render();focus('#rd-view-title');return;}
    if(state.graph.size&&!confirm('デモを開くと、表示中の候補・比較・残した候補を入れ替えます。相談の入力は残ります。続けますか？'))return;
    cancelJob();clearMessages();state.graph=new Map();state.compare=[];state.keep=[];state.path=[];state.selected=null;state.back=[];state.panel=null;state.consent=false;
    const keys=appendEntries(demo.routes,'demo');const byId=new Map(demo.routes.map((route,i)=>[route.id,keys[i]]));
    for(const entry of state.graph.values()){
      entry.children=(demo.children[entry.route.id]||[]).map(id=>byId.get(id)).filter(Boolean);
      entry.related=(demo.related[entry.route.id]||[]).map(id=>byId.get(id)).filter(Boolean);
      for(const child of entry.children)if(state.graph.has(child)&&!state.graph.get(child).parent)state.graph.get(child).parent=entry.key;
    }
    state.roots=demo.rootIds.map(id=>byId.get(id)).filter(Boolean);state.summary=demo.summary;state.answer='';state.consultation=structuredClone(demo.consultation);state.source='demo';state.demoId=id;state.view='results';state.notice='固定のデモを開きました。入力した相談を分析した結果ではありません。相談の入力はそのまま残っています。';
    render();focus('#rd-view-title');
  }
  function availability() {
    if(state.capability==='checking')return '<p class="rd-availability" role="status">AIの接続設定を確認しています。入力やデモはそのまま使えます。</p>';
    if(canUseAI())return '<p class="rd-availability">AIに相談できます。送信する内容を確認し、チェックしたときだけ送ります。</p>';
    return '<div class="rd-availability"><p>' + (state.capability==='unavailable'?'AIは未接続です。今は送信できません。':'AIの接続設定を確認できませんでした。') + ' 入力は残るので、固定デモで操作を試せます。</p>' + action('retry-capability','接続設定を再確認する') + '</div>';
  }
  function demoPicker(compact=false) {
    return '<section class="rd-demos' + (compact?' rd-demos-compact':'') + '" aria-label="送信せず使える固定デモ"><h3>入力せず、デモで試す</h3><p>どれも架空の表示例です。あなたの相談を分析した結果ではありません。</p><div>' + routeDemos.map(demo => action('demo',escape(demo.title),'data-rd-demo="'+escape(demo.id)+'"')).join('') + '</div></section>';
  }
  function stepMarkup() {
    const d=state.draft;
    if(state.step===1)return '<h2 id="rd-view-title" tabindex="-1">何について考えたい？</h2><p>近いものを一つ選んでください。あとから戻って変えられます。</p><div class="rd-topic-grid">'+discoveryTopics.map(topic=>action('topic',escape(topic.label),'data-rd-topic="'+escape(topic.id)+'" aria-pressed="'+(d.topic===topic.id)+'"')).join('')+'</div>';
    if(state.step===2)return '<h2 id="rd-view-title" tabindex="-1">いま、何が気になっている？</h2><p>選んだテーマ：'+escape(topicName(d.topic))+'。名前・学校名・連絡先は書かないでください。</p><label for="rd-wish">知りたいこと・やってみたいこと '+(d.topic==='free'?'<span>必須</span>':'<span>任意</span>')+'</label><textarea id="rd-wish" data-rd-input="wish" rows="4" maxlength="700" placeholder="例：生物は好き。でも、医療以外に何があるか知りたい。">'+escape(d.wish)+'</textarea><label for="rd-situation">今の状況 <span>任意</span></label><textarea id="rd-situation" data-rd-input="situation" rows="3" maxlength="700" placeholder="例：まだ文理を決めていない。学校外の活動は参加したことがない。">'+escape(d.situation)+'</textarea><p class="rd-small">成績や詳しいプロフィールは不要です。分からない欄は空欄で進めます。</p>';
    return '<h2 id="rd-view-title" tabindex="-1">考えるときの条件はある？</h2><p>すべて任意です。条件がまだ決まっていなくても使えます。</p><fieldset><legend>気になる条件</legend>'+conditionChoices.map((label,i)=>'<label class="rd-check"><input type="checkbox" data-rd-condition="'+i+'" '+(d.conditions.includes(label)?'checked':'')+'>'+escape(label)+'</label>').join('')+'</fieldset><label for="rd-conditions">ほかに気になる条件 <span>任意</span></label><textarea id="rd-conditions" data-rd-input="conditionText" rows="3" maxlength="500" placeholder="例：自宅から参加できる方法も見たい。">'+escape(d.conditionText)+'</textarea>'+availability()+'<details class="rd-send-preview" open><summary>AIへ送る内容</summary><pre id="rd-preview">'+escape(requestText({intent:'discover',consultation:consultation()}))+'</pre></details><label class="rd-check rd-consent"><input type="checkbox" id="rd-consent" '+(state.consent?'checked':'')+' '+(!canUseAI()?'disabled':'')+'>上の内容を確認し、外部のAIサービスへ送ることに同意します</label><p class="rd-small">サイト側で自動保存しません。送信先サービスのデータの扱いは別です。入力やAIの提案から、能力・適性・合格可能性を判断することはありません。</p>';
  }
  function wizard() {
    return '<section class="rd-paper rd-wizard" data-rd-step="'+state.step+'"><ol class="rd-steps" aria-label="相談の順序">'+['テーマ','いまの迷い','条件と確認'].map((label,i)=>'<li '+(state.step===i+1?'aria-current="step"':'')+'><span>'+(i+1)+'</span>'+label+'</li>').join('')+'</ol>'+stepMarkup()+'<div class="rd-step-actions">'+(state.step>1?action('back-step','← 一つ前に戻る'):'')+(state.step<3?action('next','次へ →'):action('discover',state.pending?'候補を整理しています…':'AIに選択肢を聞く','class="rd-primary"',state.pending||!canUseAI()||!state.consent))+'</div>'+(state.pending?action('cancel-ai','中断する（入力と候補を残す）'):'')+(state.graph.size?action('resume','表示していた候補に戻る →'):'')+'</section>'+demoPicker();
  }
  function sourceNote() {
    const hasAI=[...state.graph.values()].some(entry=>entry.origin==='ai');
    return '<aside class="rd-source-note"><strong>'+(state.source==='demo'?(hasAI?'固定デモにAIの提案を追加しています':'固定デモ・架空の相談例'):'AIからの提案・未確認')+'</strong><p>'+(state.source==='demo'?'相談入力を分析したデモではありません。':'入力から考えられる方向を整理したものです。')+'実在する資料や募集情報を検索・確認する機能はありません。実際の参加条件・履修条件・募集要件は、公式情報や学校で確認してください。</p>'+(state.source==='ai'&&JSON.stringify(state.consultation)!==JSON.stringify(consultation())?'<p class="rd-context-changed">相談の入力が変わっています。いまの候補は、変更前の相談から作ったものです。新しい入力は、確認して送信するまでAIへ送りません。</p>':'')+'</aside>';
  }
  function routeCard(entry) {
    const route=entry.route;
    return '<article class="rd-route-card" data-rd-card="'+entry.key+'"><span class="rd-route-status">'+escape(discoveryStatusLabels[route.status]||route.status)+'</span><button type="button" class="rd-route-open" data-rd-action="select" data-rd-route="'+entry.key+'"><h3>'+escape(route.title)+'</h3><p>'+escape(route.description)+'</p><span>内容と確認事項を見る →</span></button><p class="rd-origin">'+originLabel(entry)+'</p><div class="rd-card-actions">'+action('compare',state.compare.includes(entry.key)?'比較から外す':'比べる','data-rd-route="'+entry.key+'" aria-pressed="'+state.compare.includes(entry.key)+'"')+action('keep',state.keep.includes(entry.key)?'候補から外す':'候補に残す','data-rd-route="'+entry.key+'" aria-pressed="'+state.keep.includes(entry.key)+'"')+'</div></article>';
  }
  function toolbar() {
    return '<section class="rd-selection-bar" aria-label="選んだ候補"><p>比較：'+state.compare.length+' / 2　残した候補：'+state.keep.length+' / 6</p><div>'+action('show-compare','2つの候補を比べる','',state.compare.length!==2)+action('show-kept','残した候補を見る','',!state.keep.length)+action('edit-consultation','相談の入力に戻る')+'</div><details><summary>図で整理したいとき（任意）</summary><p>残した候補をRE:Treeの図に渡せます。候補を残していなければ、いま詳細を見ている候補を使います。相談に書いた文章を、そのまま図の見出しに入れることはありません。</p>'+action('transfer','RE:Treeで整理する（任意）','',!state.keep.length&&!state.selected)+'</details></section>';
  }
  function resultMarkup() {
    return '<section class="rd-result-head rd-paper"><h2 id="rd-view-title" tabindex="-1">気になる道を開く</h2><p>内容や必要な条件を見てみましょう。「比べる」は2つまで選べます。</p><details class="rd-result-summary"><summary>候補のまとめを見る</summary><p>'+escape(state.summary)+'</p></details></section>'+sourceNote()+'<div class="rd-route-grid">'+routes(state.roots).map(routeCard).join('')+'</div>'+toolbar();
  }
  function breadcrumbs() {
    return '<nav class="rd-breadcrumbs" aria-label="今見ている候補の位置">'+action('results','最初の候補')+(state.path.length?'<span aria-hidden="true">›</span>':'')+state.path.map((key,i)=>action('breadcrumb',escape(state.graph.get(key)?.route.title||'候補'),'data-rd-route="'+key+'" data-rd-depth="'+i+'" '+(i===state.path.length-1?'aria-current="page"':''))).join('<span aria-hidden="true">›</span>')+'</nav>';
  }
  function detailMarkup() {
    const entry=state.graph.get(state.selected);if(!entry){state.view='results';return resultMarkup();}
    const route=entry.route;
    return breadcrumbs()+'<section class="rd-paper rd-detail"><div class="rd-back-row">'+action('back-view','← 前の画面に戻る')+'</div><span class="rd-route-status">'+escape(discoveryStatusLabels[route.status]||route.status)+'</span><h2 id="rd-view-title" tabindex="-1">'+escape(route.title)+'</h2><p class="rd-origin">'+originLabel(entry)+'</p>'+fieldList(route,fields.slice(0,2))+'<div class="rd-card-actions">'+action('compare',state.compare.includes(entry.key)?'比較から外す':'比べる','data-rd-route="'+entry.key+'" aria-pressed="'+state.compare.includes(entry.key)+'"')+action('keep',state.keep.includes(entry.key)?'候補から外す':'候補に残す','data-rd-route="'+entry.key+'" aria-pressed="'+state.keep.includes(entry.key)+'"')+'</div><div class="rd-detail-actions">'+action('expand',entry.revealed?'下の候補を見る ↓':'この方向を、もう少し詳しく見る →','data-rd-route="'+entry.key+'"')+action('prepare-ai','AIに別の方向・質問を聞く','',!canUseAI())+'</div>'+(!canUseAI()?'<div class="rd-small"><p>'+(state.capability==='checking'?'AIの接続設定を確認しています。':'AIは今は使えません。')+'デモの中を読む・比較する操作は使えます。</p>'+action('retry-capability','接続設定を再確認する','',state.capability==='checking')+'</div>':'')+fieldList(route,fields.slice(2))+'</section>'+sourceNote()+(entry.answer?'<section class="rd-paper rd-answer"><h3>質問への返答・AIの提案（未確認）</h3><p>'+escape(entry.answer)+'</p></section>':'')+(entry.revealed&&entry.children.length?'<section class="rd-children" id="rd-children" tabindex="-1"><h3>この方向の中にも、いくつか選択肢があります</h3><div class="rd-route-grid">'+routes(entry.children).map(routeCard).join('')+'</div></section>':'')+(entry.related.length?'<section class="rd-related rd-paper"><h3>関連する別の方向</h3><p>いまの候補だけで決めなくても構いません。</p><div>'+routes(entry.related).map(other=>action('related',escape(other.route.title)+' →','data-rd-route="'+other.key+'"')).join('')+'</div></section>':'')+panelMarkup()+toolbar();
  }
  function comparisonMarkup(kept=false) {
    const entries=routes(kept?state.keep:state.compare);
    const heading='<section class="rd-paper"><h2 id="rd-view-title" tabindex="-1">'+(kept?'残している候補':'2つの候補を比べる')+'</h2><p>'+(kept?'残したことは、進路を決めたという意味ではありません。':'同じ項目を読み比べて、違いとまだ分からないことを確認します。順位はつけません。')+'</p>'+action('back-view','← 前の画面に戻る')+'</section>'+sourceNote();
    if(!kept)return heading+'<div class="rd-comparison rd-compare-table"><div class="rd-compare-pair rd-compare-heading">'+entries.map(entry=>'<article class="rd-paper"><span class="rd-route-status">'+escape(discoveryStatusLabels[entry.route.status]||entry.route.status)+'</span><h3>'+escape(entry.route.title)+'</h3><p class="rd-origin">'+originLabel(entry)+'</p>'+action('select','この候補を詳しく見る →','data-rd-route="'+entry.key+'"')+action('keep',state.keep.includes(entry.key)?'候補から外す':'候補に残す','data-rd-route="'+entry.key+'" aria-pressed="'+state.keep.includes(entry.key)+'"')+'</article>').join('')+'</div>'+fields.map(([label,key])=>'<section class="rd-compare-row"><h3>'+label+'</h3><div class="rd-compare-pair">'+entries.map(entry=>'<article><p class="rd-compare-route-name">'+escape(entry.route.title)+'</p><div>'+(Array.isArray(entry.route[key])?list(entry.route[key]):'<p>'+escape(entry.route[key])+'</p>')+'</div></article>').join('')+'</div></section>').join('')+'</div>'+toolbar();
    return heading+'<div class="rd-comparison">'+entries.map(entry=>'<article class="rd-paper"><span class="rd-route-status">'+escape(discoveryStatusLabels[entry.route.status]||entry.route.status)+'</span><h3>'+escape(entry.route.title)+'</h3><p class="rd-origin">'+originLabel(entry)+'</p>'+fieldList(entry.route)+action('select','この候補を詳しく見る →','data-rd-route="'+entry.key+'"')+action('keep',state.keep.includes(entry.key)?'候補から外す':'候補に残す','data-rd-route="'+entry.key+'" aria-pressed="'+state.keep.includes(entry.key)+'"')+'</article>').join('')+'</div>'+toolbar();
  }
  function panelRequest() {
    if(!state.panel||!state.selected)return null;
    const entry=state.graph.get(state.selected);if(!entry)return null;
    const request={intent:state.panel.intent,consultation:structuredClone(state.consultation||consultation()),route:structuredClone(entry.route),trail:state.path.slice(-8).map(key=>state.graph.get(key)?.route.title||'候補')};
    if(request.intent==='ask')request.question=state.panel.question.trim();
    return request;
  }
  function panelMarkup() {
    if(!state.panel)return '';
    return '<section class="rd-paper rd-ai-panel" id="rd-ai-panel" tabindex="-1"><h3>この候補について、AIに聞く</h3><p>選んでいる候補と、下の相談内容だけを送ります。表示中の候補は消さず、返ってきた方向を追加します。</p><fieldset><legend>聞きたいこと</legend><label class="rd-check"><input type="radio" name="rd-intent" value="expand" '+(state.panel.intent==='expand'?'checked':'')+'>この方向の中に、ほかにどんな選択肢があるか</label><label class="rd-check"><input type="radio" name="rd-intent" value="ask" '+(state.panel.intent==='ask'?'checked':'')+'>自分の質問を聞く</label></fieldset>'+(state.panel.intent==='ask'?'<label for="rd-question">質問</label><textarea id="rd-question" data-rd-input="question" rows="3" maxlength="600" placeholder="例：参加する前に、何を調べておくとよい？">'+escape(state.panel.question)+'</textarea>':'')+'<details class="rd-send-preview" open><summary>今回AIへ送る内容</summary><pre id="rd-panel-preview">'+escape(requestText(panelRequest()))+'</pre></details><label class="rd-check rd-consent"><input type="checkbox" id="rd-panel-consent" '+(state.panel.consent?'checked':'')+' '+(!canUseAI()?'disabled':'')+'>今回の内容を確認し、外部のAIサービスへ送ることに同意します</label><div class="rd-step-actions">'+action('send-panel',state.pending?'考えられる方向を整理しています…':'この内容でAIに聞く','class="rd-primary"',state.pending||!canUseAI()||!state.panel.consent)+action('close-panel','閉じる')+'</div>'+(state.pending?action('cancel-ai','中断する（今の候補を残す）'):'')+''+'</section>';
  }
  function requestText(request) {
    if(!request)return '';
    const c=request.consultation;
    let text='テーマ：'+topicName(c.topic)+'\n知りたいこと：'+(c.wish||'未記入')+'\n今の状況：'+(c.situation||'未記入')+'\n条件：'+(c.conditions||'未記入');
    if(request.route)text+='\n\n選んだ候補：'+request.route.title+'\n'+fields.map(([label,key])=>label+'：'+(Array.isArray(request.route[key])?request.route[key].join(' / '):request.route[key])).join('\n')+'\n候補の状態：'+(discoveryStatusLabels[request.route.status]||request.route.status)+'\nここまでの候補：'+request.trail.join(' → ');
    if(request.question!==undefined)text+='\n\n質問：'+(request.question||'未記入');
    return text;
  }
  function render() {
    const active=container.contains(document.activeElement)?document.activeElement:null;
    const restore=active?.id?'#'+CSS.escape(active.id):active?.hasAttribute('data-rd-condition')?'[data-rd-condition="'+active.dataset.rdCondition+'"]':active?.hasAttribute('data-rd-topic')?'[data-rd-topic="'+active.dataset.rdTopic+'"]':active?.hasAttribute('data-rd-action')?'[data-rd-action="'+active.dataset.rdAction+'"]'+(active.dataset.rdRoute?'[data-rd-route="'+active.dataset.rdRoute+'"]':''):null;
    const selection=active?.tagName==='TEXTAREA'?[active.selectionStart,active.selectionEnd]:null;
    container.innerHTML='<div class="rd-shell"><div id="rd-error" class="rd-error" role="alert" tabindex="-1">'+escape(state.error)+'</div><p id="rd-status" class="rd-status" role="status" aria-live="polite">'+escape(state.notice)+'</p>'+(state.view==='wizard'?wizard():state.view==='detail'?detailMarkup():state.view==='compare'?comparisonMarkup():state.view==='kept'?comparisonMarkup(true):resultMarkup())+'<footer class="rd-footer"><p>研究用の試作品です。提案は正解や参加資格の判定ではありません。重要なことは、先生・保護者など信頼できる大人と確認してください。</p><p>入力・候補はこの画面のメモリにだけ残り、再読み込みで消えます。外部の人と直接連絡する機能はありません。</p></footer></div>';
    const replacement=restore?$(restore):null;if(replacement&&!replacement.disabled){replacement.focus({preventScroll:true});if(selection)replacement.setSelectionRange(...selection);}
  }
  async function checkCapability() {
    state.capController?.abort();const revision=++state.capSequence;const controller=new AbortController();state.capController=controller;state.capability='checking';state.consent=false;if(state.panel)state.panel.consent=false;render();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{const response=await fetch('/.netlify/functions/discover-routes',{signal:controller.signal,headers:{Accept:'application/json'}});const data=await response.json();if(revision!==state.capSequence)return;state.capability=response.ok&&data.configured===true?'ready':response.ok&&data.configured===false?'unavailable':'error';}
    catch{if(revision!==state.capSequence)return;state.capability='error';}
    finally{clearTimeout(timer);if(revision===state.capSequence){state.capController=null;render();}}
  }
  async function sendRequest(request,kind) {
    if(state.pending||!canUseAI())return;
    if(!validateDiscoveryRequest(request)){tell('入力の長さと必須項目を確認してください。自由な相談では、知りたいことを一文書いてください。',true);return;}
    if(kind==='discover'&&state.graph.size&&!confirm('新しい候補を表示すると、今の候補・比較・残した候補を入れ替えます。続けますか？'))return;
    if(kind!=='discover'&&request.intent==='expand'&&state.graph.size>78){tell('候補が多くなったため、これ以上の追加はできません。今の候補は残っています。比べる候補を絞るか、新しい相談で考えてみてください。',true);return;}
    const revision=++state.sequence;const controller=new AbortController();state.job=controller;state.pending=true;state.consent=false;if(state.panel)state.panel.consent=false;clearMessages();
    const parent=state.selected;render();const timer=setTimeout(()=>controller.abort(),55000);
    try{
      const response=await fetch('/.netlify/functions/discover-routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal});
      let result;try{result=await response.json();}catch{throw new Error('返答を読み取れませんでした。入力と今の候補は残っています。');}
      if(revision!==state.sequence)return;
      if(!response.ok){if(response.status===503){state.capability='unavailable';state.consent=false;if(state.panel)state.panel.consent=false;}throw new Error((typeof result?.error==='string'?result.error:null)||'AIに接続できませんでした。しばらくしてからもう一度試してください。');}
      if(!validateDiscoveryResult(result,request.intent))throw new Error('候補の形式を確認できなかったため、反映しませんでした。');
      if(kind==='discover')replaceGraph(result,'ai',request.consultation);
      else {
        const entry=state.graph.get(parent);if(!entry)throw new Error('追加先の候補を確認できませんでした。');
        if(state.graph.size+result.routes.length>80)throw new Error('候補の上限に達したため、追加しませんでした。今の候補は残っています。');
        const keys=appendEntries(result.routes,'ai',parent);entry.children.push(...keys);entry.revealed=true;entry.answer=result.answer||result.summary;state.panel=null;state.view='detail';state.selected=parent;
      }
      state.notice='AIからの提案を表示しました。未確認の内容は、公式資料や学校で確かめてください。';
    }catch(error){if(revision===state.sequence)state.error=error.name==='AbortError'?'返答に時間がかかっています。入力と今の候補は残っています。もう一度試すか、固定デモを使えます。':error.message;}
    finally{clearTimeout(timer);if(revision===state.sequence){state.pending=false;state.job=null;render();focus(state.error?'#rd-error':'#rd-view-title');}}
  }
  function updateInput(target) {
    const key=target.dataset.rdInput;
    if(key==='question'&&state.panel){const wasPending=state.pending;cancelJob();state.panel.question=target.value;const entry=state.graph.get(state.selected);if(entry)entry.questionDraft=target.value;state.panel.consent=false;const preview=$('#rd-panel-preview');if(preview)preview.textContent=requestText(panelRequest());const check=$('#rd-panel-consent');if(check)check.checked=false;const send=$('[data-rd-action="send-panel"]');if(send){send.disabled=true;send.textContent='この内容でAIに聞く';}if(wasPending)render();return;}
    if(!['wish','situation','conditionText'].includes(key))return;
    const wasPending=state.pending;cancelJob();state.draft[key]=target.value;state.consent=false;state.error='';const error=$('#rd-error');if(error)error.textContent='';const check=$('#rd-consent');if(check)check.checked=false;const send=$('[data-rd-action="discover"]');if(send)send.disabled=true;const preview=$('#rd-preview');if(preview)preview.textContent=requestText({intent:'discover',consultation:consultation()});if(wasPending)render();
  }
  container.addEventListener('input',event=>{if(event.target.matches('[data-rd-input]'))updateInput(event.target);});
  container.addEventListener('change',event=>{
    const target=event.target;
    if(target.id==='rd-consent'){state.consent=target.checked;const send=$('[data-rd-action="discover"]');if(send)send.disabled=state.pending||!canUseAI()||!state.consent;}
    else if(target.id==='rd-panel-consent'&&state.panel){state.panel.consent=target.checked;const send=$('[data-rd-action="send-panel"]');if(send)send.disabled=state.pending||!canUseAI()||!state.panel.consent;}
    else if(target.hasAttribute('data-rd-condition')){cancelJob();const value=conditionChoices[Number(target.dataset.rdCondition)];state.draft.conditions=target.checked?[...new Set([...state.draft.conditions,value])]:state.draft.conditions.filter(item=>item!==value);state.consent=false;render();}
    else if(target.name==='rd-intent'&&state.panel){cancelJob();state.panel.intent=target.value;state.panel.consent=false;render();focus(target.value==='ask'?'#rd-question':'#rd-ai-panel');}
  });
  container.addEventListener('click',event=>{
    const button=event.target.closest('[data-rd-action]');if(!button||button.disabled)return;
    const name=button.dataset.rdAction,key=button.dataset.rdRoute;clearMessages();
    if(name==='topic'){cancelJob();state.draft.topic=button.dataset.rdTopic;state.consent=false;render();focus('[data-rd-action="next"]');}
    else if(name==='next'){
      if(state.step===1&&!state.draft.topic){tell('考えたいテーマを一つ選んでください。',true);focus('[data-rd-topic]');return;}
      if(state.step===2&&state.draft.topic==='free'&&!state.draft.wish.trim()){tell('知りたいことを一文書いてください。',true);focus('#rd-wish');return;}
      cancelJob();state.step=Math.min(3,state.step+1);state.consent=false;render();focus('#rd-view-title');
    }
    else if(name==='back-step'){cancelJob();state.step=Math.max(1,state.step-1);state.consent=false;render();focus('#rd-view-title');}
    else if(name==='demo')loadDemo(button.dataset.rdDemo);
    else if(name==='discover')sendRequest({intent:'discover',consultation:consultation()},'discover');
    else if(name==='retry-capability')checkCapability();
    else if(name==='cancel-ai'){cancelJob();render();}
    else if(name==='resume'||name==='results'){cancelJob();state.view='results';state.path=[];state.panel=null;render();focus('#rd-view-title');}
    else if(name==='select'||name==='related')selectRoute(key);
    else if(name==='breadcrumb'){const index=Number(button.dataset.rdDepth);startView('detail',key,state.path.slice(0,index+1));}
    else if(name==='back-view'){cancelJob();const previous=state.back.pop();if(previous)Object.assign(state,{view:previous.view,selected:previous.selected,path:previous.path});else state.view='results';state.panel=null;render();focus('#rd-view-title');}
    else if(name==='compare'||name==='keep'){
      const collection=state[name];if(!state.graph.has(key))return;
      if(collection.includes(key))state[name]=collection.filter(item=>item!==key);
      else if(collection.length>=(name==='compare'?2:6)){tell(name==='compare'?'比較は2つまでです。いま選んだ候補を一つ外してから選んでください。':'残せる候補は6つまでです。必要な候補を読み比べてください。',true);return;}
      else collection.push(key);
      render();focus('[data-rd-action="'+name+'"][data-rd-route="'+key+'"]');
    }
    else if(name==='show-compare'){if(state.compare.length===2)startView('compare');}
    else if(name==='show-kept'){if(state.keep.length)startView('kept');}
    else if(name==='edit-consultation'){cancelJob();state.view='wizard';state.panel=null;state.consent=false;render();focus('#rd-view-title');}
    else if(name==='expand'){
      const entry=state.graph.get(key);if(!entry)return;
      if(entry.children.length){entry.revealed=true;render();focus('#rd-children');}
      else if(entry.origin==='demo'){tell('この固定デモでは、ここまでを用意しています。関連する方向を読むか、ほかの候補と比べてみてください。');if(canUseAI()){state.panel={intent:'expand',question:state.graph.get(state.selected)?.questionDraft||'',consent:false};render();focus('#rd-ai-panel');}}
      else if(canUseAI()){state.panel={intent:'expand',question:state.graph.get(state.selected)?.questionDraft||'',consent:false};render();focus('#rd-ai-panel');}
      else tell('AIは未接続のため、新しい候補は追加できません。今ある候補の比較・確認を続けられます。',true);
    }
    else if(name==='prepare-ai'){state.panel={intent:'expand',question:state.graph.get(state.selected)?.questionDraft||'',consent:false};render();focus('#rd-ai-panel');}
    else if(name==='close-panel'){cancelJob();state.panel=null;render();focus('#rd-view-title');}
    else if(name==='send-panel'){
      if(!state.panel?.consent)return;
      if(state.panel.intent==='ask'&&!state.panel.question.trim()){tell('聞きたいことを一文書いてください。',true);focus('#rd-question');return;}
      sendRequest(panelRequest(),'append');
    }
    else if(name==='transfer'){
      const chosen=routes(state.keep.length?state.keep:state.selected?[state.selected]:[]);if(!chosen.length)return;
      try{const transfer=createDiscoveryTransfer(chosen.map(entry=>({...entry.route,id:entry.key})),{question:topicName((state.consultation||consultation()).topic)+'で見つけた候補を、どう比べる？',origins:chosen.map(entry=>entry.origin)});if(onTransfer(transfer)===false)tell('図への移動を取り消しました。候補はそのまま残っています。');}
      catch{tell('図を作るための内容を確認できませんでした。候補はそのまま残っています。',true);}
    }
  });
  render();checkCapability();
  return {
    open({topic,demo}={}) {
      if(topic&&discoveryTopics.some(item=>item.id===topic)){
        if(state.draft.topic&&state.draft.topic!==topic&&(state.draft.wish||state.draft.situation||state.draft.conditions.length||state.draft.conditionText)&&!confirm('相談のテーマを変えますか？入力した文章と、表示中の候補は残ります。'))return;
        cancelJob();state.draft.topic=topic;state.step=1;state.view='wizard';state.consent=false;state.panel=null;render();
      }else render();
      if(demo)loadDemo(demo);
      if(state.capability==='checking'&&!state.capController||state.capability==='error')checkCapability();
    },
    pause() {cancelJob();state.capSequence++;state.capController?.abort();state.capController=null;if(state.capability==='checking')state.capability='error';state.consent=false;if(state.panel)state.panel.consent=false;}
  };
}
