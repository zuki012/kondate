// 共通：合言葉チェックとエラー応答
import { timingSafeEqual } from "node:crypto";

export function checkAuth(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // 未設定なら誰でも使える（設定を推奨）
  let given = String(req.headers["x-app-pass"] || "");
  try { given = decodeURIComponent(given); } catch { /* そのまま比較 */ }
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return true;
  res.status(401).json({ error: "合言葉が違います" });
  return false;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

export function fail(res, e) {
  console.error(e);
  const status = e?.status === 401 || e?.status === 403 ? 502 : e?.status === 404 ? 502 : 500;
  let msg = e?.message || "エラーが発生しました";
  if (e?.body?.code === "object_not_found") msg = "Notionのページが見つかりません。連携（インテグレーション）がレシピ記録ページに接続されているか確認してください";
  if (e?.body?.code === "unauthorized") msg = "Notionのトークンが正しくありません";
  res.status(status).json({ error: msg });
}

export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
