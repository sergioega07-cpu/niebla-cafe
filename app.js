/* ==========================================================================
   Niebla · Tostaduría mágica — lógica del sitio (vanilla JS, sin build)
   --------------------------------------------------------------------------
   Catálogo: Google Sheet con columnas
   id,nombre,categoria,origen,proceso,tueste,notas_sabor,fecha_tostado,formato,
   molienda,precio_clp,stock,descripcion,imagen_url,visible,altura,variedad
   - Una fila por producto + formato. Filas con el mismo id = mismo café.
   - imagen_url: ruta de la etiqueta (ej: assets/labels/vampiros.webp) o URL completa.
   - altura y variedad son opcionales (ej: "1400 msnm", "Parainema").
   - visible = NO oculta la fila.
   - molienda: opciones separadas por "|" (ej: Grano|Molido espresso|Molido filtro).
   - fecha_tostado: AAAA-MM-DD o DD/MM/AAAA.
   ========================================================================== */
(() => {
  "use strict";

  /* ---------- Configuración ---------- */
  // Pegar aquí el enlace de Google Sheets > Archivo > Compartir > Publicar en la web > (hoja) > CSV.
  // Ej: "https://docs.google.com/spreadsheets/d/e/2PACX-XXXX/pub?gid=0&single=true&output=csv"
  // Mientras esté vacío (o falle), se usa assets/productos-ejemplo.csv y se muestra el aviso "Datos de ejemplo".
  const SHEET_CSV_URL = "";
  const LOCAL_CSV_URL = "assets/productos-ejemplo.csv";
  const WA_NUMBER = "56940220026";
  const DIAS_RECIEN_TOSTADO = 15;
  const STOCK_BAJO = 3;
  const CART_KEY = "niebla-carrito-v1";
  const NAME_KEY = "niebla-nombre-v1";
  const SITE_URL = "https://sergioega07-cpu.github.io/niebla-cafe/";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Utilidades ---------- */
  const clp = (n) => "$" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // encodeURIComponent + paréntesis codificados (algunas apps cortan el enlace en ")")
  const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text).replace(/[()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function parseDate(str) {
    const s = String(str || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }
  function daysSince(date) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((t - date) / 86400000);
  }
  const fmtDate = (d) => `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;

  /* ---------- CSV robusto (RFC 4180: comillas, comas y saltos dentro de campos, "" escapadas) ---------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, q = false;
    text = String(text).replace(/^\uFEFF/, "");
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
    if (!nonEmpty.length) return [];
    const head = nonEmpty[0].map((h) => h.trim().toLowerCase());
    return nonEmpty.slice(1).map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] ?? "").trim()])));
  }

  const isHidden = (v) => /^(no|false|0|n)$/i.test(String(v || "").trim());
  const toInt = (v) => { const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };

  function groupProducts(rows) {
    const map = new Map();
    for (const r of rows) {
      if (!r.id || isHidden(r.visible)) continue;
      if (!map.has(r.id)) {
        map.set(r.id, {
          id: r.id, nombre: r.nombre, categoria: r.categoria, origen: r.origen, proceso: r.proceso,
          tueste: r.tueste, notas: (r.notas_sabor || "").split(/[,;·]/).map((s) => s.trim()).filter(Boolean),
          fecha: parseDate(r.fecha_tostado), descripcion: r.descripcion, imagen: r.imagen_url,
          altura: r.altura, variedad: r.variedad, formatos: [],
        });
      }
      const p = map.get(r.id);
      // Si alguna fila del grupo trae más info, se completa
      for (const k of ["nombre", "categoria", "origen", "proceso", "tueste", "descripcion", "altura", "variedad"]) if (!p[k] && r[k]) p[k] = r[k];
      if (!p.imagen && r.imagen_url) p.imagen = r.imagen_url;
      const fd = parseDate(r.fecha_tostado);
      if (fd && (!p.fecha || fd > p.fecha)) p.fecha = fd;
      p.formatos.push({
        formato: r.formato || "Único",
        precio: toInt(r.precio_clp),
        stock: toInt(r.stock),
        moliendas: (r.molienda || "").split(/[|;]/).map((s) => s.trim()).filter(Boolean),
      });
    }
    const list = [...map.values()];
    for (const p of list) {
      p.formatos.sort((a, b) => grams(a.formato) - grams(b.formato));
      for (const f of p.formatos) if (!f.moliendas.length) f.moliendas = ["Grano", "Molido"];
    }
    // Disponibles primero, agotados al final
    return list.sort((a, b) => (totalStock(b) > 0) - (totalStock(a) > 0));
  }
  function grams(f) {
    const m = String(f).toLowerCase().replace(",", ".").match(/([\d.]+)\s*(kg|g)/);
    return m ? parseFloat(m[1]) * (m[2] === "kg" ? 1000 : 1) : 1e9;
  }
  const totalStock = (p) => p.formatos.reduce((s, f) => s + Math.max(0, f.stock), 0);
  const stockState = (n) => (n <= 0 ? { key: "out", label: "Agotado" } : n <= STOCK_BAJO ? { key: "low", label: "Últimas unidades" } : { key: "ok", label: "Disponible" });

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.text();
  }

  async function loadCatalog() {
    if (SHEET_CSV_URL) {
      try {
        const rows = parseCSV(await fetchText(SHEET_CSV_URL));
        const prods = groupProducts(rows);
        if (prods.length) return { prods, demo: false };
        console.warn("[Niebla] La planilla no trajo productos visibles; usando CSV de ejemplo.");
      } catch (e) {
        console.warn("[Niebla] No se pudo leer la planilla publicada; usando CSV de ejemplo.", e);
      }
    }
    const rows = parseCSV(await fetchText(LOCAL_CSV_URL));
    return { prods: groupProducts(rows), demo: true };
  }

  /* ---------- Placeholder de bolsa (SVG) ---------- */
  const BAGS = [
    { body: "#1b1614", edge: "#2c2320", label: "#D8C7A1" },
    { body: "#4A281B", edge: "#5d3424", label: "#E6D6B0" },
    { body: "#1D2720", edge: "#2a372e", label: "#D8C7A1" },
  ];
  function bagSVG(p, idx) {
    const c = BAGS[idx % BAGS.length];
    const words = String(p.nombre || "").replace(/\(.*?\)/g, "").trim().split(/\s+/);
    const l1 = words.shift() || "";
    const l2 = words.join(" ");
    const uid = "b" + idx;
    const meta = [p.proceso, p.tueste].filter(Boolean).join(" · ").toUpperCase();
    // tamaño de letra que cabe en la etiqueta (ancho aprox. en unidades SVG)
    const fit = (txt, max, width, k = 0.8) => Math.min(max, +(width / Math.max(1, txt.length * k)).toFixed(2));
    return `
<svg viewBox="0 0 400 300" role="img" aria-label="Ilustración provisoria de bolsa de café ${esc(p.nombre)}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="${uid}g" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="#E0A840" stop-opacity=".28"/><stop offset="1" stop-color="#E0A840" stop-opacity="0"/></radialGradient>
    <linearGradient id="${uid}s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".25" stop-color="#fff" stop-opacity=".07"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
  </defs>
  <ellipse cx="200" cy="160" rx="170" ry="130" fill="url(#${uid}g)"/>
  <ellipse cx="200" cy="272" rx="88" ry="9" fill="#000" opacity=".55"/>
  <path d="M138 44 h124 l6 16 v186 q0 20 -20 22 h-96 q-20 -2 -20 -22 v-186 z" fill="${c.body}" stroke="${c.edge}" stroke-width="1.5"/>
  <path d="M138 44 h124 l6 16 v186 q0 20 -20 22 h-96 q-20 -2 -20 -22 v-186 z" fill="url(#${uid}s)"/>
  <rect x="136" y="44" width="128" height="12" rx="2" fill="${c.edge}"/>
  <line x1="140" y1="68" x2="260" y2="68" stroke="#000" stroke-opacity=".4" stroke-dasharray="3 3"/>
  <circle cx="200" cy="84" r="7" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/>
  <rect x="152" y="104" width="96" height="124" rx="6" fill="${c.label}"/>
  <rect x="157" y="109" width="86" height="114" rx="4" fill="none" stroke="#4A281B" stroke-opacity=".55" stroke-width=".8"/>
  <text x="200" y="130" text-anchor="middle" font-family="Amarante, serif" font-size="13" letter-spacing="2.5" fill="#1a110c">NIEBLA</text>
  <line x1="176" y1="138" x2="224" y2="138" stroke="#A75A2B" stroke-width=".8"/>
  <text x="200" y="160" text-anchor="middle" font-family="Amarante, serif" font-size="${fit(l1, 11, 76)}" font-weight="600" letter-spacing="1" fill="#2a1a12">${esc(l1.toUpperCase())}</text>
  <text x="200" y="174" text-anchor="middle" font-family="Amarante, serif" font-size="${fit(l2, 10, 76)}" letter-spacing="1" fill="#2a1a12">${esc(l2.toUpperCase())}</text>
  <text x="200" y="194" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${fit(meta, 6.5, 78, 0.68)}" letter-spacing=".6" fill="#4A281B">${esc(meta)}</text>
  <circle cx="232" cy="212" r="9" fill="#8E2A22"/><circle cx="232" cy="212" r="5.8" fill="none" stroke="#5e1a15" stroke-width="1"/>
  <text x="187" y="214" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="4.6" letter-spacing=".8" fill="#4A281B" opacity=".7">IMAGEN PROVISORIA</text>
</svg>`;
  }

  /* ---------- Render de productos ---------- */
  let PRODUCTS = [];
  const selection = new Map(); // id -> { f: índice formato, m: molienda }
  const productById = (id) => PRODUCTS.find((p) => p.id === id);

  function firstAvailable(p) { const i = p.formatos.findIndex((f) => f.stock > 0); return i < 0 ? 0 : i; }

  function freshnessHTML(p) {
    if (!p.fecha) return `<div class="roast-date"><div><strong>Fecha de tostado por confirmar</strong></div></div>`;
    const d = daysSince(p.fecha);
    const ago = d < 0 ? "Próximo tueste" : d === 0 ? "Tostado hoy" : d === 1 ? "Hace 1 día" : `Hace ${d} días`;
    return `<div class="roast-date">
      <svg class="roast-date__icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M12 3c2 3 4 4.5 4 8a4 4 0 0 1-8 0c0-2 1-3 1.5-4.5C10.5 8 11 9 12 9c0-2-.5-4 0-6Z M9 20h6 M12 16v4"/></svg>
      <div><strong>Tostado el ${fmtDate(p.fecha)}</strong><span>${ago}</span></div>
    </div>`;
  }
  function roastDots(t) {
    const lvl = /oscur/i.test(t) ? 3 : /medi/i.test(t) ? 2 : /clar/i.test(t) ? 1 : 0;
    if (!lvl) return "";
    return `<span class="roast-dots" aria-hidden="true">${[1, 2, 3].map((n) => `<i class="${n <= lvl ? "on" : ""}"></i>`).join("")}</span>`;
  }

  function cardHTML(p, idx) {
    const sel = selection.get(p.id);
    const f = p.formatos[sel.f];
    const st = stockState(f.stock);
    const fresh = p.fecha && daysSince(p.fecha) >= 0 && daysSince(p.fecha) < DIAS_RECIEN_TOSTADO;
    const allOut = totalStock(p) <= 0;
    const media = p.imagen
      ? `<img src="${esc(p.imagen)}" alt="Etiqueta de ${esc(p.nombre)}${p.origen ? ` · ${esc(p.origen)}` : ""}" width="520" height="800" loading="lazy" decoding="async">`
      : bagSVG(p, idx);
    return `
    <article class="card product reveal ${allOut ? "is-out" : ""}" data-id="${esc(p.id)}" style="--d:${(idx % 3) * 0.08}s">
      <div class="product__media ${p.imagen ? "product__media--label" : ""}">
        ${media}
        <div class="product__badges">
          <span>${fresh ? `<span class="badge badge--fresh">Recién tostado</span>` : ""}</span>
          <span class="badge badge--${st.key}" data-role="stock">${st.label}</span>
        </div>
      </div>
      <div class="product__body">
        <p class="product__origin">${esc(p.origen || "")}${p.categoria ? ` · ${esc(p.categoria)}` : ""}</p>
        <h3 class="product__name">${esc(p.nombre)}</h3>
        <dl class="product__meta">
          ${p.altura ? `<div><dt>Altura</dt><dd>${esc(p.altura)}</dd></div>` : ""}
          ${p.variedad ? `<div><dt>Variedad</dt><dd>${esc(p.variedad)}</dd></div>` : ""}
          ${p.proceso ? `<div><dt>Proceso</dt><dd>${esc(p.proceso)}</dd></div>` : ""}
          ${p.tueste ? `<div><dt>Tueste</dt><dd>${esc(p.tueste)}${roastDots(p.tueste)}</dd></div>` : ""}
        </dl>
        ${p.notas.length ? `<ul class="notes" aria-label="Notas de sabor">${p.notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
        ${p.descripcion ? `<p class="product__desc">${esc(p.descripcion)}</p>` : ""}
        ${freshnessHTML(p)}
        <div class="product__opts">
          <div>
            <span class="opt-label" id="fl-${esc(p.id)}">Formato</span>
            <div class="seg" role="group" aria-labelledby="fl-${esc(p.id)}">
              ${p.formatos.map((fo, i) => `<button type="button" data-act="fmt" data-i="${i}" aria-pressed="${i === sel.f}" class="${fo.stock <= 0 ? "is-out" : ""}" ${fo.stock <= 0 ? `title="Agotado"` : ""}>${esc(fo.formato)}</button>`).join("")}
            </div>
          </div>
          <label>
            <span class="opt-label">Molienda</span>
            <span class="select"><select data-act="mol" ${f.stock <= 0 ? "disabled" : ""}>${f.moliendas.map((m) => `<option ${m === sel.m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></span>
          </label>
        </div>
        <div class="product__buy">
          <p class="price" data-role="price">${clp(f.precio)}<small>${esc(f.formato)}</small></p>
          <button type="button" class="btn btn--primary" data-act="add" ${f.stock <= 0 ? "disabled" : ""}>${f.stock <= 0 ? "Agotado" : "Añadir"}</button>
        </div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const box = $("#products");
    if (!PRODUCTS.length) { box.innerHTML = `<p class="products__error">Por ahora no hay cafés publicados. Escríbenos por WhatsApp y te contamos qué hay detrás de la niebla.</p>`; return; }
    PRODUCTS.forEach((p) => {
      if (!selection.has(p.id)) { const i = firstAvailable(p); selection.set(p.id, { f: i, m: p.formatos[i].moliendas[0] }); }
    });
    box.innerHTML = PRODUCTS.map(cardHTML).join("");
    observeReveals(box);
  }

  function rerenderCard(id) {
    const p = productById(id);
    const old = $(`.product[data-id="${CSS.escape(id)}"]`);
    if (!p || !old) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = cardHTML(p, PRODUCTS.indexOf(p));
    const card = tmp.firstElementChild;
    card.classList.add("is-in");
    old.replaceWith(card);
  }

  $("#products").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.tagName === "SELECT") return;
    const id = btn.closest(".product").dataset.id;
    const p = productById(id);
    const sel = selection.get(id);
    if (btn.dataset.act === "fmt") {
      sel.f = +btn.dataset.i;
      const mol = p.formatos[sel.f].moliendas;
      if (!mol.includes(sel.m)) sel.m = mol[0];
      rerenderCard(id);
      $(`.product[data-id="${CSS.escape(id)}"] [data-act="fmt"][data-i="${sel.f}"]`)?.focus();
    } else if (btn.dataset.act === "add") {
      const f = p.formatos[sel.f];
      addToCart(p, f, sel.m);
    }
  });
  $("#products").addEventListener("change", (e) => {
    if (e.target.dataset.act !== "mol") return;
    selection.get(e.target.closest(".product").dataset.id).m = e.target.value;
  });

  /* ---------- Carrito (localStorage) ---------- */
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; if (!Array.isArray(cart)) cart = []; } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* modo privado */ } };
  const keyOf = (id, formato, molienda) => `${id}|${formato}|${molienda}`;
  function stockFor(item) {
    const p = productById(item.id); if (!p) return Infinity;
    const f = p.formatos.find((x) => x.formato === item.formato); return f ? f.stock : 0;
  }
  const qtyOfFormat = (id, formato) => cart.filter((i) => i.id === id && i.formato === formato).reduce((s, i) => s + i.qty, 0);

  function addToCart(p, f, molienda) {
    if (f.stock <= 0) return;
    if (qtyOfFormat(p.id, f.formato) >= f.stock) { toast(`No queda más stock de ${p.nombre} ${f.formato}`); return; }
    const key = keyOf(p.id, f.formato, molienda);
    const it = cart.find((i) => i.key === key);
    if (it) it.qty++;
    else cart.push({ key, id: p.id, nombre: p.nombre, formato: f.formato, molienda, precio: f.precio, qty: 1 });
    saveCart(); renderCart();
    toast(`Añadido: ${p.nombre} ${f.formato} (${molienda})`);
    const fab = $("#cart-open"); fab.classList.remove("bump"); void fab.offsetWidth; fab.classList.add("bump");
  }

  function reconcileCart() {
    // Actualiza precios/stock con el catálogo cargado
    cart = cart.filter((i) => {
      const p = productById(i.id); if (!p) return false;
      const f = p.formatos.find((x) => x.formato === i.formato); if (!f || f.stock <= 0) return false;
      i.precio = f.precio; i.nombre = p.nombre; return true;
    });
    for (const i of cart) {
      const max = stockFor(i); const used = qtyOfFormat(i.id, i.formato);
      if (used > max) i.qty = Math.max(1, i.qty - (used - max));
    }
    saveCart();
  }

  const cartTotal = () => cart.reduce((s, i) => s + i.precio * i.qty, 0);
  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);

  function buildOrderMessage() {
    const name = $("#cart-name").value.trim();
    const lines = ["Hola Niebla, quiero hacer este pedido:"];
    for (const i of cart) lines.push(`- ${i.qty}× ${i.nombre} ${i.formato} (${i.molienda}) — ${clp(i.precio * i.qty)}`);
    lines.push(`Total: ${clp(cartTotal())}`);
    if (name) lines.push(`Nombre: ${name}`);
    return lines.join("\n");
  }

  function renderCart() {
    const list = $("#cart-items");
    list.innerHTML = cart.map((i) => {
      const maxed = qtyOfFormat(i.id, i.formato) >= stockFor(i);
      return `<li class="cart-item" data-key="${esc(i.key)}">
        <div><p class="cart-item__name">${esc(i.nombre)}</p><p class="cart-item__opt">${esc(i.formato)} · ${esc(i.molienda)} · ${clp(i.precio)} c/u</p></div>
        <div class="cart-item__price">${clp(i.precio * i.qty)}</div>
        <div class="cart-item__row">
          <div class="qty"><button type="button" data-q="-1" aria-label="Quitar uno">−</button><output aria-live="polite">${i.qty}</output><button type="button" data-q="1" aria-label="Agregar uno" ${maxed ? "disabled" : ""}>+</button></div>
          <button type="button" class="cart-item__remove" data-remove>Eliminar</button>
        </div>
      </li>`;
    }).join("");
    const n = cartCount();
    $("#cart-empty").hidden = n > 0;
    $("#cart-foot").hidden = n === 0;
    $("#cart-total").textContent = clp(cartTotal());
    const count = $("#cart-count"); count.hidden = n === 0; count.textContent = n;
    $("#cart-open").setAttribute("aria-label", n ? `Abrir carrito (${n} productos)` : "Abrir carrito");
    updateSendLink();
  }
  function updateSendLink() {
    const a = $("#cart-send");
    if (!cart.length) { a.href = waLink("Hola Niebla"); a.setAttribute("aria-disabled", "true"); return; }
    a.removeAttribute("aria-disabled");
    a.href = waLink(buildOrderMessage());
  }

  $("#cart-items").addEventListener("click", (e) => {
    const li = e.target.closest(".cart-item"); if (!li) return;
    const it = cart.find((i) => i.key === li.dataset.key); if (!it) return;
    if (e.target.closest("[data-remove]")) cart = cart.filter((i) => i !== it);
    const q = e.target.closest("[data-q]");
    if (q) {
      const d = +q.dataset.q;
      if (d > 0 && qtyOfFormat(it.id, it.formato) >= stockFor(it)) return;
      it.qty += d; if (it.qty <= 0) cart = cart.filter((i) => i !== it);
    }
    saveCart(); renderCart();
  });
  const nameInput = $("#cart-name");
  try { nameInput.value = localStorage.getItem(NAME_KEY) || ""; } catch { /* */ }
  nameInput.addEventListener("input", () => { try { localStorage.setItem(NAME_KEY, nameInput.value); } catch { /* */ } updateSendLink(); });
  $("#cart-send").addEventListener("click", (e) => {
    if (!cart.length) { e.preventDefault(); return; }
    e.currentTarget.href = waLink(buildOrderMessage());
  });

  // Abrir / cerrar
  const drawer = $("#cart"), backdrop = $("#cart-backdrop"), fab = $("#cart-open");
  let lastFocus = null;
  function openCart() {
    if (menuIsOpen()) closeMenu({ restoreFocus: false }); // solo un panel abierto a la vez
    lastFocus = document.activeElement;
    $("#toast").classList.remove("is-on");
    backdrop.hidden = false;
    requestAnimationFrame(() => { backdrop.classList.add("is-open"); drawer.classList.add("is-open"); });
    drawer.setAttribute("aria-hidden", "false"); fab.setAttribute("aria-expanded", "true");
    document.body.classList.add("cart-open");
    setTimeout(() => $("#cart-close").focus({ preventScroll: true }), 50);
  }
  function closeCart() {
    backdrop.classList.remove("is-open"); drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true"); fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("cart-open");
    setTimeout(() => { if (!drawer.classList.contains("is-open")) backdrop.hidden = true; }, 450);
    lastFocus?.focus?.({ preventScroll: true });
  }
  fab.addEventListener("click", openCart);
  $("#cart-close").addEventListener("click", closeCart);
  backdrop.addEventListener("click", closeCart);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (drawer.classList.contains("is-open")) closeCart();
    else if (menuIsOpen()) closeMenu();
  });
  $$("[data-close-cart]").forEach((a) => a.addEventListener("click", closeCart));

  /* ---------- Menú de celular (panel lateral) ---------- */
  const menu = $("#menu"), menuToggle = $("#menu-toggle");
  const BG_SELECTORS = "main, .footer, .cart-fab, .skip";
  let menuT;
  function menuIsOpen() { return menu.classList.contains("is-open"); }
  function setInert(on) { $$(BG_SELECTORS).forEach((el) => { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); }); }
  function openMenu() {
    if (drawer.classList.contains("is-open")) closeCart();
    clearTimeout(menuT);
    menu.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("is-open")));
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Cerrar menú");
    document.body.classList.add("menu-open");
    setInert(true);
    setTimeout(() => ($(".menu__list a.is-active", menu) || $(".menu__list a", menu))?.focus({ preventScroll: true }), reduceMotion ? 0 : 120);
  }
  function closeMenu({ restoreFocus = true } = {}) {
    menu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menú");
    document.body.classList.remove("menu-open");
    setInert(false);
    clearTimeout(menuT);
    menuT = setTimeout(() => { if (!menuIsOpen()) menu.hidden = true; }, reduceMotion ? 0 : 560);
    if (restoreFocus) menuToggle.focus({ preventScroll: true });
  }
  menuToggle.addEventListener("click", () => (menuIsOpen() ? closeMenu() : openMenu()));
  $$("[data-close-menu]", menu).forEach((el) => el.addEventListener("click", () => closeMenu()));
  $$(".menu__list a", menu).forEach((a) => a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    closeMenu({ restoreFocus: false }); // desbloquea el scroll antes de desplazarse
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", a.getAttribute("href"));
      target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true });
    });
  }));
  // Si la pantalla pasa a escritorio con el menú abierto, se cierra (el panel se oculta en CSS)
  window.matchMedia("(min-width: 900px)").addEventListener("change", (mq) => { if (mq.matches && menuIsOpen()) closeMenu({ restoreFocus: false }); });

  /* ---------- Capítulos seleccionables (acordeón; varios pueden estar abiertos) ---------- */
  const chapters = $$(".chapter");
  function setChapter(ch, open, { animate = true } = {}) {
    if (!ch || open === ch.classList.contains("is-open")) return;
    const btn = $(".chapter__toggle", ch), body = $(".chapter__body", ch);
    btn.setAttribute("aria-expanded", String(open));
    if (open) body.removeAttribute("inert"); else body.setAttribute("inert", "");
    ch.classList.remove("is-opening", "is-closing");
    void ch.offsetWidth; // reinicia la animación de niebla
    ch.classList.toggle("is-open", open);
    if (animate && !reduceMotion) {
      ch.classList.add(open ? "is-opening" : "is-closing");
      clearTimeout(ch._mistT);
      ch._mistT = setTimeout(() => ch.classList.remove("is-opening", "is-closing"), 1200);
    }
  }
  chapters.forEach((ch) => {
    $(".chapter__body", ch).setAttribute("inert", ""); // cerrado: no se enfoca, pero sigue en el DOM (SEO)
    $(".chapter__toggle", ch).addEventListener("click", () => setChapter(ch, !ch.classList.contains("is-open")));
  });
  const chapterFor = (hash) => { const el = hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; return el?.closest(".chapter") || null; };
  // Cualquier enlace a un capítulo (menú, panel, portada) lo abre además de desplazarse
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const ch = chapterFor(a.getAttribute("href")); if (ch) setChapter(ch, true);
  });
  const openFromHash = () => { const ch = chapterFor(location.hash); if (ch) { setChapter(ch, true, { animate: false }); } };
  openFromHash();
  window.addEventListener("hashchange", () => { const ch = chapterFor(location.hash); if (ch) setChapter(ch, true); });

  /* ---------- Sección activa en la navegación (desktop + panel) ---------- */
  const NAV_IDS = ["nosotros", "aprende", "misiones", "cafe", "contacto"]; // mismo orden que en la página
  const navLinks = $$("[data-nav]");
  let activeId = "";
  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    navLinks.forEach((a) => {
      const on = a.dataset.nav === id;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
  }
  const LINE = 0.3; // línea de lectura: 30% desde arriba
  const inBand = new Set();
  const atBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
  function pickActive() {
    if (atBottom()) return setActive("contacto"); // Contacto es corta: al final de la página
    const id = NAV_IDS.filter((i) => inBand.has(i)).pop();
    if (id) return setActive(id);
    // Entre tarjetas se mantiene la anterior; sobre la portada no se marca nada
    const first = document.getElementById(NAV_IDS[0]);
    if (first && first.getBoundingClientRect().top > innerHeight * LINE) setActive("");
  }
  if ("IntersectionObserver" in window) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? inBand.add(en.target.id) : inBand.delete(en.target.id)));
      pickActive();
    }, { rootMargin: `-${LINE * 100}% 0px -${100 - LINE * 100 - 1}% 0px`, threshold: 0 });
    NAV_IDS.forEach((id) => { const el = document.getElementById(id); if (el) navIO.observe(el); });
    let raf = 0;
    window.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pickActive(); }); }, { passive: true });
  }

  // Toast
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 2400);
  }

  /* ---------- Enlaces de WhatsApp con texto precargado ---------- */
  $$(".js-wa").forEach((a) => { a.href = waLink(a.dataset.wa || "Hola Niebla"); });

  /* ---------- JSON-LD de productos (generado desde los datos cargados) ---------- */
  function injectProductLD(prods) {
    $("#ld-products")?.remove();
    const data = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Niebla Orígenes · café disponible",
      itemListElement: prods.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          sku: p.id,
          name: p.nombre,
          category: p.categoria || "Café de especialidad",
          description: [p.descripcion, p.origen && `Origen: ${p.origen}`, p.altura && `Altura: ${p.altura}`, p.variedad && `Variedad: ${p.variedad}`, p.proceso && `Proceso: ${p.proceso}`, p.tueste && `Tueste: ${p.tueste}`, p.notas.length && `Notas: ${p.notas.join(", ")}`].filter(Boolean).join(". "),
          ...(p.imagen ? { image: new URL(p.imagen, SITE_URL).href } : {}),
          brand: { "@type": "Brand", name: "Niebla" },
          offers: p.formatos.map((f) => ({
            "@type": "Offer",
            name: `${p.nombre} ${f.formato}`,
            price: String(f.precio),
            priceCurrency: "CLP",
            availability: f.stock > 0 ? (f.stock <= STOCK_BAJO ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock") : "https://schema.org/OutOfStock",
            url: SITE_URL + "#cafe",
            seller: { "@id": SITE_URL + "#niebla" },
          })),
        },
      })),
    };
    const s = document.createElement("script");
    s.type = "application/ld+json"; s.id = "ld-products";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  /* ---------- Revelado al hacer scroll ---------- */
  const io = "IntersectionObserver" in window && !reduceMotion
    ? new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 })
    : null;
  function observeReveals(root = document) {
    $$(".reveal:not(.is-in)", root).forEach((el) => (io ? io.observe(el) : el.classList.add("is-in")));
  }
  // Desfase suave dentro de grupos
  $$(".story__pillars, .learn__grid, .missions__grid, .hero__inner").forEach((g) => $$(".reveal", g).forEach((el, i) => el.style.setProperty("--d", `${Math.min(i, 6) * 0.09}s`)));
  observeReveals();

  /* ---------- Nav al hacer scroll ---------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  // Los anclajes quedan justo bajo el encabezado fijo (que baja 28 px si se ve el aviso "Datos de ejemplo")
  const syncScrollPad = () => { document.documentElement.style.scrollPaddingTop = Math.round(nav.getBoundingClientRect().bottom + 14) + "px"; };
  syncScrollPad(); window.addEventListener("resize", syncScrollPad, { passive: true });

  /* ---------- Niebla animada (canvas liviano, baja resolución) ---------- */
  function fog() {
    const cv = $("#fog"); if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const SCALE = 0.25; // se dibuja a 1/4 y el navegador la suaviza al escalar
    let W = 0, H = 0, blobs = [], raf = 0, last = 0, running = true;
    function resize() {
      W = Math.max(1, Math.round(innerWidth * SCALE)); H = Math.max(1, Math.round(innerHeight * SCALE));
      cv.width = W; cv.height = H;
      const n = innerWidth < 700 ? 9 : 14;
      blobs = Array.from({ length: n }, (_, i) => ({
        x: Math.random() * W, y: H * (0.25 + Math.random() * 0.85),
        r: (0.35 + Math.random() * 0.45) * Math.max(W, H * 0.9),
        vx: (0.02 + Math.random() * 0.05) * (i % 2 ? 1 : -1) * W / 100,
        a: 0.02 + Math.random() * 0.025 /* niebla tenue: no aclara la página */, ph: Math.random() * Math.PI * 2,
        // notas de color de la marca: cobre, espresso, bosque, rojo profundo y algo de pergamino
        col: ["167,90,43", "120,64,40", "46,70,54", "130,36,28", "216,205,180"][i % 5],
      }));
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      const sy = (window.scrollY * SCALE * 0.08) % H;
      for (const b of blobs) {
        const breathe = 0.75 + 0.25 * Math.sin(t / 5200 + b.ph);
        const y = ((b.y - sy) % (H * 1.3) + H * 1.3) % (H * 1.3) - H * 0.15;
        const g = ctx.createRadialGradient(b.x, y, 0, b.x, y, b.r);
        const col = b.col;
        g.addColorStop(0, `rgba(${col},${(b.a * breathe).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${col},${(b.a * breathe * 0.4).toFixed(3)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.r, y - b.r, b.r * 2, b.r * 2);
      }
    }
    function loop(t) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return; // ~30 fps
      const dt = Math.min(100, t - last); last = t;
      for (const b of blobs) {
        b.x += b.vx * dt / 16;
        if (b.x - b.r > W) b.x = -b.r; if (b.x + b.r < 0) b.x = W + b.r;
      }
      draw(t);
    }
    resize();
    window.addEventListener("resize", () => { resize(); if (reduceMotion) draw(0); }, { passive: true });
    if (reduceMotion) { draw(0); return; }
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) { last = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    });
  }
  fog();

  /* ---------- Inicio ---------- */
  renderCart();
  loadCatalog()
    .then(({ prods, demo }) => {
      PRODUCTS = prods;
      $("#dev-banner").hidden = !demo;
      syncScrollPad();
      renderProducts();
      reconcileCart(); renderCart();
      injectProductLD(prods);
    })
    .catch((err) => {
      console.error("[Niebla] No se pudo cargar el catálogo", err);
      $("#products").innerHTML = `<p class="products__error">No pudimos invocar el catálogo${location.protocol === "file:" ? " (abre el sitio con un servidor local, no como archivo)" : ""}. Escríbenos por WhatsApp y te contamos qué hay disponible.</p>`;
    });

  // Exponer utilidades para pruebas en consola
  window.Niebla = { parseCSV, buildOrderMessage, waLink, clp };
})();
