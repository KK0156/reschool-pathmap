# AIによる対話・全体マップ統合 — 実装レビュー

2026-10-21。研究用プロトタイプのローカル実装・検証記録。実AIや高校生・先生による効果検証の報告ではない。

## 参照と開始時点

- 基準：会話に提示された「RE:Path Finder — AIによる対話・全体マップ統合 実装仕様書」v1.0と、会話添付の設計図。
- `REPATH_CODEX_IMPLEMENTATION_SPEC.md` / `REPATH_BLUEPRINT.png` という同名のローカルファイルは見つかっていない。仕様本文と添付画像を参照し、別の添付実ファイルを読んだとは扱わない。
- 作業場所：`/workspace/reschool-pathmap`、ブランチ `main`。
- 開始HEAD：`795839dfb393dcc2fa1376e96e821ef4eeaa392b`。開始時に `git fetch origin` し、`origin/main` と一致を確認。
- 適用される `AGENTS.md` は `/`、`/workspace`、リポジトリ内で見つからなかった。
- 開始時の変更は未追跡 `docs/RESCHOOL-PROJECT-REVIEW.md` のみ。内容を変更せず、今回の成果に含めていない。最終時もSHA256一致を確認。
- 別のCodespaces、利用者のブラウザ、Netlify管理画面は操作していない。既存サーバーを止めず、空きポートでオフラインのローカル配信を使用した。

## 現状との差分と実装範囲

|分類|開始時の状態|今回の扱い|
|---|---|---|
|そのまま使う|Atlasの分類・8比較項目・段階展開・横断接続・一般資料|分類や研究上の確認状態を変更しない|
|そのまま使う|旧3画面のAI探索と固定デモ|以前の探索への明示入口、従来topic/demo URLを維持|
|そのまま使う|RE:Treeの編集・Undo・配置・JSON v1|任意機能として維持。由来の異なる補足を別項目で受ける|
|修正|全体マップとAI探索が別々で状態がつながらない|同じ道のIDを使う全体像・注目候補・未閲覧方向・検討記録を追加|
|追加|AIによる質問・説明の動的な選択がない|一問ずつの案内、説明、候補、比較、試行、要約のAPI契約を追加|
|追加|Finderだけでは持ち帰れない|Finder専用JSONのプレビュー・ダウンロード・復元を追加|
|保護|研究報告13章・年表・Archive・旧試作品|原稿・分類データ・旧デザインを保持し回帰検証|

実装順は、既存調査→対話/状態/保存の契約分担→大学進学が未定の架空ケース→訂正と失敗時の保護→実画面レビュー→回帰検証。新フレームワークへの移行やAtlasの作り直しはしていない。

## 実装した体験

1. Homeで「AIの案内で考える」または「まず全体を見る」。回答・AI送信なしで地図を読める。
2. 最初は共通UIの一問。本人が選択・自由記述・分からない・どれも違う・スキップを使う。共通文を個別生成のAI回答とは表示しない。
3. AI送信前は質問・回答・本人の訂正を日本語で確認し、必要なら実際のJSONも開く。毎回の明示同意が必要。
4. サーバーに回答履歴と訂正を送り、AIが `ask / explain / show_routes / compare / suggest_trial / summarize` を選ぶ。次の質問列はフロントに固定していない。
5. いつでも「今の情報で道を見る」。途中で地図を見ても回答はメモリに残る。注目しなかった道もAtlasに残る。
6. 注目理由を本人の発言に対応づけ、AIの解釈を本人が直す。古い理由が未更新なら「見直しが必要」。開いたことを志望・決定にはしない。
7. 二つの候補を既存の8項目で読む。スコアや進路の一位を出さず、費用・収入・期間を根拠なく数値化しない。
8. 候補・気づき・次に確かめたいことを、Finder内からJSONとして持ち帰る。進路を一つ選ばず終了できる。
9. 図にしたい人だけRE:Treeへ。一般資料はreference、AIの理由・行動案は本人が追加を確認したai_proposal、本人の訂正・メモはmanualで区別する。

以前の生成型探索・架空デモの比較はその保存版の契約を維持する。新しい案内とAtlasの候補の比較は同じ8項目を用いる。

## 状態・APIの境界

