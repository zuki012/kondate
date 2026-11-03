// GET /api/recipes?q=なす&genre=和食  → Notionのレシピを検索
// GET /api/recipes?id=…               → 1件の中身（材料・作り方など）
import { searchRecipes, getRecipeView } from "../lib/notion.js";
import { auth, ownerOnly, fail } from "../lib/http.js";

export default async function handler(req, res) {
  // Notionのレシピ（Shihoさんのワークスペース）は、持ち主の世帯だけが見られる
  const hh = await auth(req, res); if (!hh || !ownerOnly(hh, res)) return;
  try {
    // ?id=… なら1件の中身（レシピモードで見る用）
    const id = String(req.query.id || "").replace(/[^0-9a-f]/gi, "");
    if (id.length === 32) return res.status(200).json({ recipe: await getRecipeView(id) });
    const q = String(req.query.q || "").trim().slice(0, 50);
    const genre = String(req.query.genre || "").trim().slice(0, 30);
    const recipes = await searchRecipes({ q, genre: genre === "すべて" ? "" : genre });
    res.status(200).json({ recipes });
  } catch (e) { fail(res, e); }
}
