// Notion API との通信（レシピ検索・レシピ本文の読み取り・献立の保存）
const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

// レシピ記録のレシピDB（Shihoさんのワークスペース）。環境変数で上書き可。
export const RECIPE_DB_ID = (process.env.NOTION_RECIPE_DB_ID || "20e54a0845be818a9604d95a6d225324").replace(/-/g, "");
const PLAN_DB_TITLE = "献立カレンダー（アプリ用）";

export class NotionError extends Error {
  constructor(status, body) {
    super(`Notion ${status}: ${body?.message || ""}`);
    this.status = status; this.body = body;
  }
}

export async function notion(path, { method = "GET", body } = {}) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new NotionError(500, { message: "NOTION_TOKEN が設定されていません" });
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new NotionError(res.status, json);
  return json;
}

const plain = (rt) => (rt || []).map((t) => t.plain_text || "").join("");

/* ---------- レシピDBの構造（プロパティ名と型）を一度だけ調べる ---------- */
let schemaCache = null;
export async function recipeSchema() {
  if (schemaCache) return schemaCache;
  const db = await notion(`/databases/${RECIPE_DB_ID}`);
  const props = db.properties || {};
  const find = (name) => (props[name] ? { name, type: props[name].type } : null);
  const titleName = Object.keys(props).find((k) => props[k].type === "title");
  schemaCache = {
    title: titleName,
    genre: find("ジャンル"),
    category: find("カテゴリー"),
    time: find("調理時間"),
    parentPageId: db.parent?.type === "page_id" ? db.parent.page_id : null,
  };
  return schemaCache;
}

function propText(p) {
  if (!p) return "";
  switch (p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "select": return p.select?.name || "";
    case "status": return p.status?.name || "";
    case "multi_select": return (p.multi_select || []).map((x) => x.name).join(", ");
    case "number": return p.number == null ? "" : String(p.number);
    default: return "";
  }
}

function toRecipe(page, s) {
  const pr = page.properties || {};
  return {
    id: page.id.replace(/-/g, ""),
    name: propText(pr[s.title]) || "（名前なし）",
    genre: s.genre ? propText(pr[s.genre.name]) : "",
    category: s.category ? propText(pr[s.category.name]) : "",
    time: s.time ? propText(pr[s.time.name]) : "",
  };
}

/* ---------- レシピ検索 ---------- */
export async function searchRecipes({ q = "", genre = "" }) {
  const s = await recipeSchema();
  const and = [];
  if (q) and.push({ property: s.title, title: { contains: q } });
  if (genre && s.genre) {
    if (s.genre.type === "select") and.push({ property: s.genre.name, select: { equals: genre } });
    else if (s.genre.type === "multi_select") and.push({ property: s.genre.name, multi_select: { contains: genre } });
  }
  const body = {
    page_size: q ? 60 : 40,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  };
  if (and.length === 1) body.filter = and[0];
  if (and.length > 1) body.filter = { and };
  const res = await notion(`/databases/${RECIPE_DB_ID}/query`, { method: "POST", body });
  return res.results.filter((p) => !p.archived).map((p) => toRecipe(p, s));
}

/* ---------- レシピ本文から「材料」部分を取り出す ---------- */
async function allChildren(blockId) {
  const out = [];
  let cursor;
  do {
    const qs = cursor ? `?page_size=100&start_cursor=${cursor}` : "?page_size=100";
    const res = await notion(`/blocks/${blockId}/children${qs}`);
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return out;
}

function blockText(b) {
  const v = b[b.type];
  if (!v) return "";
  if (v.rich_text) return plain(v.rich_text);
  return "";
}

export function extractIngredients(blocks) {
  const isHeading = (b) => /^heading_[123]$/.test(b.type);
  let start = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (isHeading(blocks[i]) && blockText(blocks[i]).normalize("NFKC").trim().startsWith("材料")) { start = i; break; }
  }
  if (start < 0) return { base: "", text: "" };
  const head = blockText(blocks[start]).normalize("NFKC");
  const base = (head.match(/\((.+?)\)/) || [])[1] || "";
  const lines = [];
  for (let i = start + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (isHeading(b)) break;
    const t = blockText(b).normalize("NFKC").replace(/[・.]{3,}/g, " … ").trim();
    if (t) lines.push(t);
  }
  return { base, text: lines.join("\n") };
}

