/*! take-presence.js - puente de la presencia de Discord (la consulta /api/activity la hace la app).
 *  - Consulta /api/activity desde que carga la pagina, publica el ultimo estado en window.TakePresence.last y lanza el
 *    evento "take-presence" (lo usan el panel about me y nowplaying.js).
 *  - Precarga la foto de perfil apenas se sabe su URL (y desde la segunda visita, de inmediato: se recuerda en
 *    localStorage), para que al abrir "about me" ya este cargada.
 */
(function () {
  'use strict';
  var KEY = 'take-avatar', keep = null, warmed = '';
  function warm(url) {
    if (!url || url === warmed || !/^https:\/\//.test(url)) return;
    warmed = url;
    try { keep = new Image(); keep.decoding = 'async'; keep.referrerPolicy = 'no-referrer'; keep.src = url; } catch (e) {}   // se guarda en window para que no se descarte
  }
  var TP = window.TakePresence = {
    last: null,
    warm: warm,
    publish: function (data) {
      if (!data) return;
      TP.last = data;
      var url = data.discord_user && data.discord_user.avatar;
      if (url) { warm(url); try { localStorage.setItem(KEY, url); } catch (e) {} }
      try { window.dispatchEvent(new CustomEvent('take-presence', { detail: data })); } catch (e) {}
    },
  };
  try { warm(localStorage.getItem(KEY)); } catch (e) {}      // visitas siguientes: carga la foto antes de que responda la API

  // Consulta global: empieza al cargar la pagina (no al abrir "about me"), cada 10 s (30 s con la pestana oculta).
  var timer = 0, busy = false;
  function once() {
    if (busy) return; busy = true;
    fetch('/api/activity', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('activity ' + r.status);
      var age = Number(r.headers.get('age')) || 0;                  // edad de la respuesta en cache: se suma al segundo exacto de la cancion
      return r.json().then(function (d) { if (d) { d.__age = age; d.__recv = Date.now(); } return d; });
    }).then(TP.publish).catch(function () {}).then(function () { busy = false; clearTimeout(timer); timer = setTimeout(once, document.hidden ? 30000 : 10000); });
  }
  TP.refresh = once;
  document.addEventListener('visibilitychange', function () { if (!document.hidden) once(); });
  once();
})();
