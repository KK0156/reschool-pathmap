import {renderTree,renderListTree} from './tree-renderer.js';
export function createMindMapView(host){
 const state={tree:null,selected:null,mode:'map',zoom:1,initial:true,left:0,top:0};
 const viewport=()=>host.querySelector('.mind-map-viewport');
 const clamp=z=>Math.min(1.5,Math.max(.08,z));
 function draw(){
  const old=viewport();if(old){state.left=old.scrollLeft;state.top=old.scrollTop;}
  host.innerHTML=`<div class="mind-map-controls" aria-label="ツリーの表示方法"><div class="map-mode"><button type="button" data-map-mode="map" aria-pressed="${state.mode==='map'}">枝のつながりを見る</button><button type="button" data-map-mode="list" aria-pressed="${state.mode==='list'}">一覧で読む</button></div>${state.mode==='map'?`<div class="map-zoom"><button type="button" data-map-action="out" aria-label="縮小する">−</button><output aria-label="拡大率">${Math.round(state.zoom*100)}%</output><button type="button" data-map-action="in" aria-label="拡大する">＋</button><button type="button" data-map-action="fit">全体を見る</button><button type="button" data-map-action="center">中心に戻る</button></div>`:''}</div>${state.mode==='map'?'<p class="map-instructions">中心の問いから左右に枝が伸びています。項目を押すと詳細や編集を開けます。空いている場所をドラッグ／スワイプして移動できます。</p><div class="mind-map-viewport" tabindex="0" role="region" aria-label="マインドツリー。矢印キーで移動できます。"><div class="mind-map-space">'+renderTree(state.tree,state.selected)+'</div></div>':renderListTree(state.tree,state.selected)}`;
  if(state.mode==='map'){
   const stage=host.querySelector('.mind-map-stage'),space=host.querySelector('.mind-map-space'),v=viewport();
   if(state.initial&&v.clientWidth>=600)state.zoom=clamp(Math.min(1,(v.clientWidth-30)/Number(stage.dataset.width),(v.clientHeight-30)/Number(stage.dataset.height)));
   const width=Number(stage.dataset.width)*state.zoom,height=Number(stage.dataset.height)*state.zoom;
   const spaceWidth=Math.max(v.clientWidth,width),spaceHeight=Math.max(v.clientHeight,height);
   stage.style.transform=`scale(${state.zoom})`;stage.style.left=`${(spaceWidth-width)/2}px`;stage.style.top=`${(spaceHeight-height)/2}px`;space.style.width=`${spaceWidth}px`;space.style.height=`${spaceHeight}px`;
   host.querySelector('.map-zoom output').textContent=`${Math.round(state.zoom*100)}%`;
   if(state.initial){state.initial=false;center();}else{v.scrollLeft=state.left;v.scrollTop=state.top;}
  }
 }
 function center(){
  const v=viewport();if(!v)return;const core=host.querySelector('.mind-map-core');
  v.scrollLeft=parseFloat(host.querySelector('.mind-map-stage').style.left)+(parseFloat(core.style.left)+parseFloat(core.style.width)/2)*state.zoom-v.clientWidth/2;
  v.scrollTop=parseFloat(host.querySelector('.mind-map-stage').style.top)+(parseFloat(core.style.top)+parseFloat(core.style.height)/2)*state.zoom-v.clientHeight/2;
 }
 function zoom(next){
  const v=viewport(),x=(v.scrollLeft+v.clientWidth/2-parseFloat(host.querySelector('.mind-map-stage').style.left))/state.zoom,y=(v.scrollTop+v.clientHeight/2-parseFloat(host.querySelector('.mind-map-stage').style.top))/state.zoom;
  state.zoom=clamp(next);draw();viewport().scrollLeft=x*state.zoom+parseFloat(host.querySelector('.mind-map-stage').style.left)-viewport().clientWidth/2;viewport().scrollTop=y*state.zoom+parseFloat(host.querySelector('.mind-map-stage').style.top)-viewport().clientHeight/2;
 }
 host.addEventListener('click',e=>{
  const mode=e.target.closest('[data-map-mode]');if(mode){state.mode=mode.dataset.mapMode;draw();host.querySelector(`[data-map-mode="${state.mode}"]`).focus({preventScroll:true});return;}
  const control=e.target.closest('[data-map-action]');if(!control)return;
  const action=control.dataset.mapAction;
  if(action==='center'){state.zoom=1;draw();center();}
  else if(action==='fit'){const v=viewport(),stage=host.querySelector('.mind-map-stage');zoom(Math.min((v.clientWidth-24)/Number(stage.dataset.width),(v.clientHeight-24)/Number(stage.dataset.height)));center();}
  else zoom(state.zoom*(action==='in'?1.2:1/1.2));
  host.querySelector(`[data-map-action="${action}"]`).focus({preventScroll:true});
 });
 // Pointer drag on the background; node buttons retain click and keyboard behavior.
 let drag=null;
 host.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('button')||!e.target.closest('.mind-map-viewport'))return;const v=viewport();drag={x:e.clientX,y:e.clientY,left:v.scrollLeft,top:v.scrollTop};v.setPointerCapture(e.pointerId);v.classList.add('panning');});
 host.addEventListener('pointermove',e=>{if(!drag)return;const v=viewport();v.scrollLeft=drag.left-(e.clientX-drag.x);v.scrollTop=drag.top-(e.clientY-drag.y);});
 const stop=()=>{drag=null;viewport()?.classList.remove('panning');};host.addEventListener('pointerup',stop);host.addEventListener('pointercancel',stop);
 host.addEventListener('keydown',e=>{
  if(e.target!==viewport()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();viewport().scrollBy({left:e.key==='ArrowRight'?100:e.key==='ArrowLeft'?-100:0,top:e.key==='ArrowDown'?100:e.key==='ArrowUp'?-100:0});
 });
 return {render(tree,selected){state.tree=tree;state.selected=selected;draw();},reset(){state.initial=true;state.zoom=1;state.left=0;state.top=0;},};
}
