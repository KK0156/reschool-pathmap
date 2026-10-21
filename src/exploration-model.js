import {routeAtlas} from './route-atlas-data.js';
import {validateAtlasSessionState} from './route-atlas.js';
import {validateGuideRequest,validateGuideResult} from './guide-model.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';

// Route descriptions remain in the catalogue. The exploration stores references
// and the person's own annotations, never an independently editable copy of it.
const catalogue=new Map(routeAtlas.nodes.map(node=>[node.id,node]));
const roots=routeAtlas.lenses.find(lens=>lens.id==='after-school').rootIds;
const groups=[
  ['group-self','ここまでの話','exploration-root'],
  ['group-routes','見渡せる道','exploration-root'],
  ['group-checks','確かめたいこと','exploration-root'],
  ['group-actions','次にすること','exploration-root'],
  ['self-situation','今の状況','group-self'],
  ['self-interests','気になること','group-self'],
  ['self-values','大切にしたいこと','group-self'],
  ['self-constraints','不安・条件','group-self'],
  ['self-unknowns','まだ分からないこと','group-self'],
  ['lens-fields','別の切り口：学問分野','group-routes'],
  ['lens-learning','別の切り口：学び方','group-routes'],
  ['lens-experiences','別の切り口：学校内外の経験','group-routes']
];
const staticIds=new Set(['exploration-root',...groups.map(group=>group[0])]);
const workspaceKeys=['expanded','selected','emphasis','notes','overrides','positions','serial','step'];
const sessionKeys=['revision','atlas','guide','discovery','notes','nextActions','view','exploration'];
const forbidden=new Set(['__proto__','prototype','constructor']);
const clone=value=>structuredClone(value);
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=120&&/^[a-zA-Z0-9_-]+$/.test(value)&&!forbidden.has(value.toLowerCase());
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable;});
const distinct=values=>new Set(values).size===values.length;
const list=(value,max,predicate)=>Array.isArray(value)&&value.length<=max&&value.every(predicate);
const fail=()=>{throw new Error('探索の枝や記録の形式を確認してください。今の探索は変更していません。');};

// Check descriptors before any user-supplied value is read or serialized.
function safeJSON(value){
  let count=0;const seen=new WeakSet();
  function visit(item,depth){
    if(++count>40000||depth>32)return false;
    if(item===null||typeof item==='boolean')return true;
    if(typeof item==='string')return item.length<=32768;
    if(typeof item==='number')return Number.isFinite(item);
    if(typeof item!=='object'||seen.has(item))return false;
    const array=Array.isArray(item),proto=Object.getPrototypeOf(item),keys=Reflect.ownKeys(item);
    if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)return false;
    if(array&&(item.length>5000||keys.length!==item.length+1))return false;
    seen.add(item);
    for(const key of keys){
      const descriptor=Object.getOwnPropertyDescriptor(item,key);
      if(typeof key!=='string'||forbidden.has(key.toLowerCase())||!descriptor||!Object.hasOwn(descriptor,'value'))return false;
      if(array&&key==='length')continue;
      if(!descriptor.enumerable||array&&!/^(0|[1-9]\d*)$/.test(key)||!visit(descriptor.value,depth+1))return false;
    }
    seen.delete(item);return true;
  }
  try{return visit(value,0);}catch{return false;}
}

export function createExplorationState(){
  return {expanded:['group-self','group-routes'],selected:null,emphasis:'balanced',notes:[],overrides:[],positions:[],serial:0,step:1};
}

function reference(value,manualIds){
  if(!identifier(value))return false;
  if(staticIds.has(value)||manualIds.has(value))return true;
  if(value.startsWith('atlas-'))return catalogue.has(value.slice(6));
  // Redacted Finder files and a changed AI response can leave a reference to a
  // previous generated item. It stays a reference, never a reconstructed fact.
  return /^(?:answer|interpretation|correction|action|idea)-[a-zA-Z0-9_-]{1,90}$/.test(value)||/^unknown-[a-f0-9]{16}$/.test(value)||['personal-notes','personal-actions'].includes(value);
}

