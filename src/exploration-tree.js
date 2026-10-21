const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const originLabels={reference:'一般資料',answer:'本人の回答',ai_proposal:'AIの整理・未確認',manual:'自分のメモ',user_edited:'自分で書き直し'};
const relationLabels={related:'関係する学び・道',combine:'組み合わせて考える',transition:'あとから移る・学び直す'};
const short=(value,length=36)=>{const characters=Array.from(String(value??''));return characters.length>length?characters.slice(0,length-1).join('')+'…':characters.join('');};
const button=(action,label,attributes='')=>'<button type="button" data-exploration-action="'+action+'" '+attributes+'>'+escape(label)+'</button>';

/** A readable projection of the Finder's shared state, never another route DB. */
export function mountExplorationTree(container,options={}){
  container.classList.add('exploration-tree');
  let session=null,graph=null,nodeById=new Map(),draft=null,manualOpen=false,relationsOpen=false,undoAvailable=false,frame=0,composing=false,renderAfterComposition=false,pendingGrowth=null;
  const $=selector=>container.querySelector(selector);
  const notify=message=>{const status=$('#exploration-tree-status');if(status)status.textContent=message;};
  const nodeControl=id=>[...container.querySelectorAll('[data-exploration-node]')].find(element=>element.dataset.explorationNode===id);
  const expanded=()=>new Set(graph?.expanded||session?.exploration?.expanded||[]);
  const currentNode=()=>nodeById.get(graph?.selectedId)||nodeById.get(session?.exploration?.selected)||nodeById.get('exploration-root');
  function childNodes(id){const children=(graph?.nodes||[]).filter(node=>node.parent===id).filter(node=>!(id==='group-self'&&node.kind==='group'&&node.origin==='reference'&&node.id!==graph?.selectedId&&!graph.nodes.some(child=>child.parent===node.id)));return id==='group-routes'?children.sort((first,second)=>(first.kind==='group'?1:0)-(second.kind==='group'?1:0)):children;}
  function visibleNodes(){
    const open=expanded(),shown=new Set(),root=nodeById.get('exploration-root')||graph?.nodes.find(node=>node.parent===null);
    if(!root)return shown;
    function walk(node){if(shown.has(node.id))return;shown.add(node.id);if(node===root||open.has(node.id))for(const child of childNodes(node.id))walk(child);}
    walk(root);return shown;
  }
  function nodeMarkup(node){
    const children=childNodes(node.id),open=expanded().has(node.id),selected=graph.selectedId===node.id;
    const source=originLabels[node.origin]||'由来を確認する項目';
    const flags=[node.compared?'比較中':'',node.kept?'残した道':'',node.highlighted?'AIの注目':'',node.stale?'見直しが必要':''].filter(Boolean);
    return '<div class="exploration-node-wrap" data-exploration-wrap="'+escape(node.id)+'" data-node-kind="'+escape(node.kind)+'" data-node-origin="'+escape(node.origin)+'"><div class="exploration-node-row"><button type="button" data-exploration-node="'+escape(node.id)+'" aria-pressed="'+selected+'" data-exploration-compared="'+!!node.compared+'" data-exploration-kept="'+!!node.kept+'" data-exploration-origin="'+escape(node.origin)+'" data-exploration-kind="'+escape(node.kind)+'" data-exploration-highlighted="'+!!node.highlighted+'" data-exploration-stale="'+!!node.stale+'" aria-label="'+escape(node.label+'。'+source+(flags.length?'。'+flags.join('、'):''))+'"><span class="exploration-node-label">'+escape(short(node.label))+'</span>'+(node.kind!=='root'&&node.kind!=='group'?'<span class="exploration-node-source">'+escape(source)+'</span>':'')+(flags.length?'<span class="exploration-node-flags">'+flags.slice(0,2).map(flag=>'<span>'+escape(flag)+'</span>').join('')+'</span>':'')+'</button>'+(children.length&&node.kind!=='root'?'<button type="button" class="exploration-branch-toggle" data-exploration-toggle="'+escape(node.id)+'" aria-expanded="'+open+'" aria-label="'+escape(node.label+'の枝を'+(open?'たたむ':'開く')+'（'+children.length+'項目）')+'"><span aria-hidden="true">'+(open?'−':'+')+'</span><span class="exploration-child-count">'+children.length+'</span></button>':'')+'</div></div>';
  }
  function branchMarkup(node,depth=0){
    const children=expanded().has(node.id)?childNodes(node.id):[];
    return '<li class="exploration-branch" data-branch-depth="'+Math.min(depth,4)+'">'+nodeMarkup(node)+(children.length?'<ul class="exploration-children">'+children.map(child=>branchMarkup(child,depth+1)).join('')+'</ul>':'')+'</li>';
  }
  function relationMarkup(){
    const selected=currentNode(),links=(graph.edges||[]).filter(edge=>Object.hasOwn(relationLabels,edge.type)&&(edge.from===selected?.id||edge.to===selected?.id));
    if(!links.length)return '';
    const unique=new Map();
    for(const edge of links){const id=edge.from===selected.id?edge.to:edge.from;if(nodeById.has(id))unique.set(edge.type+'-'+id,{id,type:edge.type});}
    return '<details class="exploration-relations"'+(relationsOpen?' open':'')+'><summary>この道と、ほかの道のつながり（'+unique.size+'）</summary><p>つながりは検討の入口です。自動的に入学・移行できる意味ではありません。</p><ul>'+[...unique.values()].map(({id,type})=>'<li><span>'+escape(relationLabels[type])+'</span>'+button('relation',nodeById.get(id).label,'data-exploration-target="'+escape(id)+'"')+'</li>').join('')+'</ul></details>';
  }
  function manualMarkup(){
    const selected=currentNode();
    const form=draft?'<form id="exploration-note-form"><p class="exploration-small">'+(draft.mode==='add'?'選んだ項目の下へ、自分のメモを加えます。':'元の資料と区別して、自分の言葉をこの地図に残します。')+'</p><label for="exploration-note-label">短い見出し</label><input id="exploration-note-label" name="label" maxlength="80" required value="'+escape(draft.label)+'"><label for="exploration-note-detail">書き足したいこと</label><textarea id="exploration-note-detail" name="detail" maxlength="3000" rows="3">'+escape(draft.detail)+'</textarea><p id="exploration-note-error" role="alert"></p><div class="exploration-manual-actions"><button type="submit">自分の言葉を地図に残す</button>'+button('cancel-edit','書き直しをやめる')+'</div></form>':'<p class="exploration-small">地図に書いた言葉は、自分のメモです。元の一般資料やAIの説明とは区別して残します。</p><p class="exploration-edit-target">選択中：'+escape(selected?.label||'いま考えていること')+'</p><div class="exploration-manual-actions">'+button('edit','この項目を書き直す',!selected?'disabled':'')+button('add','ここにメモの枝を足す',!selected?'disabled':'')+(selected?.kind==='note'&&selected?.origin==='manual'?button('delete','この自分のメモを消す'):'')+'</div>';
    return '<details class="exploration-manual"'+(manualOpen||draft?' open':'')+'><summary>地図に自分の言葉を書き足す</summary>'+form+'<div class="exploration-manual-actions exploration-file-actions">'+button('undo','地図の手直しを一つ戻す',undoAvailable?'':'disabled')+button('export','枝の階層をTree形式で保存',typeof options.onExport==='function'?'':'disabled')+'</div><p class="exploration-small">Tree形式は、枝の階層を持ち出すためのコピーです。道をまたぐつながり・比較・相談の続きも残すときは、Path Finderの保存を使ってください。</p></details>';
  }
  function captureFocus(){
    const active=document.activeElement;if(!container.contains(active))return null;
    return {id:active.id,node:active.dataset?.explorationNode,toggle:active.dataset?.explorationToggle,action:active.dataset?.explorationAction,selection:typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null};
  }
  function restoreFocus(saved){
    if(!saved)return;
    const candidates=[...container.querySelectorAll('[id],[data-exploration-node],[data-exploration-toggle],[data-exploration-action]')];
    const target=candidates.find(element=>saved.id?element.id===saved.id:saved.node?element.dataset.explorationNode===saved.node:saved.toggle?element.dataset.explorationToggle===saved.toggle:saved.action?element.dataset.explorationAction===saved.action:false);
    if(!target||target.disabled)return;
    target.focus({preventScroll:true});if(saved.selection&&typeof target.setSelectionRange==='function')target.setSelectionRange(...saved.selection);
  }
  function scrollNode(id,focus=false){
    const target=nodeControl(id),viewport=$('#exploration-tree-map');if(!target||!viewport)return false;
    if(focus)target.focus({preventScroll:true});
    const item=target.getBoundingClientRect(),area=viewport.getBoundingClientRect();
    if(item.top<area.top+12)viewport.scrollTop-=area.top+12-item.top;
    else if(item.bottom>area.bottom-12)viewport.scrollTop+=item.bottom-area.bottom+12;
    return true;
  }
  function drawLines(){
    const canvas=$('#exploration-tree-canvas'),svg=$('.exploration-connections');if(!canvas||!svg||!graph)return;
    svg.replaceChildren();const box=canvas.getBoundingClientRect(),width=canvas.scrollWidth,height=canvas.scrollHeight;
    svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('width',width);svg.setAttribute('height',height);
    const shown=visibleNodes(),links=new Map();
    for(const node of graph.nodes)if(shown.has(node.id)&&node.parent&&shown.has(node.parent))links.set(node.parent+'|'+node.id+'|contains',{from:node.parent,to:node.id,type:'contains'});
    for(const edge of graph.edges||[])if(shown.has(edge.from)&&shown.has(edge.to)&&Object.hasOwn(relationLabels,edge.type)&&(edge.from===graph.selectedId||edge.to===graph.selectedId))links.set(edge.from+'|'+edge.to+'|'+edge.type,edge);
    for(const edge of links.values()){
      const from=nodeControl(edge.from)?.getBoundingClientRect(),to=nodeControl(edge.to)?.getBoundingClientRect();if(!from||!to)continue;
      const x1=from.left+from.width/2-box.left,y1=from.bottom-box.top,x2=to.left+to.width/2-box.left,y2=to.top-box.top;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      const bend=Math.max(14,Math.abs(y2-y1)/2);
      path.setAttribute('d','M '+x1+' '+y1+' C '+x1+' '+(y1+bend)+', '+x2+' '+(y2-bend)+', '+x2+' '+y2);
      path.dataset.connectionType=edge.type;svg.append(path);
    }
  }
  function scheduleLines(){cancelAnimationFrame(frame);frame=requestAnimationFrame(drawLines);}
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(scheduleLines):null;
  function render(){
    if(!session||!graph)return;
    if(composing){renderAfterComposition=true;return;}
    const focus=captureFocus(),previousScroll=$('#exploration-tree-map')?.scrollTop||0,previousSelected=container.dataset.explorationSelected,previousEmphasis=container.dataset.explorationEmphasis;
    const root=nodeById.get('exploration-root')||graph.nodes.find(node=>node.parent===null),groups=root?childNodes(root.id):[];
    const emphasis=session.exploration?.emphasis||'balanced',selected=currentNode();
    container.dataset.explorationEmphasis=emphasis;container.dataset.explorationSelected=graph.selectedId||'';container.dataset.explorationStep=String(graph.step);
    const count=graph.nodes.filter(node=>!['root','group'].includes(node.kind)).length;
    container.innerHTML='<section class="exploration-paper" aria-labelledby="exploration-tree-title"><header class="exploration-heading"><div><p>RE:Tree / 探索の地図</p><h2 id="exploration-tree-title" tabindex="-1">話したことと、見つけた道</h2></div><label class="exploration-emphasis-label" for="exploration-emphasis">表示<select id="exploration-emphasis" aria-label="地図と文章の表示"><option value="balanced"'+(emphasis==='balanced'?' selected':'')+'>地図と文章</option><option value="map"'+(emphasis==='map'?' selected':'')+'>地図を大きく</option><option value="text"'+(emphasis==='text'?' selected':'')+'>文章を中心に</option></select></label></header><p class="exploration-instruction">枝を押すと、同じ画面で詳しく読めます。'+(emphasis==='text'?'地図は小さく表示中です。':'地図の中も上下に動かせます。')+'</p><div id="exploration-tree-map" tabindex="0" role="region" aria-label="探索に合わせて育つ地図。枝を選ぶと対応する説明を表示します。"><div id="exploration-tree-canvas"><svg class="exploration-connections" aria-hidden="true" focusable="false"></svg>'+(root?'<div class="exploration-center">'+nodeMarkup(root)+'</div><div class="exploration-lanes">'+groups.map(group=>'<section class="exploration-lane" data-exploration-group="'+escape(group.id)+'">'+nodeMarkup(group)+(expanded().has(group.id)?'<ul class="exploration-children">'+childNodes(group.id).map(node=>branchMarkup(node,0)).join('')+'</ul>':'')+'</section>').join('')+'</div>':'<p>相談や探索を始めると、この場所に地図が育ちます。</p>')+'</div></div><div class="exploration-map-caption"><p id="exploration-tree-status" role="status">'+escape(selected?'選択中：'+short(selected.label,52):'いまの状況と、まだ見ていない方向も残しています。')+'</p><details class="exploration-key"><summary>地図の見方</summary><p>実線は分類の枝、点線は道の組み合わせや移行の接点です。本人の条件を満たすと確認した線ではありません。</p><p>「本人の回答」「AIの整理・未確認」「一般資料」「自分のメモ」を区別します。地図に含む項目は '+count+'件です。すべての進路を網羅した地図ではありません。</p></details></div>'+relationMarkup()+manualMarkup()+'</section>';
    resizeObserver?.disconnect();const canvas=$('#exploration-tree-canvas');if(canvas)resizeObserver?.observe(canvas);
    const viewport=$('#exploration-tree-map');if(viewport)viewport.scrollTop=previousScroll;
    restoreFocus(focus);if(graph.selectedId&&(previousSelected!==graph.selectedId||previousEmphasis!==emphasis))scrollNode(graph.selectedId);
    const growth=pendingGrowth;pendingGrowth=null;
    if(growth&&!draft&&emphasis!=='text'&&scrollNode(growth.id)){
      const added=nodeControl(growth.id);if(added)added.dataset[growth.added?'explorationAdded':'explorationUpdated']='true';
      notify(growth.message||'地図に追加：'+short(growth.label,32)+'（'+(originLabels[growth.origin]||'由来を確認')+'）');
    }
    drawLines();scheduleLines();
  }
  function startDraft(mode){
    const selected=currentNode();if(!selected)return;
    if(draft&&!confirm('書きかけの地図メモをやめて、別の項目を書きますか？'))return;
    draft={mode,id:selected.id,label:mode==='add'?'':selected.label,detail:mode==='add'?'':selected.detail||''};manualOpen=true;render();$('#exploration-note-label')?.focus();
  }
  function fail(message){const error=$('#exploration-note-error');if(error){error.textContent=message;error.focus?.();}else notify(message);}
  container.addEventListener('input',event=>{if(!draft)return;if(event.target.id==='exploration-note-label')draft.label=event.target.value;if(event.target.id==='exploration-note-detail')draft.detail=event.target.value;});
  container.addEventListener('compositionstart',()=>{composing=true;});
  container.addEventListener('compositionend',()=>{composing=false;if(renderAfterComposition){renderAfterComposition=false;render();}});
  container.addEventListener('change',event=>{if(event.target.id==='exploration-emphasis')options.onEmphasis?.(event.target.value);});
  container.addEventListener('toggle',event=>{if(event.target.classList?.contains('exploration-manual'))manualOpen=event.target.open;if(event.target.classList?.contains('exploration-relations'))relationsOpen=event.target.open;},true);
  container.addEventListener('click',event=>{
    const node=event.target.closest('[data-exploration-node]');if(node){options.onSelect?.(node.dataset.explorationNode);return;}
    const toggle=event.target.closest('[data-exploration-toggle]');if(toggle){options.onToggle?.(toggle.dataset.explorationToggle);return;}
    const action=event.target.closest('[data-exploration-action]');if(!action||action.disabled)return;
    try{
      if(action.dataset.explorationAction==='relation'){options.onSelect?.(action.dataset.explorationTarget);return;}
      if(action.dataset.explorationAction==='edit')startDraft('edit');
      else if(action.dataset.explorationAction==='add')startDraft('add');
      else if(action.dataset.explorationAction==='cancel-edit'){draft=null;render();$('[data-exploration-action="edit"]')?.focus();}
      else if(action.dataset.explorationAction==='delete'){const selected=currentNode();if(selected?.kind==='note'&&selected.origin==='manual'&&confirm('この自分のメモの枝を消しますか？'))options.onDelete?.(selected.id);}
      else if(action.dataset.explorationAction==='undo')options.onUndo?.();
      else if(action.dataset.explorationAction==='export')options.onExport?.();
    }catch(error){fail(error.message||'地図の手直しを反映できませんでした。今の内容は残っています。');}
  });
  container.addEventListener('submit',event=>{
    if(event.target.id!=='exploration-note-form')return;event.preventDefault();if(composing||!draft)return;
    const label=draft.label.trim(),detail=draft.detail.trim();if(!label){fail('地図に置く短い見出しを書いてください。');$('#exploration-note-label')?.focus();return;}
    try{const result=draft.mode==='add'?options.onAdd?.(draft.id,{label,detail}):options.onEdit?.(draft.id,{label,detail});if(result===false){fail('書き直しを反映できませんでした。文章は残しています。');return;}draft=null;render();notify('自分の言葉を地図に残しました。AIの提案や一般資料とは区別しています。');currentNode()&&scrollNode(currentNode().id);}
    catch(error){fail(error.message||'書き直しを反映できませんでした。文章は残しています。');}
  });
  return {
    update(nextSession,nextGraph){
      pendingGrowth=null;
      if(graph&&!draft&&nextSession.exploration?.emphasis!=='text'){
        const previousIds=new Set(graph.nodes.map(node=>node.id));
        const previousHighlights=new Set(graph.nodes.filter(node=>node.highlighted).map(node=>node.id));
        const newHighlights=nextGraph.nodes.filter(node=>node.kind==='route'&&node.highlighted&&!previousHighlights.has(node.id));
        const stepChanged=nextGraph.step!==graph.step,selectionChanged=nextGraph.selectedId!==graph.selectedId;
        const interesting=new Set(['answer','interpretation','correction','unknown','action','note']);
        const added=selectionChanged?[]:nextGraph.nodes.filter(node=>!previousIds.has(node.id)&&interesting.has(node.kind)&&node.origin!=='reference');
        const priority=node=>nextGraph.step===5?(node.id==='personal-actions'?0:node.kind==='action'&&node.origin==='manual'?1:node.kind==='action'?2:3):({correction:0,interpretation:1,answer:2,unknown:3,note:4,action:5}[node.kind]??6);
        for(const node of added)if(!pendingGrowth||priority(node)<=priority(pendingGrowth))pendingGrowth={...node,added:true};
        if(stepChanged&&nextGraph.step===5){
          const target=nextGraph.nodes.find(node=>node.id==='personal-actions')||nextGraph.nodes.find(node=>node.id==='group-actions');
          if(target)pendingGrowth={...target,added:false,message:target.id==='personal-actions'?'自分が次に確かめたいことを、地図でも表示しています。':'次にすることの枝を表示しています。行動は未定のままでも構いません。'};
        }else if((stepChanged&&nextGraph.step===2)||(!selectionChanged&&newHighlights.length)){
          const target=newHighlights[0]||nextGraph.nodes.find(node=>node.kind==='route'&&node.highlighted)||nextGraph.nodes.find(node=>node.id==='group-routes');
          if(target)pendingGrowth={...target,added:false,message:target.highlighted?'AIが関連を考えた道：'+short(target.label,32)+'（個別条件は未確認）':'見渡せる道を表示しています。ほかの方向も地図に残っています。'};
        }
      }
      session=nextSession;graph=nextGraph;nodeById=new Map(graph.nodes.map(node=>[node.id,node]));render();
    },
    focusNode(id){return scrollNode(id,true);},
    revealNode(id){return scrollNode(id,false);},
    setUndoAvailable(value){undoAvailable=!!value;const undo=$('[data-exploration-action="undo"]');if(undo)undo.disabled=!undoAvailable;},
    hasDraft(){return !!draft;},
    getDraft(){return draft?{...draft}:null;},
    pause(){cancelAnimationFrame(frame);},
    destroy(){resizeObserver?.disconnect();cancelAnimationFrame(frame);}
  };
}
