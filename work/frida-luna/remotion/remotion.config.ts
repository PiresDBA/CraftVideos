// Configuracao minima do Remotion: entrada em src/index.ts, saida h264/yuv420p para
// o cartao poder ser muxado com audio e publicado (yuv420p e o que o QuickTime/Safari
// e os players do YouTube aceitam sem re-encode).
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
