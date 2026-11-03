# 今週なに食べよ（kondate）

- Vercel（Hobbyプラン）でホスティング。main への push で自動公開される
- Hobbyプランの非公開リポジトリは、コミットの作者がリポジトリの持ち主でないと自動公開が止まる。コミットは必ず `--author="zuki012 <341704653+zuki012@users.noreply.github.com>"` で作る
- 買い出しリストは「買い出しリスト履歴（アプリ用）」DB（同ページ下に自動作成）に保存
- ワークスペース（コード上は household＝世帯）ごとに合言葉が分かれる。画面では「ワークスペース」と呼ぶ。APP_PASSWORD＝持ち主（Kazuki家、データはNotion）。友達のワークスペースは設定画面で作って招待リンクを送り、友達が自分で合言葉を決める（持ち主には合言葉は見えない）。献立・履歴はUpstash Redis（KV_REST_API_URL / KV_REST_API_TOKEN、東京リージョン）に保存。友達にはNotionのレシピを見せない
- 環境変数：NOTION_TOKEN / ANTHROPIC_API_KEY / APP_PASSWORD / KV_REST_API_URL / KV_REST_API_TOKEN（任意で NOTION_RECIPE_DB_ID, NOTION_PARENT_PAGE_ID, CLAUDE_MODEL）
- 買い出しリスト：AIは材料を「食材名・数・単位」に読み取るだけ（lib/shopping.js）。倍率（決まり：献立に1つ登録＝1人分。倍率＝人数×登録回数÷元レシピの人数。人数が書いていなければ2人分とみなす。beettoは servings を使う）、単位換算（大さじ15ml等）、合算、表示はプログラム（lib/quantity.js）。読み取り結果はUpstashに保存して再利用（lib/parsecache.js、ルールを変えたら VERSION を上げる）
- Vercel Hobbyは関数（api/*.js）が12個まで
- レシピDBは「レシピ記録」ページ内の段組みの中にある。献立は同ページ下の「献立カレンダー（アプリ用）」DBに保存
- 利用者はプログラミング未経験。説明は日本語で、専門用語を避ける
