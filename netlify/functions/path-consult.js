import {interests, approaches, values, paths, cases} from '../../src/data.js';
import {followUps} from '../../src/consultation-data.js';

const headers = {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
const validAnswers = (input,allowed) => Array.isArray(input) && input.length>0 && input.length<=allowed.length && new Set(input).size===input.length && input.every(item=>allowed.includes(item));
const exactKeys = (object, keys) => object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).length===keys.length && keys.every(key=>Object.hasOwn(object,key));
export function validateInput(body) {
 if(!exactKeys(body,['selection','turns']))return false;
 if(!exactKeys(body.selection,['interests','approach','value']))return false;
 if(!validAnswers(body.selection.interests,interests)||!validAnswers(body.selection.approach,approaches)||!validAnswers(body.selection.value,values))return false;
 return Array.isArray(body.turns)&&body.turns.length<=5&&body.turns.every(turn=>exactKeys(turn,['questionId','answerIndex'])&&Object.hasOwn(followUps,turn.questionId)&&Number.isInteger(turn.answerIndex)&&turn.answerIndex>=0&&turn.answerIndex<followUps[turn.questionId].options.length);
}
const schema = {
 type:'object',additionalProperties:false,
 properties:{reply:{type:'string'},pathIds:{type:'array',items:{type:'string',enum:paths.map(p=>p.id)},maxItems:4},nextQuestionId:{type:'string',enum:Object.keys(followUps)},teacherQuestions:{type:'array',items:{type:'string'},maxItems:3}},
 required:['reply','pathIds','nextQuestionId','teacherQuestions']
};
const instructions = `あなたはRE:Schoolの進路相談の補助です。生徒に進路を決めるよう迫らず、選択された関心から、比較に使える情報や次の質問を整理してください。
適性・能力・性格・合格可能性・将来性を判定しない。順位を付けたり「あなたに合う」「最適」「必ず」「成功する」と言わない。
返答は普通の日本語で、短い2〜3段落、300〜500文字を目安に。「道をひらく」など抽象的な比喩や決め台詞、過剰な称賛、断定は避ける。「〜という例があります」「〜は確認してみてもよさそうです」のように例と提案の範囲を示す。
提供する16分野と卒業生事例はすべて架空。実在の学校、卒業生、資格要件、費用、実績を作らない。資格・費用・入試の具体的な条件は、先生と公式資料で確認する項目として扱う。
同じ進路だけに誘導せず、別の分野も比較できるようにする。pathIdsには参考として読む分野を0〜4件、提供資料のIDだけで選ぶ。これは判断や推薦ではない。
会話は選択式。追加の自由記述、名前、実際の学校名、連絡先、成績、個人の詳細は求めない。nextQuestionIdには用意された追加質問を一つ選ぶ。
teacherQuestionsには、先生に聞ける具体的な質問を最大3つ入れる。卒業生や外部の大人への直接連絡を促さず、学校・保護者を通す。
この会話で調べられる内容と、まだ確認できていない内容を区別する。最新情報を調べたとは言わない。`;

export function createHandler({fetchImpl=fetch,env=process.env}={}) {
 return async request => {
  const url=new URL(request.url);
  const origin=request.headers.get('origin');
  if(origin && origin!==url.origin)return json({error:'このサイトから相談してください。'},403);
  if(request.method==='GET')return json({configured:Boolean(env.OPENAI_API_KEY?.trim())});
  if(request.method!=='POST')return json({error:'この操作には対応していません。'},405);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'選択内容を確認してください。'},415);
  if(!request.body)return json({error:'選択内容がありません。'},400);
  let body;
  try {
   const reader=request.body.getReader();let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();return json({error:'送信できる選択数を超えています。'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   body=JSON.parse(new TextDecoder().decode(bytes));
  }catch{return json({error:'選択内容を読み取れませんでした。'},400);}
  if(!validateInput(body))return json({error:'選択内容を確認して、もう一度試してください。'},400);
  if(!env.OPENAI_API_KEY?.trim())return json({error:'AIとの接続がまだ設定されていません。サイト管理者によるAPIキーの設定が必要です。',code:'NOT_CONFIGURED'},503);
  const model=env.OPENAI_MODEL||'gpt-5-mini';
  const reference=paths.map(p=>({id:p.id,title:p.title,intro:p.intro,learn:p.learn,jobs:p.jobs,note:p.note,case:cases.find(c=>c.path===p.id)}));
  const turns=body.turns.map(turn=>({question:followUps[turn.questionId].question,answer:followUps[turn.questionId].options[turn.answerIndex]}));
  try {
   const response=await fetchImpl('https://api.openai.com/v1/responses',{
    method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),
    body:JSON.stringify({model,store:false,instructions,input:JSON.stringify({selection:body.selection,conversation:turns,reference,availableQuestions:followUps}),...(model.startsWith('gpt-5')?{reasoning:{effort:'low'}}:{}),max_output_tokens:2800,text:{format:{type:'json_schema',name:'career_consultation',strict:true,schema}}})
   });
   if(!response.ok)return json({error:response.status===429?'AIへの接続が混み合っているか、利用上限に達しています。少し待ってから試してください。':'AIに接続できませんでした。サイト管理者がAPIの設定を確認してください。'},response.status===429?429:502);
   const result=await response.json();
   if(result.status && result.status!=='completed')return json({error:'回答を最後まで受け取れませんでした。もう一度試してください。'},502);
   const output=result.output?.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('');
   const answer=JSON.parse(output||'');
   if(!exactKeys(answer,['reply','pathIds','nextQuestionId','teacherQuestions'])||typeof answer.reply!=='string'||!answer.reply.trim()||answer.reply.length>5000||!Array.isArray(answer.pathIds)||answer.pathIds.length>4||!answer.pathIds.every(id=>paths.some(p=>p.id===id))||!Object.hasOwn(followUps,answer.nextQuestionId)||!Array.isArray(answer.teacherQuestions)||answer.teacherQuestions.length>3||!answer.teacherQuestions.every(q=>typeof q==='string'&&q.length>0&&q.length<=400))return json({error:'回答の形式を確認できませんでした。もう一度試してください。'},502);
   // Catalogue order avoids presenting the model's chosen order as a ranking.
   return json({...answer,pathIds:paths.filter(p=>answer.pathIds.includes(p.id)).map(p=>p.id)});
  }catch(error){return json({error:error.name==='TimeoutError'||error.name==='AbortError'?'AIの回答に時間がかかっています。もう一度試してください。':'回答を受け取れませんでした。少し待ってから試してください。'},502);}
 };
}
export default createHandler();
// Enforced by Netlify's platform, not an unreliable per-instance memory counter.
export const config = {rateLimit:{windowLimit:20,windowSize:60,aggregateBy:['ip','domain'],action:'rate_limit'}};
