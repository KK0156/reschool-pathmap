import {layoutMindMap} from './mind-map-layout.js';
export const nodeTypes = {core_question:'中心問い',project:'選択肢・プロジェクト',experience:'経験',evidence:'証拠・資料',hypothesis:'仮説',risk:'リスク',counterargument:'反論',research_note:'研究メモ',person:'聞く相手',action:'次の行動',output:'成果物'};
export const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateTree(tree,{maxNodes=200}={}) {
 const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 if(!exact(tree,['core_question','summary','nodes'])||!text(tree.core_question,300)||!text(tree.summary,1500)||!Array.isArray(tree.nodes)||!tree.nodes.length||tree.nodes.length>maxNodes)return false;
 const ids=new Set();
 for(const node of tree.nodes){
  if(!exact(node,['id','parent','label','type','detail','evidence','risk','next_action'])||!text(node.id,64)||(!/^[a-zA-Z0-9_-]+$/.test(node.id)||['__proto__','constructor','prototype'].includes(node.id))||ids.has(node.id)||!text(node.label,180)||!Object.hasOwn(nodeTypes,node.type)||!['detail','evidence','risk','next_action'].every(k=>text(node[k],1800))||(node.parent!==null&&(!text(node.parent,64)||node.parent===node.id)))return false;
  ids.add(node.id);
 }
 const roots=tree.nodes.filter(n=>n.parent===null);
 if(roots.length!==1||roots[0].type!=='core_question'||tree.nodes.some(n=>n!==roots[0]&&n.type==='core_question')||tree.nodes.some(n=>n.parent!==null&&!ids.has(n.parent)))return false;
 const visit=(id,depth)=>{if(depth>12||seen.has(id))return false;seen.add(id);return tree.nodes.filter(n=>n.parent===id).every(n=>visit(n.id,depth+1));};
 const seen=new Set();return visit(roots[0].id,0)&&seen.size===tree.nodes.length;
}
export function renderListTree(tree,selectedId){
 if(!validateTree(tree))throw new Error('Invalid tree');
 const root=tree.nodes.find(n=>n.parent===null);
 const button=node=>`<button type="button" class="tree-node type-${node.type} ${node.id===selectedId?'selected':''}" data-node="${node.id}" aria-pressed="${node.id===selectedId}"><span class="node-type">${nodeTypes[node.type]}</span><span class="node-label">${escapeHtml(node.label)}</span></button>`;
 const children=id=>tree.nodes.filter(n=>n.parent===id);
 const descendants=(id,depth=0)=>children(id).length?`<ul class="branch-children" data-depth="${Math.min(depth,3)}">${children(id).map(n=>`<li>${button(n)}${descendants(n.id,depth+1)}</li>`).join('')}</ul>`:'';
 return `<div class="tree-root">${button(root)}</div><ul class="tree-branches" aria-label="中心問いから分かれた項目">${children(root.id).map(n=>`<li class="main-branch">${button(n)}${descendants(n.id)}</li>`).join('')}</ul>`;
}
export function renderTree(tree,selectedId,customLayout){
 if(!validateTree(tree))throw new Error('Invalid tree');
 const layout=customLayout||layoutMindMap(tree);
 const palette=['#627a69','#8b7654','#647d91','#88776d','#697c78','#7c7890'];
 const color=branch=>branch<0?'#17283c':palette[branch%palette.length];
 return `<div class="mind-map-stage" style="width:${layout.width}px;height:${layout.height}px" data-width="${layout.width}" data-height="${layout.height}"><svg class="mind-map-lines" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true" focusable="false"><defs><filter id="pencil-stroke" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G"/></filter></defs>${layout.edges.map(e=>`<path d="${e.path}" stroke="${color(e.branch)}" data-edge-parent="${e.parent}" data-edge-child="${e.child}"/>`).join('')}</svg>${layout.nodes.map(n=>`<button type="button" class="tree-node mind-map-node type-${n.type} ${n.parent===null?'mind-map-core':''} ${n.id===selectedId?'selected':''}" data-node="${n.id}" data-parent="${n.parent||''}" aria-pressed="${n.id===selectedId}" aria-label="${escapeHtml(nodeTypes[n.type]+'：'+n.label+(n.parent===null?'（中心の問い）':'（つなぐ先：'+tree.nodes.find(p=>p.id===n.parent).label+'）'))}" style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;--branch-color:${color(n.branch)}"><span class="node-type">${nodeTypes[n.type]}</span><span class="node-label">${escapeHtml(n.label)}</span></button>`).join('')}</div>`;
}
export function renderDetail(node,source){
 return `<div class="detail-heading"><span>${nodeTypes[node.type]}</span><h3>${escapeHtml(node.label)}</h3></div><dl>${[['内容','detail'],['証拠・資料','evidence'],['リスク・未確認の点','risk'],['次にできること','next_action']].map(([label,key])=>`<div><dt>${label}</dt><dd>${escapeHtml(node[key])}</dd></div>`).join('')}</dl><p class="detail-note">${source==='sample'?'サンプル内の資料名は表示例です。実在する証拠の確認済み表示ではありません。':source==='imported'?'端末のJSONファイルから復元した内容です。出典や事実を検証済みという意味ではありません。':source==='ai_proposal'?'AIの提案を確認して追加した項目です。事実や出典は検証済みではありません。':source==='user_edited'?'本人が書き直した項目です。記した内容と、確かめた事実は分けて扱ってください。':source==='reflection'?'一般的な問いかけから加えた項目です。本人に当てはまるかは未確認です。':source==='manual'?'自分で書き始めたツリーです。記した内容と、確かめた事実は分けて扱ってください。':'AIがメモから整理した内容です。記載があっても、資料の実在や内容を検証済みとは限りません。'}</p>${node.type==='project'&&node.label==='RE:School'?'<a class="text-link" href="/reschool.html">既存のRE:School試作品を見る ↗</a>':''}`;
}
