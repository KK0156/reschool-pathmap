import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoveryTopics, discoveryStatusLabels, validateDiscoveryRequest, validateDiscoveryResult,
  createDiscoveryTree, MAX_DISCOVERY_REQUEST_BYTES, MAX_DISCOVERY_RESULT_BYTES
} from '../src/route-model.js';
import {routeDemos, getRouteDemo} from '../src/route-demos.js';
import {validateTree, renderTree, renderDetail} from '../retree-mindmap/src/tree-renderer.js';

const route = (id = 'option-1') => ({
  id, title: '二つの学び方を比べる', description: '授業内容や、自分が続けて調べたいことを比べる。',
  reason: '最初に挙げた候補のほかにも、学び方を確かめる余地がある。',
  examples: ['授業の説明を読む'], conditions: ['科目や学校の制度は公式の情報で確認する。'],
  unknowns: ['実際の授業内容や必要な条件は未確認。'], next_step: '先生と、何を確かめるかを相談する。', status: 'possible'
});
const consultation = topic => ({topic, wish: '', situation: '', conditions: ''});
const request = (intent = 'discover') => ({
  intent, consultation: consultation('subjects'),
  ...(intent !== 'discover' ? {route: route(), trail: []} : {}),
  ...(intent === 'ask' ? {question: 'どんな資料から確かめればよい？'} : {})
});
const result = (count = 3) => ({summary: '比べるための架空例。記載内容は未確認。', answer: '', routes: Array.from({length: count}, (_, i) => route(`option-${i}`))});
const copy = value => structuredClone(value);
const invalidRequest = change => {const value = request();change(value);assert.equal(validateDiscoveryRequest(value), false);};
const invalidRoute = change => {const value = request('expand');change(value.route);assert.equal(validateDiscoveryRequest(value), false);};

test('discovery topics and status labels expose the stable public contract', () => {
  assert.deepEqual(discoveryTopics.map(topic => topic.id), ['subjects', 'university', 'work', 'activities', 'undecided', 'free']);
  assert.ok(discoveryTopics.every(topic => topic.label.length > 0));
  assert.deepEqual(Object.keys(discoveryStatusLabels), ['possible', 'check_conditions', 'undetermined']);
  assert.ok(Object.isFrozen(discoveryTopics) && discoveryTopics.every(Object.isFrozen));
  assert.equal(MAX_DISCOVERY_REQUEST_BYTES, 48 * 1024);
  assert.equal(MAX_DISCOVERY_RESULT_BYTES, 192 * 1024);
});

test('request intent contracts keep optional consultation text but require a free-topic wish', () => {
  for (const intent of ['discover', 'expand', 'ask']) assert.equal(validateDiscoveryRequest(request(intent)), true, intent);
  for (const topic of discoveryTopics.map(item => item.id).filter(id => id !== 'free')) {
    assert.equal(validateDiscoveryRequest({intent: 'discover', consultation: consultation(topic)}), true, topic);
  }
  const free = {intent: 'discover', consultation: consultation('free')};
  assert.equal(validateDiscoveryRequest(free), false);
  free.consultation.wish = ' ';assert.equal(validateDiscoveryRequest(free), false);
  free.consultation.wish = '授業の外でもできることを考えたい';assert.equal(validateDiscoveryRequest(free), true);
  for (const field of ['wish', 'situation', 'conditions']) {
    const value = request();value.consultation[field] = 'あ'.repeat(700);assert.equal(validateDiscoveryRequest(value), true);
    value.consultation[field] += 'あ';assert.equal(validateDiscoveryRequest(value), false);
    value.consultation[field] = null;assert.equal(validateDiscoveryRequest(value), false);
  }
  invalidRequest(value => {value.consultation.topic = 'grades';});
  invalidRequest(value => {delete value.consultation.conditions;});
  invalidRequest(value => {value.consultation.name = 'collected personal name';});
  invalidRequest(value => {value.memo = 'unnecessary original memo';});
  invalidRequest(value => {value.route = route();});
  invalidRequest(value => {value.trail = [];});
});

