import {routeAtlas} from './route-atlas-data.js';

// These are places to investigate, not evidence that a route is available to a
// particular person. They intentionally do not enter Atlas/Finder source IDs.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const referenceCategories = freeze([
  {id:'all', label:'すべて'},
  {id:'learning', label:'学問・授業'},
  {id:'work', label:'仕事・働き方'},
  {id:'conditions', label:'制度・費用'},
  {id:'experience', label:'学校外・海外'}
]);

const sourceGuidance = {
  'mext-pathways': {categoryIds:['learning','conditions'], purpose:'学校や課程の種類を、制度の全体図で見比べる。', checkItems:['学校の種類と、修了後に得られるものは何か。','個別の入学条件は、どの学校の公式資料で確かめるか。']},
  'mext-senshu': {categoryIds:['learning','conditions'], purpose:'専門学校を含む専修学校の仕組みを知る。', checkItems:['授業・実習・資格課程の違いを何で確認するか。','学校ごとの入学条件・費用をどこで調べるか。']},
  'mhlw-school-work': {categoryIds:['work','conditions'], purpose:'高校から働き始めるときの、学校を通した就職活動を調べる。', checkItems:['学校や地域では、どんな順序で相談・応募するのか。','自分の地域・年度の案内はどこにあるか。']},
  'mhlw-training': {categoryIds:['learning','work','conditions'], purpose:'仕事の技能を学ぶ公的職業訓練について知る。', checkItems:['訓練の対象者や相談窓口はどこか。','受講条件・教材費・支援をどの公式窓口で確かめるか。']},
  'jeed-polytech': {categoryIds:['learning','work','conditions'], purpose:'職業能力開発の教育や実習を、学校の種類と区別して読む。', checkItems:['どんな実習や技能を学ぶのか。','入校・修了・資格・費用の条件は何か。']},
  'jasso-overseas': {categoryIds:['experience','conditions'], purpose:'留学の目的や学ぶ場所の違いを知る。', checkItems:['語学・専門分野・活動のうち、何を確かめたいか。','入学・滞在・費用・支援の条件をどこで確認するか。']},
  'mext-kosotsu': {categoryIds:['learning','conditions'], purpose:'高卒認定と高校卒業の違い、受験や進学の制度を調べる。', checkItems:['認定で確認できることと、高校卒業との違いは何か。','自分の受験・出願先の条件はどこに書かれているか。']},
  'mext-recurrent': {categoryIds:['learning','work'], purpose:'社会に出た後に学ぶ考え方や、講座を探す入口を知る。', checkItems:['仕事・生活と、どのように学習を組み合わせられるか。','講座の対象・時間・費用・支援を何で確かめるか。']},
  'ouj-flexible': {categoryIds:['learning','conditions'], purpose:'通信で学ぶことや、科目から学ぶ方法の一例を見る。', checkItems:['授業・試験・通学の方法はどうなっているか。','入学資格や費用は、希望する学び方ごとにどう違うか。']},
  'mext-transfer': {categoryIds:['learning','conditions'], purpose:'後から別の学校へ移るときの、編入学の制度を確認する。', checkItems:['制度の対象となる課程と、個別校の募集条件はどう違うか。','単位・選考・費用は、移る先で何を確かめる必要があるか。']},
  'mhlw-jobtag': {categoryIds:['work','learning'], purpose:'職業名だけでなく、実際の作業や働く環境から仕事を知る。', checkItems:['一日の作業や使う道具を具体的に想像できるか。','関連する仕事には、どのような違いがあるか。']},
  'mext-tandai': {categoryIds:['learning','conditions'], purpose:'短期大学での学びや、その先の進み方を制度から調べる。', checkItems:['何を学び、どのように修了する学校なのか。','資格課程・編入・就職の個別条件は何で確認するか。']}
};

const officialReferences = routeAtlas.sources.map(source => ({
  id:'ref-'+source.id,
  title:source.title,
  publisher:source.authority,
  url:source.url,
  kind:source.id==='ouj-flexible'?'learning_provider':'official',
  ...sourceGuidance[source.id],
  limitations:source.limitations,
  reviewedOn:source.reviewedOn,
  reviewScope:source.scope
}));

