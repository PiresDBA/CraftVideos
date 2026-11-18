// Episodio.tsx - "O Parque dos Pets" completo: 1920x1080, 30 fps, 5882 frames.
//
// Fonte dos numeros: DIRECAO-ARTE.md (via gerar_timeline.mjs). Regras aplicadas:
//   - o elenco NAO se move com a camera (factor 0,00); so o fundo e transformado;
//   - pes na linha do chao de cada cena, sombra eliptica medida #2A1A12 6 px abaixo;
//   - ordem de desenho fundo -> (parallax) -> Frida/Luna conforme "a frente" -> legenda;
//   - sem interpolacao entre desenhos: indice inteiro, cada desenho dura 30/fps_anim frames;
//   - tremor so no fundo de "espelhos" (frame % 12); determinismo total.

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Beat, Camera, Scene, Sombra, SpriteBeat, Timeline, beatEm, cenaEm, useTimeline } from "./timeline";
import { FundosVivos } from "./FundosVivos";

const FPS_CICLO_OMISSAO = 7.5;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Transform da camera aplicado SOMENTE ao fundo (o elenco fica imovel). */
const cameraNoFundo = (cam: Camera, frame: number, from: number, dur: number): React.CSSProperties => {
  const t = clamp01((frame - from) / Math.max(1, dur));
  const a = cam.amount ?? 0;
  let transform: string;

  switch (cam.move) {
    case "push-in":
    case "zoom":
      transform = `scale(${(1 + a * t).toFixed(5)})`;
      break;
    case "pan": {
      // Escala minima para o deslize nao deixar borda (1376*1,40625 = 1935 px).
      const escala = 1 + Math.max(0.06, (Math.abs(a) * 2) / 1920 + 0.02);
      transform = `translateX(${(a * t).toFixed(2)}px) scale(${escala.toFixed(4)})`;
      break;
    }
    case "tilt": {
      const escala = 1 + Math.max(0.06, (Math.abs(a) * 2) / 1080 + 0.02);
      transform = `translateY(${(a * t).toFixed(2)}px) scale(${escala.toFixed(4)})`;
      break;
    }
    default:
      transform = "none";
  }

  // "push-in + tilt 0->-90 px" da cena montanha.
  if (cam.tilt) transform = `${transform === "none" ? "" : transform + " "}translateY(${(cam.tilt * t).toFixed(2)}px)`;
  // "tremor +-4 px so no fundo, frame % 12" da cena espelhos.
  if (cam.fundoTremor) {
    const dx = frame % 12 < 6 ? cam.fundoTremor : -cam.fundoTremor;
    transform = `${transform === "none" ? "" : transform + " "}translateX(${dx}px)`;
  }

  return transform === "none" ? {} : { transform, transformOrigin: "50% 50%" };
};

/** Caminho do sprite deste frame: ciclo por indice inteiro, ou pose estatica. */
const spriteEm = (
  tl: Timeline,
  quem: "frida" | "luna",
  dado: SpriteBeat,
  frameLocal: number,
  fpsVideo: number,
): string => {
  const ciclo = tl.banco?.[`${quem}/${dado.mov}`];
  if (ciclo && ciclo.frames.length > 0) {
    const fpsAnim = ciclo.fps ?? FPS_CICLO_OMISSAO;
    const passo = Math.max(1, fpsVideo / fpsAnim); // 30/7,5 = 4 frames por desenho
    const idx = Math.floor(Math.max(0, frameLocal) / passo) % ciclo.frames.length;
    return staticFile(ciclo.frames[idx]);
  }
  // NUNCA deixa a personagem desaparecer: cai para a pose da expressao mapeada.
  const pose =
    tl.expressoes?.[quem]?.[dado.expr] ?? tl.expressoes?.[quem]?.happy ?? `chars/poses-v3/${quem}/happy.png`;
  return staticFile(pose);
};

