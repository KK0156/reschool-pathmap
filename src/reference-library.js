import {routeAtlas} from './route-atlas-data.js';
import {referenceCategories,getRouteReferences,getAllReferences} from './reference-sites.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes=new Map(routeAtlas.nodes.map(node=>[node.id,node]));
const kinds={official:'公的機関の資料',editorial:'学問・進路の編集情報',learning_provider:'教育機関・講座の案内'};
const pageSize=6;

function safeURL(value){
  try{
    if(typeof value!=='string')return null;
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
  }catch{return null;}
}

/** A reference is a place to investigate, never an automatic eligibility check. */
export function renderReferenceSiteCard(site,{routeId=null}={}){
  const url=safeURL(site.url),title=esc(site.title),canMemo=routes.has(routeId)&&!!url;
  const items=Array.isArray(site.checkItems)?site.checkItems.filter(item=>typeof item==='string').slice(0,3):[];
  return '<article class="reference-site-card" data-reference-id="'+esc(site.id)+'">'+
    '<div class="reference-site-meta"><span class="reference-kind">'+esc(kinds[site.kind]||'情報の種類は未確認')+'</span><span>'+esc(site.publisher)+'</span></div>'+
    '<h3>'+title+'</h3><p class="reference-purpose">'+esc(site.purpose)+'</p>'+
    (site.reason?'<p class="reference-reason"><span>この道とのつながり</span>'+esc(site.reason)+'</p>':'')+
    (items.length?'<h4>ここで確かめたいこと</h4><ul class="reference-check-items">'+items.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>':'')+
    '<div class="reference-card-actions">'+(url?'<a class="reference-external" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+title+'（別タブで開く）">サイトを開く <span aria-hidden="true">↗</span></a>':'<span class="reference-unavailable">リンクを確認できません</span>')+
    (canMemo?'<button type="button" data-reference-action="memo" data-reference-id="'+esc(site.id)+'">確認したいことをメモへ</button>':'')+'</div>'+
    '<details class="reference-review"><summary>案内を確認した範囲と、まだ確かめていないこと</summary><p>'+esc(site.reviewScope||'案内ページの確認範囲は未記録です。')+'</p>'+
    (site.reviewedOn?'<p>案内ページを確認した日：<time datetime="'+esc(site.reviewedOn)+'">'+esc(site.reviewedOn)+'</time></p>':'<p>案内ページを確認した日は未記録です。</p>')+
    '<p>'+esc(site.limitations||'個別の募集・費用・本人が利用できる条件は未確認です。')+'</p><p class="reference-review-note">この日付は、最新の募集や、本人の利用条件を確認した日ではありません。</p></details></article>';
}

/** The view keeps only its filters. Finder continues to own all exploration data. */
export function mountReferenceLibrary(container,{onBack=()=>{},onMemo=()=>{}}={}){
  container.classList.add('reference-library');
  container.hidden=true;
  const state={routeId:null,allSites:true,category:'all',limit:pageSize};
  const categories=new Set(referenceCategories.map(category=>category.id));
  const getEntries=()=>state.allSites||!state.routeId?getAllReferences({category:state.category}):getRouteReferences(state.routeId,{category:state.category});
  function render(focusSelector=null){
    const route=routes.get(state.routeId),entries=getEntries(),shown=entries.slice(0,state.limit);
    const routeLabel=route?.title.split(/[：:]/,1)[0];
    const title=state.allSites||!route?'参考サイトから調べる':routeLabel+'の参考サイト';
    const openReviews=new Set([...container.querySelectorAll('.reference-site-card:has(details[open])')].map(card=>card.dataset.referenceId));
    const categoryOpen=!!container.querySelector('.reference-category-menu[open]');
    container.innerHTML='<section class="reference-library-paper" aria-labelledby="reference-library-title"><nav class="reference-return" aria-label="探索へ戻る"><button type="button" data-reference-action="back">← 元の画面に戻る</button></nav>'+
      '<p class="reference-kicker">参考サイトを使って調べる</p><h2 id="reference-library-title" tabindex="-1">'+esc(title)+'</h2>'+
      '<p class="reference-introduction">'+(route&&!state.allSites?'授業や仕事の中身、必要な条件などを、別の説明や資料でも確かめられます。':'学問や仕事の中身、制度や費用など、知りたいことから参照先を選べます。')+'</p>'+
      '<p class="reference-boundary">別タブで開きます。回答・メモは送りません。リンク先の本文はAIへ読み込まれません。</p>'+
      (route?'<div class="reference-scopes" role="group" aria-label="参考サイトの範囲"><button type="button" data-reference-action="scope-route" aria-label="この道に関係する参考サイト" aria-pressed="'+!state.allSites+'">この道の参照先</button><button type="button" data-reference-action="scope-all" aria-label="すべての参考サイトから探す" aria-pressed="'+state.allSites+'">すべての参照先</button></div>':'')+
      '<details class="reference-category-menu"'+(categoryOpen?' open':'')+'><summary>知りたいことから絞る · '+esc(referenceCategories.find(category=>category.id===state.category)?.label||'すべて')+'</summary><fieldset class="reference-categories"><legend>知りたいこと</legend><div>'+referenceCategories.map(category=>'<button type="button" data-reference-category="'+esc(category.id)+'" aria-pressed="'+(category.id===state.category)+'">'+esc(category.label)+'</button>').join('')+'</div></fieldset></details>'+
      '<p id="reference-library-count" class="reference-count" role="status" aria-atomic="true">'+entries.length+'件の参照先'+(shown.length<entries.length?' · まず'+shown.length+'件を表示':'')+'</p>'+
      (entries.length?'<div class="reference-site-list">'+shown.map(site=>renderReferenceSiteCard(site,{routeId:state.routeId})).join('')+'</div>':'<p class="reference-empty">この分類の参照先は、まだ掲載していません。「すべて」や「ほかの参考サイト」からも探せます。</p>')+
      (shown.length<entries.length?'<button type="button" class="reference-more" data-reference-action="more">続きを見る（あと'+(entries.length-shown.length)+'件）</button>':'')+
      '<p class="reference-closing">説明が違って見えたところや残った疑問は、探索へ戻ってメモに残せます。入学・応募・参加の条件は、対象の学校や窓口で確かめてください。</p></section>';
    for(const card of container.querySelectorAll('.reference-site-card')){
      if(openReviews.has(card.dataset.referenceId))card.querySelector('details').open=true;
    }
    if(focusSelector)container.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function click(event){
    const category=event.target.closest('[data-reference-category]');
    if(category&&container.contains(category)&&categories.has(category.dataset.referenceCategory)){
      state.category=category.dataset.referenceCategory;state.limit=pageSize;render('[data-reference-category="'+state.category+'"]');return;
    }
    const control=event.target.closest('[data-reference-action]');
    if(!control||!container.contains(control)||control.disabled)return;
    const action=control.dataset.referenceAction;
    if(action==='back'){onBack();return;}
    if(action==='memo'){
      const id=control.dataset.referenceId,site=getEntries().find(item=>item.id===id);
      if(routes.has(state.routeId)&&site&&safeURL(site.url))onMemo({routeId:state.routeId,referenceId:id,url:safeURL(site.url)});
      return;
    }
    if(action==='scope-route'||action==='scope-all'){
      state.allSites=action==='scope-all';state.category='all';state.limit=pageSize;render('[data-reference-action="'+action+'"]');return;
    }
    if(action==='more'){
      const previousCount=Math.min(state.limit,getEntries().length);state.limit+=pageSize;render();
      container.querySelectorAll('.reference-site-card')[previousCount]?.querySelector('a,summary')?.focus({preventScroll:true});
    }
  }
  container.addEventListener('click',click);
  return {
    open({routeId=null,allSites=false}={}){
      const validRoute=routes.has(routeId)?routeId:null,nextAll=allSites===true||!validRoute;
      if(validRoute!==state.routeId||nextAll!==state.allSites){state.category='all';state.limit=pageSize;}
      state.routeId=validRoute;state.allSites=nextAll;container.hidden=false;render();
      container.querySelector('#reference-library-title')?.focus({preventScroll:true});
      return true;
    },
    close(){container.hidden=true;},
    pause(){},
    destroy(){container.removeEventListener('click',click);container.replaceChildren();container.classList.remove('reference-library');container.hidden=true;}
  };
}
