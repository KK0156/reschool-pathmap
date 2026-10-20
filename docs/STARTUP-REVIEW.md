# 起動時の白画面への対策と検証

確認日：2026-10-20。対象：Phase 3 の main `5afa7a7` と、その後の起動処理の修正。

## 確認できたことと、確認できなかったこと

- 報告された画像では、Codespaces のポート8000のプレビューが白画面になっている。
- 同じプレビューの `/`、`/index.html`、`/reschool.html` をこちらから取得すると、GitHub の `pf-signin` に転送される。アプリのHTMLを取得できていないため、利用者のログイン済みセッションで返された内容やエラーは検証できない。
- push済み `5afa7a7` は、ローカルでは通常起動した。起動エラーだけでなく、認証・転送・配信の問題も区別する必要がある。画像だけで原因を断定していない。
- アプリ側には、最初の `#root` が空で、モジュールの読み込みが失敗すると案内も出ない問題があった。今回の修正はこの問題への対策であり、非公開Codespacesの接続を修復できたという報告ではない。

## 改善

1. `index.html` に、JavaScriptが起動しなくても読める紹介と保存版へのリンクを置いた。最低限のスタイルも同じHTMLに含めた。
2. `src/bootstrap.js` でアプリの読み込みを待ち、失敗時や12秒を超える待機時に案内を表示する。再読み込みは利用者が押した場合だけ行う。
3. 途中まで表示された入力欄をエラー処理で消さない。再読み込みで入力が消える場合は確認し、キャンセルできる。
4. 診断表示には版・状態・限定したエラー種別だけを使う。相談内容・例外本文・スタックトレースを保存・送信しない。
5. 読み込み中に「本文へ移動」を押した際の `#main` を、未知の画面として扱わない。アプリ表示後も本文へフォーカスを引き継ぐ。

既存の研究内容、保存版のデザイン、AI Functions、JSON形式は変更していない。Netlifyの手動デプロイ、有料APIの呼び出しは行っていない。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `index.html` | 静的な起動画面と起動モジュールへの切り替え |
| `src/bootstrap.js` | 読み込みエラー・待機・利用者による再試行・早期skip linkへの対応 |
| `src/desk-app.js` | 読み込み中の `#main` の扱い |
| `tests/startup-browser.py` | 起動の正常系・故障注入・入力維持・早期skip linkの確認 |
| `tests/phase3-browser.py` | 通常画面のキーボード検証でアプリの表示完了を待つ |
| `tests/research-desk-browser.py` | 最初のナビゲーションの表示完了を待つ |
| `tests/workflow-recovery-browser.py` | 固定の画面内座標に代え、図と中心ノードが実際に見えることを検証 |
| `docs/STARTUP-REVIEW.md` | 検証記録と限界 |

## 実行した検証

- `npm test`：61件成功。
- `npm run build`：成功。旧v1のスタイル検査も成功。
- `git diff --check`：成功。
- `python tests/phase3-browser.py`：Chromium・WebKitで成功。相談例から編集・追加・削除・Undo・次の行動・JSON保存・再読み込み・復元、8つの入口、事例からツリー、13章、保存版、キーボード、320 / 390 / 768 / 1024 / 1440pxを再確認した。Chromiumのタッチ模擬操作も成功した。
- `python tests/startup-browser.py`：起動の正常系と故障注入をChromium・WebKitで実行した。最終件数は下記の配布版確認に記録する。
- 追加の既存回帰 `research-desk-browser.py`、`workflow-recovery-browser.py`、`phase2-ai-browser.py`、`tree-files-browser.py`、`phase2-journey-browser.py`：成功。最後のjourneyはChromium・WebKitの両方で成功。
- ビルドした `dist` をポート8004で静的配信し、同じ起動テストを再実行した（結果は下記の配布版確認を参照）。

故障注入はローカルの架空データだけを使った。AI設定照会は未設定としてモックし、外部通信・POST・Cookie・localStorage・sessionStorage・CSP違反がないことを起動テストで確認した。

初回のブラウザ回帰では、アプリ表示前にナビゲーション件数を確認するテストと、「図の上端が500px未満」という旧レイアウトに依存するテストが失敗した。前者は表示完了を待ち、後者は図と中心ノードが画面内で見えることを検証するよう修正した。通常のコマンドで再実行し、成功を確認した。早期skip linkはテストの待機だけで済ませず、実際の起動競合も修正して別シナリオで検証した。

## 画像と結果

- 既存版の切り分け：`/workspace/reschool-blank-screen-review/`
- 起動画面・エラー・復旧：`/workspace/reschool-startup-review/`
- 最終配布版の起動テスト・画像：`/workspace/reschool-startup-dist-review/`
- Phase 3 再確認の各画面・5幅：`/workspace/reschool-startup-review/phase3/`

エラー案内と通常ホームの画像を実際に開いて、文字・ボタン・リンクが読めることを確認した。

## 残る限界

- 利用者の非公開Codespacesの表示が直ったかは確認できていない。認証画面や転送経路の問題は、このアプリの起動処理では直せない。
- HTMLそのものが届かない場合、HTML内の案内も表示できない。
- CSSの遮断・失敗は検証したが、描画を妨げるCSS接続が無期限に保留する場合は検証していない。
- WebKitとタッチ模擬操作の結果は、利用者の実機iPad・ログイン済みChromeの検証を代替しない。
- 実利用者による使いやすさや教育効果を測定したものではない。

## 配布版確認

最終の `dist` を `http://localhost:8004` で静的配信し、以下を実行した。

```sh
STARTUP_BASE_URL=http://localhost:8004 STARTUP_SCREENSHOT_DIR=/workspace/reschool-startup-dist-review python tests/startup-browser.py
```

Chromium・WebKitで各10件、計20件が成功した。結果は `/workspace/reschool-startup-dist-review/startup-audit.json`。通常起動、早期skip link、実際の12秒の待機案内から復旧、待機後の部分描画エラーと再試行キャンセル、404後の再試行、importエラー、実行エラー、部分描画直後のエラー、CSS遮断、全スクリプト・CSS遮断を確認した。

WebKitでは、モジュール通信を意図的に保留している間、Playwrightのスクリーンショットが `document.fonts.ready` を待って完了しない制約があった。待機中の案内・状態・操作は検証し、画像は保留解除後に撮影した。Chromiumでは待機中の画像も保存した。この制約を、利用者の実機で待機画面を撮影できたという結果に置き換えていない。