const additionalReferences = [
  {
    id:'ref-miraibook', title:'みらいぶっく 関心のある言葉・話題から', publisher:'河合塾',
    url:'https://miraibook.jp/keyword', kind:'editorial', categoryIds:['learning','experience'],
    purpose:'身近な話題や疑問から、関係する学問を広げる。',
    checkItems:['一つの話題が、どんな学問とつながるか。','その学問では、どんな問いや作業を扱うのか。'],
    limitations:'大学・学問を中心とする編集情報です。本人の適性、入学条件、最新の募集を確認したものではありません。',
    reviewedOn:'2026-10-29', reviewScope:'公開ページの関心別入口と、話題から分野へ進む案内を確認。'
  },
  {
    id:'ref-manabijon', title:'マナビジョン 学問を調べる', publisher:'ベネッセ',
    url:'https://manabi.benesse.ne.jp/shokugaku/learning/', kind:'editorial', categoryIds:['learning'],
    purpose:'高校の教科や学問の名前から、授業の内容や近い分野を調べる。',
    checkItems:['実際に学ぶ内容や、時間割の例はどのようなものか。','近い分野とは、問いや調べ方にどのような違いがあるか。'],
    limitations:'編集された学問・進学情報です。個別大学の最新の授業・出願条件は、大学の公式資料で別に確認してください。',
    reviewedOn:'2026-10-29', reviewScope:'好きな教科から学問へ進む公開ページと、経済学の内容・時間割例・関連分野を確認。'
  },
  {
    id:'ref-study-sapuri', title:'スタディサプリ進路 学問を調べる', publisher:'リクルート',
    url:'https://shingakunet.com/gakumon/', kind:'editorial', categoryIds:['learning'],
    purpose:'学問の説明、授業や実習の例から、何をする学びなのかを知る。',
    checkItems:['講義だけでなく、調査・実習・制作などで何をするのか。','気になった課題を、小さく読む・試す方法はあるか。'],
    limitations:'学校検索・資料請求を含む商用の編集情報です。掲載順を進路の順位にせず、募集条件や費用は各学校の公式資料で確認してください。',
    reviewedOn:'2026-10-29', reviewScope:'公開されている学問の入口と、経済学の説明・学び方・関連情報を確認。'
  },
  {
    id:'ref-jasso-scholarships', title:'JASSO 奨学金', publisher:'日本学生支援機構（JASSO）',
    url:'https://www.jasso.go.jp/shogakukin/', kind:'official', categoryIds:['conditions'],
    purpose:'給付・貸与などの制度を区別し、進学費用について確かめる。',
    checkItems:['返還の有無や、制度ごとの申込み・利用条件はどう違うか。','学校・自治体など、ほかの支援をどこで確認するか。'],
    limitations:'奨学金の制度案内です。本人の対象可否、支給額、募集時期、進学先での取扱いは個別に確認が必要です。',
    reviewedOn:'2026-10-29', reviewScope:'公開されている制度の種類・申込み・返還と、ほかの公的支援への案内を確認。'
  },
  {
    id:'ref-mofa-safety', title:'外務省 海外安全ホームページ', publisher:'外務省',
    url:'https://www.anzen.mofa.go.jp/', kind:'official', categoryIds:['experience','conditions'],
    purpose:'海外で学ぶ・活動する前に、地域ごとの安全情報の確認先を知る。',
    checkItems:['行き先の危険情報・感染症情報と、情報の日付は何か。','学校・保護者と、緊急時の連絡や滞在の条件を何で確かめるか。'],
    limitations:'確認先の案内です。この試作品が渡航先の最新の安全情報を取得したり、渡航・参加してよいと判断したりするものではありません。',
    reviewedOn:'2026-10-29', reviewScope:'国・地域別の危険情報・感染症情報と、留学等の安全確認への公開案内を確認。'
  },
  {
    id:'ref-jmooc', title:'JMOOC オンラインの学びを探す', publisher:'日本オープンオンライン教育推進協議会（JMOOC）',
    url:'https://www.jmooc.jp/', kind:'learning_provider', categoryIds:['learning','experience'],
    purpose:'オンラインの講座や授業から、学問・仕事に触れる方法を探す。',
    checkItems:['授業の内容、学習する時間、必要な準備は何か。','対象者・募集・費用・登録・受講の条件をどこで確認するか。'],
    limitations:'講座を探す入口です。現在受講できる講座、未成年の利用条件、費用、修了・資格の扱いを本サイトが確認したものではありません。',
    reviewedOn:'2026-10-29', reviewScope:'オンラインの講座や学習サービスを探す公開ページを確認。個別講座の申込みや受講は行っていません。'
  }
];

