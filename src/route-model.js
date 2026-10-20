import {validateTree} from '../retree-mindmap/src/tree-renderer.js';

export const discoveryTopics = Object.freeze([
  {id: 'subjects', label: '文系・理系を考えたい'},
  {id: 'university', label: '大学・学部を考えたい'},
  {id: 'work', label: '仕事について考えたい'},
  {id: 'activities', label: '学校外の活動を探したい'},
  {id: 'undecided', label: 'まだ何も決まっていない'},
  {id: 'free', label: '自分の言葉で相談したい'}
].map(topic => Object.freeze(topic)));

export const discoveryStatusLabels = Object.freeze({
  possible: '可能性を検討できる道',
  check_conditions: '条件の確認が必要',
  undetermined: '現時点では判定できない'
});
export const MAX_DISCOVERY_REQUEST_BYTES = 48 * 1024;
export const MAX_DISCOVERY_RESULT_BYTES = 192 * 1024;

const topics = new Set(discoveryTopics.map(topic => topic.id));
const intents = new Set(['discover', 'expand', 'ask']);
const routeFields = ['id', 'title', 'description', 'reason', 'examples', 'conditions', 'unknowns', 'next_step', 'status'];
const consultationFields = ['topic', 'wish', 'situation', 'conditions'];
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const text = (value, max, required = true) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const exact = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length && fields.every(field => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable;
  });
};
const array = (value, min, max, predicate) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length >= min && value.length <= max &&
  Reflect.ownKeys(value).length === value.length + 1 && Array.from({length: value.length}, (_, i) => i).every(i => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable && predicate(descriptor.value);
  });
const validId = value => text(value, 64) && /^[a-zA-Z0-9_-]+$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value.toLowerCase());
const routeValid = value => exact(value, routeFields) && validId(value.id) && text(value.title, 120) &&
  ['description', 'reason', 'next_step'].every(field => text(value[field], 900)) &&
  ['examples', 'conditions', 'unknowns'].every(field => array(value[field], 1, 5, item => text(item, 400))) &&
  Object.hasOwn(discoveryStatusLabels, value.status);
const routesValid = (value, min, max) => array(value, min, max, routeValid) && new Set(value.map(route => route.id)).size === value.length;

// These validators accept plain JSON only. Unknown fields, accessors, prototype
// names and oversized structures are rejected before reaching API or tree code.
export function validateDiscoveryRequest(value) {
  try {
    if (!value || typeof value !== 'object') return false;
    const intent = Object.getOwnPropertyDescriptor(value, 'intent');
    if (!intent || !Object.hasOwn(intent, 'value') || !intents.has(intent.value)) return false;
    const fields = intent.value === 'discover' ? ['intent', 'consultation'] : intent.value === 'expand'
      ? ['intent', 'consultation', 'route', 'trail'] : ['intent', 'consultation', 'route', 'trail', 'question'];
    if (!exact(value, fields) || !exact(value.consultation, consultationFields) || !topics.has(value.consultation.topic)) return false;
    const consultation = value.consultation;
    if (!['wish', 'situation', 'conditions'].every(field => text(consultation[field], 700, field === 'wish' && consultation.topic === 'free'))) return false;
    if (consultation.topic.length + consultation.wish.length + consultation.situation.length + consultation.conditions.length > 2400) return false;
    if (value.intent !== 'discover' && (!routeValid(value.route) || !array(value.trail, 0, 8, item => text(item, 120)))) return false;
    if (value.intent === 'ask' && !text(value.question, 600)) return false;
    return bytes(value) <= MAX_DISCOVERY_REQUEST_BYTES;
  } catch {
    return false;
  }
}

export function validateDiscoveryResult(value, intent = 'discover') {
  try {
    if (!intents.has(intent) || !exact(value, ['summary', 'answer', 'routes']) || !text(value.summary, 1200) || !text(value.answer, 1500, intent === 'ask')) return false;
    const [min, max] = intent === 'discover' ? [3, 5] : intent === 'expand' ? [2, 5] : [0, 3];
    return routesValid(value.routes, min, max) && bytes(value) <= MAX_DISCOVERY_RESULT_BYTES;
  } catch {
    return false;
  }
}

const bounded = (value, max = 1800) => value.length <= max ? value : value.slice(0, max - 8) + '…（続きは省略）';
const list = values => bounded(values.map(value => '・' + value).join('\n'));

