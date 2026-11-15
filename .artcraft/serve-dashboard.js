const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/work/research/dashboard/index.html';
  const filePath = path.join(root, urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('Not found: ' + filePath); return;
  }
  const ext = path.extname(filePath).toLower();
  const ct = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'}[ext] || 'application/octet-stream';
  res.writeHead(200, {'Content-Type': ct + '; charset=utf-8', 'Cache-Control': 'no-store'});
  fs.createReadStream(filePath).pipe(res);
});
server.listen(8798, '127.0.0.1', () => console.log('dashboard server on http://127.0.0.1:8798'));