export async function getRecipeDetail(id) {
  const [page, blocks] = await Promise.all([notion(`/pages/${id}`), allChildren(id)]);
  const s = await recipeSchema();
  const r = toRecipe(page, s);
  const ing = extractIngredients(blocks);
  return { ...r, base: ing.base, ingredients: ing.text };
}

/* ---------- 献立DB（なければレシピ記録ページの下に自動で作る） ---------- */
let planDbCache = null;
export async function planDbId() {
  if (planDbCache) return planDbCache;
  if (process.env.NOTION_PLAN_DB_ID) return (planDbCache = process.env.NOTION_PLAN_DB_ID.replace(/-/g, ""));
  const found = await notion("/search", {
    method: "POST",
    body: { query: PLAN_DB_TITLE, filter: { property: "object", value: "database" }, page_size: 10 },
  });
  const hit = found.results.find((d) => !d.archived && plain(d.title) === PLAN_DB_TITLE);
  if (hit) return (planDbCache = hit.id.replace(/-/g, ""));
  const s = await recipeSchema();
  if (!s.parentPageId) throw new NotionError(500, { message: "献立DBを作る場所（レシピ記録ページ）が見つかりません" });
  const created = await notion("/databases", {
    method: "POST",
    body: {
      parent: { type: "page_id", page_id: s.parentPageId },
      title: [{ type: "text", text: { content: PLAN_DB_TITLE } }],
      properties: {
        "名前": { title: {} },
        "日付": { date: {} },
        "食事": { select: { options: [{ name: "朝" }, { name: "昼" }, { name: "晩" }, { name: "＋α" }] } },
        "レシピ": { relation: { database_id: RECIPE_DB_ID, single_property: {} } },
        "内容": { rich_text: {} },
      },
    },
  });
  return (planDbCache = created.id.replace(/-/g, ""));
}

export const SLOT_LABEL = { m: "朝", l: "昼", d: "晩", x: "＋α" };
const LABEL_SLOT = Object.fromEntries(Object.entries(SLOT_LABEL).map(([k, v]) => [v, k]));

function parseItems(text) {
  try { const v = JSON.parse(text); return Array.isArray(v) ? v : []; } catch { return []; }
}

export async function listPlan(from, to) {
  const db = await planDbId();
  const cells = {};
  let cursor;
  do {
    const res = await notion(`/databases/${db}/query`, {
      method: "POST",
      body: {
        page_size: 100,
        start_cursor: cursor,
        filter: { and: [
          { property: "日付", date: { on_or_after: from } },
          { property: "日付", date: { on_or_before: to } },
        ] },
      },
    });
    for (const p of res.results) {
      const date = p.properties["日付"]?.date?.start?.slice(0, 10);
      const slot = LABEL_SLOT[p.properties["食事"]?.select?.name];
      const items = parseItems(plain(p.properties["内容"]?.rich_text));
      if (date && slot && items.length) cells[`${date}_${slot}`] = items;
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return cells;
}

// Notion のテキストは1要素2000文字まで。長いJSONは分割して入れる
function chunks(s, n = 1900) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push({ type: "text", text: { content: s.slice(i, i + n) } });
  return out;
}

export async function savePlanCell(date, slot, items) {
  const db = await planDbId();
  const label = SLOT_LABEL[slot];
  const existing = await notion(`/databases/${db}/query`, {
    method: "POST",
    body: { page_size: 10, filter: { and: [
      { property: "日付", date: { equals: date } },
      { property: "食事", select: { equals: label } },
    ] } },
  });
  const pages = existing.results;
  if (!items.length) {
    await Promise.all(pages.map((p) => notion(`/pages/${p.id}`, { method: "PATCH", body: { archived: true } })));
    return;
  }
  const recipeIds = [...new Set(items.filter((x) => x.type === "recipe" && x.id).map((x) => x.id))];
  const properties = {
    "名前": { title: [{ type: "text", text: { content: `${date} ${label}：${items.map((x) => x.name).join("、")}`.slice(0, 1900) } }] },
    "日付": { date: { start: date } },
    "食事": { select: { name: label } },
    "レシピ": { relation: recipeIds.map((id) => ({ id })) },
    "内容": { rich_text: chunks(JSON.stringify(items)) },
  };
  if (pages[0]) {
    await notion(`/pages/${pages[0].id}`, { method: "PATCH", body: { properties } });
    await Promise.all(pages.slice(1).map((p) => notion(`/pages/${p.id}`, { method: "PATCH", body: { archived: true } })));
  } else {
    await notion("/pages", { method: "POST", body: { parent: { database_id: db }, properties } });
  }
}
