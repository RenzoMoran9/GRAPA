/**
 * Servidor local mínimo para Grapa.
 * Uso:  node servidor.mjs   ->  http://localhost:4180
 *
 * No hace falta para usar la herramienta (basta con abrir index.html),
 * pero con servidor pdf.js usa un Worker aparte y va más fluido.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const PUERTO = Number(process.env.PUERTO || process.env.PORT || 4180);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let destino = normalize(join(RAIZ, ruta === '/' ? 'index.html' : ruta));
    if (!destino.startsWith(RAIZ)) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    const info = await stat(destino);
    if (info.isDirectory()) destino = join(destino, 'index.html');
    const datos = await readFile(destino);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(destino).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(PUERTO, () => {
  console.log(`\n  Grapa está en  http://localhost:${PUERTO}\n  (Ctrl+C para detener)\n`);
});
