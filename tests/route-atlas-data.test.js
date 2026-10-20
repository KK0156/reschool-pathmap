import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {atlasSources} from '../src/route-atlas-sources.js';
import {validateRouteAtlas} from '../src/route-atlas-model.js';

const byId = new Map(routeAtlas.nodes.map(node => [node.id, node]));
const facets = ['learning','life','cost','income','requirements','duration','future','change'];
const children = id => routeAtlas.edges.filter(edge => edge.type === 'contains' && edge.from === id).map(edge => edge.to);

test('the atlas starts with seven equally detailed routes rather than a university default', () => {
  assert.ok(validateRouteAtlas(routeAtlas));
  assert.ok(routeAtlas.nodes.length >= 70 && routeAtlas.nodes.length <= 100);
  assert.deepEqual(routeAtlas.lenses.map(lens => lens.id), ['after-school','fields','learning','experiences']);
  const roots = routeAtlas.lenses[0].rootIds;
  assert.deepEqual(roots, ['route-work','route-specialist','route-university','route-overseas','route-explore','route-work-learn','route-relearn']);
  for (const id of roots) {
    const node = byId.get(id);assert.equal(node.kind, 'route');
    assert.deepEqual(Object.keys(node.facets), facets);
    assert.ok(facets.every(key => node.facets[key].length > 0));
    assert.ok(children(id).length >= 2, id);
  }
  assert.ok(routeAtlas.description.includes('大学進学を標準や上位には置きません'));
});

test('all lenses lead to concrete alternatives and contain no inaccessible or cyclic hierarchy', () => {
  const roots = routeAtlas.lenses.flatMap(lens => lens.rootIds), reached = new Set();
  const walk = (id, trail = []) => {
    assert.ok(byId.has(id), id);assert.ok(!trail.includes(id), 'contains edges must form a DAG');
    reached.add(id);
    for (const child of children(id)) walk(child, [...trail,id]);
  };
  for (const id of roots) walk(id);
  assert.equal(reached.size, byId.size, 'every node is accessible through a lens hierarchy');
  const parentCounts = new Map();
  for (const edge of routeAtlas.edges.filter(edge => edge.type === 'contains')) parentCounts.set(edge.to, (parentCounts.get(edge.to) || 0) + 1);
  assert.ok([...parentCounts.values()].some(count => count > 1), 'the same route can be reached through more than one view');
  for (const demo of routeAtlas.demos) {
    const lens = routeAtlas.lenses.find(item => item.id === demo.lensId);
    assert.ok(lens.rootIds.includes(demo.path[0]));assert.ok(demo.path.length >= 3, demo.id);
    for (let i = 1; i < demo.path.length; i++) assert.ok(children(demo.path[i - 1]).includes(demo.path[i]), demo.id);
    assert.equal(byId.get(demo.path.at(-1)).kind, 'route');
  }
  assert.deepEqual(routeAtlas.demos.map(demo => demo.id), ['undecided','subjects','university']);
});

test('life, work, money, qualifications and later changes remain visible on every route', () => {
  const nodeKeys = ['id','title','kind','summary','facets','examples','questions','nextStep','sourceIds','tags'];
  const sourceIds = new Set(atlasSources.map(source => source.id));
  assert.equal(routeAtlas.sources, atlasSources);
  for (const node of routeAtlas.nodes) {
    assert.deepEqual(Object.keys(node), nodeKeys, node.id);
    assert.deepEqual(Object.keys(node.facets), facets, node.id);
    assert.ok(node.examples.length > 0 && node.questions.length > 0 && node.tags.length > 0, node.id);
    assert.ok(node.sourceIds.every(id => sourceIds.has(id)), node.id);
    assert.ok(!/\d[\d,]*(?:万円|円|年収|年間|か月|ヶ月|年制)/.test(JSON.stringify(node)), 'no invented exact costs, salaries or study durations');
    assert.ok(!/必ず合格|必ず就職|誰でも入学|あなたに最適|将来性が高い/.test(JSON.stringify(node)), node.id);
  }
  for (const title of ['経済','法','情報','文理','科学','芸術','健康']) assert.ok(routeAtlas.nodes.some(node => node.title.includes(title)), title);
});

test('transitions between work, vocational education and later study state their unchecked conditions', () => {
  const hasTransition = (from, to) => {
    const edge = routeAtlas.edges.find(item => item.from === from && item.to === to && item.type === 'transition');
    assert.ok(edge, `${from} → ${to}`);assert.equal(edge.verification, 'unverified');
    assert.ok(/未確認|確認|条件/.test(edge.condition));assert.ok(edge.condition.length > 20);
  };
  hasTransition('route-work','route-university');
  hasTransition('route-specialist','route-work');
  hasTransition('route-work','route-relearn');
  hasTransition('route-university','route-work');
  hasTransition('route-work','graduate-study');
  hasTransition('university-short','university-general');
  assert.ok(routeAtlas.edges.some(edge => edge.from === 'field-information' && edge.to === 'specialist-tech'));
  assert.ok(routeAtlas.edges.some(edge => edge.from === 'field-information' && edge.to === 'work-learn-trade'));
});

test('coverage and outside opportunities clearly separate general examples from verified participation', () => {
  assert.ok(routeAtlas.coverage.scope.includes('網羅するものではありません'));
  assert.ok(routeAtlas.coverage.limitations.some(text => text.includes('本人')));
  assert.ok(routeAtlas.coverage.limitations.some(text => text.includes('確認した日付')));
  assert.ok(routeAtlas.coverage.notIncluded.some(text => text.includes('最新の募集')));
  assert.ok(routeAtlas.coverage.notIncluded.some(text => text.includes('個人情報')));
  for (const id of ['experience-outside','experience-university','experience-community','experience-workplace','overseas-other']) {
    const body = JSON.stringify(byId.get(id));
    assert.ok(/先生|学校/.test(body), id);
    assert.ok(/保護者|学校と確認/.test(body), id);
    assert.ok(!/https?:\/\//.test(body), 'no unverified programme URL');
  }
  for (const edge of routeAtlas.edges.filter(edge => edge.type !== 'contains')) assert.equal(edge.verification, 'unverified', `${edge.from} → ${edge.to}`);
});
