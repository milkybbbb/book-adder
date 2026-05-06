export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DATABASE_ID = process.env.DATABASE_ID;

  const { title, author, description, cover, link, category } = req.body;

  const properties = {
    書名: { title: [{ text: { content: title || "" } }] },
    作者: { rich_text: [{ text: { content: author || "" } }] },
    內容簡介: { rich_text: [{ text: { content: (description || "").slice(0, 2000) } }] },
    封面圖: { url: cover || null },
    書籍連結: { url: link || null },
  };

  if (category) {
    properties["類型"] = {
      multi_select: category.split(",").map((c) => ({ name: c.trim() })).filter((c) => c.name),
    };
  }

  try {
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parent: { database_id: DATABASE_ID }, properties }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message });
    res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
