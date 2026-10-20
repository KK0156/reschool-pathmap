import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {researchOrigin,researchStages,researchEvidenceLabels,interviewFollowUp,archiveItems} from '../src/research-data.js';

const categories=['fact','observation','hypothesis','counterargument','unresearched','prototype','tested'];
const stageIds=['education-comparison','resource-model','early-school','constraints','wider-comparison','path-tree','interview-followup'];
const statuses=new Set(['present','not_published','not_verified']);

test('research evidence has seven distinct categories without changing the education-first sequence',()=>{
 assert.equal(researchOrigin,'日本とアメリカにおける教育機会・資金・人的資源の違い');
 assert.deepEqual(researchStages.map(stage=>stage.id),stageIds);
 assert.deepEqual(Object.keys(researchEvidenceLabels),categories);
 assert.equal(new Set(Object.values(researchEvidenceLabels)).size,7);
 for(const stage of researchStages){
  assert.deepEqual(Object.keys(stage.evidence),[...categories,'sources'],stage.id);
  for(const category of categories)assert.ok(typeof stage.evidence[category]==='string'&&stage.evidence[category].trim().length>0,`${stage.id}: ${category}`);
  assert.ok(stage.status&&stage.source&&stage.question&&stage.note,`Retained fields: ${stage.id}`);
 }
});

test('source availability distinguishes visible code from unpublished or unverified research records',()=>{
 for(const stage of researchStages){
  assert.ok(stage.evidence.sources.length>=2,stage.id);
  for(const source of stage.evidence.sources){
   assert.deepEqual(Object.keys(source),['label','path','availability']);
   assert.ok(typeof source.label==='string'&&source.label.trim());
   assert.ok(statuses.has(source.availability),`${stage.id}: ${source.availability}`);
   if(source.availability==='present'){
    assert.ok(typeof source.path==='string');
    assert.ok(existsSync(source.path.replace(/^\//,'')),`${stage.id}: missing published reference ${source.path}`);
   }else assert.equal(source.path,null,`${stage.id}: do not invent a path for missing evidence`);
  }
 }
 const early=researchStages.find(stage=>stage.id==='early-school');
 assert.ok(early.evidence.sources.some(source=>source.path==='/original.html'&&source.availability==='present'));
 const current=researchStages.find(stage=>stage.id==='path-tree');
 assert.ok(current.evidence.sources.some(source=>source.path==='/reschool.html'&&source.availability==='present'));
 assert.ok(current.evidence.sources.some(source=>source.label.includes('Prototype 2')&&source.availability==='not_published'));
 assert.ok(current.evidence.sources.some(source=>source.label.includes('効果測定')&&source.availability==='not_verified'));
 assert.equal(archiveItems.find(item=>item.id==='finder-v2').href,null);
 assert.equal(archiveItems.find(item=>item.id==='evidence-pack').href,null);
});

test('code checks and available prototypes do not become claims of educational effect or final cause',()=>{
 for(const stage of researchStages)assert.match(stage.evidence.tested,/未検証|未掲載|未確認|区別/,stage.id);
 const model=researchStages.find(stage=>stage.id==='resource-model');
 assert.match(model.evidence.hypothesis,/ではないか/);
 const current=researchStages.find(stage=>stage.id==='path-tree');
 assert.match(current.evidence.counterargument,/紙|箇条書き/);
 assert.match(current.evidence.unresearched,/生徒|先生/);
 const comparison=researchStages.find(stage=>stage.id==='wider-comparison');
 assert.match(comparison.evidence.counterargument,/原因.*できない/);
 const constraints=researchStages.find(stage=>stage.id==='constraints');
 assert.match(constraints.evidence.counterargument,/最大原因は未特定/);
 assert.match(interviewFollowUp.boundary,/AIが最適解/);
 assert.match(interviewFollowUp.boundary,/導けません/);
});

test('final problem identification stays pending until the next former-teacher interview',()=>{
 assert.match(interviewFollowUp.problemStatus,/次の元教員インタビュー/);
 assert.match(interviewFollowUp.problemStatus,/終わるまで.*最終特定.*保留/);
 assert.match(interviewFollowUp.nextInterview,/確認待ち/);
 assert.match(interviewFollowUp.nextInterview,/日程.*発言.*結果.*掲載していません/);
 const interview=researchStages.at(-1);
 assert.match(interview.status,/原記録未確認/);
 assert.match(interview.evidence.unresearched,/次の元教員インタビュー.*最終特定.*保留/);
 assert.match(interview.evidence.tested,/未確認/);
 assert.ok(interview.evidence.sources.some(source=>source.label.includes('原記録')&&source.availability==='not_published'));
 assert.ok(interview.evidence.sources.some(source=>source.label.includes('次の元教員')&&source.availability==='not_verified'));
 assert.ok(interviewFollowUp.pending.some(item=>item.includes('異なる立場')));
});
