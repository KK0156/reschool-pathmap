import {routeAtlas} from './route-atlas-data.js';
import {validateAtlasSessionState} from './route-atlas.js';
import {discoveryTopics,validateDiscoveryRequest,validateDiscoveryResult} from './route-model.js';
import {getRouteDemo} from './route-demos.js';
import {validateGuideRequest,validateGuideResult} from './guide-model.js';

export const MAX_FINDER_FILE_BYTES=1024*1024;
const forbidden=new Set(['__proto__','constructor','prototype']);
const atlasNodes=new Map(routeAtlas.nodes.map(node=>[node.id,node]));
const sourceIds=new Set(routeAtlas.sources.map(source=>source.id));
const topics=new Set(discoveryTopics.map(topic=>topic.id));
const discoveryViews=new Set(['wizard','results','detail','compare','kept']);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=80&&/^[a-zA-Z0-9_-]+$/.test(value)&&!forbidden.has(value.toLowerCase());
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
const integer=(value,max=1000000000)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable;});
const list=(value,max,predicate)=>Array.isArray(value)&&value.length<=max&&value.every(predicate);
const unique=value=>new Set(value).size===value.length;
const ids=(value,max,known)=>list(value,max,value=>id(value)&&(!known||known.has(value)))&&unique(value);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const fail=()=>{throw new Error('Path Finderの保存ファイルを確認してください。形式・版・資料や候補のつながりが対応していません。');};

// Inspect descriptors before reading values: a local JavaScript caller must not
// execute a getter or toJSON hook while preparing a file or restoring a session.
function boundedJSON(value){
  const seen=new WeakSet();let count=0;
  function visit(value,depth){
    if(++count>30000||depth>32)return false;
    if(value===null||typeof value==='boolean')return true;
    if(typeof value==='string')return value.length<=32768;
    if(typeof value==='number')return Number.isFinite(value);
    if(typeof value!=='object'||seen.has(value))return false;
    seen.add(value);
    const prototype=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value);
    if(Array.isArray(value)){
      if(prototype!==Array.prototype||value.length>5000||keys.length!==value.length+1)return false;
      for(let i=0;i<value.length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,String(i));if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable||!visit(descriptor.value,depth+1))return false;}
      seen.delete(value);
      return true;
    }
    if(prototype!==Object.prototype&&prototype!==null)return false;
    for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||forbidden.has(key.toLowerCase())||!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable||!visit(descriptor.value,depth+1))return false;}
    seen.delete(value);
    return true;
  }
  try{return visit(value,0)&&bytes(value)<=MAX_FINDER_FILE_BYTES;}catch{return false;}
}

const emptyDraft=()=>({topic:'',wish:'',situation:'',conditions:[],conditionText:''});
function draftValid(draft){
  return exact(draft,['topic','wish','situation','conditions','conditionText'])&&(draft.topic===''||topics.has(draft.topic))&&text(draft.wish,700)&&text(draft.situation,700)&&text(draft.conditionText,500)&&list(draft.conditions,4,value=>text(value,180,true))&&unique(draft.conditions);
}
const routeValid=route=>validateDiscoveryResult({summary:'形式の確認',answer:'未確認',routes:[route]},'ask');

