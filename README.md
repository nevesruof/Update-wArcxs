# Take

Sitio estático (menú con fondo líquido animado, filamentos de luz y motas bokeh, Settings, galería de fotos, presencia de Discord y trampas anti-copia).

## Cómo verlo
Windows: doble clic en `iniciar.bat` y abre http://localhost:8000
(o `python serve.py` desde esta carpeta). No abras `index.html` con doble clic: las fuentes y el fondo
se piden con rutas absolutas (`/fonts/...`, `/_next/...`) y solo cargan desde un servidor.

## Estructura
| Ruta | Qué es |
|---|---|
| `index.html` | El menú principal |
| `pages/settings.html` | Inicio con el panel Settings abierto (captura) |
| `pages/photos.html` | Galería de fotos (página estática, se sirve en `/photos`): 8 casillas vacías "About to fill up" con fondo de partículas |
| `css/take-extras.css` | Estilo del botón Skyline bloqueado |
| `js/menu-bg.js` | Fondo del menú: filamentos de luz + motas bokeh sobre el fondo líquido (Canvas 2D, sin librerías) |
| `js/canary.js`, `robots.txt` | Trampas anti-copia (ver más abajo) |
| `css/turbo-boost.css`, `js/turbo-boost.js` | Cursor 3D y botón TURBO BOOST (solo en Skyline; inactivo mientras Skyline esté bloqueado) |
| `images/` | Logo y fondos (`bg-fallback`, `bg-skyline`) |
| `videos/skyline.mp4` | Fondo en video |
| `fonts/spanish.woff` | Fuente del título `TAKE` (subconjunto de 17 KB, se precarga). `spanish.ttf` es el original completo, solo para regenerarla |
| `favicon.ico`, `images/icons/` | Favicon: la T sin fondo (`favicon.svg` blanca en tema oscuro y negra en claro; el `.ico` es blanco) y `apple-touch-icon.png` (iOS no admite transparencia, por eso lleva fondo oscuro) |
| `sfx/` | `tic`/`tac` del menú y `ambient.mp3` (música de fondo) |
| `api/` | Funciones de Vercel: `/api/activity`, `/api/lastfm` (+`/top-artist`), `/api/canary`, `/api/yt-search`, y el backend nuevo: `/api/guestbook`, `/api/counter`, `/api/settings`, `/api/admin/verify`, `/api/admin/cursor-token` (lógica en `api/_lib/backend.js`) |
| `cursors-server/` | Servidor WebSocket de los cursores compartidos (corre aparte de Vercel) |
| `js/presence.js` | Consulta `/api/activity` desde que carga la página y la comparte (`TakePresence`); precarga la foto de perfil |
| `js/music-pill.js`, `css/music-pill.css` | Píldora de música del menú (arriba al centro): suena sola con el primer click, en el mismo segundo que Discord (ver más abajo) |
| `js/particles-bg.js` | Fondo de partículas conectadas de Photos (mismo estilo que el menú, más sutil) |
| `js/photos-page.js` | Photos: aviso de hardware (X + se quita solo) y la transición de Portfolio |
| `css/about-extras.css` | Estilos del about (previews, stack con color al pasar el mouse) |
| `js/config.js` | Configuración pública: URL del servidor de cursores y dominios propios para `canary.js` |
| `pages/admin.html`, `css/admin.css`, `js/admin.js` | Login de admin (se sirve en `/admin`): campo y botón del estilo del sitio |
| `js/admin-particles.js` | Fondo de partículas que se conectan de `/admin` (distinto de `particles-bg.js`, el de Photos) |
| `tests/` | Pruebas: `node --test tests/*.test.js` (Node 18+). Las de cursores necesitan `npm install` dentro de `cursors-server/`; si no, se saltan |
| `serve.py`, `iniciar.bat` | Servidor local |
| `vercel.json` | Rewrites de imágenes, `/photos`, `/admin` y los cebos de las trampas |
| `_next/static/` | Build compilado de la app (ver nota abajo) |

