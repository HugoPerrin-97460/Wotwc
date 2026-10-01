// Serveur de démo : sert la section avec un faux catalogue pour tester sans boutique.
// Lancer : npm run dev  →  http://localhost:3000
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const img = (n) => `https://placehold.co/160x223?text=${encodeURIComponent(n)}`;
let nextId = 1;
const product = (title, variants) => ({
  id: nextId++,
  title,
  url: `/products/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  image: img(title.split(' [')[0]),
  variants: variants.map(([vt, price, qty]) => ({
    id: nextId++, title: vt, price, available: qty === null || qty > 0, qty,
  })),
});

const CATALOG = [
  product('Lightning Bolt [M10]', [['Near Mint', 250, 3], ['Played', 150, 1]]),
  product('Lightning Bolt [2X2] - Foil', [['Default Title', 900, 1]]),
  product('Counterspell [MH2]', [['Default Title', 120, 2]]),
  product('Fire // Ice [MH2]', [['Default Title', 80, 0]]),
  product("Urza's Saga [MH2]", [['Default Title', 3200, null]]),
  product('Shock Troops', [['Default Title', 20, 10]]),
  product('Brainstorm [ICE]', [['Default Title', 100, 6]]),
];

const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/search' && url.searchParams.get('view') === 'deck') {
    const q = words(url.searchParams.get('q') || '');
    const products = CATALOG.filter((p) => {
      const t = words(p.title);
      return q.every((w) => t.some((tw) => tw.startsWith(w)));
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(JSON.stringify({ products }));
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
