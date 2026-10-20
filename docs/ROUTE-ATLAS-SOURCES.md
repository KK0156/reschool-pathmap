# Whole Route Atlas — 公式資料の確認範囲

2026-10-20に、下記12ページを実際に開き、一般的な制度・学び方・仕事の調べ方を説明する公式資料の存在を確認した。検索結果の見出しだけで `reviewed` にはしていない。データは `src/route-atlas-sources.js`。

`status: reviewed` と `reviewedOn` は、**出典ページを開いたこととその日付**を示す。本人がその道へ進める、特定の学校・制度を利用できる、費用や出願条件が最新であることを検証した表示ではない。Atlasの候補は引き続き未確認として扱う。実際の高校生の適性・成績・合格可能性を判断していない。

| ID | 実際に開いた一次資料 | 今回確認した範囲 |
| --- | --- | --- |
| `mext-pathways` | [文部科学省：日本の学校系統図（令和6年版PDF）](https://www.mext.go.jp/content/20240531-mxt_chousa01-000036236-20.pdf) | 学校・課程に複数の制度区分がある。就職等を含む人生全体の図ではなく、進路の優劣や個別の移行可否も示さない。 |
| `mext-senshu` | [文部科学省：専修学校とは](https://www.mext.go.jp/a_menu/shougai/senshuu/1280727.htm) | 専修学校の制度説明。個別校・学科・資格・就職結果は未確認。 |
| `mhlw-school-work` | [大阪ハローワーク：高等学校卒業予定者向け就職支援サイト](https://jsite.mhlw.go.jp/osaka-hellowork/kanren/kousotu-syusyokusien.html) | 高校生と学校向けの就職支援の入口。大阪の掲載イベント等を全国の参加可能情報へ読み替えない。 |
| `mhlw-training` | [厚生労働省：ハロートレーニング](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/jinzaikaihatsu/hellotraining_top.html) | 職業に必要な技能等を学ぶ公的訓練の入口。対象や費用・給付がすべて同じとは扱わない。 |
| `jeed-polytech` | [JEED：高校卒業（見込）の方へ](https://www.jeed.go.jp/js/kousotsusya/index.html) | 高校卒業見込者向けの職業能力開発校等の案内。学校教育法上の大学との制度・学位の違いや入校要件は個別確認が必要。 |
| `jasso-overseas` | [JASSO：留学目的から探す](https://ryugaku.jasso.go.jp/oversea_info/purpose.html) | 語学や高等教育など留学目的の区分。本人の入学・語学・滞在・就労・奨学金条件は未確認。 |
| `mext-kosotsu` | [文部科学省：高等学校卒業程度認定試験とは](https://www.mext.go.jp/a_menu/koutou/shiken/mext_01768.html) | 認定試験合格と高校卒業の違い。受験資格・科目・免除・出願先の取扱いは今回確認しない。 |
| `mext-recurrent` | [文部科学省マナパス：リカレント教育って？](https://manapass.mext.go.jp/recurrent/necessity/) | 社会に出た後も仕事や教養のために学ぶという考え方。特定講座や勤務先制度を本人が使える保証ではない。 |
| `ouj-flexible` | [放送大学：いつでも、だれでも、自由な学び方を](https://www.ouj.ac.jp/reasons-to-choose-us/anytime-anyone-can-learn-freely/) | 通信による授業や科目履修等の一例。誰でも同じ入学条件、全課程オンライン完結、就労との両立成功を保証しない。 |
| `mext-transfer` | [文部科学省：大学への編入学について](https://www.mext.go.jp/a_menu/koutou/shikaku/07111315.htm) | 途中年次への入学制度があり法令上の対象区分があること。どの進路からでも必ず移れるとはしない。 |
| `mhlw-jobtag` | [厚生労働省：職業情報提供サイト（job tag）](https://shigoto.mhlw.go.jp/User/) | 仕事の内容・作業・知識等を調べる入口。外部サイトの自己診断やランキングをAtlasの判断へ流用しない。 |
| `mext-tandai` | [文部科学省：短期大学に関するよくある質問](https://www.mext.go.jp/a_menu/koutou/tandai/1318917.htm) | 短期大学・専攻科等の制度区分。短大を大学への通過点に限定せず、個別の資格や移行先は確認しない。 |

補助確認として、厚生労働省の[学卒者訓練](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/jinzaikaihatsu/gakusotsusha.html)も開いた。公的訓練は学卒者・求職者・在職者等の区別があるため、「高校卒業者なら全訓練を無料で利用できる」とまとめない。

## 表示・利用上の境界

- これらはAtlasの編集者が参照した一般資料。AIがユーザーの相談ごとに公式検索を行ったという意味ではない。
- 実在の学校・主催者・講座・求人や、本人の参加・入学・移行資格を確認した一覧ではない。
- 申込み、費用、奨学金・給付、募集年度、試験、ビザや移動・安全などは、各提供機関の現行案内と先生・保護者等への相談で確認する。
- 高専や大学校等には異なる制度・入口がある。高校からの一般入学、編入、学位の扱いを一括して説明しない。
- 高卒認定を高校卒業と同じ学歴として表示しない。本人の学校生活を中断する助言もしない。
- 外部のページにある個別事例・氏名・統計・費用・日程は、今回のデータへ転載していない。正確性や適性を保証する記録でもない。
- ページの更新・移転・掲載法令の改正は今後起こり得る。確認日を隠さず、実利用前の確認が必要。
- 外部サイト自身のCookie・解析・入力フォーム等は本サイトとは別の扱い。リンクへ相談文や成績を付けて送らない。

資料確認以外の外部書き込み、実生徒データの収集、有料AI API、デプロイ、GitHub pushは行っていない。
