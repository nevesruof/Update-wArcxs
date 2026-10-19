# Take

Sitio estático (menú con fondo de cubos 3D, Settings, galería de fotos, presencia de Discord y trampas anti-copia).

## Cómo verlo
Windows: doble clic en `iniciar.bat` y abre http://localhost:8000
(o `python serve.py` desde esta carpeta). No abras `index.html` con doble clic: las fuentes y el fondo
se piden con rutas absolutas (`/fonts/...`, `/_next/...`) y solo cargan desde un servidor.

## Estructura
| Ruta | Qué es |
|---|---|
| `index.html` | El menú principal |
| `pages/settings.html` | Inicio con el panel Settings abierto (captura) |
| `pages/photos.html` | Galería de fotos (captura, se sirve en `/photos`) |
| `css/take-extras.css` | Estilo del botón Skyline bloqueado |
| `js/cubes-bg.js` | Fondo "Underwater": cubos 3D blancos con glow + partículas conectadas (Canvas 2D, sin librerías) |
| `js/canary.js`, `robots.txt` | Trampas anti-copia (ver más abajo) |
| `css/turbo-boost.css`, `js/turbo-boost.js` | Cursor 3D y botón TURBO BOOST (solo en Skyline; inactivo mientras Skyline esté bloqueado) |
| `images/` | Logo y fondos (`bg-fallback`, `bg-skyline`) |
| `videos/skyline.mp4` | Fondo en video |
| `fonts/spanish.ttf` | Fuente del logo |
| `sfx/` | `tic`/`tac` del menú y `ambient.mp3` (música de fondo) |
| `api/` | Funciones de Vercel: `/api/activity`, `/api/lastfm` (Last.fm), `/api/lastfm/top-artist`, `/api/canary` |
| `tests/` | Pruebas: `node --test tests/bot.test.js tests/canary.test.js` (Node 18+) |
| `serve.py`, `iniciar.bat` | Servidor local |
| `vercel.json` | Rewrites de imágenes, `/photos` y los cebos de las trampas |
| `_next/static/` | Build compilado de la app (ver nota abajo) |

### Sobre `_next/static/`
Es el resultado compilado de Next.js; no hay código fuente en este proyecto. Los archivos con hash
(`4bd1b696-….js`, `1255-….js`, etc.) son librerías (React, Next, three.js, framer-motion, iconify) y
**no se pueden renombrar**: Next guarda sus nombres dentro de `index.html` y renombrarlos rompe la carga.
El código propio (`app/layout`, `app/not-found`, `app/(site)/page`, `4190-…`, `1264-…`) está formateado
para poder leerse; las librerías siguen minificadas.

## Presencia de Discord (bot propio)
`/api/activity` llama al bot desde el servidor de Vercel (el token no llega al navegador).
Variables de entorno en Vercel (después, Redeploy):
- `ACTIVITY_BOT_URL`: URL del bot terminada en `/api/activity` (opcional).
- `ACTIVITY_BOT_TOKEN`: mismo valor que `API_TOKEN` del bot (solo si el bot lo tiene).

## Música (Last.fm)
La pestaña **music** lee tu historial real de Last.fm a través de `/api/lastfm` (últimas canciones + "now playing") y
`/api/lastfm/top-artist` (artista más escuchado de los últimos 30 días). La API key se queda en el servidor de Vercel.
1. Crea una API key en https://www.last.fm/api/account/create (solo pide un nombre de app).
2. En Vercel → Settings → Environment Variables agrega `LASTFM_API_KEY` y `LASTFM_USER` (tu usuario de last.fm) y haz Redeploy.
3. Para que aparezca "now playing", conecta Spotify (u otro reproductor) a Last.fm en https://www.last.fm/settings/applications.
   Last.fm solo muestra lo que se *scrobblea*; sin esa conexión la lista queda vacía.
Sin las variables, `/api/lastfm` responde 503 y la pestaña muestra "recent tracks are unavailable". La lista se refresca cada 30 s.
Pruebas: `node --test tests/lastfm.test.js`.

## Fondo "Underwater": cubos 3D
`js/cubes-bg.js` dibuja cubos blancos con glow flotando en 3D, con caras translúcidas y un punto de luz ("resalte"),
y partículas que se conectan con líneas (algunas como átomos con su órbita). Solo blanco y negro, en un `<canvas>` 2D.
- El cursor o el dedo mueven la cámara un poco (parallax) y empujan apenas a los cubos, que vuelven a su sitio.
- Los cubos lejanos o muy cercanos se ven más suaves (profundidad de campo falsa).
- Se pausa con la pestaña oculta; con "reducir movimiento" activado queda una imagen fija; si el equipo va justo baja solo las partículas y el brillo.
- Pantalla vertical (celular) usa otra disposición para no tapar el menú. Ajustes rápidos al inicio del archivo: `CUBES`, `CUBES_PORTRAIT`, `SIZE`, `PART_COUNT`, `LINK`, `LIGHT`, `FOCUS`.
- Reemplaza a la escena de three.js (rayos de luz + avatar VRM) del módulo `1264`; el fondo de ciudad se quitó.

## Música de fondo
`sfx/ambient.mp3` reemplaza al piano/ambiente anterior. Arranca al tocar la pantalla de carga (los navegadores no permiten
audio sin un toque) y se activa/desactiva con "ambient sound" en la pestaña music. Se repite en bucle y su volumen es 40 %
(antes 5 %): está en `_next/static/chunks/4190-*.js` (`.4 * (`). Es un archivo de 17 s; si notas el corte al repetirse, usa una versión más larga o un loop continuo.

