/* Niebla · La bitácora del brujo — lee las entradas publicadas (solo lectura, sin innerHTML con datos). */
(() => {
  "use strict";
  const API = "https://bitacora.nieblacoffee.cl";
  const $ = (s, el = document) => el.querySelector(s);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Menú de celular (mismo comportamiento básico que en la portada)
  const menu = $("#menu"), toggle = $("#menu-toggle");
  if (menu && toggle) {
    let t;
    const isOpen = () => menu.classList.contains("is-open");
    const open = () => { clearTimeout(t); menu.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("is-open"))); toggle.setAttribute("aria-expanded", "true"); toggle.setAttribute("aria-label", "Cerrar menú"); document.body.classList.add("menu-open"); };
    const close = () => { menu.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Abrir menú"); document.body.classList.remove("menu-open"); clearTimeout(t); t = setTimeout(() => { if (!isOpen()) menu.hidden = true; }, reduceMotion ? 0 : 560); };
    toggle.addEventListener("click", () => (isOpen() ? close() : open()));
    menu.querySelectorAll("[data-close-menu]").forEach((el) => el.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { close(); toggle.focus(); } });
  }
  document.querySelectorAll(".js-wa").forEach((a) => { a.href = "https://wa.me/56940220026?text=" + encodeURIComponent(a.dataset.wa || "Hola Niebla"); });

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";
  const safeUrl = (u) => { try { const x = new URL(u, API); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  const fecha = (v) => { const d = new Date(String(v).replace(" ", "T")); return isNaN(d) ? "" : d.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }); };
  const msg = (t) => { const box = $("#bitacora-list"); box.replaceChildren(el("p", "bitacora__msg", t)); };

  function entryNode(e, i) {
    const art = el("article", "card bitacora__entry" + (i === 0 ? " is-first" : ""));
    const foto = safeUrl(e.foto || (e.id ? `/api/foto/${encodeURIComponent(e.id)}` : ""));
    if (foto) {
      const fig = el("figure", "bitacora__photo");
      const img = el("img"); img.src = foto; img.alt = has(e.cafe_nombre) ? `Foto del batch de ${e.cafe_nombre}` : "Foto del batch";
      img.loading = i === 0 ? "eager" : "lazy"; img.decoding = "async";
      img.addEventListener("error", () => fig.remove());
      fig.append(img); art.append(fig);
    }
    const body = el("div", "bitacora__body");
    const f = fecha(e.creada); if (f) body.append(el("p", "learn__tag", f));
    if (has(e.cafe_nombre)) body.append(el("h2", "bitacora__cafe", e.cafe_nombre));
    if (has(e.comentario)) String(e.comentario).split(/\n{2,}/).forEach((p, k) => body.append(el("p", "bitacora__text" + (k === 0 ? " is-lead" : ""), p.trim())));
    if (has(e.musica) || has(e.musica_link)) {
      const m = el("p", "bitacora__music"); m.append(el("span", "opt-label", "Sonaba"));
      const link = has(e.musica_link) ? safeUrl(e.musica_link) : "";
      const label = has(e.musica) ? e.musica : (/spotify/.test(link) ? "Escuchar en Spotify" : /youtu/.test(link) ? "Ver en YouTube" : "Escuchar");
      if (link) { const a = el("a", "", label); a.href = link; a.target = "_blank"; a.rel = "noopener noreferrer"; m.append(a); } else m.append(el("span", "", label));
      body.append(m);
    }
    const rec = [["Método", e.metodo], ["Café", has(e.gramos) ? `${e.gramos} g` : ""], ["Agua", has(e.agua_ml) ? `${e.agua_ml} ml` : ""],
      ["Temperatura", has(e.temperatura) ? `${e.temperatura} °C` : ""], ["Tiempo", e.tiempo], ["Molienda", e.molienda]].filter((r) => has(r[1]));
    if (rec.length) {
      const dl = el("dl", "product__meta bitacora__recipe");
      rec.forEach(([k, v]) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); dl.append(d); });
      const wrap = el("div", "bitacora__recipe-wrap"); wrap.append(el("span", "opt-label", "Receta"), dl); body.append(wrap);
    }
    art.append(body);
    return art;
  }

  fetch(API + "/api/public/entradas", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((d) => {
      const list = Array.isArray(d && d.entradas) ? d.entradas : [];
      if (!list.length) { msg("Pronto, las primeras notas del tostador."); return; }
      $("#bitacora-list").replaceChildren(...list.map(entryNode));
    })
    .catch(() => msg("No pudimos abrir la bitácora. Intenta de nuevo en un rato."));
})();
