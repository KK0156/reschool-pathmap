import {printMemo} from './research-print.js';
import {mountBranchConsultation} from './branch-consultation.js';
import {applyProposal} from './tree-proposal.js';
import {reflectionPrompts,addReflection,addNextStep} from './thinking-tools.js';
import {createTreeDocument,stringifyTreeDocument,readTreeFile,nodeOriginLabels} from './tree-file.js';
import {createMindMapView} from './mind-map-view.js';
import {createBlankTree,composeMemo,contextFields,optionalContextView,editorView,editNode,addNode,deleteNode,descendants} from './tree-edit.js';
import {samplePrompts} from './sample-tree.js';
import {studentSamples,featuredSampleIds,reusableLegacySampleIndices} from '../../src/student-data.js';
import {nodeTypes,escapeHtml,validateTree,renderDetail} from './tree-renderer.js';
export async function requestMindTree(memo,signal){
 const response=await fetch('/.netlify/functions/generate-tree',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memo}),signal});
 let data;try{data=await response.json();}catch{throw new Error('接続先を確認できませんでした。');}
 if(!response.ok)throw new Error(data.error||'AI生成に失敗しました。');
 if(!validateTree(data,{maxNodes:40}))throw new Error('ツリーの形式を確認できませんでした。');
 return data;
}

