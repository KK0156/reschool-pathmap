import {samplePrompts} from '../retree-mindmap/src/sample-tree.js';
import {mountTree} from '../retree-mindmap/src/app.js?v=phase4-01';
import {studentTreeFeatureView} from '../retree-mindmap/src/feature-view.js?v=phase3-01';
import {escapeHtml as esc} from '../retree-mindmap/src/tree-renderer.js';
import {researchStages,researchEvidenceLabels,interviewFollowUp,assumptions} from './research-data.js';
import {studentSamples,studentCases,studentCaseCategories,legacySampleAudit} from './student-data.js';
import {researchChapters,reportSummary,schoolResearchDirections} from './research-report.js';
import {discoveryTopics} from './route-model.js';
import {routeDemos} from './route-demos.js';
import {mountRouteDiscovery} from './route-discovery.js';

const root = document.querySelector('#root');
const nav = [
  ['/', 'ホーム', 'はじめに'],
  ['/finder', '道を探す', 'RE:Path Finder'],
  ['/cases', '事例を見る', '架空の高校生の相談例'],
  ['/research', '研究について', 'RE:School Research'],
  ['/archive', '開発の歴史', '以前の試作品と記録']
];
const openChapters = new Set();
const developerSampleIndices = new Set(legacySampleAudit.filter(item => item.placement === 'developer-archive').map(item => item.index));
let treeElement = null;
let finderElement = null;
let finderAPI = null;
let caseFilter = 'すべて';
let developerTree = false;
const field = (title, value) => '<div><dt>' + esc(title) + '</dt><dd>' + esc(value) + '</dd></div>';
const list = items => '<ul>' + items.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>';
const link = (path, label, className = 'desk-link') => '<a class="' + className + '" href="#' + esc(path) + '">' + esc(label) + '</a>';
const head = (label, title, text) => '<header class="desk-page-head"><span class="desk-kicker">' + esc(label) + '</span><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></header>';

function home() {
  const explanations = {subjects:'文系・理系に分ける前に、学ぶ内容や文理をまたぐ道を見てみる。',university:'学部の名前から、授業・進み方・必要な条件へ進んでみる。',undecided:'仕事が決まっていないところから、小さく試せることを探す。',activities:'学校にない活動を、時間・費用・相談先から考えてみる。'};
  return '<section class="student-home-intro finder-home-intro paper-card"><p class="desk-kicker">進路と、学校内外の学びを探す研究プロトタイプ</p>' +
    '<h1>まだ知らない道を、<br>一緒に探そう。</h1><p class="home-introduction">気になっていることを少し話して、いくつかの道を見てみる。学ぶことや必要な条件を比べながら、次に確かめたいことを探せます。</p>' +
    '<div class="finder-home-actions">' + link('/finder', 'AIと道を探す →', 'desk-button home-finder-start') + link('/finder?demo=subjects', '入力せず、探索デモを見る →') + '</div>' +
    '<p class="desk-small">3つの画面で簡単に相談できます。成績や詳しいプロフィールは不要です。AIが未接続でも、架空の探索デモを使えます。</p></section>' +
    '<section class="home-samples" aria-labelledby="home-samples-title"><div class="home-section-title"><h2 id="home-samples-title">何について考えたい？</h2><p>まだ決まっていなくても、ここから始められます。</p></div><div class="home-topic-grid finder-topic-grid">' +
    discoveryTopics.map((topic, index) => '<a class="home-topic home-discovery-topic" data-home-topic="' + esc(topic.id) + '" href="#/finder?topic=' + esc(topic.id) + '"><span class="topic-number">' + String(index + 1).padStart(2, '0') + '</span><h3>' + esc(topic.label) + '</h3><span class="topic-open">このテーマで相談する →</span></a>').join('') + '</div></section>' +
    '<section class="home-route-demos" aria-labelledby="home-demo-title"><div class="home-section-title"><h2 id="home-demo-title">AIなしで、道の広がりを試す</h2><p>用意された架空の相談です。あなたの入力を分析した結果ではありません。</p></div><div class="home-demo-grid">' +
    routeDemos.map(demo => '<a class="paper-card home-route-demo" data-home-demo="' + esc(demo.id) + '" href="#/finder?demo=' + esc(demo.id) + '"><span class="desk-kicker">架空の探索デモ</span><h3>' + esc(demo.title) + '</h3><p>' + esc(explanations[demo.id] || demo.summary) + '</p><span class="topic-open">いくつかの道を見てみる →</span></a>').join('') + '</div></section>' +
    '<section class="home-tree-option paper-card"><div><p class="desk-kicker">考えを図にまとめたいときに</p><h2>RE:Treeで整理する</h2><p>見つけた道や、すでに考えていることを図にできます。探索のあとに選んだ候補を引き継ぐことも、白紙から書くこともできます。</p></div><div>' + link('/tree', 'RE:Treeを開く（任意） →') + '</div></section>' +
    '<section class="student-research-boundary paper-card"><div><h2>このサイトを作っている理由</h2><p>RE:Path Finderは、RE:Schoolの研究から生まれた試作品です。日米の教育機会の比較、過去の試作、まだ確かめていないことは、研究報告に分けて掲載しています。</p></div><div class="desk-actions">' + link('/research', 'RE:Schoolの研究報告を読む →') + link('/archive', '以前の試作品を見る →') + '</div></section>';
}

