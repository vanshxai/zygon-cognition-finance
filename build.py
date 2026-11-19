# Inlines engine.js into the page.
#   app.html   -> for the Claude artifact (its wrapper adds the viewport tag)
#   index.html -> standalone page for Vercel / any static host (adds the viewport tag itself)
src = open("app.src.html").read()
eng = open("engine.js").read()
assert "/*ENGINE*/" in src
page = src.replace("/*ENGINE*/", eng)
open("app.html", "w").write(page)
meta = '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
standalone = page.replace('<meta charset="utf-8">\n', meta, 1)
assert "viewport" in standalone
open("index.html", "w").write(standalone)
print("built app.html and index.html", len(page), "bytes")
