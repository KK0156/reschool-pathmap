import {sampleTree,samplePrompts} from './sample-tree.js';
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
const state={tree:null,selected:null,source:null,pending:false,revision:0};
let controller=null;
const scrollTo=element=>element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
$('#sample-prompts').innerHTML=samplePrompts.map((p,i)=>`<button type="button" class="sample-prompt" data-prompt="${i}">${escapeHtml(p.label)}</button>`).join('');
$('#tree-legend').innerHTML=Object.entries(nodeTypes).map(([type,label])=>`<span class="type-${type}">${label}</span>`).join('');
function display(tree,source,message){
 state.tree=tree;state.source=source;state.selected=tree.nodes.find(n=>n.parent===null).id;
 $('#tree-empty').hidden=true;$('#map-workspace').hidden=false;
 $('#tree-status').textContent=message;
 $('#tree-overview').innerHTML=`<span>${source==='sample'?'サンプルツリー / 入力メモの分析結果ではありません':'メモをもとに生成したツリー / 内容は要確認'}</span><h3>${escapeHtml(tree.core_question)}</h3><p>${escapeHtml(tree.summary)}</p>`;
 renderMap();renderSummaries();
 $('#mind-tree').focus({preventScroll:true});scrollTo($('#mind-tree'));
}
function renderMap(){
 $('#tree-container').innerHTML=renderTree(state.tree,state.selected);
 $('#node-detail').innerHTML=renderDetail(state.tree.nodes.find(n=>n.id===state.selected),state.source);
}
function renderSummaries(){
 const t=state.tree;const nodes=type=>t.nodes.filter(n=>n.type===type);
 const list=items=>items.length?`<ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:'<p>未確認。メモや資料で確認する必要があります。</p>';
 const actions=[...new Set([...nodes('action').map(n=>n.detail),...t.nodes.map(n=>n.next_action)])].slice(0,12);
 const evidence=nodes('evidence').map(n=>`${n.label}：${n.evidence}（内容・出典は要確認）`);
 $('#summary-content').innerHTML=`<article><span>研究の問い</span><h3>${escapeHtml(t.core_question)}</h3><p>${escapeHtml(t.summary)}</p></article><article><span>プロジェクトの概要</span>${list(nodes('project').map(n=>`${n.label}：${n.detail}`))}</article><article><span>次に調べること・研究計画</span>${list(actions)}</article><article><span>CoD活動説明の草案</span><p>RE:Tree is an AI-assisted research mapping prototype. Instead of asking AI to decide an answer, it helps users turn uncertainty into a mind tree of questions, choices, evidence, risks, people to ask, and next actions.</p><p>今回整理するテーマ：${escapeHtml(t.core_question)}</p><p class="caption">活動の実績を証明する文章ではありません。実際に行ったことと、これから行うことを分けて書き直してください。</p></article><article><span>証拠の確認リスト</span>${list(evidence.length?evidence:t.nodes.filter(n=>n.evidence!=='未確認').map(n=>`${n.label}：${n.evidence}（要確認）`))}<p class="caption">資料の出典・日付・確認できた内容・反対の結果がないかを確認してください。サンプルの記載は資料の存在を保証しません。</p></article><article><span>作れそうな成果物</span>${list(nodes('output').map(n=>`${n.label}：${n.detail}`))}</article>`;
}
function cancel(){state.revision++;controller?.abort();state.pending=false;$('#generate').disabled=false;$('#generate').textContent='メモをツリーに整理する';}
function sample(message='サンプルツリーを表示しています。入力したメモをAIで分析した結果ではありません。'){
 cancel();display(sampleTree,'sample',message);
}
$('#show-sample')?.addEventListener('click',()=>sample());
$('#sample-without-api').addEventListener('click',()=>sample());
$('#sample-prompts').addEventListener('click',e=>{
 const button=e.target.closest('[data-prompt]');if(!button)return;
 cancel();$('#memo').value=samplePrompts[Number(button.dataset.prompt)].memo;$('#send-consent').checked=false;updateCount();$('#memo').focus();scrollTo($('#consultation'));
});
function updateCount(){ $('#memo-count').textContent=`${$('#memo').value.length} / 3000文字`;$('#memo-error').textContent='';$('#memo').removeAttribute('aria-invalid'); }
$('#memo').addEventListener('input',()=>{cancel();$('#send-consent').checked=false;updateCount();if(state.tree)$('#tree-status').textContent='メモが変更されています。表示中のツリーは前のメモのもの、またはサンプルです。';});
$('#clear-all').addEventListener('click',()=>{
 cancel();$('#memo').value='';$('#send-consent').checked=false;updateCount();state.tree=null;state.source=null;state.selected=null;
 $('#map-workspace').hidden=true;$('#tree-empty').hidden=false;$('#tree-container').replaceChildren();$('#node-detail').replaceChildren();$('#tree-overview').replaceChildren();$('#tree-status').textContent='入力とツリーを消しました。';$('#summary-content').innerHTML='<p>ツリーを作ると、まとめが表示されます。</p>';$('#memo').focus();
});
$('#tree-container').addEventListener('click',e=>{
 const button=e.target.closest('[data-node]');if(!button||!state.tree)return;
 state.selected=button.dataset.node;renderMap();
 if(innerWidth<1000){$('#node-detail').focus({preventScroll:true});scrollTo($('#node-detail'));}
 else $('#tree-container').querySelector(`[data-node="${state.selected}"]`).focus({preventScroll:true});
});
$('#memo-form').addEventListener('submit',async e=>{
 e.preventDefault();const memo=$('#memo').value.trim();
 if(!memo||memo.length>3000){$('#memo-error').textContent=!memo?'相談メモを書いてください。サンプルを選ぶこともできます。':'相談メモは3000文字以内で書いてください。';$('#memo').setAttribute('aria-invalid','true');$('#memo').focus();return;}
 if(!$('#send-consent').checked){$('#memo-error').textContent='送信する内容を確認し、確認欄にチェックしてください。';$('#send-consent').focus();return;}
 if(state.pending)return;
 const revision=++state.revision;controller=new AbortController();const currentController=controller;
 state.pending=true;$('#generate').disabled=true;$('#generate').textContent='メモを整理しています…';$('#memo-error').textContent='';$('#tree-status').textContent='AIがメモを整理しています。';
 const timeout=setTimeout(()=>currentController.abort(),55000);
 try{const tree=await requestMindTree(memo,currentController.signal);if(state.revision===revision)display(tree,'generated','メモからツリーを生成しました。未確認の内容は、資料や相談で確かめてください。');}
 catch(error){if(state.revision===revision)display(sampleTree,'sample',`AI生成に失敗しました。代わりにサンプルツリーを表示しています。${error.name==='AbortError'?'回答に時間がかかっています。':error.message}`);}
 finally{clearTimeout(timeout);if(state.revision===revision){state.pending=false;$('#generate').disabled=false;$('#generate').textContent='メモをツリーに整理する';}}
});
$('#send-consent').addEventListener('change',()=>{if(!$('#send-consent').checked)cancel();});

return ()=>cancel();
}