## Settings: Skyline bloqueado
El botón **Skyline** de Settings → Background está desactivado (`disabled`) y en gris; solo queda **Underwater**.
Para reactivarlo: en `_next/static/chunks/4190-*.js` busca `className: "is-locked"` y vuelve a poner `onClick: () => t(!1)` sin `disabled`.

## Trampas (canaries)
Pasivas: solo registran y avisan; no hacen nada contra el visitante.
| Trampa | Cómo salta | Qué recibes |
|---|---|---|
| **Copia del sitio** (`js/canary.js`) | La página se abre desde un dominio que no es el tuyo (`wwarcxs.vercel.app`, sus previews, localhost y redes locales están permitidos) | Aviso con dominio, ruta, referrer, IP y navegador (una vez por sesión) |
| **Cebo** (`/private/*`, `/backup/*`) | Solo aparecen en `robots.txt` y en un enlace oculto del HTML. Un navegador normal nunca entra; un bot que ignora `robots.txt` o sigue enlaces ocultos, sí | Aviso (responde un 404 normal para no delatarse) |
| **Escaneos** (`/wp-login.php`, `/.env`, `/.git/config`, `/xmlrpc.php`, `/phpmyadmin`…) | Escáneres automáticos | Solo en los logs (si no, sería mucho ruido) |
| **Marca de agua** `TKWM-…` | Cadena única repetida en `index.html`, CSS, JS y `robots.txt` | Búscala en Google/GitHub (`"TKWM-40632a5f-41f0-9fe6-22f804d522ac"`) para encontrar copias |

**Configurar el aviso en Discord (opcional):** en un canal → Editar canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.
En Vercel → Settings → Environment Variables agrega `CANARY_WEBHOOK_URL` con esa URL y haz Redeploy. Opcional: `CANARY_ALERT_ALL=1` para avisar también los escaneos.
Sin webhook, todo queda en Vercel → Logs (filtra por `CANARY`). El aviso limpia el texto que llega (sin pings ni markdown), no repite el mismo origen en 10 minutos y envía como máximo 20 por hora.
**Dominio propio:** si lo conectas, agrégalo con `<script>window.TAKE_ALLOWED_HOSTS=["midominio.com"]</script>` antes de `js/canary.js` y cambia el dominio base64 de ese archivo (`printf 'https://midominio.com' | base64`).
**Límites:** quien copie el sitio puede borrar `canary.js`; por eso hay varias capas. Como segunda capa independiente puedes crear un *Cloned Website* token gratis en canarytokens.org y pegar su snippet. Los rewrites de los cebos están en `vercel.json` y no pude probarlos en Vercel desde aquí (la lógica sí está probada).

## Auditoría de seguridad y privacidad
Se revisaron todos los archivos buscando trackers, balizas, ejecución dinámica y llamadas de red:
- **Quitado:** el script `Watermark` (reportaba el dominio de quien copiara el sitio y cargaba un canarytoken)
  y el beacon de Cloudflare Analytics. Revisado de nuevo: no quedan trackers ni canarytokens de terceros, `eval`, `new Function`
  ni credenciales fijas. Lo único de este tipo son las **trampas propias** de abajo, que solo avisan a tu Vercel/Discord.
- **Peticiones al mismo dominio** (`/api/counter`, `/api/guestbook`, `/api/settings`, `/api/admin/*`,
  WebSocket `/api/cursors`): son funciones de la web original cuyo backend **no viene en este proyecto**.
  Sin backend fallan en silencio; el WebSocket de cursores reintenta cada pocos segundos.
  No envían nada a servidores de terceros.
- **Panel admin:** si existe `admin_key` en `sessionStorage`, la web la manda a `/api/admin/*`.
  No hay ninguna clave dentro del código.
- **Único tercero en tiempo de ejecución:** los iconos usan Iconify y piden su SVG a
  `api.iconify.design` (con respaldo en `api.simplesvg.com` y `api.unisvg.com`).
  Spotify, Discord y GitHub solo se usan para mostrar imágenes y enlaces.
- El bot por defecto de `api/_lib/bot.js` apunta a `fi4.bot-hosting.cloud`; cámbialo con `ACTIVITY_BOT_URL`.

## Pendientes tras el cambio de nombre
1. **Dominio:** busca `tu-dominio.com` (og:url, og:image, twitter:image, canonical, aviso de la consola) y cámbialo por tu dominio real.
2. **Redes:** los enlaces y handles de GitHub, Instagram, Twitter, Twitch, Ko-fi, VGen, Steam y los repos siguen con el nombre viejo, en `_next/static/chunks/app/(site)/page-*.js` (busca `handle:`) y `@Akryst_` en los meta de `twitter:creator`. Cámbialos cuando renombres las cuentas.
3. **Archivos que no vienen en el zip:** `favicon.ico`, `opengraph-image.png`, `twitter-image.png`, `/88x31/take.gif` y tus fotos de `/photos/`.
4. **Mayúsculas:** el nombre quedó en minúscula (`take`) donde antes era `akryst`, y `Take` donde era `Akryst`. Si prefieres siempre `Take`, es un buscar y reemplazar.