- 本人の発言は質問文・質問ID・回答ID・回答状態を持つ。回答状態は answered / unknown / different / skipped。
- AIの解釈・関連理由は回答IDまたは訂正IDを参照する。存在しないIDやAtlas ID、選んだ道と異なる比較結果は拒否する。
- 解釈に参照があることは、意味上の正しさや本人の承認を保証しない。未確認と表示し訂正可能にする。
- AIの自由生成でAtlasを作り直さない。未収録の案は「追加で調べる候補」として分ける。最新の制度・募集を検索した表示はしない。
- AIへの入力は最大48KiB、回答20件・訂正12件。出力最大96KiB。UIの送信回数は一相談12回まで。自動的なAPI連鎖はない。
- 本人の訂正、画面移動、復元等でrequest token/revisionを更新し、遅れて届く以前の応答を適用しない。
- 地図の希望・確認メモ・ファイル内容を自動でAIへ送らない。復元してもPOSTや同意の復元はない。
- 未設定・429・5xx・タイムアウト・不正JSON・不正参照はエラーにし、回答・候補・本人メモを保持する。
- `guide-discovery` は既存と同じモデル設定、サーバーキー、`store:false`、45秒上限、Netlify rateLimitを使用。ブラウザは55秒、設定確認は5秒。
- Cookie/localStorage/sessionStorage/解析/DB/アカウント/直接連絡は追加していない。アプリのコードは相談文・応答・APIキーをログに出さない。提供者・配信基盤のログや保持がゼロとは保証しない。

## 保存形式・互換性

- Finder文書：`format: "repath-finder-session"` / `schemaVersion: 1`、最大1MiB。
- `session` は revision / atlas / discovery / guide / notes / nextActions / view。分類資料は当時のid・タイトル・URL・確認日・確認範囲・限界を `catalogueSources` に残す。
- 通常は質問への回答と旧探索の生入力を省く。本人が反映した訂正は `guide.userCorrections` として常に保存する。
- 質問への回答も含める場合は本人がチェックする。この場合、以前の探索の入力・枝の質問下書きも含むと表示する。
- 新しいAI案内の未反映の回答・訂正の書きかけは含まない。地図の確認メモの書きかけは含む。保存前に対象内容を表示する。
- 元の回答がない場合は correspondence=not_saved / conversation=null。元の発言との対応は未確認として表示し、欠落した会話を創作しない。
- 同じファイルを復元・再保存できる。残った訂正IDと衝突しない採番をする。別ファイルの復元では旧訂正フォームの書きかけを消去する。
- 未知の版、破損、不正ID、無効なグラフ、過大ファイル、getter/prototypeキー等は現状を消さず拒否。validなファイルで置換する前には確認する。
- 従来Treeの `re-tree` / version 1 は変更しない。reference/manual/ai_proposal/user_edited等の項目由来と配置を保持する。

## 実画面で見つけ、直した問題

- 上部の説明・保存操作で最初の質問や候補が画面外になった。子ツールを画面に接続してからフォーカスし、主要操作へスクロールする順序へ修正。
- 固定ナビに送信確認と比較の見出しが隠れた。確認・訂正・エラー・保存プレビュー・比較見出しにスクロール余白を設定。比較は5幅/両エンジンで再撮影し、見出しの可視座標も検査。
- 訂正後に新しいAI応答に道がなかった場合、古い道の理由を更新済みとしていた。候補は保持し、未更新ならstaleを維持。
- 会話を省くと本人の訂正も消えた。訂正を質問回答の保存と分離して常時保持。
- 回答を省いた復元後に再保存できない状態を修正。欠落した回答との対応を未確認のまま残す。
- 復元後に旧訂正フォームの書きかけが混ざる点、訂正IDが重複し得る点を修正。
- 過去の回答を書き直す際、次の質問の書きかけが失われた。中断した質問・選択・文章を保持し、編集取消/再開で戻せるようにした。
- Atlas側の回答参照上限20を、API契約の20回答+12訂正に合わせ32へ修正。内部IDを一般利用者向けに表示しない。

## 完成条件

以下のPASSはローカルコードと合成データ/モックの操作確認を意味する。実AIの品質・実利用者への効果を意味しない。

|ID|結果・確認範囲|
|---|---|
|A01|PASS：回答なしで全体マップ、大学・仕事などを同列に維持。マップだけではFunctions送信なし|
|A02|PASS：主な質問一つ、自由記述・分からない・どれも違う・スキップ|
|A03|実装・モックPASS：履歴から動的なGuide応答を依頼。実AIの質問品質は未評価|
|A04|実装・モックPASS：説明/具体例と質問を切替。実AIが適切に選ぶかは未評価|
|A05|PASS：途中から全体へ、対話へ戻って回答保持|
|A06|構造・表示PASS：本人入力参照を検証。意味的な根拠・非創作は実AI未評価|
|A07|PASS：解釈と過去回答の訂正、遅延応答無視、本人編集保持|
|A08|PASS：AIの候補以外もAtlasに残る|
|A09|PASS：一般資料の内容・生活・準備・条件・横断接続を読む。個別適格性は未確認|
|A10|PASS：二つを同じ8項目で比較、未定のまま記録・終了|
|A11|PASS：Finder JSONの実ダウンロード、再読み込み、復元・再保存|
|A12|PASS：保存対象の事前確認、任意の質問回答保存、復元時POSTなし|
|A13|PASS：Treeを使わず完了。任意引継ぎの由来・編集・Undo・Tree JSONを維持|
|A14|PASS：未設定・失敗・タイムアウト・取消・不正応答・遅延応答時に状態保持|
|A15|PASS：固定デモを架空の例として維持。AI未設定時に架空の回答を生成したふりをしない|
|A16|PASS：既存Atlas/探索/Tree/研究13章/Archive/v1/保存版/起動回復の回帰|
|A17|PASS：320/390/768/1024/1440px ×11画面 ×2エンジンで描画・操作。重なり/横はみ出しを検査し、代表画像を目視。実機ではなくviewport/touchエミュレーション|
|A18|ChromiumとWebKitを使用。WebKitは利用可能なLinux実行環境で、iPad Safari実機ではない|

