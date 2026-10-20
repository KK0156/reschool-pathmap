import test from 'node:test';
import assert from 'node:assert/strict';
import {studentSamples,featuredSampleIds,studentCases,studentCaseCategories,legacySampleAudit,reusableLegacySampleIndices} from '../src/student-data.js';
import {validateTree,renderTree,renderDetail} from '../retree-mindmap/src/tree-renderer.js';
import {samplePrompts} from '../retree-mindmap/src/sample-tree.js';

test('eight student entrances open complete, editable examples without developer research prerequisites',()=>{
  assert.equal(featuredSampleIds.length,8);
  const expected=['文系か理系か迷っている','大学で何を学べばいいか分からない','学部・学科を比較したい','やりたい仕事がまだ決まっていない','部活動と勉強を両立したい','学校外の活動に挑戦したい','自分に向いているか分からない分野がある','二つの進路で迷っている'];
  assert.deepEqual(featuredSampleIds.map(id=>studentSamples.find(sample=>sample.id===id)?.label),expected);
  assert.equal(new Set(studentSamples.map(sample=>sample.id)).size,studentSamples.length);
  for(const sample of studentSamples){
    assert.ok(validateTree(sample.tree,{maxNodes:40}),sample.id);
    assert.ok(sample.memo.length<=3000);
    assert.ok(studentCaseCategories.includes(sample.category));
    assert.ok(!/RE:School|ROOTS|CoD|AI半DX/.test(JSON.stringify(sample)),sample.id);
    assert.ok(sample.tree.summary.includes('架空'));
    assert.ok(sample.tree.nodes.filter(node=>node.type==='project').length>=2);
    for(const type of ['evidence','hypothesis','risk','counterargument','person','action'])assert.ok(sample.tree.nodes.some(node=>node.type===type),`${sample.id}: ${type}`);
    assert.ok(renderTree(sample.tree,'root').includes('data-node="root"'));
    for(const node of sample.tree.nodes){
      assert.ok(node.evidence.includes('未確認'));
      assert.ok(node.next_action.trim().length>0);
      assert.ok(renderDetail(node,'sample').includes('実在する証拠の確認済み表示ではありません'));
    }
  }
});

test('fictional cases describe the whole comparison and link to the matching usable tree',()=>{
  assert.ok(studentCases.length>=10);
  assert.equal(new Set(studentCases.map(c=>c.id)).size,studentCases.length);
  for(const c of studentCases){
    assert.ok(c.profile.includes('架空'));
    assert.ok(c.concern&&c.title);
    assert.ok(c.options.length>=2&&c.compared.length>=2&&c.unknown.length>=2&&c.actions.length>=2,c.id);
    assert.ok(studentSamples.some(sample=>sample.id===c.sampleId),c.id);
    assert.ok(studentCaseCategories.includes(c.category));
    assert.ok(!/合格できる|成功する|最適な進路|あなたに向いて/.test(JSON.stringify(c)));
  }
  const titles=studentCases.map(c=>c.title).join(' ');
  for(const topic of ['高校1年生','法学部と経済学部','高校3年生','数学','職業','スポーツ','費用','地方','学校では体験','大学・企業・地域'])assert.ok(titles.includes(topic),topic);
});

test('outside learning examples keep official verification and school/guardian mediation before contact',()=>{
  for(const id of ['outside-school','university-community','overseas-study']){
    const text=JSON.stringify(studentSamples.find(sample=>sample.id===id));
    assert.ok(text.includes('未確認')&&text.includes('公式')&&text.includes('保護者')&&text.includes('学校'));
    assert.ok(!/https?:\/\//.test(text),'no unverified real programme link');
  }
  const cost=JSON.stringify(studentSamples.find(sample=>sample.id==='costs'));
  assert.ok(cost.includes('家庭の収入・連絡先などは入力しない'));
});

test('all original samples remain accounted for and personal research examples move to archive',()=>{
  assert.equal(samplePrompts.length,32);
  assert.equal(legacySampleAudit.length,32);
  assert.deepEqual(legacySampleAudit.map(item=>item.index),Array.from({length:32},(_,i)=>i));
  for(const row of legacySampleAudit){
    if(row.replacementId)assert.ok(studentSamples.some(sample=>sample.id===row.replacementId));
    assert.ok(row.reason);
  }
  for(const index of [0,1,2,3,24,25,27])assert.equal(legacySampleAudit[index].placement,'developer-archive');
  for(const index of reusableLegacySampleIndices){
    assert.equal(legacySampleAudit[index].placement,'additional-student-example');
    assert.ok(validateTree(samplePrompts[index].tree));
  }
});
