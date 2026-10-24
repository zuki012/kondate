// POST /api/read-image {images:["data:image/jpeg;base64,..."]}
//  → レシピのスクリーンショットから料理名・基準人数・材料をClaude APIで読み取る
import { askClaudeJson, IMAGE_SCHEMA } from "../lib/shopping.js";
import { checkAuth, fail, readJson } from "../lib/http.js";

export const config = { maxDuration: 60 };

const PROMPT = `画像はレシピのスクリーンショットです。料理名、材料の基準（例：2人分）、材料を読み取ってください。

ルール:
- 材料は1行に1つ、「食材名 分量」の形にする（例：「豚バラ肉（しゃぶしゃぶ用） 250〜300g」）。
- 作り方、コツ、感想などの文章は入れない。
- 仕上げ用の調味料も材料として入れる。
- 料理名が書かれていなければ、材料から短く名付ける。
- 読み取れない場合は ingredients を空にする。

結果は recipe ツールで返す。`;

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "許可されていない操作です" });
  try {
    const { images } = await readJson(req);
    const list = (Array.isArray(images) ? images : []).slice(0, 4)
      .map((s) => String(s).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/))
      .filter(Boolean);
    if (!list.length) return res.status(400).json({ error: "画像が選ばれていません" });
    const content = [
      ...list.map((m) => ({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } })),
      { type: "text", text: PROMPT },
    ];
    const out = await askClaudeJson(content, IMAGE_SCHEMA, { name: "recipe", maxTokens: 2000 });
    res.status(200).json({
      name: String(out.name || "").slice(0, 100),
      base: String(out.base || "").slice(0, 50),
      ingredients: String(out.ingredients || "").slice(0, 3000),
    });
  } catch (e) { fail(res, e); }
}
