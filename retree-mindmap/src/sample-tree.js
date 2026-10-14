export const samplePrompts = [
 {label:'RE:SchoolとROOTSをどうつなげる？',memo:'教育に興味があるけど、RE:School、ROOTS、AI半DXのどれを中心にすればいいか分からない。CoD出願にもつなげたい。今まで日米の教育機会差、卒業生ネットワーク、先生の負担、保育園の新聞資料、AIで現場の負担を減らす話を調べてきた。選択肢を整理して、次に何をすべきか見えるようにしたい。'},
 {label:'CoD出願でどの活動を中心にすべき？',memo:'CoD出願で、RE:School、ROOTS、AI半DXのどの活動を中心に説明するか迷っている。作った試作品と調べた資料を分けて、まだ実証できていない部分や、次に確かめることも整理したい。'},
 {label:'AI半DXと教育研究は関係ある？',memo:'人の判断を残しながら、現場の負担を減らすAI半DXに関心がある。教育や保育の研究とどうつながるのか、共通点だけでなく違いや無理がある点も整理したい。'},
 {label:'自分の問題意識を整理したい',memo:'関心のあることが複数あり、一つの研究テーマにまとめられていない。何が気になっているのか、どの経験や資料が関係するのか、まだ何を確認する必要があるのかを整理したい。'}
];
export const sampleTree = {
 core_question:'閉じた安全を、どう開かれた安全に変えるか？',
 summary:'RE:School、ROOTS、AI半DX、CoD出願を、共通する問いで整理したサンプルです。AIは答えを決めるのではなく、選択肢・証拠・リスク・次の行動を見える形にします。',
 nodes:[
 {id:'root',parent:null,label:'閉じた安全を、開かれた安全に変える',type:'core_question',detail:'学校・保育・AI活用に共通する中心問い。',evidence:'RE:School、ROOTS、AI半DXの研究ログ。',risk:'テーマが広がりすぎる可能性。',next_action:'中心問いを1文で固定する。'},
 {id:'reschool',parent:'root',label:'RE:School',type:'project',detail:'学校外の資源を生徒の機会に変える研究。',evidence:'日米教育機会差、アンケート、GitHub試作。',risk:'アルムナイに限定しすぎる危険。',next_action:'Choice Mapとして再整理する。'},
 {id:'roots',parent:'root',label:'ROOTS',type:'project',detail:'保育・病児保育・発達支援・保護者支援を地域の支えとして見る研究。',evidence:'新聞原資料、祖母の保育園、家族史。',risk:'教育プロジェクトとの接続を説明する必要がある。',next_action:'RE:Schoolとの共通問いを1文で書く。'},
 {id:'ai-semidX',parent:'root',label:'AI半DX',type:'project',detail:'人間の判断を残しながら、現場の認知負荷を減らすAI活用。',evidence:'業務改善デモ、発注・在庫・シフトの問題意識。',risk:'教育・保育との接続が薄く見える可能性。',next_action:'AIを翻訳装置として位置づける。'},
 {id:'cod',parent:'root',label:'CoD Portfolio',type:'output',detail:'活動3件、Essay、Interviewで研究の変遷を見せる。',evidence:'PDF、GitHub、アンケート、新聞分析。',risk:'大きく見せすぎると実証不足になる。',next_action:'100語活動説明とSupporting Evidenceを整理する。'},
 {id:'reschool-risk',parent:'reschool',label:'アルムナイに限定しすぎる',type:'risk',detail:'RE:Schoolを卒業生ネットワークだけに限定すると、より広い選択肢可視化の問題を見失う。',evidence:'既存の高校アルムナイサービス調査。',risk:'既存サービスとの差が弱くなる。',next_action:'RE:SchoolをRE:Tree内の一枝として位置づける。'},
 {id:'teacher-workload',parent:'reschool',label:'先生の負担',type:'risk',detail:'外部機会を増やす仕組みが、先生の探索・連絡・日程調整を増やすと失敗する。',evidence:'先生との対話、教員負担調査。',risk:'RE:School自体が先生の負担を増やす可能性。',next_action:'先生に、外部機会を受け入れる時の実際の作業を聞く。'},
 {id:'roots-common-question',parent:'roots',label:'支える側の負担',type:'evidence',detail:'保育園・病児保育・発達支援も、支援される側だけでなく支える側の負担を考える必要がある。',evidence:'新聞原資料、ROOTS分析。',risk:'RE:Schoolとの接続が抽象的になりすぎる。',next_action:'保育と高校教育の共通構造を比較表にする。'},
 {id:'ai-role',parent:'ai-semidX',label:'AIは答えではなく翻訳装置',type:'evidence',detail:'AIは判断を置き換えるのではなく、曖昧な相談を問い・証拠・リスク・次の行動に翻訳する。',evidence:'AI半DX、RE:Treeの設計方針。',risk:'AI診断のように見えると危険。',next_action:'UIで「AIは決めない」と明示する。'},
 {id:'next-action',parent:'root',label:'次の一歩',type:'action',detail:'RE:Tree v0.1を静的サンプルで作り、マインドツリー体験が本当に役に立つか確認する。',evidence:'現在の設計会話。',risk:'最初からAPIや保存機能を作りすぎると本質を見失う。',next_action:'サンプルJSON → ツリー表示 → AI接続の順で作る。'}
 ]
};
