// 買い出しリスト：レシピの材料をClaude APIに読ませて合算する
export const STAPLES = "塩、砂糖、しょうゆ、薄口しょうゆ、酒、みりん、酢、米酢、黒酢、こしょう、サラダ油（香りのない油）、ごま油、オリーブ油、揚げ油、片栗粉、薄力粉、小麦粉、パン粉、鶏がらスープの素、コンソメ、白だし、めんつゆ、だし汁、味噌、マヨネーズ、ケチャップ、中濃ソース、オイスターソース、ポン酢、豆板醤、コチュジャン、ナンプラー、ラー油、白ごま、すりごま、練りごま、カレー粉、唐辛子、一味唐辛子、七味唐辛子、白ワインビネガー、はちみつ、粉チーズ、米";
export const CATS = ["野菜・果物", "きのこ", "肉", "魚介", "卵・乳製品", "豆腐・大豆製品", "主食・麺", "乾物・缶詰", "調味料・スパイス", "その他"];

export function buildPrompt(recipes, people, memos = []) {
  const blocks = recipes.map((r, n) =>
    `### ${n + 1}. ${r.name}（${r.count}回分）\n${r.note ? `★このレシピの指示: ${r.note}\n` : ""}材料の基準: ${r.base || "記載なし（2人分とみなす）"}\n${r.ingredients || "（材料の記載なし）"}`
  ).join("\n\n");
  // メモ（レシピではない書き込み）。食材名・料理名・分量がアバウトに混ざっている
  const memoBlock = memos.length
    ? `\n\n### メモ（レシピではない書き込み）\n${memos.map((m) => `- ${m.name}${m.count > 1 ? `（${m.count}回分）` : ""}`).join("\n")}`
    : "";
  return `あなたは共働き夫婦の買い出しリストを作るアシスタントです。以下のレシピを、それぞれ「${people}人分 × 回数」作ります。各レシピの材料（Notionに書かれた元の表記）を渡します。

ルール:
- 各レシピの分量を${people}人分に換算してから回数分を掛ける。基準の記載がなければ2人分とみなす。「1食分」「2食分」は1人分・2人分と同じ意味として換算する。「2合分」「8個分」「まとめて1回作る分」など人数でない基準は、そのまま1回分として扱う。
- 同じ食材は1行にまとめて合算する。表記ゆれは統一する（生姜→しょうが、醤油→しょうゆ、葱→ねぎ など）。切り方や下ごしらえ（みじん切り、すりおろし）は合算の妨げにしない。
- 単位が違って足せないときは「200g＋1/2個」のように併記する。範囲（1〜2個）は多い方で数える。買う単位として自然な目安にする（例：玉ねぎ 1と1/2個、豚バラ薄切り肉 約300g、大葉 10枚）。
- 水・湯・ゆで汁・氷・下ごしらえの途中でできる物・道具は出さない。
- 同じレシピの中で、すでに挙がっている食材の一部分（例：「長ねぎの青い部分」「にんじんの皮」「大根の葉」「だしをとった後の昆布」）は、本体を買えば手に入るので数えない。本体がそのレシピに出てこないときだけ数える。
- 「葱油」「たれ」「ソース」など、レシピの中で作ってその一部を使う調味料の材料は、人数や回数で増やさず1回作る分で数える。
- 「AまたはB」はAを採用し、noteに「Bでも可」と書く。「好みで」「あれば」の食材はnoteに「好みで」と書く。
- 次の常備品は buy に入れず check に入れる（分量は不要）: ${STAPLES}
- buy の category は次から選ぶ: ${CATS.join(" / ")}
- recipes には、その食材を使うレシピ名を入れる。
- 「★このレシピの指示」があるレシピは、指示に合わせて材料を絞り込む・変える。例：「ピーマンの春巻きだけ」なら、ほかの種類（とうもろこしの春巻きなど）の材料は出さない。「ツナ抜き」ならツナを出さない。「半量」なら半分にする。指示に出てくる食材が材料にない場合は、指示を優先してその食材を加える。
- 「メモ」は献立表に手で書いた短い書き込みで、分量がない・アバウト・誤字があることがあり、1件に複数の食材が書かれていることもある。1つずつ次のように扱う。
  - 食材名なら買う。分量が書いてあればその分量を使い（回数分は掛ける、人数では増やさない）、なければ${people}人で使うのに一般的な買う単位（例：キャベツ 1/2玉、納豆 1パック（3個入り）、卵 1パック）にして、noteに「メモより・分量は目安」と書く。
  - 料理名（例：納豆ごはん、冷奴、味噌汁）なら、その料理に必要な主な食材を${people}人分×回数で出し、noteに「メモより・分量は目安」と書く。
  - 誤字や崩れた表記は一般的な食材名に直す。「外食」「残り物」「作り置き」「冷凍ストック」など、買い物が要らないものは何も出さない。
  - メモから出した食材の recipes には「メモ：（書き込みそのまま）」を入れる。常備品に当たる食材は check に入れる。
- レシピサイトのページから切り出した材料には、材料以外の文章（見出しや作り方の一部など）が混ざっていることがある。材料以外は無視する。

出力はJSONだけ（前後に説明文を付けない）:
{"buy":[{"category":"","items":[{"name":"","amount":"","note":"","recipes":[""]}]}],"check":[{"name":"","recipes":[""]}]}

---
${blocks}${memoBlock}`;
}

export function parseJsonLoose(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AIの返答にJSONが見つかりません");
  return JSON.parse(text.slice(s, e + 1));
}

// Claude APIを呼んで、返答の文章をそのまま返す（content は文字列か、画像を含む配列）
export async function askClaudeRaw(content, maxTokens = 4000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Claude API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

export async function askClaude(prompt) {
  return parseJsonLoose(await askClaudeRaw(prompt));
}
