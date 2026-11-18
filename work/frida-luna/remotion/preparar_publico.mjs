// preparar_publico.mjs - coloca os assets do episodio dentro de public/ (staticFile).
//
// Uso:
//   node gerar_timeline.mjs && node preparar_publico.mjs   (ou npm run preparar)
//
// O que faz (idempotente, pode correr outra vez a qualquer momento):
//   public/bg/flow/*.png             <- bg/flow/*.png (11 fundos aprovados)
//   public/chars/poses-v3/*/*.png    <- 8 expressoes com alfa de cada personagem
//   public/movimentos/<quem>         <- JUNCAO para movimentos/<quem> (ciclos novos
//                                       aparecem sem copiar; se mklink falhar, copia)
//   public/audio/{voz,musica}.wav    <- audio original
//   public/timeline.json             <- timeline.json gerado
//
// Nao apaga nada: ficheiros antigos de public/ (sprites/, poses/) sao ignorados.

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const PUBLICO = join(AQUI, "public");

const garante = (p) => mkdirSync(p, { recursive: true });
const copiarPasta = (origem, destino) => {
  garante(destino);
  let n = 0;
  for (const entrada of readdirSync(origem, { withFileTypes: true })) {
    const o = join(origem, entrada.name);
    const d = join(destino, entrada.name);
    if (entrada.isDirectory()) n += copiarPasta(o, d);
    else if (entrada.isFile()) {
      copyFileSync(o, d);
      n += 1;
    }
  }
  return n;
};

garante(PUBLICO);

// 1) fundos aprovados (um por cena)
const origemBg = join(RAIZ, "bg", "flow");
const destinoBg = join(PUBLICO, "bg", "flow"); // o contrato usa "bg/flow/<cena>.png"
garante(destinoBg);
let fundos = 0;
if (existsSync(origemBg)) {
  for (const f of readdirSync(origemBg).filter((x) => /\.png$/i.test(x) && !x.startsWith("_"))) {
    copyFileSync(join(origemBg, f), join(destinoBg, f));
    fundos += 1;
  }
}
console.log(`bg/flow/*.png            ${fundos} fundos`);

// 2) poses estaticas com alfa (fallback quando o movimento nao existe)
let poses = 0;
for (const quem of ["frida", "luna"]) {
  const origem = join(RAIZ, "chars", "poses-v3", quem);
  const destino = join(PUBLICO, "chars", "poses-v3", quem);
  garante(destino);
  if (!existsSync(origem)) {
    console.warn(`!! poses em falta: ${origem}`);
    continue;
  }
  for (const f of readdirSync(origem).filter((x) => /\.png$/i.test(x))) {
    copyFileSync(join(origem, f), join(destino, f));
    poses += 1;
  }
}
console.log(`chars/poses-v3/*/*.png   ${poses} poses`);

// 3) ciclos de movimento: jun cao por personagem, para novos ciclos aparecerem sozinhos
for (const quem of ["frida", "luna"]) {
  const origem = join(RAIZ, "movimentos", quem);
  const destino = join(PUBLICO, "movimentos", quem);
  garante(join(PUBLICO, "movimentos"));
  if (!existsSync(origem)) {
    console.warn(`!! movimentos em falta: ${origem}`);
    continue;
  }
  if (existsSync(destino)) {
    let ligado = false;
    try {
      ligado = statSync(destino).isDirectory();
    } catch {
      ligado = false;
    }
    if (ligado) {
      console.log(`public/movimentos/${quem} ja ligado`);
      continue;
    }
  }
  try {
    execSync(`cmd /c mklink /J "${destino}" "${origem}"`, { stdio: "ignore" });
    console.log(`public/movimentos/${quem} juncao -> movimentos/${quem}`);
  } catch {
    const n = copiarPasta(origem, destino);
    console.log(`public/movimentos/${quem} copiado (${n} ficheiros; mklink indisponivel)`);
  }
}

// 4) audio original
const origemAudio = join(RAIZ, "audio");
garante(join(PUBLICO, "audio"));
let audios = 0;
for (const nome of ["voz.wav", "musica.wav"]) {
  const o = join(origemAudio, nome);
  if (existsSync(o)) {
    copyFileSync(o, join(PUBLICO, "audio", nome));
    audios += 1;
  } else {
    console.warn(`!! audio em falta: ${o}`);
  }
}
console.log(`audio/*.wav              ${audios} ficheiros`);

// 5) timeline gerado (so cai para o exemplo se ainda nao tiver sido gerado)
const gerado = join(AQUI, "timeline.json");
const alvo = join(PUBLICO, "timeline.json");
if (existsSync(gerado)) {
  copyFileSync(gerado, alvo);
  console.log("timeline.json            copiado do gerador");
} else {
  copyFileSync(join(AQUI, "timeline.example.json"), alvo);
  console.log("timeline.json            copiado do exemplo (corre npm run gerar!)");
}
