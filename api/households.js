// ワークスペース（コード上は「世帯」）の管理
// 招待リンクを開いた友達（合言葉はまだない）：
//   GET  /api/households?invite=…          → 招待先のワークスペース名
//   POST /api/households {invite, pass}    → 合言葉を自分で決めて使い始める
// 友達のワークスペースに入っている人：
//   POST /api/households {changePass}      → 自分のワークスペースの合言葉を変える
// 持ち主（Kazukiさん家）だけ：
//   GET  /api/households                   → 一覧（合言葉は出さない）
//   POST /api/households {name}            → ワークスペースを作って招待リンクを発行
//   POST /api/households {id, invite:true} → 招待リンクを作り直す（合言葉を忘れたとき用）
//   POST /api/households {id, delete:true} → 消す（その献立と履歴も消える）
import { listHouseholds, createHousehold, reissueInvite, inviteInfo, acceptInvite, changeOwnPass, deleteHousehold } from "../lib/households.js";
import { kvReady } from "../lib/kv.js";
import { auth, ownerOnly, fail, readJson } from "../lib/http.js";

const cleanId = (s) => String(s || "").replace(/[^0-9a-f]/gi, "").slice(0, 12);

export default async function handler(req, res) {
  try {
    // 招待リンクからの操作は合言葉なしで受け付ける
    if (req.method === "GET" && req.query?.invite) {
      if (!kvReady()) return res.status(404).json({ error: "この招待リンクは使えません" });
      return res.status(200).json(await inviteInfo(req.query.invite));
    }
    const body = req.method === "POST" ? await readJson(req) : {};
    if (body.invite && typeof body.invite === "string") {
      if (!kvReady()) return res.status(404).json({ error: "この招待リンクは使えません" });
      return res.status(200).json(await acceptInvite(body.invite, String(body.pass || "")));
    }

    const hh = await auth(req, res); if (!hh) return;
    if (body.changePass !== undefined) {
      if (hh.owner) return res.status(400).json({ error: "わが家の合言葉は、Vercelの設定（APP_PASSWORD）で変えてください" });
      await changeOwnPass(hh.id, String(body.changePass || ""));
      return res.status(200).json({ ok: true });
    }

    if (!ownerOnly(hh, res)) return;
    if (!kvReady()) return res.status(200).json({ ready: false, households: [] });
    if (req.method === "GET") return res.status(200).json({ ready: true, households: await listHouseholds() });
    if (req.method === "POST") {
      if (body.id) {
        const id = cleanId(body.id);
        if (body.delete) { await deleteHousehold(id); return res.status(200).json({ ok: true }); }
        if (body.invite === true) return res.status(200).json({ household: await reissueInvite(id) });
        return res.status(400).json({ error: "操作が指定されていません" });
      }
      const name = String(body.name || "").trim();
      if (!name) return res.status(400).json({ error: "ワークスペース名を入れてください" });
      return res.status(200).json({ household: await createHousehold(name) });
    }
    res.status(405).json({ error: "許可されていない操作です" });
  } catch (e) {
    if (e.status === 400 || e.status === 404) return res.status(e.status).json({ error: e.message });
    fail(res, e);
  }
}
