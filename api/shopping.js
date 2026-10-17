// POST /api/shopping {entries:[{id, count}], extras:[{name, url, ing, count}], people}
//  → Notionのレシピと、URLで登録したレシピの材料を集め、Claude APIで合算した買い出しリストを返す
import { getRecipeDetail } from "../lib/notion.js";
import { buildPrompt, askClaude } from "../lib/shopping.js";
import { readRecipePage } from "../lib/webrecipe.js";
import { checkAuth, fail, readJson } from "../lib/http.js";

export const config = { maxDuration: 60 };

const clampCount = (n) => Math.max(1, Math.min(10, Number(n) || 1));

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "許可されていない操作です" });
  try {
    const { entries, extras, people } = await readJson(req);
    const list = (Array.isArray(entries) ? entries : []).slice(0, 40)
      .map((e) => ({ id: String(e?.id || "").replace(/[^0-9a-f]/gi, ""), count: clampCount(e?.count) }))
      .filter((e) => e.id.length === 32);
    const urls = (Array.isArray(extras) ? extras : []).slice(0, 10)
      .map((e) => ({ name: String(e?.name || "").slice(0, 100), url: String(e?.url || "").slice(0, 500), ing: String(e?.ing || "").slice(0, 3000), count: clampCount(e?.count) }))
      .filter((e) => e.name && (e.ing || /^https?:\/\//.test(e.url)));
    if (!list.length && !urls.length) return res.status(400).json({ error: "レシピが選ばれていません" });
    const n = Math.max(1, Math.min(8, Number(people) || 2));

    const [fromNotion, fromWeb] = await Promise.all([
      Promise.all(list.map(async (e) => ({ ...(await getRecipeDetail(e.id)), count: e.count }))),
      // ページの読み取りはAIを使わない（料金はかからない）
      Promise.all(urls.map(async (e) => {
        if (e.ing) return { name: e.name, base: "", ingredients: e.ing, count: e.count };
        const got = await readRecipePage(e.url);
        return got ? { name: e.name, base: got.base, ingredients: got.text, count: e.count } : { name: e.name, failed: true };
      })),
    ]);
    const failed = fromWeb.filter((r) => r.failed).map((r) => r.name);
    const recipes = [...fromNotion, ...fromWeb.filter((r) => !r.failed)];
    if (!recipes.length) return res.status(200).json({ list: { buy: [], check: [] }, recipes: [], failed });

    const result = await askClaude(buildPrompt(recipes, n));
    res.status(200).json({
      list: result,
      failed,
      recipes: recipes.map((r) => ({ name: r.name, base: r.base, ingredients: r.ingredients, count: r.count })),
    });
  } catch (e) { fail(res, e); }
}
