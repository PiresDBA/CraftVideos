// gerar_timeline.mjs - gera remotion/timeline.json a partir dos dados do episodio.
//
// FONTES (fora desta pasta, so leitura):
//   ../DIRECAO-ARTE.md             TABELA OFICIAL: chao, alturas, x ini->fim, sombra,
//                                  "a frente" e decisao de camera por cena (A) seccoes B
//   ../animacao/plano-por-beat.json  44 beats: cena, movimento, expressao, accao
//   ../sequence-plan.json            11 cenas: from/durationInFrames
//   ../audio/tempos.json             44 segmentos: from + vozFrom/vozFrames + texto
//   ../movimentos/manifest.json      banco de ciclos (fps e ficheiros)
//   movimentos/<quem>/<nome>/*.png   ciclos ainda nao manifestados (qualquer nome/nº)
//
// Uso: node gerar_timeline.mjs  (ou npm run gerar)
// Saida: timeline.json + public/timeline.json (copia identica).
//
// Regra de ouro: os NUMEROS vem da tabela do director de arte. Nada e inventado aqui.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const ler = (p) => readFileSync(p, "utf8");
const lerJson = (p) => JSON.parse(ler(p));

const direcaoArte = ler(join(RAIZ, "DIRECAO-ARTE.md"));
const beatsPlano = lerJson(join(RAIZ, "animacao", "plano-por-beat.json"));
const cenasPlano = lerJson(join(RAIZ, "sequence-plan.json"));
const tempos = lerJson(join(RAIZ, "audio", "tempos.json"));
const manifest = lerJson(join(RAIZ, "movimentos", "manifest.json"));

const FPS = tempos.fps ?? 30;
const TOTAL = tempos.totalFrames ?? 5882;
const avisos = [];

// ---------------------------------------------------------------------------
// A) Leitura da tabela de direccao de arte (linhas "| 1 | hook | ... |")
// ---------------------------------------------------------------------------
const norm = (s) =>
  String(s ?? "")
    .replace(/→/g, "->")
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/±/g, "+-")
    .replace(/,/g, ".");

/** "620→380 (beats 16–18)" -> {base:620, porBeat:{16:380,17:380,18:380}} */
const parseAltura = (texto, beatsEmprestados = {}) => {
  const s = norm(texto);
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const base = nums[0];
  const porBeat = {};
  const m = s.match(/->\s*(\d+)\s*\(beats?\s+([\d\s-]+)\)/);
  if (m) {
    const alt = Number(m[1]);
    const ns = (m[2].match(/\d+/g) ?? []).map(Number);
    if (ns.length === 2) for (let i = ns[0]; i <= ns[1]; i += 1) porBeat[i] = alt;
    else ns.forEach((i) => (porBeat[i] = alt));
  } else if (s.includes("->") && nums.length >= 2) {
    // "446->274" sem "(beats 16-18)": herda os BEATS da coluna da Frida, mas
    // usa a altura final da propria coluna (274, nao 380).
    const altFim = nums[nums.length - 1];
    for (const i of Object.keys(beatsEmprestados)) porBeat[Number(i)] = altFim;
  }
  for (const mm of s.matchAll(/beat\s+(\d+)\s*:\s*(\d+)/g)) porBeat[Number(mm[1])] = Number(mm[2]);
  return { base, porBeat };
};

/** "1400→1500" -> {ini:1400, fim:1500}; "1450 (fixo)" -> {ini:1450, fim:1450} */
const parseX = (texto) => {
  const s = norm(texto);
  const m = s.match(/(\d+)\s*->\s*(\d+)/);
  const ini = m ? Number(m[1]) : Number((s.match(/\d+/) ?? [0])[0]);
  return { ini, fim: /fixo/i.test(s) ? ini : m ? Number(m[2]) : ini };
};

