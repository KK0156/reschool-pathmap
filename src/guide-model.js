import {routeAtlas} from './route-atlas-data.js';

export const MAX_GUIDE_ANSWERS=20;
export const MAX_GUIDE_REQUEST_BYTES=48*1024;
export const MAX_GUIDE_RESULT_BYTES=96*1024;
export const guideGoals=Object.freeze(['continue','show_routes','explain','compare','suggest_trial','summarize']);
export const guideAnswerStates=Object.freeze(['answered','unknown','different','skipped']);
export const guideActions=Object.freeze(['ask','explain','show_routes','compare','suggest_trial','summarize']);
const atlasIds=new Set(routeAtlas.nodes.map(node=>node.id));
const forbiddenIds=new Set(['__proto__','constructor','prototype']);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=80&&/^[a-zA-Z0-9_-]+$/.test(value)&&!forbiddenIds.has(value.toLowerCase());
const text=(value,max,required=true)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,fields)=>!!plain(value)&&Reflect.ownKeys(value).length===fields.length&&fields.every(field=>{const descriptor=Object.getOwnPropertyDescriptor(value,field);return descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable;});
const array=(value,min,max,predicate)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length>=min&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>i).every(i=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(i));return descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable&&predicate(descriptor.value);});
const unique=values=>new Set(values).size===values.length;
const strings=(value,min,max,length)=>array(value,min,max,item=>text(item,length));
const byteSize=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const answerValid=value=>exact(value,['id','questionId','question','text','state'])&&id(value.id)&&id(value.questionId)&&text(value.question,500)&&guideAnswerStates.includes(value.state)&&text(value.text,600,!['unknown','skipped'].includes(value.state));
const correctionValid=value=>exact(value,['id','text'])&&id(value.id)&&text(value.text,400);

