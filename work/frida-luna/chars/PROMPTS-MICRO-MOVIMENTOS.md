# Micro-movimentos obrigatórios — regra do motor

Um ciclo não é aceite só porque o corpo está quieto e o olho pisca. Cada quadro tem de
ter pequenas alterações **no rosto e nos apêndices**, senão a personagem lê-se como boneco.
Esta folha é injectada automaticamente em todos os prompts por `gerar_ciclos.py`.

## Princípio

> Em qualquer ciclo, pelo menos **três** regiões micro-móveis têm de mudar entre quadros
> consecutivos, e nenhuma delas pode mudar mais do que o permitido abaixo. Um quadro
> idêntico ao anterior é reprovado — excepto no quadro de fecho do ciclo.

## Frida — regiões obrigatórias

| região | amplitude (H = 270 px) | período sugerido | como se vê |
| --- | --- | --- | --- |
| bochecha rosada (blush) | 1–2 px de largura / 5 % de opacidade | 8–12 quadros | "vida" a subir e descer; nunca desaparece |
| sobrancelha | 1–2 px de altura | 6–10 quadros | leve arco, uma sobrancelha dessincronizada da outra |
| orelha | 1–3 px de rotação/ponta | 8–12 quadros | sacudidela curta, não flap grande |
| focinho / beiço | 1–2 px | 10–14 quadros | o beiço tremeluz, sobretudo em fala |
| colar de pérolas | 1–2 px de balanço | 8–12 quadros | segue o movimento do peito com atraso de 1 quadro |
| rabinho | 3–6 px na ponta | 6–8 quadros | meia volta curta, não remo de leme |
| olho | piscar real 2–3 quadros | 48–96 quadros | pálpebra curva, nunca barra |

## Luna — regiões obrigatórias

| região | amplitude (H = 270 px) | período sugerido | como se vê |
| --- | --- | --- | --- |
| sobrancelha | 1–2 px de altura | 6–10 quadros | uma sobe, a outra desce ligeiramente |
| olho | piscar real 2–3 quadros | 48–96 quadros | pálpebra curva |
| focinho / nariz | 1–2 px | 8–12 quadros | nariz a "farejar" micro-movimento |
| orelhas compridas | 2–4 px na ponta | 10–14 quadros | balanço mole, atrasado em relação ao corpo |
| bandana roxa | 1–2 px | 8–12 quadros | ponta a mexer com o peso do corpo |
| rabinho | 4–8 px na ponta | 6–10 quadros | abanar pequeno e constante |
| bigode / pelo do focinho | 1 px | 10–14 quadros | vibração mínima |

## Bloco para injectar no prompt (inglês)

```
MICRO-MOVEMENTS — MANDATORY. This is NOT a frozen character with only breathing and blinking.
In every drawing, at least three small facial/appendage details change by 1 to 3 pixels
relative to the previous drawing. Keep the body outline, feet, head centre and overall size
stable: only these details move.

For the FRIDA bulldog: the rosy cheek blush gently pulses in size/opacity, one eyebrow arcs
slightly differently from the other, one floppy ear gives a tiny twitch, the muzzle/jowl has
a very small tremble, the pearl necklace swings 1-2 pixels one drawing after the chest moves,
and the short tail gives a small wag of 3-6 pixels at the tip. Blink once with real curved
eyelids (never a straight bar).

For the LUNA dachshund: the eyebrows move independently by 1-2 pixels, the nose/muzzle has a
tiny sniffing twitch, the long floppy ears sway loosely at the tips, the purple bandana
swings 1-2 pixels, the muzzle whiskers tremble by 1 pixel, and the tail wags constantly but
gently (4-8 pixels at the tip). Blink once with real curved eyelids (never a straight bar).

Rule: no two consecutive drawings may be identical. The only allowed identical pair is the
LAST drawing compared to the FIRST, so the loop closes. Amplitudes must stay small: these
are micro-movements, not gestures.
```

## Negativo — acrescentar

```
frozen face, identical frames, only breathing, only blinking, robot stillness, rigid ears,
rigid tail, straight bar over the eyes, black stripe over eyes, big head swing, big arm
gesture, body bouncing, size change between drawings
```

## Verificação no motor

`validar_ciclo.py` mede, para cada região, a variação entre quadros consecutivos:

- se **nenhuma** região micro mudar em nenhum par consecutivo → `REJEITADA: rosto congelado`;
- se a variação média entre quadros for **0** → `REJEITADA: quadros idênticos`;
- se o centro do corpo ou a altura saírem dos limites → `REJEITADA` (o micro não pode virar gesto);
- se a diferença do último para o primeiro for muito maior que a média → `REJEITADA: ciclo não fecha`.

Tolerâncias: micro-movimento entre 1 e 6 px por região; diferença média entre quadros
entre 0,3 % e 6 % dos pixeis opacos.
