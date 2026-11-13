const fs = require('fs');
const path = require('path');
const HERE = 'D:/CRAFT/.artcraft/reference';

function shortMenu(menu) {
  if (!menu || !menu.length) return '';
  const parts = menu.map(s => String(s).replace(/ ▸ /g, ' › '));
  return ' :: [' + parts[0] + (parts.length > 1 ? ' › ' + parts.slice(1).join(' › ') : '') + ']';
}

function run(name, filterMenu) {
  const file = path.join(HERE, name);
  const raw = fs.readFileSync(file, 'utf8');
  let arr;
  if (name.endsWith('.json')) {
    arr = JSON.parse(raw);
    console.log('========================================================');
    console.log(path.basename(file).replace(/\.commands/, '') + ' — ' + arr.length + ' comandos');
    console.log('--------------------------------------------------------');
    arr.forEach((c, i) => {
      if (filterMenu && c.menu && c.menu.length && filterMenu(c.menu[0])) return;
      console.log(String(i + 1).padStart(4) + ' ' + (c.id || '—') + ' :: ' + (c.label || '') + shortMenu(c.menu));
    });
  } else {
    // commands.txt: lines starting with a word then a separator — first token is the id
    const lines = raw.split('\n');
    const ids = [];
    for (const line of lines) {
      const m = line.match(/^([a-z0-9_.-]+)\b/i);
      if (m && m[0].length >= 3) ids.push({ i: ids.length + 1, id: m[0], label: line.replace(/\s*\*?\s*.*$/, '').trim(), menu: null });
    }
    console.log('========================================================');
    console.log(path.basename(file).replace(/\.commands/, '') + ' — ' + ids.length + ' comandos (approx)');
    console.log('--------------------------------------------------------');
    ids.forEach(c => console.log(String(c.i).padStart(4) + ' ' + c.id + ' :: ' + c.label));
  }
}

run('anicraft.commands.json', m => m === 'Help' || m === 'Window');
run('vectorcraft.commands.json', m => m === 'Help' || m === 'Object' || m === 'Window');
run('filmcraft.commands.json', m => m === 'Help' || m === 'Window' || m === 'Application' || m === 'Clip');
run('craft-anything.commands.txt', () => false);
