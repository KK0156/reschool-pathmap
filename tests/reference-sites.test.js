import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAtlas} from '../src/route-atlas-data.js';
import {atlasSources} from '../src/route-atlas-sources.js';
import {referenceCategories,referenceSites,getAllReferences,getRouteReferences} from '../src/reference-sites.js';

const ids = values => values.map(item => item.id);

test('reference destinations are bounded HTTPS pages with scope, questions and honest review metadata', () => {
  assert.equal(referenceSites.length,18);
  assert.equal(new Set(ids(referenceSites)).size,referenceSites.length);
  const categories = new Set(referenceCategories.map(category => category.id));
  const kinds = new Set(['official','editorial','learning_provider']);
  for (const site of referenceSites) {
    assert.ok(site.id.startsWith('ref-'));
    assert.ok(!atlasSources.some(source => source.id===site.id),'lookup destinations must not masquerade as saved Atlas evidence');
    assert.ok(kinds.has(site.kind));
    const url = new URL(site.url);
    assert.equal(url.protocol,'https:');
    assert.equal(url.username+url.password,'');
    assert.ok(site.publisher&&site.title&&site.purpose&&site.limitations&&site.reviewScope,site.id);
    assert.match(site.reviewedOn,/^\d{4}-\d{2}-\d{2}$/);
    assert.ok(site.categoryIds.length>0&&site.categoryIds.every(id => id!=='all'&&categories.has(id)),site.id);
    assert.ok(site.checkItems.length>=2&&site.checkItems.every(text=>typeof text==='string'&&text.length>5),site.id);
    assert.ok(!/必ず合格|必ず就職|あなたに最適|適性\d|最新情報を取得済み/.test(JSON.stringify(site)),site.id);
  }
});

test('all seven after-school entrances and every leaf retain multiple contextual destinations', () => {
  const known = new Set(ids(referenceSites));
  for (const node of routeAtlas.nodes) {
    const references = getRouteReferences(node.id);
    assert.ok(references.length>=2,node.id);
    assert.equal(new Set(ids(references)).size,references.length,node.id);
    assert.ok(references.every(site => known.has(site.id)&&site.reason.length>15),node.id);
  }
  const work = ids(getRouteReferences('work-company'));
  assert.ok(work.includes('ref-mhlw-jobtag')&&work.includes('ref-mhlw-school-work'));
  assert.ok(!work.includes('ref-miraibook'),'school application guidance is not silently made the default for work');
  const overseas = ids(getRouteReferences('overseas-other'));
  assert.ok(overseas.includes('ref-jasso-overseas')&&overseas.includes('ref-mofa-safety'));
  assert.ok(!overseas.includes('ref-mext-tandai'));
  const later = ids(getRouteReferences('graduate-study'));
  assert.ok(later.includes('ref-mext-recurrent')&&later.includes('ref-ouj-flexible'));
});

test('filters describe the information to check without pruning any Atlas route', () => {
  const atlasBefore = JSON.stringify(routeAtlas);
  for (const category of referenceCategories) {
    const all = getAllReferences({category:category.id});
    assert.deepEqual(ids(all),ids(referenceSites.filter(site => category.id==='all'||site.categoryIds.includes(category.id))));
    for (const node of routeAtlas.nodes) {
      const selected=getRouteReferences(node.id,{category:category.id});
      assert.ok(selected.every(site => category.id==='all'||site.categoryIds.includes(category.id)),node.id);
      assert.ok(selected.every(site => ids(getRouteReferences(node.id)).includes(site.id)),node.id);
    }
  }
  assert.deepEqual(getAllReferences({category:'not-a-category'}),[]);
  assert.deepEqual(getRouteReferences('route-work',{category:'__proto__'}),[]);
  assert.equal(JSON.stringify(routeAtlas),atlasBefore);
});

test('deep links stay tied to the correct subject and do not replace the general destination', () => {
  const economy = getRouteReferences('field-economics');
  assert.equal(economy.find(site=>site.id==='ref-manabijon').url,'https://manabi.benesse.ne.jp/shokugaku/learning/system/014/index.html');
  assert.equal(economy.find(site=>site.id==='ref-study-sapuri').url,'https://shingakunet.com/gakumon/b1040/');
  assert.equal(getRouteReferences('field-math').find(site=>site.id==='ref-manabijon').url,'https://manabi.benesse.ne.jp/shokugaku/learning/kyoka/suugaku/');
  const design = getRouteReferences('field-design').find(site=>site.id==='ref-mhlw-jobtag');
  assert.match(design.title,/一例/);
  assert.equal(design.url,'https://shigoto.mhlw.go.jp/User/Occupation/Detail/326');
  assert.equal(getAllReferences().find(site=>site.id==='ref-mhlw-jobtag').url,'https://shigoto.mhlw.go.jp/User/');
});

test('catalogue entries and returned nested content are immutable while callers can own their list', () => {
  assert.ok(Object.isFrozen(referenceSites)&&Object.isFrozen(referenceCategories));
  for (const site of referenceSites) {
    assert.ok(Object.isFrozen(site)&&Object.isFrozen(site.checkItems)&&Object.isFrozen(site.categoryIds));
    assert.throws(()=>site.checkItems.push('changed'),TypeError);
  }
  const references = getRouteReferences('field-economics');
  assert.throws(()=>{references[0].reason='changed';},TypeError);
  references.pop();
  assert.notEqual(references.length,getRouteReferences('field-economics').length);
  const all = getAllReferences();
  all.length=0;
  assert.equal(referenceSites.length,18);
});

test('unknown IDs and unsafe option objects do not expose a fallback or evaluate getters', () => {
  for (const id of ['__proto__','constructor','prototype','not-a-route','',null,{},['route-work']]) assert.deepEqual(getRouteReferences(id),[]);
  let accessed = false;
  const getter = Object.defineProperty({},'category',{get(){accessed=true;throw new Error('not invoked');},enumerable:true});
  for (const options of [null,[],getter,Object.create({category:'work'})]) {
    assert.deepEqual(getAllReferences(options),[]);
    assert.deepEqual(getRouteReferences('route-work',options),[]);
  }
  assert.equal(accessed,false);
});

test('existing classification evidence is unchanged and remains separately identified', () => {
  assert.equal(routeAtlas.sources,atlasSources);
  assert.equal(atlasSources.length,12);
  for (const source of atlasSources) {
    const reference = referenceSites.find(site => site.id==='ref-'+source.id);
    assert.ok(reference);
    assert.equal(reference.reviewedOn,source.reviewedOn);
    assert.equal(reference.reviewScope,source.scope);
    assert.equal(reference.url,source.url);
    assert.ok(!Object.hasOwn(reference,'verified')&&!Object.hasOwn(reference,'status'));
  }
});
