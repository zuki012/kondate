// 材料の読み取り結果を、レシピの文章ごとに保存して使い回す（2回目からはAIを使わない）
import { createHash } from "node:crypto";
import { kv, kvMany, kvReady, jsonOr } from "./kv.js";

const VERSION = 1; // 読み取りのルールを変えたら上げる（古い結果を使わないため）
const TTL = 180 * 86400;
export const recipeKey = (r) => "parse:" + createHash("sha256").update(JSON.stringify([VERSION, "r", r.ingredients || "", r.note || ""])).digest("hex").slice(0, 32);
export const memoKey = (m) => "parse:" + createHash("sha256").update(JSON.stringify([VERSION, "m", m.name])).digest("hex").slice(0, 32);

export async function cacheGet(keys) {
  if (!kvReady() || !keys.length) return keys.map(() => null);
  try { return (await kvMany(keys.map((k) => ["GET", k]))).map((v) => jsonOr(v, null)); }
  catch (e) { console.error("読み取り結果の取り出しに失敗", e); return keys.map(() => null); }
}
export async function cacheSet(pairs) {
  if (!kvReady() || !pairs.length) return;
  try { await kvMany(pairs.map(([k, v]) => ["SET", k, JSON.stringify(v), "EX", TTL])); }
  catch (e) { console.error("読み取り結果の保存に失敗", e); }
}