test('expansion and questions carry only bounded route context and a short trail', () => {
  for (const intent of ['expand', 'ask']) {
    for (const field of ['route', 'trail']) {const value = request(intent);delete value[field];assert.equal(validateDiscoveryRequest(value), false);}
    const value = request(intent);value.trail = Array(8).fill('あ'.repeat(120));assert.equal(validateDiscoveryRequest(value), true);
    value.trail.push('one more');assert.equal(validateDiscoveryRequest(value), false);
    value.trail = ['あ'.repeat(121)];assert.equal(validateDiscoveryRequest(value), false);
    value.trail = [''];assert.equal(validateDiscoveryRequest(value), false);
  }
  const expanded = request('expand');expanded.question = 'extra';assert.equal(validateDiscoveryRequest(expanded), false);
  const asked = request('ask');asked.question = 'あ'.repeat(600);assert.equal(validateDiscoveryRequest(asked), true);
  asked.question += 'あ';assert.equal(validateDiscoveryRequest(asked), false);
  asked.question = '  ';assert.equal(validateDiscoveryRequest(asked), false);
  delete asked.question;assert.equal(validateDiscoveryRequest(asked), false);
});

test('route fields reject missing unknowns, dangerous IDs, wrong status and oversized content', () => {
  for (const id of ['__proto__', 'prototype', 'constructor', 'Constructor', 'with space', 'x/y', '', 'x'.repeat(65)]) invalidRoute(value => {value.id = id;});
  for (const field of ['id', 'title', 'description', 'reason', 'examples', 'conditions', 'unknowns', 'next_step', 'status']) invalidRoute(value => {delete value[field];});
  invalidRoute(value => {value.score = 0.99;});
  invalidRoute(value => {value.status = 'recommended';});
  for (const [field, limit] of [['title', 120], ['description', 900], ['reason', 900], ['next_step', 900]]) {
    const value = request('expand');value.route[field] = 'あ'.repeat(limit);assert.equal(validateDiscoveryRequest(value), true);
    value.route[field] += 'あ';assert.equal(validateDiscoveryRequest(value), false);
    invalidRoute(value => {value[field] = ' ';});
  }
  for (const field of ['examples', 'conditions', 'unknowns']) {
    const value = request('expand');value.route[field] = Array(5).fill('あ'.repeat(400));assert.equal(validateDiscoveryRequest(value), true);
    value.route[field].push('sixth');assert.equal(validateDiscoveryRequest(value), false);
    for (const entries of [[], [''], ['あ'.repeat(401)], 'not an array', [null]]) invalidRoute(value => {value[field] = entries;});
  }
});

test('results require the right candidate count, unique IDs and an honest answer field', () => {
  for (const [intent, min, max] of [['discover', 3, 5], ['expand', 2, 5], ['ask', 0, 3]]) {
    for (const count of [min, max]) {const value = result(count);if (intent === 'ask') value.answer = '条件を確認するための説明。';assert.equal(validateDiscoveryResult(value, intent), true);}
    const tooMany = result(max + 1);tooMany.answer = 'answer';assert.equal(validateDiscoveryResult(tooMany, intent), false);
    if (min) assert.equal(validateDiscoveryResult(result(min - 1), intent), false);
  }
  const value = result();value.routes[1].id = value.routes[0].id;assert.equal(validateDiscoveryResult(value), false);
  assert.equal(validateDiscoveryResult(result(), 'invented'), false);
  assert.equal(validateDiscoveryResult(result(0), 'ask'), false);
  for (const [field, limit] of [['summary', 1200], ['answer', 1500]]) {
    const value = result();value[field] = 'あ'.repeat(limit);assert.equal(validateDiscoveryResult(value), true);
    value[field] += 'あ';assert.equal(validateDiscoveryResult(value), false);
  }
  const noSummary = result();noSummary.summary = ' ';assert.equal(validateDiscoveryResult(noSummary), false);
  const omittedAnswer = result();delete omittedAnswer.answer;assert.equal(validateDiscoveryResult(omittedAnswer), false);
});

