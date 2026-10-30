// Fiyat hesaplayıcı: sayfadaki [data-pricing="company|bureau"] alanına kurulur.
// Fiyat ve kademeler uygulamadaki public_pricing() listesinden gelir; açılamazsa yedek liste kullanılır.
(function () {
  var SUPA = 'https://rakmatyrsoswbbhnzeph.supabase.co', KEY = 'sb_publishable_tz56pGEoFDj3yqakGr1uNg_LgaBdNij';
  var FALLBACK = [
    { id: 'sirket', kind: 'company', unit: 'user', price_monthly: 299, price_yearly_monthly: 249, min_seats: 3, bands: [{min_qty:10,factor:.92},{min_qty:25,factor:.85},{min_qty:50,factor:.78},{min_qty:100,factor:.70},{min_qty:250,factor:.62}] },
    { id: 'buro_esnek', kind: 'bureau', unit: 'company', price_monthly: 199, price_yearly_monthly: 165, min_seats: 1, users_per_company: 3, bands: [{min_qty:5,factor:.90},{min_qty:10,factor:.80},{min_qty:25,factor:.70},{min_qty:50,factor:.60},{min_qty:100,factor:.50},{min_qty:150,factor:.45}] }
  ];
  var fmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  var tl = function (n) { return fmt.format(Math.round(n * 100) / 100) + ' TL'; };
  function factor(p, n) { var f = 1; (p.bands || []).slice().sort(function (a, b) { return a.min_qty - b.min_qty; }).forEach(function (b) { if (b.min_qty <= n) f = Number(b.factor); }); return f; }
  function unit(p, n, per) { return Math.round((per === 'year' ? p.price_yearly_monthly : p.price_monthly) * factor(p, n) * 100) / 100; }

  document.querySelectorAll('[data-pricing]').forEach(function (root) {
    var kind = root.getAttribute('data-pricing'), period = 'year', plans = FALLBACK;
    var bureau = kind === 'bureau', per = bureau ? 'firma' : 'kişi', Per = bureau ? 'Firma' : 'Kişi';
    root.innerHTML =
      '<div class="pbox">' +
        '<div class="prow"><label for="q-' + kind + '">' + (bureau ? 'Müşteri firma sayınız' : 'Masraf giren çalışan sayınız') + '</label>' +
        '<div class="qty"><output data-o="qty">10</output><span class="muted">' + per + '</span></div>' +
        '<input type="range" id="q-' + kind + '" data-o="range" min="1" max="' + (bureau ? 200 : 500) + '" value="10">' +
        '<div class="ticks"><span data-o="min">1</span><span>' + (bureau ? 200 : 500) + '</span></div>' +
        '<p class="hint">' + (bureau ? 'Her firmada 3 çalışan pakete dahildir, büro personeli ücretsizdir.' : 'Onaylayıcı, muhasebeci ve ödeme yetkilisi ücretsizdir.') + '</p></div>' +
        '<div class="prow"><label>Ödeme</label><div class="seg" role="group" aria-label="Ödeme dönemi"><button type="button" data-p="year" aria-pressed="true">Yıllık tek ödeme</button><button type="button" data-p="month" aria-pressed="false">Aylık</button></div></div>' +
        '<div class="bands" data-o="bands"></div>' +
      '</div>' +
      '<div class="result" aria-live="polite">' +
        '<span class="r-label" data-o="per"></span><div class="big" data-o="unit"></div>' +
        '<div class="line"><span>Aylık toplam</span><b data-o="month"></b></div>' +
        '<div class="line"><span data-o="plabel"></span><b data-o="total"></b></div>' +
        '<div class="save" data-o="save"></div>' +
        '<a class="btn btn-light" href="https://gidero.expo.app">14 gün ücretsiz başlayın</a>' +
        '<span class="r-foot">Tek paket, bütün özellikler dahil. Fiyatlara KDV dahil değildir. Deneme bitince paket seçmezseniz ücret çekilmez.</span>' +
      '</div>';
    var $ = function (k) { return root.querySelector('[data-o="' + k + '"]'); };
    var range = $('range');
    function plan() { return plans.find(function (p) { return p.kind === kind; }) || FALLBACK.find(function (p) { return p.kind === kind; }); }
    function calc() {
      var p = plan(), min = p.min_seats || 1;
      range.min = min; if (Number(range.value) < min) range.value = min; $('min').textContent = min;
      var n = Number(range.value), u = unit(p, n, period), um = unit(p, n, 'month');
      $('qty').textContent = n;
      $('per').textContent = Per + ' başı, aylık' + (period === 'year' ? ' (yıllık ödemede)' : '');
      $('unit').textContent = tl(u);
      $('month').textContent = tl(u * n);
      $('plabel').textContent = period === 'year' ? 'Yıllık tek ödeme' : 'Aylık ödeme';
      $('total').textContent = tl(period === 'year' ? u * n * 12 : u * n);
      var saving = p.price_monthly * n * 12 - (period === 'year' ? u : um) * n * 12;
      $('save').textContent = saving > 1 ? 'Liste fiyatına göre yılda ' + tl(saving) + ' daha az ödersiniz.' : '';
      var bands = [{ min_qty: min, factor: 1 }].concat(p.bands || []);
      $('bands').innerHTML = '<div>' + Per + ' başı aylık fiyat:</div>' + bands.map(function (b, i) {
        var next = bands[i + 1], on = n >= b.min_qty && (!next || n < next.min_qty);
        return '<span class="' + (on ? 'on' : '') + '">' + b.min_qty + (next ? '–' + (next.min_qty - 1) : '+') + ' ' + per + ': ' + tl(unit(p, b.min_qty, period)) + '</span>';
      }).join('');
    }
    root.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () {
      period = b.getAttribute('data-p'); root.querySelectorAll('[data-p]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); calc();
    }); });
    range.addEventListener('input', calc);
    calc();
    fetch(SUPA + '/rest/v1/rpc/public_pricing', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (Array.isArray(d) && d.some(function (p) { return p.kind === kind; })) { plans = d.map(function (p) { p.price_monthly = Number(p.price_monthly); p.price_yearly_monthly = Number(p.price_yearly_monthly); return p; }); calc(); } })
      .catch(function () {});
  });
})();
