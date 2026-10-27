(function () {
  'use strict';

  var EDGE_GAP = 10;
  var MIN_THUMB = 36;
  var KEY_STEP = 64;

  function placePreview(link) {
    var preview = link.querySelector('.bio-preview');
    var panel = link.closest('.hero-content-panel');
    if (!preview || !panel) return;

    var scroller = link.closest('.about-panel') || panel;
    preview.classList.remove('bio-preview--below');
    preview.style.setProperty('--shift', '0px');

    var area = scroller.getBoundingClientRect();
    var box = preview.getBoundingClientRect();

    var shift = 0;
    if (box.left < area.left + EDGE_GAP) {
      shift = area.left + EDGE_GAP - box.left;
    } else if (box.right > area.right - EDGE_GAP) {
      shift = area.right - EDGE_GAP - box.right;
    }
    preview.style.setProperty('--shift', shift + 'px');

    if (box.top < area.top + EDGE_GAP) {
      preview.classList.add('bio-preview--below');
    }
  }

  function onLinkIntent(event) {
    var link = event.target.closest && event.target.closest('.bio-link');
    if (link) placePreview(link);
  }

  document.addEventListener('pointerover', onLinkIntent, { passive: true });
  document.addEventListener('focusin', onLinkIntent);
  document.addEventListener('touchstart', onLinkIntent, { passive: true });

  var attached = [];

  function attach(scroller) {
    var panel = scroller.closest('.hero-content-panel');
    if (!panel) return;

    var track = document.createElement('div');
    track.className = 'panel-scroll';
    var thumb = document.createElement('div');
    thumb.className = 'panel-scroll-thumb';
    thumb.tabIndex = 0;
    thumb.setAttribute('role', 'scrollbar');
    thumb.setAttribute('aria-orientation', 'vertical');
    thumb.setAttribute('aria-label', 'scroll about me');
    track.appendChild(thumb);
    panel.appendChild(track);

    var frame = 0;
    var dragging = false;
    var startY = 0;
    var startTop = 0;

    function maxScroll() {
      return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    }

    function layout() {
      frame = 0;
      var max = maxScroll();
      var visible = max > 1;
      track.classList.toggle('is-visible', visible);
      if (!visible) return;

      var panelBox = panel.getBoundingClientRect();
      var box = scroller.getBoundingClientRect();
      track.style.top = box.top - panelBox.top + 'px';
      track.style.height = box.height + 'px';

      var trackHeight = box.height;
      var thumbHeight = Math.max(MIN_THUMB, trackHeight * (scroller.clientHeight / scroller.scrollHeight));
      var travel = trackHeight - thumbHeight;
      var progress = scroller.scrollTop / max;

      thumb.style.height = thumbHeight + 'px';
      thumb.style.top = progress * travel + 'px';
      thumb.setAttribute('aria-valuemin', '0');
      thumb.setAttribute('aria-valuemax', '100');
      thumb.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(layout);
    }

    function scrollToTop(top, smooth) {
      scroller.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' });
    }

    thumb.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      startY = event.clientY;
      startTop = scroller.scrollTop;
      scroller.style.scrollBehavior = 'auto';
      track.classList.add('is-dragging');
      thumb.setPointerCapture(event.pointerId);
    });

    thumb.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var travel = track.clientHeight - thumb.offsetHeight;
      if (travel <= 0) return;
      scroller.scrollTop = startTop + (event.clientY - startY) * (maxScroll() / travel);
    });

    function stopDrag(event) {
      if (!dragging) return;
      dragging = false;
      scroller.style.scrollBehavior = '';
      track.classList.remove('is-dragging');
      if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
    }
    thumb.addEventListener('pointerup', stopDrag);
    thumb.addEventListener('pointercancel', stopDrag);

    track.addEventListener('pointerdown', function (event) {
      if (event.target !== track) return;
      event.preventDefault();
      var box = track.getBoundingClientRect();
      var travel = box.height - thumb.offsetHeight;
      if (travel <= 0) return;
      var ratio = (event.clientY - box.top - thumb.offsetHeight / 2) / travel;
      scrollToTop(Math.min(1, Math.max(0, ratio)) * maxScroll(), true);
    });

    thumb.addEventListener('keydown', function (event) {
      var page = scroller.clientHeight * 0.9;
      var target = null;
      if (event.key === 'ArrowDown') target = scroller.scrollTop + KEY_STEP;
      else if (event.key === 'ArrowUp') target = scroller.scrollTop - KEY_STEP;
      else if (event.key === 'PageDown') target = scroller.scrollTop + page;
      else if (event.key === 'PageUp') target = scroller.scrollTop - page;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = maxScroll();
      if (target === null) return;
      event.preventDefault();
      scrollToTop(target, true);
    });

    scroller.addEventListener('scroll', schedule, { passive: true });
    scroller.addEventListener('load', schedule, true);
    window.addEventListener('resize', schedule, { passive: true });

    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (resizeObserver) {
      resizeObserver.observe(scroller);
      Array.prototype.forEach.call(scroller.children, function (child) { resizeObserver.observe(child); });
    }

    var mutationObserver = new MutationObserver(function () {
      if (resizeObserver) {
        Array.prototype.forEach.call(scroller.children, function (child) { resizeObserver.observe(child); });
      }
      schedule();
    });
    mutationObserver.observe(scroller, { childList: true, subtree: true, characterData: true });

    var instance = {
      scroller: scroller,
      destroy: function () {
        window.removeEventListener('resize', schedule);
        if (resizeObserver) resizeObserver.disconnect();
        mutationObserver.disconnect();
        cancelAnimationFrame(frame);
        track.remove();
      },
    };
    attached.push(instance);
    schedule();
  }

  function sync() {
    attached = attached.filter(function (instance) {
      if (instance.scroller.isConnected) return true;
      instance.destroy();
      return false;
    });
    document.querySelectorAll('.about-panel').forEach(function (scroller) {
      var known = attached.some(function (instance) { return instance.scroller === scroller; });
      if (!known) attach(scroller);
    });
  }

  var pending = 0;
  new MutationObserver(function () {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      sync();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  sync();
})();