export function validateDiscoverySession(snapshot){
  try{
    if(!boundedJSON(snapshot)||!exact(snapshot,['draft','step','view','graph','roots','selected','path','back','compare','keep','summary','answer','consultation','demoId','source','serial']))return false;
    if(!draftValid(snapshot.draft)||!integer(snapshot.step,3)||snapshot.step<1||(snapshot.step>1&&!topics.has(snapshot.draft.topic))||!discoveryViews.has(snapshot.view)||!integer(snapshot.serial))return false;
    if(!list(snapshot.graph,80,entry=>exact(entry,['key','route','origin','parent','children','related','revealed','answer','questionDraft'])&&id(entry.key)&&routeValid(entry.route)&&['demo','ai'].includes(entry.origin)&&(entry.parent===null||id(entry.parent))&&typeof entry.revealed==='boolean'&&text(entry.answer,1500)&&text(entry.questionDraft,600)))return false;
    const graph=new Map(snapshot.graph.map(entry=>[entry.key,entry]));
    if(graph.size!==snapshot.graph.length)return false;
    const known=new Set(graph.keys());
    if(!ids(snapshot.roots,80,known)||!ids(snapshot.path,12,known)||!ids(snapshot.compare,2,known)||!ids(snapshot.keep,6,known)||(snapshot.selected!==null&&!known.has(snapshot.selected)))return false;
    if(!text(snapshot.summary,1200,!!graph.size)||!text(snapshot.answer,1500)||(snapshot.consultation!==null&&!validateDiscoveryRequest({intent:'discover',consultation:snapshot.consultation})))return false;
    if(snapshot.source===null){if(graph.size||snapshot.demoId!==null||snapshot.consultation!==null)return false;}
    else if(snapshot.source==='demo'){
      const demo=getRouteDemo(snapshot.demoId);if(!demo||!graph.size||!snapshot.graph.some(entry=>entry.origin==='demo'))return false;
      const original=new Map(demo.routes.map(route=>[route.id,route]));
      for(const entry of snapshot.graph.filter(entry=>entry.origin==='demo')){
        const route=original.get(entry.route.id);
        if(!route||Object.keys(route).some(key=>JSON.stringify(route[key])!==JSON.stringify(entry.route[key])))return false;
      }
    }else if(snapshot.source!=='ai'||!graph.size||snapshot.demoId!==null||snapshot.graph.some(entry=>entry.origin!=='ai'))return false;
    for(const entry of snapshot.graph){
      if(!ids(entry.children,80,known)||!ids(entry.related,80,known)||entry.children.includes(entry.key)||entry.related.includes(entry.key)||(entry.parent!==null&&!known.has(entry.parent)))return false;
      if(entry.children.some(key=>graph.get(key).parent!==entry.key))return false;
      if(entry.parent!==null&&!graph.get(entry.parent).children.includes(entry.key))return false;
      const serial=/^route-(\d+)$/.exec(entry.key);if(serial&&Number(serial[1])>snapshot.serial)return false;
    }
    const rootKeys=snapshot.graph.filter(entry=>entry.parent===null).map(entry=>entry.key);
    if(rootKeys.length!==snapshot.roots.length||rootKeys.some(key=>!snapshot.roots.includes(key)))return false;
    const visited=new Set();
    function walk(key,depth){if(depth>12||visited.has(key))return false;visited.add(key);return graph.get(key).children.every(child=>walk(child,depth+1));}
    if(!snapshot.roots.every(key=>walk(key,0))||visited.size!==graph.size)return false;
    const pathValid=(path,selected,view)=>ids(path,12,known)&&(view!=='detail'||(selected!==null&&path.length>0&&path.at(-1)===selected))&&(!path.length||snapshot.roots.includes(path[0]))&&path.every((key,index)=>index===0||graph.get(key).parent===path[index-1]);
    if(!pathValid(snapshot.path,snapshot.selected,snapshot.view)||(!graph.size&&snapshot.view!=='wizard')||(snapshot.view==='compare'&&snapshot.compare.length!==2))return false;
    if(!list(snapshot.back,40,item=>exact(item,['view','selected','path'])&&discoveryViews.has(item.view)&&(item.selected===null||known.has(item.selected))&&pathValid(item.path,item.selected,item.view)))return false;
    return true;
  }catch{return false;}
}

export function validateFinderGuide(guide){
  try{
    if(!boundedJSON(guide)||!exact(guide,['summary','statements','routes','additionalIdeas','nextActions','unknowns','userCorrections','conversation','requestsUsed','stale','correspondence'])||!text(guide.summary,3000)||!integer(guide.requestsUsed,12)||typeof guide.stale!=='boolean'||!['included','not_saved'].includes(guide.correspondence))return false;
    if(!validateGuideRequest({intent:'guide',revision:0,answers:[],corrections:guide.userCorrections,context:{routeIds:[],goal:'summarize'}}))return false;
    let request;
    if(guide.correspondence==='included'){
      if(!exact(guide.conversation,['answers','corrections']))return false;
      request={intent:'guide',revision:0,answers:guide.conversation.answers,corrections:guide.conversation.corrections,context:{routeIds:[],goal:'summarize'}};
      if(!validateGuideRequest(request))return false;
      if(request.corrections.length!==guide.userCorrections.length||guide.userCorrections.some(correction=>!request.corrections.some(item=>item.id===correction.id&&item.text===correction.text)))return false;
    }else if(guide.conversation!==null)return false;
    return validateGuideResult({action:'summarize',explanation:'保存された整理です。内容と資料は未確認です。',question:null,statements:guide.statements,routes:guide.routes,additionalIdeas:guide.additionalIdeas,nextActions:guide.nextActions,unknowns:guide.unknowns},request);
  }catch{return false;}
}

