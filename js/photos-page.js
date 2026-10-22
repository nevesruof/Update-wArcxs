/*
 * Photos (pages/photos.html es una pagina estatica): lo que antes hacia la app de Next.
 *
 *  1. Aviso "Hardware acceleration is disabled": solo sale si el equipo renderiza por software (o pide menos movimiento),
 *     igual que en el resto del sitio. Se puede cerrar con la X y, si no, se quita solo a los 8 s bajando.
 *  2. Portfolio (arcxsdev.com): el mismo barrido diagonal + logo que usa el menu al abrir Photos, y despues se abre la pagina.
 */
(function () {
  "use strict";

  // ---------- 1. aviso de hardware ----------
  var toast = document.getElementById("hw-toast");
  var AUTO_HIDE_MS = 8000;
  var LEAVE_MS = 500;

  function softwareRendering() {
    var reduced = false, software = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { }
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) {
        var ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) software = /swiftshader|llvmpipe|software|microsoft basic/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
        var lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
    } catch (e) { software = true; }
    return reduced || software;
  }

  if (toast) {
    var timer = 0;
    var hide = function () {
      clearTimeout(timer);
      if (toast.classList.contains("hw-toast--leaving")) return;
      toast.classList.add("hw-toast--leaving");
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, LEAVE_MS + 20);
    };
    if (softwareRendering()) {
      setTimeout(function () {
        toast.hidden = false;
        toast.classList.add("hw-toast");
        timer = setTimeout(hide, AUTO_HIDE_MS);
      }, 800);
    } else if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
    var close = toast.querySelector("[data-hw-close]");
    if (close) close.addEventListener("click", hide);
  }

  // ---------- 2. Portfolio con la transicion del menu ----------
  var busy = false;
  function wipeTo(url) {
    if (busy) return;
    busy = true;
    var panel = document.createElement("div");
    panel.setAttribute("aria-hidden", "true");
    panel.style.cssText = "position:fixed;z-index:9998;background:#19191e;top:-50%;left:-50%;width:200%;height:200%;transform:translateX(-100%) skewX(-15deg)";
    var logoWrap = document.createElement("div");
    logoWrap.setAttribute("aria-hidden", "true");
    logoWrap.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0";
    var logo = document.createElement("img");
    logo.src = "/images/logo.webp";
    logo.alt = "";
    logo.width = 128;
    logo.height = 128;
    logo.style.cssText = "width:128px;height:128px;border-radius:1rem";
    logoWrap.appendChild(logo);
    document.body.append(panel, logoWrap);
    if (panel.animate) {
      panel.animate([{ transform: "translateX(-100%) skewX(-15deg)" }, { transform: "translateX(0%) skewX(-15deg)" }],
        { duration: 550, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      logoWrap.animate([{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: 250, delay: 330, easing: "ease-in-out", fill: "both" });
    } else {
      panel.style.transform = "translateX(0%) skewX(-15deg)";
      logoWrap.style.opacity = "1";
    }
    setTimeout(function () { window.location.assign(url); }, 600);
    window.addEventListener("pageshow", function (ev) { // volver con "atras": quita el barrido
      if (!ev.persisted) return;
      busy = false;
      panel.remove();
      logoWrap.remove();
    }, { once: true });
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[data-wipe]") : null;
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    wipeTo(a.href);
  });
})();