// Start the unfiltered shelf with readable entry points, then the institutional
// documents. Route-specific lists keep their own topic-based order below.
const entryPoints=['ref-mhlw-jobtag','ref-miraibook','ref-manabijon','ref-study-sapuri','ref-jasso-scholarships','ref-jmooc'];
export const referenceSites = freeze([...officialReferences,...additionalReferences].sort((a,b)=>{
  const aIndex=entryPoints.indexOf(a.id),bIndex=entryPoints.indexOf(b.id);
  return (aIndex<0?entryPoints.length:aIndex)-(bIndex<0?entryPoints.length:bIndex);
}));
const sitesById = new Map(referenceSites.map(site => [site.id,site]));
const nodesById = new Map(routeAtlas.nodes.map(node => [node.id,node]));
const parentIds = new Map();
for (const edge of routeAtlas.edges) {
  if (edge.type !== 'contains') continue;
  if (!parentIds.has(edge.to)) parentIds.set(edge.to,[]);
  parentIds.get(edge.to).push(edge.from);
}

const routeGroups = [
  {roots:['route-work'], sites:['ref-mhlw-jobtag','ref-mhlw-school-work','ref-mhlw-training'], reason:'仕事内容と、学校から働き始める手順を分けて確かめる入口です。'},
  {roots:['route-specialist'], sites:['ref-mext-senshu','ref-jeed-polytech','ref-study-sapuri','ref-jasso-scholarships'], reason:'実習や専門分野の紹介と、教育機関の制度を照らして読む入口です。'},
  {roots:['route-university'], sites:['ref-miraibook','ref-manabijon','ref-study-sapuri','ref-mext-pathways','ref-mext-tandai','ref-jasso-scholarships'], reason:'授業や学問の中身と、大学・短大の制度を別の視点から読む入口です。'},
  {roots:['route-overseas'], sites:['ref-jasso-overseas','ref-mofa-safety'], reason:'海外で何を学ぶかと、滞在や参加に必要な条件を確かめる入口です。'},
  {roots:['route-explore'], sites:['ref-miraibook','ref-mhlw-jobtag','ref-jmooc'], reason:'活動の行き先を決める前に、試してみたい問いや作業を探す入口です。'},
  {roots:['route-work-learn'], sites:['ref-ouj-flexible','ref-mext-recurrent','ref-mhlw-training','ref-jmooc'], reason:'仕事と学習を組み合わせる方法や、利用する課程の違いを読む入口です。'},
  {roots:['route-relearn'], sites:['ref-mext-recurrent','ref-ouj-flexible','ref-mhlw-training','ref-mext-transfer','ref-jmooc'], reason:'後から学ぶ方法と、移る先の制度・条件を分けて確かめる入口です。'},
  {roots:routeAtlas.lenses.find(lens => lens.id==='fields').rootIds, sites:['ref-miraibook','ref-manabijon','ref-study-sapuri','ref-mhlw-jobtag'], reason:'分野の名前から、具体的な授業・問い・関連する仕事へ広げる入口です。'},
  {roots:['learn-place'], sites:['ref-miraibook','ref-manabijon','ref-study-sapuri','ref-mext-pathways'], reason:'通って学ぶ授業や実習の中身を、複数の説明で確かめる入口です。'},
  {roots:['learn-flexible'], sites:['ref-ouj-flexible','ref-mext-recurrent','ref-mext-pathways','ref-jmooc'], reason:'時間や場所を調整する学び方と、個別課程の条件を読む入口です。'},
  {roots:['learn-work'], sites:['ref-mext-recurrent','ref-mhlw-training','ref-mhlw-jobtag','ref-jmooc'], reason:'学ぶ内容・実際の作業・生活との組み合わせを考える入口です。'},
  {roots:['experience-school','experience-outside','experience-own'], sites:['ref-miraibook','ref-mhlw-jobtag','ref-jmooc'], reason:'学校内外で確かめたい問いや仕事の作業を知る入口です。実際の参加先や参加資格を確認した案内ではありません。'}
];

