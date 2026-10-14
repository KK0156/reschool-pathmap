import {renderTree,renderListTree} from './tree-renderer.js';
import {layoutMindMap} from './mind-map-layout.js';
import {canvasLayout,syncPositions} from './canvas-state.js';
export function createMindMapView(host){
 const state={tree:null,selected:null,mode:'map',zoom:1,initial:true,x:0,y:0,positions:new Map(),layout:null,undo:[],expanded:false};
 const viewport=()=>host.querySelector('.mind-map-viewport');
 const clamp=z=>Math.min(3,Math.max(.005,z));
 let drag=null,suppressClick=false,addPoint=null;
 function snapshot(){state.undo.push(new Map([...state.positions].map(([id,p])=>[id,{...p}])));if(state.undo.length>30)state.undo.shift();}
 function emitChange(){host.dispatchEvent(new CustomEvent('canvas-change',{bubbles:true}));}
 function worldAt(clientX,clientY){const box=viewport().getBoundingClientRect();return {x:(clientX-box.left-state.x)/state.zoom,y:(clientY-box.top-state.y)/state.zoom};}
 function paint(){
  const stage=host.querySelector('.mind-map-stage');if(!stage)return;
  stage.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.zoom})`;
  viewport().style.backgroundPosition=`${state.x}px ${state.y}px`;
  host.querySelector('.map-zoom output').textContent=`${Math.round(state.zoom*100)}%`;
 }
 function redrawScene(){state.layout=canvasLayout(state.tree,state.positions);const space=host.querySelector('.mind-map-space');if(space){space.innerHTML=renderTree(state.tree,state.selected,state.layout);paint();}}
 function focusView(id){const n=state.layout.nodes.find(n=>n.id===id);if(!n)return;const v=viewport();state.x=v.clientWidth/2-(n.x+n.width/2)*state.zoom;state.y=v.clientHeight/2-(n.y+n.height/2)*state.zoom;paint();}
 function fit(){const v=viewport(),b=state.layout.bounds;state.zoom=clamp(Math.min(1,(v.clientWidth-30)/(b.right-b.left),(v.clientHeight-30)/(b.bottom-b.top)));state.x=v.clientWidth/2-(b.left+b.right)/2*state.zoom;state.y=v.clientHeight/2-(b.top+b.bottom)/2*state.zoom;paint();}
 function zoom(next,clientX,clientY){const v=viewport(),r=v.getBoundingClientRect(),px=clientX===undefined?v.clientWidth/2:clientX-r.left,py=clientY===undefined?v.clientHeight/2:clientY-r.top,x=(px-state.x)/state.zoom,y=(py-state.y)/state.zoom;state.zoom=clamp(next);state.x=px-x*state.zoom;state.y=py-y*state.zoom;paint();}
 function draw(){
  host.classList.toggle('canvas-expanded',state.expanded);if(state.expanded){host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label','広いキャンバス');}else{host.removeAttribute('role');host.removeAttribute('aria-modal');host.removeAttribute('aria-label');}
  host.innerHTML=`<div class="mind-map-controls" aria-label="キャンバスの操作"><div class="map-mode"><button type="button" data-map-mode="map" aria-pressed="${state.mode==='map'}">キャンバスで考える</button><button type="button" data-map-mode="list" aria-pressed="${state.mode==='list'}">一覧で読む</button></div>${state.mode==='map'?`<div class="map-zoom"><button type="button" data-map-action="out" aria-label="縮小する">−</button><output aria-label="拡大率">${Math.round(state.zoom*100)}%</output><button type="button" data-map-action="in" aria-label="拡大する">＋</button><button type="button" data-map-action="fit">全体を見る</button><button type="button" data-map-action="center">中心に戻る</button><button type="button" data-map-action="expand" aria-pressed="${state.expanded}">${state.expanded?'元の画面に戻る':'画面いっぱいに広げる'}</button></div>`:''}</div>${state.mode==='map'?`<div class="canvas-tools"><button type="button" data-map-action="add">選んだ項目に枝を追加</button><button type="button" data-map-action="arrange">枝を並べ直す</button><button type="button" data-map-action="undo" ${state.undo.length?'':'disabled'}>配置を戻す</button><span>${state.tree.nodes.length} / 200項目</span></div><p class="map-instructions">項目をドラッグして自由に配置。余白をドラッグして移動、ホイールでズーム。余白をダブルクリックすると、その場所に枝を追加できます。キーボードでは項目にフォーカスして Alt＋矢印で移動します。</p><div class="mind-map-viewport" tabindex="0" role="region" aria-label="自由なキャンバス。矢印キーで移動。項目はAltと矢印キーで配置変更。"><div class="mind-map-space"></div></div><p class="canvas-message" role="status"></p><form class="canvas-add" hidden><label for="canvas-label">新しい項目の見出し</label><input id="canvas-label" required maxlength="180" autocomplete="off"><p>選択中の項目につながる枝を、ここに追加します。</p><button type="submit">この場所に追加</button><button type="button" data-canvas-add-cancel>やめる</button></form>`:renderListTree(state.tree,state.selected)}`;
  if(state.mode==='map'){redrawScene();if(state.initial){state.initial=false;if(viewport().clientWidth>=600)fit();else focusView(state.tree.nodes.find(n=>n.parent===null).id);}}
 }
 function requestAdd(point){addPoint=point;const form=host.querySelector('.canvas-add');form.hidden=false;host.querySelector('#canvas-label').value='';host.querySelector('#canvas-label').focus();}
 host.addEventListener('submit',e=>{if(!e.target.matches('.canvas-add'))return;e.preventDefault();const label=host.querySelector('#canvas-label').value.trim();if(!label)return;host.dispatchEvent(new CustomEvent('canvas-add-node',{bubbles:true,detail:{parent:state.selected,label,position:addPoint}}));});
 host.addEventListener('click',e=>{
  if(e.target.closest('[data-canvas-add-cancel]')){host.querySelector('.canvas-add').hidden=true;return;}
  const mode=e.target.closest('[data-map-mode]');if(mode){if(state.expanded&&mode.dataset.mapMode==='list'){state.expanded=false;host.classList.remove('canvas-expanded');}state.mode=mode.dataset.mapMode;draw();host.querySelector(`[data-map-mode="${state.mode}"]`).focus({preventScroll:true});return;}
  const control=e.target.closest('[data-map-action]');if(!control)return;const action=control.dataset.mapAction;
  if(action==='center'){state.zoom=1;focusView(state.tree.nodes.find(n=>n.parent===null).id);}
  else if(action==='fit')fit();
  else if(action==='expand'){state.expanded=!state.expanded;draw();fit();}
  else if(action==='arrange'){snapshot();state.positions=new Map(layoutMindMap(state.tree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));redrawScene();fit();emitChange();}
  else if(action==='undo'){if(state.undo.length){state.positions=state.undo.pop();syncPositions(state.tree,state.positions);redrawScene();emitChange();}}
  else if(action==='add'){const n=state.layout.nodes.find(n=>n.id===state.selected);requestAdd({x:n.x+n.width+120,y:n.y});return;}
  else zoom(state.zoom*(action==='in'?1.2:1/1.2));
  const undo=host.querySelector('[data-map-action=undo]');if(undo)undo.disabled=!state.undo.length;
  host.querySelector(`[data-map-action="${action}"]`)?.focus({preventScroll:true});
 });
 host.addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();e.preventDefault();suppressClick=false;}},true);
 host.addEventListener('dblclick',e=>{if(e.target.closest('button')||!e.target.closest('.mind-map-viewport'))return;requestAdd(worldAt(e.clientX,e.clientY));});
 // Wheel zoom anchors on the pointer, without rebuilding the DOM during gestures.
 host.addEventListener('wheel',e=>{if(!e.target.closest('.mind-map-viewport'))return;e.preventDefault();zoom(state.zoom*Math.exp(-e.deltaY*.002),e.clientX,e.clientY);},{passive:false});
 const pointers=new Map();let pinch=null;
 host.addEventListener('pointerdown',e=>{
  const v=viewport();if(!v||!e.target.closest('.mind-map-viewport')||(e.pointerType==='mouse'&&e.button!==0))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.zoom,world:worldAt((a.x+b.x)/2,(a.y+b.y)/2)};drag=null;return;}
  const node=e.target.closest('[data-node]');drag={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:state.x,y:state.y,id:node?.dataset.node,original:node?{...state.positions.get(node.dataset.node)}:null,moved:false};if(!node)v.setPointerCapture(e.pointerId);
 });
 host.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()];const box=viewport().getBoundingClientRect();state.zoom=clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance));state.x=(a.x+b.x)/2-box.left-pinch.world.x*state.zoom;state.y=(a.y+b.y)/2-box.top-pinch.world.y*state.zoom;paint();return;}
  if(!drag||drag.pointer!==e.pointerId)return;const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  if(!drag.moved){viewport().setPointerCapture(e.pointerId);drag.moved=true;if(drag.id)snapshot();viewport().classList.add('panning');}
  if(drag.id){state.positions.set(drag.id,{x:drag.original.x+dx/state.zoom,y:drag.original.y+dy/state.zoom});redrawScene();}
  else{state.x=drag.x+dx;state.y=drag.y+dy;paint();}
 });
 function stop(e){pointers.delete(e.pointerId);if(drag?.moved){suppressClick=true;if(drag.id){emitChange();const undo=host.querySelector('[data-map-action=undo]');if(undo)undo.disabled=false;}}drag=null;pinch=null;setTimeout(()=>suppressClick=false,0);viewport()?.classList.remove('panning');}
 host.addEventListener('pointerup',stop);host.addEventListener('pointercancel',stop);
 host.addEventListener('scroll',e=>{const v=viewport();if(e.target!==v||(!v.scrollLeft&&!v.scrollTop))return;state.x-=v.scrollLeft;state.y-=v.scrollTop;v.scrollLeft=0;v.scrollTop=0;paint();},true);
 host.addEventListener('focusin',e=>{const node=e.target.closest('[data-node]'),v=viewport();if(!node||!v)return;const n=node.getBoundingClientRect(),box=v.getBoundingClientRect();if(n.left<box.left||n.right>box.right||n.top<box.top||n.bottom>box.bottom)focusView(node.dataset.node);});
 host.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&state.expanded){e.preventDefault();state.expanded=false;draw();host.querySelector('[data-map-action=expand]')?.focus();return;}
  if(state.expanded&&e.key==='Tab'){const focusable=[...host.querySelectorAll('button:not([disabled]),[tabindex="0"],input')].filter(el=>el.getClientRects().length),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  const dx=e.key==='ArrowRight'?40:e.key==='ArrowLeft'?-40:0,dy=e.key==='ArrowDown'?40:e.key==='ArrowUp'?-40:0,node=e.target.closest('[data-node]');
  if(node&&e.altKey&&state.mode==='map'){e.preventDefault();snapshot();const id=node.dataset.node,p=state.positions.get(id);state.positions.set(id,{x:p.x+dx,y:p.y+dy});redrawScene();host.querySelector(`[data-node="${id}"]`).focus({preventScroll:true});emitChange();host.querySelector('[data-map-action=undo]').disabled=false;}
  else if(e.target===viewport()){e.preventDefault();state.x-=dx*2.5;state.y-=dy*2.5;paint();}
 });
 return {
  render(tree,selected){state.tree=tree;state.selected=selected;if(!state.positions.size)state.positions=new Map(layoutMindMap(tree).nodes.map(n=>[n.id,{x:n.x,y:n.y}]));else syncPositions(tree,state.positions);draw();},
  reset(){state.initial=true;state.zoom=1;state.x=0;state.y=0;state.positions=new Map();state.undo=[];},
  getPositions(){return new Map([...state.positions].map(([id,p])=>[id,{...p}]));},
  restorePositions(positions){state.positions=new Map(positions);},
  setPosition(id,point){state.positions.set(id,{...point});},
  isExpanded(){return state.expanded;},
  closeExpanded(){state.expanded=false;draw();},
 };
}
