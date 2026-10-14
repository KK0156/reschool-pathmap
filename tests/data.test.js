import test from 'node:test';
import assert from 'node:assert/strict';
import {paths,cases,interests,approaches,values,findPaths} from '../src/data.js';
test('all sample paths have complete content and a linked fictional case',()=>{
 assert.equal(new Set(paths.map(p=>p.id)).size,6);
 for(const p of paths){assert.ok(p.learn.length>1);assert.ok(p.skills.length);assert.ok(p.step);assert.equal(cases.find(c=>c.id===p.caseId)?.path,p.id);}
});
test('every offered answer combination yields up to three relevant paths',()=>{
 for(const interest of interests)for(const approach of approaches)for(const value of values){
  const results=findPaths({interests:[interest],approach,value});
  assert.ok(results.length>0&&results.length<=3);assert.ok(results.every(r=>r.score>0));
  assert.ok(results.every((r,i)=>i===0||results[i-1].score>=r.score));
 }
});
test('matching interests are reflected and ties remain deterministic',()=>{
 const selection={interests:['技術・データ'],approach:'つくって試す',value:'新しいものを生む'};
 assert.equal(findPaths(selection)[0].path.id,'technology');
 assert.deepEqual(findPaths(selection),findPaths(selection));
 assert.deepEqual(findPaths({interests:[],approach:'',value:''}),[]);
});
