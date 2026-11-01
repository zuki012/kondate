# 今週なに食べよ（kondate）

- Vercel（Hobbyプラン）でホスティング。main への push で自動公開される
- Hobbyプランの非公開リポジトリは、コミットの作者がリポジトリの持ち主でないと自動公開が止まる。コミットは必ず `--author="zuki012 <341704653+zuki012@users.noreply.github.com>"` で作る
- 買い出しリストは「買い出しリスト履歴（アプリ用）」DB（同ページ下に自動作成）に保存
- ワークスペース（コード上は household＝世帯）ごとに合言葉が分かれる。画面では「ワークスペース」と呼ぶ。APP_PASSWORD＝持ち主（Kazuki家、データはNotion）。友達の世帯は設定画面から追加し、献立・履歴はUpstash Redis（KV_REST_API_URL / KV_REST_API_TOKEN、東京リージョン）に保存。友達にはNotionのレシピを見せない
- 環境変数：NOTION_TOKEN / ANTHROPIC_API_KEY / APP_PASSWORD / KV_REST_API_URL / KV_REST_API_TOKEN（任意で NOTION_RECIPE_DB_ID, NOTION_PARENT_PAGE_ID, CLAUDE_MODEL）
- Vercel Hobbyは関数（api/*.js）が12個まで
- レシピDBは「レシピ記録」ページ内の段組みの中にある。献立は同ページ下の「献立カレンダー（アプリ用）」DBに保存
- 利用者はプログラミング未経験。説明は日本語で、専門用語を避ける
