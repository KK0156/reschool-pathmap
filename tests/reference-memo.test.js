import test from 'node:test';
import assert from 'node:assert/strict';
import {appendReferenceMemo} from '../src/reference-memo.js';
import {getRouteReferences} from '../src/reference-sites.js';

test('multiple sites become an unfinished research plan without losing the original memo', () => {
  const refs = getRouteReferences('field-economics').slice(0, 3);
  let note = '授業の違いを知りたい。';
  for (const reference of refs) {
    const result = appendReferenceMemo(note, reference);
    assert.equal(result.added, true);
    note = result.note;
  }
  assert.ok(note.startsWith('授業の違いを知りたい。'));
  for (const reference of refs) assert.ok(note.includes(reference.url));
  assert.equal((note.match(/これから調べる：/g) || []).length, 3);
  assert.ok(!/確認済み|読んだ日|利用可能と確認/.test(note));
  assert.deepEqual(appendReferenceMemo(note, refs[0]), {note, added: false});
});

test('an overlong plan is rejected rather than truncating existing personal text', () => {
  const note = 'あ'.repeat(700);
  const reference = getRouteReferences('field-economics')[0];
  assert.throws(() => appendReferenceMemo(note, reference), /700文字/);
  assert.equal(note.length, 700);
  for (const url of ['javascript:alert(1)', 'https://name:password@example.org/', '/relative']) {
    assert.throws(() => appendReferenceMemo('残すメモ', {...reference, url}), /参照先/);
  }
});