export function validateExplorationState(workspace,_session){
  try{
    if(!safeJSON(workspace)||!exact(workspace,workspaceKeys)||!Number.isSafeInteger(workspace.serial)||workspace.serial<0||workspace.serial>1000000||!Number.isSafeInteger(workspace.step)||workspace.step<1||workspace.step>5||!['balanced','map','text'].includes(workspace.emphasis))return false;
    if(!list(workspace.notes,40,note=>exact(note,['id','parent','label','detail'])&&/^manual-[1-9]\d{0,6}$/.test(note.id)&&Number(note.id.slice(7))<=workspace.serial&&identifier(note.parent)&&note.parent!==note.id&&text(note.label,80,true)&&text(note.detail,3000))||!distinct(workspace.notes.map(note=>note.id)))return false;
    const manualIds=new Set(workspace.notes.map(note=>note.id)),ref=id=>reference(id,manualIds);
    if(!workspace.notes.every(note=>ref(note.parent)))return false;
    const byId=new Map(workspace.notes.map(note=>[note.id,note]));
    for(const note of workspace.notes){const seen=new Set();let current=note;while(current){if(seen.has(current.id)||seen.size>12)return false;seen.add(current.id);current=byId.get(current.parent);}}
    if(!list(workspace.expanded,200,ref)||!distinct(workspace.expanded)||(workspace.selected!==null&&!ref(workspace.selected)))return false;
    if(!list(workspace.overrides,120,item=>exact(item,['id','label','detail'])&&ref(item.id)&&!manualIds.has(item.id)&&text(item.label,80,true)&&text(item.detail,3000))||!distinct(workspace.overrides.map(item=>item.id)))return false;
    return list(workspace.positions,200,item=>exact(item,['id','x','y'])&&ref(item.id)&&[item.x,item.y].every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=10000000))&&distinct(workspace.positions.map(item=>item.id));
  }catch{return false;}
}

function guideValid(guide){
  if(guide===null)return true;
  const keys=['summary','statements','routes','additionalIdeas','nextActions','unknowns','userCorrections','conversation','requestsUsed','stale','correspondence'];
  if(!exact(guide,keys)||!text(guide.summary,3000)||!Number.isSafeInteger(guide.requestsUsed)||guide.requestsUsed<0||guide.requestsUsed>12||typeof guide.stale!=='boolean'||!['included','not_saved'].includes(guide.correspondence))return false;
  let request;
  if(guide.correspondence==='included'){
    if(!exact(guide.conversation,['answers','corrections']))return false;
    request={intent:'guide',revision:0,answers:guide.conversation.answers,corrections:guide.conversation.corrections,context:{routeIds:[],goal:'summarize'}};
    if(!validateGuideRequest(request)||!Array.isArray(guide.userCorrections)||guide.userCorrections.length!==guide.conversation.corrections.length||guide.userCorrections.some(correction=>!guide.conversation.corrections.some(item=>item.id===correction.id&&item.text===correction.text)))return false;
  }else if(guide.conversation!==null)return false;
  if(!validateGuideRequest({intent:'guide',revision:0,answers:[],corrections:guide.userCorrections,context:{routeIds:[],goal:'summarize'}}))return false;
  return validateGuideResult({action:'summarize',explanation:'保存された整理です。内容は未確認です。',question:null,statements:guide.statements,routes:guide.routes,additionalIdeas:guide.additionalIdeas,nextActions:guide.nextActions,unknowns:guide.unknowns},request);
}

function normalizeSession(value){
  if(!safeJSON(value)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!sessionKeys.includes(key)))fail();
  const next={revision:0,atlas:null,guide:null,discovery:null,notes:'',nextActions:'',view:'ai',...clone(value)};
  if(!Object.hasOwn(next,'exploration'))next.exploration=createExplorationState();
  if(!Number.isSafeInteger(next.revision)||next.revision<0||next.revision>1000000||!text(next.notes,3000)||!text(next.nextActions,3000)||!['all','ai','legacy','record'].includes(next.view)||next.atlas!==null&&!validateAtlasSessionState(next.atlas)||!guideValid(next.guide)||!validateExplorationState(next.exploration,next))fail();
  return next;
}

