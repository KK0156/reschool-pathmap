import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryTransfer} from '../src/route-model.js';
import {getRouteDemo} from '../src/route-demos.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
import {layoutMindMap} from '../retree-mindmap/src/mind-map-layout.js';
import {createTreeDocument, stringifyTreeDocument, parseTreeDocument} from '../retree-mindmap/src/tree-file.js';
import {editNode} from '../retree-mindmap/src/tree-edit.js';

const candidates = () => getRouteDemo('subjects').routes.slice(0, 2).map((route, index) => ({...route, id: 'kept-' + index}));

test('a mixed transfer keeps demo and AI provenance on their own branches', () => {
  const routes = candidates(), before = structuredClone(routes);
  const {tree, origin, nodeOrigins} = createDiscoveryTransfer(routes, {question: '二つの候補をどう確かめる？', origins: ['demo', 'ai']});
  assert.ok(validateTree(tree));
  assert.equal(origin, 'mixed');
  assert.match(tree.summary, /架空の探索デモとAI提案/);
  const root = tree.nodes.find(node => node.parent === null);
  const projects = tree.nodes.filter(node => node.parent === root.id);
  assert.equal(nodeOrigins[root.id], 'manual');
  for (const [index, project] of projects.entries()) {
    for (const node of tree.nodes.filter(node => node.id === project.id || node.parent === project.id)) {
      assert.equal(nodeOrigins[node.id], index === 0 ? 'sample' : 'generated');
      assert.match(node.evidence, index === 0 ? /架空の探索デモ/ : /AI提案/);
      if (index === 0) assert.doesNotMatch(node.evidence, /AI提案/);
      assert.match(node.evidence, /未確認/);
    }
  }
  assert.deepEqual(routes, before);
});

test('JSON roundtrip keeps mixed origins and subsequent personal edits unverified', () => {
  const transfer = createDiscoveryTransfer(candidates(), {origins: ['demo', 'ai']});
  const tree = editNode(transfer.tree, 'root', {label: '自分で考え直した問い'});
  const positions = new Map(layoutMindMap(tree).nodes.map(node => [node.id, {x: node.x, y: node.y}]));
  const nodeOrigins = {...transfer.nodeOrigins, root: 'user_edited'};
  const document = createTreeDocument(tree, positions, 'root', 'generated', true, nodeOrigins);
  const restored = parseTreeDocument(stringifyTreeDocument(document));
  assert.deepEqual(restored.nodeOrigins, nodeOrigins);
  assert.equal(restored.provenance.verification, 'unverified');
  assert.equal(restored.tree.nodes.find(node => node.id === 'root').label, '自分で考え直した問い');
  assert.ok(Object.values(restored.nodeOrigins).includes('sample'));
  assert.ok(Object.values(restored.nodeOrigins).includes('generated'));
});

test('uniform transfers keep their source while incomplete origin mappings fail safely', () => {
  for (const origin of ['demo', 'ai']) {
    const result = createDiscoveryTransfer(candidates(), {origins: [origin, origin]});
    assert.equal(result.origin, origin);
    assert.ok(Object.values(result.nodeOrigins).every(value => value === (origin === 'demo' ? 'sample' : 'generated')));
  }
  for (const origins of [undefined, [], ['demo'], ['demo', 'verified'], ['demo', 'ai', 'demo']]) {
    assert.throws(() => createDiscoveryTransfer(candidates(), {origins}));
  }
});
