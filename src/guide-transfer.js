import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
import {validateFinderGuide} from './finder-file.js';
import {routeAtlas} from './route-atlas-data.js';

// Keep general reference material as reference. AI explanations are separate,
// explicitly accepted hypotheses; a correction or personal memo stays manual.
export function enrichGuideTransfer(transfer,{atlasIds=[],guide=null,notes='',nextActions=''}={}){
  if(transfer?.origin!=='reference'||!validateTree(transfer.tree)||guide!==null&&!validateFinderGuide(guide)||![notes,nextActions].every(text=>typeof text==='string'&&text.length<=3000))throw new Error('引き継ぐ内容を確認してください。');
  const result=structuredClone(transfer),root=result.tree.nodes.find(node=>node.parent===null),projects=result.tree.nodes.filter(node=>node.parent===root.id&&node.type==='project');
  if(atlasIds.length!==projects.length||atlasIds.some((id,index)=>routeAtlas.nodes.find(node=>node.id===id)?.title!==projects[index].label))throw new Error('候補の対応を確認してください。');
  let serial=0;
  const add=(label,type,detail,origin,parent=root.id,risk='記録された内容や、本人の条件への当てはまりは未確認です。')=>{
    const id='guide-note-'+(++serial);
    result.tree.nodes.push({id,parent,label,type,detail,evidence:origin==='ai_proposal'?'AIが回答との関連を考えた提案です。本人が図への追加を選びました。出典や個別条件を確認した証拠ではありません。':'本人が画面に反映した記録です。資料や事実の検証とは別です。',risk,next_action:'内容とまだ分からないことを見直し、何を小さく確かめるか書き加える。'});
    result.nodeOrigins[id]=origin;
  };
  (guide?.routes||[]).forEach(route=>{
    const index=atlasIds.indexOf(route.atlasId);if(index<0)return;
    add('AIがこの道を挙げた理由（未確認）','hypothesis',(guide.stale?'以前の回答に基づく理由です。条件変更・復元後の見直しが必要です。\n':'')+route.reason+(guide.correspondence==='not_saved'?'\n元の回答は未保存です。発言との対応関係は未確認です。':''),'ai_proposal',projects[index].id,route.unknowns.join('\n'));
  });
  (guide?.userCorrections||[]).forEach(item=>add('本人が直したこと','research_note',item.text,'manual'));
  (guide?.nextActions||[]).forEach(item=>add('AIが挙げた次の一歩（提案）','action',(guide.stale?'以前の条件による提案です。見直しが必要です。\n':'')+item.text,'ai_proposal'));
  for(const [label,type,value] of [['本人の確認メモ','research_note',notes],['本人が次に確かめたいこと','action',nextActions]]){
    for(let offset=0;offset<value.trim().length;offset+=1600)add(label+(value.length>1600?'（続きあり）':''),type,value.trim().slice(offset,offset+1600),'manual');
  }
  if(serial)result.tree.summary=(result.tree.summary+' 一般資料、AIの未確認の補足、本人の訂正・記録は項目ごとに由来を分けています。').slice(0,1500);
  if(!validateTree(result.tree))throw new Error('引き継ぐ図の形式を確認してください。');
  return result;
}