// A user explicitly chooses which routes to carry into the existing editor.
// This conversion neither changes the routes nor presents them as verified facts.
export function createDiscoveryTree(routes, {question, origin = 'demo', routeOrigins} = {}) {
  if (!routesValid(routes, 1, 6)) throw new Error('ツリーに残す選択肢を1〜6件選び、内容を確認してください。');
  if (!['demo', 'ai', 'generated', 'manual', 'mixed'].includes(origin)) throw new Error('選択肢の由来を確認してください。');
  if (routeOrigins !== undefined && !array(routeOrigins, routes.length, routes.length, item => ['demo', 'ai'].includes(item))) throw new Error('各候補の由来を確認してください。');
  if (origin === 'mixed' && !routeOrigins) throw new Error('混在する候補の由来を確認してください。');
  if (question !== undefined && !text(question, 2400)) throw new Error('中心に置く問いを確認してください。');
  const core = question ? bounded(question.trim(), 300) : '残しておきたい選択肢を、どこから確かめる？';
  const origins = routeOrigins || routes.map(() => origin);
  const combinedOrigin = new Set(origins).size > 1 ? 'mixed' : origins[0];
  const sourceText = value => value === 'demo' ? '架空の探索デモを本人が選んで取り込んだ内容です。'
    : ['ai', 'generated'].includes(value) ? 'AI提案を本人が選んで取り込んだ内容です。'
    : value === 'mixed' ? '架空の探索デモとAI提案から、本人が候補を選んで取り込んだ内容です。'
    : '本人が選択肢を整理して取り込んだ内容です。';
  const source = sourceText(combinedOrigin);
  const evidence = source + '記載内容・条件・資料の実在は未確認です。進路や適性の判定ではありません。';
  const nodes = [{
    id: 'root', parent: null, label: bounded(core, 180), type: 'core_question', detail: core,
    evidence, risk: '候補の数や並び順は、優劣や本人への適性を表していません。ほかの選択肢も残せます。',
    next_action: '枝を読み、自分の言葉に書き直す。重要な判断は先生・保護者など信頼できる人と相談する。'
  }];
  routes.forEach((route, index) => {
    const id = `choice-${index + 1}`;
    const routeEvidence = sourceText(origins[index]) + '記載内容・条件・資料の実在は未確認です。進路や適性の判定ではありません。';
    const reason = bounded(routeEvidence + '\n挙げた理由（未検証）：' + route.reason);
    nodes.push({id, parent: 'root', label: route.title, type: 'project', detail: route.description,
      evidence: reason, risk: list(route.unknowns), next_action: route.next_step});
    const shared = {parent: id, evidence: routeEvidence, risk: list(route.unknowns), next_action: route.next_step};
    nodes.push(
      {id: `${id}-examples`, ...shared, label: '具体的には、どんなこと？', type: 'hypothesis', detail: list(route.examples)},
      {id: `${id}-conditions`, ...shared, label: '確かめたい条件', type: 'research_note', detail: bounded(discoveryStatusLabels[route.status] + '\n' + list(route.conditions))},
      {id: `${id}-unknowns`, ...shared, label: 'まだ分からないこと', type: 'risk', detail: list(route.unknowns)},
      {id: `${id}-evidence`, ...shared, label: '根拠を確かめる', type: 'evidence',
        detail: '理由に挙げられた内容を、公式の説明・授業資料・信頼できる人の話などで確かめる。資料を確認する前の説明であり、確認済みの証拠ではありません。', evidence: reason},
      {id: `${id}-action`, ...shared, label: '次に調べる・聞く・試すこと', type: 'action', detail: route.next_step}
    );
  });
  const tree = {core_question: core, summary: bounded(source + '候補から問い・条件・未確認事項・次の行動を並べた編集用の地図です。AIやデモが答えを決めたものではありません。記載内容は未確認です。', 1500), nodes};
  if (!validateTree(tree, {maxNodes: 40})) throw new Error('ツリーへ引き継ぐ内容の形式を確認してください。');
  return tree;
}

// Keep per-branch provenance when a user mixes a demo with AI follow-ups.
export function createDiscoveryTransfer(routes, {question, origins} = {}) {
  if (!routesValid(routes, 1, 6) || !array(origins, routes.length, routes.length, item => ['demo', 'ai'].includes(item))) throw new Error('候補と、それぞれの由来を確認してください。');
  const origin = new Set(origins).size > 1 ? 'mixed' : origins[0];
  const tree = createDiscoveryTree(routes, {question, origin, routeOrigins: origins});
  const root = tree.nodes.find(node => node.parent === null);
  const projects = tree.nodes.filter(node => node.parent === root.id && node.type === 'project');
  const sources = new Map(projects.map((node, index) => [node.id, origins[index] === 'demo' ? 'sample' : 'generated']));
  const nodeOrigins = Object.fromEntries(tree.nodes.map(node => [node.id, node === root ? origin === 'mixed' ? 'manual' : origin === 'demo' ? 'sample' : 'generated' : sources.get(node.id) || sources.get(node.parent)]));
  return {tree, origin, nodeOrigins};
}
