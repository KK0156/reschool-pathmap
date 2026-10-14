import {composeMemo,contextFields,optionalContextView,editorView,editNode,addNode,deleteNode,descendants} from './tree-edit.js';
import {samplePrompts} from './sample-tree.js';
import {nodeTypes,escapeHtml,validateTree,renderTree,renderDetail} from './tree-renderer.js';
export async function requestMindTree(memo,signal){
 const response=await fetch('/.netlify/functions/generate-tree',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memo}),signal});
 let data;try{data=await response.json();}catch{throw new Error('接続先を確認できませんでした。');}
 if(!response.ok)throw new Error(data.error||'AI生成に失敗しました。');
 if(!validateTree(data))throw new Error('ツリーの形式を確認できませんでした。');
 return data;
}

export function mountTree(container){
const $=selector=>container.querySelector(selector);
$('#privacy-note').insertAdjacentHTML('beforebegin',optionalContextView);
const context=()=>Object.fromEntries(contextFields.map(([id])=>[id,$('#context-'+id).value]));
const completeMemo=()=>composeMemo($('#memo').value,context());
const state={tree:null,selected:null,source:null,pending:false,revision:0,sampleIndex:0,edited:false,editing:false,undo:null};
let controller=null;
const scrollTo=element=>element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
$('#sample-prompts').innerHTML=['進路','学校での活動','研究・制作'].map(category=>`<div class="sample-group"><h3>${escapeHtml(category)}</h3><div class="sample-options">${samplePrompts.map((p,i)=>p.category===category?`<article class="sample-option"><h4>${escapeHtml(p.label)}</h4><div><button type="button" class="sample-prompt" data-prompt="${i}">この例をメモに入れる</button><button type="button" class="text-button" data-preview="${i}">ツリーの例を見る</button></div></article>`:'').join('')}</div></div>`).join('');
if($('#tree-example')){
 $('#tree-example').innerHTML=['進路','学校での活動','研究・制作'].map(category=>`<optgroup label="${category}">${samplePrompts.map((p,i)=>p.category===category?`<option value="${i}">${escapeHtml(p.label)}</option>`:'').join('')}</optgroup>`).join('');
 $('#tree-example').value=String(state.sampleIndex);
 $('#preview-tree-example').addEventListener('click',()=>{state.sampleIndex=Number($('#tree-example').value);sample();});
}
$('#tree-legend').innerHTML=Object.entries(nodeTypes).map(([type,label])=>`<span class="type-${type}">${label}</span>`).join('');
function display(tree,source,message){
 if($('#tree-example')&&source==='sample')$('#tree-example').value=String(state.sampleIndex);
 state.tree=structuredClone(tree);state.source=source;state.edited=false;state.editing=false;state.undo=null;state.selected=tree.nodes.find(n=>n.parent===null).id;
 $('#tree-empty').hidden=true;$('#map-workspace').hidden=false;
 $('#tree-status').textContent=message;
 renderOverview();
 renderMap();renderSummaries();
 $('#mind-tree').focus({preventScroll:true});scrollTo($('#mind-tree'));
}
function renderOverview(){
 const tree=state.tree,source=state.source;
 $('#tree-overview').innerHTML=`<span>${state.edited?'自分で手直し済み / ':''}${source==='sample'?'サンプルツリー / 入力メモの分析結果ではありません':'メモをもとに生成したツリー / 内容は要確認'}</span><h3>${escapeHtml(tree.core_question)}</h3><p>${escapeHtml(tree.summary)}</p>`;
}
function renderMap(){
 $('#tree-container').innerHTML=renderTree(state.tree,state.selected);
 $('#node-detail').innerHTML=state.editing?editorView(state.tree,state.selected):renderDetail(state.tree.nodes.find(n=>n.id===state.selected),state.source)+`<div class="edit-actions"><button type="button" class="secondary" data-edit-start>この項目を書き直す</button><button type="button" class="secondary" data-edit-add>ここに枝を加える</button>${state.tree.nodes.find(n=>n.id===state.selected).parent!==null?'<button type="button" class="text-button" data-edit-delete>この枝を消す</button>':''}${state.undo?'<button type="button" class="text-button" data-edit-undo>直前の変更を戻す</button>':''}</div><p class="caption">手直しは保存・送信されません。ページを再読み込みすると消えます。</p>`;
}
function renderSummaries(){
 const t=state.tree;const nodes=type=>t.nodes.filter(n=>n.type===type);
 const list=items=>items.length?`<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:'<p>未確認。メモや資料で確認する必要があります。</p>';
 const actions=[...new Set([...nodes('action').map(n=>n.detail),...t.nodes.map(n=>n.next_action)])].slice(0,12);
 const evidence=nodes('evidence').map(n=>`${n.label}：${n.evidence}（内容・出典は要確認）`);
 $('#summary-content').innerHTML=`<article><span>研究の問い</span><h3>${escapeHtml(t.core_question)}</h3><p>${escapeHtml(t.summary)}</p></article><article><span>プロジェクトの概要</span>${list(nodes('project').map(n=>`${n.label}：${n.detail}`))}</article><article><span>次に調べること・研究計画</span>${list(actions)}</article><article><span>CoD活動説明の草案</span><p>RE:Tree is an AI-assisted research mapping prototype. Instead of asking AI to decide an answer, it helps users turn uncertainty into a mind tree of questions, choices, evidence, risks, people to ask, and next actions.</p><p>今回整理するテーマ：${escapeHtml(t.core_question)}</p><p class="caption">活動の実績を証明する文章ではありません。実際に行ったことと、これから行うことを分けて書き直してください。</p></article><article><span>証拠の確認リスト</span>${list(evidence.length?evidence:t.nodes.filter(n=>n.evidence!=='未確認').map(n=>`${n.label}：${n.evidence}（要確認）`))}<p class="caption">資料の出典・日付・確認できた内容・反対の結果がないかを確認してください。サンプルの記載は資料の存在を保証しません。</p></article><article><span>作れそうな成果物</span>${list(nodes('output').map(n=>`${n.label}：${n.detail}`))}</article>`;
}
function cancel(){state.revision++;controller?.abort();state.pending=false;$('#generate').disabled=false;$('#generate').textContent='AIでツリーを作る';}
function sample(message='サンプルツリーを表示しています。入力したメモをAIで分析した結果ではありません。'){
 if((state.edited||state.editing)&&!confirm('別の例を表示すると、手直ししたツリーを置き換えます。続けますか？'))return;
 cancel();display(samplePrompts[state.sampleIndex].tree,'sample',message);
}
$('#show-sample')?.addEventListener('click',()=>sample());
$('#sample-without-api').addEventListener('click',()=>sample());
$('#sample-prompts').addEventListener('click',e=>{
 const preview=e.target.closest('[data-preview]');if(preview){state.sampleIndex=Number(preview.dataset.preview);sample();return;}
 const button=e.target.closest('[data-prompt]');if(!button)return;state.sampleIndex=Number(button.dataset.prompt);
 cancel();$('#memo').value=samplePrompts[Number(button.dataset.prompt)].memo;$('#send-consent').checked=false;updateCount();if($('#memo-help'))$('#memo-help').textContent='例文を入れました。必要なところを書き換え、送信内容を確認して「AIでツリーを作る」を押してください。';$('#memo').focus();scrollTo($('#memo'));
});
function updateCount(){ $('#memo-count').textContent=`${completeMemo().length} / 3000文字（任意欄を含む）`;$('#send-preview-text').textContent=completeMemo()||'まだ入力されていません。';$('#memo-error').textContent='';$('#memo').removeAttribute('aria-invalid'); }
$('#memo-form').addEventListener('input',e=>{if(!e.target.matches('#memo,[data-context]'))return;cancel();$('#send-consent').checked=false;updateCount();if(state.tree)$('#tree-status').textContent='メモが変更されています。表示中のツリーは前のメモのもの、またはサンプルです。';});
$('#clear-all').addEventListener('click',()=>{
 cancel();$('#memo').value='';contextFields.forEach(([id])=>$('#context-'+id).value='');$('#send-consent').checked=false;updateCount();state.tree=null;state.source=null;state.selected=null;state.undo=null;state.edited=false;state.editing=false;
 $('#map-workspace').hidden=true;$('#tree-empty').hidden=false;$('#tree-container').replaceChildren();$('#node-detail').replaceChildren();$('#tree-overview').replaceChildren();$('#tree-status').textContent='入力とツリーを消しました。';$('#summary-content').innerHTML='<p>ツリーを作ると、まとめが表示されます。</p>';$('#memo').focus();
});
$('#tree-container').addEventListener('click',e=>{
 const button=e.target.closest('[data-node]');if(!button||!state.tree)return;
 if(state.editing&&!confirm('書き直し中の内容を破棄して、別の項目を開きますか？'))return;state.editing=false;state.selected=button.dataset.node;renderMap();
 if(innerWidth<1000){$('#node-detail').focus({preventScroll:true});scrollTo($('#node-detail'));}
 else $('#tree-container').querySelector(`[data-node="${state.selected}"]`).focus({preventScroll:true});
});
$('#memo-form').addEventListener('submit',async e=>{
 e.preventDefault();const memo=completeMemo();
 if(!$('#memo').value.trim()||memo.length>3000){$('#memo-error').textContent=!$('#memo').value.trim()?'相談メモを書いてください。サンプルを選ぶこともできます。':'任意欄を含め、3000文字以内で書いてください。';$('#memo').setAttribute('aria-invalid','true');$('#memo').focus();return;}
 if(!$('#send-consent').checked){$('#memo-error').textContent='送信する内容を確認し、確認欄にチェックしてください。';$('#send-consent').focus();return;}
 if(state.pending)return;
 if((state.edited||state.editing)&&!confirm('新しく生成すると、手直ししたツリーを置き換えます。続けますか？'))return;
 const revision=++state.revision;controller=new AbortController();const currentController=controller;
 state.pending=true;$('#generate').disabled=true;$('#generate').textContent='メモを整理しています…';$('#memo-error').textContent='';$('#tree-status').textContent='AIがメモを整理しています。';
 const timeout=setTimeout(()=>currentController.abort(),55000);
 try{const tree=await requestMindTree(memo,currentController.signal);if(state.revision===revision)display(tree,'generated','メモからツリーを生成しました。未確認の内容は、資料や相談で確かめてください。');}
 catch(error){if(state.revision===revision)display(samplePrompts[state.sampleIndex].tree,'sample',`AI生成に失敗しました。代わりにサンプルツリーを表示しています。${error.name==='AbortError'?'回答に時間がかかっています。':error.message}`);}
 finally{clearTimeout(timeout);if(state.revision===revision){state.pending=false;$('#generate').disabled=false;$('#generate').textContent='AIでツリーを作る';}}
});
function applyChange(tree,selected=state.selected){
 cancel();
 state.undo={tree:structuredClone(state.tree),selected:state.selected,edited:state.edited};state.tree=tree;state.selected=selected;state.edited=true;state.editing=false;
 renderOverview();renderMap();renderSummaries();$('#tree-status').textContent='手直しを反映しました。保存やAIへの送信は行っていません。';$('#node-detail').focus({preventScroll:true});
}
$('#node-detail').addEventListener('click',e=>{
 try{
 if(e.target.closest('[data-edit-start]')){cancel();state.editing=true;renderMap();$('#edit-label').focus();}
 else if(e.target.closest('[data-edit-cancel]')){state.editing=false;renderMap();$('#node-detail [data-edit-start]').focus();}
 else if(e.target.closest('[data-edit-add]')){const next=addNode(state.tree,state.selected);applyChange(next.tree,next.id);state.editing=true;renderMap();$('#edit-label').focus();}
 else if(e.target.closest('[data-edit-delete]')){const count=descendants(state.tree,state.selected).size;if(!confirm(`この枝と、その下の項目（計${count}個）を消しますか？`))return;const parent=state.tree.nodes.find(n=>n.id===state.selected).parent;applyChange(deleteNode(state.tree,state.selected),parent);}
 else if(e.target.closest('[data-edit-undo]')){cancel();const previous=state.undo;state.tree=previous.tree;state.selected=previous.selected;state.edited=previous.edited;state.undo=null;state.editing=false;renderOverview();renderMap();renderSummaries();$('#tree-status').textContent='直前の変更を戻しました。';}
 }catch(error){$('#tree-status').textContent=error.message;}
});
$('#node-detail').addEventListener('submit',e=>{
 if(e.target.id!=='node-edit-form')return;e.preventDefault();
 try{applyChange(editNode(state.tree,state.selected,Object.fromEntries(new FormData(e.target))));}
 catch(error){$('#edit-error').textContent=error.message;}
});
updateCount();
container.addEventListener('click',e=>{const button=e.target.closest('[data-tree-go]');if(button){const target=$('#'+button.dataset.treeGo);target.focus({preventScroll:true});scrollTo(target);}});
$('#send-consent').addEventListener('change',()=>{if(!$('#send-consent').checked)cancel();});

return ()=>cancel();
}
