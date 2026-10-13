# 献立帳（kondate）

- Vercel（Hobbyプラン）でホスティング。main への push で自動公開される
- Hobbyプランの非公開リポジトリは、コミットの作者がリポジトリの持ち主でないと自動公開が止まる。コミットは必ず `--author="zuki012 <341704653+zuki012@users.noreply.github.com>"` で作る
- 環境変数：NOTION_TOKEN / ANTHROPIC_API_KEY / APP_PASSWORD（任意で NOTION_RECIPE_DB_ID, NOTION_PARENT_PAGE_ID, CLAUDE_MODEL）
- レシピDBは「レシピ記録」ページ内の段組みの中にある。献立は同ページ下の「献立カレンダー（アプリ用）」DBに保存
- 利用者はプログラミング未経験。説明は日本語で、専門用語を避ける