export function mountTree(container,{defaultSample=0,studentMode=false}={}){
container.classList.toggle('student-tree',studentMode);
const $=selector=>container.querySelector(selector);
if(!$('#ai-availability'))$('#generate').insertAdjacentHTML('beforebegin','<p id="ai-availability" role="status">AI接続を確認しています。</p>');
$('#generate').disabled=true;
$('#privacy-note').insertAdjacentHTML('beforebegin',optionalContextView);
const context=()=>Object.fromEntries(contextFields.map(([id])=>[id,$('#context-'+id).value]));
const completeMemo=()=>composeMemo($('#memo').value,context());
$('#tree-container').tabIndex=-1;
const mapView=createMindMapView($('#tree-container'),{simplified:studentMode});
if($('#manual-from-memo')){const localActions=document.createElement('div');localActions.className='local-actions actions';$('.memo-footer').after(localActions);localActions.append($('#manual-from-memo'),$('#sample-without-api'));}
const fileTools=document.createElement('section');fileTools.className='tree-file-tools';fileTools.setAttribute('aria-label','ツリーを端末で保存・復元');
fileTools.innerHTML=`<div class="file-actions"><button type="button" id="start-blank-tree">新しい図を自分で作る</button><button type="button" id="export-tree" disabled>図をファイルに保存（JSON）</button><label class="file-picker" for="import-tree">保存した図を開く<input id="import-tree" type="file" accept=".json,application/json"></label></div><p>保存・復元は自分の端末内だけで行います。相談メモと成績などの任意欄はファイルに含めません。ツリーに個人情報が含まれていないか、保存前に確認してください。自動保存・サーバーへのアップロードは行いません。</p><p id="file-status" role="status"></p>`;
if(studentMode){
 fileTools.innerHTML='<div class="file-actions"><button type="button" id="export-tree" disabled>保存（JSON）</button><label class="file-picker" for="import-tree">保存した図を開く<input id="import-tree" type="file" accept=".json,application/json"></label><button type="button" id="workspace-undo" disabled>元に戻す</button></div><details><summary>保存の説明・新しい図</summary><p>保存は自分の端末内で行います。相談メモと任意欄は含みません。自動保存はしないため、続きはJSONで保存してください。</p><button type="button" id="start-blank-tree">新しい図を自分で作る</button></details><p id="file-status" role="status"></p>';
}
$('#mind-tree').insertBefore(fileTools,$('#tree-status'));

const summaryTools=document.createElement('div');summaryTools.className='summary-tools';summaryTools.innerHTML='<button type="button" id="copy-summary" disabled>相談メモをコピー</button><p id="copy-status" role="status"></p><textarea id="copy-fallback" aria-label="コピーする相談メモ" rows="8" readonly hidden></textarea>';
if(studentMode){const saveAgain=document.createElement('button');saveAgain.type='button';saveAgain.id='export-tree-bottom';saveAgain.disabled=true;saveAgain.textContent='図を保存して、あとで続きを開く（JSON）';summaryTools.prepend(saveAgain);saveAgain.addEventListener('click',()=>{$('#export-tree').click();$('#copy-status').textContent=$('#file-status').textContent;});}
$('#summaries').append(summaryTools);
const state={tree:null,selected:null,source:null,pending:false,revision:0,sampleIndex:defaultSample,edited:false,editing:false,undo:null,nodeOrigins:{},configured:false,generation:null,studentSampleId:null,memoBaseline:''};
let controller=null,capabilityController=null;
const branchHost=document.createElement('section');branchHost.className='branch-tools';branchHost.hidden=studentMode;$('#node-detail').after(branchHost);
const branch=mountBranchConsultation(branchHost,{hideUnavailable:studentMode,getState:()=>state,isConfigured:()=>state.configured,onUnavailable:()=>{state.configured=false;updateAvailability();},onAccept:(parent,proposal)=>{const next=applyProposal(state.tree,parent,proposal);applyChange(next.tree,next.addedIds[0],true,'ai_proposal');}});
const generationReview=document.createElement('section');generationReview.id='generation-review';generationReview.hidden=true;generationReview.setAttribute('aria-label','AIから届いた新しい図の確認');$('#tree-status').after(generationReview);
const discovery=document.createElement('section');discovery.className='discovery-tools';discovery.innerHTML=`<h2>ほかの考え方も、残してみる</h2><p>AIの回答ではなく、誰でも使える問いかけです。気になるものだけ、選んだ項目につながる枝として追加できます。</p><div>${reflectionPrompts.map(p=>`<button type="button" data-reflection="${p.id}">${escapeHtml(p.label)}</button>`).join('')}</div>`;
const stepForm=document.createElement('form');stepForm.id='next-step-form';stepForm.className='next-step-form';stepForm.innerHTML='<h2>次の一歩を、自分の言葉で</h2><p>どれか一つから書けます。相手は名前ではなく「担任の先生」などの役割で書いてください。図の項目として残ります。</p>'+[['research','何を調べる？','例：大学と専門学校の授業の違い'],['person','誰に聞く？','例：進路担当の先生'],['try','何を試す？','例：公開授業を一つ見てみる'],['when','いつごろ？（任意）','例：次の面談までに']].map(([id,label,placeholder])=>`<label for="step-${id}">${label}</label><input id="step-${id}" name="${id}" maxlength="200" placeholder="${placeholder}" autocomplete="off">`).join('')+'<p id="step-error" role="status"></p><button type="submit">この一歩を図に追加する</button>';
if(studentMode){
 const reflectionDrawer=document.createElement('details');reflectionDrawer.className='reflection-drawer';reflectionDrawer.innerHTML='<summary>別の考え方を足したいとき</summary>';reflectionDrawer.append(discovery);$('#summaries').before(stepForm,reflectionDrawer);
}else $('#summaries').before(discovery,stepForm);
stepForm.tabIndex=-1;
const printButton=document.createElement('button');printButton.type='button';printButton.id='print-summary';printButton.textContent='相談メモを印刷 / PDFにする';printButton.disabled=true;summaryTools.prepend(printButton);const printOptions=document.createElement('label');printOptions.innerHTML='<input type="checkbox" id="print-details"> 全項目の詳細も印刷する（長くなります）';summaryTools.append(printOptions);
const printSheet=document.createElement('section');printSheet.id='tree-print';printSheet.setAttribute('aria-label','印刷用の相談メモ');container.append(printSheet);
function updateAvailability(){
 $('#generate').disabled=state.pending||!state.configured;
 $('#ai-availability').textContent=state.configured?'AI接続は設定済みです。送る内容を確認してから使えます。':studentMode?'AIは未接続です。相談例・手直し・保存はそのまま使えます。':'AI接続は未設定、または確認できません。例から試す・自分で図を作る操作は使えます。';
 if(studentMode)branchHost.hidden=!state.configured;
 branch.refresh();
}
async function checkCapability(){
 capabilityController?.abort();const current=new AbortController();capabilityController=current;const timeout=setTimeout(()=>current.abort(),5000);
 try{const response=await fetch('/.netlify/functions/generate-tree',{signal:current.signal});const data=await response.json();if(capabilityController===current)state.configured=response.ok&&data.configured===true;}catch{if(capabilityController===current)state.configured=false;}finally{clearTimeout(timeout);}if(capabilityController===current)updateAvailability();
}
const retryCapability=document.createElement('button');retryCapability.type='button';retryCapability.className='text-button';retryCapability.id='check-ai';retryCapability.textContent='AIの接続状態を確認し直す';$('#ai-availability').after(retryCapability);retryCapability.addEventListener('click',checkCapability);
checkCapability();

const scrollTo=element=>element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
const audienceNames={general:'一般向けの相談例',developer:'開発者の研究例'};
if(studentMode){
 const card=p=>`<button type="button" class="student-sample-card" data-student-sample="${escapeHtml(p.id)}"><span>${escapeHtml(p.category)}</span><b>${escapeHtml(p.label)}</b><small>例の図を開く →</small></button>`;
 const featured=featuredSampleIds.map(id=>studentSamples.find(p=>p.id===id)).filter(Boolean);
 $('#sample-prompts').innerHTML=`<div class="student-sample-grid">${featured.map(card).join('')}</div><details class="more-student-samples"><summary>ほかの相談例を見る</summary><div class="student-sample-grid">${studentSamples.filter(p=>!featuredSampleIds.includes(p.id)).map(card).join('')}</div></details><details class="more-student-samples legacy-student-samples"><summary>以前の相談例も読む</summary><p>以前の試作品から残した一般向けの例です。架空の例を、自分の言葉に書き換えて使えます。</p><div class="student-sample-grid">${reusableLegacySampleIndices.map(index=>`<button type="button" class="student-sample-card" data-legacy-student-sample="${index}"><span>${escapeHtml(samplePrompts[index].category)}</span><b>${escapeHtml(samplePrompts[index].label)}</b><small>例の図を開く →</small></button>`).join('')}</div></details>`;
}else $('#sample-prompts').innerHTML=Object.entries(audienceNames).map(([audience,title])=>`<section class="sample-audience"><h3>${title}</h3><p>${audience==='general'?'進路や学校生活など、身近な相談から選べます。':'RE:School・ROOTS・CoDなど、開発者の研究デモです。一般の相談例とは分けて扱います。'}</p><div class="sample-options">${samplePrompts.map((p,i)=>p.audience===audience?`<article class="sample-option"><h4>${escapeHtml(p.label)}</h4><div><button type="button" class="sample-prompt" data-prompt="${i}">この例をメモに入れる</button><button type="button" class="text-button" data-preview="${i}">ツリーの例を見る</button></div></article>`:'').join('')}</div></section>`).join('');
if($('#tree-example')){
 $('#tree-example').innerHTML=Object.entries(audienceNames).map(([audience,title])=>`<optgroup label="${title}">${samplePrompts.map((p,i)=>p.audience===audience?`<option value="${i}">${escapeHtml(p.label)}</option>`:'').join('')}</optgroup>`).join('');
 $('#tree-example').value=String(state.sampleIndex);
 $('#preview-tree-example').addEventListener('click',()=>{state.sampleIndex=Number($('#tree-example').value);sample();});
}
$('#tree-legend').innerHTML=Object.entries(nodeTypes).map(([type,label])=>`<span class="type-${type}">${label}</span>`).join('');
function display(tree,source,message){
 $('#export-tree').disabled=false;if($('#export-tree-bottom'))$('#export-tree-bottom').disabled=false;$('#copy-summary').disabled=false;$('#print-summary').disabled=false;$('#copy-status').textContent='';$('#copy-fallback').hidden=true;
 if($('#tree-example')&&source==='sample')$('#tree-example').value=String(state.sampleIndex);
 mapView.reset();state.tree=structuredClone(tree);state.source=source;state.nodeOrigins=Object.fromEntries(tree.nodes.map(n=>[n.id,source]));state.edited=false;state.editing=false;state.undo=null;state.selected=tree.nodes.find(n=>n.parent===null).id;
 $('#tree-empty').hidden=true;$('#map-workspace').hidden=false;
 $('#tree-status').textContent=message;
 renderOverview();
 renderMap();renderSummaries();
 if(studentMode){container.classList.add('has-tree');const examples=$('#student-example-start');if(examples)examples.hidden=true;$('#consultation').open=false;$('#node-detail').dataset.open='false';$('#map-workspace').tabIndex=-1;$('#map-workspace').focus({preventScroll:true});scrollTo($('#map-workspace'));}
 else{$('#mind-tree').focus({preventScroll:true});scrollTo($('#mind-tree'));}
 notifyContentChange();
}
function renderOverview(){
 const tree=state.tree,source=state.source;
 if(studentMode){const root=tree.nodes.find(n=>n.parent===null);const choices=tree.nodes.filter(n=>n.parent===root.id&&n.type==='project');$('#tree-overview').innerHTML=`<span>${source==='sample'?'架空の相談例・自分の言葉に書き換えられます':source==='manual'?'自分で作成中':source==='imported'?'保存ファイルから復元':'AIの提案・内容は要確認'}${state.edited?' / 手直し済み':''}</span><div class="student-overview-center"><span>中心の問い</span><h3><button type="button" data-open-node="${root.id}">${escapeHtml(tree.core_question)}</button></h3></div>${choices.length?`<div class="student-main-branches" aria-label="主な選択肢。押すと内容が開きます">${choices.slice(0,6).map(n=>`<button type="button" data-open-node="${n.id}">${escapeHtml(n.label)}</button>`).join('')}</div>`:''}`;return;}
 $('#tree-overview').innerHTML=`<span>${state.edited?'自分で手直し済み / ':''}${source==='sample'?'サンプルツリー / 入力メモの分析結果ではありません':source==='imported'?'JSONから復元したツリー / 出典・内容は未確認':source==='manual'?'自分で書き始めたツリー / 内容は未確認':'メモをもとに生成したツリー / 内容は要確認'}</span><h3>${escapeHtml(tree.core_question)}</h3><p>${escapeHtml(tree.summary)}</p>${tree.nodes.some(n=>n.type==='project')?`<div class="option-entrances"><p>気になる選択肢を押すと、内容を読めます。</p>${tree.nodes.filter(n=>n.type==='project').slice(0,6).map(n=>`<button type="button" data-open-node="${n.id}">${escapeHtml(n.label)}</button>`).join('')}</div>`:''}`;
}
function renderMap(){
 mapView.render(state.tree,state.selected);
 for(const button of container.querySelectorAll('.tree-node'))button.dataset.origin=state.nodeOrigins[button.dataset.node]||'imported';
 const origin=state.nodeOrigins[state.selected]||'imported',node=state.tree.nodes.find(n=>n.id===state.selected);
 const actions=`<div class="edit-actions"><button type="button" class="secondary" data-edit-start>この項目を書き直す</button><button type="button" class="secondary" data-edit-add>ここに枝を加える</button>${state.configured?'<button type="button" class="secondary" data-branch-open>この項目をAIと考える</button>':''}${node.parent!==null?'<button type="button" class="text-button" data-edit-delete>この枝を消す</button>':''}${state.undo?'<button type="button" class="text-button" data-edit-undo>直前の変更を戻す</button>':''}</div>`;
 $('#node-detail').innerHTML=state.editing?(studentMode?studentEditorView(state.tree,state.selected):editorView(state.tree,state.selected)):`<button type="button" class="secondary" data-tree-go="tree-container">← 図に戻る</button><p class="node-origin">${state.source==='imported'?'ファイルに記録された由来：':''}${nodeOriginLabels[origin]} · 記載内容は要確認</p>${actions}${renderDetail(node,origin)}<p class="caption">手直しは自動保存・送信されません。残したいときはJSONで保存してください。再読み込みすると画面から消えます。</p>`;
 if(studentMode&&$('#workspace-undo'))$('#workspace-undo').disabled=!state.undo;
 branch.refresh();
}
function studentEditorView(tree,id){
 const template=document.createElement('template');template.innerHTML=editorView(tree,id);const form=template.content.querySelector('form');
 form.querySelector('p').textContent='変えたいところだけ書き換えて、下の「変更を反映する」を押してください。';
 const more=document.createElement('details');more.className='node-edit-more';more.innerHTML='<summary>項目の種類・つなぐ先・資料やリスクも編集する</summary>';
 for(const field of ['edit-type','edit-parent','edit-evidence','edit-risk']){const label=form.querySelector(`[for="${field}"]`),control=form.querySelector('#'+field);if(label&&control)more.append(label,control);}
 form.querySelector('#edit-error').before(more);return template.innerHTML;
}
function renderSummaries(){
 $('#copy-status').textContent='';$('#copy-fallback').hidden=true;$('#copy-fallback').value='';
 preparePrint();
 const t=state.tree;const nodes=type=>t.nodes.filter(n=>n.type===type);
 const list=items=>items.length?`<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:'<p>未確認。メモや資料で確認する必要があります。</p>';
 const actions=[...new Set([...nodes('action').map(n=>n.detail),...t.nodes.map(n=>n.next_action)])].slice(0,12);
 const evidence=nodes('evidence').map(n=>`${n.label}：${n.evidence}（内容・出典は要確認）`);
 $('#summary-content').innerHTML=`<article><span>いま考えている問い</span><h3>${escapeHtml(t.core_question)}</h3><p>${escapeHtml(t.summary)}</p></article><article><span>残している選択肢</span>${list(nodes('project').map(n=>`${n.label}：${n.detail}`))}</article><article><span>次に調べること・試すこと</span>${list(actions)}</article><article><span>相談で伝えるためのメモ</span><p>いま考えていること：${escapeHtml(t.core_question)}</p><p>${escapeHtml(t.summary)}</p>${list(nodes('person').map(n=>`${n.label}に聞きたいこと：${n.next_action}`))}<p class="caption">まだ考え途中のメモです。分かっていることと、これから確かめることを分けて相談できます。${studentMode?'':'研究デモでは、CoD活動説明の下書きにも使えます。'}</p></article><article><span>証拠の確認リスト</span>${list(evidence.length?evidence:t.nodes.filter(n=>n.evidence!=='未確認').map(n=>`${n.label}：${n.evidence}（要確認）`))}<p class="caption">資料の出典・日付・確認できた内容・反対の結果がないかを確認してください。サンプルの記載は資料の存在を保証しません。</p></article><article><span>作れそうな成果物</span>${list(nodes('output').map(n=>`${n.label}：${n.detail}`))}</article>`;
 if($('#today-summary')){
 const brief=(title,items)=>`<div><dt>${title}</dt><dd>${list(items)}</dd></div>`;
 const rootNode=t.nodes.find(n=>n.parent===null);
 const choices=nodes('project').map(n=>n.label),people=nodes('person').map(n=>n.label),missing=nodes('evidence').map(n=>`${n.label}（${n.evidence.includes('未確認')?'未確認':'出典・内容の確認が必要'}）`);
 const todayActions=[...new Set([...nodes('action').filter(n=>n.parent===rootNode.id).map(n=>n.detail),rootNode.next_action])];
 $('#today-summary').innerHTML=`<span class="clip" aria-hidden="true"></span><h2>今日の整理</h2><p class="caption">${state.source==='sample'?'架空のサンプルを整理したメモです。':state.source==='imported'?'端末から復元した地図の整理です。':state.source==='manual'?'自分で書いた地図の整理です。':'AIが作った地図を整理したメモです。'}判断や資料の検証を代わりに行うものではありません。</p><dl>${brief('今日の中心問い',[t.core_question])}${brief('残すべき選択肢',choices.slice(0,6))}${brief('足りない証拠',missing.slice(0,4))}${brief('相談すべき人',people.slice(0,4))}${brief('次の一歩',todayActions.slice(0,2))}</dl><p class="caption">重要な判断は、信頼できる大人と一緒に。名前や連絡先を交換する機能はありません。</p>`;
 }

}
function cancel(){state.revision++;controller?.abort();state.pending=false;state.generation=null;generationReview.hidden=true;generationReview.replaceChildren();$('#generate').disabled=!state.configured;$('#generate').textContent='AIで相談を図にする';branch.cancel();queueMicrotask(()=>branch.refresh());}
const shouldConfirm=()=>state.edited||state.editing||(state.tree&&state.source!=='sample');
function sample(message='サンプルツリーを表示しています。入力したメモをAIで分析した結果ではありません。'){
 if(shouldConfirm()&&!confirm('別の例を表示すると、手直ししたツリーを置き換えます。続けますか？'))return;
 cancel();display(samplePrompts[state.sampleIndex].tree,'sample',message);
}
$('#show-sample')?.addEventListener('click',()=>sample());
$('#sample-without-api').addEventListener('click',()=>studentMode?loadStudentSample(state.studentSampleId||featuredSampleIds[0]):sample());
$('#sample-prompts').addEventListener('click',e=>{
 const student=e.target.closest('[data-student-sample]');if(student){loadStudentSample(student.dataset.studentSample);return;}
 const legacy=e.target.closest('[data-legacy-student-sample]');if(legacy){loadSeed(Number(legacy.dataset.legacyStudentSample),false);return;}
 const preview=e.target.closest('[data-preview]');if(preview){state.sampleIndex=Number(preview.dataset.preview);sample();return;}
 const button=e.target.closest('[data-prompt]');if(!button)return;const memo=samplePrompts[Number(button.dataset.prompt)].memo;if($('#memo').value.trim()&&$('#memo').value!==memo&&!confirm('相談メモを例文に置き換えますか？今の図はそのまま残ります。'))return;state.sampleIndex=Number(button.dataset.prompt);
 cancel();$('#memo').value=samplePrompts[Number(button.dataset.prompt)].memo;$('#send-consent').checked=false;updateCount();if($('#memo-help'))$('#memo-help').textContent='例文を入れました。必要なところを書き換え、送信内容を確認して「AIでツリーを作る」を押してください。';$('#memo').focus();scrollTo($('#memo'));
});
container.addEventListener('tree-sample-open',e=>{const index=e.detail?.index;if(!Number.isInteger(index)||!samplePrompts[index])return;const memo=samplePrompts[index].memo;if((shouldConfirm()||($('#memo').value.trim()&&$('#memo').value!==memo))&&!confirm('今の相談メモと図を、相談例に置き換えますか？残す場合は先にファイルへ保存してください。'))return;cancel();state.sampleIndex=index;$('#memo').value=memo;$('#send-consent').checked=false;updateCount();display(samplePrompts[index].tree,'sample','架空の相談例です。自分の言葉で書き直したり、項目を加えたりして試せます。');});
function updateCount(){ $('#memo-count').textContent=`${completeMemo().length} / 3000文字（任意欄を含む）`;$('#send-preview-text').textContent=completeMemo()||'まだ入力されていません。';$('#memo-error').textContent='';$('#memo').removeAttribute('aria-invalid'); }
$('#memo-form').addEventListener('input',e=>{if(!e.target.matches('#memo,[data-context]'))return;cancel();$('#send-consent').checked=false;updateCount();if(state.tree)$('#tree-status').textContent='メモが変更されています。表示中のツリーは前のメモのもの、またはサンプルです。';});
$('#clear-all').addEventListener('click',()=>{
 if((state.tree||$('#memo').value.trim()||contextFields.some(([id])=>$('#context-'+id).value.trim()))&&!confirm('入力と図をすべて消しますか？残したい図は先にファイルに保存してください。'))return;
 cancel();state.memoBaseline='';$('#memo').value='';contextFields.forEach(([id])=>$('#context-'+id).value='');$('#send-consent').checked=false;updateCount();state.tree=null;state.nodeOrigins={};state.source=null;state.selected=null;state.undo=null;state.edited=false;state.editing=false;
 $('#export-tree').disabled=true;if($('#export-tree-bottom'))$('#export-tree-bottom').disabled=true;$('#copy-summary').disabled=true;$('#print-summary').disabled=true;$('#next-step-form').reset();$('#step-error').textContent='';printSheet.replaceChildren();$('#copy-status').textContent='';$('#copy-fallback').value='';$('#copy-fallback').hidden=true;$('#file-status').textContent='';$('#map-workspace').hidden=true;$('#tree-empty').hidden=false;$('#tree-container').replaceChildren();$('#node-detail').replaceChildren();$('#tree-overview').replaceChildren();$('#tree-status').textContent='入力とツリーを消しました。';$('#summary-content').innerHTML='<p>ツリーを作ると、まとめが表示されます。</p>';if($('#today-summary'))$('#today-summary').innerHTML='<span class="clip" aria-hidden="true"></span><h2>今日の整理</h2><p>入力とツリーを消しました。</p>';if(studentMode){container.classList.remove('has-tree');$('#student-example-start').hidden=false;$('#consultation').open=true;}$('#memo').focus();notifyContentChange();
});
$('#tree-container').addEventListener('click',e=>{
 const button=e.target.closest('[data-node]');if(!button||!state.tree)return;
 if(studentMode&&state.editing&&state.selected===button.dataset.node){openDetail();return;}
 if(state.editing&&!confirm('書き直し中の内容を破棄して、別の項目を開きますか？'))return;state.editing=false;state.selected=button.dataset.node;renderMap();
 if(mapView.isExpanded()){mapView.closeExpanded();}
 if(studentMode)openDetail();
 else if(innerWidth<1000||$('#node-detail').getBoundingClientRect().top>innerHeight-80){$('#node-detail').focus({preventScroll:true});scrollTo($('#node-detail'));}
 else $('#tree-container').querySelector(`[data-node="${state.selected}"]`).focus({preventScroll:true});
});
$('#memo-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!state.configured){updateAvailability();return;}const memo=completeMemo();
 if(!$('#memo').value.trim()||memo.length>3000){$('#memo-error').textContent=!$('#memo').value.trim()?'相談メモを書いてください。サンプルを選ぶこともできます。':'任意欄を含め、3000文字以内で書いてください。';$('#memo').setAttribute('aria-invalid','true');$('#memo').focus();return;}
 if(!$('#send-consent').checked){$('#memo-error').textContent='送信する内容を確認し、確認欄にチェックしてください。';$('#send-consent').focus();return;}
 if(state.pending)return;
 if((state.edited||state.editing)&&!confirm('新しく生成すると、手直ししたツリーを置き換えます。続けますか？'))return;
 const revision=++state.revision;controller=new AbortController();const currentController=controller;
 state.pending=true;$('#generate').disabled=true;$('#generate').textContent='メモを整理しています…';$('#memo-error').textContent='';$('#tree-status').textContent='AIがメモを整理しています。';
 const timeout=setTimeout(()=>currentController.abort(),55000);
 try{const tree=await requestMindTree(memo,currentController.signal);if(state.revision===revision){if(state.tree){state.generation=tree;generationReview.hidden=false;generationReview.innerHTML=`<h3>AIから届いた新しい図・未反映</h3><p>${escapeHtml(tree.summary)}</p><ul>${tree.nodes.filter(n=>n.parent!==null).slice(0,8).map(n=>`<li>${escapeHtml(n.label)}</li>`).join('')}</ul><p>承認すると図全体を置き換えます。既存の図は「直前の変更を戻す」で一度戻せます。</p><button type="button" data-generation-accept>承認して新しい図に置き換える</button><button type="button" data-generation-discard>今の図を残す</button>`;$('#tree-status').textContent='新しい図を受け取りました。まだ今の図は変わっていません。';scrollTo(generationReview);}else display(tree,'generated','メモからツリーを生成しました。未確認の内容は、資料や相談で確かめてください。');}}
 catch(error){if(state.revision===revision){const reason=error.name==='AbortError'?'回答に時間がかかっています。':error.message;if(state.tree){$('#tree-status').textContent=`AI生成に失敗しました。${state.source==='sample'&&!state.edited?'代わりにサンプルの図をそのまま表示しています。':'今の図と手直しは残しています。'}相談メモも消えていません。${reason}`;}else display(studentMode?(studentSamples.find(p=>p.id===state.studentSampleId)||studentSamples[0]).tree:samplePrompts[state.sampleIndex].tree,'sample',`AI生成に失敗しました。代わりにサンプルツリーを表示しています。${reason}`);}}
 finally{clearTimeout(timeout);if(state.revision===revision){state.pending=false;$('#generate').disabled=!state.configured;$('#generate').textContent='AIで相談を図にする';}}
});
function applyChange(tree,selected=state.selected,focusDetail=true,newOrigin='manual'){
 cancel();
 state.undo={tree:structuredClone(state.tree),selected:state.selected,edited:state.edited,positions:mapView.getPositions(),nodeOrigins:structuredClone(state.nodeOrigins),source:state.source};
 for(const n of tree.nodes){const old=state.tree.nodes.find(p=>p.id===n.id);if(!old)state.nodeOrigins[n.id]=newOrigin;else if(JSON.stringify(old)!==JSON.stringify(n))state.nodeOrigins[n.id]='user_edited';}
 state.nodeOrigins=Object.fromEntries(tree.nodes.map(n=>[n.id,state.nodeOrigins[n.id]||newOrigin]));state.tree=tree;state.selected=selected;state.edited=true;state.editing=false;
 renderOverview();renderMap();renderSummaries();$('#tree-status').textContent='手直しを反映しました。保存やAIへの送信は行っていません。';if(focusDetail&&!mapView.isExpanded()){if(studentMode)openDetail();else $('#node-detail').focus({preventScroll:true});}
}
$('#tree-container').addEventListener('canvas-change',()=>{cancel();state.edited=true;renderOverview();$('#tree-status').textContent='配置を変更しました。保存やAIへの送信は行っていません。';});
$('#tree-container').addEventListener('canvas-add-node',e=>{
 try{if(state.editing&&!confirm('書き直し中の内容を破棄して、新しい枝を追加しますか？'))return;const next=addNode(state.tree,e.detail.parent);next.tree=editNode(next.tree,next.id,{label:e.detail.label});applyChange(next.tree,next.id,false);mapView.setPosition(next.id,e.detail.position);renderMap();$('.mind-map-viewport').focus({preventScroll:true});$('#tree-status').textContent='キャンバスに枝を追加しました。項目をドラッグして配置できます。';}
 catch(error){const status=$('.canvas-message');if(status)status.textContent=error.message;}
});
$('#node-detail').addEventListener('click',e=>{
 try{
 if(e.target.closest('[data-branch-open]')){if(studentMode)$('#node-detail').dataset.open='false';branchHost.querySelector('details').open=true;branchHost.querySelector('#branch-intent').focus();scrollTo(branchHost);}
 else if(e.target.closest('[data-edit-start]')){cancel();state.editing=true;renderMap();$('#edit-label').focus();}
 else if(e.target.closest('[data-edit-cancel]')){state.editing=false;renderMap();$('#node-detail [data-edit-start]').focus();}
 else if(e.target.closest('[data-edit-add]')){const next=addNode(state.tree,state.selected);applyChange(next.tree,next.id);state.editing=true;renderMap();$('#edit-label').focus();}
 else if(e.target.closest('[data-edit-delete]')){const count=descendants(state.tree,state.selected).size;if(!confirm(`この枝と、その下の項目（計${count}個）を消しますか？`))return;const parent=state.tree.nodes.find(n=>n.id===state.selected).parent;applyChange(deleteNode(state.tree,state.selected),parent);}
 else if(e.target.closest('[data-edit-undo]'))undoChange();
 }catch(error){$('#tree-status').textContent=error.message;}
});
$('#node-detail').addEventListener('submit',e=>{
 if(e.target.id!=='node-edit-form')return;e.preventDefault();
 try{applyChange(editNode(state.tree,state.selected,Object.fromEntries(new FormData(e.target))));}
 catch(error){$('#edit-error').textContent=error.message;}
});
$('#manual-from-memo')?.addEventListener('click',()=>startBlank(true));
$('#start-blank-tree').addEventListener('click',()=>startBlank(false));
container.addEventListener('tree-blank-start',()=>startBlank(false));
function startBlank(useMemo){
 if(shouldConfirm()&&!confirm('書き直し中のツリーを、新しい地図に置き換えますか？必要なら先にJSONで保存してください。'))return false;
 cancel();display(createBlankTree(useMemo?$('#memo').value:''),'manual','自分の言葉で書き始めました。項目を選んで編集したり、枝を加えたりできます。AIへは送信していません。');return true;
}
$('#export-tree').addEventListener('click',()=>{
 if(!state.tree)return;
 try{
 if(state.editing){$('#file-status').textContent='書き直し中の内容を「変更を反映する」で反映してから保存してください。';return;}
 const text=stringifyTreeDocument(createTreeDocument(state.tree,mapView.getPositions(),state.selected,state.source,state.edited,state.nodeOrigins));
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='re-tree-map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('#file-status').textContent='端末へのJSON保存を開始しました。ツリーと配置だけを含み、相談メモと任意欄は含めていません。';
 }catch(error){$('#file-status').textContent=error.message;}
});
$('#import-tree').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 cancel();const revision=state.revision;$('#file-status').textContent='端末内でファイルを確認しています…';
 try{
 const doc=await readTreeFile(file);
 if(state.revision!==revision){$('#file-status').textContent='読み込み中に編集されたため復元を見送りました。もう一度ファイルを選んでください。';return;}
 if((state.tree||state.editing)&&!confirm('今のツリーを読み込んだファイルで置き換えますか？必要なら先にJSONで保存してください。')){$('#file-status').textContent='復元をやめました。今のツリーは変えていません。';return;}
 display(doc.tree,'imported','JSONファイルから復元しました。ファイルの記載内容・出典は未確認です。相談メモと任意欄は復元しません。');
 mapView.restorePositions(new Map(doc.positions.map(p=>[p.id,{x:p.x,y:p.y}])));state.selected=doc.selected;state.edited=doc.provenance.edited;state.nodeOrigins=doc.nodeOrigins||Object.fromEntries(doc.tree.nodes.map(n=>[n.id,'imported']));renderMap();if(studentMode)mapView.focusNode(state.selected);else mapView.fitAll();renderOverview();renderSummaries();$('#send-consent').checked=false;
 $('#file-status').textContent='ツリーと配置を復元しました。外部への送信はしていません。';
 }catch(error){$('#file-status').textContent=error.message+' 今のツリーは変更していません。';}
 finally{e.target.value='';}
});
updateCount();
container.addEventListener('click',e=>{const entrance=e.target.closest('[data-open-node]');if(entrance){container.querySelector(`#tree-container [data-node="${entrance.dataset.openNode}"]`)?.click();return;}if(e.target.closest('[data-show-student-examples]')){showSamples();return;}const button=e.target.closest('[data-tree-go]');if(button){const target=$('#'+button.dataset.treeGo);if(studentMode&&button.dataset.treeGo==='tree-container'){closeDetail();return;}if(studentMode&&button.dataset.treeGo==='memo')$('#consultation').open=true;target.tabIndex=target.tabIndex<0?-1:target.tabIndex;target.focus({preventScroll:true});scrollTo(target);}});
discovery.addEventListener('click',e=>{const button=e.target.closest('[data-reflection]');if(!button)return;if(!state.tree){$('#tree-status').textContent='先に相談の図を作るか、例を開いてください。';scrollTo($('#mind-tree'));return;}if(state.editing){$('#tree-status').textContent='書き直しを反映してから追加してください。';return;}try{const next=addReflection(state.tree,state.selected,button.dataset.reflection);applyChange(next.tree,next.id,true,'reflection');}catch(error){$('#tree-status').textContent=error.message;}});
stepForm.addEventListener('submit',e=>{e.preventDefault();try{if(!state.tree)throw new Error('先に図を作るか、例を開いてください。');if(state.editing)throw new Error('書き直しを反映してから追加してください。');const next=addNextStep(state.tree,state.tree.nodes.find(n=>n.parent===null).id,Object.fromEntries(new FormData(stepForm)));applyChange(next.tree,next.id);$('#step-error').textContent='次の一歩を図と相談メモに追加しました。';}catch(error){$('#step-error').textContent=error.message;}});
generationReview.addEventListener('click',e=>{if(e.target.closest('[data-generation-discard]')){cancel();$('#tree-status').textContent='今の図を残しました。';}if(e.target.closest('[data-generation-accept]')&&state.generation){const tree=state.generation,previous={tree:structuredClone(state.tree),selected:state.selected,edited:state.edited,positions:mapView.getPositions(),nodeOrigins:structuredClone(state.nodeOrigins),source:state.source};cancel();display(tree,'generated','承認した新しい図に置き換えました。');state.undo=previous;renderMap();}});
function preparePrint(){printSheet.innerHTML=state.tree?printMemo(state.tree,state.source,state.nodeOrigins,$('#print-details').checked):'<h1>RE:Tree 相談メモ</h1><p>まだ図はありません。図を作ると相談メモを印刷できます。</p>';if(state.editing)printSheet.insertAdjacentHTML('afterbegin','<p>書き直し中の内容は未反映です。最後に反映した内容を印刷しています。</p>');}
window.addEventListener('beforeprint',()=>{if(!container.isConnected)return;preparePrint();document.body.append(printSheet);document.body.classList.add('printing-tree');});
window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-tree');container.append(printSheet);});
$('#print-summary').addEventListener('click',()=>{if(!state.tree)return;if(state.editing){$('#copy-status').textContent='書き直しを反映してから印刷してください。';return;}preparePrint();window.print();});
$('#copy-summary').addEventListener('click',async()=>{
 if(!state.tree)return;if(state.editing){$('#copy-status').textContent='書き直しを反映してからコピーしてください。';return;}
 const revision=state.revision;
 const text='RE:Tree 相談メモ（'+(state.source==='sample'?'架空の相談例':'内容・出典は未確認')+'）\n\n'+$('#summary-content').innerText+'\n\nこのメモは判断を代わりに行うものではありません。';
 try{await navigator.clipboard.writeText(text);if(state.revision!==revision||!state.tree)return;$('#copy-fallback').hidden=true;$('#copy-fallback').value='';$('#copy-status').textContent='相談メモをコピーしました。共有する前に内容と個人情報を確認してください。';}
 catch{if(state.revision!==revision||!state.tree)return;$('#copy-fallback').value=text;$('#copy-fallback').hidden=false;$('#copy-fallback').focus();$('#copy-fallback').select();$('#copy-status').textContent='自動コピーができないため、下の文章を選択してコピーしてください。';}
});
$('#send-consent').addEventListener('change',()=>{if(!$('#send-consent').checked)cancel();});

function notifyContentChange(){container.dispatchEvent(new CustomEvent('tree-content-change',{bubbles:true}));}
function openDetail(){
 $('#node-detail').dataset.open='true';
 if(innerWidth<1100){$('#node-detail').focus({preventScroll:true});}
 else if($('#node-detail').getBoundingClientRect().top<0||$('#node-detail').getBoundingClientRect().top>innerHeight-100)scrollTo($('#map-workspace'));
}
function closeDetail(){
 $('#node-detail').dataset.open='false';
 $('#tree-container').querySelector(`[data-node="${state.selected}"]`)?.focus({preventScroll:true});
}
function showSamples(){const examples=$('#student-example-start');if(examples){examples.hidden=false;examples.tabIndex=-1;examples.focus({preventScroll:true});scrollTo(examples);}}
function focusMemo(){$('#consultation').open=true;$('#memo').focus({preventScroll:true});scrollTo($('#consultation'));}
function loadStudentSample(id){
 const example=studentSamples.find(p=>p.id===id);if(!example)return false;
 if((shouldConfirm()||memoNeedsConfirmation())&&!confirm('今の図と相談メモを例に置き換えますか？残す図は先にJSONで保存してください。'))return false;
 cancel();state.studentSampleId=id;state.memoBaseline=example.memo;$('#memo').value=example.memo;$('#send-consent').checked=false;updateCount();display(example.tree,'sample','架空の相談例を開きました。項目を押して、自分の言葉に変えられます。');return true;
}
function memoNeedsConfirmation(){return $('#memo').value.trim()&&$('#memo').value!==state.memoBaseline;}
function loadSeed(index,researchDemo=true){if(!Number.isInteger(index)||!samplePrompts[index])return false;const memo=samplePrompts[index].memo;if((shouldConfirm()||memoNeedsConfirmation())&&!confirm(researchDemo?'今の図と相談メモを、研究デモに置き換えますか？必要ならJSONで保存してください。':'今の図と相談メモを、別の相談例に置き換えますか？必要ならJSONで保存してください。'))return false;cancel();state.memoBaseline=memo;state.sampleIndex=index;state.studentSampleId=null;$('#memo').value=memo;$('#send-consent').checked=false;updateCount();display(samplePrompts[index].tree,'sample',researchDemo?'開発者の研究デモです。一般の生徒の相談例・研究の実証結果とは区別して読んでください。':'以前の試作品の一般向け相談例です。架空の例を自分の言葉に書き換えられます。');return true;}
function undoChange(){if(!state.undo)return;cancel();const previous=state.undo;state.tree=previous.tree;state.selected=previous.selected;state.edited=previous.edited;state.nodeOrigins=previous.nodeOrigins;state.source=previous.source;state.undo=null;state.editing=false;mapView.restorePositions(previous.positions);renderOverview();renderMap();renderSummaries();$('#tree-status').textContent='直前の変更を戻しました。';notifyContentChange();}
if(studentMode){$('#workspace-undo').addEventListener('click',undoChange);container.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#node-detail').dataset.open==='true'&&!state.editing){e.preventDefault();closeDetail();}});}
const api={loadStudentSample,loadSeed,showSamples,focusMemo,getSource:()=>({source:state.source,sampleIndex:state.sampleIndex,studentSampleId:state.studentSampleId}),startBlank:()=>startBlank(false)};container.retreeStudy=api;if(studentMode)window.retreeStudy=api;
return ()=>{cancel();capabilityController?.abort();branch.cancel();if(window.retreeStudy===api)delete window.retreeStudy;};
}
