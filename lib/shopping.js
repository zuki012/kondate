// 買い出しリスト：AIは材料を読み取るだけ、計算はプログラム（quantity.js）でする
import { UNITS } from "./quantity.js";
export const STAPLES = "塩、砂糖、しょうゆ、薄口しょうゆ、酒、みりん、酢、米酢、黒酢、こしょう、サラダ油（香りのない油）、ごま油、オリーブ油、揚げ油、片栗粉、薄力粉、小麦粉、パン粉、鶏がらスープの素、コンソメ、白だし、めんつゆ、だし汁、味噌、マヨネーズ、ケチャップ、中濃ソース、オイスターソース、ポン酢、豆板醤、コチュジャン、ナンプラー、ラー油、白ごま、すりごま、練りごま、カレー粉、唐辛子、一味唐辛子、七味唐辛子、白ワインビネガー、はちみつ、粉チーズ、米";
export const CATS = ["野菜・果物", "きのこ", "肉", "魚介", "卵・乳製品", "豆腐・大豆製品", "主食・麺", "乾物・缶詰", "調味料・スパイス", "その他"];

export { scaleOf } from "./quantity.js";

// AIへのお願い：材料を「食材名・数・単位」に読み取るだけ。計算（掛け算・合算）はプログラムでする
export function buildParsePrompt(recipes, memos = []) {
  const blocks = recipes.map((r, i) =>
    `### R${i}. ${r.name}\n${r.note ? `★このレシピの指示: ${r.note}\n` : ""}${r.ingredients || "（材料の記載なし）"}`
  ).join("\n\n");
  const memoBlock = memos.map((m, i) => `### M${i}. メモ「${m.name}」`).join("\n");
  return `レシピの材料の文章を、計算できる形（食材名・数・単位）に読み取ってください。計算（人数分への換算・回数の掛け算・合算）はこちらのプログラムでするので、あなたは読み取りだけをします。

読み取りのルール:
- 材料1つにつき1件。数は数値にする（「１/２」→0.5、「1と1/2」→1.5、「大さじ２強」→2）。範囲（「１〜２個」「100〜150ml」）は大きい方の数にする。
- 単位は次から選ぶ: ${UNITS.join(" / ")}。「ｇ」→g、「ｍｌ・cc」→ml、「カップ」はカップ。「〇個（150g）」のように両方あるときは、先に書かれている単位を使う。「少々」「ひとつまみ」「適量・適宜・お好みで量の書いていないもの」は数を0にして、その言葉を単位にする（適宜→適量）。単位が上にない数え方（例：「1かけ分」→かけ、「16さや」→さや、「1/2丁」→個 として0.5）は近いものを選ぶ。
- 食材名は、全レシピを通して同じ食材は同じ書き方にそろえる（生姜→しょうが、醤油→しょうゆ、葱→ねぎ、卵・ゆで卵・茹で卵→卵、玄米→玄米 など）。切り方・下ごしらえ（みじん切り、すりおろし、石づきを取る）や「A」「B」の印は名前に入れない。部位や種類が買い物で違うもの（豚ロース薄切り肉／豚ひき肉、赤パプリカ）はそのまま区別する。
- 水・湯・ゆで汁・氷・道具は出さない。同じレシピの中ですでに挙がっている食材の一部分（「長ねぎの青い部分」「大根の葉」など）は出さない（本体がそのレシピにないときだけ出す）。
- 「AまたはB」はAを採用し、memo に「Bでも可」と書く。「好みで」「あれば」「適宜」の食材は opt を true にする。
- per は、レシピの材料なら通常 "scale"。レシピの中で作って一部だけ使うたれ・香味油など（作る量が人数で変わらないもの）の材料だけ "batch"。
- cat は売り場の分類（${CATS.join(" / ")}）から選ぶ。staple は、次の常備品なら true: ${STAPLES}
- 「★このレシピの指示」があるレシピは指示に合わせる。「ピーマンの春巻きだけ」なら他の種類の材料は出さない。「ツナ抜き」ならツナを出さない。量の指示（「半量」「1.5倍」など）は数は変えずに noteScale に倍率（半量→0.5）を入れる。指示がなければ noteScale は 1。
- メモ（M）は献立表に手で書いた短い書き込み。誤字やあいまいな書き方は一般的な食材名に直す。
  - 食材名で分量が書いてあれば、その数と単位で per を "batch" にする。分量がなければ、ふつうの家庭で1回に使う量（例：キャベツ 0.5玉、納豆 1パック）を入れて per を "batch"、memo に「メモより・分量は目安」。
  - 料理名（納豆ごはん、味噌汁など）なら、主な材料を1人分の量で出して per を "person"、memo に「メモより・分量は目安」。
  - 「外食」「残り物」「作り置き」など買い物が要らないものは items を空にする。
- レシピサイトから切り出した材料には、材料以外の文章が混ざっていることがある。材料以外は無視する。
- recipes にはすべての R を、memos にはすべての M を、番号（i）つきで入れる。

---
${blocks}${memoBlock ? `\n\n${memoBlock}` : ""}`;
}
export function parseJsonLoose(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < s) throw new Error("AIの返答を読み取れませんでした。もう一度押してみてください");
  return JSON.parse(text.slice(s, e + 1));
}

// 読み取り結果の形。AIにはこの形（構造化出力）で答えさせる
const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const ITEM = obj({
  name: str,
  qty: { type: "number" },
  unit: { type: "string", enum: UNITS },
  cat: { type: "string", enum: CATS },
  staple: { type: "boolean" },
  opt: { type: "boolean" },
  per: { type: "string", enum: ["scale", "batch", "person"] },
  memo: str,
});
export const PARSE_SCHEMA = obj({
  recipes: { type: "array", items: obj({ i: { type: "integer" }, noteScale: { type: "number" }, items: { type: "array", items: ITEM } }) },
  memos: { type: "array", items: obj({ i: { type: "integer" }, items: { type: "array", items: ITEM } }) },
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

export async function parseIngredients(recipes, memos) {
  const out = await askClaudeJson(buildParsePrompt(recipes, memos), PARSE_SCHEMA, {
    example: '{"recipes":[{"i":0,"noteScale":1,"items":[{"name":"卵","qty":2,"unit":"個","cat":"卵・乳製品","staple":false,"opt":false,"per":"scale","memo":""}]}],"memos":[]}',
  });
  return { recipes: Array.isArray(out.recipes) ? out.recipes : [], memos: Array.isArray(out.memos) ? out.memos : [] };
}
