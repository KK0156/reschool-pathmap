import {addNode,editNode} from './tree-edit.js';
export const reflectionPrompts=[
 {id:'try',label:'決める前に、小さく試す',type:'project',detail:'候補を一つに絞る前に、見学・体験・公開資料などで確かめる方法も考えられます。参加できる場所や条件は未確認です。',next_action:'いまの選択肢を少しだけ体験できる方法を、先生や保護者に聞いてみる。'},
 {id:'combine',label:'二つの興味を組み合わせる',type:'hypothesis',detail:'二者択一ではなく、一方を活動や授業として試すなど、組み合わせる方法があるかもしれません。実現できる条件は未確認です。',next_action:'残したい二つの興味を書き、両方に触れる方法があるか調べる。'},
 {id:'pause',label:'今は決めず、条件を調べる',type:'project',detail:'費用・時間・参加条件・学び方を調べてから、もう一度比べる方法もあります。決める期限と調べる順番は未確認です。',next_action:'いつまでに何を決める必要があるか、まず先生や保護者に確認する。'}
];
export function addReflection(tree,parent,id){
 const prompt=reflectionPrompts.find(p=>p.id===id);if(!prompt)throw new Error('考え方を選んでください。');
 const next=addNode(tree,parent);next.tree=editNode(next.tree,next.id,{label:prompt.label,type:prompt.type,detail:prompt.detail,evidence:'一般的な検討のための問いかけ。本人に有効か、実際に利用できるかは未確認。',risk:'本人の状況や制約に合わない場合がある。',next_action:prompt.next_action});return next;
}
export function addNextStep(tree,parent,fields){
 const known=['research','person','try','when'];
 if(Object.keys(fields).some(k=>!known.includes(k))||known.some(k=>typeof fields[k]!=='string'||fields[k].length>200))throw new Error('各欄は200文字以内で書いてください。');
 if(!fields.research.trim()&&!fields.person.trim()&&!fields.try.trim())throw new Error('調べること・聞く相手・試すことのどれか一つを書いてください。');
 const labels={research:'調べること',person:'聞く相手（役割）',try:'試すこと',when:'いつごろ'};
 const detail=known.map(k=>`${labels[k]}：${fields[k].trim()||'未確認'}`).join('\n');
 const next=addNode(tree,parent);next.tree=editNode(next.tree,next.id,{label:'自分で決めた次の一歩',type:'action',detail,evidence:'本人が書いた行動案。実施結果は未確認。',risk:'実施できる条件は、学校や保護者と相談して確認する。',next_action:detail});return next;
}
