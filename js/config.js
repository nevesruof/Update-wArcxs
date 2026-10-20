/* Configuracion publica del sitio. Se carga antes que el resto de scripts. */

// Servidor de cursores compartidos (carpeta cursors-server/). Vacio = cursores compartidos desactivados.
// Ejemplo: "wss://take-cursors.onrender.com/api/cursors"  (con https tiene que ser wss://)
window.TAKE_CURSORS_URL = "";

// Dominios propios extra para js/canary.js. Si usas un dominio nuevo, agregalo aqui o la trampa
// lo tomara por una copia del sitio. Ejemplo: ["take.com", "www.take.com"]
window.TAKE_ALLOWED_HOSTS = [];
