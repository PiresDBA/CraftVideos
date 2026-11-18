// timeline.ts - tipos e leitura do timeline.json do episodio completo.
//
// O ficheiro e gerado por gerar_timeline.mjs (que le a tabela de DIRECAO-ARTE.md)
// e servido de public/timeline.json. Nada aqui anima: so descreve o contrato e
// faz o fetch com delayRender/continueRender para o render ser determinista.

import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import exemplo from "../timeline.example.json";

/** Ciclo de animacao ja resolvido pelo gerador. */
export type Ciclo = {
  fps: number; // desenhos por segundo (por omissao 7,5)
  frames: string[]; // caminhos relativos a public/
};

/** Sombra de contacto medida na tabela de direccao de arte. */
export type Sombra = {
  w: number; // largura da elipse
  h: number; // altura da elipse
  op: number; // opacidade 0..1
  dx: number; // deslocamento em x face ao centro dos pes
  dy: number; // deslocamento em y face a linha do chao
};

/** Uma personagem num beat. `y` e a LINHA DOS PES (chao da cena). */
export type SpriteBeat = {
  mov: string; // nome do ciclo no banco; se nao existir, usa a pose estatica
  expr: string; // expressao mapeada para uma das 8 folhas aprovadas
  x: number; // centro da personagem, em px (centro da caixa)
  y: number; // linha do chao da cena
  h: number; // altura do sprite, em px
  flip?: boolean;
  sombra?: Sombra;
  frente?: boolean; // true = ultimo z dentro da camada de personagens
};

/** Um beat = um segmento de fala. */
export type Beat = {
  i: number;
  from: number;
  durationInFrames: number;
  frida: SpriteBeat;
  luna: SpriteBeat;
  caption: string;
  speaker?: string;
  action?: string;
};

/**
 * Camera simples. `amount` e uma fraccao para push-in/zoom e PX para pan/tilt.
 * `tilt` e um tilt extra em px (montanha: push-in + tilt). `fundoTremor` e
 * a amplitude em px do tremor aplicado SOMENTE ao fundo (espelhos: frame % 12).
 */
export type Camera = {
  move: "push-in" | "pan" | "tilt" | "zoom" | "none";
  amount: number;
  tilt?: number;
  fundoTremor?: number;
  nota?: string;
};

/** Uma cena (11 no episodio). */
export type Scene = {
  overlay?: string; // efeito de fundo desenhado por codigo (ver FundosVivos.tsx)
  scene: string;
  from: number;
  durationInFrames: number;
  bg: string;
  chao: number;
  camera: Camera;
  sombraFrida?: Sombra;
  sombraLuna?: Sombra;
  beats: Beat[];
};

/** Contrato completo. */
export type Timeline = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  audio?: string;
  musica?: string;
  musicaVolume?: number;
  banco?: Record<string, Ciclo>;
  expressoes?: Record<string, Record<string, string>>;
  scenes: Scene[];
  nota?: string;
};

/** Cache: o fetch so acontece uma vez por processo de render. */
let cache: Timeline | null = null;

/** Le public/timeline.json; se faltar, usa o exemplo incluido no bundle. */
export const useTimeline = (): Timeline | null => {
  const [dados, setDados] = useState<Timeline | null>(cache);

  useEffect(() => {
    if (cache) {
      setDados(cache);
      return;
    }
    const handle = delayRender("a ler timeline.json");
    fetch(staticFile("timeline.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Timeline>;
      })
      .then((j) => {
        cache = j;
        setDados(j);
      })
      .catch((e: Error) => {
        console.warn(`[episodio] timeline.json em falta (${e.message}); uso o exemplo.`);
        cache = exemplo as Timeline;
        setDados(cache);
      })
      .finally(() => continueRender(handle));
  }, []);

  return dados;
};

/** Cena que cobre o frame; antes/depois usa a primeira/ultima (nunca ecra preto). */
export const cenaEm = (tl: Timeline, frame: number): Scene | undefined => {
  const cenas = tl.scenes ?? [];
  if (!cenas.length) return undefined;
  return (
    cenas.find((c) => frame >= c.from && frame < c.from + c.durationInFrames) ??
    (frame < cenas[0].from ? cenas[0] : cenas[cenas.length - 1])
  );
};

/** Beat que cobre o frame; no silencio mantem a ultima pose (nunca desaparece). */
export const beatEm = (cena: Scene, frame: number): Beat | undefined => {
  const beats = cena.beats ?? [];
  if (!beats.length) return undefined;
  const activo = beats.find((b) => frame >= b.from && frame < b.from + b.durationInFrames);
  if (activo) return activo;
  let ultimo = beats[0];
  for (const b of beats) if (b.from <= frame) ultimo = b;
  return ultimo;
};
