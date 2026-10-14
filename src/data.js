// All paths, cases and school figures are fictional research fixtures.
export const interests = ['人・暮らし', '自然・環境', '技術・データ', '表現・デザイン', '地域・社会', '世界・ことば'];
export const approaches = ['つくって試す', '調べて考える', '人と対話する'];
export const values = ['誰かを支える', '新しいものを生む', '社会を変える'];
export const paths = [
 {id:'care',no:'01',title:'人の暮らしを支える道',en:'CARE & WELLBEING',color:'sage',interests:['人・暮らし','地域・社会'],approaches:['人と対話する','調べて考える'],values:['誰かを支える'],intro:'困っている人の声から、暮らしを少しよくする方法を考える。',question:'安心して暮らすために、何が必要だろう？',skills:['聴く力','観察する力','倫理を考える力'],learn:['大学で心理・福祉・保健を学ぶ','専門学校で支援の技術を学ぶ','地域の活動から課題を知る'],jobs:['福祉の支援職','心理・保健の専門職','暮らしのサービス企画'],step:'学校の先生と、身近な場所の「使いにくさ」を3つ観察してみる。',note:'心理・医療などの専門職には、資格や指定課程が必要な場合があります。',caseId:'A'},
 {id:'environment',no:'02',title:'自然と未来をつなぐ道',en:'ENVIRONMENT & SCIENCE',color:'green',interests:['自然・環境','地域・社会'],approaches:['調べて考える','つくって試す'],values:['社会を変える','誰かを支える'],intro:'身近な自然の変化を調べ、続けられる暮らしをつくる。',question:'地域の自然と、人の暮らしは両立できる？',skills:['観測する力','データを読む力','長く考える力'],learn:['大学で環境・農・理工を横断する','高専で技術と実験を学ぶ','地域の自然観察から問いを育てる'],jobs:['環境調査','農業・食の技術開発','地域の環境企画'],step:'校内の気温や日陰を観察し、場所による違いを地図にしてみる。',note:'現地調査は先生の確認を受け、安全な場所で行います。',caseId:'B'},
 {id:'technology',no:'03',title:'技術で可能性を広げる道',en:'TECHNOLOGY & DATA',color:'blue',interests:['技術・データ','人・暮らし'],approaches:['つくって試す','調べて考える'],values:['新しいものを生む','誰かを支える'],intro:'使う人を思い浮かべながら、仕組みや道具をつくって試す。',question:'その技術は、誰のどんな困りごとを解く？',skills:['論理的に考える力','試作する力','協働する力'],learn:['大学で情報・理工を学ぶ','高専・専門学校で制作を重ねる','公開教材で小さな作品をつくる'],jobs:['ソフトウェア開発','データ分析','ものづくり・研究開発'],step:'個人情報を使わず、学校生活を便利にする道具を紙で試作する。',note:'技術を選ぶ前に、使う人への影響や安全性も考えます。',caseId:'C'},
 {id:'design',no:'04',title:'表現で伝え、変えていく道',en:'DESIGN & EXPRESSION',color:'gold',interests:['表現・デザイン','人・暮らし'],approaches:['つくって試す','人と対話する'],values:['新しいものを生む','社会を変える'],intro:'伝わらないことや見過ごされる声を、形にして届ける。',question:'同じ情報でも、伝え方で何が変わる？',skills:['表現する力','問い直す力','相手を想像する力'],learn:['美術・デザイン・メディアを学ぶ','専門学校で制作技術を磨く','他分野と組み合わせて作品をつくる'],jobs:['デザイン','編集・映像制作','サービスの企画'],step:'学校のお知らせを、初めて読む人にも伝わる形に作り直してみる。',note:'作品で他人の写真や文章を使う際は、権利と同意を確認します。',caseId:'D'},
 {id:'community',no:'05',title:'地域の仕組みをつくる道',en:'COMMUNITY & SYSTEMS',color:'beige',interests:['地域・社会','自然・環境'],approaches:['人と対話する','調べて考える'],values:['社会を変える','誰かを支える'],intro:'地域にある声を集め、みんなが参加できる仕組みを考える。',question:'その仕組みから、誰が取り残されている？',skills:['対話する力','仕組みを理解する力','調整する力'],learn:['大学で社会・政策・経済を学ぶ','地域の課題を探究する','学校を通した活動で実践する'],jobs:['行政・公共政策','地域事業','社会課題に取り組む組織'],step:'学校内で改善したいルールを一つ選び、異なる立場から考える。',note:'外部への聞き取りは、先生・学校・保護者を通して調整します。',caseId:'E'},
 {id:'global',no:'06',title:'ことばで世界をつなぐ道',en:'LANGUAGE & CONNECTION',color:'sage',interests:['世界・ことば','表現・デザイン'],approaches:['人と対話する','つくって試す'],values:['社会を変える','新しいものを生む'],intro:'異なる背景をもつ人の間で、ことばと文化の橋をかける。',question:'ことばの違いの先に、どんな共通点がある？',skills:['ことばを学ぶ力','文化を理解する力','伝え直す力'],learn:['大学で言語・文化・国際分野を学ぶ','専門学校で実務のことばを学ぶ','学校が管理する交流で経験を重ねる'],jobs:['翻訳・編集','国際協力','多文化共生の支援'],step:'学校の案内を「やさしい日本語」に書き換えてみる。',note:'留学や海外活動は費用・制度・安全を学校や保護者と確認します。',caseId:'F'}
];
export const cases = [
 {id:'A',path:'care',route:['人の話を聴くのが好き','福祉を学ぶ','地域の支援職'],turn:'実習で、助ける前に相手の希望を聴く大切さを知った。',message:'「支えたい」の形は、職業が一つに決まる前から試せます。'},
 {id:'B',path:'environment',route:['生物の観察','農学を学ぶ','環境調査'],turn:'研究室の観測を通して、データと地域の声の両方が必要だと感じた。',message:'自然への関心が、食や地域の仕事にもつながりました。'},
 {id:'C',path:'technology',route:['工作と数学','高専で制作','ソフトウェア開発'],turn:'試作品が使われず、技術より先に使う人を知ることを学んだ。',message:'完成よりも、小さく試して直す経験が役立っています。'},
 {id:'D',path:'design',route:['絵と学校新聞','デザインを学ぶ','編集・サービス企画'],turn:'制作から企画へ。作品だけでなく、届くまでの仕組みに関心が移った。',message:'途中で興味が変わっても、それまでの経験はつながります。'},
 {id:'E',path:'community',route:['地域の探究活動','経済・政策を学ぶ','地域事業'],turn:'一度就職してから学び直し、地域の仕事に移った。',message:'進路は一回の選択で完成するものではありません。'},
 {id:'F',path:'global',route:['ことばと映画','言語・文化を学ぶ','多文化共生の支援'],turn:'海外に行く道だけでなく、身近な地域で世界と関わる道を見つけた。',message:'世界との接点は、自分の住む場所にもありました。'}
];
export const schoolSample = {total:48,explored:36,compared:21,discussion:12,interests:[['人・暮らし',18],['技術・データ',15],['地域・社会',12],['表現・デザイン',10],['自然・環境',9],['世界・ことば',8]]};
export function findPaths(selection) {
 const score = p => selection.interests.filter(i=>p.interests.includes(i)).length*2 + Number(p.approaches.includes(selection.approach)) + Number(p.values.includes(selection.value));
 return paths.map(path=>({path,score:score(path)})).filter(p=>p.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
}
