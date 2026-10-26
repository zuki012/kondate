// POST /api/shopping {entries:[{id, count, note}], beetto:[{id, count, note}], extras:[{name, url, ing, count, note}], memos:[{name, count}], people}
//  note は「ピーマンの方だけ」など、そのレシピの使い方の指示
//  → Notionのレシピと、URLで登録したレシピの材料を集め、Claude APIで合算した買い出しリストを返す
import { getRecipeDetail, saveShoppingList } from "../lib/notion.js";
import { buildPrompt, askClaude } from "../lib/shopping.js";
import { readRecipePage } from "../lib/webrecipe.js";
import { BEETTO } from "../lib/beetto-data.js";
import { checkAuth, fail, readJson } from "../lib/http.js";

export const config = { maxDuration: 60 };

const clampCount = (n) => Math.max(1, Math.min(10, Number(n) || 1));
const noteOf = (e) => String(e?.note || "").trim().slice(0, 100);

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "許可されていない操作です" });
  try {
    const { entries, extras, people, beetto, memos, title } = await readJson(req);
    const list = (Array.isArray(entries) ? entries : []).slice(0, 40)
      .map((e) => ({ id: String(e?.id || "").replace(/[^0-9a-f]/gi, ""), count: clampCount(e?.count), note: noteOf(e) }))
      .filter((e) => e.id.length === 32);
    const urls = (Array.isArray(extras) ? extras : []).slice(0, 10)
      .map((e) => ({ name: String(e?.name || "").slice(0, 100), url: String(e?.url || "").slice(0, 500), ing: String(e?.ing || "").slice(0, 3000), count: clampCount(e?.count), note: noteOf(e) }))
      .filter((e) => e.name && (e.ing || /^https?:\/\//.test(e.url)));
    // beettoのレシピは材料をサイトの中に持っているので、読み取りに行かない
    const BT = new Map(BEETTO.map((r) => [r.id, r]));
    const fromBeetto = (Array.isArray(beetto) ? beetto : []).slice(0, 40)
      .map((e) => ({ r: BT.get(String(e?.id || "")), count: clampCount(e?.count), note: noteOf(e) }))
      .filter((e) => e.r)
      .map(({ r, count, note }) => ({ name: r.name, base: r.base, ingredients: r.ingredients, count, note }));
    // メモ（献立表に手で書いたもの）も、食材や料理名としてAIに読ませる
    const memoList = (Array.isArray(memos) ? memos : []).slice(0, 30)
      .map((m) => ({ name: String(m?.name || "").trim().slice(0, 100), count: clampCount(m?.count) }))
      .filter((m) => m.name);
    if (!list.length && !urls.length && !fromBeetto.length && !memoList.length) return res.status(400).json({ error: "レシピが選ばれていません" });
    const n = Math.max(1, Math.min(8, Number(people) || 2));
    // 同じレシピが「指示」違いで複数あっても、Notionへの読み取りは1回にする
    const cache = new Map();
    const detailOnce = (id) => { if (!cache.has(id)) cache.set(id, getRecipeDetail(id)); return cache.get(id); };

    const [fromNotion, fromWeb] = await Promise.all([
      Promise.all(list.map(async (e) => ({ ...(await detailOnce(e.id)), count: e.count, note: e.note }))),
      // ページの読み取りはAIを使わない（料金はかからない）
      Promise.all(urls.map(async (e) => {
        if (e.ing) {
          const m = e.ing.match(/^[（(]([^）)\n]+)[）)]\s*\n/); // 先頭行の「（2人分）」を基準人数として使う
          return { name: e.name, base: m ? m[1] : "", ingredients: m ? e.ing.slice(m[0].length) : e.ing, count: e.count, note: e.note };
        }
        const got = await readRecipePage(e.url);
        return got ? { name: e.name, base: got.base, ingredients: got.text, count: e.count, note: e.note } : { name: e.name, failed: true };
      })),
    ]);
    const failed = fromWeb.filter((r) => r.failed).map((r) => r.name);
    const recipes = [...fromNotion, ...fromBeetto, ...fromWeb.filter((r) => !r.failed)];
    if (!recipes.length && !memoList.length) return res.status(200).json({ list: { buy: [], check: [] }, recipes: [], failed });

    const result = await askClaude(buildPrompt(recipes, n, memoList));
    const recipesOut = recipes.map((r) => ({ name: r.name, base: r.base, ingredients: r.ingredients, count: r.count, note: r.note || "" }));
    // あとで見返せるように、できたリストをNotionの履歴に残す（失敗してもリストは返す）
    const span = String(title || "").slice(0, 100);
    let listId = null;
    try {
      listId = await saveShoppingList(`${span || "買い出しリスト"}／${n}人分`, { span, people: n, list: result, failed, recipes: recipesOut, memos: memoList });
    } catch (e) { console.error("履歴の保存に失敗", e); }
    res.status(200).json({ list: result, failed, recipes: recipesOut, listId });
  } catch (e) { fail(res, e); }
}
