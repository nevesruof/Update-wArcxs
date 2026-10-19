/*! canary.js - trampa de "sitio copiado". TKWM-40632a5f-41f0-9fe6-22f804d522ac
 *  Si esta pagina se carga desde un dominio que NO es el tuyo (alguien clono el sitio o lo sirve por un proxy),
 *  manda una senal a TU Vercel (/api/canary?trap=clone) y te llega el aviso. No hace nada visible ni toca la pagina.
 *  Dominios propios: localhost, redes locales (para probar desde el celular), wwarcxs.vercel.app y sus previews.
 *  Si algun dia usas un dominio propio, agregalo antes de este script:  <script>window.TAKE_ALLOWED_HOSTS=["midominio.com"]</script>
 */
(function () {
  'use strict';
  // dominio canonico en base64 (para que no salga con un buscar/reemplazar del dominio en una copia)
  var CANON = atob('aHR0cHM6Ly93d2FyY3hzLnZlcmNlbC5hcHA=');

  function isAllowedHost(host, extra) {
    host = String(host || '').toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host.slice(-10) === '.localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0') return true;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(\.\d+)?$/.test(host)) return true;   // LAN
    var canon = CANON.replace(/^https?:\/\//, '');
    if (host === canon) return true;
    var slug = canon.split('.')[0];                                    // previews de Vercel: wwarcxs-git-main-<equipo>.vercel.app
    if (new RegExp('^' + slug + '(-[a-z0-9]+)+-nevesruofs-projects\\.vercel\\.app$').test(host)) return true;
    return (extra || []).some(function (h) { return host === String(h).toLowerCase(); });
  }

  function check(loc, doc, nav, store, extra) {
    if (isAllowedHost(loc.hostname, extra)) return false;
    try { if (store.getItem('tk-c')) return false; store.setItem('tk-c', '1'); } catch (e) {}   // una senal por sesion
    var q = '/api/canary?trap=clone&host=' + encodeURIComponent(loc.hostname) + '&path=' + encodeURIComponent(loc.pathname) +
            '&ref=' + encodeURIComponent(doc.referrer || '') + '&t=' + Date.now();
    var url = CANON + q;
    try { if (nav.sendBeacon && nav.sendBeacon(url)) return true; } catch (e) {}
    try { new Image().src = url; } catch (e) {}
    return true;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { isAllowedHost: isAllowedHost, check: check, CANON: CANON }; return; }
  check(location, document, navigator, window.sessionStorage || { getItem: function () {}, setItem: function () {} }, window.TAKE_ALLOWED_HOSTS);
})();
