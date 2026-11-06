/**
 * Pruebas de Pdflash en un navegador de verdad (Chromium, con Playwright).
 *
 *   node pruebas/correr.mjs            → todas
 *   node pruebas/correr.mjs tableros   → solo las que tengan «tableros» en el nombre
 *
 * Hace falta Playwright, que no forma parte de Pdflash (la herramienta sigue
 * sin necesitar `npm install`). Para instalarlo, una vez:
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * Cada prueba abre Pdflash servido por servidor.mjs en una ventana limpia
 * (sin guardados ni autoguardados de antes), arma sus PDF de prueba dentro
 * del propio navegador con pdf-lib y comprueba lo que se ve y lo que queda
 * guardado. No toca nada fuera de esta carpeta.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Falta Playwright. Instálalo con:\n  npm install --no-save playwright\n  npx playwright install chromium');
  process.exit(2);
}

const PUERTO = 4300 + Math.floor(Math.random() * 500);
const URL_APP = `http://localhost:${PUERTO}/`;
const filtro = process.argv[2] || '';

/* ---------------- lo común ---------------- */

/** Un PDF de prueba con texto, armado dentro de la página con su propio pdf-lib. */
async function pdfDeTexto(page, titulo, hojas) {
  const b64 = await page.evaluate(async ({ titulo, hojas }) => {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < hojas; i++) {
      const p = doc.addPage([595.28, 841.89]);
      p.drawText(titulo, { x: 60, y: 760, size: 22, font: f });
      p.drawText(`Hoja ${i + 1} de ${hojas}`, { x: 60, y: 720, size: 14, font: f });
      for (let k = 0; k < 15; k++) p.drawText('Texto de prueba del expediente ' + k, { x: 60, y: 660 - k * 22, size: 11, font: f });
    }
    const bytes = await doc.save();
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, { titulo, hojas });
  return { name: titulo + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(b64, 'base64') };
}

async function esperarCarga(page) {
  await page.waitForFunction(() => document.querySelector('#cargando').hidden);
  await page.waitForTimeout(150);
}

/** Abre archivos con el botón de siempre (la entrada de archivos). */
async function abrir(page, ...nombresYHojas) {
  const archivos = [];
  for (const [t, n] of nombresYHojas) archivos.push(await pdfDeTexto(page, t, n));
  await page.setInputFiles('#entradaArchivos', archivos);
  await esperarCarga(page);
}

/** Suelta un PDF sobre el elemento n.º «n» del selector (negativo: desde el final), a un lado. */
async function soltar(page, selector, n, archivo, lado) {
  await page.evaluate(({ selector, n, b64, nombre, lado }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], nombre, { type: 'application/pdf' }));
    const todos = document.querySelectorAll(selector);
    const el = todos[n < 0 ? todos.length + n : n];
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: lado === 'izq' ? r.left + 4 : r.right - 4, clientY: r.top + r.height / 2 }));
  }, { selector, n, b64: archivo.buffer.toString('base64'), nombre: archivo.name, lado });
  await page.waitForTimeout(250);
  await esperarCarga(page);
}

async function guardarCon(page, nombre) {
  await page.keyboard.press('Control+Shift+S');
  await page.waitForSelector('#modalTexto:not([hidden])');
  await page.fill('#textoValor', nombre);
  await page.click('#textoSi');
  await page.waitForFunction(() => document.querySelector('#cargando').hidden);
  await page.waitForTimeout(250);
}

const orden = (page) => page.evaluate(() => {
  const E = window.Grapa.estado;
  return E.paginas.map((p) => (E.fuentes.get(p.fuenteId) || {}).nombre + '#' + (p.indice + 1));
});
const titulo = (page) => page.textContent('#tituloTablero');
const chip = (page) => page.evaluate(() => document.querySelector('#chipEstado').textContent.trim());
const pestanas = (page) => page.$$eval('.tablero', (t) => t.map((x) => x.className));

function afirmar(cond, mensaje, detalle) {
  if (!cond) throw new Error(mensaje + (detalle !== undefined ? ' · obtenido: ' + JSON.stringify(detalle) : ''));
}

