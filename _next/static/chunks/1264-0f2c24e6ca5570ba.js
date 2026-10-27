"use strict";
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([[1264], { 1264: (e, t, n) => { n.d(t, { k: () => v }); var o = n(5155), a = n(2115);
        function v(e) { let { onReady: t } = e, n = (0, a.useRef)(null), i = (0, a.useRef)(t); return i.current = t, (0, a.useEffect)(() => { let e = n.current; if (!e)
            return; let r = () => { }, s = !1, l = () => { s || (r = window.TakeMenuBg.mount(e, { onReady: () => { var e; null == (e = i.current) || e.call(i); } })); }; if (window.TakeMenuBg)
            l();
        else {
            if (window.addEventListener("take-menubg-ready", l, { once: !0 }), !document.querySelector("script[data-take-menubg]")) {
                let e = document.createElement("script");
                e.src = "/js/menu-bg.js", e.async = !0, e.setAttribute("data-take-menubg", ""), document.head.appendChild(e);
            }
        } return () => { s = !0, window.removeEventListener("take-menubg-ready", l), r(); }; }, []), (0, o.jsx)("canvas", { ref: n, className: "fixed inset-0 w-full h-full block pointer-events-none", style: { zIndex: 0 } }); } } }]);
