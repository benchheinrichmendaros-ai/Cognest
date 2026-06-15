exports.handler = async (event) => {
  try {
    const q = String(event.queryStringParameters?.q || "").trim();
    const type = String(event.queryStringParameters?.type || "web").toLowerCase();

    if (!q) {
      return json(200, { results: [] });
    }

    const query =
      type === "video"
        ? `site:youtube.com OR site:vimeo.com OR site:ted.com ${q}`
        : q;

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = await res.text();
    const results = parseDuckDuckGo(html, type).slice(0, 12);

    return json(200, { results });
  } catch (err) {
    return json(500, {
      error: err.message || "Search failed",
      results: [],
    });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}

function parseDuckDuckGo(html, type) {
  const blocks = String(html || "").split('<div class="result').slice(1);
  const out = [];

  for (const block of blocks) {
    const titleMatch = block.match(
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!titleMatch) continue;

    const url = cleanUrl(titleMatch[1]);
    const title = stripTags(titleMatch[2]);

    let snippet = "";
    const snippetMatch = block.match(
      /result__snippet[^>]*>([\s\S]*?)<\/(?:span|a|div)>/i
    );
    if (snippetMatch) snippet = stripTags(snippetMatch[1]);

    if (!snippet) {
      const fallback = block.match(/<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
      if (fallback) snippet = stripTags(fallback[1]);
    }

    out.push({
      id: `ddg_${out.length}_${Date.now()}`,
      title,
      url,
      snippet,
      source: type === "video" ? "Video search" : "Web search",
      type,
    });
  }

  return out;
}

function cleanUrl(raw) {
  try {
    const u = new URL(raw, "https://duckduckgo.com");
    if (
      u.hostname.includes("duckduckgo.com") &&
      (u.pathname === "/l/" || u.pathname === "/l")
    ) {
      const dest = u.searchParams.get("uddg");
      return dest ? decodeURIComponent(dest) : raw;
    }
    return u.href;
  } catch {
    return raw;
  }
}

function stripTags(input) {
  return decodeEntities(
    String(input || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeEntities(input) {
  return String(input || "").replace(
    /&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);/g,
    (m, code) => {
      if (code === "amp") return "&";
      if (code === "lt") return "<";
      if (code === "gt") return ">";
      if (code === "quot") return '"';
      if (code === "apos") return "'";
      if (code === "nbsp") return " ";
      if (code.startsWith("#x")) return String.fromCharCode(parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCharCode(parseInt(code.slice(1), 10));
      return m;
    }
  );
  }
