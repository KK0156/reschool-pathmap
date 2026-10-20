import {routeAtlas} from './route-atlas-data.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';

export const atlasFacetLabels=Object.freeze({learning:'学ぶ内容',life:'実際の生活',cost:'費用',income:'収入',requirements:'必要な条件',duration:'期間',future:'その先の選択肢',change:'途中で変えるには'});
export const atlasStatusLabels=Object.freeze({considering:'検討中',needs_check:'条件確認が必要',unresearched:'未調査',constraint_recorded:'確認した制約（本人の記録）'});
export const subjectOptions=Object.freeze(['国語','数学','英語','理科','社会','情報','芸術','家庭・生活','体育・スポーツ']);
const unsafe=new Set(['__proto__','constructor','prototype']);
const text=(value,max,required=true)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
const idValid=value=>text(value,80)&&/^[a-zA-Z0-9_-]+$/.test(value)&&!unsafe.has(value.toLowerCase());
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>!!plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')&&d.enumerable;});
const array=(value,min,max,predicate)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length>=min&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>i).every(i=>{const d=Object.getOwnPropertyDescriptor(value,String(i));return d&&Object.hasOwn(d,'value')&&d.enumerable&&predicate(d.value);});
export function validateAtlasPreferences(value){
 try{return exact(value,['wish','subjects','timing','budget'])&&text(value.wish,300,false)&&array(value.subjects,0,subjectOptions.length,v=>subjectOptions.includes(v))&&new Set(value.subjects).size===value.subjects.length&&['undecided','soon','later'].includes(value.timing)&&['undecided','concern'].includes(value.budget);}catch{return false;}
}
const httpsUrl=value=>{
 if(!text(value,2000))return false;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!!url.hostname&&url.hostname!=='localhost';}catch{return false;}
};
const pastDate=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value&&value<=new Date().toISOString().slice(0,10);
};
export function validateAtlasRecord(value){
 try{
  if(!exact(value,['state','note','sourceUrl','checkedOn'])||!Object.hasOwn(atlasStatusLabels,value.state)||!text(value.note,700,false)||!text(value.sourceUrl,2000,false)||!text(value.checkedOn,10,false))return false;
  if(value.sourceUrl&&!httpsUrl(value.sourceUrl))return false;
  if(value.checkedOn&&!pastDate(value.checkedOn))return false;
  if(value.state==='constraint_recorded')return value.note.trim().replace(/\s/g,'').length>=12&&(value.note.match(/[\p{L}\p{N}]/gu)||[]).length>=8&&!/^(?:未確認|不明|なし|未調査|[\s.。・\-ー_？?！!])+$/.test(value.note.trim())&&httpsUrl(value.sourceUrl)&&pastDate(value.checkedOn)&&!['未確認','不明','なし','未調査'].some(word=>value.note.trim()===word);
  return true;
 }catch{return false;}
}

