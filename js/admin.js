/* admin.js - login de admin: comprueba la clave en /api/admin/verify y la guarda en sessionStorage (solo esta pestana).
   La web la usa luego para responder en el libro de visitas y para ser "take" en los cursores.
   TKWM-40632a5f-41f0-9fe6-22f804d522ac */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const form = $('f'), key = $('k'), enter = $('b'), msg = $('m'), done = $('done'), out = $('out');
  const say = (text, cls) => { msg.textContent = text; msg.className = 'msg' + (cls ? ' ' + cls : ''); };
  const signedIn = () => { try { return !!sessionStorage.getItem('admin_key'); } catch (_) { return false; } };

  function render() {
    const on = signedIn();
    form.hidden = on; done.hidden = !on;
    say(on ? 'signed in on this tab' : '', on ? 'ok' : '');
  }

  key.addEventListener('input', () => { enter.disabled = !key.value; if (msg.classList.contains('err')) say(''); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!key.value) return;
    enter.disabled = true; say('checking...');
    try {
      const res = await fetch('/api/admin/verify', { method: 'POST', headers: { 'x-admin-key': key.value } });
      if (res.ok) {
        sessionStorage.setItem('admin_key', key.value);
        key.value = '';
        location.href = '/';
        return;
      }
      say(res.status === 429 ? 'too many tries, wait a few minutes' : res.status === 503 ? "admin isn't set up on the server" : 'wrong key', 'err');
    } catch (_) {
      say("couldn't connect", 'err');
    }
    enter.disabled = !key.value;
  });

  out.addEventListener('click', () => { try { sessionStorage.removeItem('admin_key'); } catch (_) {} render(); key.focus(); });

  if (window.TakeAdminParticles) window.TakeAdminParticles.mount($('bg'));
  render();
})();
