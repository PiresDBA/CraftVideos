import json
import urllib.parse
import urllib.request

TEXT = "Eu sou a Luna. O fluxo e sempre o mesmo: um robo apanha as noticias do dia."

def google(text, sl, tl):
    q = urllib.parse.quote(text)
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={q}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode("utf-8"))
    return "".join(seg[0] for seg in data[0] if seg and seg[0])

for tl in ["en", "es"]:
    try:
        out = google(TEXT, "pt", tl)
        print(f"[{tl}] OK ({len(out)} chars): {out[:120]}")
    except Exception as e:
        print(f"[{tl}] FALHOU: {e}")

# LibreTranslate estado
try:
    import urllib.parse as up
    body = json.dumps({"q": TEXT, "source": "pt", "target": "en", "format": "text"}).encode()
    req = urllib.request.Request("https://libretranslate.de/translate", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        print("[libre] OK:", r.read().decode()[:100])
except Exception as e:
    print("[libre] FALHOU:", e)