/** "300×18 @18%, −14 px em x" -> {w:300,h:18,op:0.18,dx:-14,dy:0} */
const parseSombra = (texto) => {
  const s = norm(texto);
  const m = s.match(/(\d+)\s*[xX×]\s*(\d+)\s*@\s*(\d+(?:\.\d+)?)\s*%/);
  if (!m) return { w: 260, h: 14, op: 0.2, dx: 0, dy: 0 };
  const dxdy = { dx: 0, dy: 0 };
  const d = s.match(/([+-])\s*(\d+)\s*px em ([xy])/);
  if (d) {
    const v = (d[1] === "-" ? -1 : 1) * Number(d[2]);
    if (d[3] === "x") dxdy.dx = v;
    else dxdy.dy = v;
  }
  return { w: Number(m[1]), h: Number(m[2]), op: Number(m[3]) / 100, ...dxdy };
};

/** Texto livre de camera -> {move, amount, tilt, fundoTremor, nota}. */
const parseCamera = (texto) => {
  const s = norm(texto);
  const escala = s.match(/1\.(\d+)\s*->\s*1\.(\d+)/);
  const zoom = escala ? Number(`1.${escala[2]}`) - Number(`1.${escala[1]}`) : 0;
  const pan = s.match(/pan[^,;]*?0\s*->\s*(?:-\s*)?(\d+)\s*px/);
  const tilt = s.match(/tilt[^,;]*?0\s*->\s*(?:-\s*)?(\d+)\s*px/);
  const tremor = s.match(/tremor\s*\+\s*-\s*(\d+)\s*px/);
  const sinalPan = /pan[^,;]*?0\s*->\s*-/.test(s) ? -1 : 1;
  const sinalTilt = /tilt[^,;]*?0\s*->\s*-/.test(s) ? -1 : 1;

  // Prioridade ao zoom/push-in: "push-in 1,00->1,06 + tilt 0->-90" e um push-in
  // com tilt extra, nao um tilt simples.
  let move = "none";
  let amount = 0;
  if (escala && !pan) {
    move = /zoom/.test(s) ? "zoom" : "push-in";
    amount = Number(zoom.toFixed(4));
  } else if (pan) {
    move = "pan";
    amount = sinalPan * Number(pan[1]);
  } else if (tilt) {
    move = "tilt";
    amount = sinalTilt * Number(tilt[1]);
  }
  const tiltExtra = (move === "push-in" || move === "zoom") && tilt ? sinalTilt * Number(tilt[1]) : 0;
  return {
    move,
    amount,
    tilt: tiltExtra,
    fundoTremor: tremor ? Number(tremor[1]) : 0,
    nota: String(texto),
  };
};

/** Coluna "À frente": conjunto de beats em que a Frida tem o ultimo z. */
const parseFrente = (texto) => {
  const fridaBeats = new Set();
  for (const parte of norm(texto).split(";")) {
    if (!/frida/i.test(parte)) continue;
    const nums = (parte.match(/\d+/g) ?? []).map(Number);
    if (nums.length === 2 && /-/.test(parte)) {
      for (let i = nums[0]; i <= nums[1]; i += 1) fridaBeats.add(i);
    } else nums.forEach((i) => fridaBeats.add(i));
  }
  return fridaBeats;
};

const tabela = new Map();
for (const linha of direcaoArte.split(/\r?\n/)) {
  if (!/^\|\s*\d+\s*\|/.test(linha)) continue;
  const c = linha.split("|").slice(1, -1).map((x) => x.trim());
  if (c.length < 11) continue;
  const altFrida = parseAltura(c[3]);
  tabela.set(c[1].toLowerCase(), {
    chao: Number(norm(c[2]).match(/\d+/)?.[0]),
    altFrida,
    // A coluna Luna "446->274" herda os beats da exceccao escrita na coluna Frida.
    altLuna: parseAltura(c[4], altFrida.porBeat),
    xFrida: parseX(c[5]),
    xLuna: parseX(c[6]),
    fridaFrente: parseFrente(c[7]),
    sombraFrida: parseSombra(c[8]),
    sombraLuna: parseSombra(c[9]),
    camera: parseCamera(c[10]),
  });
}
if (tabela.size !== 11) avisos.push(`tabela de direccao de arte: esperava 11 cenas, li ${tabela.size}`);

