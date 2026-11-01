// GET  /api/lists            → 過去の買い出しリストの一覧（新しい順）
// GET  /api/lists?id=…       → 1件の中身（チェック状態つき）
// POST /api/lists {id, checked:[…]} → チェック状態を保存（ふたりで共有）
// POST /api/lists {id, delete:true} → 履歴から消す（Notionのゴミ箱へ）
import { listShoppingLists, getShoppingList, saveListChecked, deleteShoppingList } from "../lib/store.js";
import { auth, fail, readJson } from "../lib/http.js";

const cleanId = (s) => String(s || "").replace(/[^0-9a-f]/gi, "").slice(0, 32);

export default async function handler(req, res) {
  const hh = await auth(req, res); if (!hh) return;
  try {
    if (req.method === "GET") {
      const id = cleanId(req.query?.id);
      if (id) return res.status(200).json(await getShoppingList(hh, id));
      return res.status(200).json({ lists: await listShoppingLists(hh) });
    }
    if (req.method === "POST") {
      const body = await readJson(req);
      const id = cleanId(body.id);
      if (id.length < 16) return res.status(400).json({ error: "リストが指定されていません" });
      if (body.delete) { await deleteShoppingList(hh, id); return res.status(200).json({ ok: true }); }
      const checked = (Array.isArray(body.checked) ? body.checked : []).slice(0, 300).map((k) => String(k).slice(0, 120));
      await saveListChecked(hh, id, checked);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "許可されていない操作です" });
  } catch (e) { fail(res, e); }
}
