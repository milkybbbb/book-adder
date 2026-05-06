export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { pid } = req.query;
  if (!pid) return res.status(400).json({ error: "missing pid" });

  try {
    // Step 1: Fetch eslite product page with Googlebot UA to get og tags
    const pageResp = await fetch(`https://www.eslite.com/product/${pid}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html",
      },
    });
    const html = await pageResp.text();

    const og = (prop) => {
      const m = html.match(new RegExp(`property=["']${prop}["']\\s+content=["'](.*?)["']\\s*`));
      return m ? m[1] : "";
    };

    const pageTitle = (og("og:title") || "").replace(/\s*\|\s*誠品線上.*$/, "").trim();
    const pageDesc = og("og:description");
    const pageImage = og("og:image");

    if (!pageTitle) return res.status(404).json({ error: "找不到書籍資訊" });

    // Step 2: Search athena by title to get full structured data
    const kw = encodeURIComponent(pageTitle);
    const athenaResp = await fetch(
      `https://athena.eslite.com/api/v2/search?keyword=${kw}&size=1&page=1`,
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } }
    );
    const athenaData = await athenaResp.json();
    const hit = (athenaData?.hits?.hit || [])[0];
    const fields = hit?.fields || {};

    // Step 3: Fetch category tree for mapping
    const catResp = await fetch("https://athena.eslite.com/api/v1/categories", {
      headers: { Accept: "application/json" },
    });
    const catData = await catResp.json();
    const catFlat = {};
    function flatten(items, path) {
      for (const c of items) {
        const p = path ? path + "/" + c.description : c.description;
        catFlat[String(c.id)] = p;
        if (c.children?.length) flatten(c.children, p);
      }
    }
    flatten(catData, "");

    const catIds = fields.categories || [];
    const catPaths = catIds.map((id) => catFlat[String(id)] || "");

    // Category mapping
    const CAT_MAP = {
      商業財經: "商業", 經濟: "商業", 管理: "商業", 行銷: "商業", 企業: "商業", 創業: "商業",
      理財: "財務", 投資: "財務", 金融: "財務",
      心理勵志: "心理", 大眾心理學: "心理", 心理學: "心理",
      科學: "科普", 科普: "科普", 數學: "科普", 物理: "科普", 生物: "科普", 醫學: "科普", 社會科學: "科普",
      歷史: "傳記", 傳記: "傳記", 人文史哲: "傳記", 哲學: "傳記",
      文學: "小說", 小說: "小說", 散文: "小說", 輕小說: "小說",
      藝術設計: "藝術", 建築: "藝術", 設計: "藝術", 電影: "藝術", 音樂: "藝術", 攝影: "藝術",
      職場: "產業", 產業: "產業",
    };
    const joined = catPaths.join(" ");
    const cats = new Set();
    for (const [key, val] of Object.entries(CAT_MAP)) {
      if (joined.includes(key)) cats.add(val);
    }

    const authors = fields.author || [];
    const coverPath = Array.isArray(fields.product_photo_url)
      ? fields.product_photo_url[0]
      : fields.product_photo_url || "";
    const coverUrl = coverPath
      ? "https://s.eslite.com" + coverPath
      : pageImage;

    res.status(200).json({
      title: pageTitle,
      author: authors.join("、"),
      description: fields.description || pageDesc || "",
      cover: coverUrl,
      link: `https://www.eslite.com/product/${hit?.id || pid}`,
      category: [...cats].join(", "),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
