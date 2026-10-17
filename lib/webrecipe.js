// レシピサイトのページから材料を取り出す（AIに渡す材料テキストを作る）
const MAX_BYTES = 2_000_000;

function isAllowedUrl(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (!/^https?:$/.test(url.protocol)) return false;
  const h = url.hostname.toLowerCase();
  // 自分のサーバー内部などには取りに行かない
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(\d+\.){3}\d+$/.test(h) || h.includes(":")) return false;
  return true;
}

const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

// 多くのレシピサイトは、検索エンジン向けに材料をJSON-LD（Recipe）で埋め込んでいる
function fromJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const visit = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const r = visit(n); if (r) return r; } return null; }
    const type = [].concat(node["@type"] || []);
    if (type.includes("Recipe") && Array.isArray(node.recipeIngredient)) return node;
    return visit(node["@graph"]) || null;
  };
  for (const b of blocks) {
    try {
      const r = visit(JSON.parse(b.trim()));
      if (r) {
        const yieldText = [].concat(r.recipeYield || []).join(" ");
        return { base: decode(String(yieldText)), text: r.recipeIngredient.map((x) => decode(String(x))).join("\n") };
      }
    } catch { /* 壊れたJSONは飛ばす */ }
  }
  return null;
}

// JSON-LDがないページは、本文から「材料」付近を切り出す
function fromText(html) {
  const text = decode(html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|tr|div|h\d|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t　]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const i = text.search(/材料/);
  if (i < 0) return null;
  return { base: "", text: text.slice(i, i + 2500) };
}

export async function readRecipePage(url) {
  if (!isAllowedUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (kondate recipe reader)", "Accept-Language": "ja,en;q=0.8" },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    const html = new TextDecoder("utf-8").decode(buf);
    return fromJsonLd(html) || fromText(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
