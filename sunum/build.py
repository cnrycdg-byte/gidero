#!/usr/bin/env python3
"""Müşteri sunumunu tek HTML dosyası olarak üretir (yazı tipleri ve stiller içeride, internetsiz açılır).
Kullanım: python3 sunum/build.py cikti.html"""
import base64, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, SRC = ROOT / 'site', ROOT / 'sunum'
css = (SITE / 'assets' / 'site.css').read_text()
css = re.sub(r"url\('fonts/([^']+)'\)", lambda m: "url('data:font/woff2;base64,%s')" % base64.b64encode((SITE / 'assets' / 'fonts' / m.group(1)).read_bytes()).decode(), css)
part = (ROOT / 'site-src' / 'parts' / 'flow-sirket.html').read_text()
scenes = part[part.index('<div class="glass">') + len('<div class="glass">'):part.rindex('</div></div>')]
page = (ROOT / 'site-src' / 'pages' / 'sirketler.html').read_text()
org = page[page.index('<script>', page.index('<!--SCRIPT-->')) + 8:page.rindex('</script>')]
html = (SRC / 'sunum.src.html').read_text()
html = html.replace('/*SITECSS*/', css).replace('<!--SCENES-->', scenes).replace('/*FLOWENGINE*/', (SRC / 'scene-engine.js').read_text()).replace('/*ORGJS*/', org)
pathlib.Path(sys.argv[1]).write_text(html)
print('sunum:', sys.argv[1], f'{len(html) / 1e6:.2f} MB')