test('non-JSON structures, accessors and extra fields are rejected without evaluating getters', () => {
  for (const invalid of [null, [], 'text', 42, Object.create({intent: 'discover'})]) assert.equal(validateDiscoveryRequest(invalid), false);
  let reads = 0;
  const withGetter = {...request()};Object.defineProperty(withGetter, 'intent', {enumerable: true, get() {reads++;return 'discover';}});
  assert.equal(validateDiscoveryRequest(withGetter), false);assert.equal(reads, 0);
  invalidRequest(value => {Object.defineProperty(value.consultation, 'wish', {enumerable: true, get() {reads++;return '';}});});
  assert.equal(reads, 0);
  invalidRequest(value => {value[Symbol('hidden')] = true;});
  invalidRoute(value => {value.toJSON = () => route();});
  const sparse = request('expand');sparse.trail = Array(1);assert.equal(validateDiscoveryRequest(sparse), false);
  const namedArray = request('expand');namedArray.trail.extra = true;assert.equal(validateDiscoveryRequest(namedArray), false);
  const subclassArray = result();Object.setPrototypeOf(subclassArray.routes, {map() {throw new Error('must not run');}});assert.equal(validateDiscoveryResult(subclassArray), false);
  const cyclic = result();cyclic.self = cyclic;assert.equal(validateDiscoveryResult(cyclic), false);
});

test('complete Japanese input at every declared limit still fits the bounded request and response', () => {
  const large = route('a'.repeat(64));large.title = 'あ'.repeat(120);
  for (const field of ['description', 'reason', 'next_step']) large[field] = 'あ'.repeat(900);
  for (const field of ['examples', 'conditions', 'unknowns']) large[field] = Array(5).fill('あ'.repeat(400));
  const value = request('ask');value.route = large;value.question = 'あ'.repeat(600);value.trail = Array(8).fill('あ'.repeat(120));
  for (const field of ['wish', 'situation', 'conditions']) value.consultation[field] = 'あ'.repeat(700);
  assert.equal(validateDiscoveryRequest(value), true);
  const response = {summary: 'あ'.repeat(1200), answer: 'あ'.repeat(1500), routes: Array.from({length: 5}, (_, i) => ({...copy(large), id: `max-${i}`}))};
  assert.equal(validateDiscoveryResult(response), true);
});

test('chosen routes become a valid editable tree without changing their data or claiming a judgment', () => {
  const chosen = Array.from({length: 6}, (_, i) => route(`selected-${i}`)), before = copy(chosen);
  const tree = createDiscoveryTree(chosen, {question: '二つ以上の候補をどう確かめる？'});
  assert.ok(validateTree(tree, {maxNodes: 40}));assert.equal(tree.nodes.length, 37);
  assert.deepEqual(chosen, before);assert.equal(tree.nodes.filter(node => node.type === 'project').length, 6);
  for (const type of ['hypothesis', 'research_note', 'evidence', 'risk', 'action']) assert.equal(tree.nodes.filter(node => node.type === type).length, 6);
  assert.ok(tree.summary.includes('架空') && tree.summary.includes('未確認'));
  for (const node of tree.nodes) assert.ok(node.evidence.includes('未確認') && node.evidence.includes('判定ではありません'));
  tree.nodes[1].detail = '本人が直した内容';assert.deepEqual(chosen, before);
  for (const selected of [[], Array(7).fill(route()), [route(), route()]]) assert.throws(() => createDiscoveryTree(selected));
});

test('tree conversion keeps AI/demo/manual provenance and bounds maximum-length route text', () => {
  for (const origin of ['ai', 'generated']) {
    const tree = createDiscoveryTree([route()], {origin});assert.ok(tree.summary.includes('AI提案'));
    assert.ok(tree.nodes.every(node => node.evidence.includes('AI提案')));
  }
  assert.ok(createDiscoveryTree([route()], {origin: 'manual'}).summary.includes('本人'));
  assert.throws(() => createDiscoveryTree([route()], {origin: 'verified'}));
  const large = route();large.title = 'あ'.repeat(120);
  for (const field of ['description', 'reason', 'next_step']) large[field] = 'あ'.repeat(900);
  for (const field of ['examples', 'conditions', 'unknowns']) large[field] = Array(5).fill('あ'.repeat(400));
  const tree = createDiscoveryTree([large], {question: 'あ'.repeat(700)});
  assert.ok(validateTree(tree, {maxNodes: 40}));assert.ok(tree.core_question.length <= 300);
  assert.ok(tree.nodes[0].label.length <= 180);assert.ok(tree.nodes.every(node => node.detail.length <= 1800));
  assert.ok(tree.nodes.some(node => node.detail.includes('続きは省略')));
});

test('user-written route text stays text when the converted tree is rendered', () => {
  const value = route();value.title = '<img src=x onerror=alert(1)>';value.description = '<script>alert(1)</script>';
  const tree = createDiscoveryTree([value]);
  assert.ok(!renderTree(tree, 'root').includes('<img'));
  assert.ok(!renderDetail(tree.nodes[1], 'sample').includes('<script>'));
});

