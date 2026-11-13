import { renderKineticCard, remotionAvailable } from './yt-motion-remotion.mjs';
console.log('remotionAvailable:', remotionAvailable());
const t0 = Date.now();
const ok = await renderKineticCard({
  out: 'C:/Users/Pires/AppData/Local/Temp/opencode/modulo-teste.mp4',
  width: 1080, height: 1056, fps: 30, seconds: 3,
  words: 'AGENTES IA EXECUTAM AGORA', kicker: 'DARK · IA', fontSize: 96,
});
console.log('render:', ok, 'em', ((Date.now() - t0) / 1000).toFixed(1) + 's');
