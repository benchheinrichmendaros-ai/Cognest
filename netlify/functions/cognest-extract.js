exports.handler = async (event) => {
  try {
    const raw = String(event.queryStringParameters?.url || "").trim();
    if (!raw) {
      return json(400, { error: "Missing url" });
    }

    const url = normalizeUrl(raw);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = await res.text();
    const title =
      meta(html, "og:title") ||
      meta(html, "twitter:title") ||
      tagTitle(html) ||
      hostFromUrl(url);

    const image =
      meta(html, "og:image") ||
      meta(html, "twitter:image") ||
      firstImage(html, url);

    const text = extractMainText(html);

    return json(200, {
      url,
      title,
      image,
      text,
    });
  } catch (err) {
    return json(500, {
      error: err.message || "Clean mode failed",
      url: String(event.queryStringParameters?.url || ""),
      title: "",
      image: "",
      text: `Clean mode failed: ${err.message || "Unknown error"}`,
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

function normalizeUrl(raw) {
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).href;
    return new URL(`https://${raw}`).href;
  } catch {
    return raw;
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    "i"
  );
  const m = String(html || "").match(re1) || String(html || "").match(re2);
  return m ? decodeEntities(m[1]).trim() : "";
}

function tagTitle(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])).trim() : "";
}

function firstImage(html, url) {
  const img = String(html || "").match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (!img) return "";
  try {
    return new URL(img[1], url).href;
  } catch {
    return img[1];
  }
}

function extractMainText(html) {
  const source = String(html || "");

  const candidates = [];
  const article = source.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const main = source.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (article) candidates.push(article[1]);
  if (main) candidates.push(main[1]);
  if (body) candidates.push(body[1]);
  candidates.push(source);

  let best = candidates[0] || source;
  for (const c of candidates) {
    if ((c || "").length > best.length) best = c;
  }

  best = best
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  best = best
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/article|\/section|\/main|\/tr|\/table|\/blockquote|\/ul|\/ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+>/g, " ");

  best = decodeEntities(best)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return best.slice(0, 18000);
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