### Sobre `_next/static/`
Es el resultado compilado de Next.js; no hay código fuente en este proyecto. Los archivos con hash
(`4bd1b696-….js`, `1255-….js`, etc.) son librerías (React, Next, three.js, framer-motion, iconify) y
**no se pueden renombrar**: Next guarda sus nombres dentro de `index.html` y renombrarlos rompe la carga.
El código propio (`app/layout`, `app/not-found`, `app/(site)/page`, `4190-…`, `1264-…`) está formateado
para poder leerse; las librerías siguen minificadas.

## Carga inicial sin parpadeos
Antes, al entrar se veía un instante el home con la fuente por defecto y luego la T. Ahora:
- **Primera visita de la sesión:** la pantalla negra con la T (la del componente de intro) viene ya en `index.html` (`.take-splash`) y se ve desde el primer pintado, cubriendo el home. Un script del `<head>` decide antes de pintar si toca (misma regla que la intro: una vez por sesión y no con "reducir movimiento"). Cuando React monta su intro, esta arranca ya visible y la relevo sin que se note (misma posición, medida al píxel). Si el JS no carga, la pantalla se quita sola a los 9 s.
- **Siguientes cargas:** el menú y el título no se ocultan ni repiten su animación de entrada al hidratar (antes se veía un parpadeo). Al abrir y cerrar paneles las animaciones siguen igual.
- **Fuentes:** `spanish.woff` pesa 17 KB (el `.ttf` pesaba 716 KB y llegaba tarde), se precarga, y las fuentes con archivo local usan `font-display: block` para que nunca se vea la de por defecto.
- **Contador y mensaje del home:** ya no vienen pegados en el HTML (eran de una captura vieja); salen en vivo de `/api/counter` y `/api/settings`. Para que se vea el mensaje pon `HOME_MESSAGE` en Vercel o cámbialo con `PUT /api/settings`.
- `font-display: block` solo en las fuentes que se precargan (DM Sans, Barlow 700/800 y el título); las demás siguen en `swap`.
- No vienen en el zip `Barlow Condensed` 400 y 600 (latin; el CSS las declara pero el archivo no está). Hoy el menú usa solo 700/800 y no se nota; si algún día usas esos pesos, bájalas de Google Fonts a `_next/static/media/` con los nombres que pide el CSS.

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

## Fondo del menú: filamentos de luz y motas bokeh
`js/menu-bg.js` (canvas 2D transparente, sin librerías) pinta dos cosas sobre el fondo líquido (`images/menu-bg.webp`, capa `.menu-liquid`):
- **Filamentos de luz:** hilos finos cian que siguen un campo de flujo que cambia muy despacio (ondulan como las líneas del GIF), cada uno con una chispa que lo recorre.
- **Motas de luz:** discos suaves, algunos con anillo (bokeh), que suben lentamente con vaivén; las cercanas son pequeñas y nítidas, las lejanas grandes y difusas. El cursor las aparta un poco y vuelven solas.
- El cursor o el dedo mueven todo un poco según la profundidad (parallax). Se pausa con la pestaña oculta; con "reducir movimiento" queda una imagen fija sobre fondo negro; si el equipo va justo baja a la mitad de hilos y motas.
- Ajustes rápidos al inicio del archivo: `FILAMENTS`, `STEPS`, `MOTES`, `COLOR`, `ALPHA` (y `flow()` si quieres otra forma de hilos).
- Reemplaza a los cubos 3D con partículas conectadas (y antes a la escena de three.js del módulo `1264`). El fondo de Photos (`js/particles-bg.js`) conserva las partículas conectadas.

## Música de fondo
`sfx/ambient.mp3` reemplaza al piano/ambiente anterior. Arranca al tocar la pantalla de carga (los navegadores no permiten
audio sin un toque) y se activa/desactiva con "ambient sound" en la pestaña music. Se repite en bucle y su volumen es 40 %
(antes 5 %): está en `_next/static/chunks/4190-*.js` (`.4 * (`). Es un archivo de 17 s; si notas el corte al repetirse, usa una versión más larga o un loop continuo.