// ---------------------------------------------------------------------------
// B) Expressoes: mapa obrigatorio da direccao de arte (8 folhas, nao 12)
// ---------------------------------------------------------------------------
const EXPRESSOES = ["angry", "excited", "happy", "loved", "sad", "scared", "silly", "surprised"];
const MAPA_EXPR = {
  happy: "happy", proud: "happy", calm: "happy",
  excited: "excited", jump: "excited",
  silly: "silly", mischievous: "silly",
  loved: "loved", lovestruck: "loved",
  shy: "scared", scared: "scared", worried: "scared",
  surprised: "surprised", confused: "surprised", curious: "surprised",
  sad: "sad", sick: "sad", bored: "sad", tired: "sad",
  angry: "angry", grumpy: "angry", jealous: "angry",
};
const exprFinal = (bruto) => {
  const n = String(bruto ?? "").toLowerCase().trim();
  const alvo = MAPA_EXPR[n] ?? n;
  return EXPRESSOES.includes(alvo) ? alvo : "happy";
};

// ---------------------------------------------------------------------------
// C) Banco de movimentos (manifest + descoberta de pastas nao manifestadas)
// ---------------------------------------------------------------------------
// "giro" nao tem alias de proposito: quando o ciclo de giro entrar no banco e
// usado automaticamente; enquanto nao existe, cai para a pose estatica (regra B).
const ALIAS_MOV = {
  frida: { marcha: "marcha-flow10", corrida: "marcha-flow10" },
  luna: { marcha: "corrida", corrida: "corrida" },
};
const FPS_OMISSAO = 7.5;
const banco = {};
const ordemNatural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const resolverMovimento = (quem, bruto) => {
  const nomeBruto = String(bruto ?? "").toLowerCase().trim();
  const candidatos = [...new Set([ALIAS_MOV[quem]?.[nomeBruto], nomeBruto].filter(Boolean))];
  for (const nome of candidatos) {
    const reg = manifest?.personagens?.[quem]?.[nome];
    if (Array.isArray(reg?.ficheiros) && reg.ficheiros.length) {
      const frames = reg.ficheiros.map((f) => `movimentos/${quem}/${nome}/${f}`);
      const faltam = frames.filter((f) => !existsSync(join(RAIZ, f)));
      if (faltam.length) {
        avisos.push(`${quem}/${nome}: ${faltam.length} ficheiro(s) do manifest ausentes`);
        continue;
      }
      banco[`${quem}/${nome}`] = { fps: reg.fps ?? FPS_OMISSAO, frames };
      return { nome, fps: reg.fps ?? FPS_OMISSAO };
    }
    const pasta = join(RAIZ, "movimentos", quem, nome);
    if (existsSync(pasta)) {
      const ficheiros = readdirSync(pasta).filter((f) => /\.png$/i.test(f)).sort(ordemNatural);
      if (ficheiros.length) {
        const frames = ficheiros.map((f) => `movimentos/${quem}/${nome}/${f}`);
        banco[`${quem}/${nome}`] = { fps: FPS_OMISSAO, frames };
        return { nome, fps: FPS_OMISSAO };
      }
    }
  }
  return null; // o componente usa a pose estatica da expressao
};

// ---------------------------------------------------------------------------
// D) Fundo por cena (um PNG aprovado por cena em bg/flow/)
// ---------------------------------------------------------------------------
const fundoFinal = (nome) => {
  // O beat 1 pede "cartao de titulo, fundo creme, particulas". O PNG aprovado para
  // isso e final.png (creme com confete); hook.png e o parque inteiro e faz o vídeo
  // parecer que começa no meio da história.
  if (nome === "hook") return "bg/flow/final.png";
  for (const p of [`bg/flow/${nome}.png`, `bg/${nome}.png`]) {
    if (existsSync(join(RAIZ, p))) return p;
  }
  avisos.push(`fundo "${nome}" em falta -> bg/flow/hook.png`);
  return "bg/flow/hook.png";
};