/** Un expediente escaneado: cada hoja es una imagen, sin texto de verdad. */
async function pdfEscaneado(page) {
    const b64 = await page.evaluate(async () => {
      const { PDFDocument } = window.PDFLib;
      const doc = await PDFDocument.create();
      const titulos = ['FORMATO N° 1', 'COTIZACIÓN', 'FORMATO N° 5', 'INFORME TÉCNICO'];
      for (const t of titulos) {
        const c = document.createElement('canvas');
        c.width = 1240; c.height = 1754;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#000'; g.font = 'bold 64px Arial'; g.textAlign = 'center';
        g.fillText(t, 620, 220);
        g.font = '34px Arial'; g.textAlign = 'left';
        for (let k = 0; k < 18; k++) g.fillText('Texto de la hoja escaneada para la prueba ' + (k + 1), 120, 380 + k * 60);
        const png = await new Promise((r) => c.toBlob(r, 'image/png'));
        const img = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
        doc.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }
      const bytes = await doc.save();
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    return { name: 'escaneado.pdf', mimeType: 'application/pdf', buffer: Buffer.from(b64, 'base64') };
  }

/* ---------------- las pruebas ---------------- */
const PRUEBAS = {
  async 'cargar: el segundo documento enciende la vista de paquetes, el tercero respeta la elegida'({ page }) {
    await abrir(page, ['Expediente', 3]);
    afirmar(await page.$$eval('#rejilla .pag', (x) => x.length) === 3, 'se ven 3 hojas');
    await abrir(page, ['Cotizacion A', 2]);
    afirmar(await page.$$eval('#rejilla .pag.paquete', (x) => x.length) === 2, 'con el segundo, vista de paquetes');
    await page.click('#segVista [data-vista="hojas"]');
    await abrir(page, ['Cotizacion B', 1]);
    afirmar(await page.$$eval('#rejilla .grupo-cab', (x) => x.length) === 3, 'sigue en hojas, con 3 cabeceras');
  },

  async 'soltar un PDF entre dos hojas lo deja justo ahí'({ page }) {
    await abrir(page, ['Base', 4]);
    await soltar(page, '#rejilla .pag', 1, await pdfDeTexto(page, 'Anexo', 1), 'der');
    const o = await orden(page);
    afirmar(o[2] === 'Anexo#1', 'el anexo va tercero', o);
  },

  async 'Ctrl+Z escribiendo en un campo no toca las hojas'({ page }) {
    await abrir(page, ['Base', 3]);
    await page.click('[data-va="salida"]');
    await page.fill('#metaTitulo', 'algo');
    await page.focus('#metaTitulo');
    await page.keyboard.press('Control+z');
    afirmar((await orden(page)).length === 3, 'siguen las 3 hojas');
  },

  async 'deshacer tras borrar todo recupera el expediente guardado'({ page }) {
    await abrir(page, ['Base', 3]);
    await guardarCon(page, 'Exp A');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    afirmar((await orden(page)).length === 0, 'quedó vacío');
    await page.keyboard.press('Control+z');
    afirmar(await titulo(page) === 'Exp A', 'vuelve «Exp A»', await titulo(page));
    afirmar(await chip(page) === 'Guardado', 'y sigue guardado', await chip(page));
  },

  async 'tableros: hasta 10, Alt+0 y la lista de todos'({ page }) {
    for (let i = 1; i <= 10; i++) {
      if (i > 1) await page.click('#btnTableroNuevo');
      await abrir(page, ['Doc ' + i, 1]);
    }
    afirmar((await pestanas(page)).length === 10, '10 pestañas');
    afirmar(await page.isHidden('#btnTableroNuevo'), 'ya no deja abrir otro');
    await page.keyboard.press('Alt+0');
    afirmar((await titulo(page)) === 'Doc 10', 'Alt+0 va al décimo', await titulo(page));
    await page.click('#btnTodosTableros');
    afirmar(await page.$$eval('.tt-tarjeta', (x) => x.length) === 10, '10 tarjetas');
    await page.click('.tt-tarjeta:nth-child(4)');
    afirmar((await titulo(page)) === 'Doc 4', 'la tarjeta lleva a su tablero');
    afirmar(await page.textContent('#sinGuardarTexto') === '10 sin guardar', 'dice cuántos faltan');
  },

  async 'cerrar un tablero sin guardar ofrece guardar'({ page }) {
    await abrir(page, ['Uno', 1]);
    await page.click('#btnTableroNuevo');
    await abrir(page, ['Dos', 1]);
    await page.click('.tablero.activo .tablero-cerrar');
    await page.waitForSelector('#modalConfirmar:not([hidden])');
    const botones = await page.$$eval('#modalConfirmar button:not([hidden])', (b) => b.map((x) => x.textContent));
    afirmar(botones.includes('Guardar y cerrar') && botones.includes('Cerrar sin guardar'), 'tres salidas', botones);
    await page.click('#confirmarSi');
    await page.waitForSelector('#modalTexto:not([hidden])');
    await page.fill('#textoValor', 'Dos guardado');
    await page.click('#textoSi');
    await page.waitForTimeout(500);
    afirmar((await pestanas(page)).length === 1, 'se cerró');
    const lista = await page.evaluate(async () => (await window.Grapa.bd.listarExpedientes()).map((r) => r.nombre));
    afirmar(lista.includes('Dos guardado'), 'y quedó guardado', lista);
  },

  async 'autoguardado: cada ventana el suyo, y al volver solo lo de las cerradas'({ page, nueva }) {
    await abrir(page, ['Ventana A', 2]);
    const otra = await nueva();
    await abrir(otra, ['Ventana B', 1]);
    await page.waitForTimeout(3200);
    const autos = await page.evaluate(async () => (await window.Grapa.bd.listarAutoguardados()).map((r) => r.resumen).sort());
    afirmar(JSON.stringify(autos) === JSON.stringify(['Ventana A', 'Ventana B']), 'dos autoguardados', autos);
    await page.reload();
    await page.waitForFunction(() => window.Grapa && window.Grapa.pintar);
    await page.waitForSelector('#restaurar:not([hidden])', { timeout: 5000 });
    const texto = await page.textContent('#restaurarTexto');
    afirmar(texto.includes('Ventana A') && !texto.includes('Ventana B'), 'ofrece solo lo de A (B sigue abierta)', texto);
  },

  async 'continuar un expediente guardado sin cambios lo deja «Guardado»'({ page }) {
    await abrir(page, ['Base', 2]);
    await guardarCon(page, 'Exp G');
    await page.waitForTimeout(3200);
    await page.reload();
    await page.waitForFunction(() => window.Grapa && window.Grapa.pintar);
    await page.waitForSelector('#restaurar:not([hidden])', { timeout: 5000 });
    await page.click('#btnRestaurar');
    await page.waitForTimeout(800);
    afirmar(await titulo(page) === 'Exp G' && await chip(page) === 'Guardado', 'vuelve guardado', [await titulo(page), await chip(page)]);
  },

  async 'exportar: avisa de lo que falta y el PDF lleva los folios'({ page }) {
    await abrir(page, ['Base', 3]);
    await page.click('[data-va="foliar"]');
    await page.selectOption('#folioFormato', 'Folio {n}');
    await page.click('#btnFoliarAplicar');
    await page.click('#btnGuardar');
    await page.waitForSelector('#modalConfirmar:not([hidden])');
    const msg = await page.textContent('#confirmarMensaje');
    afirmar(/firma/.test(msg) && !/foliado/.test(msg), 'avisa solo de la firma', msg);
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#confirmarSi')]);
    const ruta = await descarga.path();
    const b64 = (await import('node:fs')).readFileSync(ruta).toString('base64');
    const textos = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await window.Grapa.pdfjsLib.getDocument({ data: bin }).promise;
      const out = [];
      for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
      return out;
    }, b64);
    afirmar(textos.length === 3 && /Folio 3/.test(textos[0]) && /Folio 1/.test(textos[2]), 'folios de abajo hacia arriba', textos.map((t) => t.slice(-10)));
    const avisos = await page.$$eval('#avisos .aviso', (a) => a.map((x) => x.textContent).join(' | '));
    afirmar(/no está guardado en Pdflash/.test(avisos), 'ofrece guardar el expediente', avisos);
  },

  async 'exportar: se ve la capa de espera mientras se arma el PDF'({ page }) {
    await abrir(page, ['Largo', 30]);
    await page.evaluate(() => {
      localStorage.setItem('grapa.avisar-exportar', '0');
      window.__capa = [];
      const capa = document.querySelector('#cargando'), txt = document.querySelector('#cargandoTexto');
      const mirar = () => { if (!capa.hidden && !window.__capa.includes(txt.textContent)) window.__capa.push(txt.textContent); requestAnimationFrame(mirar); };
      requestAnimationFrame(mirar);
    });
    await Promise.all([page.waitForEvent('download'), page.click('#btnGuardar')]);
    const vistos = await page.evaluate(() => window.__capa);
    afirmar(vistos.length > 0, 'la capa llegó a verse', vistos);
    afirmar(await page.isHidden('#cargando'), 'y se quita al terminar');
  },

  async 'ruta del expediente: propone el paso siguiente'({ page }) {
    await abrir(page, ['Base', 2]);
    afirmar(await page.isVisible('#ruta'), 'se ve la ruta');
    afirmar((await page.textContent('#rutaSiguiente')).startsWith('Foliar'), 'lo siguiente es foliar');
    await page.click('#rutaSiguiente');
    await page.click('#btnFoliarAplicar');
    await page.waitForTimeout(300);
    afirmar((await page.textContent('#rutaSiguiente')).startsWith('Firmar'), 'después, firmar', await page.textContent('#rutaSiguiente'));
  },

  async 'cabeceras: soltar un PDF en la de un documento lo añade a ese'({ page }) {
    await abrir(page, ['Informe', 3]);
    await abrir(page, ['Cotizacion', 2]);
    await page.click('#segVista [data-vista="hojas"]');
    afirmar((await page.$$eval('.pag-dentro', (x) => x.map((y) => y.textContent))).join(' ') === '1/2 2/2 1/3 2/3 3/3', 'numeración dentro de cada documento');
    await soltar(page, '#rejilla .grupo-cab', -1, await pdfDeTexto(page, 'Anexo', 1), 'der');
    const o = await orden(page);
    afirmar(o[o.length - 1] === 'Anexo#1', 'el anexo cierra el Informe', o);
    afirmar((await page.$$eval('.grupo-cab', (x) => x.length)) === 2, 'sigue habiendo dos documentos');
  },

  async 'avisos: se suman y no se apilan'({ page }) {
    await abrir(page, ['A', 1]);
    await abrir(page, ['B', 2]);
    await abrir(page, ['C', 3]);
    const avisos = await page.$$eval('#avisos .aviso:not(.saliendo)', (a) => a.map((x) => x.textContent));
    afirmar(avisos.length === 1 && avisos[0].includes('6 página(s) de 3 archivo(s)'), 'un solo aviso sumado', avisos);
    await page.evaluate(() => { for (let i = 0; i < 8; i++) window.Grapa.aviso('aviso ' + i); });
    afirmar((await page.$$eval('#avisos .aviso:not(.saliendo)', (a) => a.length)) <= 4, 'como mucho cuatro');
  },

  async 'memoria: avisa al pasar el umbral'({ page }) {
    await page.evaluate(() => { window.Grapa.limitesMemoria = { aviso: 2048, fuerte: 1e9 }; });
    await abrir(page, ['Grande', 3]);
    afirmar(await page.isVisible('#estadoMemoria'), 'aparece el chip de memoria');
    const avisos = await page.$$eval('#avisos .aviso', (a) => a.map((x) => x.textContent).join(' | '));
    afirmar(/PDF abiertos/.test(avisos), 'y el aviso', avisos);
  },

  async 'base de datos: borrar un expediente no se lleva un PDF que usa otro'({ page }) {
    const r = await page.evaluate(async () => {
      const bd = window.Grapa.bd;
      const f = { id: 'fx', nombre: 'x', bytes: new Uint8Array([1, 2, 3]), paginas: [] };
      await bd.guardarExpediente({ id: 'e1', nombre: 'uno', fecha: 1, fuenteIds: ['fx'], paginas: [] }, [f]);
      await bd.guardarExpediente({ id: 'e2', nombre: 'dos', fecha: 2, fuenteIds: ['fx'], paginas: [] }, [f]);
      await bd.borrarExpediente('e1');
      const queda = (await bd.leerFuentes(['fx'])).length;
      await bd.borrarExpediente('e2');
      return [queda, (await bd.leerFuentes(['fx'])).length];
    });
    afirmar(r[0] === 1 && r[1] === 0, 'sigue mientras lo use otro y se va con el último', r);
  },

  async 'primeros pasos: recorrido guiado, ejemplo y una herramienta a la vez'({ page }) {
    // la pantalla vacía dice qué hacer
    afirmar(await page.isVisible('#vacio .vacio-pasos'), 'tres pasos en la pantalla vacía');
    // el recorrido: se salta lo que no se ve (sin hojas no hay ruta), y no deja tocar lo de atrás
    await page.evaluate(() => window.Grapa.guia.empezar());
    await page.waitForSelector('#guia:not([hidden])');
    const total = await page.$$eval('.guia-puntos i', (x) => x.length);
    afirmar(total >= 5, 'varios pasos', total);
    await page.keyboard.press('v');
    afirmar(await page.isVisible('#guia'), 'una tecla suelta no cierra el recorrido');
    await page.keyboard.press('ArrowRight');
    afirmar((await page.textContent('#guiaPaso')).startsWith('Paso 2'), 'la flecha avanza');
    for (let i = 2; i < total; i++) await page.click('#guiaSiguiente');
    afirmar((await page.textContent('#guiaSiguiente')) === 'Probar con un ejemplo', 'al final ofrece el ejemplo');
    await page.click('#guiaSiguiente');
    await page.waitForFunction(() => window.Grapa.estado.paginas.length === 6, null, { timeout: 20000 });
    afirmar(await page.isHidden('#guia'), 'el recorrido se cerró');
    // el panel enseña solo la herramienta elegida en el riel
    await page.click('.riel-btn[data-va="foliar"]');
    const abiertas = await page.$$eval('.panel-vistas .bloque', (bs) => bs.filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.bloque));
    afirmar(abiertas.length === 1 && abiertas[0] === 'foliar', 'una sola sección a la vista', abiertas);
    // y el cupo de tableros no se ve mientras sobren
    afirmar(await page.isHidden('#tablerosCupo'), 'sin «1 de 10» con un solo tablero');
  },

  async 'separar: se elige qué sacar y dice qué va a salir antes de descargar'({ page }) {
    await page.evaluate(() => window.Grapa.guia.abrirEjemplo());
    await page.waitForFunction(() => window.Grapa.estado.paginas.length === 6, null, { timeout: 20000 });
    await page.click('#btnSelNada');
    await page.click('.riel-btn[data-va="dividir"]');
    // sin hojas marcadas, explica qué hacer y no deja descargar
    afirmar((await page.textContent('#divResultado')).includes('Marca las hojas'), 'pide marcar hojas');
    afirmar(await page.isDisabled('#btnDividirHacer'), 'botón apagado sin nada que sacar');
    const casillas = await page.$$('.pag-check');
    await casillas[1].click();
    await casillas[4].click();
    await page.waitForFunction(() => document.querySelector('#divResultado').textContent.includes('2 hojas: 2, 5'));
    // partir con las tijeras: se ven siempre y el resumen cuenta las partes
    await page.click('#btnSelNada');
    await page.check('input[name="divModo"][value="cortes"]');
    afirmar(await page.evaluate(() => document.body.classList.contains('modo-cortes')), 'tijeras a la vista');
    await (await page.$$('.corte button'))[1].click();
    await (await page.$$('.corte button'))[3].click();
    await page.waitForFunction(() => document.querySelector('#divResultado').textContent.startsWith('Saldrán 3 PDF: hojas 1–2 · hojas 3–4 · hojas 5–6'));
    afirmar((await page.textContent('#txtDividirHacer')) === 'Descargar los 3 PDF', 'el botón dice cuántos');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.click('#btnDividirHacer')]);
    afirmar(/\.zip$/.test(zip.suggestedFilename()), 'varios PDF van en un ZIP', zip.suggestedFilename());
    // por números de hoja, con error en palabras si no se entiende
    await page.check('input[name="divModo"][value="rangos"]');
    await page.fill('#divRangos', 'abc');
    afirmar((await page.textContent('#divResultado')).includes('No entendí'), 'explica el error');
    await page.fill('#divRangos', '1-2, 5');
    afirmar((await page.textContent('#divResultado')) === 'Saldrán 2 PDF: hojas 1–2 · hoja 5.', 'rangos en palabras');
  },

  async 'word: un documento largo sale en hojas A4, no en una sola hoja larga'({ page }) {
    const r = await page.evaluate(async () => {
      // un .docx mínimo armado aquí: 160 párrafos, papel A4, sin saltos manuales
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const parrafos = Array.from({ length: 160 }, (_, i) => `<w:p><w:r><w:t>Párrafo ${i + 1} del informe de prueba, con texto suficiente para ocupar una línea entera del documento.</w:t></w:r></w:p>`).join('');
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
      zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
      zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${parrafos}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701"/></w:sectPr></w:body></w:document>`);
      const blob = await zip.generateAsync({ type: 'blob' });
      const archivo = new File([blob], 'largo.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const pdf = await PDFLib.PDFDocument.load(await window.Grapa.officeAPdf(archivo));
      return pdf.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
    });
    afirmar(r.length >= 3, 'varias hojas', r.length);
    afirmar(r.every(([w, h]) => w === 595 && h === 842), 'todas A4', r);
  },

  async 'ubicar formatos en escaneos: lee los títulos de las hojas escaneadas'({ page }) {
    await page.setInputFiles('#entradaArchivos', [await pdfEscaneado(page)]);
    await esperarCarga(page);
    await page.click('.riel-btn[data-va="revisar"]');
    await page.click('#btnUbicarFormatos');
    await page.waitForFunction(() => document.querySelector('#btnUbicarFormatos').textContent.startsWith('Ubicar'), null, { timeout: 240000 });
    const hallados = await page.evaluate(() => window.Grapa.estado.seleccion.size);
    afirmar(hallados >= 2, 'ubicó los formatos escaneados', { hallados, estado: await page.textContent('#formatosEstado') });
  },

  async 'ubicar formatos en escaneos: termina aunque el lector se cuelgue'({ page }) {
    // 1) un lector que nunca contesta: antes la lectura quedaba quieta para siempre
    await page.evaluate(() => {
      window.Grapa.ocrTiempos.hoja = 1500;
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, t) {
        if (m && m.tipo === 'leer') return;            // se «cuelga»: no contesta nunca
        return original.call(this, m, t);
      };
    });
    await page.setInputFiles('#entradaArchivos', [await pdfEscaneado(page)]);
    await esperarCarga(page);
    await page.click('.riel-btn[data-va="revisar"]');
    await page.click('#btnUbicarFormatos');
    await page.waitForFunction(() => document.querySelector('#btnUbicarFormatos').textContent.startsWith('Ubicar'), null, { timeout: 240000 });
    const fin = await page.textContent('#formatosEstado');
    afirmar(!/Leyendo los títulos/.test(fin), 'la lectura terminó', fin);
    // con PaddleOCR caído, lo leyó el lector de respaldo: los formatos igual salen
    const hallados = await page.evaluate(() => window.Grapa.estado.seleccion.size);
    afirmar(hallados >= 2, 'ubicó formatos con el lector de respaldo', { hallados, fin });
  },

  async 'excel: respeta el formato y «ajustar a una página»'({ page }) {
    const r = await page.evaluate(async () => {
      // un cuadro ancho como los comparativos: 30 columnas, título combinado, relleno y bordes
      const libro = new ExcelJS.Workbook();
      const h = libro.addWorksheet('Cuadro');
      h.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
      for (let c = 1; c <= 30; c++) h.getColumn(c).width = 18;
      h.mergeCells('A1:AD1');
      h.getCell('A1').value = 'CUADRO COMPARATIVO DE PRUEBA';
      h.getCell('A1').font = { bold: true, size: 16 };
      h.getCell('A1').alignment = { horizontal: 'center' };
      for (let r = 3; r <= 40; r++) {
        for (let c = 1; c <= 30; c++) {
          const celda = h.getCell(r, c);
          celda.value = r === 3 ? `Postor ${c}` : r * c;
          celda.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (r === 3) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
        }
      }
      const buf = await libro.xlsx.writeBuffer();
      const archivo = new File([buf], 'cuadro.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const bytes = await window.Grapa.officeAPdf(archivo);
      const pdf = await PDFLib.PDFDocument.load(bytes);
      // la fila de cabecera tiene que salir roja: se mira la imagen de la hoja
      const doc = await window.Grapa.pdfjsLib.getDocument({ data: bytes }).promise;
      const pag = await doc.getPage(1);
      const vp = pag.getViewport({ scale: 1 });
      const lienzo = document.createElement('canvas');
      lienzo.width = vp.width; lienzo.height = vp.height;
      await pag.render({ canvasContext: lienzo.getContext('2d'), viewport: vp }).promise;
      const datos = lienzo.getContext('2d').getImageData(0, 0, lienzo.width, lienzo.height / 3).data;
      let rojos = 0;
      for (let i = 0; i < datos.length; i += 4) if (datos[i] > 200 && datos[i + 1] < 80 && datos[i + 2] < 80) rojos++;
      return { hojas: pdf.getPageCount(), w: Math.round(pdf.getPage(0).getWidth()), h: Math.round(pdf.getPage(0).getHeight()), rojos };
    });
    afirmar(r.hojas === 1, 'cabe en una hoja, como pide el archivo', r);
    afirmar(r.w > r.h, 'horizontal', r);
    afirmar(r.rojos > 200, 'la cabecera conserva su relleno rojo', r);
  },
};