function finder() {
  return head('RE:Path Finder', '自分にまだある道を探す', '気になった道を開くと、学ぶことや必要な条件を詳しく見られます。いくつか比べながら考えてみてください。') + '<div id="route-discovery-host"></div>';
}

function tree(params) {
  const legacy = params.has('legacy') || developerTree;
  return head('RE:Tree / 考えを整理する道具', 'RE:Treeで整理する', '見つけた候補や、自分の考えを図にまとめられます。道を発見する相談はRE:Path Finderで始められます。') +
    '<p class="tree-finder-return">' + link('/finder', 'RE:Path Finderで道を探す →') + '</p>' +
    (legacy ? '<p class="route-notice developer-notice" role="status">開発者の研究デモを表示しています。一般向けの進路例は「例から試す」から開けます。これらのデモは研究成果や調査結果を示すものではありません。</p>' : '') +
    '<nav class="start-methods" aria-label="相談の始め方"><button type="button" data-start="sample">例から試す</button><button type="button" data-start="memo">自分の相談を書く</button><button type="button" data-start="blank">白紙から作る</button></nav><div id="desk-tree-host"></div>';
}

function cases(params) {
  const filter = params.get('category');
  if (filter && ['すべて', ...studentCaseCategories].includes(filter)) caseFilter = filter;
  const visible = studentCases.filter(item => caseFilter === 'すべて' || item.category === caseFilter);
  return head('Case Library / 一般向けの架空事例', '事例を見る', '同じような迷いを持つ高校生なら、何を比べ、何を確認できるか。事例から例のツリーを開き、自分の言葉に書き換えられます。') +
    '<p class="case-fiction-note">すべて架空の相談例です。実在の生徒の記録や、進路・適性・合格可能性を判断した結果ではありません。</p>' +
    (params.has('choice') ? '<p class="route-notice">以前の研究テーマ別ケースは、開発用デモとしてアーカイブに分けました。ここでは高校生の進路や学習機会に関する事例を掲載しています。' + link('/archive?section=developer-demos', '以前のデモを見る') + '</p>' : '') +
    '<div class="case-controls"><label for="desk-case-category">相談の内容で絞る</label><select id="desk-case-category">' +
    ['すべて', ...studentCaseCategories].map(category => '<option' + (category === caseFilter ? ' selected' : '') + '>' + esc(category) + '</option>').join('') +
    '</select><p role="status">' + visible.length + '件の架空の事例</p></div>' +
    '<div class="student-case-grid case-grid">' + visible.map(item => '<article class="paper-card case-sheet student-case" data-case-id="' + esc(item.id) + '">' +
      '<span class="desk-kicker">' + esc(item.category) + ' / 架空の相談例</span><h2>' + esc(item.title) + '</h2><p class="case-profile">' + esc(item.profile) + '</p>' +
      '<section><h3>最初の悩み</h3><p>' + esc(item.concern) + '</p></section>' +
      '<section><h3>考えられる選択肢</h3>' + list(item.options) + '</section>' +
      '<section><h3>何を比較・確認するか</h3>' + list(item.compared) + '</section>' +
      '<section><h3>まだ分からないこと</h3>' + list(item.unknown) + '</section>' +
      '<section><h3>次にできる行動</h3>' + list(item.actions) + '</section>' +
      '<div class="case-tree-action">' + link('/tree?sample=' + encodeURIComponent(item.sampleId), 'このケースをツリーで試す →', 'desk-button') + '</div></article>').join('') + '</div>';
}

