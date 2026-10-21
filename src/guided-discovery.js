import {validateGuideRequest,validateGuideResult,MAX_GUIDE_RESULT_BYTES} from './guide-model.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initialQuestion=()=>({id:'start',text:'今、まず分かるようになりたいのは、どんなことですか？',why:'知りたいことに合わせて、説明や道の見方を変えるためです。',multiple:false,choices:[{id:'overview',label:'どんな道があるか知りたい'},{id:'university',label:'大学に行く意味を考えたい'},{id:'compare',label:'気になる道を比べたい'},{id:'approach',label:'やりたいことへの進み方'},{id:'uncertain',label:'まだうまく言えない'}]});
const actionLabels={ask:'もう少し聞きたいこと',explain:'まず、道の中身を知る',show_routes:'今の情報で道を見る',compare:'比べるときの見方',suggest_trial:'小さく確かめること',summarize:'ここまでの整理'};
const button=(action,label,extra='',disabled=false)=>'<button type="button" data-guide-action="'+action+'" '+extra+(disabled?' disabled':'')+'>'+esc(label)+'</button>';

// Runtime answers live only here. Every external request has its own preview,
// consent and revision token; no renderer, file restore or map visit sends them.
export function mountGuidedDiscovery(container,{onMap=()=>{},onUpdate=()=>{},onAvailability=()=>{},getRouteIds=()=>[]}={}){
  const state={revision:0,answers:[],corrections:[],question:initialQuestion(),choice:null,draft:'',response:null,summary:'',requestsUsed:0,stale:false,correspondence:'included',stage:'question',goal:'continue',configured:null,error:'',notice:'',correctionTarget:null,correctionDraft:'',editingId:null,suspendedQuestion:null};
  let requestToken=0,controller=null,timeout=null,serial=0,capabilityController=null;
  const $=selector=>container.querySelector(selector);
  function nextId(prefix){const used=new Set([...state.answers,...state.corrections].map(item=>item.id));let id;do{id=prefix+'-'+(++serial);}while(used.has(id));return id;}
  function focus(selector){const target=$(selector);if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}}
  function abort(){requestToken++;if(controller)controller.abort();controller=null;clearTimeout(timeout);timeout=null;}
  function changed(){state.revision++;state.stale=!!state.response;state.error='';onUpdate(getSessionState());}
  function getSessionState(){const response=state.response;return {summary:state.summary,userCorrections:structuredClone(state.corrections),statements:structuredClone(response?.statements||[]),routes:structuredClone(response?.routes||[]),additionalIdeas:structuredClone(response?.additionalIdeas||[]),nextActions:structuredClone(response?.nextActions||[]),unknowns:structuredClone(response?.unknowns||[]),conversation:state.correspondence==='not_saved'?null:{answers:structuredClone(state.answers),corrections:structuredClone(state.corrections)},requestsUsed:state.requestsUsed,stale:state.stale,correspondence:state.correspondence};}
  function requestBody(){return {intent:'guide',revision:state.revision,answers:structuredClone(state.answers),corrections:structuredClone(state.corrections),context:{routeIds:getRouteIds().slice(0,6),goal:state.goal}};}
  function understanding(){
    const response=state.response;if(!response)return '';
    const refs=ids=>ids.map(id=>state.answers.find(a=>a.id===id)||state.corrections.find(c=>c.id===id)).filter(Boolean).map(item=>item.text||'分からない・回答なし');
    return '<section class="guide-understanding"><h3>AIがどう理解したか</h3><p class="guide-small">本人の発言からの解釈です。違うところは直せます。</p>'+(state.stale?'<p class="guide-stale" role="status">回答・条件の変更があるため、以前の説明は見直しが必要です。候補や本人メモは残しています。</p>':'')+(state.correspondence==='not_saved'?'<p class="guide-stale">元の回答はこのファイルに保存されていません。回答との対応関係は未確認です。新しい相談では、必要なことを改めて伝えられます。</p>':'')+response.statements.map(item=>'<article><span class="guide-source">'+(item.kind==='unknown'?'未確認':'AIの解釈')+'</span><p>'+esc(item.text)+'</p>'+button('correct','この理解を直す','data-guide-statement="'+esc(item.id)+'"')+(refs(item.answerIds).length?'<details><summary>関係する本人の発言</summary><ul>'+refs(item.answerIds).map(text=>'<li>'+esc(text)+'</li>').join('')+'</ul></details>':'')+'</article>').join('')+(state.corrections.length?'<div class="guide-corrections"><h4>本人による訂正</h4><ul>'+state.corrections.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul></div>':'')+(response.unknowns.length?'<details><summary>まだ分からないこと</summary><ul>'+response.unknowns.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></details>':'')+'</section>';
  }
  function questionForm(question){
    const next='<button type="submit" class="guide-primary flow-primary"'+(state.configured!==true||state.requestsUsed>=12?' disabled':'')+'>この内容で続ける →</button><p class="guide-small guide-next-note">次に、AIへ送る内容を確認します。</p>';
    return '<form id="guide-answer-form"><fieldset><legend>'+esc(question.text)+'</legend>'+(state.editingId?'<p class="guide-pause-note">以前の回答を書き直しています。'+button('cancel-edit','書きかけの質問へ戻る')+'</p>':'')+'<p class="guide-small">一つ選ぶか、自分の言葉で話せます。</p><div class="guide-choices">'+question.choices.map(choice=>'<div class="guide-choice-row"><button type="button" data-guide-choice="'+esc(choice.id)+'" aria-pressed="'+(state.choice===choice.id)+'">'+esc(choice.label)+'</button>'+(state.choice===choice.id?'<div class="guide-choice-next">'+next+'</div>':'')+'</div>').join('')+'</div><div class="guide-free-input"><label for="guide-answer">自分の言葉で話す・補う（任意）</label><textarea id="guide-answer" maxlength="600" rows="3" placeholder="例：大学で何をするのか、まだよく知りません。">'+esc(state.draft)+'</textarea></div>'+(!state.choice?'<div class="guide-answer-next">'+next+'</div>':'')+'<div class="guide-answer-alternatives">'+button('unknown','まだ分からない')+'<details><summary>答えにくいときは</summary>'+button('different','どれも違う')+button('skip','この問いを飛ばして道を見る')+'</details><details><summary>なぜこれを聞くの？</summary><p>'+esc(question.why)+'</p></details></div></fieldset></form>';
  }
  function render(){
    container.classList.toggle('guide-initial',!state.response&&state.answers.length===0);
    const openQuestions=['.guide-next-question','.guide-inactive-question'].filter(selector=>container.querySelector(selector)?.open);
    const question=state.question,interactive=state.stage==='question',unavailable=state.configured===false;
    const routesFirst=interactive&&!state.editingId&&!state.correctionTarget&&!!state.response&&(state.response.action==='explain'||state.answers.length>=2||!question);
    const nextMap=interactive&&unavailable;
    const questionMarkup=question?questionForm(question):'';
    container.innerHTML='<section class="guide-paper" aria-labelledby="guide-title"><p class="guide-kicker">まず、いまの迷いから</p><h2 id="guide-title" tabindex="-1">'+(state.stage==='preview'?'送る前に、内容を確かめる':state.response?actionLabels[state.response.action]:'何から知りたいですか？')+'</h2><p class="guide-small guide-opening-note">'+(state.response?'話したことを手がかりに、いくつかの道を見ていきます。':'まだ決まっていなくて大丈夫です。')+'</p><p id="guide-capability" role="status">'+(state.configured===null?'AIとの接続設定を確認しています。':state.configured?'送信前に、毎回内容と同意を確認します。':'AIは現在利用できません。用意された道は、相談せずに見られます。')+'</p>'+
      (state.response?'<div class="guide-explanation"><span class="guide-source">AIの説明・まだ確認が必要な内容を含みます</span><p>'+esc(state.response.explanation)+'</p></div>':'<p class="guide-source">共通の質問です。入力だけでは送信しません。</p>')+
      '<p id="guide-error" class="guide-error" role="alert" tabindex="-1">'+esc(state.error)+'</p><p id="guide-status" role="status">'+esc(state.notice)+'</p>'+
      (state.stage==='preview'?preview():state.stage==='loading'?'<div class="guide-loading" role="status"><p>いまの話を整理しています。取り消しても、回答は画面に残ります。</p>'+button('cancel','送信を取り消す')+'</div>':nextMap?'<div class="guide-stage-next">'+button('map','用意された道を見てみる →','class="guide-primary flow-primary"')+'<p>大学・仕事・専門的な学びなどを、自分で見て比べられます。</p></div><details class="guide-inactive-question"><summary>最初の質問も見てみる</summary>'+questionMarkup+'</details>':routesFirst?'<div class="guide-stage-next">'+button('prepare-routes','ここまでの話から、道を見る →','class="guide-primary flow-primary"',state.configured!==true||state.requestsUsed>=12)+'<p>すべて答え終えなくても、いったん道を見ながら考えられます。</p></div>'+(question?'<details class="guide-next-question"><summary>もう少し話してから道を見る（任意）</summary>'+questionMarkup+'</details>':''):questionMarkup||'<p>ここまでの話をもとに、道の中身を見てみましょう。</p>')+
      (!nextMap?'<div class="guide-map-entry">'+button('map','相談を待たず、全体の道を見る')+'</div>':'')+
      (interactive&&!unavailable?'<details class="guide-more-actions"><summary>ほかの進め方・追加の相談</summary><div class="guide-secondary-actions">'+(!question?button('continue','もう少し相談する','',state.requestsUsed>=12):'')+(!routesFirst?button('prepare-routes','ここまでの話から、道を見る','',state.requestsUsed>=12):'')+button('explain','説明や具体例を聞く','',state.requestsUsed>=12)+button('trial','小さく試すことを考える','',state.requestsUsed>=12)+button('compare','選んだ二つをAIと比べる','',getRouteIds().length<2||state.requestsUsed>=12)+button('summarize','ここまでを整理する','',state.requestsUsed>=12)+'</div></details>':'')+
      (state.requestsUsed>=12?'<p class="guide-stale">この相談のAI送信は12回までです。道を見る・比べる・ファイルに残す操作は続けられます。</p>':'')+
      '<details class="guide-answer-history"><summary>話した内容を振り返る・直す（'+state.answers.length+'件）</summary>'+state.answers.map(item=>'<article><p>'+esc(item.question)+'</p><p><strong>本人の回答：</strong>'+esc(item.text||({unknown:'分からない',skipped:'スキップ'}[item.state]||'回答なし'))+'</p>'+button('edit-answer','この回答を直す','data-guide-answer-id="'+esc(item.id)+'"')+'</article>').join('')+'</details>'+(state.suspendedQuestion&&!state.editingId?'<p class="guide-pause-note">書きかけの回答は画面内に残っています。'+button('resume-draft','中断した回答へ戻る')+'</p>':'')+understanding()+
      (state.correctionTarget?'<form id="guide-correction-form"><label for="guide-correction">違うところを、自分の言葉で直す</label><textarea id="guide-correction" maxlength="300" rows="3">'+esc(state.correctionDraft)+'</textarea><p class="guide-small">まず画面内に残します。AIへは、改めて確認してから送ります。</p><div class="guide-actions"><button type="submit">訂正を画面に反映する</button>'+button('cancel-correction','訂正をやめる')+'</div></form>':'')+
      '<details class="guide-privacy"><summary>送信・保存について</summary><p>氏名・学校名・連絡先・家計の具体額は不要です。回答は通常この画面のメモリだけに保持します。外部AIへ送るときは、毎回プレビューと同意を求めます。アプリの保存とは別に、API提供者側の保持条件が適用されます。</p></details></section>';
    for(const selector of openQuestions){const disclosure=container.querySelector(selector);if(disclosure)disclosure.open=true;}
  }

  function refreshCapabilityView(){
    // The connection check may finish after someone has started navigating or
    // typing. Restore their current control, rather than returning them to the
    // beginning or dropping keyboard focus when this view is rebuilt.
    const active=document.activeElement,inside=container.contains(active);
    const selection=inside&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
    const identity=inside?{id:active.id,choice:active.dataset?.guideChoice,action:active.dataset?.guideAction,tag:active.tagName,label:active.textContent}:null;
    render();
    if(!identity)return;
    const candidates=[...container.querySelectorAll('[id],[data-guide-choice],[data-guide-action],button,summary')];
    const target=candidates.find(item=>identity.id?item.id===identity.id:identity.choice?item.dataset.guideChoice===identity.choice:identity.action?item.dataset.guideAction===identity.action:item.tagName===identity.tag&&item.textContent===identity.label);
    for(let disclosure=target?.closest('details');disclosure;disclosure=disclosure.parentElement?.closest('details'))disclosure.open=true;
    const next=target&&!target.disabled&&target.getClientRects().length?target:$('.guide-stage-next .flow-primary')||$('#guide-title');
    next?.focus({preventScroll:true});
    if(selection&&next===target){target.setSelectionRange(...selection);target.scrollIntoView({block:'nearest'});}
  }

  function preview(){const body=requestBody();return '<section class="guide-preview" aria-labelledby="guide-preview-title"><h3 id="guide-preview-title" tabindex="-1">今回AIへ送る内容</h3><p>これまで回答した質問と文章、本人の訂正、選んだ道のIDを送ります。地図の条件メモ・確認メモ・研究資料は自動で送りません。</p><h4>本人の回答</h4>'+(body.answers.length?'<ul>'+body.answers.map(item=>'<li><span>'+esc(item.question)+'</span><br><strong>'+esc(item.text||({unknown:'分からない',skipped:'この問いはスキップ'}[item.state]||'回答なし'))+'</strong></li>').join('')+'</ul>':'<p>回答はまだありません。一般的な入口や説明を求めます。</p>')+(body.corrections.length?'<h4>本人の訂正</h4><ul>'+body.corrections.map(item=>'<li>'+esc(item.text)+'</li>').join('')+'</ul>':'')+'<details><summary>送信するデータをそのまま確認する</summary><pre id="guide-send-preview">'+esc(JSON.stringify(body,null,2))+'</pre></details><label class="guide-consent"><input id="guide-consent" type="checkbox"> この内容を外部AIへ送ることに同意します（今回の送信のみ）</label><div class="guide-actions">'+button('send','確認した内容を送る','class="guide-primary"',state.configured!==true)+button('cancel-preview','戻って考える')+'</div></section>';}

  function prepare(goal){abort();state.error='';state.notice='';state.goal=goal;if(state.configured!==true){state.error='AIの案内は現在利用できません。全体マップから道を開けます。';state.stage='question';render();focus('#guide-error');return;}if(state.requestsUsed>=12)return;state.stage='preview';render();focus('#guide-preview-title');}
  function answer(answerState='answered'){
    if(!state.question)return;
    if(state.answers.length>=20&&!state.editingId){state.error='回答は20件までです。いったん道を見て、残したいことをメモできます。';render();return;}
    const selected=state.question.choices.find(choice=>choice.id===state.choice)?.label||'';
    let value=[selected,state.draft.trim()].filter(Boolean).join(' / ');if(answerState==='different'&&!value)value='用意された選択肢のどれも違う。';
    if(answerState==='answered'&&!value){state.error='一つ選ぶか、文章を少し書いてください。分からないまま進むこともできます。';render();focus('#guide-answer');return;}
    if(value.length>600){state.error='選んだ言葉と文章を合わせて600文字以内にしてください。';render();return;}
    if(answerState==='different'&&!value){state.notice='どれも違うときは、書ける範囲で補うか、この問いを飛ばせます。';render();focus('#guide-answer');return;}
    abort();const item={id:state.editingId||nextId('answer'),questionId:state.question.id,question:state.question.text,text:value,state:answerState};if(state.editingId){state.answers=state.answers.map(old=>old.id===state.editingId?item:old);}else state.answers.push(item);state.editingId=null;state.question=null;state.choice=null;state.draft='';changed();
    if(answerState==='skipped'){state.stage='question';state.notice='この問いは飛ばしました。今ある情報だけで全体を見ることができます。';render();onMap();return;}prepare('continue');
  }
  async function send(){
    if(!$('[id="guide-consent"]')?.checked){state.error='送る内容を確認して、今回の送信に同意してください。';$('#guide-error').textContent=state.error;focus('#guide-consent');return;}
    const body=requestBody();if(!validateGuideRequest(body)){state.error='送信内容の形式や長さを確認してください。回答は残っています。';render();focus('#guide-error');return;}
    abort();const token=++requestToken,revision=state.revision;controller=new AbortController();let timedOut=false;timeout=setTimeout(()=>{timedOut=true;controller?.abort();},55000);state.stage='loading';state.requestsUsed++;state.error='';render();
    try{
      const response=await fetch('/.netlify/functions/guide-discovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
      const raw=await response.text();if(new TextEncoder().encode(raw).length>MAX_GUIDE_RESULT_BYTES)throw new Error('回答が長すぎるため表示できませんでした。');
      let result;try{result=JSON.parse(raw);}catch{throw new Error('回答を読み取れませんでした。');}
      if(!response.ok)throw new Error(response.status===429?'接続が混み合っているか、利用上限に達しています。':response.status===503?'AIの案内は現在利用できません。':response.status===504?'回答に時間がかかっています。': 'AIの回答を受け取れませんでした。');
      if(!validateGuideResult(result,body))throw new Error('回答の形式や、道・本人の発言への参照を確認できませんでした。');
      if(token!==requestToken||revision!==state.revision)return;
      const previous=state.response,wasStale=state.stale;if(state.correspondence==='not_saved'&&previous){previous.routes=previous.routes.map(route=>({...route,reason:('一般的な入口（元の回答との対応は未確認）：'+route.reason).slice(0,600),answerIds:[]}));previous.nextActions=previous.nextActions.map(item=>({...item,answerIds:[]}));}state.response={...result,routes:result.routes.length?result.routes:previous?.routes||[],nextActions:result.nextActions.length?result.nextActions:previous?.nextActions||[]};state.summary=result.explanation;state.question=result.question;state.stale=!!(wasStale&&previous&&((!result.routes.length&&previous.routes.length)||(!result.nextActions.length&&previous.nextActions.length)));state.correspondence='included';state.stage='question';state.notice='AIの説明です。本人の発言と解釈、未確認の条件を分けて読んでください。';render();onUpdate(getSessionState());
      if(['show_routes','compare'].includes(result.action))onMap({attention:true,compare:result.action==='compare'});else focus('#guide-title');
    }catch(error){if(token!==requestToken||revision!==state.revision)return;state.stage='question';state.error=(timedOut?'回答に時間がかかっています。':error.name==='AbortError'?'送信を取り消しました。':error.message)+' 回答・候補・メモは残っています。';render();focus('#guide-error');}
    finally{if(token===requestToken){clearTimeout(timeout);timeout=null;controller=null;}}
  }
  container.addEventListener('input',event=>{if(event.target.id==='guide-answer')state.draft=event.target.value;if(event.target.id==='guide-correction')state.correctionDraft=event.target.value;});
  container.addEventListener('submit',event=>{
    if(event.target.id==='guide-answer-form'){event.preventDefault();answer();}
    if(event.target.id==='guide-correction-form'){
      event.preventDefault();const value=state.correctionDraft.trim();if(!value){state.error='訂正したい内容を書いてください。';render();focus('#guide-correction');return;}if(state.corrections.length>=12){state.error='訂正は12件までです。今の整理をファイルに残せます。';render();return;}
      abort();const original=state.response?.statements.find(item=>item.id===state.correctionTarget);state.corrections.push({id:nextId('correction'),text:(original?'「'+original.text.slice(0,60)+'」への訂正：':'本人の訂正：')+value});state.correctionTarget=null;state.correctionDraft='';state.stage='question';changed();state.notice='本人の訂正を残しました。以前の理由は見直しが必要です。AIへはまだ送信していません。';render();focus('#guide-status');
    }
  });
  container.addEventListener('click',event=>{
    const choice=event.target.closest('[data-guide-choice]');if(choice){const id=choice.dataset.guideChoice;state.choice=state.choice===id?null:id;render();focus('[data-guide-choice="'+id+'"]');if(state.choice)$('.guide-choice-next .flow-primary')?.scrollIntoView({block:'nearest'});return;}
    const control=event.target.closest('[data-guide-action]');if(!control||control.disabled)return;
    const action=control.dataset.guideAction;
    if(action==='map'){onMap();return;}
    if(action==='cancel-edit'||action==='resume-draft'){if(state.suspendedQuestion){abort();const saved=state.suspendedQuestion;state.suspendedQuestion=null;state.question=saved.question;state.choice=saved.choice;state.draft=saved.draft;state.editingId=null;state.stage='question';render();focus('#guide-answer');}}
    else if(action==='edit-answer'){const item=state.answers.find(a=>a.id===control.dataset.guideAnswerId);if(item){abort();if(!state.editingId)state.suspendedQuestion={question:structuredClone(state.question),choice:state.choice,draft:state.draft};state.editingId=item.id;state.question={id:item.questionId,text:item.question,why:'本人の回答を直すと、次の説明や注目理由を見直すためです。',choices:[],multiple:false};state.choice=null;state.draft=item.text;state.stage='question';render();focus('#guide-answer');}}
    else if(action==='unknown')answer('unknown');
    else if(action==='different')answer('different');
    else if(action==='skip')answer('skipped');
    else if(action==='send')send();
    else if(action==='cancel'){abort();state.stage='question';state.notice='送信を取り消しました。回答やメモは残っています。';render();}
    else if(action==='cancel-preview'){state.stage='question';render();}
    else if(action==='correct'){abort();state.stage='question';state.correctionTarget=control.dataset.guideStatement;render();focus('#guide-correction');}
    else if(action==='cancel-correction'){state.correctionTarget=null;render();}
    else if(action==='continue')prepare('continue');
    else if(action==='prepare-routes')prepare('show_routes');
    else if(action==='explain')prepare('explain');
    else if(action==='trial')prepare('suggest_trial');
    else if(action==='summarize')prepare('summarize');
    else if(action==='compare')prepare('compare');
  });
  render();
  async function capability(){capabilityController?.abort();capabilityController=new AbortController();const capabilityToken=capabilityController;const timer=setTimeout(()=>capabilityToken.abort(),5000);try{const response=await fetch('/.netlify/functions/guide-discovery',{cache:'no-store',signal:capabilityToken.signal});const data=await response.json();state.configured=response.ok&&data.configured===true;}catch{state.configured=false;}finally{clearTimeout(timer);if(capabilityToken===capabilityController){refreshCapabilityView();onAvailability(state.configured===true);}}}
  capability();
  return {
    open(){render();},
    isConfigured:()=>state.configured===true,
    getLastAction:()=>state.response?.action||null,
    prepareSummary(){prepare('summarize');},
    getSessionState,
    restoreSessionState(saved){abort();state.revision++;state.answers=structuredClone(saved.conversation?.answers||[]);state.corrections=structuredClone(saved.userCorrections||saved.conversation?.corrections||[]);serial=state.answers.length+state.corrections.length+50;state.summary=saved.summary;state.response=saved.summary||saved.routes.length?{action:'summarize',explanation:saved.summary,question:null,statements:structuredClone(saved.statements),routes:structuredClone(saved.routes),additionalIdeas:structuredClone(saved.additionalIdeas),nextActions:structuredClone(saved.nextActions),unknowns:structuredClone(saved.unknowns)}:null;state.question=state.answers.length?null:initialQuestion();state.choice=null;state.draft='';state.editingId=null;state.suspendedQuestion=null;state.correctionTarget=null;state.correctionDraft='';state.requestsUsed=saved.requestsUsed;state.stale=saved.stale||saved.correspondence==='not_saved';state.correspondence=saved.correspondence;state.stage='question';state.error='';state.notice='端末ファイルから復元しました。AIへは送信していません。';render();onUpdate(getSessionState());return true;},
    pause(){abort();if(state.stage==='loading'||state.stage==='preview'){state.stage='question';state.notice='画面を移ったため、送信・同意を取り消しました。内容は残っています。';}render();}
  };
}