export function createExplorationStore(initialSession={}){
  let state=normalizeSession(initialSession),undo=null;
  const listeners=new Set();
  function commit(next){
    const normalized=normalizeSession(next);
    if(JSON.stringify(normalized)===JSON.stringify(state))return clone(state);
    state=normalized;
    for(const listener of [...listeners])listener(clone(state));
    return clone(state);
  }
  return {
    getState:()=>clone(state),
    patch(patch){
      if(!safeJSON(patch)||!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!sessionKeys.includes(key)))fail();
      if(Object.hasOwn(patch,'revision')&&Number.isSafeInteger(patch.revision)&&patch.revision>=0&&patch.revision<state.revision)return clone(state);
      const next=normalizeSession({...state,...clone(patch)}),before=projectExploration(state),after=projectExploration(next),previous=new Map(before.nodes.map(node=>[node.id,node])),all=new Map(after.nodes.map(node=>[node.id,node]));
      const expanded=new Set(next.exploration.expanded);
      for(const node of after.nodes){
        const old=previous.get(node.id);
        if((!old&&!['route','group','root'].includes(node.kind))||node.highlighted&&!old?.highlighted){
          let current=node,depth=0;
          while(current?.parent&&depth++<20){if(expanded.size<200)expanded.add(current.parent);current=all.get(current.parent);}
        }
      }
      const newlyOpened=new Set((next.atlas?.path||[]).filter(id=>!state.atlas?.path.includes(id)));
      if(next.atlas?.selected&&next.atlas.selected!==state.atlas?.selected)newlyOpened.add(next.atlas.selected);
      for(const id of newlyOpened){let current=all.get('atlas-'+id),depth=0;while(current?.parent&&depth++<20){if(expanded.size<200)expanded.add(current.parent);current=all.get(current.parent);}}
      next.exploration.expanded=[...expanded].filter(id=>id!=='exploration-root');
      return commit(next);
    },
    replace(session){const next=normalizeSession(session);undo=null;return commit(next);},
    subscribe(listener){if(typeof listener!=='function')throw new TypeError('探索の更新先を確認してください。');listeners.add(listener);return()=>listeners.delete(listener);},
    updateWorkspace(patch,{undoable=true}={}){
      if(!safeJSON(patch)||!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!workspaceKeys.includes(key)))fail();
      const next={...state.exploration,...clone(patch)};
      if(!validateExplorationState(next,state))fail();
      if(undoable&&['notes','overrides','positions','serial'].some(key=>JSON.stringify(next[key])!==JSON.stringify(state.exploration[key])))undo=clone(state.exploration);
      return commit({...state,exploration:next});
    },
    undoWorkspace(){
      if(!undo)return false;
      const previous=undo;undo=null;
      const next={...state.exploration,notes:previous.notes,overrides:previous.overrides,positions:previous.positions,serial:previous.serial},manualIds=new Set(previous.notes.map(note=>note.id));
      next.expanded=next.expanded.filter(id=>reference(id,manualIds));
      if(next.selected!==null&&!reference(next.selected,manualIds))next.selected=previous.selected!==null&&reference(previous.selected,manualIds)?previous.selected:null;
      commit({...state,exploration:next});return true;
    },
    canUndo:()=>undo!==null
  };
}

const short=(value,length=28)=>{const characters=[...String(value)];return characters.length>length?characters.slice(0,length-1).join('')+'…':characters.join('');};
function hashText(value){let hash=14695981039346656037n;for(const point of value){hash^=BigInt(point.codePointAt(0));hash=BigInt.asUintN(64,hash*1099511628211n);}return hash.toString(16).padStart(16,'0');}
function interpretationParent(statement){
  if(statement.kind==='unknown')return 'self-unknowns';
  if(/大切|重視|譲れ|優先|価値/.test(statement.text))return 'self-values';
  if(/不安|心配|制約|費用|条件|負担/.test(statement.text))return 'self-constraints';
  if(/興味|関心|気になる|やってみたい/.test(statement.text))return 'self-interests';
  return 'self-situation';
}

