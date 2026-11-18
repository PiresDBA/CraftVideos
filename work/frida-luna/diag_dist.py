import sys
from pathlib import Path

sys.path.insert(0, r"D:\CRAFT\work\frida-luna")
from calibrar_continuidade import assinatura, distancia

ref = assinatura(Path(r"D:\CRAFT\work\frida-luna\chars\poses-v3\luna\happy.png"))
print("ref mu", ref["mu"].round(1), "sd", ref["sd"].round(1), "aspect", round(ref["aspect"], 3))
for p in ("movimentos/luna/escuta/f00.png", "movimentos/luna/fala/f00.png",
          "_novos/luna-escuta/f00.png"):
    a = assinatura(Path(r"D:\CRAFT\work\frida-luna") / p)
    print(p)
    print("  mu", a["mu"].round(1), "sd", a["sd"].round(1),
          "aspect", round(a["aspect"], 3), "dist", distancia(a, ref))