## テストと画像

最終の単体テスト **144/144成功**、ビルド成功。新しい一連のブラウザ検証は **Chromium/WebKitとも9カテゴリ成功**。5幅×11画面×2エンジンの110枚を含む136枚を撮影し、代表画面を実際に目視した。途中失敗・修正前画像を最終成功画像と混同しない。

- ベースライン：`npm test` 111件成功、`npm run build` 成功。
- 既存ブラウザ：21スクリプトすべて成功（先行17本、Phase4、Atlas、Phase3、旧Tree組込）。起動回復はその中の20ケース（Chromium10/WebKit10）。新規2本も成功。
- Phase4既存探索：Chromium8群+WebKit8群、16群成功。
- Atlas既存操作：Chromium6群+WebKit6群、12群成功。
- 新規の案内：両エンジンで9カテゴリずつ成功。136枚のうち110枚が5幅の11画面。
- 比較見出し：CSSの最終修正後、5幅×2エンジンの10組を再操作・再撮影。見出しy89.52–90.48、固定領域下端73–88.5で隠れないことを検査。
- 未接続と架空502失敗：両エンジン390pxで再操作・4枚撮影。回答保持、送信無効の表示、全体への入口を目視。
- 新規Finder保存/旧探索状態hook/Tree由来の補助検証：成功。復元の訂正フォーム・採番回帰も成功。
- 有料API・実生徒データ・外部への連絡・Netlifyデプロイは不使用。

主なコマンド：

```sh
PATH_MAP_OFFLINE=1 PATH_MAP_PORT=8003 npm start
npm test
npm run build
python tests/guided-discovery-browser.py
python tests/guided-restore-browser.py
# 既存回帰は各テストの指定ポート(8000/8001/8002)か環境変数でoffline配信
python tests/phase4-browser.py
python tests/route-atlas-browser.py
python tests/startup-browser.py
PHASE3_BASE_URL=http://localhost:8003 PHASE3_SCREENSHOT_DIR=/workspace/reschool-guided-review/regressions/phase3 python tests/phase3-browser.py
python tests/tree-integration.py
git diff --check
```

成果物の作業環境内の保存先：

- `/workspace/reschool-guided-review/before/`：変更前の390/1024px画面。
- `/workspace/reschool-guided-review/after/`：最終フロー・5幅の画面・audit.json。
- `/workspace/reschool-guided-review/visual-review/`：目視レビュー。送信確認見出しが隠れるbeforeと修正後。
- `/workspace/reschool-guided-review/finder-files/`：保存・復元・訂正の境界確認。
- `/workspace/reschool-guided-review/tree-guide-origin/`：一般資料/AI補足/本人編集のTree検証。
- `/workspace/reschool-guided-review/regressions/`：既存回帰、初回失敗と再実行のログ。

これは作業環境内のパスであり、別Codespacesや利用者の端末から同じパスを開ける保証ではない。最終回答では代表画像を提示し、その他の検証結果はこの資料に記録する。

## 代表画面

リポジトリにも代表画像を含めた。以下はローカル実装の合成データによる画面で、実AIの返答や公開サイトの画面ではない。

- [ホーム・390px](screenshots/ai-guided/home-390.png)
- [最初の一問・390px](screenshots/ai-guided/question-390.png)
- [今回注目した道・1440px](screenshots/ai-guided/attention-1440.png)
- [同じ8項目の比較・768px](screenshots/ai-guided/comparison-768.png)
- [保存前確認・390px](screenshots/ai-guided/save-390.png)
- [AI未接続・390px](screenshots/ai-guided/unconfigured-390.png)
- [接続失敗後も回答を保持・390px](screenshots/ai-guided/failure-390.png)

## 変更ファイル

