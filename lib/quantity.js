// 分量の計算はすべてここ（プログラム）で行う。AIは材料を「食材名・数・単位」に読み取るだけ。
//  - 単位の定義：大さじ＝15ml、小さじ＝5ml、カップ＝200ml、kg＝1000g など
//  - 倍率の掛け算・合算・表示用の丸め

// 読み取りで使ってよい単位（AIにはこの中から選ばせる）
export const UNITS = [
  "g", "kg", "ml", "l", "大さじ", "小さじ", "カップ",
  "個", "本", "枚", "株", "束", "玉", "かけ", "片", "房", "パック", "袋", "缶", "切れ", "尾", "さや", "粒", "杯", "合", "cm",
  "少々", "ひとつまみ", "適量",
];

// 単位ごとの種類（w＝重さ、v＝体積、pinch＝少々の類、free＝適量）と、基準単位への換算
const DEF = {
  g: ["w", 1], kg: ["w", 1000],
  ml: ["v", 1], l: ["v", 1000], 大さじ: ["v", 15], 小さじ: ["v", 5], カップ: ["v", 200],
  少々: ["pinch", 0], ひとつまみ: ["pinch", 0], 適量: ["free", 0],
};
const dimOf = (unit) => DEF[unit]?.[0] || `n:${unit}`; // 個・本などは単位ごとに数える
const toBase = (qty, unit) => (DEF[unit] ? qty * DEF[unit][1] : qty);

// 決まり：献立に1つ登録した料理＝1人分。人数のボタンは、リストを作るときに全体へ掛ける
// 倍率 ＝ 人数 × 登録した回数 ÷ 元のレシピが何人分か
export function baseServings(base) {
  const b = String(base || "").normalize("NFKC");
  const m = b.match(/(\d+(?:\.\d+)?)(?:\s*[~〜～-]\s*\d+(?:\.\d+)?)?\s*(人分|人前|食分|杯分|杯|人)/);
  return m ? Number(m[1]) : null; // 書いていない・「5本分」など人数でないときは null
}
export function servingsOf(r) {
  return Number(r.servings) || baseServings(r.base) || 2; // わからないときは2人分とみなす
}
export function scaleOf(r, people) {
  const count = r.count || 1;
  const n = servingsOf(r);
  return { factor: (people * count) / n, servings: n, guessed: !r.servings && !baseServings(r.base) };
}

// 表示用：1.5 → 「1と1/2」、0.333 → 「1/3」
const FRACS = [[1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]];
export function fmtNum(x) {
  if (!(x > 0)) return "0";
  const whole = Math.floor(x + 0.02), frac = x - whole;
  if (Math.abs(frac) < 0.02) return String(whole);
  const hit = FRACS.find(([v]) => Math.abs(frac - v) < 0.03);
  if (hit) return whole ? `${whole}と${hit[1]}` : hit[1];
  return String(Math.round(x * 10) / 10);
}
function fmtWeight(g) {
  if (g >= 1000) return `${Math.round(g / 100) / 10}kg`;
  return g < 10 ? `${Math.round(g * 10) / 10}g` : `${Math.round(g)}g`;
}
function fmtVolume(ml) {
  if (ml < 15) return `小さじ${fmtNum(ml / 5)}`;
  if (ml <= 60) return `大さじ${fmtNum(ml / 15)}`;
  return ml >= 1000 ? `${Math.round(ml / 100) / 10}L` : `${Math.round(ml)}ml`;
}

// 読み取った材料（倍率つき）を合算して、買い出しリストの形にする
//  entries: [{ name, qty, unit, cat, staple, opt, memo, mult, from }]
export function aggregate(entries, cats) {
  const by = new Map();
  for (const e of entries) {
    const name = String(e.name || "").trim();
    if (!name) continue;
    const g = by.get(name) || { name, dims: new Map(), cat: "", staple: false, allOpt: true, notes: new Set(), from: new Set() };
    const unit = UNITS.includes(e.unit) ? e.unit : "適量";
    const dim = dimOf(unit);
    const qty = Number(e.qty) > 0 ? Number(e.qty) : 0;
    const add = dim === "pinch" || dim === "free" ? 0 : toBase(qty, unit) * (Number(e.mult) || 0);
    g.dims.set(dim, (g.dims.get(dim) || 0) + add);
    if (!g.cat && e.cat) g.cat = e.cat;
    if (e.staple) g.staple = true;
    if (!e.opt) g.allOpt = false;
    if (e.memo) g.notes.add(String(e.memo).slice(0, 40));
    if (e.from) g.from.add(e.from);
    by.set(name, g);
  }

  const buy = new Map(), check = [];
  for (const g of by.values()) {
    const recipes = [...g.from];
    if (g.staple) { check.push({ name: g.name, recipes }); continue; }
    const parts = [];
    for (const [dim, total] of g.dims) {
      if (dim === "w" && total > 0) parts.push(fmtWeight(total));
      else if (dim === "v" && total > 0) parts.push(fmtVolume(total));
      else if (dim.startsWith("n:") && total > 0) parts.push(`${fmtNum(total)}${dim.slice(2)}`);
    }
    if (!parts.length) parts.push(g.dims.has("pinch") && !g.dims.has("free") ? "少々" : "適量");
    const notes = [...g.notes];
    if (g.allOpt && !notes.some((n) => n.includes("好み"))) notes.unshift("好みで");
    const cat = cats.includes(g.cat) ? g.cat : "その他";
    if (!buy.has(cat)) buy.set(cat, []);
    buy.get(cat).push({ name: g.name, amount: parts.join("＋"), note: notes.join("・"), recipes });
  }
  return {
    buy: [...buy].map(([category, items]) => ({ category, items })),
    check,
  };
}
