import {nodeTypes,validateTree} from './tree-renderer.js';

// This contract deliberately carries no original memo, grades, IDs or whole tree.
export const proposalIntents={
 alternatives:'ほかの選択肢を探す',
 counterargument:'別の見方・反論を考える',
 evidence:'確かめる資料を整理する',
 compare:'二つの選択肢を比べる',
 action:'次にできることを考える'
};
export const proposalTypes=['project','hypothesis','evidence','counterargument','risk','person','action','research_note'];
export const proposalFields=['label','type','detail','evidence','risk','next_action'];
export const MAX_PROPOSAL_REQUEST_BYTES=32768;
const exact=(o,keys)=>!!(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)));
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const fieldsValid=(node,maxLength,allowed)=>exact(node,proposalFields)&&text(node.label,180)&&allowed.includes(node.type)&&['detail','evidence','risk','next_action'].every(k=>text(node[k],maxLength));
export function validateProposalRequest(value){
 if(!exact(value,['question','node','intent','comparison'])||!text(value.question,300)||!Object.hasOwn(proposalIntents,value.intent)||!fieldsValid(value.node,900,Object.keys(nodeTypes)))return false;
 if(value.intent==='compare'){if(!fieldsValid(value.comparison,900,Object.keys(nodeTypes)))return false;}
 else if(value.comparison!==null)return false;
 return new TextEncoder().encode(JSON.stringify(value)).length<=MAX_PROPOSAL_REQUEST_BYTES;
}
export function validateProposal(value){
 return exact(value,['summary','suggestions'])&&text(value.summary,1000)&&Array.isArray(value.suggestions)&&value.suggestions.length>0&&value.suggestions.length<=5&&value.suggestions.every(n=>fieldsValid(n,1800,proposalTypes));
}
export function buildProposalContext(node){
 if(!node||!Object.hasOwn(nodeTypes,node.type))throw new Error('相談する項目を選んでください。');
 const result=Object.fromEntries(proposalFields.map(key=>[key,typeof node[key]==='string'?node[key].trim().slice(0,key==='label'?180:key==='type'?40:900):'']));
 if(!fieldsValid(result,900,Object.keys(nodeTypes)))throw new Error('項目の内容を確認してください。');
 return result;
}
export function createProposalRequest(tree,selected,intent,comparisonId=null){
 if(!validateTree(tree))throw new Error('図の形式を確認してください。');
 const node=tree.nodes.find(n=>n.id===selected);
 if(!node)throw new Error('相談する項目を選んでください。');
 if(intent==='compare'&&(!comparisonId||comparisonId===selected))throw new Error('比較する別の項目を選んでください。');
 const comparison=intent==='compare'?tree.nodes.find(n=>n.id===comparisonId):null;
 if(intent==='compare'&&!comparison)throw new Error('比較する項目が見つかりません。');
 const request={question:tree.core_question,node:buildProposalContext(node),intent,comparison:comparison?buildProposalContext(comparison):null};
 if(!validateProposalRequest(request))throw new Error('送信内容の形式や文字数を確認してください。');
 return request;
}
export function applyProposal(tree,parentId,proposal){
 if(!validateTree(tree)||!validateProposal(proposal)||!tree.nodes.some(n=>n.id===parentId))throw new Error('提案または枝のつながりを確認してください。');
 if(tree.nodes.length+proposal.suggestions.length>200)throw new Error('項目は200個までです。必要な項目だけを選んでください。');
 const next=structuredClone(tree),ids=new Set(next.nodes.map(n=>n.id)),addedIds=[];
 let index=1;
 for(const suggestion of proposal.suggestions){
  while(ids.has(`proposal-${index}`))index++;
  const id=`proposal-${index++}`;ids.add(id);addedIds.push(id);
  next.nodes.push({id,parent:parentId,...structuredClone(suggestion)});
 }
 if(!validateTree(next))throw new Error('枝の深さは12段までです。別の項目につなぐことを検討してください。');
 return {tree:next,addedIds};
}
