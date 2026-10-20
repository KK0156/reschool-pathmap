# Phase 4 — AI Route Discovery 実装・検証記録

2026-10-20。対象は `KK0156/reschool-pathmap`。開始時に作業ツリーと最新のmainを確認し、`git fetch origin` 後のmain／origin/mainはともに `f3e38a4f5ae6c82505b2e5d4fb683b663b11af3f` でした。README、DESIGN、既存のレビュー、画面・共有Tree・Functions・テストを確認してから変更しました。

実装と検証はローカルで行いました。検証完了後、ユーザーの追加指示「プッシュ」によりGitHubのmainへの反映が承認されました。Netlifyへのデプロイ操作、有料AI APIの実行はしていません。実在する生徒のデータは使用していません。開始時から存在した未追跡の `docs/RESCHOOL-PROJECT-REVIEW.md` は変更・コミットしていません。

## 1. 変更前の問題

390／1024pxでHome、Finder、Tree、Cases、Research、Archiveを実際に描画し、12枚を保存しました。

- Homeの相談例から完成済みのTreeへ直行し、初回から図の操作が中心でした。
- `/#/finder` はTreeの別名で、本人の相談から少数の道を得て深掘りする画面がありませんでした。
- Treeの編集・JSON保存は動いていましたが、道の内容、関連分野、条件を段階的に発見する導線とは異なっていました。
- 新しい探索の初期実装も自主レビューしました。詳細下部の探索ボタンが遠い、スマホ見出しの一文字だけの折り返し、比較の項目が離れる、大学デモが「調べ方」の説明へ寄りすぎる点を修正しました。さらに、候補の表示後に説明だけで最初の画面が埋まる状態を見直し、候補の見出しへ移動し、長いまとめは任意で開く形にしました。

## 2. 最終的な体験

主なナビゲーションはホーム／道を探す／事例を見る／研究について／開発の歴史の5つです。RE:Treeへのリンクは「整理する（任意）」と明示し、全ページから開けます。

1. Homeの「AIと道を探す」または6テーマの入口から相談を始めます。
2. テーマ、いまの迷い、条件と確認の3画面で進みます。文章・現在の状況・条件は任意で、自由入力テーマの相談文のみ必須です。詳細なプロフィールや成績を必須にしません。
3. 送信する内容を読み、同意した場合だけAIへ送信します。未接続時は利用不可を表示し、固定デモを使えます。
4. 最初は3〜5方向を表示します。候補を選び、詳細・別の方向・関連候補へ進みます。パンくずと「前の画面に戻る」で以前の候補へ戻れます。
5. 2候補を同じ項目で比較し、必要な候補を最大6つ残せます。本人が希望した場合だけRE:Treeへ移ります。
6. Treeで枝を編集・追加・削除し、仮説・証拠・反論・リスク・次の行動を整理して、既存のJSON保存／復元や印刷を利用できます。

各ルートには、道の内容、含めた理由、学び・活動の例、確認する条件、未確認事項、次の一歩を表示します。「可能性を検討できる道」「条件の確認が必要」「現時点では判定できない」を文字で区別します。これらは受験資格・適性・合格可能性を保証する表示ではありません。

## 3. 固定デモとAI

文理選択、学部選び、進路未定、学校外活動の4デモ、合計68候補を用意しました。各デモは最初3方向、計17候補で、3段階以上深掘りできます。入力を分析した結果ではなく、固定の架空例と表示します。

学部選びには法学・経済学・情報学などの分野と、異なる学び方を入れ、学習内容や確認する科目まで進めるようにしました。AIへの指示も、調べ方の言い換えだけで候補を埋めず、具体的な分野・仕事の役割・学び方・活動の種類を示すようにしました。

新しい `discover-routes` Functionには、最初の探索、選んだ道の深掘り、候補への質問の3種類があります。APIキーはサーバー環境変数のみです。設定確認GETは真偽値と `browsing:false` を返すだけで、AI APIを呼びません。

公式サイトの検索・要件取得は実装していません。出典・確認日・最新情報を取得したようには表示しません。実際の大学・資格・活動の要件、期限、費用は公式資料で確認する事項です。JSONの形式検証とシステム指示は、AI出力の事実性や断定を完全に保証する仕組みではありません。

