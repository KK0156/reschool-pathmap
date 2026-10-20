export const treeFeatureView = '<div class="tree-guide"><h2>メモから、相談の準備まで</h2><ol><li>例を選ぶか、メモを書く</li><li>自分で枝を加えるか、接続済みならAIで図にする</li><li>項目を押し、次に調べることを見る</li></ol><p>操作を先に試すなら、下の「ツリーの例を見る」から。入力も送信も必要ありません。</p><button type="button" class="secondary" data-tree-go="memo">自分のメモを書く ↓</button></div><section id="consultation" class="consultation"><div class="section-number">相談メモ</div><h2>今考えていることを書いてください</h2><p>一文から使えます。まとまっていなくても、そのまま書いてください。</p><h3>相談の例から始める</h3><p>一般向けの相談例と、開発者の研究デモを分けています。例から始めても、自分で書いても構いません。</p><div class="sample-prompts" id="sample-prompts" aria-label="相談メモの例"></div>\n<form id="memo-form"><p id="memo-help" role="status">一文でも構いません。迷っていることと、知りたいことを書いてください。</p><label class="memo-label" for="memo">相談メモ</label><textarea id="memo" name="memo" maxlength="3000" rows="8" aria-describedby="privacy-note memo-count memo-error" placeholder="例：好きなことがまだ分からない。何を少し試してみればいいか、先生に聞くことも整理したい。"></textarea><div class="memo-footer"><span id="memo-count">0 / 3000文字</span><button type="button" id="clear-all" class="text-button">入力とツリーを消す</button></div>\n<aside id="privacy-note" class="privacy"><b>名前・学校名・連絡先は書かないでください。自動保存はしません。</b><details><summary>送信と保存について</summary><p>AI生成のときだけ、確認したメモと任意欄をOpenAIへ送ります。サイトに相談を保存する機能はなく、API提供者側のデータの扱いは別です。出典を検索・確認する機能はありません。図は自分の操作でファイルに保存できます。</p></details><label class="consent"><input id="send-consent" type="checkbox"> 任意欄を含む送信内容を確認し、AIサービスへ送ることを確認しました</label></aside><p id="memo-error" role="alert"></p><p id="ai-availability" role="status">AIの接続状態を確認しています。入力せず例を見る・自分で作る操作は使えます。</p><div class="actions"><button id="generate" type="submit" class="primary" disabled aria-describedby="ai-availability">AIで相談を図にする</button><button type="button" id="manual-from-memo" class="secondary">このメモから、自分で図を作る</button><button id="sample-without-api" type="button" class="secondary">入力せず、例の図を見る</button></div></form></section>\n<section id="mind-tree" class="mind-tree" tabindex="-1"><div class="section-number">マインドツリー</div><h2>相談を整理した図</h2><p>四角い項目を押すと、内容や次に調べることが表示されます。「この項目を書き直す」で編集したり、枝を追加・削除したりできます。</p><div id="tree-status" class="status" role="status" aria-live="polite"></div><div class="tree-example-switch"><label for="tree-example">別のツリーの例を見る</label><select id="tree-example"></select><button type="button" class="secondary" id="preview-tree-example">選んだ例を見る</button></div><div id="tree-empty" class="empty"><p>まだ図はありません。メモから自分で作るか、相談例を選ぶと、ここに表示されます。</p></div><div id="map-workspace" class="map-workspace" hidden><div class="tree-board"><div id="tree-overview"></div><details class="legend-guide"><summary>項目の種類と意味</summary><div id="tree-legend" class="legend" aria-label="項目の種類"></div></details><div id="tree-container"></div></div><aside id="node-detail" class="node-detail" aria-live="polite" tabindex="-1" aria-label="選んだ項目の詳細"></aside></div></section>\n<div class="tree-next"><button type="button" class="secondary" data-tree-go="memo">メモに戻って考え直す</button><button type="button" class="secondary" data-tree-go="summaries">次に調べることを見る ↓</button></div><section id="summaries" class="summaries" tabindex="-1"><div class="section-number">まとめ</div><h2>先生や保護者に見せる相談メモ</h2><p>ここに表示するのは整理用の草案です。活動実績や証拠として使う前に、自分で確認してください。</p><div id="summary-content" class="summary-grid"><p>ツリーを作ると、研究の問い、次の行動、確認する証拠をまとめて読めます。</p></div></section>\n';

