import {routeAtlas} from './route-atlas-data.js';
import {stringifyFinderDocument} from './finder-file.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const atlasNames=new Map(routeAtlas.nodes.map(node=>[node.id,node.title]));
const statusNames={considering:'検討中',needs_check:'条件を確認したい',unresearched:'まだ調べていない',constraint_recorded:'確認した制約（本人の記録）'};
const timingNames={undecided:'まだ決まっていない',soon:'近いうちに試したい',later:'あとからも考えたい'};
const budgetNames={undecided:'まだ分からない',concern:'費用や支援制度を確かめたい'};
const answerNames={unknown:'分からない',skipped:'この問いはスキップ',different:'どれも違う'};
const text=(value,empty='まだ書いていません。')=>'<p class="flow-save-text">'+escape(value||empty)+'</p>';
const list=values=>'<ul>'+values.map(value=>'<li>'+escape(value)+'</li>').join('')+'</ul>';
const section=(title,content)=>'<section class="flow-save-section"><h5>'+escape(title)+'</h5>'+content+'</section>';
const namedSelections=(atlas,discovery,key)=>[
  ...(atlas?.[key]||[]).map(id=>({name:atlasNames.get(id),origin:'全体マップ'})),
  ...(discovery?.[key]||[]).map(id=>({name:discovery.graph.find(entry=>entry.key===id).route.title,origin:'以前の探索'}))
];
const namesMarkup=(items,empty)=>items.length?'<ul>'+items.map(item=>'<li>'+escape(item.name)+' <span class="finder-small">（'+escape(item.origin)+'）</span></li>').join('')+'</ul>':'<p>'+escape(empty)+'</p>';
const recordMarkup=(id,record,draft=false)=>'<article class="flow-save-record"><h6>'+escape(atlasNames.get(id))+(draft?' · 書きかけ（未反映）':' · 画面に残した確認メモ')+'</h6><p>'+escape(statusNames[record.state])+'。サイトやAIが条件を確認した記録ではありません。</p>'+text(record.note,'本文は空欄です。')+'<p class="finder-small">参照URL：'+escape(record.sourceUrl||'未記入')+'<br>本人が入力した日付：'+escape(record.checkedOn||'未記入')+'</p></article>';

function explorationMarkup(workspace){
  if(!workspace)return '';
  const groupNames={'exploration-root':'今、考えていること','group-self':'ここまでの話','group-routes':'見渡せる道','group-checks':'確かめたいこと','group-actions':'次にすること','self-situation':'今の状況','self-interests':'気になること','self-values':'大切にしたいこと','self-constraints':'不安・条件','self-unknowns':'まだ分からないこと','personal-notes':'自分で記録した気づき','personal-actions':'自分が次に確かめたいこと'};
  const customNames=new Map([...workspace.notes,...workspace.overrides].map(item=>[item.id,item.label]));
  const originalName=id=>groupNames[id]||(id?.startsWith('atlas-')?atlasNames.get(id.slice(6)):null)||'回答・AIの整理に対応する枝';
  const name=id=>customNames.get(id)||originalName(id);
  const notes=workspace.notes.length?workspace.notes.map(note=>'<article class="flow-save-record"><h6>'+escape(note.label)+' · 自分で追加</h6><p class="finder-small">つながる先：'+escape(name(note.parent))+'</p>'+text(note.detail,'詳しい文章は空欄です。')+'</article>').join(''):'<p>自分で追加した枝はありません。</p>';
  const edits=workspace.overrides.length?workspace.overrides.map(item=>'<article class="flow-save-record"><h6>'+escape(item.label)+' · 自分で書き直し</h6><p class="finder-small">対応する元の枝：'+escape(originalName(item.id))+'</p>'+text(item.detail,'詳しい文章は空欄です。')+'<p class="finder-small">書き直した文章は本人の記録です。一般資料やAIの説明を確認済みに変えるものではありません。</p></article>').join(''):'<p>書き直した枝はありません。</p>';
  const emphasis={balanced:'図と文章を一緒に見る',map:'図を大きく見る',text:'文章を中心に読む'}[workspace.emphasis];
  const stepNames=['自分を知る','可能性を広げる','道を深く知る','比較して考える','次の行動を整理する'];
  return section('RE:Treeに書いたこと',
    '<p>追加した枝・書き直した文章は、質問への回答を含めない場合も保存します。</p>'+notes+edits+
    '<p class="finder-small">いまの段階：'+escape(stepNames[workspace.step-1])+'<br>表示方法：'+escape(emphasis)+'<br>選んでいる枝：'+escape(workspace.selected?name(workspace.selected):'まだ選んでいません')+'<br>開いた枝 '+workspace.expanded.length+'件・自分で置いた位置 '+workspace.positions.length+'件も含みます。</p>'+
    '<p class="finder-small">元の回答を含めない場合、その発言との対応は復元できないことがあります。欠けた回答を補って復元することはありません。</p>');
}