// ---------------------------------------------------------------------------
// E) Cruzamento: cenas (sequence-plan) x tabela x beats (plano + tempos)
// ---------------------------------------------------------------------------
const porI = new Map(beatsPlano.map((b) => [b.i, b]));
const segmentos = tempos.segmentos ?? [];
// Efeitos de fundo por cena — decididos pelo sentido da cena, nao a olho.
// Todos sao desenhados por codigo (sem imagens novas) e deterministas por frame.
const OVERLAYS = {
  hook: "confete",
  abertura: "passarinhos-folhas",
  portao: "folhas",
  montanha: "vento",
  roda: "nuvens-brilho",
  carrossel: "luzinhas",
  bolinhas: "bolinhas",
  tunel: "folhas-luz",
  espelhos: "brilhos",
  moral: "folhas-sol",
  final: "confete",
};
const scenes = cenasPlano.map((c) => {
  const t = tabela.get(c.scene.toLowerCase());
  if (!t) avisos.push(`cena "${c.scene}" sem linha na tabela de direccao de arte`);
  return {
    scene: c.scene,
    overlay: OVERLAYS[c.scene] ?? "nenhum",
    from: c.from,
    durationInFrames: c.durationInFrames,
    bg: fundoFinal(c.scene),
    chao: t?.chao ?? 1000,
    camera: t?.camera ?? { move: "none", amount: 0, tilt: 0, fundoTremor: 0, nota: "" },
    sombraFrida: t?.sombraFrida,
    sombraLuna: t?.sombraLuna,
    _t: t,
    beats: [],
  };
});
const cenaPorNome = new Map(scenes.map((c) => [c.scene, c]));

const FALA_0_94 = new Set([4, 14, 22, 26]); // beats com falante designado (o outro escuta a 0,94x)

for (const seg of segmentos) {
  const plano = porI.get(seg.i) ?? {};
  const cena = cenaPorNome.get(seg.scene ?? plano.scene);
  if (!cena) {
    avisos.push(`beat ${seg.i}: cena "${seg.scene}" desconhecida`);
    continue;
  }
  const t = cena._t;
  const falante = seg.speaker ?? "narrador";

  const sprite = (quem) => {
    const brutoExpr = plano[`expr_${quem}`] ?? seg.poses?.[quem] ?? "happy";
    const brutoMov = plano[quem] ?? "escuta";
    const resolvido = resolverMovimento(quem, brutoMov);

    // x: interpolacao ini->fim da tabela ao longo da cena (passo < 8 px/frame).
    const xTabela = quem === "frida" ? t?.xFrida : t?.xLuna;
    const frac = Math.min(1, Math.max(0, (seg.from - cena.from) / Math.max(1, cena.durationInFrames)));
    let x = xTabela ? Math.round(xTabela.ini + (xTabela.fim - xTabela.ini) * frac) : 1000;
    // Quem escuta num beat de fala recua 12 px e escala 0,94x.
    const escuta = FALA_0_94.has(seg.i) && quem !== falante;
    if (escuta) x -= 12;

    // ALTURA FIXA por personagem — decisão do utilizador: a Frida e a Luna têm de manter
    // exatamente o mesmo tamanho do princípio ao fim. A tabela de direcção de arte
    // previa planos de 380/760 e um 0,94x em escuta; ambos criavam a ilusão de personagens
    // diferentes. Só a posição (x/y) e a câmara mudam, nunca a escala do sprite.
    const h = quem === "frida" ? 660 : 440;   // proporção 1,5x pedida pelo utilizador

    return {
      mov: resolvido?.nome ?? brutoMov,
      expr: exprFinal(brutoExpr),
      x,
      y: cena.chao,
      h,
      flip: false,
      sombra: quem === "frida" ? t?.sombraFrida : t?.sombraLuna,
      frente: quem === "frida" ? t?.fridaFrente?.has(seg.i) ?? false : !(t?.fridaFrente?.has(seg.i) ?? false),
    };
  };

  const from = (seg.from ?? 0) + (seg.vozFrom ?? 0);
  const dur = seg.vozFrames ?? seg.durationInFrames ?? 0;
  if (from < cena.from || from + dur > cena.from + cena.durationInFrames) {
    avisos.push(`beat ${seg.i}: voz ${from}..${from + dur} fora da cena ${cena.scene}`);
  }

  cena.beats.push({
    i: seg.i,
    from,
    durationInFrames: dur,
    frida: sprite("frida"),
    luna: sprite("luna"),
    caption: seg.text ?? "",
    speaker: falante,
    action: plano.action ?? "",
  });
}

