// GET /api/beetto?q=&phase=&meal= → beettoのレシピを探す（料理名と材料のどちらでも当たる）
import { BEETTO } from "../lib/beetto-data.js";
import { checkAuth } from "../lib/http.js";

// 全角・半角、カタカナ・ひらがなの違いを気にせず探せるようにそろえる
const fold = (s) => String(s || "").normalize("NFKC").toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const INDEX = BEETTO.map((r) => ({ r, hay: fold(r.name + "\n" + r.ingredients) }));

export default function handler(req, res) {
  if (!checkAuth(req, res)) return;
  const words = fold(req.query?.q || "").split(/\s+/).filter(Boolean).slice(0, 5);
  const phase = Number(req.query?.phase) || 0;
  const meal = ["朝", "昼", "夜"].includes(req.query?.meal) ? req.query.meal : "";
  const recipes = INDEX
    .filter(({ r, hay }) => (!phase || r.phase === phase) && (!meal || r.meal === meal) && words.every((w) => hay.includes(w)))
    .map(({ r }) => ({ id: r.id, name: r.name, phase: r.phase, meal: r.meal, base: r.base }));
  res.status(200).json({ recipes });
}