/** Human review of the exact validated file, without saving or sending it. */
export function renderFinderSavePreview(document){
  // Validate before reading any supplied field, then render only the serialized
  // snapshot. This also prevents accessors or a caller's later mutations from
  // changing the meaning of the preview independently of its raw JSON.
  const raw=stringifyFinderDocument(document),saved=JSON.parse(raw);
  const {atlas,discovery,guide,notes,nextActions}=saved.session;
  const kept=namedSelections(atlas,discovery,'keep'),compared=namedSelections(atlas,discovery,'compare');
  const corrections=guide?.userCorrections||[];
  const answers=guide?.conversation?.answers||[];
  const records=Object.entries(atlas?.records||{});
  const drafts=Object.entries(atlas?.recordDrafts||{}).filter(([id,value])=>{const current=atlas.records[id]||{state:'unresearched',note:'',sourceUrl:'',checkedOn:''};return ['state','note','sourceUrl','checkedOn'].some(key=>value[key]!==current[key]);});
  const hasPreferences=atlas&&(atlas.preferences.wish||atlas.preferences.subjects.length||atlas.preferences.timing!=='undecided'||atlas.preferences.budget!=='undecided');
  const hasLegacyDraft=discovery&&(discovery.draft.wish||discovery.draft.situation||discovery.draft.conditionText||discovery.draft.conditions.length||discovery.consultation||discovery.graph.some(entry=>entry.questionDraft));
  const reviewed=saved.catalogueSources.filter(source=>source.status==='reviewed').length;
  const privacy='<p class="flow-save-warning">このファイルには、下の本人メモ・希望・確認メモ・訂正が入ります。質問への回答を含めない場合も、これらの文章は残ります。誰かに渡す前に、名前・学校名・連絡先などを書いていないか確認してください。</p>';
  const preferences=hasPreferences?section('全体マップに書いた希望',text(atlas.preferences.wish,'希望の文章は空欄です。')+'<p>履修科目・気になる分野：'+escape(atlas.preferences.subjects.join('・')||'未選択')+'<br>時期：'+escape(timingNames[atlas.preferences.timing])+'<br>費用：'+escape(budgetNames[atlas.preferences.budget])+'</p>'):'';
  const recordDetails=records.length||drafts.length?'<details class="flow-save-records"><summary>確認メモと書きかけを読む（記録済み '+records.length+'件・書きかけ '+drafts.length+'件）</summary>'+records.map(([id,value])=>recordMarkup(id,value)).join('')+drafts.map(([id,value])=>recordMarkup(id,value,true)).join('')+'<p class="finder-small">書きかけは未完成のまま保存します。「確認した制約」を選びかけていても、確認済みとして反映しません。</p></details>':'<p>全体マップの確認メモに、入力済み・書きかけの文章はありません。</p>';
  const conversation='<section class="flow-save-section"><h5>質問への回答と、相談の書きかけ</h5><p>'+(guide?.conversation?'AIの案内で答えた質問と回答：'+answers.length+'件を含めます。':'AIの案内で答えた質問と回答：含めません。')+'</p>'+(answers.length?'<details><summary>含まれる質問と回答を読む</summary>'+answers.map(answer=>'<article><p>'+escape(answer.question)+'</p>'+text(answer.text,answerNames[answer.state]||'回答なし')+'</article>').join('')+'</details>':'')+'<p>以前の探索に書いた相談文・質問の下書き：'+(hasLegacyDraft?'含めます。':'含めません（入力済みの文章はありません）。')+'</p>'+(hasLegacyDraft?'<details><summary>以前の探索の相談文・下書きを読む</summary>'+text(discovery.draft.wish,'「知りたいこと」は空欄です。')+text(discovery.draft.situation,'「今の状況」は空欄です。')+text([...discovery.draft.conditions,discovery.draft.conditionText].filter(Boolean).join('\n'),'任意条件は空欄です。')+(discovery.consultation?'<h6>以前のAI提案を作るときに送った相談文</h6>'+text(discovery.consultation.wish)+text(discovery.consultation.situation)+text(discovery.consultation.conditions):'')+discovery.graph.filter(entry=>entry.questionDraft).map(entry=>'<h6>'+escape(entry.route.title)+'への質問の下書き</h6>'+text(entry.questionDraft)).join('')+'</details>':'')+'<p class="finder-small">AIの案内の、まだ回答として残していない入力欄や次の質問は、この保存形式には含まれません。</p></section>';
  const aiDetails=guide?'<details class="flow-save-ai"><summary>保存するAIの整理も確認する（提案・未確認）</summary>'+(guide.stale?'<p>以前の回答からの整理です。いまの希望に合わせて見直す必要があります。</p>':'')+text(guide.summary,'AIのまとめはまだありません。')+list(guide.statements.map(item=>item.text))+guide.routes.map(route=>'<article><h6>'+escape(atlasNames.get(route.atlasId))+'</h6>'+text(route.reason)+list(route.unknowns)+'</article>').join('')+(guide.nextActions.length?'<h6>AIが挙げた次の一歩</h6>'+list(guide.nextActions.map(item=>item.text)):'')+(guide.additionalIdeas.length?'<h6>追加で調べる案</h6>'+list(guide.additionalIdeas.map(item=>item.text)):'')+(guide.unknowns.length?'<h6>まだ分からないこと</h6>'+list(guide.unknowns):'')+'<p class="finder-small">質問への回答を省いたファイルでも、AIの整理に回答内容の一部が含まれることがあります。</p></details>':'';
  const sources='<details class="flow-save-sources"><summary>参照資料の確認範囲と日付を確認する（'+saved.catalogueSources.length+'件）</summary><p>資料ページを確認した記録 '+reviewed+'件、未確認 '+(saved.catalogueSources.length-reviewed)+'件です。確認日を保存しても、今の募集や本人の参加資格が確認された意味にはなりません。</p>'+saved.catalogueSources.map(source=>'<article><h6>'+escape(source.title)+'</h6><p>'+escape(source.authority)+' · '+(source.status==='reviewed'?'資料ページを確認した記録：'+escape(source.reviewedOn):'資料ページは未確認')+'</p><p>'+escape(source.scope)+'</p><p>'+escape(source.limitations)+'</p></article>').join('')+'</details>';
  return '<div id="finder-save-preview" class="flow-save-preview"><h4 id="finder-save-preview-title" tabindex="-1">端末に保存する内容</h4><p>サーバーには送信しません。この内容のまま、端末のファイルとして持ち帰れます。</p>'+privacy+section('残した候補',namesMarkup(kept,'まだ候補を残していません。'))+section('比べている道',namesMarkup(compared,'比較する道は、まだ選んでいません。'))+section('本人のメモ',text(notes))+section('次に確かめたいこと',text(nextActions))+section('本人が直したこと',corrections.length?list(corrections.map(item=>item.text)):'<p>訂正の記録はありません。</p>')+explorationMarkup(saved.session.exploration)+preferences+recordDetails+conversation+aiDetails+'<p class="finder-small">閲覧位置・残した候補・比較の選択も入ります。'+(discovery?.graph.length?'以前の探索の候補 '+discovery.graph.length+'件も含みます。':'')+'この保存は、進路の決定や参加資格の確認を意味しません。</p>'+sources+'<button type="button" data-finder-action="download" class="flow-primary">この内容をファイルに保存</button><details class="flow-save-raw"><summary>保存するデータをそのまま確認する（JSON）</summary><pre>'+escape(raw)+'</pre></details></div>';
}
