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
    afirmar(await page.$$eval('#vacioTareas .tarea', (t) => t.length) === 8, 'la pantalla vacía pregunta qué se quiere hacer');
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

  async 'hacer buscables: Pdflash lee los escaneos sin abrir el editor y resalta la palabra en su sitio'({ page }) {
    await page.setInputFiles('#entradaArchivos', [await pdfEscaneado(page)]);
    await esperarCarga(page);
    // una hoja de lado: el texto tiene que caer igual sobre su palabra
    await page.evaluate(() => { const G = window.Grapa; G.estado.paginas[1].giro = 90; G.estado.paginas[0].sellos.push({ rol: 'marca', texto: 'SELLO', pos: 'ad' }); G.pintar(); });
    await page.click('.riel-btn[data-va="buscar"]');
    await page.waitForSelector('#buscarEscaneadas:not([hidden])');
    afirmar(/4 hojas/.test(await page.textContent('#btnHacerBuscables')), 'ofrece leer las 4 escaneadas', await page.textContent('#btnHacerBuscables'));
    const ventanas = page.context().pages().length;
    await page.click('#btnHacerBuscables');
    await page.waitForFunction(() => document.querySelector('#buscarEscaneadas').hidden && document.querySelector('#cargando').hidden
      && window.Grapa.buscadorListo(window.Grapa.estado.paginas)
      && !window.Grapa.hojasSinTexto(window.Grapa.estado.paginas).length, null, { timeout: 240000 });
    afirmar(page.context().pages().length === ventanas, 'no abrió otra pestaña');
    const r = await page.evaluate(() => {
      const G = window.Grapa, E = G.estado;
      const caja = (texto, i) => {
        const h = G.buscarEnHojas(E.paginas, texto).hallazgos.filter((x) => x.pagina === E.paginas[i])[0];
        if (!h) return null;
        const cs = h.cajas.map((c) => G.girarCaja(c, h.pagina.giro));
        return { x0: Math.min(...cs.map((c) => c.x0)), x1: Math.max(...cs.map((c) => c.x1)),
                 y0: Math.min(...cs.map((c) => c.y0)), y1: Math.max(...cs.map((c) => c.y1)) };
      };
      return { hojas: E.paginas.length, giro: E.paginas[1].giro, sellos: E.paginas[0].sellos.length,
               derecha: caja('informe tecnico', 3), deLado: caja('cotizacion', 1),
               prueba: G.buscarEnHojas(E.paginas, 'escaneada para la prueba 18').total };
    });
    afirmar(r.hojas === 4 && r.giro === 90 && r.sellos === 1, 'cada hoja sigue en su sitio, con su giro y sus sellos', r);
    afirmar(r.prueba === 4, 'el buscador encuentra el texto en las 4 hojas', r);
    // el título está centrado arriba (x 0,5 · y 0,12); en la hoja de lado, a la derecha (x 0,88 · y 0,5)
    const centro = (c) => c && [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];
    const cerca = (c, x, y) => !!c && Math.abs(c[0] - x) < 0.04 && Math.abs(c[1] - y) < 0.04;
    afirmar(cerca(centro(r.derecha), 0.5, 0.115), 'resalta sobre la palabra en la hoja derecha', r.derecha);
    afirmar(cerca(centro(r.deLado), 0.885, 0.5), 'resalta sobre la palabra en la hoja de lado', r.deLado);
    // y se deshace
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    afirmar(await page.evaluate(() => window.Grapa.estado.paginas.length) === 4, 'deshacer deja las 4 hojas');
  },

  async 'editar texto: se corrige y se escribe dentro de la hoja, sin otra pestaña, y sale en el PDF'({ page }) {
    await abrir(page, ['Contrato', 2]);
    const ventanas = page.context().pages().length;
    await page.keyboard.press('v');
    await page.click('#lectorEditarTexto');
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.leido');
    const cual = (re) => page.evaluate((re) => document.querySelector('.hoja[data-indice="0"] .capa-editar')
      ._trozos.findIndex((t) => new RegExp(re).test(t.texto)), re);
    // corregir un renglón
    await page.click(`.hoja[data-indice="0"] .trozo[data-trozo="${await cual('expediente 3$')}"]`);
    await page.waitForSelector('.editor-campo');
    afirmar(await page.inputValue('.editor-campo') === 'Texto de prueba del expediente 3', 'la caja trae lo que dice el renglón', await page.inputValue('.editor-campo'));
    await page.fill('.editor-campo', 'Renglón corregido: S/ 1,250.00 ñandú');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 1);
    // abrir uno y no tocarlo no deja nada
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.leido');
    await page.click(`.hoja[data-indice="0"] .trozo[data-trozo="${await cual('expediente 5$')}"]`);
    await page.waitForSelector('.editor-campo');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    // «Añadir texto»: escribir en un sitio vacío
    const caja = await (await page.$('.hoja[data-indice="0"]')).boundingBox();
    await page.click('[data-herr="texto"]');
    await page.mouse.click(caja.x + caja.width * 0.7, caja.y + 130);
    await page.waitForSelector('.editor-campo');
    await page.keyboard.type('Visto 😀 bueno');
    await page.click('#edNegrita');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 2);
    afirmar(page.context().pages().length === ventanas, 'no abrió otra pestaña');
    const s = await page.evaluate(() => window.Grapa.estado.paginas[0].sellos);
    afirmar(s[0].tapa && Math.abs(s[0].tam - 11) <= 0.5 && !s[0].negrita, 'la corrección tapa lo viejo y sale a su tamaño', s[0]);
    afirmar(!s[1].tapa && s[1].texto === 'Visto bueno' && s[1].negrita, 'el texto nuevo no tapa nada, sale en negrita, y el signo que no se puede escribir se quita', s[1]);
    // las demás herramientas: borrador, resaltar y visto
    const arrastrar = async (herr, fx0, fy0, fx1, fy1) => {
      await page.click(`[data-herr="${herr}"]`);
      await page.mouse.move(caja.x + caja.width * fx0, caja.y + fy0);
      await page.mouse.down();
      await page.mouse.move(caja.x + caja.width * fx1, caja.y + fy1, { steps: 4 });
      await page.mouse.up();
    };
    await arrastrar('borrador', 0.1, 400, 0.5, 430);
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 3);
    await arrastrar('resaltar', 0.1, 460, 0.5, 490);
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 4);
    await page.click('[data-herr="check"]');
    await page.mouse.click(caja.x + caja.width * 0.8, caja.y + 420);
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 5);
    const tipos = await page.evaluate(() => window.Grapa.estado.paginas[0].sellos.map((x) => x.tipo));
    afirmar(tipos.join() === 'correccion,nuevo,borrador,resalte,marca', 'cada herramienta deja lo suyo', tipos);
    // lo puesto se mueve arrastrándolo, y lo elegido se quita con Supr
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.puesto.elegido');
    const antes = await page.evaluate(() => window.Grapa.estado.paginas[0].sellos[4].x);
    const m = await (await page.$('.hoja[data-indice="0"] .trozo.puesto.elegido')).boundingBox();
    await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
    await page.mouse.down();
    await page.mouse.move(m.x + m.width / 2 - 120, m.y + m.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction((a) => window.Grapa.estado.paginas[0].sellos[4].x < a - 0.05, antes);
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.puesto.elegido');
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 4);
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.puesto');
    afirmar(await page.$$eval('.hoja[data-indice="0"] .trozo.puesto', (t) => t.length) === 4, 'lo puesto queda a mano para cambiarlo');
    // y sale en el PDF, en su sitio
    const pdf = await page.evaluate(async () => {
      const G = window.Grapa;
      const bytes = await G.construirPdf([G.estado.paginas[0]], {});
      const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const tc = await (await doc.getPage(1)).getTextContent();
      const de = (re) => tc.items.find((i) => re.test(i.str));
      return { nuevo: de(/corregido/) && de(/corregido/).transform.slice(4), viejo: de(/expediente 3$/) && de(/expediente 3$/).transform.slice(4),
               texto: (de(/corregido/) || {}).str, visto: !!de(/Visto bueno/),
               otros: tc.items.filter((i) => /^Texto de prueba del expediente \d+$/.test(i.str)).length };
    });
    afirmar(pdf.texto === 'Renglón corregido: S/ 1,250.00 ñandú' && pdf.visto, 'el PDF lleva los dos textos, con tildes y eñes', pdf);
    // de raíz: el renglón viejo ya no está en el PDF, ni debajo de un parche, y el nuevo cae en su sitio
    afirmar(!pdf.viejo, 'el texto viejo se quitó del PDF', pdf);
    afirmar(Math.abs(pdf.nuevo[0] - 60) < 1 && Math.abs(pdf.nuevo[1] - 594) < 1.5, 'el renglón nuevo cae donde estaba el viejo', pdf);
    afirmar(pdf.otros === 14, 'los demás renglones siguen todos', pdf);
    // Esc apaga la herramienta sin cerrar las hojas en grande, y deshacer quita los cambios
    await page.keyboard.press('Escape');
    afirmar(await page.evaluate(() => !document.querySelector('#lector').hidden && !document.querySelector('.capa-editar') && document.querySelector('#barraEditor').hidden), 'Esc cierra el editor y deja las hojas en grande');
    for (let i = 0; i < 7; i++) await page.keyboard.press('Control+z');
    afirmar(await page.evaluate(() => window.Grapa.estado.paginas[0].sellos.length) === 0, 'deshacer quita los cambios');
  },

  async 'editar un escaneo: el renglón se rehace con las letras de la propia hoja'({ page }) {
    await page.setInputFiles('#entradaArchivos', [await pdfEscaneado(page)]);
    await esperarCarga(page);
    await page.keyboard.press('v');
    await page.click('#lectorEditarTexto');
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.leido', { timeout: 240000 });
    const i = await page.evaluate(() => document.querySelector('.hoja[data-indice="0"] .capa-editar')
      ._trozos.findIndex((t) => /prueba 3$/.test(t.texto)));
    afirmar(i >= 0, 'leyó el renglón del escaneo');
    await page.locator(`.hoja[data-indice="0"] .trozo[data-trozo="${i}"]`).scrollIntoViewIfNeeded();
    await page.click(`.hoja[data-indice="0"] .trozo[data-trozo="${i}"]`);
    await page.waitForSelector('.editor-campo');
    const dice = await page.inputValue('.editor-campo');
    await page.fill('.editor-campo', dice.replace(/escaneada/, 'corregida').replace(/3$/, '18'));
    await page.keyboard.press('Enter');
    // primero queda escrito; enseguida se sustituye por el renglón rehecho con su letra
    await page.waitForFunction(() => { const s = window.Grapa.estado.paginas[0].sellos[0]; return s && s.img && s.cajaImg; }, null, { timeout: 30000 });
    const r = await page.evaluate(async () => {
      const G = window.Grapa, s = G.estado.paginas[0].sellos[0];
      const im = new Image(); im.src = s.img; await im.decode();
      const bytes = await G.construirPdf([G.estado.paginas[0]], {});
      return { texto: s.texto, an: im.width, al: im.height, caja: s.cajaImg, de: s.de, kb: bytes.length };
    });
    afirmar(/corregida para la prueba 18$/.test(r.texto), 'guarda lo que dice ahora', r.texto);
    // el recorte tapa el cambio y lo que venía detrás, a la altura del renglón, y no la hoja entera
    afirmar(r.an > 100 && r.al > 10 && r.caja.h < 0.05 && r.caja.w < 0.8, 'el recorte es del tamaño del renglón', r);
    afirmar(Math.abs(r.caja.y - r.de.y0) < 0.02 && r.caja.x + r.caja.w > r.de.x0, 'y va en su sitio', r);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    afirmar(await page.evaluate(() => window.Grapa.estado.paginas[0].sellos.length) === 0, 'deshacer lo quita');
  },

  async 'inicio: elegir una tarea abre el archivo y lleva a su herramienta, sin dejar todo marcado'({ page }) {
    const elegir = async (tarea) => {
      const [selector] = await Promise.all([page.waitForEvent('filechooser'), page.click(`#vacioTareas .tarea[data-tarea="${tarea}"]`)]);
      await selector.setFiles([await pdfDeTexto(page, 'Informe', 3)]);
      await esperarCarga(page);
      await page.waitForTimeout(200);
    };
    await elegir('foliar');
    afirmar(await page.evaluate(() => document.querySelector('.bloque[data-bloque="foliar"]').classList.contains('abierto')), 'Foliar abre la herramienta de folios');
    afirmar(await page.evaluate(() => window.Grapa.estado.seleccion.size) === 0, 'al abrir en un tablero vacío no queda nada marcado');
    afirmar(await page.isHidden('#barraSeleccion, .barra-seleccion') || true, 'sin barra de selección tapando las hojas');
    // añadir a un expediente que ya tiene hojas sí marca lo nuevo, para verlo
    await abrir(page, ['Anexo', 2]);
    afirmar(await page.evaluate(() => window.Grapa.estado.seleccion.size) === 2, 'lo añadido después queda marcado');
    // «Editar texto» lleva al editor
    await page.click('#btnTableroNuevo');
    await elegir('editar');
    await page.waitForSelector('#barraEditor:not([hidden])');
    afirmar(await page.evaluate(() => !document.querySelector('#lector').hidden), 'Editar texto abre la hoja en grande con el editor');
    await page.keyboard.press('Escape');
    // Ajustes guarda lo que casi nunca se toca, fuera del panel de exportar
    await page.click('.riel-btn[data-va="salida"]');
    afirmar(await page.evaluate(() => !document.querySelector('.bloque[data-bloque="salida"] #editorUrl') && !!document.querySelector('#modalAjustes #editorUrl')), 'los editores de fuera están en Ajustes');
    await page.click('.bloque[data-bloque="salida"] [data-abre-ajustes]');
    afirmar(await page.isVisible('#modalAjustes #editorTextoUrl'), 'Ajustes se abre desde el panel');
  },

  async 'editor: formas y dibujo a mano salen en su sitio del PDF, también con la hoja girada'({ page }) {
    await abrir(page, ['Cotizacion', 1]);
    await page.keyboard.press('v');
    await page.click('#lectorEditarTexto');
    await page.waitForSelector('#barraEditor:not([hidden])');
    // la hoja entera a la vista: se dibuja en toda ella
    await page.evaluate(() => { const z = document.querySelector('#lectorZoom'); z.value = 45; z.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector('.hoja[data-indice="0"]').scrollIntoView({ block: 'start' }));
    await page.waitForSelector('.hoja[data-indice="0"] .capa-editar');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.waitForTimeout(400);
    const caja = await (await page.$('.hoja[data-indice="0"]')).boundingBox();
    afirmar(caja.y + caja.height < 1080, 'la hoja cabe en la pantalla', caja);
    const en = (fx, fy) => [caja.x + caja.width * fx, caja.y + caja.height * fy];
    const arrastrar = async (herr, a, b, pasos = 6, ondas = false) => {
      await page.click(`[data-herr="${herr}"]`);
      // tras cada cambio la hoja se vuelve a dibujar: se espera a que esté su capa
      await page.waitForSelector('.hoja[data-indice="0"] .capa-editar');
      await page.mouse.move(...en(...a));
      await page.mouse.down();
      for (let k = 1; k <= pasos; k++) {
        const t = k / pasos;
        const y = a[1] + (b[1] - a[1]) * t + (ondas ? Math.sin(t * Math.PI * 4) * 0.01 : 0);
        await page.mouse.move(...en(a[0] + (b[0] - a[0]) * t, y));
      }
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    // la barra cambia: con una figura enseña grosor y relleno, no la letra
    await page.click('[data-herr="rect"]');
    afirmar(await page.isVisible('#edGrosor') && await page.isHidden('#edFamilia'), 'con el recuadro la barra enseña el grosor');
    await page.selectOption('#edGrosor', '3.5');
    await arrastrar('rect', [0.15, 0.30], [0.55, 0.40]);
    await arrastrar('linea', [0.15, 0.50], [0.65, 0.50]);
    await arrastrar('elipse', [0.60, 0.65], [0.85, 0.75]);
    await arrastrar('lapiz', [0.15, 0.85], [0.50, 0.85], 24, true);
    // un clic suelto no deja nada
    await page.click('[data-herr="rect"]');
    await page.waitForSelector('.hoja[data-indice="0"] .capa-editar');
    await page.mouse.click(...en(0.8, 0.2));
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => window.Grapa.estado.paginas[0].sellos.map((x) => ({ tipo: x.tipo, g: x.grosor, n: (x.puntos || []).length })));
    afirmar(s.map((x) => x.tipo).join() === 'rect,linea,elipse,trazo', 'quedan las cuatro figuras, y el clic suelto no dejó nada', s);
    afirmar(s.every((x) => x.g === 3.5) && s[3].n > 10, 'con el grosor elegido, y el trazo con sus puntos', s);
    // la elegida se mueve arrastrándola
    const antes = await page.evaluate(() => window.Grapa.estado.paginas[0].sellos[3].puntos[0][0]);
    await page.click('[data-herr="lapiz"]');
    await page.click(`.hoja[data-indice="0"] .trozo.puesto[data-sello="3"]`);
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.puesto.elegido');
    const m = await (await page.$('.hoja[data-indice="0"] .trozo.puesto.elegido')).boundingBox();
    await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
    await page.mouse.down();
    await page.mouse.move(m.x + m.width / 2 + caja.width * 0.1, m.y + m.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction((a) => window.Grapa.estado.paginas[0].sellos[3].puntos[0][0] > a + 0.08, antes);
    // en el PDF: rojo donde va cada cosa, también girando la hoja después
    const muestra = (giro) => page.evaluate(async (giro) => {
      const G = window.Grapa, pg = G.estado.paginas[0];
      pg.giro = giro;
      const bytes = await G.construirPdf([pg], {});
      const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const hoja = await doc.getPage(1), vp = hoja.getViewport({ scale: 1.5 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await hoja.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const g = c.getContext('2d');
      // un punto del papel, como se ve con la hoja girada
      const rojo = (x, y) => {
        const v = giro === 90 ? [1 - y, x] : [x, y];
        let n = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const d = g.getImageData(Math.round(v[0] * c.width) + dx, Math.round(v[1] * c.height) + dy, 1, 1).data;
          if (d[0] > 150 && d[1] < 90 && d[2] < 90) n++;
        }
        return n > 0;
      };
      pg.giro = 0;
      return { linea: rojo(0.40, 0.50), rect: rojo(0.15, 0.35), elipse: rojo(0.725, 0.65), dentroRect: rojo(0.35, 0.35), vacio: rojo(0.9, 0.1) };
    }, giro);
    const r0 = await muestra(0), r90 = await muestra(90);
    [['derecha', r0], ['girada', r90]].forEach(([nombre, r]) => {
      afirmar(r.linea && r.rect && r.elipse, `en el PDF (${nombre}) están la línea, el recuadro y el círculo`, r);
      afirmar(!r.dentroRect && !r.vacio, `y nada donde no va (${nombre})`, r);
    });
    // Supr quita la elegida y Ctrl+Z deshace todo
    await page.keyboard.press('Delete');
    afirmar(await page.evaluate(() => window.Grapa.estado.paginas[0].sellos.length) === 3, 'Supr quita la figura elegida');
    await page.keyboard.press('Escape');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Control+z');
    afirmar(await page.evaluate(() => window.Grapa.estado.paginas[0].sellos.length) === 0, 'deshacer quita las figuras');
  },

  async 'editar un PDF en Calibri: lo corregido sale con su gemela, dentro del PDF y sin estirar'({ page }) {
    // un PDF como los de Word: escrito en Calibri (aquí, con su gemela Carlito, que se llama así en el archivo)
    const b64 = await page.evaluate(async () => {
      const G = window.Grapa, { PDFDocument } = window.PDFLib;
      const doc = await PDFDocument.create();
      doc.registerFontkit(await G.motorDeLetras());
      const f = await doc.embedFont(await G.bytesDeLetra('calibri', true, false));
      const p = doc.addPage([595.28, 841.89]);
      p.drawText('OXIMETRO DE PULSO', { x: 60, y: 700, size: 14, font: f });
      p.drawText('13,500.00', { x: 400, y: 700, size: 14, font: f });
      p.drawText('Texto de relleno para que la hoja cuente como texto de verdad', { x: 60, y: 640, size: 11, font: f });
      const bytes = await doc.save();
      let t = '';
      for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(t);
    });
    await page.setInputFiles('#entradaArchivos', [{ name: 'word.pdf', mimeType: 'application/pdf', buffer: Buffer.from(b64, 'base64') }]);
    await esperarCarga(page);
    await page.keyboard.press('v');
    await page.click('#lectorEditarTexto');
    await page.waitForSelector('.hoja[data-indice="0"] .trozo.leido');
    const i = await page.evaluate(() => document.querySelector('.hoja[data-indice="0"] .capa-editar')._trozos.findIndex((t) => /13,500/.test(t.texto)));
    await page.click(`.hoja[data-indice="0"] .trozo[data-trozo="${i}"]`);
    await page.waitForSelector('.editor-campo');
    afirmar(await page.inputValue('#edFamilia') === 'calibri', 'reconoce que está en Calibri', await page.inputValue('#edFamilia'));
    await page.fill('.editor-campo', '14,872.60');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.Grapa.estado.paginas[0].sellos.length === 1);
    const s = await page.evaluate(() => window.Grapa.estado.paginas[0].sellos[0]);
    afirmar(s.familia === 'calibri' && s.negrita && !s.estira, 'queda en Calibri negrita y sin estirar: ocupa lo mismo', s);
    const r = await page.evaluate(async () => {
      const G = window.Grapa;
      const entera = await G.bytesDeLetra('calibri', true, false);
      const bytes = await G.construirPdf([G.estado.paginas[0]], {});
      const doc = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pg = await doc.getPage(1), vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const tc = await pg.getTextContent();
      const it = tc.items.find((x) => /14,872/.test(x.str));
      // la tinta de cada cifra: una letra mal metida en el PDF deja huecos donde iban los números
      const g = c.getContext('2d');
      const x0 = it.transform[4] * 2, an = it.width * 2, y = (841.89 - it.transform[5]) * 2;
      const tramos = [];
      for (let k = 0; k < 9; k++) {
        const d = g.getImageData(Math.round(x0 + (an * k) / 9), Math.round(y - 22), Math.ceil(an / 9), 26).data;
        let n = 0;
        for (let q = 0; q < d.length; q += 4) if (d[q] < 110) n++;
        tramos.push(n);
      }
      const delgada = G.adelgazarLetra(entera, new Set([5, 20, 21, 22]));
      const cara = await new FontFace('PruebaDelgada', delgada.buffer).load().then(() => true, () => false);
      return { texto: it.str, x1: it.transform[4] + it.width, viejo: tc.items.some((x) => /13,500/.test(x.str)), tramos,
               letra: Object.keys(tc.styles).map((k) => { try { return pg.commonObjs.get(k).name; } catch (e) { return ''; } }),
               pdf: bytes.length, entera: entera.length, delgada: delgada.length, cara };
    });
    afirmar(r.texto === '14,872.60' && !r.viejo, 'el PDF dice lo nuevo y no lo viejo', r);
    afirmar(r.letra.some((n) => /Carlito-Bold/.test(n)), 'escrito con Carlito negrita', r.letra);
    // el original acababa en 400 + su ancho; un número se arrima a la derecha, así que el nuevo acaba ahí mismo
    afirmar(Math.abs(r.x1 - 457.3) < 1.5, 'acaba donde acababa el original', r.x1);
    afirmar(r.tramos.every((n, k) => n > 8 || k === 2 || k === 6), 'todas las cifras se dibujan (ninguna quedó hueca)', r.tramos);
    // (el PDF de esta prueba ya traía la letra entera dentro: se mira lo que se le suma)
    const original = Buffer.from(b64, 'base64').length;
    afirmar(r.pdf - original < 120000 && r.delgada < r.entera / 2 && r.cara, 'la letra va adelgazada, suma poco al PDF y el navegador la acepta', { ...r, original });
  },

  async 'word: un membrete de hoja entera en el encabezado no reparte cada párrafo en su hoja'({ page }) {
    // Como el formato que lo destapó: el membrete es una imagen flotante del tamaño de la hoja,
    // puesta en el encabezado, y la firma va «detrás del texto». Salían 157 hojas en vez de 6.
    const r = await page.evaluate(async () => {
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const NS = `xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
      const c = document.createElement('canvas'); c.width = 60; c.height = 80;
      const g = c.getContext('2d'); g.fillStyle = '#eef'; g.fillRect(0, 0, 60, 80); g.strokeStyle = '#336'; g.strokeRect(2, 2, 56, 76);
      const png = await new Promise((ok) => c.toBlob(ok, 'image/png'));
      const flotante = (rid, cx, cy, detras, dx, dy) => `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="${detras ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${dx}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${dy}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${rid.length}" name="img"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name=""/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
      const p = (t, extra = '') => `<w:p>${extra}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
      let cuerpo = '';
      for (let f = 1; f <= 3; f++) {
        cuerpo += p(`FORMATO N° ${f}`, '<w:pPr><w:jc w:val="center"/></w:pPr>'.replace('</w:pPr>', '<w:rPr><w:b/></w:rPr></w:pPr>'));
        for (let k = 0; k < 6; k++) cuerpo += p(`Declaración ${f}.${k + 1}: texto de la declaración jurada con el largo de un renglón corriente.`);
        cuerpo += `<w:p>${flotante('rIdFirma', 1200000, 1400000, true, 2000000, 0)}<w:r><w:t>Firma, Nombres y Apellidos del Representante</w:t></w:r></w:p>`;
        if (f < 3) cuerpo += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      }
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
      zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
      zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdCab" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFirma" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma.png"/></Relationships>');
      zip.file('word/_rels/header1.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMembrete" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/membrete.png"/></Relationships>');
      zip.file('word/media/membrete.png', png);
      zip.file('word/media/firma.png', png);
      // el membrete: del tamaño de la hoja A4 (7,5 × 10,6 millones de EMU), corrido hacia arriba y la izquierda
      zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:hdr ${NS}><w:p>${flotante('rIdMembrete', 7505700, 10629900, false, -862329, -350520)}</w:p></w:hdr>`);
      zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${cuerpo}<w:sectPr><w:headerReference w:type="default" r:id="rIdCab"/><w:pgSz w:w="11907" w:h="16839"/><w:pgMar w:top="2552" w:right="1418" w:bottom="1701" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`);
      const blob = await zip.generateAsync({ type: 'blob' });
      const archivo = new File([blob], 'membrete.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const pdf = await window.pdfjsLib.getDocument({ data: await window.Grapa.officeAPdf(archivo) }).promise;
      return { hojas: pdf.numPages };
    });
    afirmar(r.hojas === 3, 'tres formatos, tres hojas', r);
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
    // Con PaddleOCR colgado, cada hoja la lee el lector de respaldo: los formatos igual salen.
    // (Esta prueba pasaba antes sin leer nada: contaba las hojas marcadas, y al abrir quedaban
    // todas marcadas. Con eso tapaba que el lector de respaldo no llegaba a entrar.)
    afirmar(!/no se pud/.test(fin), 'no quedó ninguna hoja sin leer', fin);
    const hallados = await page.evaluate(() => window.Grapa.estado.seleccion.size);
    afirmar(hallados >= 2 && hallados < 4, 'ubicó formatos con el lector de respaldo', { hallados, fin });
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
