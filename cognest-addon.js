(() => {
  if (window.__COGNEST_SEARCH_ADDON__) return;
  window.__COGNEST_SEARCH_ADDON__ = true;

  const STORAGE_KEY = "cognest_v3";
  const CLIP_KEY = "cognest_clips_v1";
  const SEARCH_FN = "/.netlify/functions/cognest-search";
  const EXTRACT_FN = "/.netlify/functions/cognest-extract";

  const state = {
    open: false,
    tab: "web",
    query: "",
    loading: false,
    results: [],
    message: "",
    viewer: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const uid = () =>
    (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `cgx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function normalize(text) {
    return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function shorten(text, n = 160) {
    const s = String(text ?? "").trim();
    return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
  }

  function hostFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function getProjects() {
    const store = readJSON(STORAGE_KEY, null);
    return Array.isArray(store?.projects) ? store.projects : [];
  }

  function getLinks() {
    const projects = getProjects();
    const items = [];
    for (const project of projects) {
      for (const item of project.items || []) {
        items.push({
          kind: "link",
          projectName: project.name || "Library",
          projectId: project.id || "",
          ...item,
        });
      }
    }
    return items;
  }

  function getClips() {
    const clips = readJSON(CLIP_KEY, []);
    return Array.isArray(clips) ? clips : [];
  }

  function saveClip(clip) {
    const clips = getClips();
    clips.unshift({
      id: uid(),
      savedAt: new Date().toISOString(),
      ...clip,
    });
    writeJSON(CLIP_KEY, clips.slice(0, 300));
  }

  function openApp() {
    state.open = true;
    state.viewer = null;
    render();
    setTimeout(() => $("#cgx-query")?.focus(), 20);
  }

  function closeApp() {
    state.open = false;
    state.viewer = null;
    render();
  }

  function setTab(tab) {
    state.tab = tab;
    state.results = [];
    state.message = "";
    render();
    runSearch();
  }

  function searchLocalSaved(query) {
    const q = normalize(query);
    const links = getLinks();
    const clips = getClips().map((clip) => ({
      kind: "clip",
      projectName: "Clips",
      ...clip,
    }));

    const all = [...clips, ...links];
    if (!q) {
      return all.slice(0, 30).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    }

    return all.filter((item) => {
      const hay = normalize(
        [
          item.title,
          item.url,
          item.description,
          item.publisher,
          item.projectName,
          item.text,
          item.content,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return hay.includes(q);
    });
  }

  async function fetchJSON(url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
  }

  async function runSearch() {
    const q = state.query.trim();
    if (state.tab === "saved") {
      state.loading = false;
      state.results = searchLocalSaved(q);
      state.message = q ? "" : "Search your saved links and clean clips.";
      render();
      return;
    }

    if (!q) {
      state.results = [];
      state.message = `Type something to search ${state.tab === "video" ? "videos" : "the web"}.`;
      render();
      return;
    }

    state.loading = true;
    state.message = "";
    render();

    try {
      const url = `${SEARCH_FN}?type=${encodeURIComponent(state.tab)}&q=${encodeURIComponent(q)}`;
      const data = await fetchJSON(url);
      state.results = Array.isArray(data.results) ? data.results : [];
      state.message = state.results.length ? "" : "No results found.";
    } catch (err) {
      state.results = [];
      state.message = `Search failed: ${err.message || "Unknown error"}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  let searchTimer = null;
  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 220);
  }

  async function openPreview(item) {
    state.viewer = {
      mode: "preview",
      title: item.title || item.url,
      url: item.url,
      source: item.source || item.projectName || "Web",
      snippet: item.snippet || item.description || "",
      loading: false,
      clean: null,
      contentType: item.kind === "clip" ? "clip" : "link",
      item,
    };
    render();
  }

  async function openClean(item) {
    state.viewer = {
      mode: "clean",
      title: item.title || item.url,
      url: item.url,
      source: item.source || item.projectName || "Web",
      loading: true,
      clean: null,
      contentType: item.kind === "clip" ? "clip" : "link",
      item,
    };
    render();

    try {
      if (item.kind === "clip" && item.text) {
        state.viewer.clean = {
          title: item.title || item.url,
          image: item.image || "",
          text: item.text || "",
          url: item.url || "",
        };
      } else {
        const data = await fetchJSON(`${EXTRACT_FN}?url=${encodeURIComponent(item.url)}`);
        state.viewer.clean = data;
      }
    } catch (err) {
      state.viewer.clean = {
        title: item.title || item.url,
        image: "",
        text: `Clean mode failed: ${err.message || "Unknown error"}`,
        url: item.url || "",
      };
    } finally {
      state.viewer.loading = false;
      render();
    }
  }

  function saveCurrentClip() {
    const v = state.viewer;
    if (!v?.clean) return;
    saveClip({
      url: v.url || "",
      title: v.clean.title || v.title || v.url || "Untitled",
      image: v.clean.image || "",
      text: v.clean.text || "",
      source: v.source || "Web",
    });
    state.message = "Saved to your Clean Clips.";
    render();
  }

  function openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyCleanText() {
    const text = state.viewer?.clean?.text || "";
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      state.message = "Clean text copied.";
      render();
    }).catch(() => {
      state.message = "Could not copy text.";
      render();
    });
  }

  function resultLabel(item) {
    if (item.kind === "clip") return "Clean clip";
    if (item.kind === "link") return item.projectName || "Saved link";
    return item.type === "video" ? "Video" : item.type === "image" ? "Image" : "Web";
  }

  function resultActions(item) {
    const cleanBtn = item.url ? `<button class="cgx-btn cgx-btn-secondary" data-action="clean" data-id="${esc(item.id || item.url)}">Clean Mode</button>` : "";
    const openBtn = item.url ? `<button class="cgx-btn cgx-btn-primary" data-action="open" data-id="${esc(item.id || item.url)}">Open</button>` : "";
    return `${openBtn}${cleanBtn}`;
  }

  function getResultKey(item, index) {
    return item.id || item.url || `${item.title || "item"}_${index}`;
  }

  function renderResults() {
    const resultsEl = $("#cgx-results");
    if (!resultsEl) return;

    if (state.viewer) {
      const v = state.viewer;
      if (v.mode === "preview") {
        resultsEl.innerHTML = `
          <div class="cgx-viewer-head">
            <button class="cgx-back" data-action="back">← Back</button>
            <div class="cgx-viewer-actions">
              <button class="cgx-btn cgx-btn-secondary" data-action="clean" data-url="${esc(v.url)}">Clean Mode</button>
              <button class="cgx-btn cgx-btn-primary" data-action="open-external" data-url="${esc(v.url)}">Open external</button>
            </div>
          </div>
          <div class="cgx-viewer-meta">
            <div class="cgx-viewer-title">${esc(v.title || v.url)}</div>
            <div class="cgx-viewer-sub">${esc(v.source || "")}${v.snippet ? " • " + esc(v.snippet) : ""}</div>
          </div>
          <div class="cgx-iframe-wrap">
            <iframe class="cgx-iframe" src="${esc(v.url)}" title="${esc(v.title || "Preview")}" referrerpolicy="no-referrer"></iframe>
          </div>
          <p class="cgx-note">Some websites block embedded previews. If that happens, use <b>Open external</b> or <b>Clean Mode</b>.</p>
        `;
        return;
      }

      const clean = v.clean || {};
      const paras = String(clean.text || "")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 80)
        .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
        .join("");

      resultsEl.innerHTML = `
        <div class="cgx-viewer-head">
          <button class="cgx-back" data-action="back">← Back</button>
          <div class="cgx-viewer-actions">
            <button class="cgx-btn cgx-btn-secondary" data-action="copy-clean">Copy text</button>
            <button class="cgx-btn cgx-btn-secondary" data-action="save-clip">Save clip</button>
            <button class="cgx-btn cgx-btn-primary" data-action="open-external" data-url="${esc(v.url)}">Open source</button>
          </div>
        </div>
        <div class="cgx-clean">
          <div class="cgx-viewer-title">${esc(clean.title || v.title || v.url)}</div>
          <div class="cgx-viewer-sub">${esc(v.source || "")}${v.url ? " • " + esc(v.url) : ""}</div>
          ${clean.image ? `<img class="cgx-clean-image" src="${esc(clean.image)}" alt="">` : ""}
          <div class="cgx-clean-text">${paras || `<p>${esc(String(clean.text || "No readable text was found on this page."))}</p>`}</div>
        </div>
      `;
      return;
    }

    const items = state.results || [];
    if (state.loading) {
      resultsEl.innerHTML = `<div class="cgx-empty">Loading…</div>`;
      return;
    }

    if (!items.length) {
      resultsEl.innerHTML = `<div class="cgx-empty">${esc(state.message || "No results yet.")}</div>`;
      return;
    }

    resultsEl.innerHTML = items.map((item, index) => {
      const key = getResultKey(item, index);
      const title = item.title || item.url || "Untitled";
      const sub = item.projectName || item.publisher || item.source || "";
      const snippet = item.snippet || item.description || item.text || item.content || "";
      const host = item.url ? hostFromUrl(item.url) : "";
      const label = resultLabel(item);
      return `
        <article class="cgx-card" data-key="${esc(key)}">
          <div class="cgx-card-top">
            <div class="cgx-card-badge">${esc(label)}</div>
            ${host ? `<div class="cgx-card-host">${esc(host)}</div>` : ""}
          </div>
          <h3 class="cgx-card-title">${esc(title)}</h3>
          ${sub ? `<div class="cgx-card-sub">${esc(sub)}</div>` : ""}
          ${snippet ? `<p class="cgx-card-snippet">${esc(shorten(snippet, 180))}</p>` : ""}
          ${item.url ? `<div class="cgx-card-url">${esc(item.url)}</div>` : ""}
          <div class="cgx-card-actions">
            ${item.url ? resultActions(item) : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderShell() {
    const existing = $("#cgx-addon-root");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = "cgx-addon-root";
    root.innerHTML = `
      <style>
        #cgx-addon-root{position:fixed;inset:0;z-index:999999;pointer-events:none;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .cgx-launcher{position:fixed;right:18px;bottom:18px;pointer-events:auto}
        .cgx-launcher button{border:0;border-radius:999px;padding:12px 16px;background:#5B8DEF;color:#fff;font-weight:700;box-shadow:0 10px 30px rgba(91,141,239,.35);cursor:pointer}
        .cgx-overlay{position:fixed;inset:0;background:rgba(10,15,25,.55);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;pointer-events:auto}
        .cgx-hidden{display:none}
        .cgx-panel{width:min(100%,980px);max-height:92vh;background:#fff;border-radius:22px 22px 0 0;overflow:hidden;box-shadow:0 -20px 60px rgba(0,0,0,.22);display:flex;flex-direction:column}
        @media (min-width: 768px){.cgx-overlay{align-items:center;padding:24px}.cgx-panel{border-radius:22px;max-height:88vh}}
        .cgx-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #E2E8F0;gap:12px}
        .cgx-brand{display:flex;flex-direction:column}
        .cgx-brand strong{font-size:15px;color:#1A1F2E}
        .cgx-brand span{font-size:12px;color:#64748B}
        .cgx-close{border:0;background:#F1F5F9;width:38px;height:38px;border-radius:12px;cursor:pointer}
        .cgx-controls{display:grid;grid-template-columns:1fr;gap:12px;padding:14px 18px;border-bottom:1px solid #E2E8F0}
        .cgx-tabs{display:flex;gap:8px;flex-wrap:wrap}
        .cgx-tab{border:1px solid #E2E8F0;background:#fff;color:#334155;border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:700;font-size:13px}
        .cgx-tab.active{background:#5B8DEF;color:#fff;border-color:#5B8DEF}
        .cgx-input{width:100%;border:1.5px solid #CBD5E1;border-radius:14px;padding:14px 14px;font-size:15px;outline:none}
        .cgx-input:focus{border-color:#5B8DEF;box-shadow:0 0 0 4px rgba(91,141,239,.12)}
        .cgx-body{padding:14px 18px 18px;overflow:auto}
        .cgx-message{font-size:13px;color:#64748B;margin:0 0 12px}
        .cgx-grid{display:grid;grid-template-columns:1fr;gap:12px}
        @media (min-width: 860px){.cgx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .cgx-card{border:1px solid #E2E8F0;border-radius:18px;padding:14px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.05)}
        .cgx-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
        .cgx-card-badge{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#5B8DEF;background:rgba(91,141,239,.08);padding:4px 8px;border-radius:999px}
        .cgx-card-host{font-size:12px;color:#94A3B8}
        .cgx-card-title{font-size:15px;line-height:1.45;margin:0 0 6px;color:#1A1F2E}
        .cgx-card-sub{font-size:12px;color:#64748B;margin-bottom:8px}
        .cgx-card-snippet{font-size:13px;color:#334155;line-height:1.55;margin:0 0 10px}
        .cgx-card-url{font-size:12px;color:#94A3B8;word-break:break-all;margin-bottom:10px}
        .cgx-card-actions,.cgx-viewer-actions{display:flex;gap:8px;flex-wrap:wrap}
        .cgx-btn{border:0;border-radius:12px;padding:10px 12px;font-weight:700;cursor:pointer;font-size:13px}
        .cgx-btn-primary{background:#5B8DEF;color:#fff}
        .cgx-btn-secondary{background:#EFF4FF;color:#2B5FCE}
        .cgx-empty{padding:34px 14px;text-align:center;color:#64748B}
        .cgx-viewer-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
        .cgx-back{border:0;background:#F1F5F9;border-radius:12px;padding:10px 12px;cursor:pointer;font-weight:700}
        .cgx-viewer-meta{margin-bottom:12px}
        .cgx-viewer-title{font-size:22px;font-weight:800;line-height:1.25;color:#1A1F2E}
        .cgx-viewer-sub{font-size:13px;color:#64748B;margin-top:6px;word-break:break-word}
        .cgx-iframe-wrap{height:min(64vh,720px);border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;background:#F8FAFC}
        .cgx-iframe{width:100%;height:100%;border:0}
        .cgx-note{font-size:12px;color:#64748B;margin:10px 2px 0}
        .cgx-clean{display:flex;flex-direction:column;gap:14px}
        .cgx-clean-image{width:100%;max-height:360px;object-fit:cover;border-radius:18px;border:1px solid #E2E8F0;background:#F8FAFC}
        .cgx-clean-text{font-size:16px;line-height:1.8;color:#1F2937}
        .cgx-clean-text p{margin:0 0 16px}
      </style>

      <div class="cgx-launcher">
        <button id="cgx-open-btn" title="Open Cognest search (Ctrl/Cmd + K)">Search</button>
      </div>

      <div id="cgx-overlay" class="cgx-overlay cgx-hidden">
        <div class="cgx-panel" role="dialog" aria-modal="true" aria-label="Cognest search">
          <div class="cgx-head">
            <div class="cgx-brand">
              <strong>Cognest Search</strong>
              <span>Saved links + web search + clean mode</span>
            </div>
            <button class="cgx-close" id="cgx-close-btn" aria-label="Close">✕</button>
          </div>

          <div class="cgx-controls">
            <div class="cgx-tabs" id="cgx-tabs">
              <button class="cgx-tab" data-tab="saved">Saved</button>
<button class="cgx-tab active" data-tab="web">Web</button>
              <button class="cgx-tab" data-tab="video">Videos</button>
            </div>
            <input id="cgx-query" class="cgx-input" type="search" placeholder="Search your library or the web…" />
          </div>

          <div class="cgx-body">
            <div id="cgx-message" class="cgx-message"></div>
            <div id="cgx-results" class="cgx-grid"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    bindEvents();
    renderResults();
  }

  function bindEvents() {
    $("#cgx-open-btn")?.addEventListener("click", openApp);
    $("#cgx-close-btn")?.addEventListener("click", closeApp);
    $("#cgx-overlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "cgx-overlay") closeApp();
    });

    $("#cgx-tabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      $("#cgx-tabs").querySelectorAll(".cgx-tab").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      state.query = $("#cgx-query")?.value || "";
      setTab(state.tab);
    });

    $("#cgx-query")?.addEventListener("input", (e) => {
      state.query = e.target.value;
      scheduleSearch();
    });

    $("#cgx-query")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runSearch();
      } else if (e.key === "Escape") {
        closeApp();
      }
    });

    $("#cgx-results")?.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const url = actionBtn.dataset.url;
        const key = actionBtn.dataset.id || actionBtn.dataset.key;
        const all = [...(state.results || [])];
        const item = all.find((x, i) => (x.id || x.url || `${x.title || "item"}_${i}`) === key || x.url === url || x.id === key);

        if (action === "back") {
          state.viewer = null;
          renderResults();
          return;
        }
        if (action === "open-external" && url) {
          openExternal(url);
          return;
        }
        if (action === "copy-clean") {
          copyCleanText();
          return;
        }
        if (action === "save-clip") {
          saveCurrentClip();
          return;
        }
        if (action === "open" && item) {
          openPreview(item);
          return;
        }
        if (action === "clean" && item) {
          openClean(item);
       
