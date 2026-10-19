import test from 'node:test';
import assert from 'node:assert/strict';
import {choiceCards,researchCases,caseCategories,researchStages,assumptions,archiveItems,resources,conversionConditions} from '../src/research-data.js';
import {samplePrompts} from '../retree-mindmap/src/sample-tree.js';
import {validateTree} from '../retree-mindmap/src/tree-renderer.js';
test('cases cover every category, disclose limitations and link to valid choice cards',()=>{
 assert.equal(choiceCards.length,7);assert.equal(researchCases.length,12);const ids=new Set(choiceCards.map(c=>c.id));
 for(const category of caseCategories)assert.ok(researchCases.some(c=>c.category===category));
 for(const c of researchCases){assert.ok(c.evidence&&c.limitation&&c.question);c.choices.forEach(id=>assert.ok(ids.has(id)));}
 choiceCards.forEach(c=>assert.ok(c.evidence&&c.risk&&c.person&&c.open));
});
test('question evolution preserves the transition, resources, weakened hypotheses and honest archive availability',()=>{
 assert.equal(researchStages.length,7);assert.equal(researchStages[0].id,'education-comparison');assert.equal(researchStages.at(-1).id,'interview-followup');assert.equal(assumptions.length,6);assert.equal(resources.length,9);assert.equal(conversionConditions.length,8);
 assert.equal(archiveItems[0].href,'/original.html');assert.equal(archiveItems[1].href,null);assert.equal(archiveItems[1].related,'/reschool.html');assert.equal(archiveItems[2].href,null);
});
test('new research sample trees include explicit counterarguments and research notes without closing choices',()=>{
 for(const sample of samplePrompts.slice(24)){assert.ok(validateTree(sample.tree));assert.ok(sample.tree.nodes.some(n=>n.type==='counterargument'));assert.ok(sample.tree.nodes.some(n=>n.type==='research_note'));assert.ok(sample.tree.nodes.filter(n=>n.type==='project').length>=2);}
});

test('research origin and interview limits stay distinct from implementation evidence',()=>{
 assert.deepEqual(researchStages.map(s=>s.id),['education-comparison','resource-model','early-school','constraints','wider-comparison','path-tree','interview-followup']);
 researchStages.forEach(s=>assert.ok(s.status&&s.source));assert.ok(researchStages.at(-1).note.includes('確認まで保留'));assert.ok(researchStages.at(-1).status.includes('原記録未確認'));
});
