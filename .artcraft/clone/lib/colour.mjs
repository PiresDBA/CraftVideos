/**
 * Conversao de cores entre o mundo do video (#RRGGBB) e o do ASS (&HAABBGGRR).
 *
 * Fica num modulo proprio porque duas coisas precisam dela: o writer de ASS
 * (ass.mjs) e o pintador de runs de texto (text.mjs). Antes, text.mjs recebia
 * `assColour` por injecao para nao criar um ciclo de imports — e a API ficava
 * fragil (um caller novo que esquecesse o 3.º argumento rebentava com
 * TypeError). Com um modulo partilhado, nenhum dos dois depende do outro.
 */

/** #RRGGBB -> &HAABBGGRR (o ASS guarda as cores ao contrario: BGR). */
export function assColour(hex) {
  const h = String(hex || '#FFFFFF').replace('#', '').padEnd(6, 'F');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return ('&H00' + b + g + r).toUpperCase();
}
