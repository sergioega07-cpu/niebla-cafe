# Niebla — Tostaduría mágica

Sitio catálogo de **Niebla**, tostaduría de café de especialidad en Machalí, Chile.
Muestra el café disponible (con precio por formato y stock), contenidos educativos y talleres.
No tiene pago en línea: el carrito arma el pedido y lo envía por **WhatsApp** a Niebla, donde se cierra la venta.

Sitio estático (HTML, CSS y JS sin build), publicado con GitHub Pages:
https://sergioega07-cpu.github.io/niebla-cafe/

## Archivos

- `index.html` — estructura, textos y SEO.
- `styles.css` — estilos.
- `app.js` — catálogo, carrito, enlace de WhatsApp y animaciones.
- `assets/` — logo oficial (`niebla-emblema.*` = medallón del cuervo, crema calado para fondo oscuro; `niebla-emblema-solido.*` = medallón con cuervo oscuro, para favicon y fondos claros; `niebla-logo.*` = medallón + palabra NIEBLA), favicons, `fonts/` (tipografía Amarante, SIL OFL), imagen para redes, emblemas, `productos-ejemplo.csv` (datos de ejemplo) y `labels/` (etiquetas de cada café en WebP).

## Cómo actualizar el café y el stock (Google Sheet)

1. La planilla debe tener estas columnas, en la primera fila:
   `id,nombre,categoria,origen,proceso,tueste,notas_sabor,fecha_tostado,formato,molienda,precio_clp,stock,descripcion,imagen_url,visible,altura,variedad`
   - Una fila por café **y** formato (ej.: una fila para 250 g y otra para 1 kg con el mismo `id`).
   - `molienda`: opciones separadas por `|`, por ejemplo `Grano|Molido espresso|Molido filtro`.
   - `fecha_tostado`: ya no se muestra en las tarjetas (la fecha va escrita en cada bolsa). La columna se puede dejar vacía o borrar: el sitio la ignora.
   - `stock`: `0` = Agotado, `1–3` = Últimas unidades.
   - `precio_clp`: solo el número, sin `$` ni puntos (ej.: `11500` para 250 g y `39000` para 1 kg; el descafeinado, `13500` y `62000`).
   - `visible`: `NO` oculta la fila.
   - `imagen_url`: etiqueta del café, por ejemplo `assets/labels/vampiros.webp` (o una URL completa).
   - `altura` y `variedad` (opcionales): por ejemplo `1350 msnm` y `Catuaí Amarillo`.
   - `notas_sabor`: separadas por coma.
2. En Google Sheets: **Archivo → Compartir → Publicar en la web**, elegir la hoja y el formato **CSV**, y copiar el enlace (termina en `output=csv`).
3. Pegar ese enlace en `app.js`, en la línea `const SHEET_CSV_URL = "";`, y subir el cambio.

Desde ahí, basta con editar la planilla: el sitio lee los datos cada vez que se abre (Google puede tardar unos minutos en actualizar el CSV publicado).
Mientras `SHEET_CSV_URL` esté vacío o falle, el sitio usa `assets/productos-ejemplo.csv` y muestra el aviso "Datos de ejemplo".

## Pendiente

- Precios vigentes (ya cargados en el CSV de ejemplo; la planilla de Google debe usar los mismos en `precio_clp`): $11.500 (250 g) y $39.000 (1 kg); Espantapájaros Descafeinado $13.500 (250 g) y $62.000 (1 kg).
- Café publicado: Espantapájaros, Espantapájaros Descafeinado y Vampiros.
- Confirmar stock real (el del CSV de ejemplo es provisorio).
