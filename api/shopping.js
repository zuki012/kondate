// POST /api/shopping {entries:[{id, count, note}], beetto:[{id, count, note}], extras:[{name, url, ing, count, note}], memos:[{name, count}], people}
//  note は「ピーマンの方だけ」など、そのレシピの使い方の指示
//  → レシピの材料を集め、AIで「食材名・数・単位」に読み取り（結果は保存して再利用）、
//    人数・回数の掛け算と合算はプログラムで計算して買い出しリストを返す
import { getRecipeDetail } from "../lib/notion.js";
import { saveShoppingList } from "../lib/store.js";
import { parseIngredients, CATS } from "../lib/shopping.js";
import { scaleOf, aggregate } from "../lib/quantity.js";
import { recipeKey, memoKey, cacheGet, cacheSet } from "../lib/parsecache.js";
import { readRecipePage } from "../lib/webrecipe.js";
import { BEETTO } from "../lib/beetto-data.js";
import { auth, fail, readJson } from "../lib/http.js";

export const config = { maxDuration: 60 };

const clampCount = (n) => Math.max(1, Math.min(10, Number(n) || 1));
const noteOf = (e) => String(e?.note || "").trim().slice(0, 100);

export default async function handler(req, res) {
  const hh = await auth(req, res); if (!hh) return;
  if (req.method !== "POST") return res.status(405).json({ error: "許可されていない操作です" });
  try {
    const { entries, extras, people, beetto, memos, title } = await readJson(req);
    // Notionのレシピは持ち主の世帯だけ
    const list = (hh.owner && Array.isArray(entries) ? entries : []).slice(0, 40)
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

    // 1) 読み取り：保存済みの結果があれば使い、ないものだけAIに読ませる
    const rKeys = recipes.map(recipeKey), mKeys = memoList.map(memoKey);
    const cached = await cacheGet([...rKeys, ...mKeys]);
    const rParsed = cached.slice(0, rKeys.length), mParsed = cached.slice(rKeys.length);
    const needR = recipes.map((r, i) => (rParsed[i] ? null : i)).filter((i) => i !== null);
    const needM = memoList.map((m, i) => (mParsed[i] ? null : i)).filter((i) => i !== null);
    if (needR.length || needM.length) {
      const got = await parseIngredients(needR.map((i) => recipes[i]), needM.map((i) => memoList[i]));
      const toSave = [];
      for (const g of got.recipes) {
        const i = needR[g.i]; if (i === undefined) continue;
        rParsed[i] = { noteScale: Number(g.noteScale) > 0 ? Number(g.noteScale) : 1, items: g.items || [] };
        toSave.push([rKeys[i], rParsed[i]]);
      }
      for (const g of got.memos) {
        const i = needM[g.i]; if (i === undefined) continue;
        mParsed[i] = { items: g.items || [] };
        toSave.push([mKeys[i], mParsed[i]]);
      }
      await cacheSet(toSave);
    }

    // 2) 計算：倍率を掛けて合算（ここはすべてプログラム）
    const parsedEntries = [];
    recipes.forEach((r, i) => {
      const p = rParsed[i]; if (!p) return;
      const ns = p.noteScale || 1;
      const { factor } = scaleOf(r, n);
      for (const it of p.items) {
        const mult = it.per === "batch" ? (r.count || 1) * ns : factor * ns;
        parsedEntries.push({ ...it, mult, from: r.name });
      }
    });
    memoList.forEach((m, i) => {
      const p = mParsed[i]; if (!p) return;
      for (const it of p.items) {
        const mult = it.per === "person" ? n * m.count : m.count;
        parsedEntries.push({ ...it, mult, from: `メモ：${m.name}` });
      }
    });
    const result = aggregate(parsedEntries, CATS);
    const recipesOut = recipes.map((r, i) => ({
      name: r.name, base: r.base, ingredients: r.ingredients, count: r.count, note: r.note || "",
      factor: Math.round(scaleOf(r, n).factor * (rParsed[i]?.noteScale || 1) * 100) / 100,
    }));
    // あとで見返せるように、できたリストをNotionの履歴に残す（失敗してもリストは返す）
    const span = String(title || "").slice(0, 100);
    let listId = null;
    try {
      listId = await saveShoppingList(hh, `${span || "買い出しリスト"}／${n}人分`, { span, people: n, list: result, failed, recipes: recipesOut, memos: memoList });
    } catch (e) { console.error("履歴の保存に失敗", e); }
    res.status(200).json({ list: result, failed, recipes: recipesOut, listId });
  } catch (e) { fail(res, e); }
}