## 4. 状態保持・安全性・自主レビューでの修正

- 相談文、候補、履歴、比較はブラウザのメモリのみ。ページ間の移動では保持し、再読み込みで消えます。Cookie、localStorage、sessionStorage、解析、DB保存は追加していません。
- 外部AIへの送信は毎回プレビューと同意が必要です。初回は相談の3項目とテーマ、追加相談ではそれに選択候補・短い経路・必要な質問だけを加えます。Tree全体や他の候補は送りません。
- 本文は最大48KiB、厳密なJSON検証、文字数・候補数・IDの制限を適用します。出力も最大192KiBと定義済みのフィールドだけに制限します。HTML相当の文字列は文字として表示します。
- サーバーは同一オリジン、メディア形式、未設定、45秒タイムアウト、上流エラーを処理します。ブラウザは55秒で中断します。相談文・キー・応答をアプリのログへ出しません。OpenAIには `store:false` を指定しますが、提供者・ホスティング側のログや保持をゼロとは保証しません。
- 入力・条件・質問種別の変更、キャンセル、Homeへの移動、同じデモへの戻りでは古い応答を無効にします。エラー時に入力や承認済みの候補を消しません。
- 既存候補の置換と、編集済みTreeの置換は確認してから行います。キャンセル時は旧内容を残します。
- AIによる深掘りは候補の追加です。本人が書き換えたTreeを自動的に上書きしません。
- 固定デモとAI候補を混ぜてTreeへ移したときも、枝ごとの由来を保持します。本人の書き換えも区別し、JSON往復で維持します。全体再生成を承認した後のUndoでも、混合由来の内容・概要表示を復元します。
- 任意のTree引き継ぎでは、相談文や背景欄をそのまま複写しません。候補と確認事項を渡し、本人の決定や確認済みの事実として扱いません。
- 直接のマッチング、連絡先交換、外部への申込みはありません。学外活動の確認・相談は先生・学校・保護者を通します。

## 5. 変更ファイル

| ファイル | 変更内容 |
| --- | --- |
| `src/route-model.js`（新規） | 相談・候補の厳密な検証、状態ラベル、候補からTreeへの変換、枝ごとの由来 |
| `src/route-demos.js`（新規） | 一般向けの4つの階層デモ |
| `src/route-discovery.js`（新規） | 段階入力、探索・深掘り・質問、履歴、比較、候補選択、任意の引き継ぎ、取消・エラー回復 |
| `src/route-discovery.css`（新規） | 探索の紙カード、比較、入力、モバイル表示、フォーカス |
| `src/phase4-site.css`（新規） | Homeの主入口、6テーマと4デモ、任意のTreeリンク、レスポンシブ調整 |
| `netlify/functions/discover-routes.js`（新規） | サーバー側の探索API、設定確認、構造化出力、入力・出力制限 |
| `src/desk-app.js` | Finderの独立、Homeとナビゲーション、画面間の保持、Treeの任意引き継ぎ、旧URL案内 |
| `retree-mindmap/src/app.js` | 安全な引き継ぎ受付、既存編集の置換確認、混合由来表示とUndo |
| `index.html`、`src/bootstrap.js` | 探索用CSS・起動版識別・説明文。既存の起動失敗時の案内を維持 |
| `scripts/dev-server.mjs` | ローカルで新Functionを配信。オフライン時の全AI遮断は維持 |
| `tests/route-model.test.js`、`tests/discovery-api.test.js`、`tests/discovery-transfer.test.js`（新規） | 階層デモ、形式・制限・API異常系・由来と保存の検証 |
| `tests/phase4-browser.py`（新規） | モックAI、デモ、比較、引き継ぎ、保存、異常系、画面・操作・保護策のE2E |
| `tests/browser.py`、`tests/phase2-journey-browser.py`、`tests/phase2-webkit-browser.py`、`tests/phase2-canvas-browser.py`、`tests/phase3-browser.py`、`tests/research-desk-browser.py`、`tests/startup-browser.py`、`tests/usability-browser.py`、`tests/workflow-recovery-browser.py` | 新しいHome・主ナビ・任意Tree入口への期待を更新。既存の機能・保護策の検証は保持 |
| `README.md`、`DESIGN.md`、この文書 | 現在の入口、設計判断、実装と検証範囲、残る制約 |

