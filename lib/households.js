// ワークスペース（コード上は「世帯」）ごとの合言葉。
//  - 持ち主（Kazukiさん家）：今までの APP_PASSWORD
//  - 友達のワークスペース：Upstash に記録。合言葉は友達が招待リンクから自分で決める（持ち主には見えない）
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { kv, kvMany, kvReady, jsonOr } from "./kv.js";

export const OWNER = { id: "home", name: "わが家", owner: true };
const INVITE_DAYS = 7;
const norm = (s) => String(s || "").normalize("NFKC").trim();
const hashOf = (pass) => createHash("sha256").update(norm(pass)).digest("hex");
const sameText = (a, b) => {
  const x = Buffer.from(norm(a)), y = Buffer.from(norm(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const infoKey = (id) => `hh:info:${id}`;
// 合言葉の目印（以前の作りでは合言葉そのものを持っていたので、その場合も読めるようにする）
const passHashOf = (info) => info?.passHash || (info?.pass ? hashOf(info.pass) : "");

// 合言葉からワークスペースを決める（見つからなければ null）
export async function householdFor(pass) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return OWNER; // 合言葉が未設定なら今まで通り誰でも持ち主として使える
  if (sameText(pass, expected)) return OWNER;
  if (!norm(pass) || !kvReady()) return null;
  const id = await kv("GET", `hh:code:${hashOf(pass)}`);
  if (!id) return null;
  const info = jsonOr(await kv("GET", infoKey(id)), null);
  return info ? { id, name: info.name, owner: false } : null;
}

// 合言葉として使えるか確かめる（短すぎ・重なりは断る）
async function checkPass(pass, selfId = "") {
  const p = norm(pass);
  if (p.length < 2) throw bad("合言葉は2文字以上にしてください");
  if (p.length > 40) throw bad("合言葉は40文字以内にしてください");
  if (process.env.APP_PASSWORD && sameText(p, process.env.APP_PASSWORD)) throw bad("その合言葉は使えません。別の言葉にしてください");
  const used = await kv("GET", `hh:code:${hashOf(p)}`);
  if (used && used !== selfId) throw bad("その合言葉は使えません。別の言葉にしてください");
  return p;
}

// 持ち主の画面に出す一覧（合言葉は出さない）
export async function listHouseholds() {
  if (!kvReady()) return [];
  const ids = (await kv("SMEMBERS", "hh:ids")) || [];
  const infos = await kvMany(ids.map((id) => ["GET", infoKey(id)]));
  const now = Date.now();
  return ids.map((id, i) => ({ id, info: jsonOr(infos[i], null) }))
    .filter((x) => x.info?.name)
    .map(({ id, info }) => {
      const inviteOk = info.invite && Date.parse(info.inviteExpires) > now;
      return {
        id, name: info.name, created: info.created,
        active: Boolean(passHashOf(info)),            // 友達が合言葉を決めて使い始めているか
        invite: inviteOk ? info.invite : "",          // まだ使われていない招待リンクの鍵
        inviteExpires: inviteOk ? info.inviteExpires : "",
      };
    })
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

// 招待リンクを作る（前の招待リンクは使えなくなる）
async function issueInvite(id, info) {
  const invite = randomBytes(12).toString("hex");
  const inviteExpires = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();
  const next = { ...info, invite, inviteExpires };
  await kvMany([
    ...(info.invite ? [["DEL", `hh:invite:${info.invite}`]] : []),
    ["SET", `hh:invite:${invite}`, id, "EX", INVITE_DAYS * 86400],
    ["SET", infoKey(id), JSON.stringify(next)],
  ]);
  return next;
}

export async function createHousehold(name) {
  const id = randomBytes(6).toString("hex");
  const info = { name: norm(name).slice(0, 30) || "友達の家", created: new Date().toISOString() };
  await kvMany([["SET", infoKey(id), JSON.stringify(info)], ["SADD", "hh:ids", id]]);
  const next = await issueInvite(id, info);
  return { id, name: next.name, invite: next.invite, inviteExpires: next.inviteExpires };
}

export async function reissueInvite(id) {
  const info = jsonOr(await kv("GET", infoKey(id)), null);
  if (!info) throw bad("そのワークスペースは見つかりません", 404);
  const next = await issueInvite(id, info);
  return { id, name: next.name, invite: next.invite, inviteExpires: next.inviteExpires };
}

// 招待リンクを開いた友達に、ワークスペース名を見せる
async function inviteTarget(invite) {
  const code = String(invite || "").replace(/[^0-9a-f]/gi, "").slice(0, 24);
  if (code.length !== 24) return null;
  const id = await kv("GET", `hh:invite:${code}`);
  const info = id ? jsonOr(await kv("GET", infoKey(id)), null) : null;
  if (!info || info.invite !== code) return null;
  return { id, info, code };
}
export async function inviteInfo(invite) {
  const t = await inviteTarget(invite);
  if (!t) throw bad("この招待リンクは使えません（期限切れか、すでに使われています）。招待した人にもう一度送ってもらってください", 404);
  return { name: t.info.name };
}

// 友達が招待リンクから合言葉を決める（前の合言葉があれば使えなくなる）
export async function acceptInvite(invite, pass) {
  const t = await inviteTarget(invite);
  if (!t) throw bad("この招待リンクは使えません（期限切れか、すでに使われています）。招待した人にもう一度送ってもらってください", 404);
  const p = await checkPass(pass, t.id);
  const old = passHashOf(t.info);
  const { pass: _drop, invite: _i, inviteExpires: _e, ...rest } = t.info;
  await kvMany([
    ...(old && old !== hashOf(p) ? [["DEL", `hh:code:${old}`]] : []),
    ["SET", `hh:code:${hashOf(p)}`, t.id],
    ["DEL", `hh:invite:${t.code}`],
    ["SET", infoKey(t.id), JSON.stringify({ ...rest, passHash: hashOf(p) })],
  ]);
  return { name: t.info.name };
}

// 友達が自分のワークスペースの合言葉を変える
export async function changeOwnPass(id, pass) {
  const info = jsonOr(await kv("GET", infoKey(id)), null);
  if (!info) throw bad("そのワークスペースは見つかりません", 404);
  const p = await checkPass(pass, id);
  const old = passHashOf(info);
  const { pass: _drop, ...rest } = info;
  await kvMany([
    ...(old && old !== hashOf(p) ? [["DEL", `hh:code:${old}`]] : []),
    ["SET", `hh:code:${hashOf(p)}`, id],
    ["SET", infoKey(id), JSON.stringify({ ...rest, passHash: hashOf(p) })],
  ]);
}

export async function deleteHousehold(id) {
  const info = jsonOr(await kv("GET", infoKey(id)), null);
  const listIds = (await kv("LRANGE", `hh:${id}:lists`, 0, -1)) || [];
  const old = passHashOf(info);
  await kvMany([
    ...(old ? [["DEL", `hh:code:${old}`]] : []),
    ...(info?.invite ? [["DEL", `hh:invite:${info.invite}`]] : []),
    ["DEL", infoKey(id)],
    ["DEL", `hh:${id}:cells`],
    ["DEL", `hh:${id}:lists`],
    ...listIds.map((l) => ["DEL", `hh:${id}:list:${l}`]),
    ["SREM", "hh:ids", id],
  ]);
}
