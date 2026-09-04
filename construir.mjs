/**
 * Arma Grapa.html: un solo archivo con todo dentro (interfaz, programa y
 * librerías) para repartir por correo, USB o carpeta compartida.
 *
 *   node construir.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const leer = (r) => readFileSync(RAIZ + r, 'utf8');

const CREDITOS = `<!--
  Grapa · Taller de PDF
  Une, ordena, divide, folia y firma PDF. Todo ocurre dentro de este
  navegador: no hay servidor y no necesita conexión a internet.

  Este archivo es autosuficiente: lleva dentro las librerías que usa.
    · pdf-lib 1.17.1 — MIT — https://github.com/Hopding/pdf-lib
    · PDF.js 3.11.174 — Apache-2.0 — https://github.com/mozilla/pdf.js
    · JSZip 3.10.1 — MIT / GPLv3 — https://github.com/Stuk/jszip
    · docx-preview 0.4.0 — Apache-2.0 — https://github.com/VolodymyrBaydalka/docxjs
    · SheetJS 0.18.5 — Apache-2.0 — https://github.com/SheetJS/sheetjs
    · html2canvas 1.4.1 — MIT — https://github.com/niklasvh/html2canvas
-->
`;

const GUIONES = [
  'lib/pdf-lib.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/jszip.min.js',
  'lib/docx-preview.min.js', 'lib/xlsx.core.min.js', 'lib/html2canvas.min.js',
  'assets/core.js', 'assets/expedientes.js', 'assets/firmas.js', 'assets/office.js',
  'assets/correo.js',
  'assets/app.js',
];

const html = leer('index.html');
const cuerpo = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/\n\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

const css = leer('assets/styles.css') +
  '\n/* la envoltura del visor limita las imágenes; los sellos se miden solos */\n' +
  '.sello-mini{max-width:none}\n';

const partes = [CREDITOS + '<title>Grapa</title>', '<style>\n' + css + '\n</style>', cuerpo];
for (const ruta of GUIONES) {
  let js = leer(ruta);
  if (/<\/script/i.test(js)) throw new Error('cierre de script dentro de ' + ruta);
  // pdf-lib lleva el carácter de reemplazo literal dentro de cadenas
  js = js.replaceAll('�', '\\ufffd');
  partes.push(`<!-- ${ruta} -->\n<script>\n${js}\n</script>`);
}

const doc = partes.join('\n\n') + '\n';
if (doc.includes('�')) throw new Error('quedaron caracteres de reemplazo sin escapar');
writeFileSync(RAIZ + 'Grapa.html', doc);
console.log('Grapa.html listo ·', Math.round(doc.length / 1024), 'KB');
