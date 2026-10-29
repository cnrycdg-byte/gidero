#!/usr/bin/env python3
"""Siteyi tek bir HTML dosyasına gömer: sayfalar, stiller, yazı tipleri, görseller ve betikler içeride.
Dosya internetsiz, çift tıklayarak açılır; sayfa geçişleri dosyanın içinde olur (#p-sirketler gibi).
Önce build.py çalışmış olmalı. Kullanım: python3 site-src/bundle.py cikti.html
"""
import base64, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
FIRST = ['index.html', 'sirketler.html', 'burolar.html']
MIME = {'woff2': 'font/woff2', 'webp': 'image/webp', 'png': 'image/png', 'jpg': 'image/jpeg', 'mp4': 'video/mp4'}

ROUTER = """<script>
// Tek dosyada sayfa geçişi: #p-ad sayfayı, #kimlik o sayfadaki bölümü açar
(function () {
  var pages = [].slice.call(document.querySelectorAll('[data-page]'));
  function go() {
    var id = decodeURIComponent(location.hash.slice(1)) || 'p-index';
    var el = document.getElementById(id) || document.getElementById('p-index');
    var pg = el.closest('[data-page]') || document.getElementById('p-index');
    var same = !pg.hidden;
    pages.forEach(function (p) { p.hidden = p !== pg; });
    document.title = pg.getAttribute('data-title');
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      if (a.getAttribute('href') === '#' + pg.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var how = same ? 'smooth' : 'instant';
    if (el === pg) window.scrollTo({ top: 0, behavior: how }); else el.scrollIntoView({ behavior: how });
  }
  window.addEventListener('hashchange', go);
  go();
})();
</script>"""


def data_uri(path):
    return f"data:{MIME[path.suffix[1:]]};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main(out):
    order = FIRST + sorted(f.name for f in SITE.glob('*.html') if f.name not in FIRST)
    pages, srcs, inline, owner = [], [], [], {}
    nav = foot = chat = None
    for name in order:
        h = (SITE / name).read_text()
        title = re.search(r'<title>(.*?)</title>', h).group(1)
        m = re.search(r'<main( class="wrap")?>(.*?)</main>', h, re.S)
        cls, body = m.group(1) or '', m.group(2)
        stem = name[:-5]
        if name not in FIRST:  # yasal sayfaların kimlikleri çakışabilir: sayfa adıyla öne ekle
            body = re.sub(r'\bid="([^"]+)"', lambda m: f'id="{stem}-{m.group(1)}"', body)
            body = re.sub(r'href="#([^"]+)"', lambda m: f'href="#{stem}-{m.group(1)}"', body)
        for i in re.findall(r'\bid="([^"]+)"', body):
            if owner.get(i, name) != name:
                sys.exit(f'Aynı kimlik iki sayfada: #{i} ({owner[i]}, {name})')
            owner[i] = name
        pages.append(f'<div id="p-{stem}" data-page data-title="{title}"{cls} hidden>{body}</div>')
        for s in re.findall(r'<script src="([^"]+)"></script>', h):
            if s not in srcs:
                srcs.append(s)
        inline += re.findall(r'<script>(.*?)</script>', h, re.S)
        if name == 'index.html':
            nav = re.search(r'<header class="nav">.*?</header>', h, re.S).group(0)
            foot = re.search(r'<footer class="foot">.*?</footer>', h, re.S).group(0)
            chat = re.search(r'<button class="chat-open".*?</section>', h, re.S).group(0)

    html = nav + '\n<main>' + ''.join(pages) + '</main>\n' + foot + '\n' + chat

    def link(m):
        file, _, frag = m.group(1).partition('#')
        if not frag:
            return f'href="#p-{file[:-5]}"'
        return f'href="#{frag}"' if file in FIRST else f'href="#{file[:-5]}-{frag}"'
    html = re.sub(r'href="([a-z-]+\.html(?:#[^"]*)?)"', link, html)
    html = re.sub(r'(src|poster)="((?:img|media)/[^"]+)"', lambda m: f'{m.group(1)}="{data_uri(SITE / m.group(2))}"', html)
    html = html.replace(' loading="lazy"', '')

    css = (SITE / 'assets' / 'site.css').read_text()
    css = re.sub(r"url\('fonts/([^']+)'\)", lambda m: f"url('{data_uri(SITE / 'assets' / 'fonts' / m.group(1))}')", css)
    js = ''.join(f'<script>{(SITE / s).read_text()}</script>\n' for s in srcs)
    js += ''.join(f'<script>{s}</script>\n' for s in inline)

    doc = ('<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
           f'<title>Gidero</title>\n<link rel="icon" href="{data_uri(SITE / "img" / "favicon.png")}">\n'
           f'<style>{css}</style>\n</head>\n<body>\n{html}\n{js}{ROUTER}\n</body>\n</html>\n')
    pathlib.Path(out).write_text(doc)
    print('tek dosya:', out, f'{len(doc) / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1])
