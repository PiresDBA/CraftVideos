// Shared JS scanner: masks comments/strings/templates/regex while preserving
// braces, so function blocks can be extracted reliably by brace matching.
export function maskJs(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  let mode = 'code';
  const tmplStack = [];   // brace depth inside ${ } of the current template
  const braceStack = [];  // brace depth inside the current ${ } expression

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };

  const regexAllowed = (pos) => {
    for (let k = pos - 1; k >= 0; k--) {
      const c = src[k];
      if (c === '\n') return true;
      if (c === ' ' || c === '\t' || c === '\r') continue;
      return !/[)\]}\w$'"`]/.test(c);
    }
    return true;
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    if (mode === 'code') {
      if (c === '/' && d === '/') { const s = i; while (i < n && src[i] !== '\n') i++; blank(s, i); mode = 'code'; continue; }
      if (c === '/' && d === '*') { const s = i; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; blank(s, i); continue; }
      if (c === "'") { const s = i; i++; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === "'" || src[i] === '\n') { i++; break; } i++; } blank(s, i); continue; }
      if (c === '"') { const s = i; i++; while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '"' || src[i] === '\n') { i++; break; } i++; } blank(s, i); continue; }
      if (c === '`') { const s = i; i++; tmplStack.push(0); mode = 'tmpl'; continue; }
      if (c === '/' && regexAllowed(i)) {
        // regex literal
        const s = i; i++; let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          else if (src[i] === '\n') break;
          i++;
        }
        while (i < n && /[gimsuy]/.test(src[i])) i++;
        blank(s, i);
        continue;
      }
      i++;
      continue;
    }

    if (mode === 'tmpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; tmplStack.pop(); mode = 'code'; continue; }
      if (c === '$' && d === '{') {
        // template expression: keep its braces so depth stays right
        i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          else if (src[i] === '`') { // nested template inside the expression
            i++; const inner = [];
            while (i < n) {
              if (src[i] === '\\') { i += 2; continue; }
              if (src[i] === '`') { i++; break; }
              i++;
            }
            continue;
          } else if (src[i] === "'" || src[i] === '"') {
            const q = src[i]; i++;
            while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
            continue;
          }
          i++;
        }
        continue;
      }
      i++;
      continue;
    }
  }
  return out.join('');
}

// Extract top-level function blocks (brace matched) from a source file.
export function topLevelFunctions(src) {
  const masked = maskJs(src);
  const lines = masked.split('\n');
  const rawLines = src.split('\n');
  const blocks = [];
  let depth = 0;
  let start = null;
  let name = null;

  lines.forEach((line, i) => {
    const m = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line);
    if (depth === 0 && m) {
      start = i;
      name = m[1];
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (start !== null && depth === 0) {
      blocks.push({
        name,
        from: start,
        to: i,
        text: rawLines.slice(start, i + 1).join('\n'),
        masked: lines.slice(start, i + 1).join('\n'),
      });
      start = null;
      name = null;
    }
  });
  return blocks;
}
