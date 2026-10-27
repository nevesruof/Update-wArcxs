(function () {
  "use strict";
  if (window.TakePresence) return;

  var CACHE_KEY = "take:presence:v1";
  var POLL_MS = 10000;
  var POLL_HIDDEN_MS = 30000;

  var data = null;
  var skew = 0;
  var subs = [];
  var timer = null;
  var preloaded = {};

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) { }
  }

  var cache = readCache();

  function preload(url) {
    if (!url || preloaded[url]) return;
    preloaded[url] = true;
    try {
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      document.head.appendChild(link);
    } catch (e) { }
    var img = new Image();
    img.decoding = "async";
    img.src = url;
  }

  function avatarOf(d) { return d && d.discord_user && d.discord_user.avatar || null; }

  function emit() {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](data); } catch (e) { }
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
        var age = Number(res.headers.get("age")) || 0;
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
      .catch(function () { })
      .then(schedule);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) poll();
  });

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