## 6. 実画面と検証記録

成果物の保存先は `/workspace/reschool-phase4-review/` です。スクリーンショットはリポジトリ外のローカル成果物で、サイトの公開ファイルには追加していません。

| 保存先 | 内容 |
| --- | --- |
| `before/` | 変更前12枚、`baseline.json`、`OBSERVATIONS.md` |
| `after/` | Chromium／WebKit、5幅×12種類の画面を含む変更後138枚、操作結果`audit.json`、実行出力、JSON例 |
| `frontend/` | 詳細のボタン位置・比較を調整した際の5幅×4種類の画面 |
| `university-final/` | 具体的な学問分野へ修正した後の5幅×3画面×2エンジン、計30枚と`results.json` |
| `regressions/` | 従来の操作・保存・印刷PDF・起動回復・旧デザインの検証結果と画像 |
| `unit-tests.txt`、`build.txt` | 全単体テストとビルドの実行出力 |

実際に開いて確認した画面：

- [390pxのHome](/workspace/reschool-phase4-review/after/chromium-390-home.png)
- [320pxのWebKit Home](/workspace/reschool-phase4-review/after/webkit-320-home.png)
- [390pxの相談入口](/workspace/reschool-phase4-review/after/webkit-390-consultation.png)
- [768pxの比較](/workspace/reschool-phase4-review/after/chromium-768-comparison.png)
- [1440pxの主要候補](/workspace/reschool-phase4-review/after/chromium-1440-directions.png)
- [候補の詳細・改善後](/workspace/reschool-phase4-review/frontend/390-detail.png)
- [学部選びの候補・最終390px](/workspace/reschool-phase4-review/university-final/chromium-390-fields.png)
- [経済学部の内容・最終768px](/workspace/reschool-phase4-review/university-final/webkit-768-economics.png)
- [経済の学習内容から必要科目へ・最終1440px](/workspace/reschool-phase4-review/university-final/chromium-1440-curriculum.png)

幅320／390／768／1024／1440pxで、Home、相談の3画面、候補、詳細、深掘り、比較、Tree、ケース、研究報告、アーカイブを描画しました。横はみ出しは検出されませんでした。768／1024pxではタッチ対応コンテキストも使用しました。

## 7. テスト結果

有料APIを止めたローカル配信とPlaywrightの合成応答を使用しました。APIキーなしの実HTTP配信でも、新FunctionのGETが未設定／検索なし、POSTが503、JavaScriptのMIMEが正常であることを確認しました。既存のサーバーを停止せず、確認用プロセスだけ終了しました。

| 検証 | 結果 |
| --- | --- |
| `npm test` | 93件すべて成功。出力は `unit-tests.txt` |
| `npm run build` | 成功。v1の埋め込みCSS一致も検証 |
| `git diff --check` | 成功 |
| `tests/phase4-browser.py` | Chromium・WebKitで成功。相談3画面→3候補→深掘り2回→質問→比較→Tree→編集→JSON保存→再読み込み→復元 |
| Phase 4の異常系 | 未設定、502、503、不正応答、仮想55秒タイムアウト、取消、入力変更・画面離脱後の古い応答を検証 |
| Phase 4のデモ・保護 | 4デモ各4段階、AI送信なし、混合由来・本人編集の保存復元、全体再生成後Undo、HTML無害化、キーボード、タッチ操作を検証 |
| 最初の候補の見つけやすさ | 4デモ×5幅×2エンジンの40条件で、最初の候補見出しが画面内に80%以上表示。記録は `after/candidate-visibility.json`。最後の表示調整後、Phase 4の全E2Eも両エンジンで再実行し終了コード0 |
| 最終の大学デモ | 両エンジン・5幅で、最初の候補見出しが画面内に表示され、経済学部→授業内容→数学・統計／入試科目へ3段階進めることを確認。AI POSTは0回 |
| `tests/startup-browser.py` | Chromium・WebKit合計20件成功。遅延・読込失敗・再試行・書きかけ保護を維持 |
| `tests/phase3-browser.py` | 両エンジンで成功。従来の相談例8件、12ケース、13章、保存版、旧URL、編集・JSON・5幅を維持 |
| `tests/phase2-journey-browser.py`、`tests/phase2-webkit-browser.py` | 成功。従来の編集、位置・由来の復元、印刷・PDF、タッチを維持 |
| `tests/research-desk-browser.py`、`tests/workflow-recovery-browser.py`、`tests/usability-browser.py` | 成功。画面移動、入力保持、エラー回復、既存の資料・5幅表示を維持 |
| `tests/browser.py`、`tests/archive-design-browser.py`、`tests/v1-style-delivery-browser.py`、`tests/ai-browser.py` | 成功。保存版の6画面、旧デザイン、CSS遮断時のv1、旧AIの同意・追加質問・XSSを検証 |
| `tests/tree-browser.py`、`tests/tree-edit-browser.py`、`tests/tree-files-browser.py`、`tests/tree-integration.py` | 成功。従来のTree表示、編集、同意、JSON往復・不正ファイル・配置・引き継ぎを維持 |
| `tests/mind-map-browser.py`、`tests/free-canvas-browser.py`、`tests/phase2-ai-browser.py`、`tests/phase2-canvas-browser.py` | 成功。既存の地図表示、ズーム・タッチ、200項目、Undo、AIの取消・エラー・タイムアウトを維持 |

