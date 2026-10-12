// POST /api/shopping {entries:[{id, count}], people}
//  → 各レシピの材料をNotionから読み、Claude APIで合算した買い出しリストを返す
import { getRecipeDetail } from "../lib/notion.js";
import { buildPrompt, askClaude } from "../lib/shopping.js";
import { checkAuth, fail, readJson } from "../lib/http.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "許可されていない操作です" });
  try {
    const { entries, people } = await readJson(req);
    const list = (Array.isArray(entries) ? entries : []).slice(0, 40)
      .map((e) => ({ id: String(e?.id || "").replace(/[^0-9a-f]/gi, ""), count: Math.max(1, Math.min(10, Number(e?.count) || 1)) }))
      .filter((e) => e.id.length === 32);
    if (!list.length) return res.status(400).json({ error: "レシピが選ばれていません" });
    const n = Math.max(1, Math.min(8, Number(people) || 2));
    const recipes = await Promise.all(list.map(async (e) => ({ ...(await getRecipeDetail(e.id)), count: e.count })));
    const result = await askClaude(buildPrompt(recipes, n));
    res.status(200).json({
      list: result,
      recipes: recipes.map((r) => ({ name: r.name, base: r.base, ingredients: r.ingredients, count: r.count })),
    });
  } catch (e) { fail(res, e); }
}
