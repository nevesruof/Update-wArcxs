Readme hecho por Claude, no por mí.

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
| `css/take-extras.css` | Estilo del botón Skyline bloqueado + velo renovado del fondo líquido (resplandor superior, viñeta) y rayos de luz `.menu-atmo` |
| `css/take-refresh.css` | **Renovación visual 2026** de la home: grano fílmico, paneles de cristal oscuro, menú con hover luminoso, scrollbars/selection/focus. Capa aditiva: se carga la última y no toca reglas base |
| `css/photos-refresh.css` | **Renovación visual 2026** de `/photos`: viñeta `.photos-atmo`, casillas con hover que levita y barrido de luz, píldora de navegación en cian hielo |
| `js/menu-bg.js` | Fondo del menú: filamentos de luz (doble halo) + motas bokeh sobre el fondo líquido (Canvas 2D, sin librerías); inyecta la capa de rayos `.menu-atmo` |
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
| `css/about-panel.css`, `js/about-panel.js` | About: contenedor con scroll y barra arrastrable (se ve también en iPhone), preview de los links que se acomoda dentro del panel y sin contorno de foco en el panel |
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
`js/menu-bg.js` (canvas 2D transparente, sin librerías) pinta dos cosas sobre el fondo líquido:
- **Filamentos de luz:** hilos finos cian que siguen un campo de flujo que cambia muy despacio (ondulan como las líneas del fondo), cada uno con una chispa que lo recorre.
- **Motas de luz:** discos suaves, algunos con anillo (bokeh), que suben lentamente con vaivén; las cercanas son pequeñas y nítidas, las lejanas grandes y difusas. El cursor las aparta un poco y vuelven solas.
- **Fondo líquido:** `<video>` en bucle (`images/menu-bg.mp4` / `.webm`, tu GIF azul/blanco: 32 KB / 24 KB) en la capa `.menu-liquid`, con `images/menu-bg-poster.webp` como imagen fija. Si el navegador bloquea el autoplay (ahorro de batería) queda el póster y arranca con el primer toque; si no soporta ningún formato de vídeo cae al `images/menu-bg.webp` animado. En iPhone/iPad no se usa `<video>`: los visores del móvil abren el reproductor a pantalla completa con cada `play()`, así que ahí va directo el `images/menu-bg.webp` animado (mismos 48 cuadros).
- El cursor o el dedo mueven todo un poco según la profundidad (parallax).

**Rendimiento** (todo en `js/menu-bg.js`; se nota sobre todo en celular):
- Dibuja a 30 fps (15 con un panel abierto): el movimiento es lento y más fps no se ve, pero cuestan el doble.
- Resolución de dibujo adaptable: parte de 1x (celular) / 1.25x (PC) y baja sola hasta 0.6x si el equipo va justo; si aun así va justo, usa la mitad de hilos y motas.
- Motas y chispas son sprites pre-dibujados (`drawImage`); cada hilo es un solo trazo con degradado a lo largo.
- El vídeo decodifica por hardware y se pausa con un panel abierto (about me, guestbook, settings) o con la pestaña oculta. El estado del panel se marca con `<html class="panel-open">` (el CSS lo usa en vez de `:has()`, que cuesta en cada cambio del DOM).
- La píldora de música no usa `backdrop-filter` (re-desenfocar un fondo animado en cada frame pesa mucho).
- Con "reducir movimiento" queda una imagen fija sobre fondo negro.
- Ajustes rápidos al inicio del archivo: `FILAMENTS`, `STEPS`, `MOTES`, `COLOR`, `ALPHA`, `FPS`, `SCALE`.

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
- **Píldora de música:** `js/music-pill.js` la crea en `<body>` (no depende de React, así no se corta al abrir paneles). Muestra el nombre de la canción y, debajo, el artista, con portada, ecualizador y una línea de progreso; si no suena nada en Discord, enseña la última de Last.fm atenuada. Se oculta con about me / guestbook / settings abiertos; en Photos va en la esquina superior derecha. Click en la portada = silenciar, click en el texto = letra sincronizada (una línea con rebote).
- **Suena sola (sin confirmación):** con el primer click/toque/tecla en la página, `/api/yt-search` busca en YouTube (Data API v3) solo la canción que suena en tu Discord y el IFrame Player la reproduce en el mismo segundo; se corrige cada segundo y cambia sola de canción. Requiere `YOUTUBE_API_KEY` en Vercel (Settings → Environment Variables, luego Redeploy); nunca la pegues en el código. `search.list` cuesta 100 unidades de 10,000 al día, por eso hay tope de 90 búsquedas diarias. Mientras suena, la música ambiente se pausa (`window.TakeAmbient`) y vuelve cuando no hay nada o YouTube no encuentra el video.
- **Portfolio:** usa exactamente la misma transición que Photos (barrido diagonal + logo, `PageTransitionProvider` en `4190-*.js`) y, a los 600 ms, abre `https://arcxsdev.com/`. Ya no hay intro propia.
- **Stack del about:** los iconos van en gris y, al pasar el mouse, mantener el click o enfocar con teclado, toman el color de su marca (`TakeBrand` en `page-*.js`, variable CSS `--brand`; los logos negros usan blanco para verse sobre el fondo oscuro).
- **Previews del about** (zed, discord bots, github): imagen grande con pie. `images/discord-bots.png` es un recorte de la captura de la página de iTake (proporción 168×104; cámbiala por otra conservando el nombre). El fondo de los cuadros es `images/preview-bg.webp` (tu GIF líquido azul/blanco convertido a webp animado: 120 KB en vez de 4.4 MB); se cambia en `css/about-extras.css` (`.bio-preview`).
- **Photos:** 8 casillas vacías ("About to fill up", fecha `-`, usuarios `Unset`) en `pages/photos.html`; cuando haya fotos, cada casilla es un bloque `.photo-slot` (ahí se añade el `<img>`). Fondo de partículas en `js/particles-bg.js` (`COUNT`, `LINK`, `ALPHA`).
- **Aviso de hardware:** sale solo si el equipo renderiza por software o pide menos movimiento; se cierra con la X o se quita solo a los 8 s bajando (`css/take-extras.css`, `layout-*.js` y `js/photos-page.js`). A propósito no se apaga con "reducir movimiento".
- **Contador:** `VISITS_BASE` (por defecto 18786) se suma a las visitas reales; con 3 visitas se ve 18,789.
- **Scroll del about:** `.about-panel` hace scroll suave (`scroll-behavior: smooth`) y `js/about-panel.js` le pone una barra a la derecha del panel: se arrastra con el dedo o el mouse, un toque en la pista salta suave a ese punto y con teclado responde a flechas, RePág/AvPág, Inicio y Fin. Solo aparece cuando el contenido no cabe (por eso en pantallas bajas se llega hasta las redes del final).
- **Sin contorno al abrir el panel:** el panel recibe el foco por código al abrir y la regla global `:focus-visible` de `css/take-refresh.css` le dibujaba un borde cian; `css/about-panel.css` lo quita solo del panel (los botones y links de adentro conservan su foco).
- **Previews de los links:** `placePreview` en `js/about-panel.js` mide la tarjeta al pasar el mouse, tocar o enfocar y la desplaza (`--shift`) para que no se salga del panel; si arriba no hay espacio la pone debajo del link (`bio-preview--below`).
- Pruebas: `node --test tests/*.test.js`.

## Notas del código (lo que antes eran comentarios)

Se quitaron todos los comentarios de los archivos propios (excepto la marca de agua `TKWM-…`, que es una trampa anti-copia). Aquí queda lo que decían: primero el encabezado de cada archivo y luego cada nota con la línea de código a la que acompañaba. Las librerías minificadas de `_next/static/` no se tocaron.


### API

<details>
<summary><code>api/_lib/backend.js</code></summary>

