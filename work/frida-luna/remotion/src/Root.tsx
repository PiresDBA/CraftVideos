// Root.tsx - composicao do episodio completo: 1920x1080, 30 fps, 5882 frames.
import React from "react";
import { Composition } from "remotion";
import { Episodio } from "./Episodio";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Episodio"
      component={Episodio}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={5882}
    />
  );
};
