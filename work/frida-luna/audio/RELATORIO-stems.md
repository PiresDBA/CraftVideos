# Stems — O Parque dos Pets

Gerado por `audio/separar_stems.py`. O original `ref/audio.wav` **não foi alterado**.

- Separação: **REAIS (Demucs)**
- Separador: `demucs` (modelo `htdemucs`, demucs 4.1.0)
- Instalação: `demucs 4.1.0` foi instalado com `py -m pip install demucs` nesta máquina (mesmo interpretador do `torch 2.6.0+cu126`); nada mais foi instalado.
- Formato: WAV PCM 16 bits, 44,1 kHz, estéreo, 196.069 s (8646656 amostras)

## Ficheiros

| ficheiro | bytes | conteúdo |
| --- | --- | --- |
| `audio/voz.wav` | 34586668 | narração isolada (fonte do RMS do lip-sync) |
| `audio/musica.wav` | 34586668 | trilha sem voz |

## Qualidade medida (44 janelas de fala de `ref/words.json`)

| sinal | RMS em fala | RMS em pausa | contraste |
| --- | --- | --- | --- |
| mistura original | 0.14934 | 0.07975 | 5.45 dB |
| `voz.wav` | 0.14534 | 0.02149 | 16.6 dB |
| `musica.wav` | 0.03097 | 0.07593 | -7.79 dB |

Ganho de contraste fala/pausa no stem de voz: **11.15 dB**. Se este número for alto, a música deixa de abrir a boca nas pausas.

Erro de reconstrução (mistura − (voz+musica)): RMS 0.001969.

## Limites (a declarar a quem montar a timeline)

- Demucs é um separador **estatístico**, não uma recuperação do master: a voz tem
  resíduo de música de baixo nível e a trilha perde algum corpo nos ataques de voz.
- Os dois stems não reconstroem a mistura ao bit: o Demucs não é soma exacta.
- O vídeo/áudio final usa `ref/audio.wav`; os stems servem para **decidir** movimento
  (boca, ênfases, pausas), não para substituir o áudio.