旧テストの一部は「HomeからTreeへ直接進む」「主ナビにTreeがある」「旧Home見出し」という期待で最初に失敗しました。新しい情報設計への期待だけを更新し、編集・保存・旧デザイン・エラー回復の検証を残して再実行しています。失敗と再実行は回帰ログに記録しました。

## 8. 保護した成果

研究本文・資料の確認状態は変更していません。13章の報告、日米の教育比較を出発点とする7段階、一般向け12ケース、旧デモ、RE:School v1、Path Map試作品3号は維持しました。Prototype 2とEvidence Pack本体は、未掲載のままです。

開始前後のSHA256：

| ファイル | SHA256（変更なし） |
| --- | --- |
| `src/research-data.js` | `9e2ad14e49a46b6d7a152c747f6541b4e2c01875e6ddd2b545d38d36eab762b4` |
| `src/research-report.js` | `6ed6b2933425512f545a0682a93454d4dc997b9bfd5337acdaed1063a4b1526c` |
| 作業開始時からの `docs/RESCHOOL-PROJECT-REVIEW.md` | `742926673940d84dfad15a5c15f414277068fdee576774628f957574ca2846cf` |

## 9. 未実装・未検証と次の優先事項

1. **実利用者と内容の評価**：高校生が知らなかった道に気づけるか、条件や未確認表示を理解できるかは未検証です。生徒・先生の試用で確認する必要があります。利用効果を測定したとは主張しません。
2. **公式情報の取得**：最新の大学・資格・費用・募集・期限の取得はありません。実装する場合は公式情報、対象年度、確認日、更新切れを示す必要があります。
3. **実AIの品質**：APIの実装・契約・異常系はモックで検証しました。実際の有料AIへの疎通・出力品質・料金・モデル利用権限は未検証です。構造化出力だけで誤りや適性の断定を完全に防げるとはいえません。
4. **探索全体の直接保存**：Finderの全候補・履歴・入力のJSON保存は未実装です。選んだ候補を任意でTreeへ渡し、既存のJSONで保存する範囲です。リロード前の自動保存はしません。
5. **探索の上限**：固定デモは有限です。AIを加えた探索も80候補まで、比較2候補、残す候補6件に制限します。既存Treeの手動200項目・AI全体生成40項目の制限は維持します。
6. **端末と公開環境**：WebKit WPEとタッチ対応のブラウザコンテキストは、実機iPad／iOS Safariではありません。実機での操作、非公開Codespacesの認証・転送、Netlifyの本番設定は今回のローカル検証に含みません。
7. **データ提供者側の扱い**：アプリ側の保存・ログなしと、AI・ホスティング提供者側のアクセスログ・保持は別です。キー・個人情報を公開ソースへ入れず、重要な判断は信頼できる大人と確認してください。

学校の掲示板・研究机の見た目は保ちました。今回確認できたのは表示・操作・状態保持・検証処理であり、進路支援の効果や本人への適性の証明ではありません。
