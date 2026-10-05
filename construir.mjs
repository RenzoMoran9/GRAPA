/**
 * Arma Grapa.html: un solo archivo con todo dentro (interfaz, programa y
 * librerías) para repartir por correo, USB o carpeta compartida.
 *
 *   node construir.mjs                 → Grapa.html, al lado de index.html
 *   node construir.mjs /otra/Grapa.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const leer = (r) => readFileSync(RAIZ + r, 'utf8');

const CREDITOS = `<!--
  Pdflash · Taller de PDF
  Une, ordena, divide, folia y firma PDF. Todo ocurre dentro de este
  navegador: no hay servidor y no necesita conexión a internet.

  Este archivo es autosuficiente: lleva dentro las librerías que usa.
    · pdf-lib 1.17.1 — MIT — https://github.com/Hopding/pdf-lib
    · PDF.js 3.11.174 — Apache-2.0 — https://github.com/mozilla/pdf.js
    · JSZip 3.10.1 — MIT / GPLv3 — https://github.com/Stuk/jszip
    · docx-preview 0.4.0 — Apache-2.0 — https://github.com/VolodymyrBaydalka/docxjs
    · SheetJS 0.18.5 — Apache-2.0 — https://github.com/SheetJS/sheetjs
    · html2canvas 1.4.1 — MIT — https://github.com/niklasvh/html2canvas
    · Inter 4 — SIL OFL 1.1 — https://github.com/rsms/inter
    · tesseract-wasm 0.11 (Tesseract OCR y Leptonica) — BSD-2-Clause / Apache-2.0 — https://github.com/robertknight/tesseract-wasm
    · Modelo de idioma español «tessdata_fast» — Apache-2.0 — https://github.com/tesseract-ocr/tessdata_fast
-->
`;

const GUIONES = [
  'lib/pdf-lib.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/jszip.min.js',
  'lib/docx-preview.min.js', 'lib/xlsx.core.min.js', 'lib/html2canvas.min.js',
  'assets/core.js', 'assets/buscar.js', 'assets/revisar.js', 'assets/ocr.js', 'assets/ofertas.js', 'assets/cuadro.js', 'assets/expedientes.js', 'assets/firmas.js', 'assets/office.js',
  'assets/app.js',
];

const html = leer('index.html');
const cuerpo = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/\n\s*<script src="[^"]+"><\/script>/g, '')
  .trim();

// Inter va dentro del archivo, como las demás librerías: así Grapa.html se ve igual sin internet
const interBase64 = readFileSync(RAIZ + 'assets/inter-latin.woff2').toString('base64');
const css = leer('assets/styles.css')
    .replace('url("inter-latin.woff2")', `url("data:font/woff2;base64,${interBase64}")`) +
  '\n/* la envoltura del visor limita las imágenes; los sellos se miden solos */\n' +
  '.sello-mini{max-width:none}\n';

const partes = [CREDITOS + '<title>Pdflash</title>', '<style>\n' + css + '\n</style>', cuerpo];
for (const ruta of GUIONES) {
  let js = leer(ruta);
  if (/<\/script/i.test(js)) throw new Error('cierre de script dentro de ' + ruta);
  // pdf-lib lleva el carácter de reemplazo literal dentro de cadenas
  js = js.replaceAll('�', '\\ufffd');
  partes.push(`<!-- ${ruta} -->\n<script>\n${js}\n</script>`);
}

// El lector de texto para escaneos (Tesseract) va dentro, comprimido, para que Grapa.html lo
// tenga sin internet. Ocupa unos 2,7 MB y no se toca hasta que se pide leer un escaneo.
const OCR = { lib: 'tesseract-wasm.js', worker: 'tesseract-worker.js', wasm: 'tesseract-core.wasm', modelo: 'spa.traineddata' };
for (const [id, archivo] of Object.entries(OCR)) {
  const gz = gzipSync(readFileSync(RAIZ + 'lib/ocr/' + archivo), { level: 9 }).toString('base64');
  partes.push(`<script type="text/plain" id="ocr-${id}">${gz}</script>`);
}

const doc = partes.join('\n\n') + '\n';
if (doc.includes('�')) throw new Error('quedaron caracteres de reemplazo sin escapar');
// sin argumento queda al lado de index.html; las pruebas lo piden en otra carpeta
const destino = process.argv[2] || RAIZ + 'Grapa.html';
writeFileSync(destino, doc);
console.log('Grapa.html listo ·', Math.round(doc.length / 1024), 'KB');
