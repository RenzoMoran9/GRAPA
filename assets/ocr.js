/* ===========================================================
   Pdflash · leer el texto de una hoja
   Si la hoja trae texto de verdad, se usa tal cual. Si es un escaneo (una
   foto de un papel) se reconoce con Tesseract, que corre dentro del
   navegador —sin servidor y sin internet— y que se carga solo la primera
   vez que hace falta: pesa unos 4 MB y no se toca hasta entonces.

   Devuelve siempre lo mismo, venga de donde venga:
     { lineas: [{ texto, x0, y0, x1, y1, palabras: [{ t, x0, y0, x1, y1, c }] }],
       origen: 'texto' | 'ocr' }
   con las posiciones en fracciones de la hoja (0 a 1), tal como se ve.
   En «texto» los huecos grandes entre palabras van con DOS espacios: así
   se reconocen las columnas de una tabla.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});

  const ARCHIVOS = {
    lib: 'tesseract-wasm.js',
    worker: 'tesseract-worker.js',
    wasm: 'tesseract-core.wasm',
    modelo: 'spa.traineddata',
    // PaddleOCR: el lector principal. Tesseract queda de respaldo si este no arranca
    pworker: 'paddle-worker.js',
    ort: 'ort.wasm.bundle.min.mjs',
    ortwasm: 'ort-wasm-simd-threaded.wasm',
    pdet: 'paddle-det.onnx',
    prec: 'paddle-rec.onnx',
    pdic: 'paddle-dic.txt',
  };
  const ANCHO_HOJA = 2200;      // píxeles de ancho al leer una hoja entera (~265 ppp)
  const ANCHO_ZONA = 2600;      // y al leer solo un trozo, que merece más detalle
  const ANCHO_ALTA = 3400;      // la segunda pasada, para la letra chica que salió mal (tope de renderGrande: 3500)

  /* ---------- cargar el motor la primera vez ---------- */

  function deBase64(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  async function descomprimir(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  /** En Grapa.html el motor va dentro, comprimido; en la web se pide a lib/ocr/. */
  async function bytesDe(nombre) {
    const dentro = document.getElementById('ocr-' + nombre);
    if (dentro) return descomprimir(deBase64(dentro.textContent.trim()));
    let r = null;
    try { r = await fetch('lib/ocr/' + ARCHIVOS[nombre]); } catch (e) { r = null; }
    if (!r || !r.ok) {
      throw new Error('No se encontró el lector de texto. Abre Pdflash desde la web, o usa el Grapa.html completo.');
    }
    return new Uint8Array(await r.arrayBuffer());
  }

  let motor = null;
  let estadoMotor = '';
  const oyentesEstado = new Set();
  function avisarEstado(txt) {
    estadoMotor = txt;
    oyentesEstado.forEach((f) => { try { f(txt); } catch (e) { /* un oyente roto no frena al resto */ } });
  }

  function cargarMotor() {
    if (motor) return motor;
    motor = (async () => {
      avisarEstado('Preparando el lector de texto…');
      const [lib, worker, wasm, modelo] = await Promise.all(
        ['lib', 'worker', 'wasm', 'modelo'].map(bytesDe));
      const urlLib = URL.createObjectURL(new Blob([lib], { type: 'text/javascript' }));
      const mod = await import(urlLib);
      if (!mod.supportsFastBuild()) {
        throw new Error('Este navegador es muy antiguo para leer escaneos. Actualiza Chrome o Edge.');
      }
      const urlWorker = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
      const cliente = new mod.OCRClient({ workerURL: urlWorker, wasmBinary: wasm.buffer });
      await cliente.loadModel(modelo.buffer);
      avisarEstado('');
      return { cliente, banderas: mod.layoutFlags };
    })().catch((e) => { motor = null; avisarEstado(''); throw e; });
    return motor;
  }

  /** Si el motor se descompone (memoria, un error raro), se tira y se arma de nuevo en la siguiente hoja. */
  async function reiniciarMotor() {
    const anterior = motor;
    motor = null;
    try { const m = await anterior; if (m && m.cliente) await m.cliente.destroy(); } catch (e) { /* ya estaba caído */ }
  }

  /* ---------- PaddleOCR: varios lectores a la vez ----------
     Cada lector es un Worker con su propia copia de los modelos. Con varios, mientras
     uno lee una hoja otro lee la siguiente: la computadora usa más de un núcleo. */

  const paddle = { arranque: null, libres: [], todos: [], cola: [], fallo: null };
  const LECTORES = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));

  function urlDe(bytes, tipo) { return URL.createObjectURL(new Blob([bytes], { type: tipo })); }

  function arrancarPaddle() {
    if (paddle.arranque) return paddle.arranque;
    paddle.arranque = (async () => {
      if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
        throw new Error('navegador sin OffscreenCanvas');
      }
      avisarEstado('Preparando el lector de texto…');
      const nombres = ['pworker', 'ort', 'ortwasm', 'pdet', 'prec', 'pdic'];
      const b = {};
      (await Promise.all(nombres.map(bytesDe))).forEach((v, i) => { b[nombres[i]] = v; });
      // Un solo Worker con ONNX Runtime y el lector juntos: abierta con doble clic (file://),
      // la página no deja que un Worker cargue otras piezas. El «export» del motor se vuelve
      // una constante `ort` que el lector usa.
      let motor = new TextDecoder().decode(b.ort).replace(/export\s*\{([^}]*)\}\s*;?\s*$/, (m, lista) =>
        'const ort = {' + lista.split(',').map((par) => {
          const [interno, , publico] = par.trim().split(/\s+/);
          return (publico || interno) + ': ' + interno;
        }).join(', ') + '};');
      if (!/const ort = \{/.test(motor)) throw new Error('no se reconoció el motor ONNX');
      // la dirección del .wasm se calcula aunque los bytes ya vienen dados, y desde un Worker
      // hecho con un blob esa cuenta falla: se deja el nombre a secas, que no se usa
      motor = motor.split('new URL("ort-wasm-simd-threaded.wasm",import.meta.url).href').join('"ort-wasm-simd-threaded.wasm"');
      // y un Worker de tipo módulo no arranca desde file://: se vuelve un script común, con la
      // dirección del propio Worker en lugar de import.meta.url
      motor = 'var urlOrt = self.location.href;\n' + motor.split('import.meta.url').join('urlOrt');
      const urlWorker = urlDe(motor + '\n' + new TextDecoder().decode(b.pworker), 'text/javascript');
      const dic = new TextDecoder().decode(b.pdic);
      const uno = () => new Promise((ok, mal) => {
        const w = new Worker(urlWorker);
        w.onmessage = (e) => {
          if (e.data.tipo === 'listo') { w.onmessage = null; ok(w); }
          else { w.terminate(); mal(new Error(e.data.mensaje || 'el lector no arrancó')); }
        };
        w.onerror = (e) => { w.terminate(); mal(new Error(e.message || 'el lector no arrancó')); };
        // cada lector se lleva su copia: los bytes se clonan, no se transfieren
        w.postMessage({ tipo: 'iniciar', wasm: b.ortwasm.buffer, det: b.pdet.buffer, rec: b.prec.buffer, dic });
      });
      // el primero tiene que arrancar; los demás se suman cuando estén
      const primero = await uno();
      sumarLector(primero);
      for (let i = 1; i < LECTORES; i++) uno().then(sumarLector, (e) => console.warn('Un lector extra no arrancó', e));
      avisarEstado('');
      return true;
    })().catch((e) => {
      avisarEstado('');
      paddle.fallo = e;
      console.warn('PaddleOCR no arrancó; se usa Tesseract.', e);
      return false;
    });
    return paddle.arranque;
  }

  function sumarLector(w) {
    w.trabajo = null;
    w.onmessage = (e) => {
      const t = w.trabajo;
      w.trabajo = null;
      if (t) {
        if (e.data.tipo === 'leida') { if (G.depurarOcr) console.info('paddle', JSON.stringify(e.data.ms)); t.ok(e.data.palabras); }
        else t.mal(new Error(e.data.mensaje || 'falló la lectura'));
      }
      paddle.libres.push(w);
      repartir();
    };
    paddle.todos.push(w);
    paddle.libres.push(w);
    repartir();
  }

  function repartir() {
    while (paddle.libres.length && paddle.cola.length) {
      const w = paddle.libres.shift();
      const t = paddle.cola.shift();
      w.trabajo = t;
      w.postMessage(Object.assign({ tipo: 'leer', imagen: t.imagen }, t.opciones), [t.imagen]);
    }
  }

  async function paddleLienzo(lienzo, opciones) {
    const imagen = await createImageBitmap(lienzo);
    const palabras = await new Promise((ok, mal) => {
      paddle.cola.push({ imagen, opciones: opciones || {}, ok, mal });
      repartir();
    });
    return { lineas: agruparPorAltura(palabras), origen: 'ocr', motor: 'paddle' };
  }

  /** ¿Lee PaddleOCR? (arranca el motor si hace falta). */
  async function usaPaddle() {
    if (G.motorOcr === 'tesseract') return false;
    return arrancarPaddle();
  }
  /** Cuántas hojas conviene leer a la vez. */
  G.lectoresOcr = () => (paddle.fallo || G.motorOcr === 'tesseract' ? 1 : LECTORES);

  // el motor lee de a una imagen: las demás esperan su turno
  let cola = Promise.resolve();
  function enCola(fn) {
    const r = cola.then(fn, fn);
    cola = r.catch(() => {});
    return r;
  }

  /* ---------- dibujar las hojas para leerlas, en hilos aparte ----------
     pdf.js descomprime cada escaneo en su hilo, de a uno: con decenas de hojas eso
     es lo que más tarda. Para leer se abren otras copias del PDF, cada una con su
     propio hilo, y las hojas se reparten entre ellas. Si algo falla, se dibuja como
     siempre.                                                                    */

  const copias = new Map();     // fuenteId → Promise<[PDFDocumentProxy]>
  const COPIAS = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
  let urlHiloPdf = null;
  let turnoCopia = 0;

  async function hiloPdf() {
    if (urlHiloPdf) return urlHiloPdf;
    const dentro = document.getElementById('pdfjs-worker');
    let codigo;
    if (dentro) codigo = dentro.textContent;
    else codigo = await (await fetch(G.pdfjsLib.GlobalWorkerOptions.workerSrc)).text();
    urlHiloPdf = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
    return urlHiloPdf;
  }

  function copiasDe(fuenteId) {
    if (copias.has(fuenteId)) return copias.get(fuenteId);
    const p = (async () => {
      const fuente = G.estado.fuentes.get(fuenteId);
      const url = await hiloPdf();
      const lista = [];
      for (let i = 0; i < COPIAS; i++) {
        const worker = new G.pdfjsLib.PDFWorker({ port: new Worker(url) });
        lista.push(await G.pdfjsLib.getDocument({ data: fuente.bytes.slice(0), worker, isEvalSupported: false }).promise);
      }
      return lista;
    })();
    copias.set(fuenteId, p);
    p.catch(() => {});
    return p;
  }

  function soltarCopias(fuenteIds) {
    [...copias.keys()].forEach((id) => {
      if (fuenteIds && !fuenteIds.has(id)) return;
      const p = copias.get(id);
      copias.delete(id);
      p.then((docs) => docs.forEach((d) => { const w = d.loadingTask && d.loadingTask._worker; d.destroy(); if (w) w.destroy(); }), () => {});
    });
  }

  /** Una de las copias del PDF de la hoja, por turno (o el PDF de siempre, si no se pudo abrir). */
  G.copiaParaLeer = async function (fuenteId) {
    const fuente = G.estado.fuentes.get(fuenteId);
    if (!fuente || !fuente.bytes) return fuente && fuente.doc;
    try {
      const docs = await copiasDe(fuenteId);
      return docs[turnoCopia++ % docs.length];
    } catch (e) {
      return fuente.doc;
    }
  };
  /** Cuántas hojas conviene dibujar a la vez. */
  G.copiasParaLeer = () => COPIAS;

  /** La hoja dibujada para leerla (con su giro y su enderezado), en uno de los hilos aparte. */
  async function dibujarParaLeer(pagina, ancho) {
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    if (fuente && fuente.bytes) {
      try {
        const docs = await copiasDe(pagina.fuenteId);
        return await G.renderGrande(pagina, ancho, docs[turnoCopia++ % docs.length]);
      } catch (e) {
        console.warn('No se pudo dibujar aparte; se dibuja en la pantalla', e);
      }
    }
    return G.renderGrande(pagina, ancho);
  }

  /* ---------- de palabras sueltas a renglones ---------- */

  /**
   * Junta palabras (ya ordenadas) en un renglón; los huecos grandes llevan dos espacios.
   * Con `pegadas` (texto de un PDF) los trozos que casi se tocan son una sola palabra: un
   * PDF parte «48,000.00» en «48», «,», «0», «00.00» sin que haya espacio de por medio.
   */
  function renglon(palabras, pegadas) {
    const alto = Math.max(...palabras.map((p) => p.y1 - p.y0), 1e-6);
    if (pegadas) {
      const unidas = [];
      palabras.forEach((p) => {
        const ant = unidas[unidas.length - 1];
        if (ant && p.x0 - ant.x1 <= alto * 0.14 && p.x0 - ant.x1 >= -alto * 0.3) {
          ant.t += p.t;
          ant.x1 = Math.max(ant.x1, p.x1);
          ant.y0 = Math.min(ant.y0, p.y0); ant.y1 = Math.max(ant.y1, p.y1);
        } else unidas.push(Object.assign({}, p));
      });
      palabras = unidas;
    }
    let texto = '';
    palabras.forEach((p, i) => {
      if (i) {
        const hueco = p.x0 - palabras[i - 1].x1;
        texto += hueco > alto * 1.6 ? '  ' : ' ';
      }
      texto += p.t;
    });
    return {
      texto,
      x0: Math.min(...palabras.map((p) => p.x0)), x1: Math.max(...palabras.map((p) => p.x1)),
      y0: Math.min(...palabras.map((p) => p.y0)), y1: Math.max(...palabras.map((p) => p.y1)),
      palabras,
    };
  }

  /** Agrupa palabras por su altura: sirve cuando no se sabe qué renglón es cada una. */
  function agruparPorAltura(palabras, pegadas) {
    const orden = palabras.slice().sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    const filas = [];
    orden.forEach((p) => {
      const cy = (p.y0 + p.y1) / 2, h = p.y1 - p.y0;
      const fila = filas.find((f) => Math.abs(f.cy - cy) < Math.max(f.h, h) * 0.55);
      if (fila) {
        fila.ps.push(p);
        fila.cy = fila.ps.reduce((s, q) => s + (q.y0 + q.y1) / 2, 0) / fila.ps.length;
        fila.h = Math.max(fila.h, h);
      } else filas.push({ cy, h, ps: [p] });
    });
    return filas
      .sort((a, b) => a.cy - b.cy)
      .map((f) => renglon(f.ps.sort((a, b) => a.x0 - b.x0), pegadas));
  }

  /* ---------- preparar el escaneo ----------
     Tesseract lee mal las tablas con rayas: la raya se le pega a la letra y
     los renglones se le mezclan. Antes de leer, la hoja se endereza y se le
     borran las rayas largas (las de los cuadros y los subrayados), que no
     son texto. Lo demás no se toca.                                       */

  function grises(lienzo) {
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
    const g = new Uint8Array(lienzo.width * lienzo.height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
    return g;
  }

  /** El tono que separa tinta de papel (Otsu). */
  function umbralOtsu(g) {
    const h = new Uint32Array(256);
    for (let i = 0; i < g.length; i += 3) h[g[i]]++;
    let total = 0, suma = 0;
    for (let t = 0; t < 256; t++) { total += h[t]; suma += t * h[t]; }
    let sb = 0, wb = 0, mejor = 0, umbral = 128;
    for (let t = 0; t < 256; t++) {
      wb += h[t];
      if (!wb) continue;
      const wf = total - wb;
      if (!wf) break;
      sb += t * h[t];
      const mb = sb / wb, mf = (suma - sb) / wf;
      const v = wb * wf * (mb - mf) * (mb - mf);
      if (v > mejor) { mejor = v; umbral = t; }
    }
    // un papel gris no es tinta: el listón nunca pasa de lo claro
    return Math.min(Math.max(umbral, 90), 190);
  }

  /** Cuántos grados está torcida la hoja (−4 a 4), por dónde se alinean los renglones. */
  function torcidaDe(g, W, H) {
    const f = 4, w = Math.floor(W / f), h = Math.floor(H / f);
    const umbral = umbralOtsu(g);
    const px = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx += 2) {
          const v = g[(y * f + dy) * W + x * f + dx];
          if (v < m) m = v;
        }
        if (m < umbral) px.push(x, y);
      }
    }
    if (px.length < 400) return 0;
    const cx = w / 2, cy = h / 2;
    const nitidez = (grados) => {
      const r = (grados * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
      const fila = new Float64Array(h * 2);
      for (let i = 0; i < px.length; i += 2) {
        const y = Math.round((px[i + 1] - cy) * c + (px[i] - cx) * s + cy + h / 2);
        if (y >= 0 && y < fila.length) fila[y]++;
      }
      let q = 0;
      for (let i = 0; i < fila.length; i++) q += fila[i] * fila[i];
      return q;
    };
    let mejor = 0, mq = nitidez(0);
    for (let a = -4; a <= 4.001; a += 0.25) {
      const q = nitidez(a);
      if (q > mq * 1.02) { mq = q; mejor = a; }
    }
    // afinar alrededor del mejor
    for (let a = mejor - 0.25; a <= mejor + 0.251; a += 0.05) {
      const q = nitidez(a);
      if (q > mq) { mq = q; mejor = a; }
    }
    return Math.abs(mejor) < 0.15 ? 0 : mejor;
  }

  /** Marca las rayas largas (horizontales o verticales) como «para borrar». */
  function rayasDe(g, W, H, umbral) {
    const borrar = new Uint8Array(W * H);
    // largas de verdad: una palabra en negrita desenfocada también hace una raya corta
    const largoH = Math.round(W * 0.15), largoV = Math.round(H * 0.03), hueco = 3;
    const oscuro = (i) => g[i] < umbral;
    for (let y = 0; y < H; y++) {
      let ini = -1, fin = -1, falta = 0;
      for (let x = 0; x <= W; x++) {
        const t = x < W && oscuro(y * W + x);
        if (t) { if (ini < 0) ini = x; fin = x; falta = 0; }
        else if (ini >= 0 && (x === W || ++falta > hueco)) {
          if (fin - ini >= largoH) for (let k = ini; k <= fin; k++) borrar[y * W + k] = 1;
          ini = -1; falta = 0;
        }
      }
    }
    for (let x = 0; x < W; x++) {
      let ini = -1, fin = -1, falta = 0;
      for (let y = 0; y <= H; y++) {
        const t = y < H && oscuro(y * W + x);
        if (t) { if (ini < 0) ini = y; fin = y; falta = 0; }
        else if (ini >= 0 && (y === H || ++falta > hueco)) {
          if (fin - ini >= largoV) for (let k = ini; k <= fin; k++) borrar[k * W + x] = 1;
          ini = -1; falta = 0;
        }
      }
    }
    return borrar;
  }

  /** Devuelve un lienzo nuevo: enderezado y sin rayas (con `soloEnderezar`, con sus rayas). */
  function prepararEscaneo(lienzo, soloEnderezar) {
    const W = lienzo.width, H = lienzo.height;
    let g = grises(lienzo);
    const grados = torcidaDe(g, W, H);
    let fuente = lienzo;
    if (grados) {
      const r = document.createElement('canvas');
      r.width = W; r.height = H;
      const c = r.getContext('2d', { willReadFrequently: true });
      c.fillStyle = '#fff';
      c.fillRect(0, 0, W, H);
      c.imageSmoothingQuality = 'high';
      c.translate(W / 2, H / 2);
      c.rotate((grados * Math.PI) / 180);
      c.drawImage(lienzo, -W / 2, -H / 2);
      fuente = r;
      g = grises(r);
    }
    // PaddleOCR separa bien la letra de la raya: a él solo le hace falta la hoja derecha
    if (soloEnderezar) return fuente;
    const umbral = umbralOtsu(g);
    const borrar = rayasDe(g, W, H, umbral);
    // la raya tiene un borde gris: se borran también dos puntos a cada lado
    const salida = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let b = borrar[i];
        if (!b && g[i] < 225) {
          for (let d = 1; d <= 2 && !b; d++) {
            b = (x >= d && borrar[i - d]) || (x < W - d && borrar[i + d]) ||
                (y >= d && borrar[i - d * W]) || (y < H - d && borrar[i + d * W]);
          }
        }
        const v = b ? 255 : g[i];
        salida[i * 4] = salida[i * 4 + 1] = salida[i * 4 + 2] = v;
        salida[i * 4 + 3] = 255;
      }
    }
    const limpio = document.createElement('canvas');
    limpio.width = W; limpio.height = H;
    limpio.getContext('2d').putImageData(new ImageData(salida, W, H), 0, 0);
    if (fuente !== lienzo) { fuente.width = fuente.height = 0; }
    return limpio;
  }
  G.prepararEscaneo = prepararEscaneo;

  /* ---------- leer una imagen (escaneo) ---------- */

  /**
   * Reconoce el texto de un lienzo. Las posiciones salen en fracciones del
   * lienzo. `alProgreso(0..1)` se llama mientras trabaja.
   */
  function tesseractLienzo(lienzo, alProgreso) {
    return enCola(async () => {
      const { cliente } = await cargarMotor();
      const W = lienzo.width, H = lienzo.height;
      const imagen = await createImageBitmap(lienzo);
      try {
        await cliente.loadImage(imagen);
        const cajas = await cliente.getTextBoxes('word', alProgreso);
        const palabras = cajas
          .filter((c) => String(c.text || '').trim())
          .map((c) => ({
            t: String(c.text).trim(),
            x0: c.rect.left / W, y0: c.rect.top / H, x1: c.rect.right / W, y1: c.rect.bottom / H,
            c: c.confidence,
          }));
        return { lineas: agruparPorAltura(palabras), origen: 'ocr' };
      } catch (e) {
        console.error('Fallo el lector de texto; se reinicia', e);
        reiniciarMotor();
        throw e;
      } finally {
        try { await cliente.clearImage(); } catch (e) { /* ya se soltó */ }
        if (imagen.close) imagen.close();
      }
    });
  }

  /** Lee un lienzo con el lector que esté disponible (PaddleOCR o, si no, Tesseract). */
  G.ocrLienzo = async function (lienzo, alProgreso, opciones) {
    if (await usaPaddle()) return paddleLienzo(lienzo, opciones);
    return tesseractLienzo(lienzo, alProgreso);
  };


  /* ---------- hojas escaneadas de lado o al revés ----------
     Un papel puesto al revés en el escáner se lee como basura. Si la lectura
     sale pobre se prueba a girar la hoja y se queda la que mejor sale.   */

  // palabras que salen una y otra vez en un documento en español: la basura de una hoja
  // mal orientada casi nunca las forma, y la hoja bien leída las trae por decenas
  const COMUNES = new Set(('de la el en y que por para con los del las se un una al es su sus no lo como mas este esta ' +
    'social total oferta precio plazo entrega razon ruc hospital nacional formato declaracion jurada datos postor ' +
    'senores cotizacion unidad cantidad descripcion garantia pago forma validez dias calendario soles igv incluido ' +
    'domicilio telefono correo representante legal firma sello presente atentamente lima numero').split(' '));

  /** Cuántas palabras reconocibles tiene una lectura, pesadas por lo segura que salió. */
  function calidad(lec) {
    let n = 0, palabras = 0, conf = 0;
    lec.lineas.forEach((l) => l.palabras.forEach((w) => {
      palabras++; conf += w.c;
      const t = w.t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ]/g, '');
      if (t && COMUNES.has(t)) n++;
    }));
    if (!palabras) return 0;
    // una lectura de basura puede traer algún «de» suelto, pero con poca seguridad en el conjunto
    return n * Math.pow(conf / palabras, 3);
  }

  /** La hoja de la página, con un giro de más: se vuelve a dibujar, para no perder detalle. */
  async function lienzoGirado(pagina, extra, ancho, soloEnderezar) {
    const copia = Object.assign({}, pagina, { giro: G.norm((pagina.giro || 0) + extra) });
    return prepararEscaneo(await dibujarParaLeer(copia, ancho || ANCHO_HOJA), soloEnderezar);
  }

  /* ---------- lo que Tesseract se deja sin leer ----------
     Tesseract decide qué partes de la hoja son texto, y suele saltarse la
     letra chica de una tabla con rayas o de un bloque de firma. Se buscan
     las franjas con tinta donde no se leyó ni una palabra, y cada una se
     lee por separado, agrandada: así la letra chica sí se lee.           */

  async function rellenarHuecos(lienzo, lec, alProgreso) {
    const W = lienzo.width, H = lienzo.height;
    const g = grises(lienzo);
    const umbral = umbralOtsu(g);
    const BIN = Math.max(8, Math.round(H / 200));
    const nb = Math.ceil(H / BIN);
    const tinta = new Float32Array(nb);
    for (let y = 0; y < H; y++) {
      let n = 0;
      for (let x = 0; x < W; x += 2) if (g[y * W + x] < 200) n++;
      tinta[Math.floor(y / BIN)] += n / (W / 2) / BIN;
    }
    const cubierto = new Uint8Array(nb);
    lec.lineas.forEach((l) => l.palabras.forEach((w) => {
      const b0 = Math.max(0, Math.floor((w.y0 * H) / BIN)), b1 = Math.min(nb - 1, Math.floor((w.y1 * H) / BIN));
      for (let b = b0; b <= b1; b++) cubierto[b] = 1;
    }));
    // franjas con tinta y sin palabras; un solo corte de un renglón no las separa
    const huecos = [];
    let ini = -1, ultima = -1;
    for (let b = 0; b <= nb; b++) {
      const hay = b < nb && tinta[b] > 0.0012 && !cubierto[b];
      if (hay) { if (ini < 0) ini = b; ultima = b; }
      else if (ini >= 0 && (b >= nb || b - ultima > 1)) { huecos.push([ini, ultima]); ini = -1; }
    }
    // si hay muchas, las de más tinta: las motas sueltas del escáner pesan poco
    const peso = ([b0, b1]) => { let t = 0; for (let b = b0; b <= b1; b++) t += tinta[b]; return t; };
    huecos.sort((x, y) => peso(y) - peso(x));
    huecos.length = Math.min(huecos.length, 10);
    huecos.sort((x, y) => x[0] - y[0]);
    const trozos = [];
    huecos.forEach(([b0, b1]) => {
      let ya = Math.max(0, b0 * BIN - BIN);
      const yb = Math.min(H, (b1 + 1) * BIN + BIN);
      const tope = Math.round(H * 0.16);
      while (ya < yb) {
        const fin = Math.min(yb, ya + tope);
        trozos.push([ya, fin]);
        if (fin >= yb) break;
        ya = fin - BIN;   // un poco de solape, para no partir un renglón
      }
    });
    if (G.depurarOcr) console.info('huecos', JSON.stringify(trozos), 'bin', BIN);
    if (!trozos.length) return lec;
    const nuevas = [];
    let llamadas = 0;
    // Cada renglón de cada franja, y dentro de él cada celda o frase, se lee por separado
    // y bien agrandado: así la letra chica llega a un tamaño que Tesseract sí lee.
    const hayTinta = (x, y) => g[y * W + x] < 200;
    for (const [ya, yb] of trozos) {
      // renglones: filas seguidas con tinta
      const renglones = [];
      let r0 = -1, vacias = 0;
      for (let y = ya; y <= yb; y++) {
        let n = 0;
        for (let x = 0; x < W; x += 2) if (hayTinta(x, y)) n++;
        const con = n >= 2;
        if (con) { if (r0 < 0) r0 = y; vacias = 0; }
        else if (r0 >= 0 && ++vacias > 2) { renglones.push([r0, y - vacias]); r0 = -1; vacias = 0; }
      }
      if (r0 >= 0) renglones.push([r0, yb]);
      for (const [y0, y1] of renglones) {
        const alto = y1 - y0 + 1;
        if (alto < 5 || alto > H * 0.1) continue;
        // celdas o frases: columnas con tinta, separadas por huecos anchos
        const separacion = Math.max(24, Math.round(alto * 2.2));
        const segmentos = [];
        let s0 = -1, ult = -1;
        for (let x = 0; x <= W; x++) {
          let con = false;
          if (x < W) for (let y = y0; y <= y1; y += 1) if (hayTinta(x, y)) { con = true; break; }
          if (con) { if (s0 < 0) s0 = x; ult = x; }
          else if (s0 >= 0 && (x === W || x - ult > separacion)) { segmentos.push([s0, ult]); s0 = -1; }
        }
        for (const [x0, x1] of segmentos) {
          if (x1 - x0 < 4 || llamadas >= 60) continue;
          const pr = G.ocrParam || {};
          const f = pr.f || Math.min(6, Math.max(2, Math.round(60 / alto)));
          const margen = 24;
          const an = x1 - x0 + 1;
          const c = document.createElement('canvas');
          c.width = an * f + margen * 2;
          c.height = alto * f + margen * 2;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.imageSmoothingQuality = 'high';
          ctx.filter = `contrast(${pr.contraste || 1.6})`;
          ctx.drawImage(lienzo, x0, y0, an, alto, margen, margen, an * f, alto * f);
          ctx.filter = 'none';
          llamadas++;
          const r = await tesseractLienzo(c, alProgreso);
          if (G.depurarOcr) console.info('trozo', x0, y0, an, alto, 'f=' + f, JSON.stringify(r.lineas.map((l) => l.texto)));
          r.lineas.forEach((l) => l.palabras.forEach((w) => {
            // lo recuperado se exige más: las firmas, los sellos y los logos también tienen tinta
            if (w.c < 0.6 || !/[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]{2}/.test(w.t)) return;
            nuevas.push({
              t: w.t, c: w.c,
              x0: (x0 + (w.x0 * c.width - margen) / f) / W, x1: (x0 + (w.x1 * c.width - margen) / f) / W,
              y0: (y0 + (w.y0 * c.height - margen) / f) / H, y1: (y0 + (w.y1 * c.height - margen) / f) / H,
            });
          }));
        }
      }
    }
    if (!nuevas.length) return lec;
    const todas = [];
    lec.lineas.forEach((l) => l.palabras.forEach((w) => todas.push(w)));
    const res = { lineas: agruparPorAltura(todas.concat(nuevas)), origen: 'ocr', rellenada: nuevas.length };
    if (lec.girada) res.girada = lec.girada;
    return res;
  }

  /**
   * Con PaddleOCR. Lee la hoja tal cual; si sale pobre (está de cabeza o de lado), se prueba
   * primero el giro que sugiere la tinta de la hoja (revisar.js, que es casi gratis) y luego
   * los demás, parando en cuanto uno salga bien: cada lectura de más cuesta segundos.
   */
  async function leerBienOrientadaPaddle(pagina) {
    let mejor = await G.ocrLienzo(await lienzoGirado(pagina, 0, ANCHO_HOJA, true));
    let q = calidad(mejor);
    if (q >= 10) return mejor;
    const inicial = q, original = mejor;
    const sugerido = G.revisarHoja ? await G.revisarHoja(pagina).then((r) => r.giro, () => 0) : 0;
    const orden = [sugerido].concat([180, 90, 270]).filter((g, i, a) => g && a.indexOf(g) === i);
    for (const grados of orden) {
      const alt = await G.ocrLienzo(await lienzoGirado(pagina, grados, ANCHO_HOJA, true));
      const qa = calidad(alt);
      if (qa > q) { mejor = alt; q = qa; mejor.girada = grados; }
      if (q >= 10 && q >= inicial * 2) break;
    }
    return q < 8 || q < inicial * 2 ? original : mejor;
  }

  async function leerBienOrientada(pagina, alProgreso, ancho) {
    if (await usaPaddle()) return leerBienOrientadaPaddle(pagina);
    const ancha = ancho || ANCHO_HOJA;
    let lienzo = await lienzoGirado(pagina, 0, ancha);
    let mejor = await G.ocrLienzo(lienzo, alProgreso);
    let q = calidad(mejor);
    if (q < 10) {
      // pobre: se prueba al revés y de lado, y gana la que más palabras reconocibles tenga
      const inicial = q;
      const original = { lec: mejor, lienzo };
      for (const grados of [180, 90, 270]) {
        const lz = await lienzoGirado(pagina, grados, ancha);
        const alt = await G.ocrLienzo(lz, alProgreso);
        const qa = calidad(alt);
        if (qa > q) { mejor = alt; q = qa; mejor.girada = grados; lienzo = lz; }
      }
      // ninguna sale claramente mejor: se deja la lectura sin girar
      if (q < 8 || q < inicial * 2) { mejor = original.lec; lienzo = original.lienzo; }
    }
    return rellenarHuecos(lienzo, mejor, alProgreso);
  }

  /* ---------- leer una hoja ---------- */

  const cache = new Map();
  const clave = (p) => `${p.fuenteId}:${p.indice}:${G.norm(p.giro)}:${p.enderezo || 0}`;
  G.olvidarLecturas = (fuenteIds) => {
    soltarCopias(fuenteIds ? new Set(fuenteIds) : null);
    if (!fuenteIds) { cache.clear(); cacheCabecera.clear(); return; }
    const ids = new Set(fuenteIds);
    [...cache.keys()].forEach((k) => { if (ids.has(k.split(':')[0])) cache.delete(k); });
  };

  /** Una hoja con texto de verdad: se arman los renglones con lo que trae. */
  async function leerNativa(pagina) {
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    const pag = await fuente.doc.getPage(pagina.indice + 1);
    const tc = await pag.getTextContent();
    const vp = pag.getViewport({ scale: 1, rotation: G.norm(pagina.giro) });
    const palabras = [];
    tc.items.forEach((it) => {
      const s = String(it.str || '');
      if (!s.trim()) return;
      const m = window.pdfjsLib.Util.transform(vp.transform, it.transform);
      const alto = Math.max(Math.hypot(m[2], m[3]), 1);
      palabras.push({
        t: s.trim(),
        x0: m[4] / vp.width, x1: (m[4] + it.width) / vp.width,
        y0: (m[5] - alto * 0.85) / vp.height, y1: (m[5] + alto * 0.2) / vp.height,
        c: 1,
      });
    });
    return { lineas: agruparPorAltura(palabras, true), origen: 'texto' };
  }

  /**
   * Los renglones de una hoja. Se lee una sola vez; después sale de memoria.
   * `opciones.alProgreso(0..1)` informa de un escaneo, que es lo lento.
   */
  G.leerLineas = async function (pagina, opciones) {
    const alta = !!(opciones && opciones.alta);
    const soloOcr = !!(opciones && opciones.forzarOcr);
    const k = clave(pagina) + (alta ? ':alta' : '') + (soloOcr ? ':ocr' : '');
    if (cache.has(k)) return cache.get(k);
    const alProgreso = opciones && opciones.alProgreso;
    const ocr = async () => {
      try {
        return await leerBienOrientada(pagina, alProgreso, alta ? ANCHO_ALTA : ANCHO_HOJA);
      } catch (e) {
        // un fallo del motor se reintenta una vez, con el motor nuevo
        return leerBienOrientada(pagina, alProgreso, alta ? ANCHO_ALTA : ANCHO_HOJA);
      }
    };
    const p = (async () => {
      if (!soloOcr && await G.tieneTexto(pagina)) return leerNativa(pagina);
      return ocr();
    })();
    cache.set(k, p);
    try {
      return await p;
    } catch (e) {
      cache.delete(k);
      throw e;
    }
  };


  /* ---------- solo la cabecera de la hoja ----------
     Para ubicar los Formatos hace falta leer el título de arriba de CADA hoja del
     expediente, que pueden ser decenas. Leer solo el tercio de arriba cuesta una
     fracción de leerla entera, y de un PDF con texto sale al instante.         */

  const cacheCabecera = new Map();
  G.leerCabecera = function (pagina) {
    const k = clave(pagina);
    if (cacheCabecera.has(k)) return cacheCabecera.get(k);
    const p = (async () => {
      if (await G.tieneTexto(pagina)) {
        const lec = await G.leerLineas(pagina);
        return { lineas: lec.lineas.filter((l) => l.y0 < 0.4), origen: 'texto' };
      }
      // si la hoja ya se leyó entera, se aprovecha
      if (cache.has(k)) {
        const lec = await cache.get(k);
        return { lineas: lec.lineas.filter((l) => l.y0 < 0.4), origen: 'ocr' };
      }
      // PaddleOCR lee bien un título a unos 160 ppp; Tesseract necesita más detalle
      const grande = await dibujarParaLeer(pagina, (await usaPaddle()) ? 1150 : 1800);
      const alto = Math.round(grande.height * 0.36);
      const c = document.createElement('canvas');
      c.width = grande.width; c.height = alto;
      c.getContext('2d').drawImage(grande, 0, 0, grande.width, alto, 0, 0, grande.width, alto);
      // del título basta lo corto o lo centrado: los párrafos no se leen (PaddleOCR)
      const lec = await G.ocrLienzo(c, null, { maxAncho: 0.7, soloTitulos: true });
      // las posiciones salen respecto al trozo: se pasan a la hoja entera
      const f = alto / grande.height;
      lec.lineas.forEach((l) => { l.y0 *= f; l.y1 *= f; l.palabras.forEach((w) => { w.y0 *= f; w.y1 *= f; }); });
      return { lineas: lec.lineas, origen: 'ocr' };
    })();
    cacheCabecera.set(k, p);
    p.catch(() => cacheCabecera.delete(k));
    return p;
  };

  /** ¿Ya está leída esta hoja (sin gastar tiempo en leerla)? */
  G.hojaLeida = (pagina) => cache.has(clave(pagina));

  /* ---------- leer un trozo de hoja (copiar texto con el cursor) ---------- */

  /** Une los renglones de un trozo: con saltos de línea, o todo en una línea. */
  function unir(lineas, enUnaLinea) {
    const t = lineas.map((l) => l.texto.replace(/ {2,}/g, ' ').trim()).filter(Boolean);
    return enUnaLinea ? t.join(' ') : t.join('\n');
  }
  G.unirLineas = unir;

  /**
   * El texto que cae dentro de `f` ({x, y, an, al}, fracciones de la hoja).
   * Si la hoja ya está leída se usa esa lectura; si no, se lee solo el trozo,
   * que sale mejor que recortarlo de una lectura general.
   */
  G.textoDeZona = async function (pagina, f, opciones) {
    const dentro = (p) => {
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
      return cx >= f.x && cx <= f.x + f.an && cy >= f.y && cy <= f.y + f.al;
    };
    const desdeLectura = (lec) => {
      const palabras = [];
      lec.lineas.forEach((l) => l.palabras.forEach((p) => { if (dentro(p)) palabras.push(p); }));
      return { lineas: agruparPorAltura(palabras), origen: lec.origen };
    };
    const k = clave(pagina);
    if (cache.has(k)) return desdeLectura(await cache.get(k));
    if (await G.tieneTexto(pagina)) return desdeLectura(await G.leerLineas(pagina));

    const grande = await G.renderGrande(pagina, ANCHO_ZONA);
    const sx = Math.max(0, Math.floor(f.x * grande.width)), sy = Math.max(0, Math.floor(f.y * grande.height));
    const an = Math.max(1, Math.min(grande.width - sx, Math.round(f.an * grande.width)));
    const al = Math.max(1, Math.min(grande.height - sy, Math.round(f.al * grande.height)));
    // un trozo chico se agranda: las letras muy pequeñas se leen mal
    const aumento = al < 90 ? 3 : al < 160 ? 2 : 1;
    const margen = 24;
    const lienzo = document.createElement('canvas');
    lienzo.width = an * aumento + margen * 2;
    lienzo.height = al * aumento + margen * 2;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(grande, sx, sy, an, al, margen, margen, an * aumento, al * aumento);
    return G.ocrLienzo(lienzo, opciones && opciones.alProgreso);
  };

  /** Para mostrar «Preparando el lector…» mientras se carga por primera vez. */
  G.alEstadoOcr = (fn) => { oyentesEstado.add(fn); return () => oyentesEstado.delete(fn); };
  G.estadoOcr = () => estadoMotor;
  G.prepararOcr = cargarMotor;
})();
