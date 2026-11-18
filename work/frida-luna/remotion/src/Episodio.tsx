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
const Personagem: React.FC<{ quem: "frida" | "luna"; dado: SpriteBeat; src: string }> = ({
  dado,
  src,
}) => {
  const s: Sombra = dado.sombra ?? { w: 280, h: 16, op: 0.2, dx: 0, dy: 0 };
  const largura = dado.h * 1.15; // caixa larga; o sprite entra com object-fit: contain

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
          transform: dado.flip ? "scaleX(-1)" : undefined,
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
        bottom: 64,
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
      src={staticFile("bg/flow/hook.png")}
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
  const beat: Beat | undefined = cena ? beatEm(cena, frame) : undefined;
  const fundo = cena?.bg ?? "bg/flow/hook.png";
  const cam: Camera = cena?.camera ?? { move: "none", amount: 0 };
  const local = beat ? frame - beat.from : frame;

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
        {elenco.map(({ quem, dado }) => (
          <Personagem
            key={quem}
            quem={quem}
            dado={dado}
            src={spriteEm(tl, quem, dado, local, fps)}
          />
        ))}
      </div>

      {beat && <Legenda beat={beat} frame={frame} />}

      {tl.audio ? <Audio src={staticFile(tl.audio)} /> : null}
      {tl.musica ? <Audio src={staticFile(tl.musica)} volume={tl.musicaVolume ?? 0.12} /> : null}
    </AbsoluteFill>
  );
};