// Aliases retain the same ordered labels for presentation code.
export const atlasFacets=atlasFacetLabels;
export const atlasStateLabels=atlasStatusLabels;
const facetKeys=Object.keys(atlasFacetLabels);
const strings=(value,min=0,max=12,length=400)=>array(value,min,max,v=>text(v,length));
const facetValid=value=>exact(value,facetKeys)&&facetKeys.every(key=>text(value[key],1400));
const nodeValid=node=>exact(node,['id','title','kind','summary','facets','examples','questions','nextStep','sourceIds','tags'])&&idValid(node.id)&&text(node.title,120)&&['group','route'].includes(node.kind)&&text(node.summary,900)&&facetValid(node.facets)&&strings(node.examples,1,8,400)&&strings(node.questions,1,8,400)&&text(node.nextStep,900)&&array(node.sourceIds,0,12,idValid)&&new Set(node.sourceIds).size===node.sourceIds.length&&strings(node.tags,1,20,80)&&new Set(node.tags).size===node.tags.length;
const edgeValid=edge=>exact(edge,['from','to','type','label','condition','sourceIds','verification'])&&idValid(edge.from)&&idValid(edge.to)&&edge.from!==edge.to&&['contains','related','combine','transition'].includes(edge.type)&&text(edge.label,200)&&text(edge.condition,900)&&array(edge.sourceIds,0,12,idValid)&&['general','unverified'].includes(edge.verification);
export function getAtlasNode(id,catalogue=routeAtlas){return catalogue?.nodes?.find(node=>node.id===id);}
export function getAtlasChildren(id,catalogue=routeAtlas){
 const ids=new Set(catalogue?.edges?.filter(edge=>edge.type==='contains'&&edge.from===id).map(edge=>edge.to)||[]);
 return (catalogue?.nodes||[]).filter(node=>ids.has(node.id));
}
export function getAtlasConnections(id,catalogue=routeAtlas){return (catalogue?.edges||[]).filter(edge=>edge.type!=='contains'&&(edge.from===id||edge.to===id));}
export function getAtlasRoots(lensId,catalogue=routeAtlas){
 const lens=catalogue?.lenses?.find(item=>item.id===lensId);return lens?lens.rootIds.map(id=>getAtlasNode(id,catalogue)).filter(Boolean):[];
}
const defaults=()=>({wish:'',subjects:[],timing:'undecided',budget:'undecided'});
const normal=value=>value.normalize('NFKC').toLowerCase();
const subjectTerms={国語:['国語','文章','文学','言葉'],数学:['数学','統計','データ'],英語:['英語','語学','海外'],理科:['理科','生物','化学','物理','科学'],社会:['社会','歴史','地理','政治','経済'],情報:['情報','プログラム','データ'],芸術:['芸術','美術','音楽','デザイン'],'家庭・生活':['家庭','生活','食','保育'],'体育・スポーツ':['体育','スポーツ','運動']};
export function assessAtlasNode(node,{preferences=defaults(),considering=new Set(),visited=new Set(),records={}}={}){
 if(!nodeValid(node)||!validateAtlasPreferences(preferences))throw new Error('道や任意条件の内容を確認してください。');
 if(!plain(records))throw new Error('本人の記録の形式を確認してください。');
 const descriptor=Object.getOwnPropertyDescriptor(records,node.id);
 if(descriptor&&!Object.hasOwn(descriptor,'value'))throw new Error('本人の記録の形式を確認してください。');
 const record=descriptor?descriptor.value:null;
 if(descriptor&&!validateAtlasRecord(record))throw new Error('本人の記録の内容・出典・確認日を確認してください。');
 const isConsidering=considering instanceof Set&&considering.has(node.id),isVisited=visited instanceof Set&&visited.has(node.id);
 const state=record?.state||(isConsidering?'considering':'unresearched');
 const body=normal([node.title,node.summary,...node.tags].join(' ')),highlights=[];
 const matched=node.tags.find(tag=>tag.length>=2&&normal(preferences.wish).includes(normal(tag)));
 if(matched)highlights.push(`関心語「${matched}」と関係する一般資料です。本人への適性を示すものではありません。`);
 const subjects=preferences.subjects.filter(subject=>subjectTerms[subject].some(term=>body.includes(normal(term))));
 if(subjects.length)highlights.push(`選んだ科目「${subjects.join('・')}」とのつながりを考える候補です。履修条件は別に確認が必要です。`);
 if(preferences.budget==='concern')highlights.push('費用・支援制度・働きながら学ぶ条件も確認できます。金額や利用資格は個別に確認してください。');
 if(preferences.timing==='soon')highlights.push('準備期間・募集時期・必要な手続きを個別に確認してください。');
 if(preferences.timing==='later')highlights.push('時期を変える・途中で学び直す選択肢も残せます。実際の条件は未確認です。');
 return {state,label:atlasStatusLabels[state],visited:isVisited,considering:isConsidering,recorded:!!record,note:record?.note||'',sourceUrl:record?.sourceUrl||'',checkedOn:record?.checkedOn||'',highlights};
}
export function matchAtlasHighlights(routes,catalogue=routeAtlas){
 if(!array(routes,0,80,route=>plain(route)&&['id','title','description'].every(key=>{const d=Object.getOwnPropertyDescriptor(route,key);return d&&Object.hasOwn(d,'value')&&d.enumerable;})&&idValid(route.id)&&text(route.title,120)&&text(route.description,900)))return [];
 const matches=[];
 for(const node of catalogue.nodes||[]){
  const terms=[...new Set([node.title,...node.tags].map(value=>value.trim()).filter(value=>value.length>=2))];
  const ids=[],found=new Set();
  for(const route of routes){
   const body=normal(route.title+' '+route.description),hits=terms.filter(term=>body.includes(normal(term)));
   if(hits.length){ids.push(route.id);hits.forEach(term=>found.add(term));}
  }
  if(ids.length)matches.push({nodeId:node.id,routeIds:[...new Set(ids)],terms:[...found]});
 }
 return matches;
}
const bounded=(value,max=1800)=>value.length<=max?value:value.slice(0,max-9)+'…（続きは省略）';
const facetText=(node,keys)=>keys.map(key=>`${atlasFacetLabels[key]}：${bounded(node.facets[key],760)}`).join('\n\n');
export function createAtlasTransfer(nodes,{records={},preferences=defaults()}={}){
 if(!array(nodes,1,6,nodeValid)||new Set(nodes.map(node=>node.id)).size!==nodes.length||!validateAtlasPreferences(preferences)||!plain(records))throw new Error('残す道を1〜6件選び、任意条件を確認してください。');
 for(const key of Reflect.ownKeys(records)){const d=Object.getOwnPropertyDescriptor(records,key);if(typeof key!=='string'||!idValid(key)||!d||!Object.hasOwn(d,'value')||!validateAtlasRecord(d.value))throw new Error('本人の記録の形式を確認してください。');}
 const reference='全体マップの一般資料を本人が選んで取り込んだ内容です。本人の履修・応募・費用・参加資格は未確認です。';
 const tree={core_question:preferences.wish.trim()||'気になる道を、何から確かめる？',summary:reference+'候補の並びは優劣や適性を示しません。根拠は公式の説明で確認し、先生・保護者など信頼できる人と相談してください。',nodes:[]};
 const personalNotes=[preferences.subjects.length?'本人が選んだ科目：'+preferences.subjects.join('・'):null,preferences.timing==='soon'?'時期の関心：近い時期。具体的な期限・条件は未確認。':preferences.timing==='later'?'時期の関心：後から考えたい。利用できる制度は未確認。':null,preferences.budget==='concern'?'費用が気になる。具体的な予算・支援制度の資格は未確認。':null].filter(Boolean);
 const personalIds=new Set(preferences.wish.trim()||personalNotes.length?['root']:[]);
 tree.nodes.push({id:'root',parent:null,label:bounded(tree.core_question,180),type:'core_question',detail:tree.core_question+(personalNotes.length?'\n\n本人の任意メモ（未確認）：\n'+personalNotes.join('\n'):''),evidence:personalIds.has('root')?'本人が入力した希望や科目のメモです。資料の確認結果や、進路への適格性を示すものではありません。':reference,risk:'資料の分類は、本人が進める道を判定したものではありません。',next_action:'必要な条件と、自分で確かめたいことを書き加える。'});
 nodes.forEach((node,index)=>{
  const id=`atlas-${index+1}`,record=Object.hasOwn(records,node.id)?records[node.id]:null;
  if(record)personalIds.add(id+'-record');
  const shared={parent:id,evidence:reference,risk:'制度・費用・履修条件・最新情報と、本人の条件は個別に確認してください。',next_action:node.nextStep};
  const sources=node.sourceIds.map(sourceId=>routeAtlas.sources.find(source=>source.id===sourceId)).filter(Boolean).map(source=>source.title).join('、');
  tree.nodes.push({id,parent:'root',label:node.title,type:'project',detail:bounded(node.summary+'\n\n'+facetText(node,['learning','life'])),evidence:bounded(reference+(sources?'\n参照先の一般資料：'+sources:'\n参照先の確認が必要です。')),risk:facetText(node,['requirements']),next_action:node.nextStep});
  tree.nodes.push(
   {id:id+'-cost',...shared,label:'費用と収入を確認する',type:'research_note',detail:facetText(node,['cost','income'])},
   {id:id+'-requirements',...shared,label:'必要な条件と期間を確認する',type:'research_note',detail:facetText(node,['requirements','duration'])},
   {id:id+'-future',...shared,label:'その先の道と、途中で変える方法',type:'hypothesis',detail:facetText(node,['future','change'])},
   {id:id+'-action',...shared,label:'次に調べる・聞く・試すこと',type:'action',detail:bounded(node.nextStep+'\n\n問いかけ：\n'+node.questions.map(question=>'・'+question).join('\n'))},
   {id:id+'-record',...shared,label:'本人の確認メモ（資料の検証とは別）',type:'research_note',evidence:record?'本人が画面に記録した確認メモです。アプリが出典や条件を検証した記録ではありません。':reference,detail:record?bounded(atlasStatusLabels[record.state]+'\n本人の記録であり、アプリが制約や資格を確認したものではありません。\n'+(record.note||'詳しい内容は未確認。')+(record.sourceUrl?'\n本人が記録した出典：'+record.sourceUrl:'')+(record.checkedOn?'\n本人が記録した確認日：'+record.checkedOn:'')):'本人による条件確認は未記録です。一般資料だけで進める・進めないを判断しません。'}
  );
 });
 if(!validateTree(tree,{maxNodes:40}))throw new Error('編集用の図へ引き継ぐ内容を確認してください。');
 return {tree,origin:'reference',nodeOrigins:Object.fromEntries(tree.nodes.map(node=>[node.id,personalIds.has(node.id)?'manual':'reference']))};
}
const sourceValid=source=>exact(source,['id','title','url','authority','status','reviewedOn','scope','limitations'])&&idValid(source.id)&&text(source.title,300)&&httpsUrl(source.url)&&text(source.authority,300)&&['reviewed','unreviewed'].includes(source.status)&&(source.status==='reviewed'?pastDate(source.reviewedOn):source.reviewedOn===null)&&text(source.scope,2000)&&text(source.limitations,2000);
export function validateRouteAtlas(catalogue){
 try{
  if(!exact(catalogue,['version','title','description','coverage','sources','lenses','nodes','edges','demos'])||catalogue.version!==1||!text(catalogue.title,200)||!text(catalogue.description,2000))return false;
  if(!exact(catalogue.coverage,['scope','limitations','notIncluded'])||!text(catalogue.coverage.scope,2000)||!strings(catalogue.coverage.limitations,1,30,700)||!strings(catalogue.coverage.notIncluded,1,30,700))return false;
  if(!array(catalogue.sources,1,100,sourceValid)||new Set(catalogue.sources.map(source=>source.id)).size!==catalogue.sources.length)return false;
  if(!array(catalogue.nodes,1,600,nodeValid)||new Set(catalogue.nodes.map(node=>node.id)).size!==catalogue.nodes.length)return false;
  const ids=new Set(catalogue.nodes.map(node=>node.id)),sources=new Set(catalogue.sources.map(source=>source.id));
  if(catalogue.nodes.some(node=>node.sourceIds.some(id=>!sources.has(id))))return false;
  if(!array(catalogue.edges,0,3000,edgeValid)||catalogue.edges.some(edge=>!ids.has(edge.from)||!ids.has(edge.to)||edge.sourceIds.some(id=>!sources.has(id))))return false;
  if(new Set(catalogue.edges.map(edge=>[edge.from,edge.to,edge.type].join('|'))).size!==catalogue.edges.length)return false;
  const lensValid=lens=>exact(lens,['id','title','description','rootIds'])&&idValid(lens.id)&&text(lens.title,120)&&text(lens.description,900)&&array(lens.rootIds,1,30,id=>idValid(id)&&ids.has(id))&&new Set(lens.rootIds).size===lens.rootIds.length;
  if(!array(catalogue.lenses,4,4,lensValid)||new Set(catalogue.lenses.map(lens=>lens.id)).size!==4||!['after-school','fields','learning','experiences'].every(id=>catalogue.lenses.some(lens=>lens.id===id)))return false;
  const children=new Map(catalogue.nodes.map(node=>[node.id,[]])),neighbours=new Map(catalogue.nodes.map(node=>[node.id,[]]));
  for(const edge of catalogue.edges){if(edge.type==='contains')children.get(edge.from).push(edge.to);neighbours.get(edge.from).push(edge.to);neighbours.get(edge.to).push(edge.from);}
  // Only the hierarchy must be acyclic. Related/combine/transition cycles are useful cross-links.
  const colors=new Map();
  const visit=id=>{if(colors.get(id)==='active')return false;if(colors.get(id)==='done')return true;colors.set(id,'active');for(const child of children.get(id))if(!visit(child))return false;colors.set(id,'done');return true;};
  for(const id of ids)if(!visit(id))return false;
  const reached=new Set(),queue=catalogue.lenses.flatMap(lens=>lens.rootIds);
  while(queue.length){const id=queue.pop();if(reached.has(id))continue;reached.add(id);queue.push(...neighbours.get(id));}
  if(reached.size!==ids.size)return false;
  const demoValid=demo=>exact(demo,['id','title','description','lensId','path'])&&idValid(demo.id)&&text(demo.title,160)&&text(demo.description,900)&&catalogue.lenses.some(lens=>lens.id===demo.lensId)&&array(demo.path,1,20,id=>idValid(id)&&ids.has(id))&&new Set(demo.path).size===demo.path.length;
  if(!array(catalogue.demos,0,15,demoValid)||new Set(catalogue.demos.map(demo=>demo.id)).size!==catalogue.demos.length)return false;
  for(const demo of catalogue.demos){const lens=catalogue.lenses.find(item=>item.id===demo.lensId);if(!lens.rootIds.includes(demo.path[0]))return false;for(let i=1;i<demo.path.length;i++)if(!neighbours.get(demo.path[i-1]).includes(demo.path[i]))return false;}
  return true;
 }catch{return false;}
}
