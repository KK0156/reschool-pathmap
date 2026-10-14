import test from 'node:test';
import assert from 'node:assert/strict';
import {paths,cases,schools,interests,approaches,values,findPaths} from '../src/data.js';
test('all fields contain study routes, jobs and a complete fictional case',()=>{
 assert.equal(new Set(paths.map(p=>p.id)).size,16);
 for(const p of paths){
  assert.ok(p.learn.length>1);assert.ok(p.jobs.length>1);assert.ok(p.step);
  const c=cases.find(c=>c.id===p.caseId);
  assert.equal(c?.path,p.id);assert.ok(c.reason&&c.turn&&c.difficulty);assert.equal(c.route.length,3);
 }
});
test('every concrete interest is covered and all answer combinations remain usable',()=>{
 for(const interest of interests){
  if(interest!=='まだ決まっていない')assert.ok(paths.some(p=>p.interests.includes(interest)),interest);
  for(const approach of approaches)for(const value of values){
   const results=findPaths({interests:[interest],approach:[approach],value:[value]});
   assert.ok(results.length>0&&results.length<=6);
   assert.ok(results.every((r,i)=>i===0||results[i-1].score>=r.score));
  }
 }
});
test('multiple answers are accepted and undecided selections show examples',()=>{
 const selection={interests:['プログラミング・AI'],approach:['プログラムや道具を作る'],value:['専門的な技術を身につけたい']};
 assert.equal(findPaths(selection)[0].path.id,'technology');
 const both=findPaths({...selection,interests:['プログラミング・AI','医療・健康']});
 assert.ok(both.some(r=>r.path.id==='technology'));assert.ok(both.some(r=>r.path.id==='medical'));
 const undecided=findPaths({interests:['まだ決まっていない'],approach:['まだ分からない'],value:['今は特にない']});
 assert.equal(undecided.length,6);assert.ok(undecided.every(r=>r.score===0));
});
test('sample schools link to existing cases and provide different example activities',()=>{
 assert.equal(schools.length,3);
 for(const school of schools){assert.ok(school.activities.length);assert.ok(school.caseIds.every(id=>cases.some(c=>c.id===id)));}
 assert.equal(new Set(schools.map(s=>s.activities[0][0])).size,3);
 const linked=schools.flatMap(s=>s.caseIds);
 assert.equal(linked.length,cases.length);assert.equal(new Set(linked).size,cases.length);
});
