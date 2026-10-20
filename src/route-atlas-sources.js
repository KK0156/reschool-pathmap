// Primary references opened on 2026-10-20 for the existence and classification
// of routes. "reviewed" is a source-page check, never a student's eligibility,
// a verified provider/programme, a fee quote, or an up-to-date admissions check.
// Pages are linked for the user's own confirmation; the app does not fetch them.
export const atlasSources = Object.freeze([
  {
    id: 'mext-pathways',
    title: '日本の学校系統図（文部科学統計要覧・令和6年版）',
    url: 'https://www.mext.go.jp/content/20240531-mxt_chousa01-000036236-20.pdf',
    authority: '文部科学省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '大学・短期大学・専修学校・高等専門学校・通信制など、学校種や課程が異なることを確認するための全体図。',
    limitations: '令和6年版の制度図です。就職を含む人生の全ルートや、個別校への入学・編入資格、募集、費用を示す資料ではありません。'
  },
  {
    id: 'mext-senshu',
    title: '専修学校とは',
    url: 'https://www.mext.go.jp/a_menu/shougai/senshuu/1280727.htm',
    authority: '文部科学省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '専修学校が、職業・実際生活に関する力や教養を学ぶ教育機関として設けられていることを確認。',
    limitations: '個別の専門学校・学科の認可、授業内容、得られる資格、入学条件、費用、就職結果は確認していません。'
  },
  {
    id: 'mhlw-school-work',
    title: '高等学校卒業予定者向け就職支援サイト',
    url: 'https://jsite.mhlw.go.jp/osaka-hellowork/kanren/kousotu-syusyokusien.html',
    authority: '厚生労働省・大阪ハローワーク',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '高校卒業後に働くことを検討する生徒と、学校の進路指導担当者に向けた就職支援の案内があることを確認。',
    limitations: '大阪地域の案内です。掲載イベント・求人を本サイトの参加先として紹介せず、本人の応募条件や就職可能性も判断しません。地域・年度・学校の手順は別に確認が必要です。'
  },
  {
    id: 'mhlw-training',
    title: 'ハロートレーニング（公的職業訓練）',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/jinzaikaihatsu/hellotraining_top.html',
    authority: '厚生労働省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '仕事に関する技能・知識を学ぶ公的職業訓練の案内と、ハローワークで相談する入口を確認。',
    limitations: '訓練は対象者・種類・地域で条件が異なります。高校在学中の受講、本人の利用資格、受講料・教材費・給付、募集中のコースは確認していません。'
  },
  {
    id: 'jeed-polytech',
    title: '高校卒業（見込）の方へ',
    url: 'https://www.jeed.go.jp/js/kousotsusya/index.html',
    authority: '独立行政法人 高齢・障害・求職者雇用支援機構（JEED）',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '高校卒業（見込）者向けに、職業能力開発大学校・職業能力開発短期大学校などの案内があることを確認。',
    limitations: '学校教育法上の大学等と同じ制度・学位だと一括して扱う資料ではありません。各施設の入校条件、選考、修了後の資格、費用、募集状況は個別確認が必要です。'
  },
  {
    id: 'jasso-overseas',
    title: '留学目的から探す',
    url: 'https://ryugaku.jasso.go.jp/oversea_info/purpose.html',
    authority: '独立行政法人 日本学生支援機構（JASSO）',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '語学学校、高等教育機関など、目的や学ぶ場所によって海外留学の形が異なることを確認。',
    limitations: '個別の留学先、入学・語学条件、ビザ、就労可否、費用、奨学金、安全性、募集を確認したものではありません。渡航や申込みを勧める案内でもありません。'
  },
  {
    id: 'mext-kosotsu',
    title: '高等学校卒業程度認定試験とは',
    url: 'https://www.mext.go.jp/a_menu/koutou/shiken/mext_01768.html',
    authority: '文部科学省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '高卒認定試験の合格と、高等学校の卒業は別であることを確認。高校での単位認定等には学校との確認が必要とされている。',
    limitations: '認定合格を高校卒業や、すべての進学・採用・資格の要件充足と同一視しません。本人の受験資格、科目、免除、日程、出願先の取扱いは確認していません。'
  },
  {
    id: 'mext-recurrent',
    title: 'リカレント教育って？',
    url: 'https://manapass.mext.go.jp/recurrent/necessity/',
    authority: '文部科学省・マナパス',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '社会に出た後も、仕事や教養のために学ぶリカレント教育という考え方を確認。学びを卒業時の一度きりに限定しない説明に用いる。',
    limitations: '紹介される制度や講座を誰でも使えるとするものではありません。本人が利用できる講座、支援、勤務先の制度、費用、学び直しの効果は確認していません。'
  },
  {
    id: 'ouj-flexible',
    title: 'いつでも、だれでも、自由な学び方を',
    url: 'https://www.ouj.ac.jp/reasons-to-choose-us/anytime-anyone-can-learn-freely/',
    authority: '放送大学',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '通信による授業や、学位を目指す以外に科目を学ぶ形など、仕事・生活と学習を組み合わせる一つの教育機関の例を確認。',
    limitations: '働きながら必ず修了できる、誰でも同じ条件で入学できる、すべてオンラインで完結すると保証するものではありません。入学資格、授業・試験方法、費用は個別に確認が必要です。'
  },
  {
    id: 'mext-transfer',
    title: '大学への編入学について',
    url: 'https://www.mext.go.jp/a_menu/koutou/shikaku/07111315.htm',
    authority: '文部科学省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '所定の学校・課程を経て、別の学校の途中年次へ進む編入学の制度と法令上の対象区分を確認。',
    limitations: '最初に選んだ進路から必ず大学へ移れる、誰でも同じ年次に入れるという意味ではありません。出身課程・志望先の要件、募集、選考、単位認定は本人ごとに確認が必要です。'
  },
  {
    id: 'mhlw-jobtag',
    title: '職業情報提供サイト（job tag）',
    url: 'https://shigoto.mhlw.go.jp/User/',
    authority: '厚生労働省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '職業名だけでなく、仕事内容・作業・知識や技能などから仕事を調べる公式の情報入口があることを確認。',
    limitations: '掲載された職業に本人が就けることや、求人・収入・資格条件を保証しません。外部サイトにある自己診断等の結果を、本試作品の適性判断やランキングへ流用しません。'
  },
  {
    id: 'mext-tandai',
    title: '短期大学に関するよくある質問について',
    url: 'https://www.mext.go.jp/a_menu/koutou/tandai/1318917.htm',
    authority: '文部科学省',
    status: 'reviewed',
    reviewedOn: '2026-10-20',
    scope: '短期大学という学校種、専攻科、編入学と転学の違いなど、学び方の制度区分を確認。',
    limitations: '短大を大学への途中段階とだけ扱うものではありません。個別校の教育・資格・入学条件、卒業後の進学や就職、掲載法令の最新適用は別途確認が必要です。'
  }
].map(source => Object.freeze(source)));
