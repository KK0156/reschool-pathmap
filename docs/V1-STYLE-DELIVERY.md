# RE:School v1のスタイル配信を単独で完結させる

2026-10-20。対象は旧v1の`original.html`。RE:Treeや保存版Path Mapの画面構成は変更していません。

## 観察と確認できる範囲

ユーザー提供の画面では、v1の本文・ナビゲーションは表示されていても、元の色・余白・文字組みが適用されていませんでした。案内文も修正前のものでした。

GitHubの`main`上のHTML・CSSをContents APIから取得すると、ローカルの修正ファイルと一致しました。ただしユーザーのCodespacesには直接アクセスできないため、そのサーバーのファイルやHTTP応答は確認できていません。自動更新の設定、配信元、表示が古い理由を確定したものではありません。

今回の変更は、更新後のHTMLが配信されたときに、外部CSSの取得・キャッシュに左右されず当時のデザインが表示されるようにする対策です。古いHTMLを配信し続けるサーバーを遠隔修正するものではありません。

## 変更

- `original.html`に、保持しているv1のCSSとアーカイブの補助CSSをそのまま埋め込みました。外部スタイルシートへのリンクを取り除き、旧Reactバンドルと表示専用の入力欄は維持しています。
- `scripts/embed-v1-styles.mjs`で、元のCSSファイルから埋め込みを再生成できます。`--check`は不一致を検出して失敗し、ファイルを書き換えません。
- `package.json`に`archive:styles`を追加。ビルドの前に埋め込みが元のCSSと一致するか確認します。
- `README.md`のv1の説明を更新しました。
- `tests/v1-style-delivery-browser.py`は外部スタイルシートをすべて遮断し、当時の配色・見出し・ボタン・ナビゲーションが表示されることを検証します。

元のCSSファイル・旧バンドルは削除・改変していません。外部フォントやAPIの追加もありません。既存のCSPで許可されているインラインスタイルを使い、CSP自体は変更していません。

## 検証

- `npm test`：54件成功。
- `npm run build`：成功。
- 一時コピーで生成・再実行の冪等性を確認。元CSSを変更すると`--check`が失敗し、HTMLを上書きしないこと、明示的な再生成後に一致することを確認しました。
- `python tests/browser.py`：保存版の6画面、v1の遷移・再読み込み・表示専用入力欄、保存なし、CSP、キーボード操作が成功。
- `python tests/archive-design-browser.py`：ChromiumとWebKitの320／390／768／1024／1440pxで、元のデザイン・画像・リンク・横はみ出しなしを確認。
- `python tests/v1-style-delivery-browser.py`：ChromiumとWebKitの320／768／1024pxで、外部CSSをすべて遮断しても元の色・見出し・ナビ・ボタンを維持。元の画面への遷移、表示専用フォームと再読み込み、CSP、保存なしを確認。スタイルシート・外部サイト・AIへのリクエストは0件でした。

CSS遮断テストのスクリーンショットと監査JSONは`/workspace/reschool-v1-delivery-review/`に保存します。通常の描画確認は`/workspace/reschool-archive-review/after/`です。

WebKitの検証は実機iPad/Safariの確認ではありません。公開先・ユーザーのCodespacesでの表示復旧は未確認です。Netlifyへの手動デプロイ、有料AIへのリクエスト、実在の生徒情報の取得は行っていません。
