# 三号 / デザインの検討記録

## ねらい

進路室で手渡されるノート、卒業生からの手紙、面談の前に読むメモ、研究途中のファイルをイメージした個人の研究・デザイン試作品。急いで一つに決めさせず、まだ閉じない道を残す。

## 今回の変更

- ナビゲーションは日本語の目次に。RE:School / Path Mapを冊子の表題として残す
- トップは一通の手紙。v1「卒業の、その続きを。」との関係を記す
- 探索は紙のメモに印をつけるような選択肢。迷う場合は選択せず記録を読む入口も置く
- 道のカードは色面付きの商品カードから番号付きのファイル一覧へ。重なる手がかりを文章で添える
- 卒業生事例は宛名・転機・署名のある手紙へ。架空の記録だと毎回明示する
- 学校の集計は大きなKPIや棒グラフから授業を検討するための帳面へ。実測との混同を避ける
- 安全説明は「安心して考えるための約束」。禁止の列挙ではなく、学校と一緒に対話する順序を書く
- 研究ページで、仮説と未検証の点、v1からの発展、次に確かめることを分ける

## 共通のルール

本文は15px以上を基本とし、補足でも13pxを中心にする。紙色・濃紺・青みの灰色・薄い罫線、くすんだ緑と金色の線を使用。影・グラデーション・光る演出は使わない。見出しは端末の明朝体、本文はゴシック。外部フォントは使わない。

道の記録、手紙、対話の問い、約束、研究メモを同じ余白・罫線・文体で表示する。選択状態は色だけでなく入力のチェック、文字、下線、aria属性で伝える。操作の対象はおおむね44px以上を確保する。キーボードフォーカスは残し、比較・絞り込み後のフォーカスを保つ。印刷時は案内を減らして対話の資料を残す。

## 参考にした考え方

以下は情報設計・文体・アクセシビリティを考える資料。各ブランドの見た目、ロゴ、コンポーネント素材は複製していない。

- [LINE Design System](https://designsystem.line.me/)：日常の中で自然に使う人との距離を考える
- [PayPay App Style Guide](https://app-style-guide.paypay.ne.jp/)：操作の行き先を明確にする。商用の強い色やCTAは採用しない
- [SmartHR Design System](https://smarthr.design/)：分かりやすい言葉と、迷わず使える情報構造を考える
- [デジタル庁デザインシステム](https://www.digital.go.jp/policies/servicedesign/designsystem)：公共の場での信頼とアクセシビリティを考える
- [freeeアクセシビリティー・ガイドライン](https://a11y-guidelines.freee.co.jp/)：色以外の手がかり、入力、文字、操作を確認する
- [GOV.UK Design System](https://design-system.service.gov.uk/) / [Brand Guidelines](https://brand.design-system.service.gov.uk/introduction/)：簡潔で落ち着いた案内、明確な操作の意味を考える
- [Home Office Voice and Tone](https://design.homeoffice.gov.uk/design-and-content/content/voice-and-tone)：自然で尊重のある、分かりやすい言葉を考える
- [IBM Carbon Accessibility](https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/overview)：複数画面にまたがる情報構造とアクセシビリティを考える
- [Atlassian Design](https://atlassian.design/)：画面ごとの一貫した言葉と操作を考える

## 研究として残る問い

この静かな見せ方で、どこを押せばよいか伝わるか。印をつける選択肢が、答えを求められる感覚を生まないか。架空の手紙でも、経験の変化を考えるきっかけになるか。学校を通す順序が、生徒と先生の両方に理解されるか。これらは今後の学校での試用で確かめる課題であり、この改修で効果を証明したものではない。
