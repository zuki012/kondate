# わが家の献立帳

Notionのレシピ記録から献立を決め、選んだ期間の買い出しリストをAI（Claude API）で作るサイトです。

## しくみ

- `public/index.html` … スマホで開く画面（献立表・レシピ登録・買い出しモード）
- `api/recipes.js` … Notionのレシピを検索
- `api/plan.js` … 献立をNotionの「献立カレンダー（アプリ用）」に保存・読み込み（初回に自動で作成）
- `api/shopping.js` … 選んだレシピの「材料」をNotionから読み、Claude APIで合算
- `lib/` … Notion・Claude との通信、合言葉チェック

## Vercel に設定する環境変数

| 名前 | 中身 |
|---|---|
| `NOTION_TOKEN` | Notionの連携（インテグレーション）のシークレット |
| `ANTHROPIC_API_KEY` | Claude Console で作ったAPIキー（`sk-ant-`で始まる） |
| `APP_PASSWORD` | サイトを開くときの合言葉（ふたりで決める） |
| `NOTION_RECIPE_DB_ID` | （任意）レシピDBのID。省略時はレシピ記録のレシピDB |
| `CLAUDE_MODEL` | （任意）使うモデル。省略時は `claude-sonnet-5-5` |

## Notion 側の準備

1. ワークスペースのオーナーが https://www.notion.so/profile/integrations で「新しいインテグレーション」を作る（種類は「内部」）
2. 機能で「コンテンツを読み取る」「コンテンツを更新」「コンテンツを挿入」をオンにする
3. 「レシピ記録」ページ右上の「…」→「接続」から、作ったインテグレーションを追加する
4. インテグレーションの「シークレット」を `NOTION_TOKEN` に入れる

レシピ本文の「材料」見出しの下に書かれた行を材料として読みます。見出しが「材料（2人分）」のように人数を含む場合は、その人数を基準に換算します。
