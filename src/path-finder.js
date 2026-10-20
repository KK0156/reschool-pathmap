import {mountRouteAtlas} from './route-atlas.js';
import {mountRouteDiscovery} from './route-discovery.js';

// Two retained tools. Reading the catalogue never requires an AI request or a
// university preference. Optional AI input stays in its own, consented form.
export function mountPathFinder(container,{onTransfer=()=>false}={}) {
  container.classList.add('path-finder');
  container.innerHTML='<div class="finder-modes" role="group" aria-label="道の探し方"><button type="button" data-finder-mode="all" aria-pressed="true">全体マップを見る</button><button type="button" data-finder-mode="ai" aria-pressed="false">AIと考える（任意）</button></div><p class="finder-mode-note" id="finder-mode-note"></p><div id="finder-tool-host"></div>';
  const host=container.querySelector('#finder-tool-host');
  const note=container.querySelector('#finder-mode-note');
  const atlasElement=document.createElement('div');
  let mode='all',discoveryElement=null,discovery=null;
  const atlas=mountRouteAtlas(atlasElement,{
    onTransfer,
    onConsult:options=>show('ai',options||{}),
    onDiscoveryReturn:()=>show('ai')
  });
  function ai() {
    if(!discovery){
      discoveryElement=document.createElement('div');
      discovery=mountRouteDiscovery(discoveryElement,{
        onTransfer,
        onResults:result=>atlas.setHighlights(result),
        onShowAtlas:()=>show('all',{overview:true})
      });
    }
    return discovery;
  }
  function show(next,options={},syncUrl=true) {
    if(next!=='all'&&next!=='ai')return;
    if(mode!==next){discovery?.pause();atlas.pause();}
    mode=next;
    for(const button of container.querySelectorAll('[data-finder-mode]'))button.setAttribute('aria-pressed',String(button.dataset.finderMode===mode));
    note.textContent=mode==='all'
      ?'質問に答えず、学び方・働き方を見渡せます。AIが取り上げなかった道も残っています。'
      :'ここで並ぶのは、今回AIが注目した候補の一部です。全体マップの条件メモは、自動ではAIへ送りません。';
    const element=mode==='all'?atlasElement:(ai(),discoveryElement);
    if(host.firstElementChild!==element)host.replaceChildren(element);
    if(mode==='all')atlas.open(options);else discovery.open(options);
    if(syncUrl&&location.hash.startsWith('#/finder'))history.replaceState(null,'','#/finder?mode='+mode);
  }
  container.addEventListener('click',event=>{
    const button=event.target.closest('[data-finder-mode]');
    if(button)show(button.dataset.finderMode,button.dataset.finderMode==='all'?{overview:true}:{});
  });
  return {
    open({mode:requested,lens,node,mapDemo,topic,demo}={}) {
      const next=topic||demo?'ai':mapDemo||lens||node?'all':requested||mode;
      show(next,next==='all'?{...(lens?{lens}:{}),...(node?{node}:{}),...(mapDemo?{demo:mapDemo}:{}),...(requested==='all'&&!lens&&!node&&!mapDemo?{overview:true}:{})}:{...(topic?{topic}:{}),...(demo?{demo}:{})},false);
    },
    pause(){discovery?.pause();atlas.pause();}
  };
}
