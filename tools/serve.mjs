import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

// Kořen se dá přepnout, aby stejný server obsloužil demo i sestavený web.
const ROOT = process.argv[2] ?? 'demo';

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Adresář znamená index.html — web má stránky v podsložkách.
  const path = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  const rel = normalize(path).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(process.cwd(), ROOT, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('404');
  }
});

server.listen(4321, () => console.log(`${ROOT} běží na http://localhost:4321`));
