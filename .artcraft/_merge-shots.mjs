import fs from 'node:fs';

const A = 'D:/CRAFT/work/reference/ref5/anatomy.json';
const F = 'D:/CRAFT/work/reference/ref5/faces.json';
const OUT = 'D:/CRAFT/work/reference/ref5/shots-merged.json';

const anatomy = JSON.parse(fs.readFileSync(A, 'utf8'));
const faces = JSON.parse(fs.readFileSync(F, 'utf8'));
const samples = faces.samples;

const med = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const r3 = (v) => (v == null ? null : Number(v.toFixed(3)));

const rows = [];
for (const shot of anatomy.shots) {
  const inShot = samples.filter((s) => s.t >= shot.start && s.t < shot.end);
  const withFace = inShot.filter((s) => s.faces.length);
  const first = withFace.map((s) => s.faces[0]);
  const faceY = med(first.map((f) => f.y));
  const faceH = med(first.map((f) => f.h));
  const faceW = med(first.map((f) => f.w));
  const faceCx = med(first.map((f) => f.x + f.w / 2));

  // A shot counts as "has presenter" when most of its samples show a face. One frame of a
  // face in a transition is not a presenter shot.
  const ratio = inShot.length ? withFace.length / inShot.length : 0;
  const hasFace = ratio >= 0.5;

  // Layout the shot actually uses.
  const paper = shot.paper;
  let layout;
  if (hasFace && faceY != null && faceY > 0.45) layout = 'split';       // graphic on top, presenter bottom
  else if (hasFace && faceY != null && faceY <= 0.45) layout = 'presenter-top';
  else if (paper > 0.4) layout = 'full-whiteboard';
  else layout = 'full-graphic';

  rows.push({
    shot: shot.index,
    start: shot.start,
    seconds: shot.seconds,
    layout,
    hasFace,
    faceRatio: r3(ratio),
    faceY: r3(faceY),          // top of the face, 0..1 of frame height
    faceH: r3(faceH),
    faceW: r3(faceW),
    faceCx: r3(faceCx),
    // where the graphic band ends = where the presenter's head begins
    splitLine: hasFace && faceY != null ? r3(faceY) : null,
    paper: shot.paper,
    dark: shot.dark,
    headlineSide: shot.headlineSide,
    headlineY: shot.headlineY,
    motion: shot.motion,
    kind: shot.kind,
  });
}

const layouts = {};
for (const r of rows) layouts[r.layout] = (layouts[r.layout] || 0) + 1;

const splits = rows.filter((r) => r.splitLine != null).map((r) => r.splitLine);
const textSides = {};
for (const r of rows) textSides[r.headlineSide] = (textSides[r.headlineSide] || 0) + 1;

const summary = {
  shots: rows.length,
  layouts,
  presenterShots: rows.filter((r) => r.hasFace).length,
  whiteboardShots: rows.filter((r) => r.layout === 'full-whiteboard').length,
  graphicOnlyShots: rows.filter((r) => r.layout === 'full-graphic').length,
  splitLineMedian: r3(med(splits)),
  splitLineMin: splits.length ? r3(Math.min(...splits)) : null,
  splitLineMax: splits.length ? r3(Math.max(...splits)) : null,
  faceHeightMedian: r3(med(rows.filter((r) => r.faceH != null).map((r) => r.faceH))),
  textSides,
  shotSeconds: {
    median: r3(med(rows.map((r) => r.seconds))),
    min: r3(Math.min(...rows.map((r) => r.seconds))),
    max: r3(Math.max(...rows.map((r) => r.seconds))),
  },
};

fs.writeFileSync(OUT, JSON.stringify({ summary, shots: rows }, null, 2) + '\n', 'utf8');

console.log('layout por shot:');
console.log('n  t     dur  layout          cara  y0   h    lado   paper');
for (const r of rows) {
  console.log(
    String(r.shot).padStart(2),
    String(r.start.toFixed(1)).padStart(5),
    String(r.seconds.toFixed(1)).padStart(4),
    r.layout.padEnd(15),
    (r.hasFace ? 'sim' : '-').padEnd(5),
    String(r.faceY == null ? '-' : Math.round(r.faceY * 100)).padStart(3),
    String(r.faceH == null ? '-' : Math.round(r.faceH * 100)).padStart(3),
    r.headlineSide.padEnd(6),
    r.paper.toFixed(2)
  );
}
console.log('');
console.log('resumo:', JSON.stringify(summary, null, 1));
