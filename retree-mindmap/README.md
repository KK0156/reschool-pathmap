# RE:Tree v0.1

RE:Schoolを一つの枝として含む、研究テーマ・選択肢・資料・リスク・次の行動を整理するResearch Mapping Prototype。

RE:Treeは、RE:Schoolの `/#/finder` にある「相談メモをツリーに整理する」機能として組み込まれています。公開トップはRE:Schoolです。`/retree-mindmap/` は開発用の単独プレビューで、通常の利用導線には置いていません。

## 使い方

相談メモを書く、または四つのサンプル文を選ぶ → 外部AIへの送信を確認 → 「AIでマインドツリー化」 → ノードを選ぶ → 詳細・証拠・リスク・次の行動を読む → 研究の問い・概要・次の計画・CoD草案・証拠リストを確認。

入力は3000文字以内。個人情報は入力しません。保存・ログイン・DB・ブラウザストレージ・Cookie・解析・ファイルアップロード・共有・PDF出力はありません。入力と表示はブラウザのメモリだけにあり、消去・再読み込みで消えます。

AI未設定・接続失敗・不正なJSONの場合は、サンプルであることを明示して指定の10ノードのツリーを表示します。サンプルの資料名は、存在や検証済みの事実を示しません。サンプルはユーザーのメモを分析した結果ではありません。

## 起動

このフォルダは `KK0156/reschool-pathmap` 内に組み込まれています。リポジトリのルートで実行してください。

```sh
npm start
npm test
npm run build
```

ブラウザ検証は `PATH_MAP_PORT=8002 npm start` で起動後、ルートで `python tests/tree-browser.py` を実行します。Python Playwrightと `/usr/bin/chromium` が必要です。APIの成功応答はテスト用JSONで検証し、実際のモデルの内容や品質を検証したものではありません。

## AIの構成

ブラウザ → `/.netlify/functions/generate-tree` → OpenAI Responses API → JSON検証 → ツリー表示。

サーバー側の `OPENAI_API_KEY` を使います。モデルは `OPENAI_TREE_MODEL`、次に `OPENAI_MODEL`、未設定なら `gpt-4.1-mini`。フロントエンドへキーを渡しません。`store:false` を指定し、アプリはメモや応答をログに記録しません。ただしAPI提供者・ホスティング側のログや保持は別の管理範囲で、ゼロ保持を保証するものではありません。

NetlifyはGitHubからのビルドでFunctionsも配信します。Build：`npm run build`、Publish：`dist`、Functions：`netlify/functions`。静的ファイルの手動アップロードだけではAPIは動きません。環境変数登録後に再デプロイしてください。

## JSON検証

1〜40ノード、IDの一意性、根が一つ、根の種類、親IDの存在、循環・孤立なしを確認します。深さは12以内、各テキスト長も制限。表示はすべてエスケープし、AIのHTMLやリンクを実行しません。入力メモはモデルへのデータとして扱い、メモ内の指示で基本方針を変更しないよう指示します。

AIには未知の事実を作らず「未確認」と書くよう指示していますが、完全な正確性や非断定を保証するものではありません。資料・活動実績・入試・資格等は、人が確認する必要があります。

## ファイル

- `index.html`：日本語の概要、相談メモ、ツリー、詳細、まとめ
- `src/sample-tree.js`：指定サンプルと四つのメモ例
- `src/tree-renderer.js`：JSON検証、階層ツリー、詳細表示、エスケープ
- `src/app.js`：画面内にマウントできる送信・フォールバック・ノード選択・要約・消去の処理
- `src/feature-view.js`：RE:Schoolに組み込む画面
- `src/standalone.js`：開発用の単独プレビュー入口
- `../../src/tree-feature.css`：既存画面のデザインを壊さないスコープ付きCSS
- `src/styles.css`：紙の資料と壁のマップを参考にした表示、モバイル、フォーカス
- `../netlify/functions/generate-tree.js`：サーバー側AI接続
- `../tests/tree.test.js` / `../tests/tree-browser.py`：構造・入力・API・操作の検証
