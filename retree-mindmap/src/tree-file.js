import {validateTree} from './tree-renderer.js';
import {layoutMindMap} from './mind-map-layout.js';

export const MAX_TREE_FILE_BYTES=8*1024*1024;
export const nodeOriginLabels={sample:'架空の相談例',generated:'AIで整理した内容',manual:'自分で追加',user_edited:'自分で書き直し',ai_proposal:'AI提案を本人が追加承認',reflection:'一般的な問いかけから追加',imported:'読み込んだ内容（由来は未確認）'};
const origins=new Set(['sample','generated','manual','imported']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const fail=()=>{throw new Error('ツリーJSONの形式・項目・枝のつながりを確認してください。最大200項目、深さ12段まで読み込めます。');};
function validateDocument(doc){
 if(!(exact(doc,['format','version','tree','positions','selected','provenance'])||exact(doc,['format','version','tree','positions','selected','provenance','nodeOrigins']))||doc.format!=='re-tree'||doc.version!==1||!validateTree(doc.tree))fail();
 const ids=new Set(doc.tree.nodes.map(n=>n.id));
 if(typeof doc.selected!=='string'||!ids.has(doc.selected)||!Array.isArray(doc.positions)||doc.positions.length!==ids.size)fail();
 const seen=new Set();
 for(const p of doc.positions){
  if(!exact(p,['id','x','y'])||!ids.has(p.id)||seen.has(p.id)||!['x','y'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k])<=10000000))fail();
  seen.add(p.id);
 }
 if(!exact(doc.provenance,['origin','edited','verification'])||!origins.has(doc.provenance.origin)||typeof doc.provenance.edited!=='boolean'||doc.provenance.verification!=='unverified')fail();
 if(Object.hasOwn(doc,'nodeOrigins')){if(!exact(doc.nodeOrigins,[...ids])||Object.values(doc.nodeOrigins).some(v=>typeof v!=='string'||!Object.hasOwn(nodeOriginLabels,v)))fail();}
 return doc;
}
export function createTreeDocument(tree,positions,selected,source='manual',edited=false,nodeOrigins=null){
 return validateDocument({format:'re-tree',version:1,tree:structuredClone(tree),positions:tree.nodes.map(n=>({id:n.id,...positions.get(n.id)})),selected,provenance:{origin:origins.has(source)?source:'manual',edited:!!edited,verification:'unverified'},...(nodeOrigins?{nodeOrigins:structuredClone(nodeOrigins)}:{})});
}
export function stringifyTreeDocument(document){
 validateDocument(document);const text=JSON.stringify(document,null,2);
 if(new TextEncoder().encode(text).length>MAX_TREE_FILE_BYTES)throw new Error('ファイルが8MBを超えます。項目の文章を短くしてから保存してください。');
 return text;
}
export function parseTreeDocument(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_TREE_FILE_BYTES)throw new Error('読み込めるJSONファイルは8MBまでです。');
 let doc;
 try{doc=JSON.parse(text.replace(/^\uFEFF/,''),(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw new Error('unsafe key');return value;});}
 catch{throw new Error('JSONを読み取れませんでした。正しいJSONファイルを選んでください。');}
 // Also accept the original tree-only JSON, with a fresh automatic layout.
 if(validateTree(doc))doc={format:'re-tree',version:1,tree:doc,positions:layoutMindMap(doc).nodes.map(n=>({id:n.id,x:n.x,y:n.y})),selected:doc.nodes.find(n=>n.parent===null).id,provenance:{origin:'imported',edited:false,verification:'unverified'}};
 return structuredClone(validateDocument(doc));
}
export async function readTreeFile(file){
 if(!file||!String(file.name).toLowerCase().endsWith('.json'))throw new Error('拡張子が.jsonのファイルを選んでください。');
 if(file.size>MAX_TREE_FILE_BYTES)throw new Error('読み込めるJSONファイルは8MBまでです。');
 return parseTreeDocument(await file.text());
}
