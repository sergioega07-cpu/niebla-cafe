# Niebla — Tostaduría mágica

Sitio catálogo de **Niebla**, tostaduría de café de especialidad en Machalí, Chile.
Muestra el café disponible (con fecha de tostado y stock), contenidos educativos y talleres.
No tiene pago en línea: el carrito arma el pedido y lo envía por **WhatsApp** a Niebla, donde se cierra la venta.

Sitio estático (HTML, CSS y JS sin build), publicado con GitHub Pages:
https://sergioega07-cpu.github.io/niebla-cafe/

## Archivos

- `index.html` — estructura, textos y SEO.
- `styles.css` — estilos.
- `app.js` — catálogo, carrito, enlace de WhatsApp y animaciones.
- `assets/` — logo provisorio, imagen para redes y `productos-ejemplo.csv` (datos de ejemplo).

## Cómo actualizar el café y el stock (Google Sheet)

1. La planilla debe tener estas columnas, en la primera fila:
   `id,nombre,categoria,origen,proceso,tueste,notas_sabor,fecha_tostado,formato,molienda,precio_clp,stock,descripcion,imagen_url,visible`
   - Una fila por café **y** formato (ej.: una fila para 250 g y otra para 1 kg con el mismo `id`).
   - `molienda`: opciones separadas por `|`, por ejemplo `Grano|Molido espresso|Molido filtro`.
   - `fecha_tostado`: `AAAA-MM-DD` o `DD/MM/AAAA`. Si tiene menos de 15 días aparece "Recién tostado".
   - `stock`: `0` = Agotado, `1–3` = Últimas unidades.
   - `precio_clp`: solo el número (ej.: `9990`).
   - `visible`: `NO` oculta la fila.
2. En Google Sheets: **Archivo → Compartir → Publicar en la web**, elegir la hoja y el formato **CSV**, y copiar el enlace (termina en `output=csv`).
3. Pegar ese enlace en `app.js`, en la línea `const SHEET_CSV_URL = "";`, y subir el cambio.

Desde ahí, basta con editar la planilla: el sitio lee los datos cada vez que se abre (Google puede tardar unos minutos en actualizar el CSV publicado).
Mientras `SHEET_CSV_URL` esté vacío o falle, el sitio usa `assets/productos-ejemplo.csv` y muestra el aviso "Datos de ejemplo".

## Pendiente

- Reemplazar `assets/logo-placeholder.svg` por el logo oficial.
- Reemplazar los textos de ejemplo de "Nosotros" (marcados con un comentario en `index.html`).
- Agregar fotos reales de producto (columna `imagen_url`).
