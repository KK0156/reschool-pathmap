import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {researchChapters, reportSummary, schoolResearchDirections} from '../src/research-report.js';
import {researchStages} from '../src/research-data.js';

test('research report covers thirteen distinct chapters without replacing the education-first seven-stage record', () => {
  assert.equal(researchChapters.length, 13);
  assert.equal(new Set(researchChapters.map(chapter => chapter.id)).size, 13);
  assert.equal(researchChapters[0].id, 'education-origin');
  assert.equal(researchStages.length, 7);
  assert.equal(researchStages[0].id, 'education-comparison');
  for (const chapter of researchChapters) {
    for (const key of ['title','summary','status','question','hypothesis','investigation','findings','counterpoint','evolution','unknown']) {
      assert.ok(typeof chapter[key] === 'string' && chapter[key].trim(), `${chapter.id}: ${key}`);
    }
    assert.ok(chapter.sources.length >= 2, chapter.id);
    for (const source of chapter.sources) {
      assert.ok(source.label && source.status, chapter.id);
      if (source.href === null) continue;
      const url = new URL(source.href, 'https://example.test');
      assert.ok(['https:', 'http:'].includes(url.protocol));
      if (url.origin === 'https://example.test' && !source.href.startsWith('/#/')) {
        assert.ok(existsSync(source.href.slice(1)), `Missing published source: ${source.href}`);
      }
    }
    if (chapter.table) {
      assert.ok(chapter.table.caption && chapter.table.headers.length >= 2);
      assert.ok(chapter.table.rows.length >= 2);
      chapter.table.rows.forEach(row => assert.equal(row.length, chapter.table.headers.length, chapter.id));
    }
  }
});

test('survey and newspaper figures remain author records, not independently reverified representative results', () => {
  const survey = researchChapters.find(chapter => chapter.id === 'survey-record');
  assert.deepEqual(survey.table.rows.map(row => row[1]), ['32', '8', '3', '43']);
  assert.match(survey.findings, /全国代表性のない調査/);
  assert.match(survey.investigation, /原票.*参照できていません/);
  assert.ok(survey.sources.every(source => source.href === null));
  const papers = researchChapters.find(chapter => chapter.id === 'newspaper-materials');
  assert.deepEqual(papers.table.rows.map(row => row[1]), ['157', '141', '183']);
  assert.match(papers.status, /独立再検証なし/);
  assert.match(papers.findings, /単純な加算・差引きはしません/);
  assert.ok(papers.sources.every(source => source.href === null));
});

test('interview completion and author-reviewed summary do not fabricate quotations or settle the final cause', () => {
  const interview = researchChapters.find(chapter => chapter.id === 'vice-principal-interview');
  assert.match(interview.investigation, /実施済み.*本人が確認した要約/);
  assert.match(interview.investigation, /逐語録.*参照できていません/);
  assert.match(interview.findings, /発言.*作っていません/);
  assert.ok(interview.sources.every(source => source.href === null));
  const next = researchChapters.find(chapter => chapter.id === 'next-fieldwork');
  assert.match(next.findings, /次の元教員インタビューが終わるまで.*根本問題.*最適な解決策.*保留/);
  assert.match(reportSummary.limitations.join(' '), /MASTER.*今回参照できていません/);
  assert.ok(schoolResearchDirections.every(direction => !JSON.stringify(direction).includes('ROOTS')));
  assert.ok(schoolResearchDirections.some(direction => direction.limits.includes('AIが最適な解決策とは確定していない')));
});
