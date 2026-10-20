import test from 'node:test';
import assert from 'node:assert/strict';
import {createTreeDocument, stringifyTreeDocument, parseTreeDocument, nodeOriginLabels} from '../retree-mindmap/src/tree-file.js';
import {printMemo} from '../retree-mindmap/src/research-print.js';
import {renderDetail} from '../retree-mindmap/src/tree-renderer.js';

const tree = {
  core_question: '学校外で学ぶ方法には何がある？',
  summary: '一般的な選択肢の資料。本人の希望や利用条件への当てはまりは未確認です。',
  nodes: [
    {id: 'root', parent: null, label: '学校外で学ぶ方法', type: 'core_question', detail: '比較するための問いです。', evidence: '未確認', risk: '本人の条件は未確認', next_action: '気になる選択肢の条件を調べる'},
    {id: 'public-class', parent: 'root', label: '大学などの公開講座', type: 'project', detail: '公開講座を探して、参加対象や日程を確認する方法。', evidence: '各主催者の案内で要確認', risk: '対象年齢・開催状況は未確認', next_action: '主催者の公開情報で参加条件を調べる'}
  ]
};
const positions = new Map([['root', {x: -200, y: 0}], ['public-class', {x: 300, y: 150}]]);
const nodeOrigins = Object.fromEntries(tree.nodes.map(node => [node.id, 'reference']));

test('Atlas general references keep their own unverified origin in version 1 JSON', () => {
  const document = createTreeDocument(tree, positions, 'public-class', 'reference', false, nodeOrigins);
  const restored = parseTreeDocument(stringifyTreeDocument(document));
  assert.equal(restored.version, 1);
  assert.deepEqual(restored, document);
  assert.equal(restored.provenance.origin, 'reference');
  assert.equal(restored.provenance.verification, 'unverified');
  assert.deepEqual(restored.nodeOrigins, nodeOrigins);
  assert.equal(nodeOriginLabels.reference, '全体マップの一般資料（本人の条件は未確認）');

  // A personal edit changes only that node's origin; the surrounding materials
  // remain identifiable as general references rather than the user's account.
  document.tree.nodes[1].detail = 'この公開講座の対象年齢を次の面談で確認したい。';
  document.nodeOrigins['public-class'] = 'user_edited';
  document.provenance.edited = true;
  const edited = parseTreeDocument(stringifyTreeDocument(document));
  assert.equal(edited.nodeOrigins.root, 'reference');
  assert.equal(edited.nodeOrigins['public-class'], 'user_edited');
  assert.equal(edited.provenance.origin, 'reference');
});

test('reference provenance expands v1 without changing older files or accepting unknown origins', () => {
  for (const source of ['sample', 'generated', 'manual', 'imported']) {
    const document = createTreeDocument(tree, positions, 'root', source, false);
    assert.deepEqual(parseTreeDocument(stringifyTreeDocument(document)), document);
  }
  const document = createTreeDocument(tree, positions, 'root', 'reference', false, nodeOrigins);
  for (const change of [d => d.provenance.origin = 'verified_reference', d => d.nodeOrigins.root = 'verified_reference']) {
    const invalid = structuredClone(document);
    change(invalid);
    assert.throws(() => parseTreeDocument(JSON.stringify(invalid)));
  }
});

test('general references and personal notes retain distinct origins through JSON and printing', () => {
  const mixedOrigins = {...nodeOrigins, root: 'manual'};
  const document = createTreeDocument(tree, positions, 'root', 'reference', false, mixedOrigins);
  const restored = parseTreeDocument(stringifyTreeDocument(document));
  assert.equal(restored.provenance.origin, 'reference');
  assert.deepEqual(restored.nodeOrigins, mixedOrigins);
  const html = printMemo(restored.tree, 'reference', restored.nodeOrigins, true);
  assert.match(html, /全体マップの一般資料と本人のメモをまとめた図です/);
  assert.match(html, /自分で追加/);
  assert.match(html, /全体マップの一般資料（本人の条件は未確認）/);
  assert.doesNotMatch(html, /AIが整理|架空の相談例です/);
});

test('print and PDF memo identify general references without calling them AI, fictional examples, or personal records', () => {
  const html = printMemo(tree, 'reference', nodeOrigins, true);
  assert.match(html, /全体マップの一般資料です。本人の条件への当てはまり・資料の内容は未確認です。/);
  assert.match(html, /全体マップの一般資料（本人の条件は未確認）/);
  assert.doesNotMatch(html, /AIが整理|架空の相談例です|本人が作成・編集した図です/);
  assert.match(printMemo(tree, 'sample'), /架空の相談例です/);
  assert.match(printMemo(tree, 'generated'), /AIが整理した内容/);
  const detail = renderDetail(tree.nodes[1], 'reference');
  assert.match(detail, /全体マップから引き継いだ一般資料です/);
  assert.match(detail, /本人の条件への当てはまり/);
  assert.doesNotMatch(detail, /AIがメモから整理|サンプル内の資料名/);
});