/** Sombra eliptica medida + sprite ancorado pelos pes. */
const Personagem: React.FC<{ quem: "frida" | "luna"; dado: SpriteBeat; src: string; frame: number }> = ({
  quem,
  dado,
  src,
  frame,
}) => {
  const s: Sombra = dado.sombra ?? { w: 280, h: 16, op: 0.2, dx: 0, dy: 0 };
  const largura = dado.h * 1.15; // caixa larga; o sprite entra com object-fit: contain

  // MICRO-MOVIMENTOS PROCEDURAIS — não dependem de mais imagens.
  // Respiração: escala Y 1,000 -> 1,012 -> 1,000 (~7 px a 620 de altura), 48 frames.
  // Inclinação da cabeça: +-2,5 graus em torno dos pés, 120 frames.
  // Micro balanço lateral: 1,2 px, 24 frames. A Luna vai com 15 frames de atraso.
  const fase = quem === "luna" ? 15 : 0;
  const t = (frame + fase) / 30;
  const resp = Math.sin((t * Math.PI * 2) / 48) * 0.012;
  const inc = Math.sin((t * Math.PI * 2) / 120) * 2.5;
  const balanco = Math.sin((t * Math.PI * 2) / 24) * 1.2;
  const micro = `translateX(${balanco.toFixed(2)}px) rotate(${inc.toFixed(2)}deg) scaleY(${(1 + resp).toFixed(4)})`;
  const transform = dado.flip ? `scaleX(-1) ${micro}` : micro;

  return (
    <React.Fragment>
      <div
        style={{
          position: "absolute",
          left: dado.x + s.dx - s.w / 2,
          top: dado.y + 6 + s.dy - s.h / 2, // centrada 6 px abaixo dos pes
          width: s.w,
          height: s.h,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(42,26,18,${s.op}) 0%, rgba(42,26,18,${(s.op * 0.35).toFixed(3)}) 55%, rgba(42,26,18,0) 100%)`,
          filter: "blur(2px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: dado.x - largura / 2,
          top: dado.y - dado.h,
          width: largura,
          height: dado.h,
          transform,
          transformOrigin: "50% 100%",
        }}
      >
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "bottom center",
            display: "block",
          }}
        />
      </div>
    </React.Fragment>
  );
};

/** Legenda: visivel so dentro do beat, com entrada e saida curtas. */
const Legenda: React.FC<{ beat: Beat; frame: number }> = ({ beat, frame }) => {
  const inicio = beat.from;
  const fim = beat.from + beat.durationInFrames;
  if (frame < inicio || frame >= fim) return null;

  const rampa = Math.min(6, Math.max(1, beat.durationInFrames / 3));
  const opacidade = Math.min(
    interpolate(frame, [inicio, inicio + rampa], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(frame, [fim - rampa, fim], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 150,
        transform: "translateX(-50%)",
        maxWidth: 1560,
        padding: "14px 30px",
        borderRadius: 16,
        background: "rgba(24, 18, 12, 0.72)",
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
        color: "#FFF8EC",
        fontFamily: '"Segoe UI", "Arial", sans-serif',
        fontSize: 42,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: 0.2,
        textAlign: "center",
        opacity: opacidade,
      }}
    >
      {beat.caption}
    </div>
  );
};

/** Primeiro quadro antes do fetch: fundo fixo, nunca ecra preto. */
const Espera: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#FFF1DC" }}>
    <Img
      src={staticFile("bg/flow/final.png")}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);

export const Episodio: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = useTimeline();
  if (!tl) return <Espera />;

  const cena: Scene | undefined = cenaEm(tl, frame);
  const beatDentro: Beat | undefined = cena ? beatEm(cena, frame) : undefined;
  // A narração entra 3,9 s depois do vídeo. Sem isto os primeiros 116 frames mostram
  // só o fundo e parece que a animação começa a meio. Usa o primeiro beat da cena
  // e fixa o quadro do ciclo no início até a fala começar.
  const beat: Beat | undefined = beatDentro ?? cena?.beats?.[0];
  const fundo = cena?.bg ?? "bg/flow/final.png";
  const cam: Camera = cena?.camera ?? { move: "none", amount: 0 };
  const local = beat ? Math.max(0, frame - beat.from) : frame;

  // "a frente" define o ultimo z dentro da camada de personagens.
  const elenco: { quem: "frida" | "luna"; dado: SpriteBeat }[] = beat
    ? [
        { quem: "frida" as const, dado: beat.frida },
        { quem: "luna" as const, dado: beat.luna },
      ].sort((a, b) => Number(!!a.dado.frente) - Number(!!b.dado.frente))
    : [];

  return (
    <AbsoluteFill style={{ backgroundColor: "#FFF1DC" }}>
      {/* fundo com a camera; elenco fora (factor 0,00) */}
      <div style={{ position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            ...cameraNoFundo(cam, frame, cena?.from ?? 0, cena?.durationInFrames ?? 1),
          }}
        >
          <Img
            src={staticFile(fundo)}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        </div>
        {/* efeitos de fundo por codigo: passarinhos, folhas, vento, brilhos, confete... */}
        <FundosVivos overlay={cena?.overlay} />
        {elenco.map(({ quem, dado }) => (
          <Personagem
            key={quem}
            quem={quem}
            dado={dado}
            src={spriteEm(tl, quem, dado, local, fps)}
            frame={frame}
          />
        ))}
      </div>

      {beat && <Legenda beat={beat} frame={frame} />}

      {tl.audio ? <Audio src={staticFile(tl.audio)} /> : null}
      {tl.musica ? <Audio src={staticFile(tl.musica)} volume={tl.musicaVolume ?? 0.12} /> : null}
    </AbsoluteFill>
  );
};
