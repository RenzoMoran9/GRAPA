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
