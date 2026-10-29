// ---------- Sohbet asistanı: sorular site-chat sunucu fonksiyonuna gider ----------
(function () {
  var CHAT_URL = 'https://rakmatyrsoswbbhnzeph.supabase.co/functions/v1/site-chat';
  var KEY = 'sb_publishable_tz56pGEoFDj3yqakGr1uNg_LgaBdNij';
  var openBtn = document.getElementById('chat-open'), box = document.getElementById('chat'), closeBtn = document.getElementById('chat-close');
  var log = document.getElementById('chat-log'), form = document.getElementById('chat-form'), input = document.getElementById('chat-in'), sugg = document.getElementById('chat-sugg');
  var sid = null, busy = false;
  try { sid = localStorage.getItem('gidero-chat'); } catch (e) {}
  function show(on) { box.hidden = !on; openBtn.hidden = on; openBtn.setAttribute('aria-expanded', String(on)); if (on) input.focus(); else openBtn.focus(); }
  openBtn.addEventListener('click', function () { show(true); });
  closeBtn.addEventListener('click', function () { show(false); });
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape') show(false); });
  function add(text, who) { var d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true; sugg.hidden = true; input.value = '';
    add(text, 'me');
    var wait = add('Yazıyor…', 'bot wait');
    fetch(CHAT_URL, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY }, body: JSON.stringify({ session_id: sid, message: text, page: location.pathname }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.session_id) { sid = d.session_id; try { localStorage.setItem('gidero-chat', sid); } catch (e) {} }
        wait.className = 'msg bot'; wait.textContent = d.reply || d.error || 'Yanıt alınamadı. Lütfen tekrar deneyin.';
      })
      .catch(function () { wait.className = 'msg bot'; wait.textContent = 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.'; })
      .then(function () { busy = false; log.scrollTop = log.scrollHeight; });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  sugg.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { send(b.textContent); }); });
})();
