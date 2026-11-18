"""Processa em lote todas as imagens descarregadas do Flow.

Para cada imagem:
1. corta uma vez;
2. descobre a personagem pela CONTINUIDADE (só uma das duas referências pode dar <=0,45);
3. testa todos os movimentos dessa personagem no validador;
4. guarda só os que passam continuidade + movimento + micro.

Escreve chars/folhas/_mapa-novos.json e um relatório com o motivo de cada rejeição.

Uso: py processar_download.py [pasta-imagens]
"""
import json
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

BASE = Path(r"D:\CRAFT\work\frida-luna")
MOVIMENTOS = ["escuta", "fala", "marcha", "corrida", "giro", "sentar", "olhar", "abracar"]


def corr(args):
    r = subprocess.run(args, cwd=str(BASE), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def continuidade(pasta, quem):
    try:
        from calibrar_continuidade import assinatura, distancia
        ref = BASE / "chars" / "poses-v3" / quem / "happy.png"
        f = Path(pasta) / "f00.png"
        if not f.exists():
            return 99.0
        return float(distancia(assinatura(f), assinatura(ref)))
    except Exception:
        return 99.0


def main():
    pasta = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "imagens-download"
    imagens = [p for p in pasta.rglob("*") if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg")]
    print(f"{len(imagens)} imagens para processar", flush=True)

    tmp = BASE / "_processar"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    motivos = Counter()
    aprovados = []
    detalhe = []

    for i, im in enumerate(imagens):
        # espaçamento >= 1/4 da largura na FOLHA ORIGINAL (requisito (d) do especialista)
        from validar_imagem import validar_espacamento
        esp = validar_espacamento(im)
        if not esp["ok"]:
            motivos["folha: figuras encostadas (< 1/4 da largura)"] += 1
            detalhe.append({"imagem": im.name, "motivo": "espacamento",
                            "figuras": esp["figuras"], "menor_gap": esp["menor_gap"],
                            "exigido": esp["exigido"]})
            continue

        dest = tmp / im.stem
        corr([sys.executable, str(BASE / "cortar_mascara.py"), str(im), str(dest)])
        n = len(list(dest.glob("f*.png")))
        if n < 6:
            motivos["corte: menos de 6 figuras"] += 1
            detalhe.append({"imagem": im.name, "motivo": "corte: menos de 6 figuras"})
            continue

        cs = {q: continuidade(dest, q) for q in ("frida", "luna")}
        quem = min(cs, key=cs.get)
        if cs[quem] > 0.45:
            motivos[f"continuidade: nao e Frida nem Luna (min {cs[quem]:.2f})"] += 1
            detalhe.append({"imagem": im.name, "motivo": f"continuidade {cs[quem]:.2f}",
                            "quem": quem})
            continue

        # porta do ESPECIALISTA: normalizar caixa e validar fundo/tamanho/sombra/figura.
        # Nenhuma imagem entra no banco sem passar aqui (contrato, seccao 6).
        import corrigir_multiplos
        import fixar_proporcoes
        from validar_imagem import validar as validar_especialista
        corrigir_multiplos.corrigir(dest)
        H, aspect = fixar_proporcoes.ALVO[quem]
        fixar_proporcoes.aplicar(dest, quem, H, round(H * aspect))
        vesp = validar_especialista(dest, quem, im.stem)
        if vesp["veredito"] != "ACEITE":
            motivos["especialista: " + "; ".join(vesp["motivos"][:2])] += 1
            detalhe.append({"imagem": im.name, "motivo": "especialista",
                            "quem": quem, "motivos": vesp["motivos"],
                            "portas": vesp["portas"]})
            continue

        melhor = None
        for mov in MOVIMENTOS:
            rc, log = corr([sys.executable, str(BASE / "validar_ciclo.py"), str(dest), mov,
                            "--quem", quem, "--nome", f"{quem}-{mov}"])
            try:
                v = json.loads(log[log.index("{"):log.rindex("}") + 1])
            except Exception:
                continue
            if v.get("veredito") == "ACEITE":
                pontos = v.get("regioes_vivas", 0) + (1 if v.get("emenda", 99) <= v.get("media_passos", 0) else 0)
                if melhor is None or pontos > melhor[0]:
                    melhor = (pontos, mov, v)
        if not melhor:
            motivos["movimento: nenhum tipo passou"] += 1
            detalhe.append({"imagem": im.name, "motivo": "movimento reprovado", "quem": quem,
                            "continuidade": round(cs[quem], 2)})
            continue

        _, mov, v = melhor
        aprovados.append({"imagem": im, "quem": quem, "mov": mov, "pasta": dest,
                          "continuidade": vesp["scores"]["continuidade"],
                          "validacao": v, "especialista": vesp})
        motivos["APROVADO"] += 1
        print(f"  OK {im.name[:44]:44} -> {quem}/{mov} cont {cs[quem]:.2f}", flush=True)

    print("\n=== resumo ===")
    for k, v in motivos.most_common():
        print(f"  {v:4}  {k}")

    mapa_path = BASE / "chars" / "folhas" / "_mapa-novos.json"
    mapa = json.loads(mapa_path.read_text(encoding="utf-8")) if mapa_path.exists() else {}
    for a in aprovados:
        nome = f"{a['quem']}-{a['mov']}"
        final = BASE / "_novos" / nome
        if final.exists():
            shutil.rmtree(final)
        shutil.copytree(a["pasta"], final)
        mapa[nome] = {"ficheiro": str(a["imagem"]), "tipo": a["mov"], "fps": 7.5,
                      "continuidade": round(a["continuidade"], 2),
                      "pontos": a["validacao"].get("regioes_vivas", 0)}
    mapa_path.write_text(json.dumps(mapa, indent=1, ensure_ascii=False), encoding="utf-8")
    (BASE / "animacao" / "processamento-download.json").write_text(
        json.dumps({"total": len(imagens), "resumo": dict(motivos), "detalhe": detalhe},
                   indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(aprovados)} movimentos aprovados -> {mapa_path}")


if __name__ == "__main__":
    main()
