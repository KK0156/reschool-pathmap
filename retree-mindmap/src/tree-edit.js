import {validateTree,nodeTypes,escapeHtml} from './tree-renderer.js';
export const contextFields=[['grades','成績の目安','例：評定平均3.5 / 数学は5段階で3（分かる範囲で）'],['subjects','得意・苦手な科目','例：英語が好き。数学は復習が必要'],['interests','興味・経験','例：動画編集、部活動、地域の活動'],['conditions','希望や条件','例：自宅から通いたい。費用も比較したい'],['concerns','気になっていること','例：授業についていけるか、まだ分からない']];
export function composeMemo(memo,context={}){
 const lines=contextFields.filter(([id])=>context[id]?.trim()).map(([id,label])=>`${label}：${context[id].trim()}`);
 return memo.trim()+(lines.length?`\n\n相談の背景（本人のメモ・未確認）：\n${lines.join('\n')}`:'');
}
export const optionalContextView=`<details class="optional-context"><summary>相談の背景を加える（任意）</summary><p>成績や科目、希望条件も書けます。すべて空欄で使えます。名前・学校名・連絡先は書かず、成績は目安で構いません。合格可能性や適性を判定する欄ではありません。</p>${contextFields.map(([id,label,placeholder])=>`<label for="context-${id}">${label} <span>任意</span></label><input id="context-${id}" data-context="${id}" type="text" maxlength="200" autocomplete="off" placeholder="${placeholder}">`).join('')}</details><details class="send-preview"><summary>AIへ送る内容を確認する</summary><p>相談メモと、記入した任意欄だけを送ります。ツリーの手直しは送信されません。</p><pre id="send-preview-text"></pre></details>`;
export function descendants(tree,id){const ids=new Set([id]);let count;do{count=ids.size;tree.nodes.forEach(n=>{if(ids.has(n.parent))ids.add(n.id);});}while(ids.size!==count);return ids;}
export function editNode(tree,id,changes){
 const next=structuredClone(tree);const node=next.nodes.find(n=>n.id===id);if(!node)throw new Error('項目が見つかりません。');
 for(const key of ['label','type','parent','detail','evidence','risk','next_action'])if(Object.hasOwn(changes,key))node[key]=typeof changes[key]==='string'?changes[key].trim():changes[key];
 if(node.parent===null)next.core_question=node.label;
 if(!validateTree(next))throw new Error('空欄や文字数、枝のつながりを確認してください。中心問いは一つ必要です。');return next;
}
export function addNode(tree,parent){
 const next=structuredClone(tree);let index=1;while(next.nodes.some(n=>n.id===`note-${index}`))index++;
 const node={id:`note-${index}`,parent,label:'自分で加えた項目',type:'action',detail:'ここに考えたことを書いてください。',evidence:'未確認',risk:'未確認',next_action:'未確認'};next.nodes.push(node);
 if(!validateTree(next))throw new Error('項目は40個まで、枝の深さは12段までです。');return {tree:next,id:node.id};
}
export function deleteNode(tree,id){
 const node=tree.nodes.find(n=>n.id===id);if(!node||node.parent===null)throw new Error('中心問いは消せません。内容を書き換えることはできます。');
 const remove=descendants(tree,id);const next=structuredClone(tree);next.nodes=next.nodes.filter(n=>!remove.has(n.id));if(!validateTree(next))throw new Error('枝のつながりを確認してください。');return next;
}
export function editorView(tree,id){
 const node=tree.nodes.find(n=>n.id===id);const forbidden=descendants(tree,id);const isRoot=node.parent===null;
 return `<form id="node-edit-form"><h3>この項目を書き直す</h3><p>変更は画面内だけに反映します。AIへの送信や保存は行いません。</p><label for="edit-label">見出し</label><input id="edit-label" name="label" maxlength="180" required value="${escapeHtml(node.label)}"><label for="edit-type">項目の種類</label><select id="edit-type" name="type">${Object.entries(nodeTypes).filter(([type])=>isRoot?type==='core_question':type!=='core_question').map(([type,label])=>`<option value="${type}" ${node.type===type?'selected':''}>${label}</option>`).join('')}</select>${isRoot?'':`<label for="edit-parent">つなぐ先</label><select id="edit-parent" name="parent">${tree.nodes.filter(n=>!forbidden.has(n.id)).map(n=>`<option value="${n.id}" ${node.parent===n.id?'selected':''}>${escapeHtml(n.label)}</option>`).join('')}</select>`}${[['内容','detail'],['証拠・資料','evidence'],['リスク・未確認の点','risk'],['次にできること','next_action']].map(([label,key])=>`<label for="edit-${key}">${label}</label><textarea id="edit-${key}" name="${key}" rows="3" maxlength="1800" required>${escapeHtml(node[key])}</textarea>`).join('')}<p id="edit-error" role="alert"></p><div class="actions"><button class="primary" type="submit">変更を反映する</button><button class="secondary" type="button" data-edit-cancel>書き直しをやめる</button></div></form>`;
}
