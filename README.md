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
| `js/take-presence.js` | Consulta `/api/activity` desde que carga la página y la comparte (evento `take-presence`); precarga la foto de perfil |
| `js/nowplaying.js`, `css/nowplaying.css` | Tarjeta "now playing" con micrófono, letras sincronizadas con rebote y "escuchar a la par" (YouTube) |
| `js/take-icons.js` | Iconos SVG en línea del stack y de las redes (Simple Icons CC0 + Material Design Icons) |
| `pages/portfolio.html`, `images/previews/` | Entrada de la T y redirección a `arcxsdev.com` (`/portfolio`); iconos de las vistas previas |
| `css/turbo-boost.css`, `js/turbo-boost.js` | Cursor 3D y botón TURBO BOOST (solo en Skyline; inactivo mientras Skyline esté bloqueado) |
| `images/` | Logo y fondos (`bg-fallback`, `bg-skyline`) |
| `videos/skyline.mp4` | Fondo en video |
| `fonts/spanish.ttf` | Fuente del logo |
| `sfx/` | `tic`/`tac` del menú y `ambient.mp3` (música de fondo) |
| `api/` | Funciones de Vercel: `/api/activity`, `/api/lastfm` (+`/top-artist`), `/api/canary`, `/api/lyrics`, `/api/listen`, y el backend nuevo: `/api/guestbook`, `/api/counter`, `/api/settings`, `/api/admin/verify`, `/api/admin/cursor-token` (lógica en `api/_lib/backend.js`) |
| `cursors-server/` | Servidor WebSocket de los cursores compartidos (corre aparte de Vercel) |
| `js/config.js` | Configuración pública: URL del servidor de cursores y dominios propios para `canary.js` |
| `pages/admin.html` | Login de admin (se sirve en `/admin`) |
| `tests/` | Pruebas: `node --test tests/*.test.js` (Node 18+). Las de cursores necesitan `npm install` dentro de `cursors-server/`; si no, se saltan |
| `serve.py`, `iniciar.bat` | Servidor local |
| `vercel.json` | Rewrites de imágenes, `/photos`, `/portfolio`, `/admin` y los cebos de las trampas |
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

## About: contenido y orden
- **Texto:** "i've _edad_, i'm a mostly self-taught developer. sometimes i make stuff with **zed**…", "i've worked for **discord bots**… other projects on **github**" y "when i'm not studying…". Los tres enlaces tienen vista previa tipo icono: zed (`images/previews/zed.webp`, "code editor · dev"), discord bots → `arcxsdev.com` (favicon del sitio) y github → `github.com/iTake`.
- **Stack:** 34 logos en línea (`js/take-icons.js`); se iluminan al pasar el cursor y muestran su nombre. Para cambiar el orden o agregar uno, edita `TakeStack` / `TakeIcons` en ese archivo.
- **Redes:** solo GitHub (`iTake`), Spotify (`wArcxs`) y correo (`contact@whoistake.com`), en blanco como el resto de iconos.
- **Estado:** cuando está offline muestra "offline on discord • last active 3 hours ago" (sale del historial de estados del bot).
- **Foto de perfil:** la consulta de presencia ahora empieza al cargar la página (antes empezaba al abrir "about me"), la foto se precarga y se recuerda en `localStorage`.
- **Lema bajo el logo:** `dev · bots · music`. **Contador:** muestra 18,789 como base (`DEFAULT_VISITS_BASE` en `api/_lib/backend.js`; la variable `VISITS_BASE` de Vercel la reemplaza, `0` = solo visitas reales).
- **Settings:** bajo "Visible to visitors as…" aparece "• this doesn't work at the moment" mientras `TAKE_CURSORS_URL` esté vacío.
- **Portfolio:** `/portfolio` muestra la entrada de la T (como la pantalla de carga) y a los 2.6 s redirige a `https://arcxsdev.com/` (ajusta `DEST`/`DELAY_MS` en `pages/portfolio.html`).

## Now playing, letras y escuchar a la par
Tarjeta arriba en el menú: portada, canción, artista y el segundo exacto (`1:23 / 3:20`) de lo que escuchas en Spotify (sale de tu presencia de Discord); si no estás escuchando, muestra la última canción ("last played 2 hours ago"). El botón circular del micrófono abre las letras.
- **Segundo exacto:** `/api/activity` calcula en el servidor `positionMs = ahora - inicio` y la página suma la edad de la respuesta en caché y el tiempo transcurrido; no depende del reloj del visitante. Ajuste fino: `OFFSET_MS` al inicio de `js/nowplaying.js`.
- **Letras:** `/api/lyrics` consulta [LRCLIB](https://lrclib.net) (letras con tiempos; las letras son de sus autores y no se guardan en el repo). La línea activa rebota, cada palabra "salta" al cantarse y los instrumentales muestran tres puntos. Sin letra sincronizada muestra texto plano; sin letra, un aviso.
- **Escuchar a la par:** el botón "listen along" (dentro de las letras) busca la canción con la YouTube Data API (`/api/listen`), elige el video cuya duración coincide (±4 s; prefiere el canal "Topic", que es el audio del álbum) y la reproduce con el reproductor oficial en el mismo segundo, corrigiendo la deriva cada segundo. Pausa la música de fondo mientras tanto y la reanuda al detenerlo.
  - **Variable en Vercel:** `YOUTUBE_API_KEY` (Settings → Environment Variables; **nunca** la pegues en el código ni en un chat). Sin ella el botón avisa "listening along isn't set up yet".
  - **Cuota:** cada canción nueva cuesta ~101 de las 10,000 unidades diarias gratuitas; los resultados se guardan en caché (CDN + memoria).
  - **Condiciones de YouTube:** el reproductor se muestra visible y de 200×200 (mínimo exigido; no se oculta ni se separa el audio). Por eso aparece un recuadro con botón de cerrar mientras escuchas a la par.
  - **Límites:** en iPhone/Safari el navegador puede exigir un toque dentro del video para arrancar; si la canción de YouTube es otra versión (duración distinta) no se sincroniza.
  - Se probó con un YouTube simulado; no se pudo probar contra YouTube real desde el entorno de desarrollo.

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
3. **Archivos que no vienen en el zip:** `favicon.ico`, `opengraph-image.png`, `twitter-image.png`, `/88x31/take.gif` y tus fotos de `/photos/`.
4. **Mayúsculas:** el nombre quedó en minúscula (`take`) donde antes era `akryst`, y `Take` donde era `Akryst`. Si prefieres siempre `Take`, es un buscar y reemplazar.
