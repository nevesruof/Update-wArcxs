# akryst – copia ordenada

El código de todas las páginas guardadas está **sin modificar** (verificado byte a byte contra el zip original).
Solo se movieron/renombraron archivos y se agregaron recursos en las rutas que la app espera.

## Cómo verlo
Windows: doble clic en `iniciar.bat` y abre http://localhost:8000
(o `python serve.py` desde esta carpeta). No abras `index.html` con doble clic: las fuentes y el fondo
se piden con rutas absolutas (`/fonts/...`, `/_next/...`) y solo cargan desde un servidor.

Si arranca con el fondo azul "Underwater": **Settings → Background → Video** (y `← menu` para volver).

## Estructura
| Ruta | Qué es |
|---|---|
| `index.html` | El menú (antes `akryst.html`) |
| `akryst_files/` | Recursos que `index.html` referencia (intactos) |
| `_next/static/chunks`, `css` | Los mismos JS/CSS de `akryst_files`, copiados con el nombre y ruta que pide la app |
| `_next/static/media/`, `fonts/` | Fuentes DM Sans y Spanish (la del logo), extraídas de `pages/settings.html` |
| `bg-fallback.jpeg`, `videos/background.mp4` | Fondo de flores. El mp4 es un clip fijo hecho con el jpeg (el video real no venía en el zip) |
| `pages/settings.html` | Inicio con el panel Settings abierto (antes `settings.html`) |
| `pages/photos.html` | Galería de fotos (antes `phoyos.html`) |
| `pages/photos-background.html` | Otra captura de /photos (antes `photos-background.html`); sola solo muestra el fondo |
| `sfx/tic.mp3`, `sfx/tac.mp3` | Sonidos del menú: `tic` al pasar por cada botón nuevo, `tac` al abrir una sección y al volver con `← menu` |
| `serve.py` | Servidor local mínimo (emula `/_next/image` y `/bg-fallback.webp`) |

## Lo que no está en el zip
Contador de visitas y mensaje (necesitan el backend `/api/*`), sonidos `grass.mp3`, `underwater.mp3` y `akurisuto.mp3` (ambiente), modelo `.vrm`,
`logo.webp`, pestañas About me / Music / Guestbook y la página Portfolio.

---

## Cambios v2 (fondos + Turbo Boost)

**Siempre arranca en Underwater.** Antes el código hacía `setUseUnderwaterBg(window.innerWidth > 768)`, así que en ventanas de
768px o menos arrancaba en Video. Ahora el estado inicial es siempre Underwater (no se guarda la elección: al recargar vuelve a Underwater).

**Underwater = wallpaper cyberpunk** en vez del azul casi negro. El wallpaper (`images/cyberpunk-city.jpg`) va detrás del canvas de three.js
(`css/akryst-extras.css`); se quitó el plano de fondo oscuro de la escena y el canvas se mezcla con `screen`, así que solo se suman las luces
(burbujas, rayos, avatar si existe el .vrm). Para quitarlo: borra el `<link>` de `akryst-extras.css` en `index.html`.

**Video -> Skyline.** El botón del panel Settings ahora se llama *Skyline* (icono de carro) y reproduce `videos/skyline.mp4`
(tu mp4 del Nissan Skyline, sin audio). `bg-skyline.jpeg` es el póster y el fallback si hay reduced-motion o WebGL por software.
El clip anterior sigue en `videos/background.mp4` por si lo quieres de vuelta.

**Turbo Boost + cursor 3D** (`js/turbo-boost.js`, `css/turbo-boost.css`). Solo activo en Skyline y con el menú principal visible.
- Cursor: perspectiva/parallax sutil aplicados SOLO al video (nunca a un contenedor padre), resorte amortiguado, vuelve a neutral al quedarse quieto.
  En pantallas táctiles hay un vaivén lento automático.
- Botón TURBO BOOST (o barra espaciadora; no se activa si escribes en un campo ni si el foco está en un botón/enlace). ~1 s: faros y neón, rebote de
  suspensión, partículas cyan/violeta/blancas hacia atrás, líneas de velocidad, impulso de cámara, aberración cromática y barrido de reflejo.
- Un solo bucle `requestAnimationFrame` con delta time; se duerme en reposo y con la pestaña oculta; baja efectos si los fps caen;
  `prefers-reduced-motion` quita sacudida, líneas y aberración.
- Para quitar la función: borra las dos líneas `turbo-boost` del `<head>` de `index.html`.

### Parches en el JS compilado (en `_next/static/chunks` y su copia en `akryst_files/*.download`)
| Archivo | Cambio |
|---|---|
| `4190-...js` | `useState(!1)` -> `useState(!0)`; `y(window.innerWidth>768)` -> `y(!0)`; label/icono `Video` -> `Skyline` / `mdi:car-sports` |
| `app/(site)/page-...js` | `src` por defecto `/videos/skyline.mp4`, fallback `/bg-skyline.jpeg`, `poster` en el `<video>` |
| `1264-...js` | `background = Color(0)`; el plano de fondo `A` ya no se agrega a la escena |
