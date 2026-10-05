// Serveur de démo : sert la section avec un extrait du catalogue pour tester sans boutique.
// Lancer : npm run dev  →  http://localhost:3000
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Extrait réel du catalogue de la boutique, servi par pages comme le ferait collection.deck.liquid.
const CATALOG = require('../tests/fixtures/catalog.json');
const PAGE_SIZE = 25;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/collections/all' && url.searchParams.get('view') === 'deck') {
    const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
    const products = CATALOG.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(JSON.stringify({ pages: Math.ceil(CATALOG.length / PAGE_SIZE), products }));
  }

  if (url.pathname === '/cart/add.js' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    return req.on('end', () => {
      console.log('cart/add', body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: JSON.parse(body).items }));
    });
  }

  const file = url.pathname === '/' ? 'dev/index.html' : url.pathname.slice(1);
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT) || !fs.existsSync(full)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(full)];
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  fs.createReadStream(full).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