- `const crypto = require("node:crypto");`: Backend de la web: libro de visitas, contador, ajustes y acceso de admin.
  Cada funcion de /api/* es un envoltorio de una linea sobre estas (igual que canary.js).
  Variables de entorno en Vercel:
    ADMIN_KEY        clave de admin (minimo 12 caracteres). Sin ella el admin queda desactivado.
    CURSOR_SECRET    (opcional) secreto para firmar el token de dueno de los cursores; por defecto usa ADMIN_KEY.
    HOME_MESSAGE     (opcional) mensaje inicial del home.
    VISITS_BASE      (opcional) numero que se suma al contador de visitas (por defecto 18786: con 3 visitas reales se ve 18,789).
    IP_SALT          (opcional) sal para anonimizar las IP en los limites de uso.
    + las del almacen (ver _lib/store.js).
  No se guarda ninguna IP: solo un hash corto que sirve para limitar abusos.
- `async function adminCheck(req, store, env) {`: "ok" \| "denied" \| "limited" \| "disabled". Tras 8 fallos desde la misma red, bloquea 10 minutos.
- `if ((await store.hlen(GB)) > LIMITS.maxEntries) {`: recorta las mas viejas
- `if (!b.action) {`: like de un visitante: una vez por visitante
- `else { count = await store.incr("take:visits"); addCookie(res, "tk-seen=1" + coo`: cuenta 1 vez cada 12 h

</details>

<details>
<summary><code>api/_lib/bot.js</code></summary>

- `const DEFAULT_URL = "http://fi4.bot-hosting.cloud:25319/api/activity";`: Puente entre la web y el bot de actividad (bot/main.py -&gt; GET /api/activity).
  El bot corre en su hosting; estas funciones corren en Vercel (servidor). Asi el token del bot
  nunca llega al navegador y no hay problemas de CORS ni de contenido mixto (http/https).
  Variables de entorno en Vercel (Settings -&gt; Environment Variables):
    ACTIVITY_BOT_URL    URL completa del bot terminada en /api/activity
                        (por defecto http://fi4.bot-hosting.cloud:25319/api/activity)
    ACTIVITY_BOT_TOKEN  mismo valor que API_TOKEN del bot (solo si el bot lo tiene configurado)
- `function offlinePresence(profile, raw) {`: Estado vacio: se usa cuando el bot no responde o Discord no lo conoce (el bot lo marca "unknown").
- `function lastOnlineAt(raw) {`: Ultima vez que estuvo online/idle/dnd (ms), a partir del historial de estados del bot.
- `function recentTrack(raw) {`: Ultima cancion registrada (la de ahora si esta escuchando, o la ultima que escucho).
- `function toPresence(raw) {`: Respuesta del bot -&gt; mismo formato que antes entregaba Lanyard (lo que espera la interfaz).
- `positionMs: music.startMs ? Math.max(0, Date.now() - music.startMs) : null,`: segundo exacto en el que va, calculado en el servidor (no depende del reloj del visitante)
- `function toTracks(raw, limit) {`: Historial de Spotify del bot -&gt; { tracks: [...] } (lista "on repeat" de la pestana music).
- `function toTopArtist(raw) {`: Artista mas escuchado dentro del historial reciente que entrega el bot (hasta 100 canciones).
- `if (!entry.image && s.image) entry.image = s.image;`: portada de la cancion mas reciente de ese artista
- `function route(build, { cache, onError }) {`: Envuelve una funcion de Vercel: GET, cache de CDN corta y errores sin cachear.

</details>

<details>
<summary><code>api/_lib/canary.js</code></summary>

- `const DEDUPE_MS = 10 * 60 * 1000;`: Trampas (canaries) del sitio: avisan cuando algo toca lo que un visitante normal nunca toca.
  Son pasivas: solo registran y avisan, no hacen nada contra nadie.
    trap=clone  /js/canary.js manda una senal si el sitio se carga desde un dominio que no es el tuyo (copia/proxy).
    trap=bait   cebo: rutas /private/* y /backup/* (solo aparecen en robots.txt y en un enlace oculto). Quien entra
                ahi es un scraper/bot que ignora robots.txt o sigue enlaces ocultos.
    trap=scan   rutas tipicas de escaneres (/wp-login.php, /.env, /.git/config...). Solo se registran en los logs.
  Variables de entorno en Vercel (opcionales):
    CANARY_WEBHOOK_URL  webhook de un canal de Discord para recibir el aviso (clone y bait).
    CANARY_ALERT_ALL=1  tambien avisa por Discord los "scan" (puede ser mucho ruido).
  Sin webhook, todo queda igualmente en Vercel -&gt; Logs (busca "CANARY").
- `const DEDUPE_MS = 10 * 60 * 1000;`: misma trampa + misma IP + mismo host: un solo aviso cada 10 min
- `const MAX_WEBHOOKS_PER_HOUR = 20;`: tope por instancia, por si alguien intenta inundarte el canal
- `function clean(v, max = 120) {`: Texto controlado por el atacante -&gt; seguro para logs y para Discord (sin pings, markdown ni saltos de linea).
- `host: clean(one(q.host), 100),`: clone: dominio desde el que se cargo la copia
- `const key = trap + "|" + entry.ip + "|" + entry.host;`: una linea de log estructurada por aviso (Vercel -&gt; Logs; filtra por CANARY)
- `return res.status(404).send("Not Found");`: igual que cualquier 404: no delata la trampa

</details>

<details>
<summary><code>api/_lib/lastactive.js</code></summary>

- `const { getStore } = require("./store");`: "Last active" de Discord: cuando el bot dice offline, la web quiere mostrar hace cuanto estuviste activo.
  Guardamos en el store (Upstash Redis en Vercel) la ultima vez que vimos un estado distinto de offline.
  Sin Redis funciona en memoria, que en Vercel se pierde entre invocaciones (ver README).
- `const WRITE_EVERY_MS = 60 * 1000;`: no escribir en cada consulta: una vez por minuto basta
- `async function withLastActive(presence, { store = getStore(), now = Date.now } =`: Agrega a la presencia `now` (hora del servidor, para sincronizar el segundo de la cancion en el navegador)
  y `last_active` (ms epoch, solo cuando esta offline; null si nunca lo hemos visto activo).
- `}`: el store es opcional: sin el solo se pierde el "last active"

</details>

<details>
<summary><code>api/_lib/lastfm.js</code></summary>

- `const DEFAULT_URL = "https://ws.audioscrobbler.com/2.0/";`: Cliente de Last.fm (user.getRecentTracks / user.getTopArtists) para la pestana "music".
  Corre en Vercel (servidor): la API key nunca llega al navegador.
  Variables de entorno en Vercel (Settings -&gt; Environment Variables, despues Redeploy):
    LASTFM_API_KEY   API key de https://www.last.fm/api/account/create
    LASTFM_USER      tu usuario de Last.fm (el de last.fm/user/&lt;usuario&gt;)
    LASTFM_API_URL   (opcional, solo para pruebas) base de la API; por defecto https://ws.audioscrobbler.com/2.0/
- `const PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";`: Last.fm devuelve esta imagen (la estrella gris) cuando una cancion no tiene portada.
- `function pickImage(images) {`: Mejor portada disponible (extralarge &gt; large &gt; medium) o null si es el placeholder.
- `function toTracks(raw, limit) {`: user.getRecentTracks -&gt; { tracks: [...] } con el formato que espera la interfaz.
- `const items = Array.isArray(list) ? list : list ? [list] : [];`: con limit=1 Last.fm puede devolver un objeto
- `function toTopArtist(rawTop, recent) {`: Artista mas escuchado (ultimos 30 dias) + portada tomada de sus canciones recientes.
- `function route(build, { cache }) {`: Envuelve una funcion de Vercel: GET, cache de CDN corta y errores sin cachear.

</details>

<details>
<summary><code>api/_lib/store.js</code></summary>

- `function createMemoryStore(now = () => Date.now()) {`: Almacenamiento del backend (libro de visitas, contador, ajustes y limites de uso).
   - Con Upstash Redis (o Vercel KV) cuando existen las variables de entorno:
         UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (o KV_REST_API_URL + KV_REST_API_TOKEN)
   - Sin ellas usa memoria: sirve para probar en local, pero en Vercel se pierde entre invocaciones.
  Los dos almacenes exponen la misma interfaz, asi el resto del codigo no sabe cual esta usando.
- `const data = new Map();`: clave -&gt; { v, exp }
- `async hit(k, ttl) {`: contador con caducidad que empieza en el primer golpe

</details>

<details>
<summary><code>api/_lib/youtube.js</code></summary>

- `const API = "https://www.googleapis.com/youtube/v3";`: Busca en YouTube el video de la cancion que esta sonando en Spotify para poder reproducirla en la web
  (YouTube IFrame Player) justo en el mismo segundo.
  Variable de entorno en Vercel (Settings -&gt; Environment Variables, despues Redeploy):
    YOUTUBE_API_KEY   API key de YouTube Data API v3 (console.cloud.google.com -&gt; APIs -&gt; YouTube Data API v3)
  Cuota: search.list cuesta 100 unidades (10 000 al dia = ~100 busquedas) y videos.list 1. Por eso el resultado
  se guarda en el store por cancion y solo se busca una vez por cancion.
- `function cleanTitle(name) {`: "Song (feat. X) - Remastered 2011" -&gt; "Song".
- `function mainArtist(artist) {`: Spotify separa artistas con ";" -&gt; usamos el primero.
- `function parseDuration(iso) {`: "PT3M45S" / "PT1H2M3S" -&gt; milisegundos.
- `function pickBest(candidates, { title, artist, durationMs }) {`: Elige el mejor candidato: la duracion parecida a la de Spotify pesa mas (si el video dura distinto, el segundo
  ya no coincide), despues que el titulo trate de la cancion y que el canal sea el artista o un "- Topic".
  candidates: [{ videoId, title, channel, durationMs }]
- `if (best.score < 0) return null;`: sin ninguna pista de que sea la cancion no devolvemos nada (mejor silencio que otra cancion)
- `async function findVideo({ title, artist, durationMs }, { key = process.env.YOUT`: search.list (5 resultados) + videos.list (duraciones) -&gt; mejor video o null.

</details>

<details>
<summary><code>api/activity.js</code></summary>

- `const { route, toPresence, offlinePresence } = require("./_lib/bot");`: GET /api/activity -&gt; presencia de Discord (online/idle/dnd/offline, avatar, Spotify, actividades).
  Reemplaza a Lanyard: la fuente es el bot propio (bot/main.py).
  Extra: `now` (hora del servidor) y `last_active` (solo offline) para el "last active" y para sincronizar la cancion.
- `cache: "public, s-maxage=2, stale-while-revalidate=10",`: s-maxage corto: la web calcula el segundo de la cancion con `now` + el header Age, asi que el error maximo es ~2 s.
- `onError: () => withLastActive(offlinePresence(null)),`: Si el bot no responde no sabemos el estado: se muestra offline en vez de dejar el ultimo estado congelado.

</details>

<details>
<summary><code>api/admin/cursor-token.js</code></summary>

- `const { cursorToken } = require("../_lib/backend");`: POST /api/admin/cursor-token  (cabecera x-admin-key)  -&gt;  { token } para ser "dueno" en los cursores

</details>

<details>
<summary><code>api/admin/verify.js</code></summary>

- `const { adminVerify } = require("../_lib/backend");`: POST /api/admin/verify  (cabecera x-admin-key)  -&gt;  200 { ok: true } o 401

</details>

<details>
<summary><code>api/canary.js</code></summary>

- `const { handleCanary } = require("./_lib/canary");`: GET\|POST\|HEAD /api/canary?trap=clone\|bait\|scan  (ver api/_lib/canary.js)

</details>

<details>
<summary><code>api/counter.js</code></summary>

- `const { counter } = require("./_lib/backend");`: /api/counter (ver api/_lib/backend.js)

</details>

<details>
<summary><code>api/guestbook.js</code></summary>

- `const { guestbook } = require("./_lib/backend");`: /api/guestbook (ver api/_lib/backend.js)

</details>

<details>
<summary><code>api/lastfm/index.js</code></summary>

- `const { lastfm, toTracks, route } = require("../_lib/lastfm");`: GET /api/lastfm?limit=20 -&gt; { tracks: [...] } desde Last.fm (user.getRecentTracks). El primero trae nowPlaying:true si estas escuchando algo.
- `{ cache: "public, s-maxage=15, stale-while-revalidate=30" }`: Corto para que "now playing" no se quede viejo.

</details>

<details>
<summary><code>api/lastfm/top-artist.js</code></summary>

- `const { lastfm, toTracks, toTopArtist, route } = require("../_lib/lastfm");`: GET /api/lastfm/top-artist -&gt; { artist, image } artista mas escuchado en los ultimos 30 dias ({} si no hay datos).
- `const recent = await lastfm("user.getrecenttracks", { limit: "50" }).then((r) =>`: La imagen del artista en Last.fm es un placeholder; usamos la portada de una cancion reciente suya.

</details>

<details>
<summary><code>api/settings.js</code></summary>

- `const { settings } = require("./_lib/backend");`: /api/settings (ver api/_lib/backend.js)

</details>

<details>
<summary><code>api/yt-search.js</code></summary>

- `const { fetchSnapshot, toPresence } = require("./_lib/bot");`: GET /api/yt-search -&gt; { track, video } del video de YouTube para la cancion que suena AHORA en tu Discord/Spotify.
  No acepta consultas del visitante: busca solo lo que el bot dice que estas escuchando, asi nadie puede gastar la cuota.
  El resultado se guarda en el store por cancion (solo se busca una vez por cancion).
- `const DAILY_SEARCHES = 90;`: search.list cuesta 100 de 10 000 unidades diarias: dejamos margen
- `if (cached) { try { return JSON.parse(cached); } catch (e) {`: se vuelve a buscar

</details>


### CSS

<details>
<summary><code>css/about-extras.css</code></summary>

```text
About me: detalles nuevos (presencia, previews, stack). La musica vive ahora en css/music-pill.css.
```

- `.tiny-dot{display:inline-block;width:3px;height:3px;border-radius:50%;background`: punto diminuto (mas chico que el status-dot)
- `.bio-last-seen{display:inline-flex;align-items:center;gap:5px;margin-left:4px;co`: "last active 1 hour ago" cuando estas offline en Discord
- `.settings-note{display:flex;align-items:center;gap:6px;margin-top:6px;color:#7f8`: nota bajo el apodo del cursor (Settings)
- `.bio-preview{`: fondo animado de los cuadros de preview (images/preview-bg.webp, el GIF liquido azul/blanco); el velo oscuro mantiene legible el texto
- `.bio-tool{color:#8f9ca3;opacity:.7;transition:color .18s,opacity .18s;-webkit-ta`: stack: logos grises; al pasar el mouse, hacer click (mientras se mantiene) o enfocar con teclado recuperan su color original

</details>

<details>
<summary><code>css/admin.css</code></summary>

```text
admin.css - pagina de login de admin (/admin). Mismo estilo que el sitio: fuente DM Sans, campos redondeados, fondo oscuro.
```

- `font-size: 16px;`: 16px o mas: iOS no hace zoom al enfocar

</details>

<details>
<summary><code>css/music-pill.css</code></summary>

```text
Pildora de musica (js/music-pill.js): arriba al centro del menu, pequena y casi transparente.
```

- `background:rgba(14,20,28,.34);border:1px solid rgba(255,255,255,.085);`: sin desenfoque del fondo: re-desenfocar un fondo animado en cada frame pesa mucho
- `.np-pill::after{`: fina linea de progreso en el borde inferior
- `.np-eq{display:flex;align-items:flex-end;gap:2px;flex:none;height:11px;margin-le`: ecualizador: se mueve solo mientras suena
- `.np-pill-lyrics{`: letra: una linea con rebote bajo la pildora
- `.np-yt{position:fixed;left:-400px;top:0;width:200px;height:200px;opacity:.01;poi`: reproductor de YouTube: fuera de pantalla
- `html.panel-open .np-pill,`: en el menu: solo se ve con el menu abierto (no con about me / guestbook / settings abiertos); js/menu-bg.js pone &lt;html class="panel-open"&gt;
- `html[data-np-pos="corner"] .np-pill{left:auto;right:max(18px,env(safe-area-inset`: paginas sin menu (Photos): esquina superior derecha, para no chocar con la barra de arriba
- `@media (max-width:768px){`: celular: el logo "take" y el menu van arriba y al centro; la pildora queda mas pegada al borde y mas pequena

</details>

<details>
<summary><code>css/photos-refresh.css</code></summary>

```text
============================================================================
photos-refresh.css — Renovación visual 2026 de /photos (capa aditiva)
Cargar después de los estilos inline de la página.
============================================================================
```

- `.photos-atmo {`: Viñeta + resplandor superior sobre las partículas (la capa la inyecta el
     propio HTML, justo detrás del canvas). Estática: cero coste de animación.
- `.header-pill {`: píldora de navegación: mismo cian hielo del sitio
- `.photos-back {`: enlace "Back"
- `.photos-title {`: título
- `.photo-slot {`: casillas de fotos: tarjeta con hover que levita y un barrido de luz
- `::selection { background: rgba(141, 207, 215, .28); color: #fff; }`: detalles globales de la página

</details>

<details>
<summary><code>css/take-extras.css</code></summary>

```text
Ajustes propios de Take.

El fondo del menu es el canvas de js/menu-bg.js (filamentos de luz + motas bokeh) sobre la capa .menu-liquid.
(Antes: cubos 3D con particulas, y antes un fondo de ciudad futurista con three.js; ya no existen.)
```

- `.settings-background button.is-locked,`: Boton de fondo bloqueado (Settings &gt; Background &gt; Skyline): en gris y no se puede pulsar.
- `@media (max-width: 768px) {`: Movil: la flecha ▶ estaba dentro del flex y empujaba las etiquetas ~10px a la izquierda del centro
     (logo, tagline y hint si estan centrados). Se saca del flujo para que la etiqueta quede centrada de verdad.
- `@media (min-width: 769px) {`: Escritorio: las etiquetas tienen 20px de padding dentro de su caja y quedaban sangradas respecto al logo,
     al tagline y al hint. Se corre la caja 20px a la izquierda para que el TEXTO quede en el mismo borde.
- `.hero-panel-header h1 { margin-right: -.12em; }`: El letter-spacing agrega espacio despues de la ultima letra y el titulo de la derecha ("about me")
     quedaba unos px metido respecto a la linea divisoria.
- `.hw-toast{animation:hw-toast-in .5s cubic-bezier(.22,1,.36,1) both}`: --- Aviso "Hardware acceleration is disabled" ---------------------------------------------------------
     Sube al aparecer, se puede cerrar con la X y, si no, se quita solo a los pocos segundos bajando.
     Usa la propiedad `translate` (no `transform`) para no pisar el -translate-x-1/2 que lo centra.
     A proposito NO se apaga con "reducir movimiento": ese es justo el caso en el que sale el aviso y se quiere ver.
- `.menu-liquid{`: --- Fondo liquido del menu principal (capa creada por js/menu-bg.js, detras de su canvas) -------------------
     &lt;video&gt; en bucle (images/menu-bg.mp4/.webm, decodifica por hardware; poster estatico si el autoplay esta bloqueado).
     El velo oscuro baja el brillo para que el logo, el menu y la pildora de musica se lean. Se ve solo con el menu abierto:
     con about me / guestbook / settings abiertos (&lt;html class="panel-open"&gt;, lo pone js/menu-bg.js) se desvanece y se pausa.
- `position:fixed;inset:-3%;z-index:0;pointer-events:none;opacity:0;transition:opac`: -3%: recorta el borde del video
- `.menu-liquid::after{content:"";position:absolute;inset:0;background:`: Velo renovado (2026): tres capas — resplandor superior, viñeta lateral e
     inferior, y velo vertical. Da profundidad sin comerse los filamentos.
- `.menu-atmo{position:fixed;inset:-5%;z-index:0;pointer-events:none;overflow:hidde`: --- Rayos de luz (.menu-atmo): capa inyectada por js/menu-bg.js por delante
     del vídeo y detrás del canvas de filamentos. Dos haces suaves que caen desde
     arriba y se mecen muy despacio; aportan la profundidad de "luz de superficie"
     del fondo. Solo CSS (transform/opacity), sin coste de dibujo por frame. ---

</details>

<details>
<summary><code>css/take-refresh.css</code></summary>

```text
============================================================================
take-refresh.css — Renovación visual 2026 (capa aditiva)
No modifica reglas base: solo añade y refina. Cargar SIEMPRE después de
db114cc300aecac3.css y de los css/ extras. Si algo de aquí choca con el
diseño original, basta con quitar este archivo.
============================================================================
```

- `--take-ink: #04070b;`: negro azulado profundo
- `--take-panel: #0a1218;`: base de paneles
- `--take-line: rgba(141, 207, 215, .16);`: bordes cian hielo
- `--take-ice: #8dcfd7;`: acento existente del sitio
- `body::after {`: ----------------------------------------------------------------------------
     1. GRANO FÍLMICO sobre el fondo (por encima del canvas z:0, bajo el
        contenido z:2; no toca los paneles). SVG de ruido estático, casi gratis.
     ----------------------------------------------------------------------------
- `.take-splash {`: ----------------------------------------------------------------------------
     2. SPLASH: la pantalla de entrada gana una penumbra radial en vez de negro
        plano, y el logo respira con un halo cian muy suave.
     ----------------------------------------------------------------------------
- `.hero-counter-badge { color: rgba(243, 244, 245, .72); }`: contador inferior derecha: separación más aireada y jerarquía
- `.hero-menu-rule {`: ----------------------------------------------------------------------------
     4. MENÚ PRINCIPAL: reglas con degradado, items con lavado de luz al hover,
        etiqueta que se desliza y barra activa con halo (antes verde plana).
     ----------------------------------------------------------------------------
- `.hero-menu-bar {`: la barra del item activo venía en verde inline desde el bundle: la pasamos
     al cian del sitio con un halo suave a lo largo de toda la fila
- `.home-screen--panel:before {`: ----------------------------------------------------------------------------
     5. PANELES (about me / guestbook / settings / music): contenedor de cristal
        oscuro. Antes el texto flotaba crudo sobre el fondo; ahora el panel tiene
        cuerpo, borde fino cian, sombra ambiental y desenfoque de fondo.
     ----------------------------------------------------------------------------
- `.hero-content-panel::before {`: filo de luz superior del panel
- `.hero-panel-header {`: cabecera del panel: línea divisoria con degradado en vez de trazo plano
- `.panel-tabs button {`: pestañas (about me / music): subrayado que crece desde el centro
- `.bio-prose { color: rgba(194, 203, 209, .82); }`: prosa del about: un pelín más de aire y mejor contraste sobre el cristal
- `.bio-socials a {`: enlaces sociales: brillo del color de marca al hover
- `.bio-status .status-dot { box-shadow: 0 0 8px currentColor; }`: estado de discord: el punto online/idle/dnd respira
- `.guestbook-entry {`: entrada del guestbook y tarjetas de música: tarjeta fina con hover
- `.guestbook-footer { border-top-color: rgba(141, 207, 215, .12); }`: pie del guestbook y paginación: separación más limpia
- `.panel-action {`: botones de acción del panel (Save name, Reset, sign, send...)
- `.settings-panel input,`: campos de texto (nickname, guestbook, chat del cursor): fondo hundido y
     foco con halo cian
- `.settings-background button {`: ajustes: tarjeta de fondo (Underwater / Skyline) con hover luminoso
- `.settings-actions { gap: 10px; }`: Settings: Reset y Save name son botones de texto sin clase (bundle); los
     pasamos al mismo lenguaje: Reset fantasma, Save name como acción cian
- `.guestbook-scroll::-webkit-scrollbar,`: scrollbars interiores de los paneles: finas, oscuras, con hover cian
- `.cursor-interactions-hint button {`: ----------------------------------------------------------------------------
     6. INTERACCIONES DE CURSOR (chat / react / burbujas): botones del pie con
        el mismo lenguaje del menú.
     ----------------------------------------------------------------------------
- `:focus-visible {`: foco visible coherente en todo el sitio
- `.np-pill {`: píldora de música (now playing): borde y halo acordes con la nueva atmósfera
- `@media (prefers-reduced-motion: reduce) {`: ----------------------------------------------------------------------------
     8. MOVIMIENTO REDUCIDO: todo lo nuevo se apaga sin romper nada
     ----------------------------------------------------------------------------

</details>

<details>
<summary><code>css/turbo-boost.css</code></summary>

```text
Turbo Boost (Skyline background) - palette: violet / magenta / cyan on dark
```

- `.turbo-fx{position:fixed;inset:0;z-index:1;pointer-events:none}`: above .home (z1, earlier in DOM), below the z-[2] page content
- `.turbo-btn::before{`: subtle idle shimmer: one soft pass along the border every ~6.5 s (not a constant pulse)
- `.turbo-btn[data-state="boost"]{`: engaged state (restored automatically when the boost ends)

</details>


### Servidor de cursores

<details>
<summary><code>cursors-server/server.js</code></summary>

- `const http = require("node:http");`: Servidor de cursores compartidos de Take (WebSocket).
  Vercel no soporta WebSocket, asi que esto corre aparte (Render, Fly, Railway, un VPS, tu hosting de bots...).
    npm install && npm start            (escucha en PORT, por defecto 8787, ruta /api/cursors)
  Variables de entorno:
    PORT             puerto (por defecto 8787)
    CURSOR_SECRET    el mismo valor que en Vercel (CURSOR_SECRET, o ADMIN_KEY si no pusiste CURSOR_SECRET).
                     Sirve para reconocerte como "take" (dueno). Sin el, todos son visitantes.
    ALLOWED_ORIGINS  dominios que pueden conectarse, separados por coma: "wwarcxs.vercel.app,midominio.com".
                     Si esta vacio acepta cualquiera (no recomendado en produccion).
    TRUST_PROXY=1    usar X-Forwarded-For para contar conexiones por IP (ponlo si estas detras de un proxy).
  Protocolo (lo que habla la web): el cliente manda profile / route / scene / move / click / idle / chat / reaction;
  el servidor responde identity / cursor / click / scene / leave / speech / error.
  El juego de burbujas y los "encuentros" no estan implementados: la web funciona igual sin ellos.
- `const clients = new Map();`: ws -&gt; estado
- `if (!c.owner && /^take$/i.test(nick)) nick = "";`: nadie mas puede llamarse como el dueno
- `default: break;`: "catch" y desconocidos: se ignoran

</details>


### JavaScript del sitio

<details>
<summary><code>js/admin-particles.js</code></summary>

```text
admin-particles.js - fondo de particulas que se conectan (red de constelacion) de la pagina /admin. Canvas 2D, sin dependencias.

- Las particulas flotan despacio; las que estan cerca se unen con lineas que se desvanecen con la distancia.
- El cursor / dedo atrae suavemente las particulas cercanas y se une a ellas con lineas.
- Una sola rueda de requestAnimationFrame; se pausa con la pestana oculta; prefers-reduced-motion = imagen fija.
- Si el equipo va justo, baja la cantidad de particulas una vez.

Uso:  const dispose = window.TakeAdminParticles.mount(canvas);   dispose() para quitarlo.
Ajustes rapidos: DENSITY, MAX_COUNT, LINK, SPEED y COLOR aqui abajo.
```

- `const DENSITY = 1 / 13000;`: particulas por pixel cuadrado (CSS)
- `const LINK = 0.16;`: distancia maxima de union, como fraccion del lado mayor de la pantalla (max. 170 px)
- `const SPEED = 14;`: velocidad media en px/s
- `const POINTER_RADIUS = 150;`: alcance del cursor en px
- `const COLOR = '176, 208, 255';`: r, g, b de las lineas y las particulas
- `function glowSprite() {`: halo suave precalculado: dibujarlo es mucho mas barato que shadowBlur
- `const z = 0.35 + Math.random() * 0.65;`: profundidad: lo lejano es mas chico, tenue y lento
- `if (oldW > 1) for (const p of S.parts) { p.x *= S.W / oldW; p.y *= S.H / oldH; }`: conserva la distribucion al girar el telefono
- `p.a += (Math.random() - 0.5) * 0.9 * dt;`: la direccion cambia muy poco a poco
- `for (let i = 0; i < n; i++) {`: lineas entre particulas cercanas
- `if (S.hasPointer) {`: lineas hacia el cursor
- `for (const p of P) {`: particulas con halo
- `if (S.slow > 2 && !S.shrunk) { S.shrunk = true; seed(targetCount()); S.parts.len`: equipo justo: menos particulas

</details>

<details>
<summary><code>js/admin.js</code></summary>

```text
admin.js - login de admin: comprueba la clave en /api/admin/verify y la guarda en sessionStorage (solo esta pestana).
La web la usa luego para responder en el libro de visitas y para ser "take" en los cursores.
```


</details>

<details>
<summary><code>js/canary.js</code></summary>

```text
canary.js - trampa de "sitio copiado".
Si esta pagina se carga desde un dominio que NO es el tuyo (alguien clono el sitio o lo sirve por un proxy),
manda una senal a TU Vercel (/api/canary?trap=clone) y te llega el aviso. No hace nada visible ni toca la pagina.
Dominios propios: localhost, redes locales (para probar desde el celular), whoistake.vercel.app (y el anterior wwarcxs.vercel.app), whoistake.com y sus previews.
Si algun dia usas un dominio propio, agregalo antes de este script:  <script>window.TAKE_ALLOWED_HOSTS=["midominio.com"]</script>
```

- `var CANON = atob('aHR0cHM6Ly93aG9pc3Rha2UudmVyY2VsLmFwcA==');`: dominio canonico en base64 (para que no salga con un buscar/reemplazar del dominio en una copia)
- `if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(\.\d+)?$/.test(host)) `: LAN
- `if (host === canon || host === 'whoistake.com' || host === 'www.whoistake.com' |`: dominio actual, propio y el anterior
- `var slugs = [canon.split('.')[0], 'wwarcxs'];`: previews de Vercel: &lt;proyecto&gt;-git-main-&lt;equipo&gt;.vercel.app
- `try { if (store.getItem('tk-c')) return false; store.setItem('tk-c', '1'); } cat`: una senal por sesion

</details>

<details>
<summary><code>js/config.js</code></summary>

```text
Configuracion publica del sitio. Se carga antes que el resto de scripts.
```

- `window.TAKE_CURSORS_URL = "";`: Servidor de cursores compartidos (carpeta cursors-server/). Vacio = cursores compartidos desactivados.
  Ejemplo: "wss://take-cursors.onrender.com/api/cursors"  (con https tiene que ser wss://)
- `window.TAKE_ALLOWED_HOSTS = [];`: Dominios propios extra para js/canary.js. Si usas un dominio nuevo, agregalo aqui o la trampa
  lo tomara por una copia del sitio. Ejemplo: ["take.com", "www.take.com"]

</details>

<details>
<summary><code>js/menu-bg.js</code></summary>

```text
menu-bg.js - fondo del menu principal: filamentos de luz + motas de luz (bokeh) sobre el fondo liquido.
Canvas 2D transparente, sin dependencias.

1. FILAMENTOS: hilos finos de luz cian que siguen un campo de flujo que cambia muy despacio, asi que ondulan y se
   deforman como las lineas del fondo liquido. Cada hilo lleva una chispa que lo recorre.
2. MOTAS: discos de luz suaves (algunos con anillo, como el bokeh de una foto) que suben lentamente con un vaiven;
   cerca = nitidas y pequenas, lejos = grandes y difusas. El cursor las aparta un poco y vuelven solas.
3. FONDO LIQUIDO: <video> en bucle (images/menu-bg.mp4 / .webm) detras del canvas, en la capa .menu-liquid.

Optimizado para que no se sienta pesado (sobre todo en celular):
 - Dibuja a 30 fps (el movimiento es lento; mas fps no se nota y cuesta el doble). Con un panel abierto, a 15.
 - Resolucion de dibujo adaptable: parte de 1x (celular) / 1.25x (PC) y baja sola si el equipo va justo;
   si aun asi va justo, baja a la mitad de hilos y motas.
 - Motas y chispas son sprites pre-dibujados (drawImage) en lugar de un degradado nuevo por frame.
 - Cada hilo es UN trazo con degradado a lo largo (no un trazo por tramo).
 - El video decodifica por hardware; se pausa con un panel abierto o la pestana oculta. Si el navegador bloquea el
   autoplay (ahorro de bateria), queda el poster estatico y arranca con el primer toque.
 - Una sola rueda de requestAnimationFrame; se pausa con la pestana oculta; prefers-reduced-motion = imagen fija.

Uso:  const dispose = window.TakeMenuBg.mount(canvas, { onReady });   dispose() para quitarlo.
Ajustes rapidos: FILAMENTS, MOTES, STEPS, COLOR, ALPHA y FPS aqui abajo.
```

- `const FILAMENTS = { desktop: 12, mobile: 7 };`: hilos de luz
- `const STEPS = { desktop: 28, mobile: 22 };`: largo de cada hilo (pasos hacia delante y hacia atras)
- `const MOTES = { desktop: 30, mobile: 16 };`: motas de luz
- `const COLOR = { thread: '126,222,238', mote: '214,240,255' };`: r,g,b: cian hielo de los hilos / blanco azulado de las motas
- `const ALPHA = { thread: 0.42, mote: 0.5 };`: intensidades maximas
- `const FPS = { normal: 30, panel: 15 };`: fps de dibujo (menu abierto / con un panel encima)
- `const SCALE = { desktop: 1.25, mobile: 1, min: 0.6 };`: resolucion de dibujo (x pixeles CSS); baja sola si va justo
- `function flow(x, y, t) {`: Campo de flujo: direccion (en radianes) en el punto x,y (unidades de pantalla) y el instante t. Cambia muy despacio.
- `function sprite(size, paint) {`: Sprite en un canvas pequeno: se dibuja una vez y luego solo se estampa con drawImage.
- `function makeAtmo(parent, before) {`: Capa de rayos de luz (.menu-atmo): va delante del video y detras del canvas.
   Son dos haces CSS (take-extras.css) que se mecen despacio y se funden solos
   con la animacion take-atmo-in; aqui solo se crea el contenedor y se quita
   al dispose.
- `function makeLiquid(parent, before) {`: Capa de fondo liquido: &lt;video&gt; en bucle (hardware) con poster estatico. Devuelve { el, setPlaying, dispose }.
- `v.lastChild.addEventListener('error', () => {`: ningun formato de video funciona: el webp animado de siempre
- `if (p && p.catch) p.catch(() => {`: autoplay bloqueado: queda el poster y se reintenta con el primer toque
- `dispose() { disposed = true; if (unlock) window.removeEventListener('pointerdown`: ya no esta
- `const useLiquid = opts.liquid !== false && !rmq.matches && !!canvas.parentNode;`: El canvas es transparente porque detras va la capa liquida. Con "reducir movimiento" no se pone y el canvas pinta su
  fondo negro de siempre.
- `S.scale = S.degraded ? Math.min(S.scale, S.scaleMax) : S.scaleMax;`: si ya tuvo que bajar la resolucion, no la vuelve a subir
- `S.px = lerp(S.px, S.mx, 1 - Math.exp(-3 * dt)); S.py = lerp(S.py, S.my, 1 - Math`: el cursor se suaviza; sin cursor (movil) solo queda el movimiento propio
- `m.ny -= m.v * dt;`: suben despacio
- `if (S.active) {`: el cursor las aparta un poco y vuelven (resorte)
- `const { W, H, U } = S, depth = 1 - f.z * 0.55;`: cerca = 1, lejos = .45
- `const h = U * 0.0105 * (0.8 + f.z * 0.45) * (28 / NS);`: largo de cada paso (el hilo mide lo mismo con menos pasos)
- `pts[NS * 2] = x0; pts[NS * 2 + 1] = y0;`: la semilla va en el centro; se traza hacia atras y hacia delante
- `const g = ctx.createLinearGradient(ax, ay, Math.abs(bx - ax) + Math.abs(by - ay)`: UN degradado a lo largo del hilo (de punta a punta): nace y muere suave sin dibujarlo tramo a tramo
- `if (glow) { ctx.lineWidth = 10; ctx.globalAlpha = 0.055 * k; ctx.stroke(); ctx.l`: dos pasadas de halo (ancha + media) y el trazo fino: el hilo "bloombea"
  como los filamentos de las referencias submarinas, a coste de 2 strokes
- `const bi = Math.floor(((f.bead + t * f.bs) % 1) * (n - 1)), e = Math.pow(Math.si`: chispa que recorre el hilo
- `ctx.globalAlpha = ALPHA.mote * tw * (0.35 + 0.65 * depth) * (r > 12 ? 0.5 : 1);`: las lejanas son mas grandes y mas tenues (difusas); las cercanas, pequenas y nitidas
- `if (S.last && ts - S.last < interval - 2) { S.raf = requestAnimationFrame(frame)`: tope de fps
- `if (S.cost > 9 || S.gap > interval * 1.4) {`: si va justo (el dibujo cuesta mucho o no llega a 30 fps): primero baja la resolucion y, si sigue igual, usa la mitad de hilos y motas
- `const checkPanel = () => {`: con un panel abierto (about me, guestbook, settings) el menu no se ve: el fondo liquido se pausa y el canvas baja a 15 fps.
  Se marca &lt;html class="panel-open"&gt; (el CSS lo usa en vez de :has(), que cuesta en cada cambio del DOM).
- `if (liquid) setTimeout(() => { if (S.panel === open && !S.dead) liquid.setPlayin`: tras el fundido
- `canvas.__takeMenuBg = S;`: ayudas para pruebas / depuracion

</details>

<details>
<summary><code>js/music-pill.js</code></summary>

```text
Pildora de musica (menu principal, arriba al centro).

 - Muestra lo que suena en tu Discord/Spotify (nombre arriba y artista debajo) o, si no hay nada, la ultima de Last.fm (atenuada).
 - La cancion SUENA SOLA: con el primer click/toque/tecla en la pagina se busca el video en YouTube
   (/api/yt-search, YouTube Data API v3) y se reproduce con el IFrame Player en el mismo segundo que en Discord.
   Sin confirmacion y sin boton de "escuchar": el navegador solo exige ese primer gesto.
 - Se mantiene sincronizada cada segundo y cambia sola de cancion cuando cambia en Discord.
 - Click en la portada = silenciar / activar. Click en el texto = letra sincronizada (lrclib.net), una linea con rebote.
 - Mientras suena la cancion de Discord se pausa la musica ambiente del sitio (window.TakeAmbient) y vuelve cuando no hay nada.

Es un singleton: vive en <body>, no depende de React, y no se desmonta al cambiar de panel, asi no se corta la musica.
Depende de window.TakePresence (js/presence.js). En el menu se oculta cuando hay un panel abierto (ver css/music-pill.css).
API: window.TakeMusic = { wantsAudio(), isPlaying() }
```

- `var LEAD_MS = 300;`: el audio tarda un poco en arrancar: lo adelantamos
- `var DRIFT_MS = 1200;`: desfase maximo antes de corregir con seekTo
- `function writeMuted(v) { try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } `: modo privado
- `function parseLrc(lrc) {`: "[01:23.45] texto" -&gt; [{ t: ms, text }] ordenado. Ignora etiquetas como [ar:...].
- `list = list.slice().sort(function (a, b) {`: preferimos letra sincronizada y la duracion mas cercana
- `p.then(function (v) { if (!v) delete lyricsCache[key]; });`: no recordar fallos: se puede reintentar
- `live: null,`: { song, artist, album, art, start, end, duration } desde Discord/Spotify
- `last: null,`: ultima cancion de Last.fm
- `armed: false,`: ya hubo un primer gesto del usuario (el navegador ya permite el audio)
- `lyrics: null,`: { synced, plain } \| "loading" \| "none"
- `var ambient = { skipped: false, paused: false };`: skipped: no arranco por la cancion; paused: la pausamos nosotros
- `text.append(tTitle, tArtist);`: nombre arriba, artista debajo
- `new MutationObserver(function () {`: El snapshot de index.html no coincide con lo que pinta React y este vuelve a pintar el &lt;body&gt; entero al
  hidratar (error #418), llevandose lo que no es suyo. Si pasa, se vuelve a colocar; el iframe de YouTube
  se reinicia porque al sacarlo del documento el reproductor muere.
- `} catch (e) {`: sin ambiente: da igual
- `function failOpen() {`: no hay audio de YouTube para esta cancion: que vuelva la musica ambiente
- `if (trackKey() !== key) { resolveVideo(); return; }`: cambio de cancion mientras buscaba
- `if (yt.player) return;`: todavia creandose
- `if (yt.calibrated !== trackKey()) {`: la primera vez que suena cada cancion: ajuste fino (el video tardo en cargar)
- `setInterval(function () {`: Cada segundo: mantiene el audio en el mismo segundo que Discord.
- `function arm() {`: Primer gesto del usuario: desde aqui el navegador deja sonar.
- `wantsAudio: function () {`: true si hay una cancion de Discord que va a sonar aqui: la musica ambiente no debe arrancar.

</details>

<details>
<summary><code>js/particles-bg.js</code></summary>

```text
particles-bg.js - fondo de particulas conectadas para las paginas sin menu (Photos).
Puntos blancos con glow, lineas finas que se unen por cercania y algunos "atomos" con su orbita (el estilo que tenia
el menu principal antes de js/menu-bg.js), pero muy sutil (pocas particulas, lineas tenues) para que no sature y
el contenido siga siendo lo importante.

Canvas 2D transparente (deja ver el color de fondo de la pagina), sin dependencias.
El cursor mueve las particulas un poco (parallax); se pausa con la pestana oculta; con "reducir movimiento"
queda una imagen fija.

Uso: <canvas data-take-particles></canvas> + este script  (se monta solo), o window.TakeParticles.mount(canvas).
Ajustes rapidos: COUNT, LINK, ALPHA aqui abajo.
```

- `const COUNT = { desktop: 46, mobile: 26 };`: particulas (el menu usa 64 / 34)
- `const LINK = 0.15;`: distancia maxima de union, como fraccion del lado mayor de la pantalla
- `const ALPHA = { line: 0.2, dot: 0.55, glow: 0.06 };`: intensidades maximas (el menu va bastante mas fuerte)
- `const SPEED = 0.02;`: velocidad de deriva
- `const parts = Array.from({ length: N }, (_, i) => ({`: x,y en 0..1 de la pantalla; z = profundidad (0 cerca, 1 lejos): cambia tamano, brillo y parallax
- `const g = ctx.createRadialGradient(W * 0.55, H * 0.4, 0, W * 0.55, H * 0.4, Math`: el mismo velo de luz tenue del menu, mucho mas suave
- `const p = parts[i], depth = 1 - p.z * 0.65;`: cerca = 1, lejos = .35
- `if (p.nuc) {`: orbita fina con un electron
- `S.ema = lerp(S.ema, dt * 1000, 0.05);`: si va justo, baja a la mitad de particulas
- `canvas.__takeParticles = S;`: ayuda para pruebas

</details>

<details>
<summary><code>js/photos-page.js</code></summary>

```text
Photos (pages/photos.html es una pagina estatica): lo que antes hacia la app de Next.

1. Aviso "Hardware acceleration is disabled": solo sale si el equipo renderiza por software (o pide menos movimiento),
   igual que en el resto del sitio. Se puede cerrar con la X y, si no, se quita solo a los 8 s bajando.
2. Portfolio (arcxsdev.com): el mismo barrido diagonal + logo que usa el menu al abrir Photos, y despues se abre la pagina.
```

- `window.addEventListener("pageshow", function (ev) {`: volver con "atras": quita el barrido

</details>

<details>
<summary><code>js/presence.js</code></summary>

```text
Presencia de Discord compartida (about me, reproductor "now playing").

Se carga en el <head>, antes que la app, para que:
 - la consulta a /api/activity empiece al abrir la pagina (no cuando abres "about me");
 - la foto de perfil ya este descargada (y recordada en localStorage de la visita anterior) cuando se abre about me;
 - todos los componentes lean el mismo dato y no hagan peticiones duplicadas.

API: window.TakePresence = { get, subscribe, avatar, now, refresh }
  get()          ultima respuesta de /api/activity (o null si aun no llega)
  subscribe(fn)  fn(data) en cada actualizacion; devuelve la funcion para cancelar
  avatar()       avatar en vivo o, mientras llega, el recordado de la visita anterior
  now()          hora estimada del servidor en ms (para calcular el segundo exacto de la cancion)
```

- `var skew = 0;`: hora del servidor - hora del navegador (ms)
- `try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) {`: modo privado: da igual
- `function preload(url) {`: Descarga la imagen ya (y la deja en la cache del navegador) para que aparezca al instante.
- `} catch (e) {`: sin head todavia
- `try { subs[i](data); } catch (e) {`: un suscriptor roto no frena a los demas
- `var age = Number(res.headers.get("age")) || 0;`: segundos que lleva la respuesta en la CDN
- `.catch(function () {`: se reintenta en el siguiente ciclo
- `if (!document.hidden) poll();`: al volver a la pestana: dato fresco y reloj resincronizado
- `preload(cache.avatar);`: La foto recordada se descarga ya, antes incluso de que responda la API.

</details>

<details>
<summary><code>js/turbo-boost.js</code></summary>

```text
Turbo Boost + cursor-reactive "3D" for the Skyline background (spec section 8).

- Works only while the "Skyline" background is active (html[data-scene="neutral"]) and no side panel is open.
- The car never moves on the page: the cursor only drives a restrained perspective/parallax on the media
  element itself (never on a parent container), plus a soft specular light that slides over the bodywork.
- ONE requestAnimationFrame loop (delta-time based) drives cursor spring, boost timeline, particles and canvas.
  The loop sleeps when everything is at rest, and while the tab is hidden.
- prefers-reduced-motion: tiny parallax, no shake / streaks / chromatic aberration, fewer particles.

Remove the feature: delete the two <script>/<link> tags that mention turbo-boost in index.html.
```

- `const CAR = {`: ---- Car landmarks, normalised to the video frame (x, y in 0..1) ---------------------------------------------
- `heads: [[0.579, 0.571, 1.0], [0.718, 0.574, 0.55]],`: x, y, weight
- `rear: [0.262, 0.60],`: where the particles leave the car
- `under: { x0: 0.30, x1: 0.725, y: 0.682 },`: underglow line
- `const BOOST_MS = 1000;`: total length (spec: 700-1200 ms)
- `const CURSOR_IDLE_MS = 1400;`: after this the pose eases back to neutral
- `function ensureDom() {`: React may rebuild &lt;body&gt; children; make sure our nodes stay attached.
- `} catch (_) {`: keep defaults
- `if (S.W <= 700) {`: phones: bottom centre
- `} else {`: desktop: just under the car, centred on it
- `function poll() {`: ---- Scene polling (cheap, robust against React re-renders) ---------------------------------------------------
- `const BASE = 'scale(1.07)';`: slight over-scale so the perspective/parallax never reveals the edges
- `S.ty = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1) * 0.5;`: vertical response is smaller
- `if (isEditable(t) || isInteractive(t)) return;`: never steal Space from typing or focused controls
- `const low = S.perfLow ? S.ema > 22 : S.ema > 34;`: hysteresis: avoids flip-flopping
- `let tx = S.tx, ty = S.ty;`: 1) cursor / pose target
- `if (coarse) {`: touch: slow autonomous sway, no pointer needed
- `} else if (now - S.lastMove > CURSOR_IDLE_MS) {`: ease back to neutral
- `const K = 52, C = 13.5;`: 2) spring (critically-damped-ish, sub-stepped, frame-rate independent)
- `let I = 0, punch = 0, susp = 0, shakeX = 0, shakeY = 0, tb = 0;`: 3) boost timeline
- `punch = Math.exp(-ts * 5.2) * (1 - Math.exp(-ts * 42));`: camera impulse
- `susp = 7 * Math.exp(-ts * 7) * Math.sin(ts * 22);`: compress -&gt; rebound -&gt; settle
- `const burst = reduced ? 26 : S.perfLow ? 55 : 95;`: emitters
- `const m = S.media, k = S.map.k;`: 4) apply to the media element only (never to a parent container)
- `draw(dt, I, tb, reduced);`: 5) canvas (specular light, headlights, neon, sweep, streaks, particles)
- `const moving = Math.abs(S.x - tx) > 0.0007 || Math.abs(S.vx) > 0.0007 || Math.ab`: keep running only while something is moving
- `function settle() {`: fully at rest: clean canvas, neutral transform
- `{`: a) cursor-driven specular light gliding over the bodywork
- `{`: b) neon underglow (faint at rest, intensifies on boost)
- `if (I > 0.003) {`: c) headlights
- `if (tb < 0.14 && !reduced) {`: brief screen flash at the very start
- `if (S.boosting && tb > 0.04 && tb < 0.82) {`: d) reflection sweep across the bodywork (soft elliptical mask)
- `ctx.transform(1, 0, -0.35, 1, ch * 0.2, 0);`: slanted band
- `for (const s of ST) {`: e) motion streaks
- `for (const p of P) {`: f) pixel particles shooting backwards from the car
- `const q = 2;`: snap to a 2 px grid -&gt; crisp "pixel" look

</details>


### Páginas estáticas

<details>
<summary><code>pages/photos.html</code></summary>

- `<!DOCTYPE html> <html lang=en class=scroll-smooth data-np-pos=corner>`: Page saved with SingleFile
   url: /photos
   saved date: Sat Oct 17 2026 19:21:53 GMT-0600 (Central Standard Time)

</details>

<details>
<summary><code>pages/settings.html</code></summary>

- `<!DOCTYPE html> <html lang=en class=scroll-smooth style data-scene=neutral>`: Page saved with SingleFile
   url: https://tu-dominio.com
   saved date: Sat Oct 17 2026 19:21:00 GMT-0600 (Central Standard Time)

</details>


### Pruebas

<details>
<summary><code>tests/about.test.js</code></summary>

- `const test = require("node:test");`: node --test tests/about.test.js
- `assert.equal(yt.pickBest([{ videoId: "x", title: "Otra cosa", channel: "Nadie", `: ninguno parece la cancion =&gt; null (mejor silencio que otra cancion)
- `let err;`: limite diario
- `assert.equal(P.avatar(), "https://cdn/old.png");`: antes de que responda la API ya conocemos el avatar y ya se esta descargando
- `assert.equal(P.now(), nowMs + 102_000);`: reloj: servidor(5_100_000) + Age(2 s) - navegador(5_000_000) = 102 s de diferencia
- `assert.ok(!page.includes(old) || old === "Akryst"`: nombre de funcion AkrAge no lo contiene
- `assert.ok(page.includes('label: "Portfolio", view: null, href: "https://arcxsdev`: Portfolio usa la misma transicion que Photos (navigateTo), ya no la intro propia
- `for (const gone of ["bio-friends", "panel-webring", "88x31", "bhop.codes", "Take`: friends & cool places (88x31) y la tarjeta de musica del about ya no estan

</details>

<details>
<summary><code>tests/backend.test.js</code></summary>

- `const test = require("node:test");`: node --test tests/

</details>

<details>
<summary><code>tests/bot.test.js</code></summary>

- `const test = require("node:test");`: node --test tests/
- `assert.ok(p.discord_user.avatar);`: el avatar se conserva aunque este offline
- `assert.equal(typeof out.body.now, "number");`: hora del servidor para sincronizar el segundo de la cancion
- `assert.equal(out.body.last_active, null);`: online: no hay "last active"

</details>

<details>
<summary><code>tests/canary.test.js</code></summary>

- `const test = require("node:test");`: node --test tests/canary.test.js
- `assert.equal(check({ hostname: "evil.com", pathname: "/x" }, doc, nav, st), fals`: ya avisado en esta sesion
- `assert.equal(scan.status, 404); assert.equal(f.calls.length, 1);`: no se envio otro aviso
- `assert.equal(l.lines.length, 2);`: pero si quedo en los logs
- `assert.equal((await call({ trap: "loquesea" }, {}, {})).status, 404);`: trap desconocido = scan
- `await call({ trap: "bait" }, { "x-forwarded-for": "5.5.5.5" }, env, t0 + 11 * 60`: pasados 10 min vuelve a avisar
- `assert.equal(f.calls.length, 20);`: tope: 20 por hora

</details>

<details>
<summary><code>tests/cursors.test.js</code></summary>

- `const test = require("node:test");`: node --test tests/   (necesita `npm install` dentro de cursors-server/ para tener "ws")
- `assert.equal(await quiet(a, (m) => m.type === "cursor" && (m.x > 1 || m.y < 0)),`: fuera de rango: ignorado
- `assert.match((await next(a, type("identity"))).label, /^guest-/);`: nadie mas puede llamarse "take"
- `assert.equal((await next(a, type("identity"))).owner, false);`: token falso
- `assert.equal(await quiet(c, type("cursor")), true);`: otra ruta: no lo ve
- `assert.equal(await quiet(a, type("speech")), true);`: reaccion no permitida
- `await assert.rejects(s1.connect({}), /403/);`: sin Origin tampoco

</details>

<details>
<summary><code>tests/lastfm.test.js</code></summary>

- `const test = require("node:test");`: node --test tests/
- `assert.equal(toTracks({ recenttracks: { track: recent.recenttracks.track[0] } },`: limit=1 =&gt; objeto

</details>


### Código propio dentro de _next

<details>
<summary><code>_next/static/chunks/1264-0f2c24e6ca5570ba.js</code></summary>

- `function v(e) { let { onReady: t } = e, n = (0, a.useRef)(null), i = (0, a.useRe`: Fondo del menu: filamentos de luz + motas bokeh sobre el fondo liquido. El motor esta en /js/menu-bg.js
             (antes: cubos 3D con particulas conectadas, y antes escena three.js con avatar VRM).

</details>

<details>
<summary><code>_next/static/chunks/app/(site)/page-2c8153006850d793.js</code></summary>

- `function staticSplashShown() { return document.documentElement.classList.contain`: La pantalla negra con la T tambien viene en el HTML (index.html, .take-splash) y se ve desde el primer pintado.
  Mientras esa pantalla estatica esta puesta, esta version arranca ya visible (sin fundido) y la relevo sin que se note.
- `let k = [{ label: "github", icon: "simple-icons:github", url: "https://github.co`: ruleta de edad: numeros 1-99 al azar, uno nuevo cada ~70 ms (AGE_ROULETTE_MS)
- `function TakeUsePresence() { let [e, t] = (0, s.useState)(() => window.TakePrese`: presencia compartida (js/presence.js): la consulta empieza al abrir la pagina, no al abrir about me
- `function isFirstPaint() { return !window.__takeReady; }`: El HTML ya trae el menu en su estado final: en la primera carga no se oculta ni se repite la entrada.
  Al abrir y cerrar paneles las animaciones funcionan igual que siempre.

</details>


### Servidor local

<details>
<summary><code>serve.py</code></summary>

```text
Servidor local del sitio Take.

Sirve esta carpeta como raiz (http://localhost:8000) y emula lo minimo que
antes hacia Next.js:
/_next/image?url=/algo.webp  -> devuelve el archivo local equivalente
/bg-fallback.webp            -> images/bg-fallback.jpeg (el fondo de flores)
/photos                      -> pages/photos.html
/admin                       -> pages/admin.html
Las funciones de /api/* NO corren aqui (usa `vercel dev` para probarlas).
No modifica ningun archivo del sitio.
```


</details>
