/*
 * Presencia de Discord compartida (about me, reproductor "now playing").
 *
 * Se carga en el <head>, antes que la app, para que:
 *  - la consulta a /api/activity empiece al abrir la pagina (no cuando abres "about me");
 *  - la foto de perfil ya este descargada (y recordada en localStorage de la visita anterior) cuando se abre about me;
 *  - todos los componentes lean el mismo dato y no hagan peticiones duplicadas.
 *
 * API: window.TakePresence = { get, subscribe, avatar, now, refresh }
 *   get()          ultima respuesta de /api/activity (o null si aun no llega)
 *   subscribe(fn)  fn(data) en cada actualizacion; devuelve la funcion para cancelar
 *   avatar()       avatar en vivo o, mientras llega, el recordado de la visita anterior
 *   now()          hora estimada del servidor en ms (para calcular el segundo exacto de la cancion)
 */
(function () {
  "use strict";
  if (window.TakePresence) return;

  var CACHE_KEY = "take:presence:v1";
  var POLL_MS = 10000;
  var POLL_HIDDEN_MS = 30000;

  var data = null;
  var skew = 0; // hora del servidor - hora del navegador (ms)
  var subs = [];
  var timer = null;
  var preloaded = {};

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) { /* modo privado: da igual */ }
  }

  var cache = readCache();

  /** Descarga la imagen ya (y la deja en la cache del navegador) para que aparezca al instante. */
  function preload(url) {
    if (!url || preloaded[url]) return;
    preloaded[url] = true;
    try {
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      document.head.appendChild(link);
    } catch (e) { /* sin head todavia */ }
    var img = new Image();
    img.decoding = "async";
    img.src = url;
  }

  function avatarOf(d) { return d && d.discord_user && d.discord_user.avatar || null; }

  function emit() {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](data); } catch (e) { /* un suscriptor roto no frena a los demas */ }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(poll, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
  }

  function poll() {
    clearTimeout(timer);
    return fetch("/api/activity", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("activity " + res.status);
        var age = Number(res.headers.get("age")) || 0; // segundos que lleva la respuesta en la CDN
        return res.json().then(function (json) { return { json: json, age: age }; });
      })
      .then(function (r) {
        data = r.json;
        if (typeof data.now === "number") skew = data.now + r.age * 1000 - Date.now();
        var avatar = avatarOf(data);
        if (avatar) {
          preload(avatar);
          cache = { avatar: avatar, name: data.discord_user.display_name || null, t: Date.now() };
          writeCache(cache);
        }
        emit();
      })
      .catch(function () { /* se reintenta en el siguiente ciclo */ })
      .then(schedule);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) poll(); // al volver a la pestana: dato fresco y reloj resincronizado
  });

  // La foto recordada se descarga ya, antes incluso de que responda la API.
  preload(cache.avatar);
  poll();

  window.TakePresence = {
    get: function () { return data; },
    subscribe: function (fn) {
      subs.push(fn);
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },
    avatar: function () { return avatarOf(data) || cache.avatar || null; },
    now: function () { return Date.now() + skew; },
    refresh: poll,
  };
})();