|範囲|ファイル|内容|
|---|---|---|
|対話とAPI|`src/guided-discovery.js`、`src/guide-model.js`、`netlify/functions/guide-discovery.js`|動的なGuide契約、送信同意、本人訂正、状態と参照の検証|
|統合・保存|`src/path-finder.js`、`src/finder-file.js`、`src/guide-transfer.js`|入口と4表示、独立JSON、任意Treeへの由来付き引継ぎ|
|既存ツール|`src/route-atlas.js`、`src/route-discovery.js`|安全なsnapshot/restore、AI関連理由、旧入力未保存の表示|
|表示|`src/guided-discovery.css`、`src/route-atlas.css`、`src/desk-app.js`|学校/紙の世界観、初回導線、読みやすい画面・フォーカス|
|起動|`index.html`、`src/bootstrap.js`、`scripts/dev-server.mjs`|新スタイル/版、新Functionのローカル配信。起動回復を維持|
|Tree|`retree-mindmap/src/app.js`、`retree-mindmap/src/research-print.js`|一般資料とAI補足・本人記録の区別。JSON契約は維持|
|新テスト|`tests/guide-model.test.js`、`tests/guide-api.test.js`、`tests/finder-file.test.js`、`tests/guide-transfer.test.js`、`tests/atlas-session-hooks.test.js`、`tests/guided-discovery-browser.py`、`tests/guided-restore-browser.py`|正常/異常/境界/一連操作|
|既存テスト|`tests/browser_support.py`、`tests/startup-browser.py`、`tests/phase3-browser.py`、`tests/phase4-browser.py`、`tests/route-atlas-browser.py`|新入口と保持ツールを明示、非同期配置待ち。既存の安全性・可視性assertは保持|
|画像|`docs/screenshots/ai-guided/`|代表画面のPNG。合成データのみ|
|資料|`README.md`、`DESIGN.md`、本書、`docs/AI-GUIDED-EVALUATION.md`|起動/保存/制約、実装レビュー、実AI未実行の評価計画|

## 保護の確認

内容のSHA256が開始時と一致：

- `src/research-data.js`：`9e2ad14e49a46b6d7a152c747f6541b4e2c01875e6ddd2b545d38d36eab762b4`
- `src/research-report.js`：`6ed6b2933425512f545a0682a93454d4dc997b9bfd5337acdaed1063a4b1526c`
- 未追跡 `docs/RESCHOOL-PROJECT-REVIEW.md`：`742926673940d84dfad15a5c15f414277068fdee576774628f957574ca2846cf`

旧HTML・旧バンドル・分類データ・研究原稿に変更はない。v1埋め込みCSS整合性をビルドで検証。Prototype 2 / Evidence Packの未掲載状態を変更していない。

## 未実装・未検証と次の評価

- 実AIの質問の質、説明の分かりやすさ、回答との意味的な関連、意外性と事実性は未評価。[AI-GUIDED-EVALUATION.md](AI-GUIDED-EVALUATION.md)に12種類の合成ケース・採点基準を用意したが未実行。
- 公式サイトのリアルタイム検索、最新の募集/学費/本人資格の検証は未実装。既存の一般資料と明示した確認範囲のみ。
- iPad/iPhoneのSafari実機、OSのファイル選択/ダウンロード、日本語IME実機、VoiceOver/NVDAによる読み上げは未検証。キーボード・フォーカス・touchエミュレーション・ARIA/DOM確認とは分ける。
- 生徒・先生による理解・未知の選択肢の発見・行動へのつながりは未検証。効果を実証したとはしない。
- 会話全体や未反映の入力を自動保存しない。入力を残したいときは表示範囲を確認し、端末ファイルへ明示保存する。
- 実際のNetlify Function運用、APIのモデル権限・残高、ホスト側のログ・保持条件、公開URLの動作は未確認。

## 環境別の状態（実装・検証完了時点）

- **Codex作業環境の実装・テスト**：ローカル変更と、合成データ/モックのテスト。最終集計は上記。
- **Gitコミット**：今回は作成していない。作業ブランチmain、HEADは開始時の `795839dfb393dcc2fa1376e96e821ef4eeaa392b` のまま。
- **GitHub push**：行っていない。今回の変更はまだGitHubへ反映していない。
- **Codespaces**：利用者の別Codespacesを調査・操作していない。利用者の画面の復旧・表示成功とは報告しない。
- **公開サイト**：Netlifyへデプロイしていない。公開サイトの状態・自動デプロイは未確認。


## 後続のpush依頼

実装・検証の完了報告後、ユーザーから明示的に `push` の依頼を受けた。上の「未コミット・未反映」は、承認前の実装検証時点の記録である。

後続作業では検証済み39ファイルをmainへのコミット・push対象とする。開始時から未追跡の `docs/RESCHOOL-PROJECT-REVIEW.md` は含めない。実際のpush結果とコミットSHAは、Git履歴と最終回答で確認する。Netlifyの手動デプロイ、有料API、別Codespacesの操作は行わない。
