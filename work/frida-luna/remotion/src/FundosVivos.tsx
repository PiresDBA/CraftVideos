// FundosVivos — efeitos de fundo desenhados por código, sem imagens novas.
// Deterministas: tudo depende só de `frame`, não há Math.random() no render.
// Cena escolhe o efeito no campo `overlay` do timeline (gerar_timeline.mjs).

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

type Props = { overlay?: string };

const rnd = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const Folha: React.FC<{ i: number; frame: number; cor: string }> = ({ i, frame, cor }) => {
  const x = ((rnd(i) * 2100 + frame * (0.5 + rnd(i + 9) * 0.7)) % 2100) - 100;
  const y = ((rnd(i + 3) * 1300 + frame * (0.35 + rnd(i + 7) * 0.4)) % 1300) - 100;
  const rot = frame * (0.6 + rnd(i + 11)) + rnd(i) * 360;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 16, height: 9,
      borderRadius: "60% 0 60% 0", background: cor, opacity: 0.55,
      transform: `rotate(${rot}deg)` }} />
  );
};

const Confete: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const cores = ["#E8604C", "#F2B134", "#5FBF6A", "#4FA9D8", "#D96BB0"];
  const x = rnd(i) * 1920;
  const y = ((rnd(i + 2) * 1200 + frame * (0.7 + rnd(i + 5))) % 1200) - 60;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 9, height: 14,
      background: cores[i % cores.length], opacity: 0.7, borderRadius: 2,
      transform: `rotate(${frame * 2 + i * 40}deg)` }} />
  );
};

const Passaro: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const x = ((rnd(i + 20) * 2200 - frame * (1.6 + rnd(i) * 1.2)) % 2200 + 2200) % 2200 - 140;
  const y = 90 + rnd(i + 31) * 320 + Math.sin((frame + i * 20) / 18) * 12;
  const flap = Math.sin((frame + i * 12) / 4) * 7;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 30, height: 18,
      opacity: 0.65 }}>
      <div style={{ position: "absolute", left: 0, top: 6 + flap, width: 18, height: 3,
        background: "#3A2A1E", borderRadius: 3, transform: "rotate(-18deg)" }} />
      <div style={{ position: "absolute", left: 14, top: 6 - flap, width: 18, height: 3,
        background: "#3A2A1E", borderRadius: 3, transform: "rotate(18deg)" }} />
    </div>
  );
};

const Brilho: React.FC<{ i: number; frame: number; cor?: string }> = ({ i, frame, cor }) => {
  const x = rnd(i + 41) * 1920;
  const y = rnd(i + 53) * 1080;
  const pulso = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin((frame + i * 17) / 9));
  const tam = 6 + rnd(i + 61) * 10;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: tam, height: tam,
      background: cor ?? "#FFF3B0", borderRadius: "50%", opacity: pulso,
      boxShadow: `0 0 ${tam * 2}px ${cor ?? "#FFE27A"}` }} />
  );
};

const Vento: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
  const y = rnd(i + 70) * 1080;
  const x = ((rnd(i + 80) * 2300 - frame * (5 + rnd(i) * 4)) % 2300 + 2300) % 2300 - 200;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 180, height: 2,
      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
      transform: "rotate(-6deg)" }} />
  );
};

export const FundosVivos: React.FC<Props> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scalaW = width / 1920;
  const scalaH = height / 1080;
  if (!overlay || overlay === "nenhum") return null;

  const folhas = ["folhas", "passarinhos-folhas", "folhas-luz", "folhas-sol"].includes(overlay);
  const confete = overlay === "confete";
  const passaros = overlay === "passarinhos-folhas";
  const vento = overlay === "vento";
  const brilhos = ["luzinhas", "brilhos", "folhas-luz", "nuvens-brilho"].includes(overlay);
  const sol = overlay === "folhas-sol";
  const bolinhas = overlay === "bolinhas";

  return (
    <AbsoluteFill style={{ pointerEvents: "none", transform: `scale(${scalaW}, ${scalaH})`,
      transformOrigin: "0 0", width: 1920, height: 1080 }}>
      {sol && <div style={{ position: "absolute", left: 1380, top: 80, width: 420, height: 420,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(255,225,150,0.55), transparent 70%)" }} />}
      {Array.from({ length: 18 }, (_, i) => (
        <React.Fragment key={i}>
          {folhas && <Folha i={i} frame={frame} cor={i % 3 === 0 ? "#D98B32" : "#5FA844"} />}
          {confete && <Confete i={i} frame={frame} />}
          {passaros && i < 5 && <Passaro i={i} frame={frame} />}
          {vento && <Vento i={i} frame={frame} />}
          {brilhos && <Brilho i={i} frame={frame} />}
          {bolinhas && (() => {
            const x = rnd(i + 90) * 1920;
            const y = 1080 - ((rnd(i + 99) * 1000 + frame * (0.8 + rnd(i) * 0.6)) % 1100);
            return <div key={i} style={{ position: "absolute", left: x, top: y,
              width: 14, height: 14, borderRadius: "50%", background: "#F5C63C",
              opacity: 0.7, border: "2px solid #E0A520" }} />;
          })()}
        </React.Fragment>
      ))}
    </AbsoluteFill>
  );
};
