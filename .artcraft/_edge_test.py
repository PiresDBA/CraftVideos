import asyncio
import edge_tts
import os

OUT = r"D:\CRAFT\work\clones\_tts-test"
os.makedirs(OUT, exist_ok=True)

TESTS = [
    ("pt-BR-FranciscaNeural", "Ola, eu sou a Frida. Este canal nao tem apresentador humano.", "pt.wav"),
    ("pt-BR-ThalitaMultilingualNeural", "Eu sou a Luna, e vou comentar este video com voce.", "pt2.wav"),
    ("en-US-AriaNeural", "Hello, I am Frida. This channel has no human presenter.", "en.wav"),
    ("es-ES-ElviraNeural", "Hola, soy Frida. Este canal no tiene presentador humano.", "es.wav"),
]

async def main():
    for voice, text, name in TESTS:
        path = os.path.join(OUT, name)
        c = edge_tts.Communicate(text, voice)
        await c.save(path)
        size = os.path.getsize(path) if os.path.exists(path) else 0
        print(f"{voice:38s} -> {name:10s} {size/1024:7.1f} KB  {'OK' if size > 3000 else 'FALHOU'}")

asyncio.run(main())