const categoryIds = new Set(referenceCategories.map(category => category.id));
function requestedCategory(options) {
  if (options === undefined) return 'all';
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  if (![Object.prototype,null].includes(Object.getPrototypeOf(options))) return null;
  const descriptor = Object.getOwnPropertyDescriptor(options,'category');
  if (!descriptor) return 'all';
  if (!Object.hasOwn(descriptor,'value')) return null;
  return categoryIds.has(descriptor.value)?descriptor.value:null;
}

function ancestorsOf(id) {
  const found=new Set();
  const walk=current => {
    if (found.has(current)) return;
    found.add(current);
    for (const parent of parentIds.get(current)||[]) walk(parent);
  };
  walk(id);
  return found;
}

function routeSpecificSite(site,nodeId) {
  if (nodeId==='field-economics' && site.id==='ref-manabijon') return {...site,title:'マナビジョン 経済学',url:'https://manabi.benesse.ne.jp/shokugaku/learning/system/014/index.html'};
  if (nodeId==='field-economics' && site.id==='ref-study-sapuri') return {...site,title:'スタディサプリ進路 経済学',url:'https://shingakunet.com/gakumon/b1040/'};
  if (nodeId==='field-math' && site.id==='ref-manabijon') return {...site,title:'マナビジョン 数学が好き',url:'https://manabi.benesse.ne.jp/shokugaku/learning/kyoka/suugaku/'};
  if (nodeId==='field-design' && site.id==='ref-mhlw-jobtag') return {...site,title:'job tag Webデザイナーの仕事の一例',url:'https://shigoto.mhlw.go.jp/User/Occupation/Detail/326',purpose:'デザインに関わる仕事の一例として、Web制作の作業や働く環境を読む。',reviewedOn:'2026-10-29',reviewScope:'Webデザイナーの公開ページで、仕事の内容・入職・働く環境への案内を確認。'};
  return site;
}

/** No fetch, tracking or personal conditions are involved in this selection. */
export function getRouteReferences(atlasId,options) {
  const category=requestedCategory(options);
  if (!category || typeof atlasId!=='string' || !nodesById.has(atlasId)) return [];
  const ancestors=ancestorsOf(atlasId), matches=new Map();
  for (const group of routeGroups) {
    if (!group.roots.some(id => ancestors.has(id))) continue;
    for (const id of group.sites) if (!matches.has(id)) matches.set(id,group.reason);
  }
  for (const id of ancestors) {
    for (const sourceId of nodesById.get(id).sourceIds) {
      const referenceId='ref-'+sourceId;
      if (!matches.has(referenceId)) matches.set(referenceId,'この道の制度や一般的な内容を、掲載元の資料から確かめる入口です。');
    }
  }
  return [...matches].map(([id,reason]) => {
    const site=sitesById.get(id);
    return site?freeze({...routeSpecificSite(site,atlasId),reason}):null;
  }).filter(site => site && (category==='all'||site.categoryIds.includes(category)));
}

export function getAllReferences(options) {
  const category=requestedCategory(options);
  return category?referenceSites.filter(site => category==='all'||site.categoryIds.includes(category)):[];
}
