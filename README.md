# RE:School Path Map — 進路の相談 / 試作品3号

公開トップはRE:Schoolです。RE:Treeは独立したトップではなく、既存の「進路の相談」に追加したマインドツリー機能です。

- `/`：RE:School Path Map
- `/#/finder`：「選択肢から相談する」「相談メモをツリーに整理する」を同じ画面で選択
- `/original.html`：元のRE:School v1
- `/reschool.html`：RE:Schoolの互換入口

RE:Treeの実装と仕様は `retree-mindmap/` にまとめていますが、画面内に直接組み込んでいます。iframeや別サイトへの移動は使いません。メモ・ツリーはブラウザのメモリだけに保持し、相談方法の切り替えでも残ります。消去ボタンや再読み込みで消えます。

Netlify Functionsは、選択式の相談用 `path-consult` と、相談メモのツリー化用 `generate-tree` を使用します。どちらもサーバー側の `OPENAI_API_KEY` を使います。API未設定でもツリー機能は、サンプルだと明示して操作できます。

---



# RE:School Path Map — AI相談 / 試作品3号

CoD出願に向けた個人のResearch / Design Prototype。中心はRE:Path Finderで、興味や迷いを選択肢で伝え、AIの返答と追加質問で進路について考える機能です。AIが進学先や適性を判定する設計ではありません。実際の生徒による検証はまだ行っていません。

## 起動・テスト

Node.js 22以上を使用します。依存パッケージはありません。

```sh
npm start
# http://localhost:8000
npm test
npm run build
```

APIキー未設定でも資料閲覧やサンプル検索は動きます。AIへの送信は接続未設定として表示します。ローカルでは環境変数 `OPENAI_API_KEY` と任意の `OPENAI_MODEL` をサーバーに渡します。キーをブラウザや公開ソースに書かないでください。

- `tests/browser.py`：ローカル配信を8000番で起動後、Python Playwrightと `/usr/bin/chromium` で資料機能・スマホ・v1往復・保存なしを確認
- `tests/ai-browser.py`：同じサーバーを8001番で起動して、同意前の送信なし・キー未設定・テスト用応答による会話継続・表示のエスケープ・消去を確認
- 別ポートで起動する場合は `PATH_MAP_PORT=8001 npm start`
- `npm test`：APIへの入力検証、成功・失敗・未設定・時間切れ、サンプルデータの整合性。実際のAPIを呼ばないテストです

## 画面

- `/reschool.html#/`：何ができるかと、データ・機能の制約
- `/reschool.html#/finder`：AIに相談する。興味19項目、やってみたいこと9項目、仕事への関心9項目から複数選択。未定でも使用可能
- `/reschool.html#/paths`：16分野の進路の一覧。学ぶ内容・進み方・仕事・次に調べることを確認し、3件まで比較
- `/reschool.html#/cases`：16件の架空の卒業生の進路例。理由・入ってから分かったこと・難しかったこと
- `/reschool.html#/dashboard`：3つの架空の学校を選び、活動・相談先・卒業生の例を切り替える
- `/reschool.html#/research`：研究目的、AI相談とサンプル検索の違い、未検証の点、データの取り扱い

## AIとの相談

1. 三つの質問で選択する
2. 外部AIへ送る内容を確認し、同意して送信する
3. AIの返答、参考に読む分野、先生に聞く項目を読む
4. AIが選んだ追加質問に、用意された選択肢で答える
5. 最大6回の返答の範囲で相談を続け、必要なら先生に見せる用に印刷する

サイト → `/.netlify/functions/path-consult` → OpenAI Responses API、という構成です。AIの返答は実際のAPIから取得し、未設定時にサンプル回答をAIの返答として表示することはありません。標準モデルは `gpt-5-mini`。`OPENAI_MODEL` で対応モデルに変更できます。料金は利用するAPIとNetlifyのプランに従います。

AIには進路・適性・合格可能性・将来性を判定しないよう指示しますが、誤りや断定を完全には防げません。入試・資格・費用は、先生と公式資料で確認する項目として扱います。参考資料は16分野と架空の卒業生事例に限られ、最新情報を検索する機能はありません。

APIを使わない「選択だけでサンプルを絞る」機能も残しています。タグの一致による検索であり、AIの返答とは区別しています。

## 送信・保存・安全

