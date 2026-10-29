#!/usr/bin/env python3
"""Tanıtım sitesini üretir: ortak üst menü, alt bilgi ve sohbet kutusu her sayfaya aynı yerleştirilir.
Marka adı tek yerde (BRAND). Kullanım: python3 site-src/build.py
- site-src/pages/<ad>.html dosyaları: ilk satırlar 'title:' ve 'description:', sonra '---' ve sayfa gövdesi
- site/*.html içindeki diğer sayfalarda (yasal sayfalar) yalnızca üst menü ve alt bilgi güncellenir
"""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, SRC = ROOT / 'site', ROOT / 'site-src'
BRAND = 'gidero'
APP = 'https://gidero.expo.app'

NAV = f'''<header class="nav"><div class="wrap">
  <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span>{BRAND}</a>
  <nav class="nav-links" aria-label="Ana menü"><a href="sirketler.html">Şirketler için</a><a href="burolar.html">Muhasebe büroları için</a><a href="index.html#guvenlik">Güvenlik</a><a href="index.html#sss">Sorular</a></nav>
  <a class="btn btn-primary" href="{APP}">Giriş yap</a>
</div></header>'''

FOOT = f'''<footer class="foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="brand" href="index.html" style="color:#fff"><span class="brand-mark" aria-hidden="true"></span>{BRAND}</a>
        <p style="margin-top:12px">Fişi çek, onaya gönder, muhasebeye aktar, öde. Şirketler ve muhasebe büroları için masraf yönetimi.</p>
        <p class="legal-id"><span data-company="unvan">[Şirket unvanı]</span><br>Adres: <span data-company="adres">[Açık adres]</span><br>Vergi dairesi / no: <span data-company="vkn">[Vergi dairesi – VKN]</span><br>MERSİS: <span data-company="mersis">[MERSİS no]</span><br>E-posta: <a href="mailto:destek@gidero.tr">destek@gidero.tr</a> · Telefon: <span data-company="tel">[Telefon]</span></p>
      </div>
      <div><h4>Ürün</h4><ul><li><a href="sirketler.html">Şirketler için</a></li><li><a href="burolar.html">Muhasebe büroları için</a></li><li><a href="sirketler.html#fiyat">Şirket fiyatları</a></li><li><a href="burolar.html#fiyat">Büro fiyatları</a></li><li><a href="index.html#guvenlik">Güvenlik</a></li><li><a href="index.html#sss">Sık sorulanlar</a></li></ul></div>
      <div><h4>Kurumsal</h4><ul><li><a href="hakkimizda.html">Hakkımızda</a></li><li><a href="iletisim.html">İletişim</a></li><li><a href="{APP}">Giriş yap</a></li></ul></div>
      <div><h4>Sözleşmeler</h4><ul><li><a href="kullanim-kosullari.html">Kullanım koşulları</a></li><li><a href="mesafeli-satis.html">Mesafeli satış sözleşmesi</a></li><li><a href="on-bilgilendirme.html">Ön bilgilendirme formu</a></li><li><a href="iptal-iade.html">İptal, iade ve cayma</a></li><li><a href="gizlilik.html">Gizlilik politikası</a></li><li><a href="kvkk.html">KVKK aydınlatma metni</a></li><li><a href="cerez.html">Çerez politikası</a></li></ul></div>
    </div>
    <div class="pay-band"><span>Ödemeler iyzico güvencesiyle alınır; kart bilgileriniz bize ulaşmaz.</span><span class="chip">iyzico</span><span class="chip">VISA</span><span class="chip">Mastercard</span><span class="chip">TROY</span></div>
    <p class="legal-id" style="margin-top:16px">© 2026 {BRAND.capitalize()}. Fiyatlara KDV dahil değildir.</p>
  </div>
</footer>'''

CHAT = (SRC / 'parts' / 'chat.html').read_text()

def page(title, desc, body, scripts):
    return f'''<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="media/gidero-demo-poster.jpg">
<link rel="icon" href="img/favicon.png">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
{NAV}
<main>
{body}
</main>
{FOOT}
{CHAT}
{scripts}
<script src="assets/chat.js"></script>
</body>
</html>
'''

built = set()
for f in sorted((SRC / 'pages').glob('*.html')):
    raw = f.read_text()
    head, body = raw.split('\n---\n', 1)
    meta = dict(l.split(':', 1) for l in head.strip().splitlines())
    scripts = ''.join(f'<script src="{s.strip()}"></script>\n' for s in meta.get('scripts', '').split(',') if s.strip())
    inline = ''
    if '<!--SCRIPT-->' in body:
        body, inline = body.split('<!--SCRIPT-->', 1)
    (SITE / f.name).write_text(page(meta['title'].strip(), meta['description'].strip(), body.strip(), scripts + inline.strip()))
    built.add(f.name)

# Yasal ve kurumsal sayfalar: üst menü ve alt bilgi ortak sürüme çekilir
for f in SITE.glob('*.html'):
    if f.name in built:
        continue
    s = f.read_text()
    s = re.sub(r'<header class="nav">.*?</header>', NAV, s, count=1, flags=re.S)
    s = re.sub(r'<footer class="foot">.*?</footer>', FOOT, s, count=1, flags=re.S)
    f.write_text(s)
print('üretildi:', ', '.join(sorted(built)))