function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value&&value<=new Date().toISOString().slice(0,10);
}
function https(value){try{const url=new URL(value);return text(value,2000,true)&&url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
function catalogueSourcesValid(sources,session){
  if(!list(sources,100,source=>exact(source,['id','title','url','authority','status','reviewedOn','scope','limitations'])&&sourceIds.has(source.id)&&text(source.title,300,true)&&https(source.url)&&text(source.authority,300,true)&&['reviewed','unreviewed'].includes(source.status)&&(source.status==='reviewed'?validDate(source.reviewedOn):source.reviewedOn===null)&&text(source.scope,2000,true)&&text(source.limitations,2000,true))||!unique(sources.map(source=>source.id)))return false;
  const included=new Set(sources.map(source=>source.id)),referenced=new Set(session.guide?.routes.map(route=>route.atlasId)||[]);
  const atlas=session.atlas;
  if(atlas){
    if(atlas.selected)referenced.add(atlas.selected);
    for(const key of ['path','visited','considering','keep','compare','recordOpen'])atlas[key].forEach(id=>referenced.add(id));
    for(const history of atlas.history){if(history.selected)referenced.add(history.selected);history.path.forEach(id=>referenced.add(id));}
    for(const key of ['records','recordDrafts'])Object.keys(atlas[key]).forEach(id=>referenced.add(id));
  }
  return [...referenced].every(id=>atlasNodes.get(id)?.sourceIds.every(sourceId=>included.has(sourceId)));
}

export function validateFinderDocument(document){
  try{
    if(!boundedJSON(document)||!exact(document,['format','schemaVersion','catalogueSources','session'])||document.format!=='repath-finder-session'||document.schemaVersion!==1)return false;
    const session=document.session;
    if(!exact(session,['revision','atlas','discovery','guide','notes','nextActions','view'])||!integer(session.revision,1000000)||!text(session.notes,3000)||!text(session.nextActions,3000)||!['all','ai','legacy','record'].includes(session.view))return false;
    if(session.atlas!==null&&!validateAtlasSessionState(session.atlas))return false;
    if(session.discovery!==null&&!validateDiscoverySession(session.discovery))return false;
    if(session.guide!==null&&!validateFinderGuide(session.guide))return false;
    return catalogueSourcesValid(document.catalogueSources,session);
  }catch{return false;}
}

export function createFinderDocument(session,{includeConversation=false,catalogueSources=routeAtlas.sources}={}){
  const document={format:'repath-finder-session',schemaVersion:1,catalogueSources,session};
  if(typeof includeConversation!=='boolean'||!validateFinderDocument(document))fail();
  const result=structuredClone(document);
  if(!includeConversation){
    if(result.session.guide){result.session.guide.conversation=null;result.session.guide.correspondence='not_saved';}
    if(result.session.discovery){
      result.session.discovery.draft=emptyDraft();result.session.discovery.step=1;result.session.discovery.consultation=null;
      for(const entry of result.session.discovery.graph)entry.questionDraft='';
    }
  }
  if(!validateFinderDocument(result))fail();
  return result;
}

export function stringifyFinderDocument(document){
  if(!validateFinderDocument(document))fail();
  const result=JSON.stringify(document,null,2);
  if(new TextEncoder().encode(result).length>MAX_FINDER_FILE_BYTES)throw new Error('Path Finderの保存ファイルは1MBまでです。メモや会話を減らしてください。');
  return result;
}

export function parseFinderDocument(value){
  if(typeof value!=='string'||new TextEncoder().encode(value).length>MAX_FINDER_FILE_BYTES)throw new Error('読み込めるPath FinderのJSONファイルは1MBまでです。');
  let document;
  try{document=JSON.parse(value.replace(/^\uFEFF/,''),(key,value)=>{if(forbidden.has(key.toLowerCase()))throw new Error('unsafe key');return value;});}
  catch{throw new Error('JSONを読み取れませんでした。Path Finderから保存したJSONファイルを選んでください。');}
  if(!validateFinderDocument(document))fail();
  return structuredClone(document);
}

export async function readFinderFile(file){
  if(!file||!String(file.name).toLowerCase().endsWith('.json'))throw new Error('拡張子が.jsonのファイルを選んでください。');
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_FINDER_FILE_BYTES)throw new Error('読み込めるPath FinderのJSONファイルは1MBまでです。');
  return parseFinderDocument(await file.text());
}
