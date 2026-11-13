/**
 * Estado real dos provedores do VoiceCraft — consulta a API, não inventa.
 * Uso: node .artcraft\voicecraft-status.mjs
 */
const base = process.argv[2] || 'http://127.0.0.1:8090';

const res = await fetch(base + '/api/providers').catch(() => null);
if (!res || !res.ok) {
  console.log('VoiceCraft offline em ' + base);
  console.log('Arranca com:  cd D:\\CRAFT\\VoiceCraft ; .\\.venv\\Scripts\\python.exe tts_service.py --port 8090');
  process.exit(1);
}

const { providers } = await res.json();
const rows = providers
  .filter((p) => p.id !== 'auto')
  .sort((a, b) => (a.naturalness_rank || 99) - (b.naturalness_rank || 99));

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log('\n  ' + pad('PROVEDOR', 14) + pad('ESTADO', 12) + pad('CHAVES', 8) + 'NOTA');
console.log('  ' + '-'.repeat(78));
for (const p of rows) {
  const ok = p.configured && p.online !== false;
  const estado = ok ? 'PRONTO' : p.configured ? 'OFFLINE' : 'PRECISA CHAVE';
  const chaves = p.keys_loaded ? String(p.keys_loaded) : ok ? '—' : '0';
  let nota = p.free_tier || '';
  if (p.reason) nota = p.reason + ' · ' + nota;
  console.log('  ' + pad(p.id, 14) + pad(estado, 12) + pad(chaves, 8) + nota.slice(0, 70));
}
console.log('\n  Ordem de naturalidade: ' + rows.map((p) => p.id).join(' > '));
console.log('  Fallback: provider=auto termina sempre no Edge (sem chave, nunca falha)\n');