export function projectExploration(input){
  const session=normalizeSession(input),workspace=session.exploration,atlas=session.atlas,guide=session.guide;
  const nodes=[],edges=[],nodeById=new Map();
  const put=node=>{const complete={atlasId:null,detail:'',status:'unverified',answerIds:[],compared:false,kept:false,visited:false,highlighted:false,stale:false,...node};if(nodeById.has(complete.id))return;nodes.push(complete);nodeById.set(complete.id,complete);};
  const connect=(from,to,type='contains')=>{if(from!==to&&!edges.some(edge=>edge.from===from&&edge.to===to&&edge.type===type))edges.push({from,to,type});};
  put({id:'exploration-root',label:'今、考えていること',kind:'root',origin:'reference',parent:null,detail:'進路を決めるための判定ではなく、話したことと見つけた道を並べる地図です。'});
  for(const [id,label,parent] of groups){put({id,label,parent,kind:'group',origin:'reference'});connect(parent,id);}
  const primaryParent=new Map();
  // Seven after-school directions are equal entry points. A shared child gets
  // one layout parent while all catalogue relationships remain separate edges.
  for(const id of roots)primaryParent.set(id,'group-routes');
  for(const lens of routeAtlas.lenses.filter(lens=>lens.id!=='after-school'))for(const id of lens.rootIds)primaryParent.set(id,'lens-'+lens.id);
  for(const edge of routeAtlas.edges.filter(edge=>edge.type==='contains'))if(!primaryParent.has(edge.to))primaryParent.set(edge.to,'atlas-'+edge.from);
  const highlighted=new Map((guide?.routes||[]).map(route=>[route.atlasId,route]));
  for(const node of routeAtlas.nodes){
    const id='atlas-'+node.id,parent=primaryParent.get(node.id)||'group-routes',record=atlas?.records?.[node.id];
    put({id,atlasId:node.id,parent,label:short(node.title),kind:'route',origin:'reference',detail:node.summary,status:record?.state||(atlas?.considering.includes(node.id)?'considering':'unresearched'),compared:atlas?.compare.includes(node.id)||false,kept:atlas?.keep.includes(node.id)||false,visited:atlas?.visited.includes(node.id)||false,highlighted:highlighted.has(node.id),stale:highlighted.has(node.id)&&!!guide?.stale});
    if(parent==='group-routes'||parent.startsWith('lens-'))connect(parent,id);
  }
  for(const edge of routeAtlas.edges)connect('atlas-'+edge.from,'atlas-'+edge.to,edge.type);
  for(const answer of guide?.conversation?.answers||[]){put({id:'answer-'+answer.id,label:short(answer.text||({unknown:'まだ分からない',skipped:'答えずに進んだ問い'}[answer.state]||'本人の回答')),kind:'answer',origin:'answer',parent:'self-situation',detail:answer.question+'\n'+(answer.text||'本人は回答していません。'),answerIds:[answer.id],status:answer.state});connect('self-situation','answer-'+answer.id);}
  for(const statement of guide?.statements||[]){const id='interpretation-'+statement.id,parent=interpretationParent(statement);put({id,label:short(statement.text),kind:statement.kind==='unknown'?'unknown':'interpretation',origin:'ai_proposal',parent,detail:statement.text,answerIds:statement.answerIds,stale:!!guide.stale});connect(parent,id);}
  for(const correction of guide?.userCorrections||[]){const id='correction-'+correction.id,actual=correction.text.replace(/^「[\s\S]{0,60}」への訂正：|^本人の訂正：/,'');put({id,label:'訂正：'+short(actual||correction.text,25),kind:'correction',origin:'answer',parent:'self-situation',detail:correction.text,answerIds:[correction.id],status:'user_record'});connect('self-situation',id);}
  for(const value of guide?.unknowns||[]){const id='unknown-'+hashText(value);put({id,label:short(value),kind:'unknown',origin:'ai_proposal',parent:'group-checks',detail:value,stale:!!guide.stale});connect('group-checks',id);}
  for(const item of guide?.additionalIdeas||[]){const id='idea-'+item.id;put({id,label:short(item.text),kind:'unknown',origin:'ai_proposal',parent:'group-checks',detail:item.text,answerIds:item.answerIds,stale:!!guide.stale});connect('group-checks',id);}
  for(const item of guide?.nextActions||[]){const id='action-'+item.id;put({id,label:short(item.text),kind:'action',origin:'ai_proposal',parent:'group-actions',detail:item.text,answerIds:item.answerIds,stale:!!guide.stale});connect('group-actions',id);}
  if(session.notes){put({id:'personal-notes',label:'自分で記録した気づき',kind:'note',origin:'manual',parent:'group-checks',detail:session.notes,status:'user_record'});connect('group-checks','personal-notes');}
  if(session.nextActions){put({id:'personal-actions',label:'自分が次に確かめたいこと',kind:'action',origin:'manual',parent:'group-actions',detail:session.nextActions,status:'user_record'});connect('group-actions','personal-actions');}
  for(const override of workspace.overrides){
    const node=nodeById.get(override.id);
    if(node){node.label=override.label;node.detail=override.detail;node.origin='user_edited';}
    else{const action=override.id.startsWith('action-'),personal=/^(?:answer|interpretation|correction)-/.test(override.id),parent=action?'group-actions':personal?'self-situation':'group-checks';put({...override,kind:action?'action':'note',origin:'user_edited',parent,status:'user_record',stale:true});connect(parent,override.id);}
  }
  // Parent-before-child ordering is unnecessary: connect after every note has
  // been registered, and attach redacted/dormant parents to a neutral group.
  for(const note of workspace.notes)put({...note,kind:'note',origin:'manual',status:'user_record'});
  for(const note of workspace.notes){const node=nodeById.get(note.id);if(!nodeById.has(node.parent))node.parent='group-checks';connect(node.parent,node.id);}
  const selectedId=nodeById.has(workspace.selected)?workspace.selected:atlas?.selected&&nodeById.has('atlas-'+atlas.selected)?'atlas-'+atlas.selected:'exploration-root';
  const expanded=new Set(['exploration-root',...workspace.expanded.filter(id=>nodeById.has(id))]);
  const expandAncestors=id=>{let current=nodeById.get(id),depth=0;while(current?.parent&&depth++<20){expanded.add(current.parent);current=nodeById.get(current.parent);}};
  expandAncestors(selectedId);
  const step=workspace.step;
  return {nodes,edges,selectedId,expanded:[...expanded],step,summary:guide?.summary||'話したことや、開いた道がここにまとまります。まだ一つに決める必要はありません。'};
}

