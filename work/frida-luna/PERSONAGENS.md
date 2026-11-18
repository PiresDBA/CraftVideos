# Personagens — ficha técnica (aprovada 2026-11-17)

## Decisão do utilizador

- **Aprovado**: `chars/frida-v2.png` e `chars/luna-v2.png` — as duas **de pé**, 3 vistas.
- **Reprovado**: as grelhas de expressão geradas de raiz — cada célula saía com corpo, olho e
  traço diferentes; pareciam bichos diferentes. Motivo: cada pose foi gerada independentemente.
- **Método obrigatório daqui para a frente**: o **corpo é sempre o pixel da folha aprovada**;
  só a cara muda (olhos, sobrolhos, boca, extras). Assim a consistência é estrutural, não sorte.

## Proporção (regra dura)

| personagem | massa | escala de ALTURA no quadro | nota |
| --- | --- | --- | --- |
| **Frida** (buldogue) | 20 kg | **1,00** | referência |
| **Luna** (salsicha) | 10 kg | **0,72** | Frida é maior, mas **não** o dobro na altura |

- **Correcção do utilizador (final):** a Frida é **maior**, mas **não o dobro**. A 0,50 ficou
  ridícula; a 0,62 ainda lia como pequena demais. **Fica 0,72** — Frida ≈ 1,4× a altura da Luna.
- A diferença de "peso" aparece no **volume** (corpo mais largo e alto), não num factor 2 na altura.
- A Luna é longa, não alta: ganha em comprimento, não em altura.
- Âncora das duas: **pés no chão** (mesma linha de base).

## Identidade visual fixa

| item | Frida | Luna |
| --- | --- | --- |
| raça | buldogue inglês | salsicha (dachshund) |
| pelagem | creme/fawn, peito e focinho brancos, listra branca na testa | castanho-castanha, marcas ferrugem nas patas, focinho e pontas das orelhas |
| marca | **colar de pérolas** | **bandana roxa** |
| olhos | castanho-escuro, grandes, com brilho | castanho-escuro, grandes, com brilho |
| traço | contorno castanho-escuro grosso (~6 px a 340 px de largura) | idem |
| fundo | creme `#F4E9D8` | idem |
| postura | de pé, dois braços com patas | de pé, corpo longo, dois braços curtos |

## Ficheiros canónicos

```
chars/frida-v2.png        folha aprovada (3 vistas)
chars/luna-v2.png         folha aprovada (3 vistas)
chars/base/frida.png      vista 3/4 isolada (340x640) — base das expressões
chars/base/luna.png       idem
```

## O que nenhum agente pode fazer

1. Gerar o personagem final por IA (nem FLUX, nem ComfyUI, nem LoRA).
2. Redesenhar o corpo para "combinar" com uma expressão.
3. Alterar a proporção Frida:Luna.
4. Usar SVG geométrico (reprovado explicitamente).
