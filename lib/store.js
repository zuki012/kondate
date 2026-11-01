// 献立と買い出しリストの保存先を、世帯ごとに切り替える
//  - 持ち主（Kazukiさん家）：Notion（今まで通り）
//  - 友達の家：Upstash（Notionには入れない）
import { randomBytes } from "node:crypto";
import * as N from "./notion.js";
import { kv, kvMany, jsonOr } from "./kv.js";

const cellsKey = (hh) => `hh:${hh.id}:cells`;
const listsKey = (hh) => `hh:${hh.id}:lists`;
const listKey = (hh, id) => `hh:${hh.id}:list:${id}`;
const MAX_LISTS = 50;

export async function listPlan(hh, from, to) {
  if (hh.owner) return N.listPlan(from, to);
  const all = (await kv("HGETALL", cellsKey(hh))) || [];
  const cells = {};
  // HGETALL は [キー, 値, キー, 値, …] の形で返る
  for (let i = 0; i < all.length; i += 2) {
    const k = all[i], date = k.slice(0, 10);
    if (date >= from && date <= to) {
      const items = jsonOr(all[i + 1], []);
      if (Array.isArray(items) && items.length) cells[k] = items;
    }
  }
  return cells;
}

export async function savePlanCell(hh, date, slot, items) {
  if (hh.owner) return N.savePlanCell(date, slot, items);
  const k = `${date}_${slot}`;
  if (!items.length) await kv("HDEL", cellsKey(hh), k);
  else await kv("HSET", cellsKey(hh), k, JSON.stringify(items));
}

export async function saveShoppingList(hh, name, data) {
  if (hh.owner) return N.saveShoppingList(name, data);
  const id = randomBytes(8).toString("hex");
  const rec = { name: String(name).slice(0, 200), created: new Date().toISOString(), data, checked: [] };
  const res = await kvMany([
    ["SET", listKey(hh, id), JSON.stringify(rec)],
    ["LPUSH", listsKey(hh), id],
    ["LRANGE", listsKey(hh), MAX_LISTS, -1],
  ]);
  // 古い履歴は50件を超えたら消す
  const old = res[2] || [];
  if (old.length) await kvMany([...old.map((o) => ["DEL", listKey(hh, o)]), ["LTRIM", listsKey(hh), 0, MAX_LISTS - 1]]);
  return id;
}

export async function listShoppingLists(hh) {
  if (hh.owner) return N.listShoppingLists();
  const ids = (await kv("LRANGE", listsKey(hh), 0, MAX_LISTS - 1)) || [];
  const recs = await kvMany(ids.map((id) => ["GET", listKey(hh, id)]));
  return ids.map((id, i) => ({ id, rec: jsonOr(recs[i], null) }))
    .filter((x) => x.rec)
    .map(({ id, rec }) => ({ id, name: rec.name, created: rec.created }));
}

const cleanKvId = (id) => String(id || "").replace(/[^0-9a-f]/gi, "").slice(0, 32);

export async function getShoppingList(hh, id) {
  if (hh.owner) return N.getShoppingList(id);
  const rec = jsonOr(await kv("GET", listKey(hh, cleanKvId(id))), null);
  if (!rec) throw Object.assign(new Error("そのリストは見つかりません"), { status: 404 });
  return { id: cleanKvId(id), name: rec.name, created: rec.created, data: rec.data || {}, checked: rec.checked || [] };
}

export async function saveListChecked(hh, id, checked) {
  if (hh.owner) return N.saveListChecked(id, checked);
  const k = listKey(hh, cleanKvId(id));
  const rec = jsonOr(await kv("GET", k), null);
  if (!rec) throw Object.assign(new Error("そのリストは見つかりません"), { status: 404 });
  await kv("SET", k, JSON.stringify({ ...rec, checked }));
}

export async function deleteShoppingList(hh, id) {
  if (hh.owner) return N.deleteShoppingList(id);
  const lid = cleanKvId(id);
  await kvMany([["DEL", listKey(hh, lid)], ["LREM", listsKey(hh), 0, lid]]);
}