function validWorkspace(workspace){if(!validateExplorationState(workspace))fail();return clone(workspace);}
export function editExplorationNode(workspace,id,fields){
  const next=validWorkspace(workspace);
  if(!safeJSON(fields)||!exact(fields,['label','detail'])||!text(fields.label,80,true)||!text(fields.detail,3000))fail();
  const manual=next.notes.find(note=>note.id===id);
  if(manual)Object.assign(manual,fields);
  else{const record={id,...clone(fields)},index=next.overrides.findIndex(item=>item.id===id);if(index<0)next.overrides.push(record);else next.overrides[index]=record;}
  if(!validateExplorationState(next))fail();
  return next;
}
export function addExplorationNote(workspace,parent,label='気になったこと',detail=''){
  const next=validWorkspace(workspace);next.serial++;
  const id='manual-'+next.serial;
  next.notes.push({id,parent,label,detail});next.selected=id;
  if(!next.expanded.includes(parent))next.expanded.push(parent);
  if(!validateExplorationState(next))fail();return next;
}
export function deleteExplorationNote(workspace,id){
  const next=validWorkspace(workspace);
  if(!next.notes.some(note=>note.id===id))fail();
  const removed=new Set([id]);let changed=true;
  while(changed){changed=false;for(const note of next.notes)if(removed.has(note.parent)&&!removed.has(note.id)){removed.add(note.id);changed=true;}}
  next.notes=next.notes.filter(note=>!removed.has(note.id));next.expanded=next.expanded.filter(value=>!removed.has(value));next.positions=next.positions.filter(item=>!removed.has(item.id));
  if(removed.has(next.selected))next.selected=null;
  if(!validateExplorationState(next))fail();return next;
}

export function serializeExplorationTree(session){
  const graph=projectExploration(session);
  const chunks=value=>{const result=[];let part='';for(const point of value){if(part.length+point.length>1700){result.push(part);part='';}part+=point;}if(part)result.push(part);return result.length?result:['まだ書いていません。'];};
  const count=graph.nodes.reduce((total,node)=>total+chunks(node.detail).length,0);
  if(count>200)throw new Error('この地図は200項目を超えるため、Finderのファイル形式で保存してください。手書きの枝を省略して保存することはありません。');
  const ids=new Map(graph.nodes.map((node,index)=>[node.id,'explore-'+index]));
  const typeFor={root:'core_question',group:'research_note',route:'project',answer:'experience',interpretation:'hypothesis',correction:'research_note',unknown:'research_note',action:'action',note:'research_note'};
  const root=graph.nodes.find(node=>node.parent===null),nodeOrigins={},tree={core_question:root.origin==='user_edited'?root.label:'自分には、どんな学び方・働き方がある？',summary:graph.summary.slice(0,1500),nodes:graph.nodes.flatMap(node=>chunks(node.detail).map((detail,index)=>{
    const id=index?ids.get(node.id)+'-part-'+index:ids.get(node.id);
    nodeOrigins[id]=node.origin==='answer'?'manual':node.origin;
    return {id,parent:index?ids.get(node.id):node.parent===null?null:ids.get(node.parent),label:node.label+(index?'（続き）':''),type:index&&node.kind==='root'?'research_note':typeFor[node.kind],detail,evidence:node.origin==='reference'?'Route Atlasの一般資料です。本人の参加資格を確認したものではありません。':node.origin==='ai_proposal'?'AIによる未確認の整理・提案です。本人の決定ではありません。':'本人が入力・編集した内容です。資料や事実を検証した記録とは別です。',risk:node.stale?'回答や条件が変わっているため、前の整理は見直しが必要です。':'個別の条件、出典、本人への当てはまりは確認が必要です。',next_action:'気になる点を詳しい説明で読み、次に確かめたいことを残す。'};
  }))};
  if(!validateTree(tree))throw new Error('この地図をTree形式に変換できませんでした。Finder形式の保存は利用できます。');
  return {tree,nodeOrigins};
}
