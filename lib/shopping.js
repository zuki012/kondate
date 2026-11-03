// 買い出しリスト：レシピの材料をClaude APIに読ませて合算する
export const STAPLES = "塩、砂糖、しょうゆ、薄口しょうゆ、酒、みりん、酢、米酢、黒酢、こしょう、サラダ油（香りのない油）、ごま油、オリーブ油、揚げ油、片栗粉、薄力粉、小麦粉、パン粉、鶏がらスープの素、コンソメ、白だし、めんつゆ、だし汁、味噌、マヨネーズ、ケチャップ、中濃ソース、オイスターソース、ポン酢、豆板醤、コチュジャン、ナンプラー、ラー油、白ごま、すりごま、練りごま、カレー粉、唐辛子、一味唐辛子、七味唐辛子、白ワインビネガー、はちみつ、粉チーズ、米";
export const CATS = ["野菜・果物", "きのこ", "肉", "魚介", "卵・乳製品", "豆腐・大豆製品", "主食・麺", "乾物・缶詰", "調味料・スパイス", "その他"];

// レシピの基準（例：2食分、2〜3人分、1杯分）から、何人分のレシピかを読む。人数でない基準なら null
export function baseServings(base) {
  const b = String(base || "").normalize("NFKC");
  if (!b.trim()) return 2; // 記載なしは2人分とみなす
  if (/まとめて/.test(b)) return null;
  const m = b.match(/(\d+(?:\.\d+)?)(?:\s*[~〜～-]\s*\d+(?:\.\d+)?)?\s*(人分|人前|食分|杯分|杯|人)/);
  return m ? Number(m[1]) : null;
}

// 材料に掛ける倍率をサイト側で計算する（AIは掛け算を間違えることがあるため）
export function scaleOf(r, people) {
  const n = baseServings(r.base);
  const count = r.count || 1;
  if (!n) return { factor: count, why: `${count}回分（元のレシピは「${r.base}」をそのまま1回分として作る）` };
  const factor = Math.round((people / n) * count * 100) / 100;
  return { factor, why: `${people}人分 × ${count}回 ÷ 元のレシピ${n}人分` };
}

export function buildPrompt(recipes, people, memos = []) {
  const blocks = recipes.map((r, n) => {
    const { factor, why } = scaleOf(r, people);
    return `### ${n + 1}. ${r.name}\n${r.note ? `★このレシピの指示: ${r.note}\n` : ""}元のレシピの量: ${r.base || "記載なし（2人分）"}\n【分量の倍率】×${factor}（${why}）\n${r.ingredients || "（材料の記載なし）"}`;
  }).join("\n\n");
  // メモ（レシピではない書き込み）。食材名・料理名・分量がアバウトに混ざっている
  const memoBlock = memos.length
    ? `\n\n### メモ（レシピではない書き込み）\n${memos.map((m) => `- ${m.name}${m.count > 1 ? `（${m.count}回分）` : ""}`).join("\n")}`
    : "";
  return `あなたは共働き夫婦の買い出しリストを作るアシスタントです。以下のレシピの材料を合算して、${people}人分の買い出しリストを作ります。各レシピの材料（元の表記）と、材料に掛ける倍率を渡します。

ルール:
- 各レシピの材料の分量に、そのレシピの【分量の倍率】を必ず掛けてから合算する。倍率はこちらで人数と回数から計算済みなので、自分で人数換算や回数の掛け算をやり直さない（例：卵 2個・倍率×8 → 卵 16個）。
- 同じ食材は1行にまとめて合算する。表記ゆれは統一する（生姜→しょうが、醤油→しょうゆ、葱→ねぎ など）。切り方や下ごしらえ（みじん切り、すりおろし）は合算の妨げにしない。
- 単位が違って足せないときは「200g＋1/2個」のように併記する。範囲（1〜2個）は多い方で数える。買う単位として自然な目安にする（例：玉ねぎ 1と1/2個、豚バラ薄切り肉 約300g、大葉 10枚）。amount をパックなど買う単位にしたときは、note に実際に使う合計（例：「16個使用」）を書く。
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

結果は指定のJSONの形で返す。buy はカテゴリごとにまとめ、check は常備品の確認リスト。note や recipes が空のときは "" や [] にする。

---
${blocks}${memoBlock}`;
}

export function parseJsonLoose(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AIの返答を読み取れませんでした。もう一度押してみてください");
  return JSON.parse(text.slice(s, e + 1));
}

// 買い出しリストの形。AIにはこの形（構造化出力）で答えさせ、必ずこの形のデータが返るようにする
const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const LIST_SCHEMA = obj({
  buy: { type: "array", items: obj({
    category: str,
    items: { type: "array", items: obj({ name: str, amount: str, note: str, recipes: { type: "array", items: str } }) },
  }) },
  check: { type: "array", items: obj({ name: str, recipes: { type: "array", items: str } }) },
});
export const IMAGE_SCHEMA = obj({ name: str, base: str, ingredients: { type: "string", description: "1行に1つ、「食材名 分量」" } });

async function callClaude(body, { plain = false } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
  // Sonnet 5.5 は何も指定しないと答える前に「考える」時間を取り、その分も max_tokens を使う。
  // 買い出しリストは考え込む必要がないので、最初の考える時間を省く（料金と待ち時間の節約にもなる）
  const thinking = !plain && /sonnet-5-5/.test(model) ? { thinking: { type: "between_tools" } } : {};
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, ...thinking, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Claude API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Claude APIを呼んで、返答の文章をそのまま返す（content は文字列か、画像を含む配列）
export async function askClaudeRaw(content, maxTokens = 4000) {
  const json = await callClaude({ max_tokens: maxTokens, messages: [{ role: "user", content }] });
  return (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

// 決まった形（schema）のデータで答えさせる
export async function askClaudeJson(content, schema, { maxTokens = 8000, example = "" } = {}) {
  let json;
  try {
    json = await callClaude({
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema } },
    });
  } catch (e) {
    if (e.status !== 400) throw e;
    // 指定方法をAPIが受け付けなかったときは、文章でJSONを書かせる従来の方法でもう一度だけ頼む
    console.error("構造化出力が使えなかったので従来の方法で再実行", e.message);
    const tail = `\n\n出力はJSONだけ（前後に説明文を付けない）${example ? `。形の例: ${example}` : ""}`;
    const c2 = typeof content === "string" ? content + tail
      : content.map((b) => (b.type === "text" ? { ...b, text: b.text + tail } : b));
    json = await callClaude({ max_tokens: Math.max(maxTokens, 16000), messages: [{ role: "user", content: c2 }] }, { plain: true });
  }
  const text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (json.stop_reason === "max_tokens") {
    console.error("AIの返答が上限で切れた", json.usage);
    throw new Error("リストが長くなりすぎて、AIの返答が途中で切れました。範囲を短くして2回に分けてください");
  }
  if (!text) console.error("AIの返答に文章がない", json.stop_reason, JSON.stringify(json.content || []).slice(0, 500));
  return parseJsonLoose(text);
}

export async function askClaude(prompt) {
  const out = await askClaudeJson(prompt, LIST_SCHEMA, {
    example: '{"buy":[{"category":"","items":[{"name":"","amount":"","note":"","recipes":[""]}]}],"check":[{"name":"","recipes":[""]}]}',
  });
  return { buy: Array.isArray(out.buy) ? out.buy : [], check: Array.isArray(out.check) ? out.check : [] };
}