test('four fictional demos offer bounded hierarchical exploration with meaningful deeper alternatives', () => {
  assert.deepEqual(routeDemos.map(demo => demo.id), ['subjects', 'university', 'undecided', 'activities']);
  for (const demo of routeDemos) {
    assert.ok(demo.summary.includes('架空'), demo.id);
    assert.equal(demo.topic, demo.consultation.topic);
    assert.ok(validateDiscoveryRequest({intent: 'discover', consultation: demo.consultation}), demo.id);
    const ids = new Set(demo.routes.map(item => item.id));assert.equal(ids.size, demo.routes.length);
    assert.ok(demo.rootIds.length >= 3 && demo.rootIds.length <= 4);
    const roots = demo.rootIds.map(id => demo.routes.find(item => item.id === id));
    assert.ok(validateDiscoveryResult({summary: demo.summary, answer: '', routes: roots}), demo.id);
    for (const item of demo.routes) assert.ok(validateDiscoveryResult({summary: demo.summary, answer: '架空例を検討するための説明。', routes: [item]}, 'ask'), item.id);
    const reached = new Set();
    const walk = (id, ancestors = []) => {
      assert.ok(ids.has(id), id);assert.ok(!ancestors.includes(id), 'no cycles');
      reached.add(id);const children = demo.children[id] || [];
      assert.ok(children.length === 0 || (children.length >= 2 && children.length <= 4), id);
      return children.length ? 1 + Math.max(...children.map(child => walk(child, [...ancestors, id]))) : 0;
    };
    const depths = demo.rootIds.map(id => walk(id));
    assert.ok(depths.filter(depth => depth >= 3).length >= 2, demo.id);
    assert.equal(reached.size, ids.size, 'every candidate can be reached from a main direction');
    for (const [id, linked] of Object.entries(demo.related)) {
      assert.ok(ids.has(id));assert.ok(linked.every(next => ids.has(next) && next !== id));
    }
    assert.ok(!/RE:School|ROOTS|CoD|偏差値|合格できます|成功する道/.test(JSON.stringify(demo)), demo.id);
  }
});

test('the university demo discovers concrete fields before drilling into learning and entry conditions', () => {
  const demo = getRouteDemo('university');
  const byId = new Map(demo.routes.map(item => [item.id, item]));
  const socialOptions = demo.children['university-question'].map(id => byId.get(id).title);
  assert.ok(socialOptions.some(title => title.includes('経済学部')));
  assert.ok(socialOptions.some(title => title.includes('法学部')));
  const technicalOptions = demo.children['university-task'].map(id => byId.get(id).title);
  assert.ok(technicalOptions.some(title => title.includes('情報系')));
  assert.ok(technicalOptions.some(title => title.includes('心理')));
  for (const path of [
    ['university-question', 'university-community', 'university-community-method', 'university-course-table'],
    ['university-task', 'university-making', 'university-paper-prototype', 'university-paper-two']
  ]) {
    assert.ok(demo.rootIds.includes(path[0]));
    for (let i = 1; i < path.length; i++) assert.ok(demo.children[path[i - 1]].includes(path[i]));
  }
  assert.ok(byId.get('university-course-table').title.includes('数学・統計'));
  assert.ok(byId.get('university-course-question').title.includes('入試科目'));
  assert.ok(byId.get('university-paper-two').title.includes('プログラミング'));
  assert.ok(byId.get('university-required').title.includes('専門学校'));
  assert.ok(byId.get('university-required').title.includes('短大'));
  for (const item of demo.routes) assert.ok(item.conditions.length > 0 && item.unknowns.length > 0);
});

test('demo retrieval makes independent copies and never resolves prototype property names', () => {
  const first = getRouteDemo('subjects'), second = getRouteDemo('subjects');
  assert.ok(first && second);assert.notEqual(first, second);
  first.routes[0].title = '本人が書き換えた項目';first.rootIds.push('extra');
  assert.notDeepEqual(first, second);assert.deepEqual(second, routeDemos[0]);
  for (const id of ['missing', '__proto__', 'constructor', 'prototype', null, {}]) assert.equal(getRouteDemo(id), null);
});