/* ---------------- el corredor ---------------- */
const srv = spawn(process.execPath, [RAIZ + 'servidor.mjs'], { env: { ...process.env, PUERTO: String(PUERTO) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
let bien = 0, mal = 0;
try {
  for (const [nombre, prueba] of Object.entries(PRUEBAS)) {
    if (filtro && !nombre.toLowerCase().includes(filtro.toLowerCase())) continue;
    // cada prueba en su propio perfil: sin guardados ni autoguardados de otra
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    // estas pruebas son del taller, sin cuentas (las de cuentas están en pruebas/cuentas.mjs)
    await ctx.route('**/assets/config.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.GRAPA_CONFIG = {};' }));
    // el recorrido de la primera vez taparía la pantalla: se da por visto (tiene su propia prueba)
    await ctx.addInitScript(() => { try { localStorage.setItem('grapa.guia.vista', '1'); } catch (e) {} });
    const errores = [];
    const nueva = async () => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errores.push(e.message));
      p.on('dialog', (d) => d.accept());
      await p.goto(URL_APP);
      await p.waitForFunction(() => window.Grapa && window.Grapa.pintar);
      await p.waitForTimeout(250);
      return p;
    };
    const t0 = Date.now();
    try {
      const page = await nueva();
      await prueba({ page, nueva });
      afirmar(!errores.length, 'sin errores en la página', errores);
      bien++;
      console.log(`  ✓ ${nombre}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      mal++;
      console.log(`  ✗ ${nombre}\n      ${String(e.message).split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
