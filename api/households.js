// 友達の世帯の管理（持ち主の世帯だけが使える）
// GET  /api/households                 → 世帯の一覧（名前と合言葉）
// POST /api/households {name}          → 世帯を追加して合言葉を発行
// POST /api/households {id, reset:true}  → 合言葉を作り直す（前の合言葉では入れなくなる）
// POST /api/households {id, delete:true} → 世帯を消す（その世帯の献立と履歴も消える）
import { listHouseholds, createHousehold, resetHouseholdPass, deleteHousehold } from "../lib/households.js";
import { kvReady } from "../lib/kv.js";
import { auth, ownerOnly, fail, readJson } from "../lib/http.js";

const cleanId = (s) => String(s || "").replace(/[^0-9a-f]/gi, "").slice(0, 12);

export default async function handler(req, res) {
  const hh = await auth(req, res); if (!hh || !ownerOnly(hh, res)) return;
  try {
    if (!kvReady()) return res.status(200).json({ ready: false, households: [] });
    if (req.method === "GET") return res.status(200).json({ ready: true, households: await listHouseholds() });
    if (req.method === "POST") {
      const body = await readJson(req);
      if (body.id) {
        const id = cleanId(body.id);
        if (body.delete) { await deleteHousehold(id); return res.status(200).json({ ok: true }); }
        if (body.reset) return res.status(200).json({ household: await resetHouseholdPass(id) });
        return res.status(400).json({ error: "操作が指定されていません" });
      }
      const name = String(body.name || "").trim();
      if (!name) return res.status(400).json({ error: "世帯の名前を入れてください" });
      return res.status(200).json({ household: await createHousehold(name) });
    }
    res.status(405).json({ error: "許可されていない操作です" });
  } catch (e) { fail(res, e); }
}
