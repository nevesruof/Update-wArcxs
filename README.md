# perfil

Página de perfil con presencia de Discord (tu bot), juegos con ficha de IGDB (Twitch) y stats.fm. Diseño inspirado en plxne.com.

## Estructura

- `index.html`: la página completa.
- `assets/porsche-logo.js`: logo de la intro.
- `api/last-played.js`: último juego de Roblox según el bot.
- `404.html`: página de error con el auto ASCII (Vercel la sirve sola en rutas que no existen).
- `manifest.webmanifest`, `sw.js`, `assets/icon-*.png`, `assets/favicon-*.png`, `assets/apple-touch-icon.png`: la página se puede instalar como app y abre sin conexión.
- `assets/og.png`: imagen de vista previa al compartir el enlace (1200x630).
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

`?` ayuda, `M` sonido, `P` reproductor, `/` buscar canción, `N` / `B` siguiente y anterior de la playlist, `T` tema (incluye `auto`, que toma el color de la portada), `Y` letras, `C` compartir como imagen, `S` stats.fm, `F` vista en vivo (también al pulsar tu avatar), `G` arriba. Para ver la intro completa otra vez abre la página con `?intro` al final.
