// GET  /api/plan?from=2026-10-06&to=2026-11-02  → 献立の一覧
// POST /api/plan {date, slot, items}            → 1マス分を保存（itemsが空なら削除）
import { SLOT_LABEL } from "../lib/notion.js";
import { listPlan, savePlanCell } from "../lib/store.js";
import { auth, fail, readJson, isDate } from "../lib/http.js";

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 20).map((x) => {
    const type = ["recipe", "beetto", "url", "text"].includes(x?.type) ? x.type : "text";
    const out = { type, name: String(x?.name || "").slice(0, 100) };
    if (type === "recipe") out.id = String(x.id || "").replace(/[^0-9a-f]/gi, "").slice(0, 32);
    if (type === "beetto") out.id = String(x.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
    if (type === "url") out.url = String(x.url || "").slice(0, 500);
    if (type === "url" && x.ing) out.ing = String(x.ing).slice(0, 3000);
    // 「ピーマンの方だけ」など、そのレシピの使い方の指示
    if (type !== "text" && x.note) out.note = String(x.note).trim().slice(0, 100);
    return out;
  }).filter((x) => x.name);
}

export default async function handler(req, res) {
  const hh = await auth(req, res); if (!hh) return;
  try {
    if (req.method === "GET") {
      const { from, to } = req.query;
      if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "日付の指定が正しくありません" });
      // 世帯の名前と、持ち主かどうか（画面の出し分けに使う）も返す
      return res.status(200).json({ cells: await listPlan(hh, from, to), household: { name: hh.name, owner: hh.owner } });
    }
    if (req.method === "POST") {
      const { date, slot, items } = await readJson(req);
      if (!isDate(date) || !SLOT_LABEL[slot]) return res.status(400).json({ error: "日付か食事の指定が正しくありません" });
      // 友達の家ではNotionのレシピは使えない
      const clean = cleanItems(items).filter((x) => hh.owner || x.type !== "recipe");
      await savePlanCell(hh, date, slot, clean);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "許可されていない操作です" });
  } catch (e) { fail(res, e); }
}
