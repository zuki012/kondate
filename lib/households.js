// 世帯（家）ごとの合言葉。Kazukiさん家（持ち主）は今までの APP_PASSWORD、友達の家は Upstash に記録する
import { createHash, randomInt, randomBytes, timingSafeEqual } from "node:crypto";
import { kv, kvMany, kvReady, jsonOr } from "./kv.js";

export const OWNER = { id: "home", name: "わが家", owner: true };
const norm = (s) => String(s || "").normalize("NFKC").trim();
const hashOf = (pass) => createHash("sha256").update(norm(pass)).digest("hex");
const sameText = (a, b) => {
  const x = Buffer.from(norm(a)), y = Buffer.from(norm(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// 合言葉から世帯を決める（見つからなければ null）
export async function householdFor(pass) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return OWNER; // 合言葉が未設定なら今まで通り誰でも持ち主として使える
  if (sameText(pass, expected)) return OWNER;
  if (!norm(pass) || !kvReady()) return null;
  const id = await kv("GET", `hh:code:${hashOf(pass)}`);
  if (!id) return null;
  const info = jsonOr(await kv("GET", `hh:info:${id}`), null);
  return info ? { id, name: info.name, owner: false } : null;
}

// 覚えやすい合言葉を作る（例：なす-ごま-482）
const WORDS = ["とまと", "なす", "きゃべつ", "たまご", "みそ", "のり", "ごま", "しいたけ", "かぼちゃ", "れんこん",
  "だいこん", "ねぎ", "みかん", "りんご", "もも", "くり", "しょうが", "えだまめ", "こんぶ", "わかめ"];
const newPass = () => {
  const i = randomInt(WORDS.length), j = (i + 1 + randomInt(WORDS.length - 1)) % WORDS.length; // 2つは別の言葉にする
  return `${WORDS[i]}-${WORDS[j]}-${randomInt(100, 1000)}`;
};

// Kazukiさんが決めた合言葉を確かめる（短すぎ・重なりは断る）
async function checkChosenPass(pass, selfId = "") {
  const p = norm(pass);
  if (p.length < 4) throw Object.assign(new Error("合言葉は4文字以上にしてください"), { status: 400 });
  if (p.length > 40) throw Object.assign(new Error("合言葉は40文字以内にしてください"), { status: 400 });
  if (process.env.APP_PASSWORD && sameText(p, process.env.APP_PASSWORD)) throw Object.assign(new Error("わが家の合言葉と同じものは使えません"), { status: 400 });
  const owner = await kv("GET", `hh:code:${hashOf(p)}`);
  if (owner && owner !== selfId) throw Object.assign(new Error("その合言葉はほかのワークスペースで使われています"), { status: 400 });
  return p;
}

async function freePass() {
  for (let i = 0; i < 10; i++) {
    const p = newPass();
    if (process.env.APP_PASSWORD && sameText(p, process.env.APP_PASSWORD)) continue;
    if (!(await kv("EXISTS", `hh:code:${hashOf(p)}`))) return p;
  }
  throw new Error("合言葉を作れませんでした。もう一度試してください");
}

export async function listHouseholds() {
  if (!kvReady()) return [];
  const ids = (await kv("SMEMBERS", "hh:ids")) || [];
  const infos = await kvMany(ids.map((id) => ["GET", `hh:info:${id}`]));
  return ids.map((id, i) => ({ id, ...jsonOr(infos[i], {}) }))
    .filter((h) => h.name)
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

export async function createHousehold(name, chosen = "") {
  const id = randomBytes(6).toString("hex");
  const pass = norm(chosen) ? await checkChosenPass(chosen) : await freePass();
  const info = { name: norm(name).slice(0, 30) || "友達の家", pass, created: new Date().toISOString() };
  await kvMany([
    ["SET", `hh:info:${id}`, JSON.stringify(info)],
    ["SET", `hh:code:${hashOf(pass)}`, id],
    ["SADD", "hh:ids", id],
  ]);
  return { id, ...info };
}

export async function resetHouseholdPass(id, chosen = "") {
  const info = jsonOr(await kv("GET", `hh:info:${id}`), null);
  if (!info) throw Object.assign(new Error("そのワークスペースは見つかりません"), { status: 404 });
  const pass = norm(chosen) ? await checkChosenPass(chosen, id) : await freePass();
  await kvMany([
    ["DEL", `hh:code:${hashOf(info.pass)}`],
    ["SET", `hh:code:${hashOf(pass)}`, id],
    ["SET", `hh:info:${id}`, JSON.stringify({ ...info, pass })],
  ]);
  return { id, ...info, pass };
}

export async function deleteHousehold(id) {
  const info = jsonOr(await kv("GET", `hh:info:${id}`), null);
  const listIds = (await kv("LRANGE", `hh:${id}:lists`, 0, -1)) || [];
  await kvMany([
    ...(info ? [["DEL", `hh:code:${hashOf(info.pass)}`]] : []),
    ["DEL", `hh:info:${id}`],
    ["DEL", `hh:${id}:cells`],
    ["DEL", `hh:${id}:lists`],
    ...listIds.map((l) => ["DEL", `hh:${id}:list:${l}`]),
    ["SREM", "hh:ids", id],
  ]);
}