export function validateGuideRequest(value){
 try{
  if(!exact(value,['intent','revision','answers','corrections','context'])||value.intent!=='guide'||!Number.isInteger(value.revision)||value.revision<0||value.revision>1000000)return false;
  if(!array(value.answers,0,MAX_GUIDE_ANSWERS,answerValid)||!unique(value.answers.map(answer=>answer.id))||!unique(value.answers.map(answer=>answer.questionId)))return false;
  if(!array(value.corrections,0,12,correctionValid)||!unique([...value.answers.map(answer=>answer.id),...value.corrections.map(correction=>correction.id)]))return false;
  if(!exact(value.context,['routeIds','goal'])||!array(value.context.routeIds,0,6,item=>id(item)&&atlasIds.has(item))||!unique(value.context.routeIds)||!guideGoals.includes(value.context.goal))return false;
  if(value.context.goal==='compare'&&value.context.routeIds.length<2)return false;
  return byteSize(value)<=MAX_GUIDE_REQUEST_BYTES;
 }catch{return false;}
}
const refArray=(value,validRefs)=>array(value,0,MAX_GUIDE_ANSWERS+12,item=>id(item)&&(!validRefs||validRefs.has(item)))&&unique(value);
const questionValid=question=>exact(question,['id','text','why','choices','multiple'])&&id(question.id)&&text(question.text,500)&&text(question.why,500)&&question.multiple===false&&array(question.choices,0,6,choice=>exact(choice,['id','label'])&&id(choice.id)&&text(choice.label,160))&&unique(question.choices.map(choice=>choice.id));
export function validateGuideResult(value,request){
 try{
  if(request!==undefined&&!validateGuideRequest(request))return false;
  if(!exact(value,['action','explanation','question','statements','routes','additionalIdeas','nextActions','unknowns'])||!guideActions.includes(value.action)||!text(value.explanation,1200))return false;
  const refs=request?new Set([...request.answers.map(answer=>answer.id),...request.corrections.map(correction=>correction.id)]):null;
  if(value.question!==null&&!questionValid(value.question))return false;
  if(value.action==='ask'&&value.question===null)return false;
  if(value.question&&request?.answers.some(answer=>answer.questionId===value.question.id))return false;
  if(!array(value.statements,0,8,statement=>exact(statement,['id','text','answerIds','kind'])&&id(statement.id)&&text(statement.text,600)&&['interpretation','unknown'].includes(statement.kind)&&refArray(statement.answerIds,refs)&&(statement.kind!=='interpretation'||statement.answerIds.length>0)))return false;
  if(!array(value.routes,0,6,route=>exact(route,['atlasId','reason','answerIds','unknowns'])&&id(route.atlasId)&&atlasIds.has(route.atlasId)&&text(route.reason,600)&&refArray(route.answerIds,refs)&&strings(route.unknowns,1,5,300)))return false;
  if(!unique(value.routes.map(route=>route.atlasId)))return false;
  if(['show_routes','compare'].includes(value.action)&&value.routes.length<2)return false;
  if(value.action==='compare'&&request&&(value.routes.length!==request.context.routeIds.length||!request.context.routeIds.every(atlasId=>value.routes.some(route=>route.atlasId===atlasId))))return false;
  if(value.routes.some(route=>!route.answerIds.length&&!route.reason.includes('一般的な入口')))return false;
  const ideaValid=idea=>exact(idea,['id','text','answerIds'])&&id(idea.id)&&text(idea.text,600)&&refArray(idea.answerIds,refs);
  if(!array(value.additionalIdeas,0,4,ideaValid)||!array(value.nextActions,0,5,ideaValid)||!strings(value.unknowns,0,8,300))return false;
  if(value.action==='suggest_trial'&&!value.nextActions.length)return false;
  if(request&&request.context.goal!=='continue'&&value.action!==request.context.goal)return false;
  const generatedIds=[...value.statements.map(statement=>statement.id),...value.additionalIdeas.map(idea=>idea.id),...value.nextActions.map(item=>item.id),...(value.question?[value.question.id,...value.question.choices.map(choice=>choice.id)]:[])];
  if(!unique(generatedIds))return false;
  return byteSize(value)<=MAX_GUIDE_RESULT_BYTES;
 }catch{return false;}
}

const textSchema=maxLength=>({type:'string',maxLength});
const idSchema={type:'string',pattern:'^[a-zA-Z0-9_-]+$',maxLength:80};
const refsSchema={type:'array',maxItems:32,items:idSchema};
const itemSchema={type:'object',additionalProperties:false,properties:{id:idSchema,text:textSchema(600),answerIds:refsSchema},required:['id','text','answerIds']};
export const guideResponseSchema={
 type:'object',additionalProperties:false,
 properties:{
  action:{type:'string',enum:guideActions},
  explanation:textSchema(1200),
  question:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{id:idSchema,text:textSchema(500),why:textSchema(500),choices:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,properties:{id:idSchema,label:textSchema(160)},required:['id','label']}},multiple:{type:'boolean',enum:[false]}},required:['id','text','why','choices','multiple']}]},
  statements:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,properties:{id:idSchema,text:textSchema(600),answerIds:refsSchema,kind:{type:'string',enum:['interpretation','unknown']}},required:['id','text','answerIds','kind']}},
  routes:{type:'array',maxItems:6,items:{type:'object',additionalProperties:false,properties:{atlasId:{type:'string',enum:[...atlasIds]},reason:textSchema(600),answerIds:refsSchema,unknowns:{type:'array',minItems:1,maxItems:5,items:textSchema(300)}},required:['atlasId','reason','answerIds','unknowns']}},
  additionalIdeas:{type:'array',maxItems:4,items:itemSchema},
  nextActions:{type:'array',maxItems:5,items:itemSchema},
  unknowns:{type:'array',maxItems:8,items:textSchema(300)}
 },
 required:['action','explanation','question','statements','routes','additionalIdeas','nextActions','unknowns']
};