for (const c of scenes) c.beats.sort((a, b) => a.from - b.from);

// ---------------------------------------------------------------------------
// F) Contrato final
// ---------------------------------------------------------------------------
const expressoes = {};
for (const quem of ["frida", "luna"]) {
  expressoes[quem] = Object.fromEntries(EXPRESSOES.map((e) => [e, `chars/poses-v3/${quem}/${e}.png`]));
}

const timeline = {
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: TOTAL,
  audio: "audio/voz.wav",
  musica: "audio/musica.wav",
  musicaVolume: 0.12,
  nota:
    "O Parque dos Pets. Numeros de DIRECAO-ARTE.md (tabela A + regras B). " +
    "Pes no chao de cada cena; elenco imovel com a camera; legenda so na fala. " +
    "Sem interpolacao entre desenhos; fallback para pose estatica.",
  banco,
  expressoes,
  scenes,
};

// ---------------------------------------------------------------------------
// G) Validacao (checklist C da direccao de arte)
// ---------------------------------------------------------------------------
const erros = [];
const nBeats = scenes.reduce((n, c) => n + c.beats.length, 0);
const somaCenas = scenes.reduce((n, c) => n + c.durationInFrames, 0);
if (nBeats !== 44) erros.push(`esperava 44 beats, gerou ${nBeats}`);
if (somaCenas !== TOTAL) erros.push(`cenas somam ${somaCenas}, esperava ${TOTAL}`);
for (const c of scenes) {
  const cam = c.camera;
  if (cam.move === "pan" && Math.abs(cam.amount) > 140) erros.push(`${c.scene}: pan > 140 px`);
  if (cam.move === "tilt" && Math.abs(cam.amount) > 90) erros.push(`${c.scene}: tilt > 90 px`);
  if ((cam.move === "push-in" || cam.move === "zoom") && cam.amount > 0.06) {
    erros.push(`${c.scene}: zoom > 6%`);
  }
  for (const b of c.beats) {
    // Exceccao declarada na regra B: num beat com falante designado, quem escuta
    // fica a 0,94x e a ratio 0,72 sai momentaneamente do intervalo de QA.
    if (FALA_0_94.has(b.i)) continue;
    const r = b.luna.h / b.frida.h;
    if (Math.abs(r - 0.72) > 0.03) {
      erros.push(`beat ${b.i}: hLuna/hFrida=${r.toFixed(3)} (esperado 0,720)`);
    }
  }
  if (c._t) {
    for (const [quem, xi] of [["Frida", c._t.xFrida], ["Luna", c._t.xLuna]]) {
      const passo = Math.abs(xi.fim - xi.ini) / Math.max(1, c.durationInFrames);
      if (passo > 8) erros.push(`${c.scene}: ${quem} desloca ${passo.toFixed(2)} px/frame`);
    }
  }
  delete c._t; // interno da tabela, nao vai para o contrato
}

writeFileSync(join(AQUI, "timeline.json"), JSON.stringify(timeline, null, 2), "utf8");
writeFileSync(join(AQUI, "public", "timeline.json"), JSON.stringify(timeline, null, 2), "utf8");

console.log(`timeline.json: ${scenes.length} cenas, ${nBeats} beats, ${TOTAL} frames (${(TOTAL / FPS).toFixed(2)} s)`);
console.log(`tabela DIRECAO-ARTE: ${tabela.size} cenas; ${Object.keys(banco).length} ciclos`);
console.log("cenas: " + scenes.map((c) => `${c.scene} chao=${c.chao} F${c.beats[0]?.frida.h} L${c.beats[0]?.luna.h} x${c.beats[0]?.frida.x}->${c.beats.at(-1)?.frida.x} ${c.camera.move}${c.camera.amount}`).join(" | "));
if (avisos.length) console.log(`avisos (${[...new Set(avisos)].length} unicos):\n  - ${[...new Set(avisos)].slice(0, 10).join("\n  - ")}`);
if (erros.length) {
  console.error("ERROS:\n  - " + erros.join("\n  - "));
  process.exitCode = 1;
}
