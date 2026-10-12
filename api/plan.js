// GET  /api/plan?from=2026-10-06&to=2026-11-02  → 献立の一覧
// POST /api/plan {date, slot, items}            → 1マス分を保存（itemsが空なら削除）
import { listPlan, savePlanCell, SLOT_LABEL } from "../lib/notion.js";
import { checkAuth, fail, readJson, isDate } from "../lib/http.js";

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 20).map((x) => {
    const type = ["recipe", "url", "text"].includes(x?.type) ? x.type : "text";
    const out = { type, name: String(x?.name || "").slice(0, 100) };
    if (type === "recipe") out.id = String(x.id || "").replace(/[^0-9a-f]/gi, "").slice(0, 32);
    if (type === "url") out.url = String(x.url || "").slice(0, 500);
    return out;
  }).filter((x) => x.name);
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  try {
    if (req.method === "GET") {
      const { from, to } = req.query;
      if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "日付の指定が正しくありません" });
      return res.status(200).json({ cells: await listPlan(from, to) });
    }
    if (req.method === "POST") {
      const { date, slot, items } = await readJson(req);
      if (!isDate(date) || !SLOT_LABEL[slot]) return res.status(400).json({ error: "日付か食事の指定が正しくありません" });
      await savePlanCell(date, slot, cleanItems(items));
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "許可されていない操作です" });
  } catch (e) { fail(res, e); }
}