- 名前・実際の学校名・連絡先の入力は不要。相談メモと、成績の目安・科目・希望条件等の任意欄がある
- 選択式相談のサーバーは許可リストと追加質問のID・回答番号のみ受け付ける。ツリー生成のサーバーは、相談メモと任意欄をまとめた3000文字以内の文章のみ受け付ける
- 選択式は選択肢と追加質問への回答のみ送信。ツリー生成では確認済みの相談メモと記入済みの任意欄のみ送信。編集したツリー、先生用メモ、学校選択は送信しない
- 会話はブラウザのメモリのみで、消去・再読み込みで消える
- Cookie、localStorage、sessionStorage、解析、会話のDB保存を使わない
- OpenAIには `store:false` を指定。API提供者側のログ・保持・データの扱いは別であり、ゼロ保持の保証ではない
- アプリのコードはキー・会話・API応答をログに出さない。Netlify等のプラットフォーム側のアクセスログはその管理範囲
- APIキーはサーバーの環境変数のみ。ブラウザへ渡さない
- リクエスト本文・会話回数・出力を制限。同一オリジン確認、タイムアウト、Netlifyのレート制限を設定
- 外部の大人との対話は先生・学校・保護者を通す。直接連絡・予約・申請送信はない

この改訂で、旧要件の「API通信を使わない」はAI相談に限って変更しました。他の資料機能にはAPI通信は不要です。

## Netlifyの設定

Functionsを含むため、GitHub連携でビルドしてデプロイしてください。静的ファイルだけを手動アップロードしてもAI機能は動きません。

- Repository：`KK0156/reschool-pathmap`
- Branch：`main`
- Build command：`npm run build`
- Publish directory：`dist`
- Functions directory：`netlify/functions`
- `netlify.toml` に上記とCSPを設定。ブラウザは同一サイトのFunctionsへの通信だけを許可

Netlifyの **Project configuration → Environment variables → Add a variable** で、`OPENAI_API_KEY` を登録します。可能ならsecretとして、Functionsから使えるスコープに設定してください。APIキーをこのリポジトリや会話へ貼る必要はありません。

任意で `OPENAI_MODEL=gpt-5-mini` を設定。環境変数を登録・変更したら再デプロイします。公開後、`/.netlify/functions/path-consult` のGETはキーの値を返さず `configured` の真偽だけを返します。設定済みでも、API側の残高・モデル利用権限などは実際の送信で確認が必要です。

`dist` は公開用HTML・CSS・JS・SVGだけをコピーして作ります。Functionsのコード・テスト・README・環境ファイルは公開ディレクトリに含めません。APIキーはビルドにも埋め込みません。

## 元のRE:School v1

`/original.html` から「卒業の、その続きを。」へ戻れます。旧バンドルは使用しますが、保存処理は閲覧中のみのメモリへ置き換え、自由記述欄を非表示・無効化しています。旧画面の移動・再読み込みにも対応。v1にはAI相談を追加していません。

## 参考資料・設計記録

デザインの判断は `DESIGN.md` に記録しています。紙色・紺・明朝体を維持し、参考元の目次・質問ページ・一覧の構造を取り入れています。

- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)
- [Netlify Functions API / rateLimit](https://docs.netlify.com/build/functions/api/)
- [OpenAI Responses API / Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [store:falseとResponses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)

相談メモには24種類の異なるツリー例があります（進路10件・学校での活動6件・研究や制作8件）。すべて送信せず閲覧でき、表示中のツリーの近くから別の例へ切り替えられます。各例は架空の資料で、実際の相談の分析結果ではありません。

ツリーの詳細から見出し・種類・つなぐ先・内容・証拠・リスク・次の行動を書き直し、枝の追加・削除・直前の変更の取り消しができます。編集はメモリ内だけで、サンプルデータは変更しません。相談メモには成績の目安、得意・苦手科目、興味・経験、希望条件、気になることを任意で加えられます。未記入欄は送信せず、送信前にメモと任意欄の全文を確認できます。合計3000文字以内です。編集・任意欄とも保存はせず、再読み込みで消えます。成績は能力や合格可能性の判定には使いません。

ツリーは中心の問いから左右へ枝が伸びるマインドマップ表示です。親子関係を曲線でつなぎ、拡大・縮小・全体表示・中心へ戻る・背景ドラッグ・スマホのスワイプで移動できます。「一覧で読む」へ切り替えても選択と編集内容を保持します。画面全体の横はみ出しを避け、マップの領域内で移動します。