// The student-facing workspace is intentionally separate from the retained
// prototype's full consultation form. Shared IDs preserve editing/file safety.
export const studentTreeFeatureView = `
<section class="student-example-start" id="student-example-start" aria-labelledby="student-examples-title">
  <h2 id="student-examples-title">近い相談を選んで、試してみる</h2>
  <p>すべて架空の例です。押すと編集できる図が開きます。AIへの接続や入力は必要ありません。</p>
  <div id="sample-prompts" class="student-sample-prompts" aria-label="高校生向けの相談例"></div>
</section>
<details id="consultation" class="consultation student-memo-drawer">
  <summary>自分の相談を書いて始める</summary>
  <div class="tree-guide"><p>書いたメモから自分で枝を作れます。AIを使う場合も、送信前に内容を確認します。</p></div>
  <form id="memo-form">
    <p id="memo-help" role="status">迷っていることと、知りたいことを一文から書けます。</p>
    <label class="memo-label" for="memo">相談メモ</label>
    <textarea id="memo" name="memo" maxlength="3000" rows="4" aria-describedby="privacy-note memo-count memo-error" placeholder="例：数学は好きだけど、理系に進むか迷っている。授業や学部の違いを比べたい。"></textarea>
    <div class="memo-footer"><span id="memo-count">0 / 3000文字</span><button type="button" id="clear-all" class="text-button">入力とツリーを消す</button></div>
    <aside id="privacy-note" class="privacy"><b>名前・学校名・連絡先は書かないでください。自動保存はしません。</b><details><summary>送信と保存について</summary><p>AI生成のときだけ、確認したメモと任意欄をOpenAIへ送ります。図は端末へJSONで保存できます。API提供者側のログ等の扱いは、提供者の規約に従います。</p></details><label class="consent"><input id="send-consent" type="checkbox"> 送信内容を確認し、AIサービスへ送ることに同意します</label></aside>
    <p id="memo-error" role="alert"></p><p id="ai-availability" role="status">AIの接続状態を確認しています。相談例・編集・保存は接続なしで使えます。</p>
    <div class="actions"><button id="generate" type="submit" class="primary" disabled aria-describedby="ai-availability">AIで相談を図にする</button><button type="button" id="manual-from-memo" class="secondary">このメモから自分で作る</button><button id="sample-without-api" type="button" class="secondary">相談例の図を見る</button></div>
  </form>
</details>
<section id="mind-tree" class="mind-tree student-mind-tree" tabindex="-1">
  <div class="student-workspace-heading"><div><span class="section-number">考える・書き直す</span><h2>選択肢を比べる図</h2></div><button type="button" class="secondary" data-show-student-examples>別の相談例を選ぶ</button></div>
  <div id="tree-status" class="status" role="status" aria-live="polite"></div>
  <div id="tree-empty" class="empty"><p>上の相談例を押すと、完成した図をすぐに開けます。自分の言葉に変えながら使ってみてください。</p></div>
  <div id="map-workspace" class="map-workspace" hidden>
    <div class="tree-board"><div id="tree-overview"></div><p class="student-map-hint">項目を押すと、内容を読んだり書き直したりできます。下のキャンバスは余白をドラッグして移動。「全体を見る」で枝の全体像を確認できます。</p><div id="tree-container"></div><details class="legend-guide"><summary>色と項目の種類</summary><div id="tree-legend" class="legend" aria-label="項目の種類"></div></details></div>
    <aside id="node-detail" class="node-detail" aria-live="polite" tabindex="-1" aria-label="選んだ項目の詳細"></aside>
  </div>
</section>
<div class="tree-next"><button type="button" class="secondary" data-tree-go="memo">相談メモを書く・書き直す</button><button type="button" class="secondary" data-tree-go="next-step-form">次に調べることを決める ↓</button></div>
<section id="summaries" class="summaries" tabindex="-1"><span class="section-number">持ち帰る</span><h2>先生や保護者に見せる相談メモ</h2><p>確認したことと、まだ分からないことを分けて話すためのメモです。</p><div id="summary-content" class="summary-grid"><p>例を開くか、自分で図を作ると表示されます。</p></div></section>
`;