function sources(items) {
  return '<ul class="report-sources">' + items.map(source => {
    const safe = typeof source.href === 'string' && /^(\/(?!\/)|https:\/\/)/.test(source.href);
    return '<li><span class="source-availability">' + esc(source.status) + '</span>' +
      (safe ? '<a href="' + esc(source.href) + '">' + esc(source.label) + '</a>' : '<span>' + esc(source.label) + '</span>') + '</li>';
  }).join('') + '</ul>';
}

function tableView(table) {
  if (!table) return '';
  return '<div class="report-table-wrap" tabindex="0" role="region" aria-label="' + esc(table.caption) + '"><table><caption>' + esc(table.caption) +
    '</caption><thead><tr>' + table.headers.map(label => '<th scope="col">' + esc(label) + '</th>').join('') + '</tr></thead><tbody>' +
    table.rows.map(row => '<tr>' + row.map((cell, index) => index === 0 ? '<th scope="row">' + esc(cell) + '</th>' : '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}

function chapterView(chapter, index, params) {
  const open = openChapters.has(chapter.id) || params.get('chapter') === chapter.id;
  return '<details class="research-chapter" data-research-chapter="' + esc(chapter.id) + '" id="chapter-' + esc(chapter.id) + '"' + (open ? ' open' : '') + '>' +
    '<summary><span class="chapter-number">' + String(index + 1).padStart(2, '0') + '</span><span><h2>' + esc(chapter.title) + '</h2><span class="chapter-summary">' + esc(chapter.summary) + '</span></span><span class="chapter-expand">詳しく読む</span></summary>' +
    '<div class="chapter-body"><p class="status-tag">' + esc(chapter.status) + '</p><dl class="chapter-record">' +
    [['最初の問い', 'question'], ['そのとき考えた仮説', 'hypothesis'], ['実際に行った調査・今回確認した範囲', 'investigation'], ['確認できた内容', 'findings'], ['反証・別の説明', 'counterpoint'], ['問いがどう変わったか', 'evolution']].map(([label, key]) => field(label, chapter[key])).join('') +
    '</dl>' + tableView(chapter.table) + '<h3>使用した資料・出典の所在</h3>' + sources(chapter.sources) +
    '<div class="chapter-unknown"><h3>分からないこと</h3><p>' + esc(chapter.unknown) + '</p></div></div></details>';
}

const evidenceStatus = {present: '所在を確認', not_published: '原資料未掲載', not_verified: '内容は未確認'};
function timelineView() {
  return '<section class="research-timeline" id="question-timeline"><h2>問いの変化を7段階でたどる</h2><p>研究経緯の順序です。未確認の制作日や因果関係を補った年表ではありません。</p><ol>' +
    researchStages.map((stage, index) => '<li><span class="timeline-number">' + String(index + 1).padStart(2, '0') + '</span><article class="paper-card" id="stage-' + esc(stage.id) + '">' +
      '<span class="status-tag">' + esc(stage.status) + '</span><h3>' + esc(stage.title) + '</h3><p><b>' + esc(stage.question) + '</b></p><p>' + esc(stage.note) + '</p>' +
      '<details class="evidence-detail"><summary>事実・仮説・反論・検証と資料の区別を読む</summary><dl>' +
      Object.entries(researchEvidenceLabels).map(([key, label]) => field(label, stage.evidence[key])).join('') + '</dl><ul class="stage-sources">' +
      stage.evidence.sources.map(source => '<li>' + esc(evidenceStatus[source.availability]) + '：' + esc(source.label) + '</li>').join('') + '</ul></details></article></li>').join('') + '</ol></section>';
}

function research(params) {
  const wanted = params.get('chapter');
  return head('RE:School Research / 生徒向け機能の背景', '研究について', reportSummary.intro) +
    '<section class="report-opening paper-card"><h2>' + esc(reportSummary.title) + '</h2><p>進路を考える機能とは別に、何を調べ、何を作り、何がまだ分からないかを記録しています。</p>' +
    '<div class="report-evidence-guide">' + reportSummary.evidenceGuide.map(item => '<div><b>' + esc(item.label) + '</b><p>' + esc(item.detail) + '</p></div>').join('') + '</div>' +
    '<details class="report-limits"><summary>資料の確認範囲と、結論を保留していること</summary>' + list(reportSummary.limitations) + '</details></section>' +
    '<nav class="report-toc paper-card" aria-label="研究報告の目次"><h2>研究報告の目次</h2><ol>' + researchChapters.map(chapter => '<li>' + link('/research?chapter=' + chapter.id, chapter.title) + '</li>').join('') + '</ol></nav>' +
    (wanted && !researchChapters.some(chapter => chapter.id === wanted) ? '<p class="route-notice" role="status">指定された章は見つかりませんでした。目次から選び直せます。</p>' : '') +
    '<section class="research-chapters" aria-label="研究報告の13章">' + researchChapters.map((chapter, index) => chapterView(chapter, index, params)).join('') + '</section>' +
    '<details class="report-history"><summary>研究の流れを、7段階の年表で読む</summary>' + timelineView() + '</details>' +
    '<section id="directions" class="school-research-directions"><h2>RE:Schoolで、これから検討すること</h2><p>ここは開発上の研究課題です。生徒本人の進路を比較・評価する一覧ではありません。</p><div class="research-directions-grid">' +
    schoolResearchDirections.map(item => '<article class="paper-card"><h3>' + esc(item.title) + '</h3><dl>' + field('問い', item.question) + field('検討の方法', item.approach) + field('確認できていないこと', item.limits) + field('次に確かめること', item.next) + '</dl></article>').join('') + '</div></section>' +
    '<details class="report-history assumptions"><summary>見直してきた6つの仮説を読む</summary><div class="assumption-grid">' +
    assumptions.map(([before, change, next]) => '<article class="paper-card"><h3>' + esc(before) + '</h3><dl>' + field('見直したこと', change) + field('次に確かめること', next) + '</dl></article>').join('') + '</div></details>' +
    '<aside class="research-honesty paper-card"><h2>まだ、問題の最終特定はしていません</h2><p>' + esc(interviewFollowUp.problemStatus) + '</p><p>実際の生徒・先生への効果は未検証です。操作できる試作品があることと、役立つことが実証されたことは別です。紙のメモや既存の面談資料、AIを使わない方法とも比べる必要があります。</p>' +
    link('/tree', '進路を考える画面へ戻る →') + '</aside>';
}

const archives = [
  {
    id: 'school-v1', title: 'RE:School v1', when: 'Gitの保存履歴：2026年10月14日。画面の版記は2026.08ですが、制作開始日の資料は未確認です。',
    purpose: '学校と卒業生の新しい関係を考え、学校外の人・経験・知識を生徒の学習機会にする仕組みを試作しました。',
    features: ['卒業生が学校へ関われることを読む画面', '先生・学校向けの案内', '関わり方を選ぶ試作フロー'],
    learned: 'つなぐ画面を作っても、安全、責任、同意、選定、学校承認、先生の負担は残ります。実際の接続や教育効果を検証した記録とは区別します。',
    next: '直接つなぐ前に、生徒本人がどんな選択肢を知り、何を比べたいかを整理する方向へ進みました。',
    href: '/original.html', asset: 'reschool-v1', availability: '保存版あり。当時のデザインを維持し、入力欄は表示専用です。'
  },
  {
    id: 'finder-v2', title: 'RE:Path Finder Prototype 2', when: '構想の順序を記録しています。制作日・本体ファイルは今回確認できません。',
    purpose: '興味や活動、学校の環境、先輩のケースから、まだ知らなかった進路を見える形にする構想です。',
    features: ['AI相談と先輩ケースを使う構想', '興味・活動・学習環境を手がかりにする設計'],
    learned: '「誰につなぐか」の前に、本人が「どんな道があるか」を考えられることが重要ではないか、という問いが残りました。効果の実証は未確認です。',
    next: '試作品3号では進路の下調べを、RE:Treeでは選択肢・証拠・反論・次の行動の編集を試しています。',
    href: null, availability: 'Prototype 2本体は未掲載です。下の試作品3号とは別の版です。'
  },
  {
    id: 'path-map-3', title: 'Path Map 試作品3号', when: '保存版を確認できる履歴：2026年10月14日以降。相談・編集機能の追加履歴も残っています。',
    purpose: '興味から学ぶ内容・仕事・進み方を調べ、先生に聞きたいことを用意するための試作です。',
    features: ['選択式の進路相談', '16分野の進路一覧と比較', '架空の卒業生事例・学校ページ', '相談メモとツリー機能'],
    learned: '進路情報を並べるだけでなく、本人が自分の問いに合わせて比較・編集できることを検討しています。掲載情報は架空のサンプルです。',
    next: '現在のRE:Path Finderでは、一般の高校生の相談例から、編集と次の行動までを続けて試せる構成へ進めています。',
    href: '/reschool.html', asset: 'path-map-3', availability: '保存版あり。Prototype 2とは別の試作品で、当時の画面を開けます。'
  },
  {
    id: 'evidence-pack', title: 'Evidence / Research Pack', when: '資料群としての言及があります。統合版の公開日・ファイル本体は未確認です。',
    purpose: '調査、反証、既存サービス比較、アンケート、問いの変化をまとめるための資料群です。',
    features: ['調査や反証を照合するための資料構想', 'アンケート・新聞資料・既存サービス比較の記録'],
    learned: '資料の所在と内容を確認し、本人の記録・仮説・未確認事項を分ける必要があります。MASTERや原資料の本文は今回参照できていません。',
    next: '現在の研究報告では13章に分け、資料を確認できる範囲と、まだ分からないことを記録しています。',
    href: null, availability: '原資料・Evidence Pack本体は未掲載です。研究報告は原資料の代わりにはなりません。'
  }
];

function archivePreview(item) {
  return '<a class="archive-original-preview" href="' + item.href + '"><img src="/src/archive-previews/' + item.asset + '.jpg" width="1280" height="900" loading="lazy" alt="' +
    esc(item.title) + 'の実画面。押すと当時のデザインで保存版を開きます。"><span class="archive-preview-label"><b>' + esc(item.title) + '</b><span>当時の画面を開く ↗</span></span></a>';
}

function archive() {
  return head('Archive / 過去の画面と記録', '開発の歴史', '過去の試作品は、問いを考え直してきた記録です。何を作り、何が残ったのかを読んでから、当時のデザインの保存版を開けます。') +
    '<div class="archive-stack">' + archives.map((item, index) => '<article class="paper-card archive-item" data-archive-id="' + item.id + '">' +
    '<div class="archive-tab">File ' + String(index + 1).padStart(2, '0') + '</div><h2>' + esc(item.title) + '</h2><p class="archive-date">' + esc(item.when) + '</p>' +
    '<p class="archive-availability"><b>' + (item.href ? '開ける保存版があります' : '本体は未掲載です') + '</b><br>' + esc(item.availability) + '</p>' +
    '<dl class="archive-overview">' + field('当時、何を作ろうとしたか', item.purpose) +
    '<div><dt>主な機能・構想</dt><dd>' + list(item.features) + '</dd></div>' +
    field('何が分かり、何が残ったか', item.learned) + field('次の試作品へのつながり', item.next) + '</dl>' +
    (item.href ? archivePreview(item) : '<button class="desk-button" disabled>' + esc(item.title) + '：保存版は未掲載</button>') + '</article>').join('') + '</div>' +
    '<details class="developer-lab paper-card" id="developer-demos"><summary>過去の開発用・研究デモを開く</summary><p>旧バージョンの開発者向けサンプルを保管しています。ROOTSはRE:Schoolとは独立したプロジェクトです。ここにあるデモは、一般向け進路例やRE:Schoolの調査成果としては扱いません。</p><div class="developer-demo-links">' +
    samplePrompts.map((sample, index) => ({sample, index})).filter(({index}) => developerSampleIndices.has(index)).map(({sample, index}) => link('/tree?legacy=' + index, sample.label + '（開発用デモ）')).join('') + '</div></details>' +
    '<aside class="archive-footer-note"><h2>保存版と、今の研究報告</h2><p>プレビューは保存版の実画面を撮影した画像です。過去のデザインと、当時の画面を動かすファイルは残しています。現在の研究報告は、過去の調査原票・原画像・インタビューの逐語録の代わりにはなりません。</p>' + link('/research', 'RE:Schoolの研究報告を読む →') + '</aside>';
}

function createTree() {
  treeElement = document.createElement('div');
  treeElement.className = 'tree-feature';
  treeElement.innerHTML = studentTreeFeatureView;
  const clipboard = document.createElement('aside');
  clipboard.className = 'clipboard today-clipboard';
  clipboard.id = 'today-summary';
  clipboard.setAttribute('aria-label', '今日の整理');
  clipboard.innerHTML = '<span class="clip" aria-hidden="true"></span><h2>今日の整理</h2><p>例や相談を図にすると、次に調べることをここでも確認できます。</p>';
  treeElement.querySelector('#map-workspace').after(clipboard);
  mountTree(treeElement, {defaultSample: 28, studentMode: true});
  return treeElement;
}

function transferDiscovery({tree, origin, nodeOrigins}) {
  const element = treeElement || createTree();
  if (!element.retreeStudy.loadDiscoveryTree(tree, {origin, nodeOrigins})) return false;
  developerTree = false;
  history.pushState(null, '', '#/tree');
  render(true);
  const workspace = element.querySelector('#map-workspace');
  workspace.focus({preventScroll: true});
  workspace.scrollIntoView({block: 'start'});
  return true;
}

function routeFinder(params) {
  if (!finderElement) {
    finderElement = document.createElement('div');
    finderAPI = mountRouteDiscovery(finderElement, {onTransfer: transferDiscovery});
  }
  document.getElementById('route-discovery-host').append(finderElement);
  const topic = params.get('topic');
  const demo = params.get('demo');
  const validTopic = discoveryTopics.some(item => item.id === topic);
  const validDemo = routeDemos.some(item => item.id === demo);
  finderAPI.open(validDemo ? {demo} : validTopic ? {topic} : {});
  if ((topic && !validTopic) || (demo && !validDemo)) {
    const notice = document.createElement('p');
    notice.className = 'route-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = '指定された相談例は見つかりませんでした。相談テーマか探索デモから選べます。';
    document.getElementById('route-discovery-host').prepend(notice);
  }
  if (topic || demo) history.replaceState(null, '', '#/finder');
}

function current() {
  // The skip link can be used before the application has finished loading.
  const raw = location.hash === '#main' ? '/' : location.hash.slice(1) || '/';
  const split = raw.indexOf('?');
  const path = split < 0 ? raw : raw.slice(0, split);
  const params = new URLSearchParams(split < 0 ? '' : raw.slice(split + 1));
  let next = path;
  let notice = '';
  if (path === '/paths') { next = '/finder'; notice = '進路を探す画面へ移動しました。以前の進路一覧は、開発の歴史にあるPath Map保存版から開けます。'; }
  if (path === '/choices') { next = '/research'; params.set('section', 'directions'); notice = '以前の研究テーマ比較は、RE:Schoolの研究報告内へ移しました。一般向けの進路比較とは区別しています。'; }
  if (path === '/dashboard') { next = '/archive'; notice = '以前の学校ページは、Path Map試作品3号の保存版に残しています。'; }
  if (next !== path) history.replaceState(null, '', '#' + next + (params.size ? '?' + params.toString() : ''));
  return {path: next, params, notice};
}

function routeTree(params) {
  const api = treeElement.retreeStudy;
  if (!api) return;
  let consumed = false;
  if (params.has('sample')) {
    const id = params.get('sample');
    if (studentSamples.some(sample => sample.id === id)) {
      if (api.loadStudentSample(id) !== false) developerTree = false;
    }
    else {
      const notice = document.createElement('p');
      notice.className = 'route-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = '指定された例は見つかりませんでした。「例から試す」から選べます。';
      document.querySelector('#desk-tree-host').before(notice);
      api.showSamples?.();
    }
    consumed = true;
  } else if (params.has('legacy')) {
    const index = Number(params.get('legacy'));
    if (Number.isInteger(index) && index >= 0 && index < samplePrompts.length && developerSampleIndices.has(index)) {
      developerTree = api.loadSeed(index) !== false;
    } else {
      developerTree = false;
      api.showSamples?.();
    }
    consumed = true;
  } else if (params.get('start') === 'memo') {
    api.focusMemo?.(); consumed = true;
  } else if (params.get('start') === 'sample') {
    api.showSamples?.(); consumed = true;
  } else if (params.get('start') === 'blank') {
    api.startBlank?.(); consumed = true;
  }
  if (consumed) history.replaceState(null, '', '#/tree');
  syncDeveloperNotice();
}

function syncDeveloperNotice() {
  if (!document.querySelector('#desk-tree-host')) return;
  const source = treeElement?.retreeStudy?.getSource?.();
  if (source) developerTree = source.source === 'sample' && !source.studentSampleId && developerSampleIndices.has(source.sampleIndex);
  const currentNotice = document.querySelector('.developer-notice');
  if (!developerTree) { currentNotice?.remove(); return; }
  if (!currentNotice) {
    const notice = document.createElement('p');
    notice.className = 'route-notice developer-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = '開発者の研究デモを表示しています。一般向けの進路例は「例から試す」から開けます。これらのデモは研究成果や調査結果を示すものではありません。';
    document.querySelector('.start-methods').before(notice);
  }
}

function render(focus = false) {
  const {path, params, notice} = current();
  if (finderElement?.isConnected) finderAPI.pause();
  const content = path === '/' ? home() : path === '/finder' ? finder() : path === '/tree' ? tree(params) : path === '/cases' ? cases(params) :
    path === '/research' ? research(params) : path === '/archive' ? archive() :
    head('ページの確認', 'このページは見つかりません。', 'ホームから相談例、事例、研究報告へ進めます。');
  root.innerHTML = '<div class="research-desk"><header class="desk-masthead"><a class="desk-brand" href="#/">RE:Path Finder<span>まだ知らない道を、一緒に探す</span></a><p>高校生向けの試作品<span>Research Prototype</span></p></header>' +
    '<nav class="desk-nav" aria-label="メインメニュー">' + nav.map(([url, label, note]) => '<a data-nav-kind="' + (url === '/' || url === '/finder' || url === '/cases' ? 'work' : 'reference') + '" href="#' + url + '"' +
      (url === path ? ' aria-current="page"' : '') + '>' + label + '<small>' + note + '</small></a>').join('') + '</nav>' +
    '<div class="desk-secondary-nav"><p>考えを図にまとめたいときは</p><a class="tree-entry-link" href="#/tree"' + (path === '/tree' ? ' aria-current="page"' : '') + '>RE:Treeで整理する（任意） →</a></div>' +
    '<main id="main" class="desk-main' + (path === '/tree' || path === '/finder' ? ' working-page' : '') + '" tabindex="-1">' +
    (notice ? '<p class="route-notice" role="status">' + esc(notice) + '</p>' : '') + content + '</main>' +
    '<footer class="desk-footer"><div><b>RE:Path Finder</b><p>選択肢を知り、比べて、次の行動へ。</p></div><div><p>研究用の試作品です。進路や適性、合格可能性を判断するものではありません。大切な判断は先生・保護者など信頼できる大人と相談してください。</p>' +
    '<p class="desk-small">自動保存はしません。必要な図はJSONファイルとして端末へ保存し、後から復元できます。名前・学校名・連絡先は不要です。AIへ送る場合は内容を確認して同意します。外部の大人への直接連絡・マッチングは行いません。</p>' +
    link('/research', '背景にあるRE:School研究を読む →') + '</div></footer></div>';
  if (path === '/tree') document.querySelector('#desk-tree-host').append(treeElement || createTree());
  document.title = (path === '/tree' ? 'RE:Treeで整理する' : nav.find(([url]) => url === path)?.[1] || 'ページの確認') + ' | RE:Path Finder';
  if (focus) {
    document.querySelector('#main').focus({preventScroll: true});
    window.scrollTo(0, 0);
  }
  if (path === '/tree') routeTree(params);
  if (path === '/finder') routeFinder(params);
  if (path === '/research' && params.has('chapter')) {
    const chapter = researchChapters.find(item => item.id === params.get('chapter'));
    if (chapter) {
      openChapters.add(chapter.id);
      document.getElementById('chapter-' + chapter.id)?.scrollIntoView({block: 'start'});
    }
  }
  if (params.get('section') === 'directions') document.getElementById('directions')?.scrollIntoView({block: 'start'});
  if (params.get('section') === 'developer-demos') {
    const demos = document.getElementById('developer-demos');
    if (demos) { demos.open = true; demos.scrollIntoView({block: 'start'}); }
  }
}

root.addEventListener('click', event => {
  const button = event.target.closest('button[data-start]');
  if (!button || !treeElement?.retreeStudy) return;
  const api = treeElement.retreeStudy;
  if (button.dataset.start === 'memo') api.focusMemo?.();
  else if (button.dataset.start === 'blank') { if (api.startBlank?.() !== false) developerTree = false; }
  else api.showSamples?.();
  syncDeveloperNotice();
});
root.addEventListener('tree-content-change', syncDeveloperNotice);
root.addEventListener('change', event => {
  if (event.target.id !== 'desk-case-category') return;
  caseFilter = event.target.value;
  history.replaceState(null, '', '#/cases' + (caseFilter === 'すべて' ? '' : '?category=' + encodeURIComponent(caseFilter)));
  render();
  document.querySelector('#desk-case-category').focus({preventScroll: true});
});
root.addEventListener('toggle', event => {
  const id = event.target.dataset?.researchChapter;
  if (!id) return;
  if (event.target.open) openChapters.add(id); else openChapters.delete(id);
}, true);
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  document.querySelector('#main').focus();
});
window.addEventListener('hashchange', () => render(true));
render();
