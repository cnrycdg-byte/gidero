// Telefondaki sahneleri oynatır (sitedeki akan ekran motorunun sade sürümü)
window.GideroScene = (function () {
  var root = document.getElementById('phone');
  var scenes = [].slice.call(root.querySelectorAll('.scene'));
  var timers = [];
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
    clear();
    var sc = scenes[i];
    if (!sc) return;
    scenes.forEach(function (s) { s.classList.toggle('on', s === sc); });
    sc.querySelectorAll('[data-at]').forEach(function (el) { el.classList.remove('in'); });
    sc.querySelectorAll('[data-out]').forEach(function (el) { el.classList.remove('gone'); });
    sc.querySelectorAll('[data-press]').forEach(function (el) { el.classList.remove('press'); });
    sc.querySelectorAll('[data-fix]').forEach(function (el) {
      var v = el.querySelector('.v');
      if (!el.hasAttribute('data-orig')) el.setAttribute('data-orig', v.textContent);
      el.classList.remove('fixed'); v.textContent = el.getAttribute('data-orig');
    });
    sc.querySelectorAll('[data-type]').forEach(function (el) { el.textContent = animate ? '' : el.getAttribute('data-type'); });
    if (!animate) {
      sc.querySelectorAll('[data-at]').forEach(function (el) { el.classList.add('in'); });
      sc.querySelectorAll('[data-out]').forEach(function (el) { el.classList.add('gone'); });
      sc.querySelectorAll('[data-fix]').forEach(function (el) { el.classList.add('fixed'); el.querySelector('.v').textContent = el.getAttribute('data-fixtext'); });
      return;
    }
    sc.querySelectorAll('[data-at]').forEach(function (el) {
      later(Number(el.getAttribute('data-at')), function () { el.classList.add('in'); if (el.hasAttribute('data-type')) typeInto(el, el.getAttribute('data-type')); });
    });
    sc.querySelectorAll('[data-out]').forEach(function (el) { later(Number(el.getAttribute('data-out')), function () { el.classList.add('gone'); }); });
    sc.querySelectorAll('[data-press]').forEach(function (el) {
      var t = Number(el.getAttribute('data-press'));
      later(t, function () { el.classList.add('press'); });
      later(t + 150, function () { el.classList.remove('press'); });
    });
    sc.querySelectorAll('[data-fix]').forEach(function (el) {
      later(Number(el.getAttribute('data-fix')), function () { el.classList.add('fixed'); typeInto(el.querySelector('.v'), el.getAttribute('data-fixtext')); });
    });
    // Aynı sahne bitince baştan oynar (sunucu konuşurken ekran canlı kalsın)
    var dur = Number(sc.getAttribute('data-dur')) || 5000;
    later(dur + 2500, function () { show(i, true); });
  }
  return { show: show };
})();
