# perfil

Página de perfil con presencia de Discord (tu bot), juegos con ficha de IGDB (Twitch) y stats.fm. Diseño inspirado en plxne.com.

## Estructura

- `index.html`: la página completa.
- `assets/porsche-logo.js`: logo de la intro.
- `api/last-played.js`: último juego de Roblox según el bot.
- `404.html`: página de error con el auto ASCII (Vercel la sirve sola en rutas que no existen).
- `manifest.webmanifest`, `sw.js`, `assets/icon-*.png`, `assets/favicon-*.png`, `assets/apple-touch-icon.png`: la página se puede instalar como app y abre sin conexión.
- `assets/cover-take.jpg`: imagen de vista previa al compartir el enlace (1200x630).
- `api/presence.js`, `api/activity.js`, `api/game-info.js`: funciones de Vercel que hablan con tu bot, Discord, IGDB, Steam y Roblox.
- `lib/`: lógica compartida de las funciones.
- `scripts/dev.mjs`: servidor local (`npm run dev`).

## Variables en Vercel

| Variable | Valor |
| --- | --- |
| `ACTIVITY_BOT_URL` | `http://fi10.bot-hosting.cloud:25169/api/activity` |
| `ACTIVITY_BOT_TOKEN` | el mismo valor que `API_TOKEN` del `.env` del bot |
| `DISCORD_USER_ID` | `893966003690668102` |
| `IGDB_CLIENT_ID` | Client ID de tu app en dev.twitch.tv |
| `IGDB_CLIENT_SECRET` | Client Secret de esa app |

Sin las credenciales de IGDB las fichas de juego usan Steam, Roblox y la descripción de Discord.

## Bot

En el `.env` del bot cambia `PORT=26022` por `PORT=25169`, o borra esa línea para que use `SERVER_PORT` del hosting. `SITE_ORIGIN` y el resto se quedan igual. Reinicia el bot después.

## Dominio

El dominio no cambia: en Vercel sigue apuntando al mismo proyecto. Si redespliegas sobre el proyecto actual no hay que tocar nada del DNS.

## Atajos

`?` ayuda, `M` sonido, `P` reproductor, `/` buscar canción, `N` / `B` siguiente y anterior de la playlist, `T` tema (incluye `season`, que cambia según la época del año, y `auto`, que toma el color de la portada), `Y` letras (también con el icono de micrófono de la tarjeta de actividad), `C` compartir como imagen, `S` stats.fm, `G` arriba. Para ver la intro completa otra vez abre la página con `?intro` al final.

## Carta para Matheo

El botón del sobre (junto a sonido, tema y compartir) abre una carta. El texto y el GIF se editan en `profile.letter` de `index.html` (`to`, `lines`, `sign`, `gif`). Para el GIF, copia el archivo a `assets/` y pon `gif: "assets/nombre.gif"` (también acepta una URL https).

## Música local

El bloque de actividad de arriba tiene dos estados. Si estás escuchando Spotify dice `current activity` / `listening on spotify`. Si no, se queda siempre como `page activity` / `local music` con la playlist de las más escuchadas, el buscador y el estado de lo que suena en la página. Si alguien reproduce algo ahí, esa canción tiene prioridad y usa los mismos efectos que Spotify en vivo (aura, barra, letras).

En el celular el audio solo se permite después de un toque, así que la página desbloquea un reproductor compartido en el primer toque. Si YouTube no arranca, cae solo al clip de 30 segundos.

## Status

El enlace `status` del pie (junto a `now` y `uses`) abre un panel con el estado de cada servicio y una barra de rapidez; su puntito de color avisa sin abrirlo. `/api/status` revisa en el servidor el bot de Discord, stats.fm, Roblox y las letras (y la key de YouTube si existe) y devuelve solo si responden y cuánto tardan. Se cachea 30 s. Por defecto usa tu usuario de stats.fm; se puede cambiar con la variable opcional `STATSFM_USER`.

## Trofeos

El botón de la copa abre 12 trofeos que se guardan en el navegador de cada visitante (localStorage), tres de ellos secretos. La lista está en `trophies` de `index.html`.

## /now y /uses

Son `now.html` y `uses.html`, con el estilo compartido en `assets/sub.css`. Se editan directamente en el HTML y `vercel.json` tiene `cleanUrls` para que se abran como `/now` y `/uses`. Para probarlas en local usa `now.html` y `uses.html` con el servidor sencillo.

## Efectos

El intro se deshace con el cursor o el dedo y se rearma. En escritorio hay un brillo que sigue al cursor y los botones del menú y las redes se acercan un poco al puntero. Todo se desactiva con "reducir movimiento" y en pantallas táctiles.
