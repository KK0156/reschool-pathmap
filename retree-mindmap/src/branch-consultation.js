import {proposalIntents,createProposalRequest,validateProposal} from './tree-proposal.js';
import {escapeHtml as esc,nodeTypes} from './tree-renderer.js';
export function mountBranchConsultation(host,{getState,isConfigured,onAccept,onUnavailable}){
 let signature='',controller=null,proposal=null,context=null,busy=false;
 host.innerHTML=`<details class="branch-consultation"><summary>選んだ項目について、AIともう少し考える</summary><p>別の選択肢、反論、確かめる資料を提案します。採用するまで図は変わりません。</p><p class="branch-context"></p><label>考えたいこと<select id="branch-intent">${Object.entries(proposalIntents).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label id="branch-compare-label" hidden>比較するもう一つの項目<select id="branch-compare"></select></label><details><summary>今回AIへ送る内容</summary><p>中心問いと選んだ項目だけを送ります。比較時はもう一項目も含みます。長い欄は先頭900文字まで。元の相談メモ・成績欄・図全体・配置は送りません。</p><pre id="branch-preview"></pre></details><label class="consent"><input type="checkbox" id="branch-consent"> 上の送信内容を確認し、AIへ送る</label><div class="actions"><button id="branch-request" type="button">提案を受け取る</button><button id="branch-cancel" type="button" hidden>待機をやめる</button></div><p id="branch-status" role="status"></p><div id="branch-proposals"></div></details>`;
 const $=s=>host.querySelector(s);
 const request=()=>{const s=getState();return createProposalRequest(s.tree,s.selected,$('#branch-intent').value,$('#branch-compare').value||null);};
 function preview(){proposal=null;context=null;$('#branch-proposals').replaceChildren();$('#branch-consent').checked=false;$('#branch-compare-label').hidden=$('#branch-intent').value!=='compare';try{$('#branch-preview').textContent=JSON.stringify(request(),null,2);}catch(e){$('#branch-preview').textContent=e.message;}updateButton();}
 function updateButton(){$('#branch-request').disabled=!isConfigured()||busy||getState().editing;$('#branch-cancel').hidden=!busy;if(!isConfigured())$('#branch-status').textContent='AI接続は未設定または確認できません。下の一般的な問いかけや、自分で枝を追加する方法を使えます。';}
 function cancel(message=''){controller?.abort();controller=null;busy=false;proposal=null;context=null;$('#branch-proposals').replaceChildren();if(message)$('#branch-status').textContent=message;updateButton();}
 function refresh(){const s=getState();host.hidden=!s.tree;const key=s.tree?JSON.stringify([s.revision,s.selected,s.editing]):'';if(key!==signature){cancel();signature=key;if(!s.tree){$('#branch-preview').textContent='';$('.branch-context').textContent='';$('#branch-compare').replaceChildren();$('#branch-consent').checked=false;$('#branch-status').textContent='';return;}$('#branch-compare').innerHTML=s.tree.nodes.filter(n=>n.id!==s.selected).map(n=>`<option value="${n.id}">${esc(n.label)}</option>`).join('');$('.branch-context').textContent='今選んでいる項目：'+s.tree.nodes.find(n=>n.id===s.selected).label;$('#branch-status').textContent=s.editing?'項目の書き直しを反映してから使ってください。':'';preview();}updateButton();}
 $('#branch-intent').addEventListener('change',()=>{cancel();preview();});$('#branch-compare').addEventListener('change',()=>{cancel();preview();});
 $('#branch-consent').addEventListener('change',()=>{if(!$('#branch-consent').checked)cancel('回答の待機をやめました。今の図は変えていません。');});
 $('#branch-cancel').addEventListener('click',()=>cancel('待機をやめました。今の図は変えていません。'));
 $('#branch-request').addEventListener('click',async()=>{
  if(!isConfigured()||busy)return;
  if(!$('#branch-consent').checked){$('#branch-status').textContent='送信内容を確認してチェックしてください。';$('#branch-consent').focus();return;}
  let body;try{body=request();}catch(e){$('#branch-status').textContent=e.message;return;}
  const s=getState(),token=signature,parent=s.selected,current=new AbortController();controller=current;busy=true;proposal=null;$('#branch-proposals').replaceChildren();$('#branch-status').textContent='提案を整理しています。今の図は変更しません。';updateButton();
  const timeout=setTimeout(()=>current.abort(),45000);
  try{const response=await fetch('/.netlify/functions/deepen-tree',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:current.signal});let data;try{data=await response.json();}catch{throw new Error('接続先を確認できませんでした。');}if(controller!==current||signature!==token)return;if(!response.ok){if(response.status===503)onUnavailable();throw new Error(data.error||'提案を受け取れませんでした。');}if(!validateProposal(data))throw new Error('提案の形式を確認できませんでした。');
   if(controller!==current||signature!==token)return;proposal=data;context={parent,signature:token};
   $('#branch-proposals').innerHTML=`<h3>AIからの提案・未反映</h3><p>${esc(data.summary)}</p><p>追加したいものだけにチェックしてください。既存の項目は上書きしません。</p>${data.suggestions.map((n,i)=>`<article><label><input type="checkbox" data-proposal-index="${i}"> ${esc(n.label)} <small>${nodeTypes[n.type]}</small></label><dl>${[['内容','detail'],['根拠・資料','evidence'],['リスク・未確認','risk'],['次にすること','next_action']].map(([label,key])=>`<div><dt>${label}</dt><dd>${esc(n[key])}</dd></div>`).join('')}</dl></article>`).join('')}<button type="button" id="branch-accept" disabled>選んだ提案だけ枝に追加</button><button type="button" id="branch-discard">提案を使わない</button>`;
   $('#branch-status').textContent='提案を受け取りました。まだ図は変わっていません。';
  }catch(e){if(controller===current)$('#branch-status').textContent=(e.name==='AbortError'?'時間がかかったため中断しました。':e.message)+' 今の図と編集内容は残っています。';}
  finally{clearTimeout(timeout);if(controller===current){controller=null;busy=false;updateButton();}}
 });
 $('#branch-proposals').addEventListener('change',()=>{$('#branch-accept').disabled=!host.querySelector('[data-proposal-index]:checked');});
 $('#branch-proposals').addEventListener('click',e=>{
  if(e.target.id==='branch-discard'){cancel('提案は追加していません。');return;}
  if(e.target.id!=='branch-accept'||!proposal||!context)return;
  if(context.signature!==signature){cancel('図が変わったため、提案を確認し直してください。');return;}
  const suggestions=[...host.querySelectorAll('[data-proposal-index]:checked')].map(el=>proposal.suggestions[Number(el.dataset.proposalIndex)]);if(!suggestions.length)return;
  try{onAccept(context.parent,{summary:proposal.summary,suggestions});cancel('承認した提案だけを枝に追加しました。内容と出典は未確認です。');}catch(error){$('#branch-status').textContent=error.message;}
 });
 return {refresh,cancel};
}