## Settings: Skyline bloqueado
El botón **Skyline** de Settings → Background está desactivado (`disabled`) y en gris; solo queda **Underwater**.
Para reactivarlo: en `_next/static/chunks/4190-*.js` busca `className: "is-locked"` y vuelve a poner `onClick: () => t(!1)` sin `disabled`.

## Libro de visitas, contador, ajustes y admin
Lo que la web llamaba en `/api/guestbook`, `/api/counter`, `/api/settings` y `/api/admin/*` ya existe. Pasos (una sola vez):
1. **Base de datos:** Vercel → tu proyecto → Storage → crea una base **Upstash Redis** y conéctala al proyecto
   (agrega solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`). Sin base de datos funciona en memoria, que en Vercel se borra sola.
2. **Variables** (Settings → Environment Variables):
   - `ADMIN_KEY` (obligatoria para el admin): una clave larga, mínimo 12 caracteres. Sin ella el admin queda desactivado.
   - `CURSOR_SECRET` (opcional): secreto para que el servidor de cursores te reconozca como dueño; si no la pones se usa `ADMIN_KEY`.
   - `HOME_MESSAGE`, `VISITS_BASE`, `IP_SALT` (opcionales): mensaje inicial, número que se suma al contador y sal para anonimizar IPs.
3. **Redeploy.** Entra a `/admin`, escribe tu `ADMIN_KEY` y quedas como admin en esa pestaña: aparecen los botones de *reply* y *take liked this* en el libro de visitas.
   La clave se guarda solo en `sessionStorage` (se borra al cerrar la pestaña) y se manda por HTTPS en la cabecera `x-admin-key`.

Cómo se protege: la clave se compara en tiempo constante; 8 intentos fallidos bloquean esa red 10 minutos; el libro limita a 1 mensaje cada 20 s por visitante
y 6 por hora por red, rechaza enlaces `javascript:`, URLs con usuario/clave y mensajes con más de 2 enlaces, y un visitante solo puede dar un like por mensaje.
No se guardan IPs: solo un hash corto (con sal) para los límites. Cambiar el mensaje del home: `PUT /api/settings` con `{"homeMessage":"..."}` y la cabecera `x-admin-key`.
Para probar las funciones en local usa `vercel dev` (`serve.py` solo sirve archivos estáticos).

## Cursores compartidos (tiempo real)
Vercel no soporta WebSocket, así que `cursors-server/` se despliega aparte (Render, Fly, Railway, un VPS...):
```
cd cursors-server && npm install && npm start      # puerto 8787, ruta /api/cursors
```
Variables del servidor: `CURSOR_SECRET` (igual que en Vercel), `ALLOWED_ORIGINS` (ej. `wwarcxs.vercel.app`, tu dominio nuevo; obligatorio en producción),
`TRUST_PROXY=1` si va detrás de un proxy, `PORT`. Después pon la URL en `js/config.js`: `window.TAKE_CURSORS_URL = "wss://tu-servidor/api/cursors"`
(con una web `https` tiene que ser `wss://`, o sea, con certificado; una IP:puerto pelada no sirve).
Mientras `TAKE_CURSORS_URL` esté vacío los cursores compartidos están **desactivados** y la web no intenta conectarse a nada.
Quedan sin implementar el minijuego de burbujas y los "encuentros"; la web funciona igual sin ellos. Salud del servidor: `GET /health`.

## Trampas (canaries)
Pasivas: solo registran y avisan; no hacen nada contra el visitante.
| Trampa | Cómo salta | Qué recibes |
|---|---|---|
| **Copia del sitio** (`js/canary.js`) | La página se abre desde un dominio que no es el tuyo (`whoistake.vercel.app`, `whoistake.com`, el anterior `wwarcxs.vercel.app`, sus previews, localhost y redes locales están permitidos) | Aviso con dominio, ruta, referrer, IP y navegador (una vez por sesión) |
| **Cebo** (`/private/*`, `/backup/*`) | Solo aparecen en `robots.txt` y en un enlace oculto del HTML. Un navegador normal nunca entra; un bot que ignora `robots.txt` o sigue enlaces ocultos, sí | Aviso (responde un 404 normal para no delatarse) |
| **Escaneos** (`/wp-login.php`, `/.env`, `/.git/config`, `/xmlrpc.php`, `/phpmyadmin`…) | Escáneres automáticos | Solo en los logs (si no, sería mucho ruido) |
| **Marca de agua** `TKWM-…` | Cadena única repetida en `index.html`, CSS, JS y `robots.txt` | Búscala en Google/GitHub (`"TKWM-40632a5f-41f0-9fe6-22f804d522ac"`) para encontrar copias |

**Configurar el aviso en Discord (opcional):** en un canal → Editar canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.
En Vercel → Settings → Environment Variables agrega `CANARY_WEBHOOK_URL` con esa URL y haz Redeploy. Opcional: `CANARY_ALERT_ALL=1` para avisar también los escaneos.
Sin webhook, todo queda en Vercel → Logs (filtra por `CANARY`). El aviso limpia el texto que llega (sin pings ni markdown), no repite el mismo origen en 10 minutos y envía como máximo 20 por hora.
**Dominio propio:** si lo conectas, agrégalo en `js/config.js` (`window.TAKE_ALLOWED_HOSTS = ["midominio.com"]`; si no, tu propio dominio se detectaría como copia) y cambia el dominio base64 de `js/canary.js` (`printf 'https://midominio.com' | base64`), que es adonde llega la señal.
**Límites:** quien copie el sitio puede borrar `canary.js`; por eso hay varias capas. Como segunda capa independiente puedes crear un *Cloned Website* token gratis en canarytokens.org y pegar su snippet. Los rewrites de los cebos están en `vercel.json` y no pude probarlos en Vercel desde aquí (la lógica sí está probada).

## Auditoría de seguridad y privacidad
Se revisaron todos los archivos buscando trackers, balizas, ejecución dinámica y llamadas de red:
- **Quitado:** el script `Watermark` (reportaba el dominio de quien copiara el sitio y cargaba un canarytoken)
  y el beacon de Cloudflare Analytics. Revisado de nuevo: no quedan trackers ni canarytokens de terceros, `eval`, `new Function`
  ni credenciales fijas. Lo único de este tipo son las **trampas propias** de abajo, que solo avisan a tu Vercel/Discord.
- **Peticiones al mismo dominio** (`/api/counter`, `/api/guestbook`, `/api/settings`, `/api/admin/*`): ahora las atiende el backend de este proyecto.
  El WebSocket de cursores solo se abre si configuras `TAKE_CURSORS_URL` (tu propio servidor). Nada de esto se envía a terceros.
- **Panel admin:** si existe `admin_key` en `sessionStorage`, la web la manda a `/api/admin/*`, que la valida contra `ADMIN_KEY`.
  No hay ninguna clave dentro del código.
- **Único tercero en tiempo de ejecución:** los iconos usan Iconify y piden su SVG a
  `api.iconify.design` (con respaldo en `api.simplesvg.com` y `api.unisvg.com`).
  Spotify, Discord y GitHub solo se usan para mostrar imágenes y enlaces.
- El bot por defecto de `api/_lib/bot.js` apunta a `fi4.bot-hosting.cloud`; cámbialo con `ACTIVITY_BOT_URL`.

## Pendientes tras el cambio de nombre
1. **Dominio:** busca `tu-dominio.com` (og:url, og:image, twitter:image, canonical, aviso de la consola) y cámbialo por tu dominio real.
2. **Redes:** los enlaces y handles de GitHub, Instagram, Twitter, Twitch, Ko-fi, VGen, Steam y los repos siguen con el nombre viejo, en `_next/static/chunks/app/(site)/page-*.js` (busca `handle:`) y `@Akryst_` en los meta de `twitter:creator`. Cámbialos cuando renombres las cuentas.
3. **Archivos que no vienen en el zip:** `opengraph-image.png`, `twitter-image.png`, y, cuando las tengas, tus fotos de `/photos/`.
4. **Mayúsculas:** el nombre quedó en minúscula (`take`) donde antes era `akryst`, y `Take` donde era `Akryst`. Si prefieres siempre `Take`, es un buscar y reemplazar.

## About, música y Photos
- **Presencia:** `js/presence.js` consulta `/api/activity` desde que carga la página (no al abrir "about me"), precarga la foto de perfil y la recuerda en `localStorage` para que ya esté cargada al abrir el about.
- **Offline:** `/api/activity` agrega `last_active` (guardado en el store, Upstash Redis en Vercel) y la web muestra "• last active 3 hours ago". Sin Redis solo dura mientras viva la instancia.
- **Píldora de música:** `js/music-pill.js` la crea en `<body>` (no depende de React, así no se corta al abrir paneles). Muestra `canción - artista` con portada, ecualizador y una línea de progreso; si no suena nada en Discord, enseña la última de Last.fm atenuada. Se oculta con about me / guestbook / settings abiertos; en Photos va en la esquina superior derecha. Click en la portada = silenciar, click en el texto = letra sincronizada (una línea con rebote).
- **Suena sola (sin confirmación):** con el primer click/toque/tecla en la página, `/api/yt-search` busca en YouTube (Data API v3) solo la canción que suena en tu Discord y el IFrame Player la reproduce en el mismo segundo; se corrige cada segundo y cambia sola de canción. Requiere `YOUTUBE_API_KEY` en Vercel (Settings → Environment Variables, luego Redeploy); nunca la pegues en el código. `search.list` cuesta 100 unidades de 10,000 al día, por eso hay tope de 90 búsquedas diarias. Mientras suena, la música ambiente se pausa (`window.TakeAmbient`) y vuelve cuando no hay nada o YouTube no encuentra el video.
- **Portfolio:** usa exactamente la misma transición que Photos (barrido diagonal + logo, `PageTransitionProvider` en `4190-*.js`) y, a los 600 ms, abre `https://arcxsdev.com/`. Ya no hay intro propia.
- **Stack del about:** los iconos van en gris y, al pasar el mouse, mantener el click o enfocar con teclado, toman el color de su marca (`TakeBrand` en `page-*.js`, variable CSS `--brand`; los logos negros usan blanco para verse sobre el fondo oscuro).
- **Previews del about** (zed, discord bots, github): imagen grande con pie. `images/discord-bots.png` es un recorte de la captura de la página de iTake (proporción 168×104; cámbiala por otra conservando el nombre). El fondo de los cuadros es `images/preview-bg.webp` (tu GIF líquido azul/blanco convertido a webp animado: 120 KB en vez de 4.4 MB); se cambia en `css/about-extras.css` (`.bio-preview`).
- **Fondo líquido del menú:** `js/menu-bg.js` pone una capa `.menu-liquid` (`images/menu-bg.webp`, tu GIF azul/blanco a 500 px, 215 KB) detrás de su canvas, que es transparente. El velo oscuro y el `inset:-3%` (recorta el marco negro del GIF) están en `css/take-extras.css`. Se desvanece al abrir about me / guestbook / settings, y con "reducir movimiento" vuelve el fondo negro.
- **Photos:** 8 casillas vacías ("About to fill up", fecha `-`, usuarios `Unset`) en `pages/photos.html`; cuando haya fotos, cada casilla es un bloque `.photo-slot` (ahí se añade el `<img>`). Fondo de partículas en `js/particles-bg.js` (`COUNT`, `LINK`, `ALPHA`).
- **Aviso de hardware:** sale solo si el equipo renderiza por software o pide menos movimiento; se cierra con la X o se quita solo a los 8 s bajando (`css/take-extras.css`, `layout-*.js` y `js/photos-page.js`). A propósito no se apaga con "reducir movimiento".
- **Contador:** `VISITS_BASE` (por defecto 18786) se suma a las visitas reales; con 3 visitas se ve 18,789.
- Pruebas: `node --test tests/*.test.js`.
