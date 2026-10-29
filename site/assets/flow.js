// Akan ekran: [data-flow] içindeki sahneleri sırayla oynatır, soldaki adımlarla eşler.
// Sahne: .scene[data-dur]. İçindeki öğeler: data-at (ms sonra görünür), data-type (yazılır),
// data-out (ms sonra kaybolur), data-press (ms'de basılır), data-fix + data-fixtext (eksik alan elle doldurulur).
// Hareket azaltma tercihinde kendiliğinden oynamaz; adımlara tıklayınca sahne doğrudan açılır.
(function () {
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-flow]').forEach(function (root) {
    var scenes = [].slice.call(root.querySelectorAll('.scene'));
    var steps = [].slice.call(root.querySelectorAll('.fsteps li'));
    var pauseBtn = root.querySelector('[data-flow-pause]');
    var cur = 0, timers = [], playing = !still, visible = false, started = false;

    function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function clear() { timers.forEach(clearTimeout); timers = []; }
    function typeInto(el, text) {
      var i = 0; el.textContent = ''; el.classList.add('caret');
      (function tick() {
        el.textContent = text.slice(0, ++i);
        if (i < text.length) later(55, tick); else later(400, function () { el.classList.remove('caret'); });
      })();
    }
    function show(i, animate) {
      clear(); cur = i; fit();
      var sc = scenes[i], dur = Number(sc.getAttribute('data-dur')) || 4000;
      scenes.forEach(function (s, k) { s.classList.toggle('on', k === i); });
      steps.forEach(function (li, k) {
        li.classList.toggle('on', k === i); li.classList.toggle('done', k < i);
        var b = li.querySelector('button'); if (b) b.setAttribute('aria-current', k === i ? 'step' : 'false');
        var bar = li.querySelector('.bar span');
        if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; }
      });
      sc.querySelectorAll('[data-at]').forEach(function (el) { el.classList.remove('in'); });
      sc.querySelectorAll('[data-out]').forEach(function (el) { el.classList.remove('gone'); });
      sc.querySelectorAll('[data-press]').forEach(function (el) { el.classList.remove('press'); });
      sc.querySelectorAll('[data-fix]').forEach(function (el) {
        el.classList.remove('fixed'); var v = el.querySelector('.v');
        if (!el.hasAttribute('data-orig')) el.setAttribute('data-orig', v.textContent);
        v.textContent = el.getAttribute('data-orig');
      });
      sc.querySelectorAll('[data-type]').forEach(function (el) { el.textContent = animate ? '' : el.getAttribute('data-type'); });

      if (!animate) {
        sc.querySelectorAll('[data-at]').forEach(function (el) { el.classList.add('in'); });
        sc.querySelectorAll('[data-out]').forEach(function (el) { el.classList.add('gone'); });
        sc.querySelectorAll('[data-fix]').forEach(function (el) { el.classList.add('fixed'); el.querySelector('.v').textContent = el.getAttribute('data-fixtext'); });
        return;
      }
      var bar = steps[i] && steps[i].querySelector('.bar span');
      if (bar) { void bar.offsetWidth; bar.style.transition = 'transform ' + dur + 'ms linear'; bar.style.transform = 'scaleX(1)'; }
      sc.querySelectorAll('[data-at]').forEach(function (el) {
        var t = Number(el.getAttribute('data-at'));
        later(t, function () { el.classList.add('in'); if (el.hasAttribute('data-type')) typeInto(el, el.getAttribute('data-type')); });
      });
      sc.querySelectorAll('[data-type]:not([data-at])').forEach(function (el) { typeInto(el, el.getAttribute('data-type')); });
      sc.querySelectorAll('[data-out]').forEach(function (el) {
        later(Number(el.getAttribute('data-out')), function () { el.classList.add('gone'); });
      });
      sc.querySelectorAll('[data-press]').forEach(function (el) {
        var t = Number(el.getAttribute('data-press'));
        later(t, function () { el.classList.add('press'); });
        later(t + 150, function () { el.classList.remove('press'); });
      });
      sc.querySelectorAll('[data-fix]').forEach(function (el) {
        later(Number(el.getAttribute('data-fix')), function () { el.classList.add('fixed'); typeInto(el.querySelector('.v'), el.getAttribute('data-fixtext')); });
      });
      later(dur, function () { if (playing && visible) show((i + 1) % scenes.length, true); });
    }
    function setPlaying(p) {
      playing = p;
      if (pauseBtn) pauseBtn.textContent = p ? 'Durdur' : 'Oynat';
      if (p && visible) show(cur, true); else if (!p) { clear(); show(cur, false); }
    }
    steps.forEach(function (li, k) {
      var b = li.querySelector('button');
      if (b) b.addEventListener('click', function () { show(k, playing && visible); });
    });
    if (pauseBtn) {
      if (still) pauseBtn.hidden = true;
      pauseBtn.addEventListener('click', function () { setPlaying(!playing); });
    }
    // Dar ekranda masaüstü penceresi orantılı küçülür
    function fit() {
      root.querySelectorAll('.dev.desk').forEach(function (d) {
        var w = root.clientWidth; if (w) d.style.zoom = w < 640 ? (w / 640).toFixed(3) : '';
      });
    }
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else window.addEventListener('resize', fit);
    show(0, false);
    if (still) return;
    var io = new IntersectionObserver(function (en) {
      var v = en[0].isIntersecting;
      if (v === visible) return;
      visible = v;
      if (v && playing) show(started ? cur : 0, true), started = true; else if (!v) clear();
    }, { threshold: 0.35 });
    io.observe(root);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clear(); else if (visible && playing) show(cur, true); });
  });
})();
