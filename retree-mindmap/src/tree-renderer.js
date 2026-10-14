export const nodeTypes = {core_question:'中心問い',project:'選択肢・プロジェクト',experience:'経験',evidence:'証拠・資料',risk:'リスク・反証',person:'聞く相手',action:'次の行動',output:'成果物'};
export const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateTree(tree) {
 const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 if(!exact(tree,['core_question','summary','nodes'])||!text(tree.core_question,300)||!text(tree.summary,1500)||!Array.isArray(tree.nodes)||!tree.nodes.length||tree.nodes.length>40)return false;
 const ids=new Set();
 for(const node of tree.nodes){
  if(!exact(node,['id','parent','label','type','detail','evidence','risk','next_action'])||!text(node.id,64)||!/^[a-zA-Z0-9_-]+$/.test(node.id)||ids.has(node.id)||!text(node.label,180)||!Object.hasOwn(nodeTypes,node.type)||!['detail','evidence','risk','next_action'].every(k=>text(node[k],1800))||(node.parent!==null&&(!text(node.parent,64)||node.parent===node.id)))return false;
  ids.add(node.id);
 }
 const roots=tree.nodes.filter(n=>n.parent===null);
 if(roots.length!==1||roots[0].type!=='core_question'||tree.nodes.some(n=>n.parent!==null&&!ids.has(n.parent)))return false;
 const visit=(id,depth)=>{if(depth>12||seen.has(id))return false;seen.add(id);return tree.nodes.filter(n=>n.parent===id).every(n=>visit(n.id,depth+1));};
 const seen=new Set();return visit(roots[0].id,0)&&seen.size===tree.nodes.length;
}
export function renderTree(tree,selectedId){
 if(!validateTree(tree))throw new Error('Invalid tree');
 const root=tree.nodes.find(n=>n.parent===null);
 const button=node=>`<button type="button" class="tree-node type-${node.type} ${node.id===selectedId?'selected':''}" data-node="${node.id}" aria-pressed="${node.id===selectedId}"><span class="node-type">${nodeTypes[node.type]}</span><span class="node-label">${escapeHtml(node.label)}</span></button>`;
 const children=id=>tree.nodes.filter(n=>n.parent===id);
 const descendants=(id,depth=0)=>children(id).length?`<ul class="branch-children" data-depth="${Math.min(depth,3)}">${children(id).map(n=>`<li>${button(n)}${descendants(n.id,depth+1)}</li>`).join('')}</ul>`:'';
 return `<div class="tree-root">${button(root)}</div><ul class="tree-branches" aria-label="中心問いから分かれた項目">${children(root.id).map(n=>`<li class="main-branch">${button(n)}${descendants(n.id)}</li>`).join('')}</ul>`;
}
export function renderDetail(node,source){
 return `<div class="detail-heading"><span>${nodeTypes[node.type]}</span><h3>${escapeHtml(node.label)}</h3></div><dl>${[['内容','detail'],['証拠・資料','evidence'],['リスク・未確認の点','risk'],['次にできること','next_action']].map(([label,key])=>`<div><dt>${label}</dt><dd>${escapeHtml(node[key])}</dd></div>`).join('')}</dl><p class="detail-note">${source==='sample'?'サンプル内の資料名は表示例です。実在する証拠の確認済み表示ではありません。':'AIがメモから整理した内容です。記載があっても、資料の実在や内容を検証済みとは限りません。'}</p>${node.type==='project'&&node.label==='RE:School'?'<a class="text-link" href="/reschool.html">既存のRE:School試作品を見る ↗</a>':''}`;
}
