// 友達の世帯のデータ置き場（Upstash Redis）。VercelでつないだときにできるREST用のURLと鍵を使う
function env() {
  const e = process.env;
  // つなぎ方（接頭辞）によって名前が変わるので、いくつかの候補から探す
  const url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL || e.STORAGE_REST_API_URL
    || Object.entries(e).find(([k]) => k.endsWith("_REST_API_URL"))?.[1];
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN || e.STORAGE_REST_API_TOKEN
    || Object.entries(e).find(([k]) => k.endsWith("_REST_API_TOKEN") && !k.includes("READ_ONLY"))?.[1];
  return { url: url && url.replace(/\/$/, ""), token };
}

export const kvReady = () => { const { url, token } = env(); return Boolean(url && token); };

async function call(path, body) {
  const { url, token } = env();
  if (!url || !token) throw Object.assign(new Error("友達用のデータ置き場がまだつながっていません"), { status: 500 });
  const res = await fetch(url + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw Object.assign(new Error(`データ置き場のエラー: ${json.error || res.status}`), { status: 500 });
  return json;
}

// 1つの命令（例：kv("GET", "key")）
export async function kv(...cmd) {
  return (await call("", cmd.map(String))).result;
}
// まとめて送る（例：kvMany([["GET","a"],["GET","b"]])）
export async function kvMany(cmds) {
  if (!cmds.length) return [];
  const out = await call("/pipeline", cmds.map((c) => c.map(String)));
  return out.map((r) => { if (r.error) throw new Error(r.error); return r.result; });
}

export const jsonOr = (s, fallback) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };
