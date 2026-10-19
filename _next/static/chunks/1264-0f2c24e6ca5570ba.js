"use strict";
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([[1264], { 1264: (e, t, n) => { n.d(t, { k: () => v }); var o = n(5155), a = n(2115);
        /* Fondo "Underwater": cubos 3D blancos con glow + particulas conectadas. El motor esta en /js/cubes-bg.js
           (antes: escena three.js con rayos de luz y avatar VRM). */
        function v(e) { let { onReady: t } = e, n = (0, a.useRef)(null), i = (0, a.useRef)(t); return i.current = t, (0, a.useEffect)(() => { let e = n.current; if (!e)
            return; let r = () => { }, s = !1, l = () => { s || (r = window.TakeCubes.mount(e, { onReady: () => { var e; null == (e = i.current) || e.call(i); } })); }; if (window.TakeCubes)
            l();
        else {
            if (window.addEventListener("take-cubes-ready", l, { once: !0 }), !document.querySelector("script[data-take-cubes]")) {
                let e = document.createElement("script");
                e.src = "/js/cubes-bg.js", e.async = !0, e.setAttribute("data-take-cubes", ""), document.head.appendChild(e);
            }
        } return () => { s = !0, window.removeEventListener("take-cubes-ready", l), r(); }; }, []), (0, o.jsx)("canvas", { ref: n, className: "fixed inset-0 w-full h-full block pointer-events-none", style: { zIndex: 0 } }); } } }]);
