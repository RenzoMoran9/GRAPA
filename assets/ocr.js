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
  };
  const ANCHO_HOJA = 2200;      // píxeles de ancho al leer una hoja entera (~265 ppp)
  const ANCHO_ZONA = 2600;      // y al leer solo un trozo, que merece más detalle

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

  // el motor lee de a una imagen: las demás esperan su turno
  let cola = Promise.resolve();
  function enCola(fn) {
    const r = cola.then(fn, fn);
    cola = r.catch(() => {});
    return r;
  }

  /* ---------- de palabras sueltas a renglones ---------- */

  /** Junta palabras (ya ordenadas) en un renglón; los huecos grandes llevan dos espacios. */
  function renglon(palabras) {
    const alto = Math.max(...palabras.map((p) => p.y1 - p.y0), 1e-6);
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
  function agruparPorAltura(palabras) {
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
      .map((f) => renglon(f.ps.sort((a, b) => a.x0 - b.x0)));
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

  /** Devuelve un lienzo nuevo: enderezado y sin rayas. */
  function prepararEscaneo(lienzo) {
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
  G.ocrLienzo = function (lienzo, alProgreso) {
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
      } finally {
        try { await cliente.clearImage(); } catch (e) { /* ya se soltó */ }
        if (imagen.close) imagen.close();
      }
    });
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
  async function lienzoGirado(pagina, extra) {
    const copia = Object.assign({}, pagina, { giro: G.norm((pagina.giro || 0) + extra) });
    return prepararEscaneo(await G.renderGrande(copia, ANCHO_HOJA));
  }

  async function leerBienOrientada(pagina, alProgreso) {
    let mejor = await G.ocrLienzo(prepararEscaneo(await G.renderGrande(pagina, ANCHO_HOJA)), alProgreso);
    let q = calidad(mejor);
    if (q >= 10) return mejor;
    // pobre: se prueba al revés y de lado, y gana la que más palabras reconocibles tenga
    const inicial = q;
    for (const grados of [180, 90, 270]) {
      const alt = await G.ocrLienzo(await lienzoGirado(pagina, grados), alProgreso);
      const qa = calidad(alt);
      if (qa > q) { mejor = alt; q = qa; mejor.girada = grados; }
    }
    if (q < 8 || q < inicial * 2) {
      // ninguna sale claramente mejor: se deja la lectura sin girar
      mejor = await G.ocrLienzo(prepararEscaneo(await G.renderGrande(pagina, ANCHO_HOJA)), alProgreso);
    }
    return mejor;
  }

  /* ---------- leer una hoja ---------- */

  const cache = new Map();
  const clave = (p) => `${p.fuenteId}:${p.indice}:${G.norm(p.giro)}:${p.enderezo || 0}`;
  G.olvidarLecturas = (fuenteIds) => {
    if (!fuenteIds) { cache.clear(); return; }
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
    return { lineas: agruparPorAltura(palabras), origen: 'texto' };
  }

  /**
   * Los renglones de una hoja. Se lee una sola vez; después sale de memoria.
   * `opciones.alProgreso(0..1)` informa de un escaneo, que es lo lento.
   */
  G.leerLineas = async function (pagina, opciones) {
    const k = clave(pagina);
    if (cache.has(k)) return cache.get(k);
    const alProgreso = opciones && opciones.alProgreso;
    const p = (async () => {
      if (await G.tieneTexto(pagina)) return leerNativa(pagina);
      return leerBienOrientada(pagina, alProgreso);
    })();
    cache.set(k, p);
    try {
      return await p;
    } catch (e) {
      cache.delete(k);
      throw e;
    }
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
