/* ===========================================================
   Grapa · núcleo: estado, carga de PDF, miniaturas y geometría
   Todo ocurre en el navegador. Ningún archivo sale del equipo.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});
  const { PDFDocument, StandardFonts, degrees, rgb, PDFRawStream,
          pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;

  /* ---------- configuración de pdf.js ---------- */
  const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  G.pdfjsLib = pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

  // Al abrir el archivo con doble clic (file://) el navegador no permite crear
  // Workers, así que cargamos el worker como script normal: pdf.js lo detecta y
  // trabaja en el hilo principal. Con servidor web usa el Worker de verdad.
  G.prepararMotor = function () {
    if (location.protocol !== 'file:') return Promise.resolve();
    if (window.pdfjsWorker) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'lib/pdf.worker.min.js';
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  };

  /* ---------- estado ---------- */
  const COLORES = ['#e0532f', '#2f6fed', '#1f9d64', '#8b5cf6', '#e0a92f', '#0ea5a5', '#d6336c', '#5c6472'];
  let contadorColor = 0;

  G.estado = {
    fuentes: new Map(),  // id -> {id, nombre, bytes, color, paginas:[{w,h,giro}]}
    paginas: [],         // {uid, fuenteId, paqueteId, indice, giro, sellos:[], corte}
    paquetes: new Map(), // id -> {id, nombre, color}  ·  lo que entró de una vez
    seleccion: new Set(),
    firmas: [],
    firmaActiva: null,
    ancla: null,
  };

  let uidSiguiente = 1;
  G.nuevoUid = () => 'p' + uidSiguiente++;

  /* ---------- utilidades ---------- */
  G.mm = (v) => (v * 72) / 25.4;
  G.norm = (r) => ((Math.round(r / 90) * 90) % 360 + 360) % 360;
  G.escapaHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  G.aColorPdf = function (hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') ;
    if (!m) return rgb(0, 0, 0);
    const n = parseInt(m[1], 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };

  /** Tamaño de la página tal como se ve, ya girada. */
  G.cajaVisible = function (W, H, R) {
    return G.norm(R) % 180 === 90 ? { w: H, h: W } : { w: W, h: H };
  };

  /**
   * Convierte un punto de la página "como se ve" (origen arriba-izquierda,
   * y hacia abajo) a coordenadas PDF sin girar (origen abajo-izquierda).
   */
  G.aPuntoPdf = function (px, py, W, H, R) {
    switch (G.norm(R)) {
      case 90:  return { x: py,     y: px };
      case 180: return { x: W - px, y: py };
      case 270: return { x: W - py, y: H - px };
      default:  return { x: px,     y: H - py };
    }
  };

  /* ---------- carga de archivos ---------- */
  G.esPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  G.esImagen = (f) => /^image\/(png|jpeg|jpg|webp)$/i.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);

  async function imagenAPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.create();
    const esPng = /png/i.test(file.type) || /\.png$/i.test(file.name);
    let img;
    try {
      img = esPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch (e) {
      // WebP u otros: pasamos por un canvas para convertir a PNG.
      const url = URL.createObjectURL(file);
      const bmp = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const c = document.createElement('canvas');
      c.width = bmp.naturalWidth; c.height = bmp.naturalHeight;
      c.getContext('2d').drawImage(bmp, 0, 0);
      URL.revokeObjectURL(url);
      const png = await new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
      img = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
    }
    const horizontal = img.width > img.height;
    const PW = horizontal ? 841.89 : 595.28;
    const PH = horizontal ? 595.28 : 841.89;
    const pag = doc.addPage([PW, PH]);
    const k = Math.min(PW / img.width, PH / img.height);
    const w = img.width * k, h = img.height * k;
    pag.drawImage(img, { x: (PW - w) / 2, y: (PH - h) / 2, width: w, height: h });
    return new Uint8Array(await doc.save());
  }

  /**
   * Añade archivos al taller. Devuelve {fuentes:[], paginas:[], errores:[]}
   */
  G.cargarArchivos = async function (files, alProgresar) {
    const nuevasFuentes = [];
    const nuevasPaginas = [];
    const errores = [];
    const lista = Array.from(files);

    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      if (alProgresar) alProgresar(`Leyendo ${file.name} (${i + 1}/${lista.length})…`);
      try {
        let bytes;
        if (G.esPdf(file)) {
          bytes = new Uint8Array(await file.arrayBuffer());
        } else if (G.esImagen(file)) {
          bytes = await imagenAPdf(file);
        } else if (G.esOffice && G.esOffice(file)) {
          // Word y Excel se convierten aquí mismo, sin salir del navegador
          bytes = await G.officeAPdf(file, alProgresar);
        } else if (G.esOfficeNoLeible && G.esOfficeNoLeible(file)) {
          errores.push(`${file.name}: ese formato de Office no se puede convertir `
            + 'aquí. Ábrelo en Office y guárdalo como PDF.');
          continue;
        } else {
          errores.push(`${file.name}: formato no admitido`);
          continue;
        }

        const doc = await pdfjsLib.getDocument({
          data: bytes.slice(0),
          isEvalSupported: false,
          disableAutoFetch: true,
        }).promise;

        // Los tamaños de página se piden por lotes en paralelo: de a una,
        // un expediente largo tardaba varios segundos en abrirse.
        const metas = new Array(doc.numPages);
        const LOTE = 16;
        for (let desde = 0; desde < doc.numPages; desde += LOTE) {
          const hasta = Math.min(doc.numPages, desde + LOTE);
          const pedidos = [];
          for (let p = desde + 1; p <= hasta; p++) pedidos.push(doc.getPage(p));
          (await Promise.all(pedidos)).forEach((pag, k) => {
            const v = pag.view; // [x0,y0,x1,y1] del CropBox
            metas[desde + k] = {
              w: Math.abs(v[2] - v[0]),
              h: Math.abs(v[3] - v[1]),
              giro: G.norm(pag.rotate || 0),
            };
          });
          if (alProgresar && doc.numPages > 40) {
            alProgresar(`Leyendo ${file.name}: ${hasta} de ${doc.numPages} páginas…`);
          }
        }

        const id = 'f' + (G.estado.fuentes.size + nuevasFuentes.length + 1) + '-' + Date.now().toString(36);
        const fuente = {
          id,
          nombre: file.name.replace(/\.[^.]+$/, ''),
          nombreCompleto: file.name,
          bytes,
          doc,
          color: COLORES[contadorColor++ % COLORES.length],
          paginas: metas,
        };
        nuevasFuentes.push(fuente);

        metas.forEach((m, idx) => {
          nuevasPaginas.push({
            uid: G.nuevoUid(),
            fuenteId: id,
            indice: idx,
            giro: m.giro,
            sellos: [],
            corte: false,
          });
        });
      } catch (e) {
        console.error(e);
        errores.push(`${file.name}: ${e && e.message ? e.message : 'no se pudo leer'}`);
      }
    }
    return { fuentes: nuevasFuentes, paginas: nuevasPaginas, errores };
  };

  /** Vuelve a poner en pie los PDF de un expediente guardado. */
  G.restaurarFuentes = async function (fuentes) {
    await G.prepararMotor();
    G.olvidarDocs();
    for (const f of fuentes) {
      const doc = await pdfjsLib.getDocument({
        data: f.bytes.slice(0),
        isEvalSupported: false,
        disableAutoFetch: true,
      }).promise;
      G.estado.fuentes.set(f.id, {
        id: f.id,
        nombre: f.nombre,
        nombreCompleto: f.nombreCompleto,
        bytes: f.bytes,
        color: f.color,
        paginas: f.paginas,
        doc,
      });
    }
  };

  /* ---------- miniaturas ---------- */
  /**
   * La miniatura se dibuja al detalle que haga falta según el zoom y la
   * densidad de la pantalla. Con un solo tamaño fijo, al ampliar las hojas
   * el texto se veía como una mancha: era un bitmap pequeño estirado.
   */
  G.NIVELES_MINI = [300, 620, 1000, 1500, 2100, 2900];

  G.nivelPara = function (anchoCSS) {
    const necesario = (anchoCSS || 180) * (window.devicePixelRatio || 1);
    for (const n of G.NIVELES_MINI) if (n >= necesario) return n;
    return G.NIVELES_MINI[G.NIVELES_MINI.length - 1];
  };

  const cacheMini = new Map();      // clave -> {url, peso}
  const TOPE_CACHE = 72 * 1024 * 1024;
  let pesoCache = 0;

  function leerCache(clave) {
    const v = cacheMini.get(clave);
    if (!v) return null;
    cacheMini.delete(clave);        // reinsertar = marcarla como reciente
    cacheMini.set(clave, v);
    return v.url;
  }

  function guardarCache(clave, url) {
    const peso = Math.round(url.length * 0.75);
    cacheMini.set(clave, { url, peso });
    pesoCache += peso;
    while (pesoCache > TOPE_CACHE && cacheMini.size > 1) {
      const vieja = cacheMini.keys().next().value;
      pesoCache -= cacheMini.get(vieja).peso;
      cacheMini.delete(vieja);
    }
  }

  const clave = (pagina, nivel) => `${pagina.fuenteId}:${pagina.indice}:${G.norm(pagina.giro)}:${nivel}`;

  /** La mejor versión ya dibujada que no pase del nivel pedido, o null. */
  G.miniaturaCacheada = function (pagina, nivelTope) {
    for (let i = G.NIVELES_MINI.length - 1; i >= 0; i--) {
      const n = G.NIVELES_MINI[i];
      if (n > nivelTope) continue;
      const url = leerCache(clave(pagina, n));
      if (url) return url;
    }
    return null;
  };

  let enCola = 0;
  const cola = [];

  // Con worker propio se pueden dibujar varias a la vez; en hilo principal
  // (al abrir el archivo con doble clic) conviene no atorar la interfaz.
  const limiteCola = () => (window.pdfjsWorker ? 2 : 4);

  function siguienteDeCola() {
    if (enCola >= limiteCola() || !cola.length) return;
    const tarea = cola.shift();
    enCola++;
    tarea().finally(() => { enCola--; siguienteDeCola(); });
  }

  function encolar(fn) {
    return new Promise((res, rej) => {
      cola.push(() => fn().then(res, rej));
      siguienteDeCola();
    });
  }

  G.miniatura = function (pagina, nivel) {
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    if (!fuente) return Promise.reject(new Error('fuente ausente'));
    const n = nivel || G.NIVELES_MINI[0];
    const k = clave(pagina, n);
    const ya = leerCache(k);
    if (ya) return Promise.resolve(ya);

    return encolar(async () => {
      const otra = leerCache(k);
      if (otra) return otra;
      const pag = await fuente.doc.getPage(pagina.indice + 1);
      const base = pag.getViewport({ scale: 1, rotation: G.norm(pagina.giro) });
      const vp = pag.getViewport({ scale: n / base.width, rotation: G.norm(pagina.giro) });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.floor(vp.width));
      lienzo.height = Math.max(1, Math.floor(vp.height));
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      await pag.render({ canvasContext: ctx, viewport: vp }).promise;
      // más calidad en los niveles altos: ahí es donde se va a leer el texto
      const url = lienzo.toDataURL('image/jpeg', n >= 620 ? 0.9 : 0.85);
      guardarCache(k, url);
      return url;
    });
  };

  /** Render de una página a canvas, en grande (para el editor de firma / recorte). */
  G.renderGrande = async function (pagina, anchoMax) {
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    const pag = await fuente.doc.getPage(pagina.indice + 1);
    const base = pag.getViewport({ scale: 1, rotation: G.norm(pagina.giro) });
    const escala = Math.min(anchoMax / base.width, 3500 / base.width);
    const vp = pag.getViewport({ scale: escala, rotation: G.norm(pagina.giro) });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.floor(vp.width);
    lienzo.height = Math.floor(vp.height);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pag.render({ canvasContext: ctx, viewport: vp }).promise;
    return lienzo;
  };

  /* ---------- posiciones 3x3 ---------- */
  // códigos: [a|c|b][i|c|d]  (arriba/centro/abajo  ·  izquierda/centro/derecha)
  G.CODIGOS_POS = ['ai', 'ac', 'ad', 'ci', 'cc', 'cd', 'bi', 'bc', 'bd'];

  /** Devuelve el punto de anclaje en la caja visible, en puntos. */
  G.puntoPorCodigo = function (codigo, caja, margen) {
    const v = codigo[0], h = codigo[1];
    const x = h === 'i' ? margen : h === 'd' ? caja.w - margen : caja.w / 2;
    const y = v === 'a' ? margen : v === 'b' ? caja.h - margen : caja.h / 2;
    return { x, y, alineaH: h, alineaV: v };
  };

  /* ---------- construcción del PDF final ---------- */
  const cacheDocsPdfLib = new Map();

  async function docPdfLib(fuenteId) {
    if (cacheDocsPdfLib.has(fuenteId)) return cacheDocsPdfLib.get(fuenteId);
    const fuente = G.estado.fuentes.get(fuenteId);
    const d = await PDFDocument.load(fuente.bytes, { ignoreEncryption: true });
    cacheDocsPdfLib.set(fuenteId, d);
    return d;
  }
  G.olvidarDocs = () => cacheDocsPdfLib.clear();

  /* =========================================================
     ALIGERAR · bajar el peso del PDF sin perder hojas
     Los expedientes escaneados pesan por las imágenes, no por el texto.
     Se vuelven a dibujar esas hojas a menos resolución; las que llevan
     texto de verdad se copian tal cual, para no quedarse sin él.
     ========================================================= */
  G.PESOS = {
    original: null,
    ligero: { ppp: 150, calidad: 0.72, tambienConTexto: false },
    minimo: { ppp: 100, calidad: 0.6, tambienConTexto: true },
    // Blanco y negro: las hojas escaneadas a un bit. Las que llevan texto
    // de verdad NO se tocan —pesan poco y rasterizarlas sería perder el
    // texto—, así que este modo es a la vez el más chico y el que menos
    // pierde de los tres.
    bn: { ppp: 200, bn: true, tambienConTexto: false },
  };

  /** ¿La hoja lleva texto de verdad, o es una foto de un papel? */
  const cacheTexto = new Map();
  G.tieneTexto = async function (pagina) {
    const k = pagina.fuenteId + ':' + pagina.indice;
    if (cacheTexto.has(k)) return cacheTexto.get(k);
    let r = false;
    try {
      const fuente = G.estado.fuentes.get(pagina.fuenteId);
      const pag = await fuente.doc.getPage(pagina.indice + 1);
      const tc = await pag.getTextContent();
      const letras = tc.items.reduce((n, it) => n + String(it.str || '').replace(/\s/g, '').length, 0);
      // un par de letras sueltas puede ser basura del escáner; 20 ya es texto
      r = letras >= 20;
    } catch (e) { r = true; }   // ante la duda, no se toca
    cacheTexto.set(k, r);
    return r;
  };
  G.olvidarTexto = () => cacheTexto.clear();


  /* ---------- blanco y negro: lo más chico sin volver la hoja ilegible ----

     Un expediente escaneado pesa por las fotos de sus hojas, y una foto a
     color de un papel con letras negras es casi todo información que no
     hace falta. Guardada a UN BIT —cada píxel es tinta o papel— y
     comprimida sin pérdida, una hoja A4 a 200 ppp ocupa unos 30 KB: la
     mitad que la misma hoja a 100 ppp en color, y al doble de resolución,
     así que además se lee mejor.

     Lo delicado es decidir qué es tinta. Un umbral único no vale: las
     hojas escaneadas tienen sombras, y una cabecera de color saldría
     entera negra. Se hacen dos cosas:

       · el papel se mide POR ZONAS, en bloques, y se interpola entre
         ellos, de modo que cada trozo de hoja se compara con el papel que
         tiene al lado y no con el de la esquina opuesta;
       · y se exige CONTRASTE: en una zona lisa —una banda de color, un
         sombreado— no hay letra por mucho que sea más oscura que el papel.

     Las hojas que son una FOTO de verdad no pasan por aquí: a un bit se
     destrozan, así que se guardan como las demás.                        */

  /** Media y desviación de cualquier ventana, en tiempo constante. */
  function integrales(gris, W, H) {
    const W1 = W + 1;
    const S = new Float64Array(W1 * (H + 1));
    const S2 = new Float64Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) {
      let f = 0, f2 = 0;
      for (let x = 0; x < W; x++) {
        const v = gris[y * W + x];
        f += v; f2 += v * v;
        S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + f;
        S2[(y + 1) * W1 + x + 1] = S2[y * W1 + x + 1] + f2;
      }
    }
    return (x0, y0, x1, y1) => {
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const su = S[(y1 + 1) * W1 + x1 + 1] - S[y0 * W1 + x1 + 1] - S[(y1 + 1) * W1 + x0] + S[y0 * W1 + x0];
      const su2 = S2[(y1 + 1) * W1 + x1 + 1] - S2[y0 * W1 + x1 + 1] - S2[(y1 + 1) * W1 + x0] + S2[y0 * W1 + x0];
      const m = su / n;
      return { media: m, desv: Math.sqrt(Math.max(0, su2 / n - m * m)) };
    };
  }

  const BN = { umbral: 0.78, desvMinima: 10, medioTono: 0.38 };

  /**
   * Pasa la hoja a un bit. Devuelve null si la hoja parece una fotografía,
   * para que se guarde por el camino de siempre.
   */
  function aBlancoYNegro(img, W, H, ppp) {
    const gris = new Uint8Array(W * H);
    let medios = 0;
    for (let i = 0, j = 0; i < gris.length; i++, j += 4) {
      const v = (img[j] * 299 + img[j + 1] * 587 + img[j + 2] * 114) / 1000;
      gris[i] = v;
      if (v > 60 && v < 200) medios++;
    }
    // una hoja de papel escrito es casi todo blanco con unas pocas letras;
    // si más de un tercio son medios tonos, esto es una foto
    if (medios > gris.length * BN.medioTono) return null;

    // el papel de cada zona
    const B = Math.max(16, Math.round(ppp / 6));
    const bx = Math.ceil(W / B), by = Math.ceil(H / B);
    const fondo = new Float32Array(bx * by);
    for (let cy = 0; cy < by; cy++) {
      for (let cx = 0; cx < bx; cx++) {
        const m = [];
        for (let y = cy * B; y < Math.min(H, (cy + 1) * B); y += 2) {
          for (let x = cx * B; x < Math.min(W, (cx + 1) * B); x += 2) m.push(gris[y * W + x]);
        }
        m.sort((a, b) => a - b);
        fondo[cy * bx + cx] = m.length ? m[Math.floor(m.length * 0.85)] : 255;
      }
    }
    const orden = Array.from(fondo).sort((a, b) => a - b);
    const papel = orden[Math.floor(orden.length * 0.75)] || 255;
    const fondoEn = (x, y) => {
      const fx = x / B - 0.5, fy = y / B - 0.5;
      const x0 = Math.max(0, Math.min(bx - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(by - 1, Math.floor(fy)));
      const x1 = Math.min(bx - 1, x0 + 1), y1 = Math.min(by - 1, y0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const a = fondo[y0 * bx + x0] * (1 - tx) + fondo[y0 * bx + x1] * tx;
      const b = fondo[y1 * bx + x0] * (1 - tx) + fondo[y1 * bx + x1] * tx;
      return a * (1 - ty) + b * ty;
    };

    const ventana = integrales(gris, W, H);
    const rad = Math.max(4, Math.round(ppp / 24));
    const anchoBytes = Math.ceil(W / 8);
    const bits = new Uint8Array(anchoBytes * H).fill(0xFF);   // todo papel
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - rad), y1 = Math.min(H - 1, y + rad);
      for (let x = 0; x < W; x++) {
        const f = Math.max(papel * 0.45, fondoEn(x, y));
        if (gris[y * W + x] > f * BN.umbral) continue;        // claro: papel
        const x0 = Math.max(0, x - rad), x1 = Math.min(W - 1, x + rad);
        if (ventana(x0, y0, x1, y1).desv <= BN.desvMinima) continue;   // zona lisa
        bits[y * anchoBytes + (x >> 3)] &= ~(0x80 >> (x & 7));         // tinta
      }
    }
    return bits;
  }

  /** Comprime sin pérdida, como manda el formato para una imagen a un bit. */
  async function desinflar(bytes) {
    const cs = new CompressionStream('deflate');
    const w = cs.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  /** La hoja a un bit, lista para meter en el PDF; null si es una foto. */
  async function hojaEnUnBit(pagina, ppp) {
    if (typeof CompressionStream !== 'function') return null;
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    const pag = await fuente.doc.getPage(pagina.indice + 1);
    const base = pag.getViewport({ scale: 1, rotation: 0 });
    const vp = pag.getViewport({ scale: ppp / 72, rotation: 0 });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.floor(vp.width));
    lienzo.height = Math.max(1, Math.floor(vp.height));
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pag.render({ canvasContext: ctx, viewport: vp }).promise;
    const W = lienzo.width, H = lienzo.height;
    const img = ctx.getImageData(0, 0, W, H).data;
    lienzo.width = lienzo.height = 0;
    const bits = aBlancoYNegro(img, W, H, ppp);
    if (!bits) return null;
    return { datos: await desinflar(bits), W, H, ancho: base.width, alto: base.height };
  }

  /** Mete la imagen de un bit en la hoja, a pelo: pdf-lib solo sabe de
   *  JPEG y PNG, y lo que hace falta aquí es un flujo con su diccionario. */
  function dibujarUnBit(salida, hoja, bn) {
    const dic = salida.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: bn.W, Height: bn.H,
      ColorSpace: 'DeviceGray', BitsPerComponent: 1,
      Filter: 'FlateDecode', Length: bn.datos.length,
    });
    const ref = salida.context.register(PDFRawStream.of(dic, bn.datos));
    const nombre = hoja.node.newXObject('Image', ref);
    hoja.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(bn.ancho, 0, 0, bn.alto, 0, 0),
      drawObject(nombre),
      popGraphicsState(),
    );
  }

  /** Vuelve a dibujar la hoja a la resolución pedida y la devuelve en JPEG. */
  async function hojaEnJpeg(pagina, ppp, calidad) {
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    const pag = await fuente.doc.getPage(pagina.indice + 1);
    // sin girar: el giro lo pone después setRotation, igual que en la copia
    const base = pag.getViewport({ scale: 1, rotation: 0 });
    const vp = pag.getViewport({ scale: ppp / 72, rotation: 0 });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.floor(vp.width));
    lienzo.height = Math.max(1, Math.floor(vp.height));
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pag.render({ canvasContext: ctx, viewport: vp }).promise;
    const url = lienzo.toDataURL('image/jpeg', calidad);
    lienzo.width = lienzo.height = 0;   // suelta la memoria del lienzo
    return { bytes: G.dataUrlABytes(url), ancho: base.width, alto: base.height };
  }

  /**
   * Construye un PDF con las páginas indicadas (array del estado).
   * total/inicio permiten foliar bien aunque se exporte un trozo.
   */
  G.construirPdf = async function (paginas, opciones) {
    opciones = opciones || {};
    const salida = await PDFDocument.create();
    const comp = opciones.comprimir || null;
    const avisar = opciones.alProgresar || function () {};

    // 1a. decidir qué hoja se copia tal cual y cuál se vuelve a dibujar más
    //     liviana. Las que llevan texto de verdad se copian siempre en el
    //     modo ligero: rasterizarlas dejaría el texto sin poder seleccionar.
    const aligerar = new Set();
    if (comp) {
      for (let i = 0; i < paginas.length; i++) {
        if (comp.tambienConTexto || !(await G.tieneTexto(paginas[i]))) aligerar.add(i);
      }
    }

    // 1b. copiar del origen las que no se aligeran, agrupando por documento
    const porFuente = new Map();
    paginas.forEach((p, i) => {
      if (aligerar.has(i)) return;
      if (!porFuente.has(p.fuenteId)) porFuente.set(p.fuenteId, []);
      porFuente.get(p.fuenteId).push({ indice: p.indice, destino: i });
    });
    const copiadas = new Array(paginas.length);
    for (const [fuenteId, items] of porFuente) {
      const src = await docPdfLib(fuenteId);
      const paginasCopiadas = await salida.copyPages(src, items.map((it) => it.indice));
      items.forEach((it, k) => { copiadas[it.destino] = paginasCopiadas[k]; });
    }

    // 1c. armar el documento EN ORDEN: cada hoja, copiada o redibujada
    let hechas = 0;
    for (let i = 0; i < paginas.length; i++) {
      if (!aligerar.has(i)) { salida.addPage(copiadas[i]); continue; }
      hechas++;
      if (paginas.length > 3) avisar(`Aligerando hoja ${hechas} de ${aligerar.size}…`);
      let bn = null;
      if (comp.bn) {
        try { bn = await hojaEnUnBit(paginas[i], comp.ppp); }
        catch (e) { bn = null; }
      }
      if (bn) {
        const hoja = salida.addPage([bn.ancho, bn.alto]);
        dibujarUnBit(salida, hoja, bn);
        continue;
      }
      // Sin blanco y negro, o con él pero siendo la hoja una foto de verdad:
      // por el camino de siempre. A un bit una foto se destroza, así que se
      // guarda en JPEG, a algo menos de resolución para que no se dispare.
      const jpeg = comp.bn
        ? await hojaEnJpeg(paginas[i], 150, 0.7)
        : await hojaEnJpeg(paginas[i], comp.ppp, comp.calidad);
      const img = await salida.embedJpg(jpeg.bytes);
      const hoja = salida.addPage([jpeg.ancho, jpeg.alto]);
      hoja.drawImage(img, { x: 0, y: 0, width: jpeg.ancho, height: jpeg.alto });
    }


    // 2. recursos compartidos
    const imgsFirma = new Map();
    let fuenteTexto = null, fuenteTextoNegrita = null;
    const pedirFuente = async (negrita) => {
      if (negrita) {
        if (!fuenteTextoNegrita) fuenteTextoNegrita = await salida.embedFont(StandardFonts.HelveticaBold);
        return fuenteTextoNegrita;
      }
      if (!fuenteTexto) fuenteTexto = await salida.embedFont(StandardFonts.Helvetica);
      return fuenteTexto;
    };
    const pedirFirma = async (firmaId) => {
      if (imgsFirma.has(firmaId)) return imgsFirma.get(firmaId);
      const firma = G.estado.firmas.find((f) => f.id === firmaId);
      if (!firma) return null;
      const bin = G.dataUrlABytes(firma.dataUrl);
      const img = await salida.embedPng(bin);
      imgsFirma.set(firmaId, img);
      return img;
    };

    const totalFolio = opciones.totalFolio || paginas.length;

    // 3. giro y sellos
    for (let i = 0; i < paginas.length; i++) {
      const est = paginas[i];
      const pag = salida.getPage(i);
      const R = G.norm(est.giro);
      pag.setRotation(degrees(R));

      const caja = pag.getCropBox ? pag.getCropBox() : { x: 0, y: 0, width: pag.getWidth(), height: pag.getHeight() };
      const W = caja.width, H = caja.height, OX = caja.x, OY = caja.y;
      const vis = G.cajaVisible(W, H, R);

      const dibujaEn = (px, py) => {
        const p = G.aPuntoPdf(px, py, W, H, R);
        return { x: p.x + OX, y: p.y + OY };
      };

      for (const sello of est.sellos) {
        if (sello.rol === 'firma') {
          const img = await pedirFirma(sello.firmaId);
          if (!img) continue;
          const sw = sello.fw * vis.w;
          const sh = sw * (img.height / img.width);
          const sx = sello.fx * vis.w;
          const sy = sello.fy * vis.h;
          const ancla = dibujaEn(sx, sy + sh);   // esquina inferior izquierda vista
          pag.drawImage(img, {
            x: ancla.x, y: ancla.y, width: sw, height: sh,
            rotate: degrees(R + (sello.giro || 0)),
            opacity: sello.opacidad == null ? 1 : sello.opacidad,
          });
        } else if (sello.rol === 'folio' || sello.rol === 'marca') {
          const esFolio = sello.rol === 'folio';
          // El número de folio lo decide el taller (respeta el sentido elegido y
          // se mantiene aunque se exporte solo un trozo del expediente).
          const numero = opciones.numeros && opciones.numeros[i] != null
            ? opciones.numeros[i]
            : (sello.inicio == null ? 1 : sello.inicio) + (opciones.baseIndices ? opciones.baseIndices[i] : i);
          const texto = esFolio
            ? String(sello.plantilla || '{n}')
                .replace(/\{n\}/g, String(numero))
                .replace(/\{t\}/g, String(totalFolio))
            : String(sello.texto || '');
          if (!texto) continue;
          const fnt = await pedirFuente(!!sello.negrita || esFolio);
          const tam = sello.tam || 11;
          const anchoTxt = fnt.widthOfTextAtSize(texto, tam);
          const altoTxt = fnt.heightAtSize(tam);
          const margen = G.mm(sello.margen == null ? 12 : sello.margen);
          const ancla = G.puntoPorCodigo(sello.pos || 'ad', vis, margen);
          // esquina inferior-izquierda del texto en coordenadas vistas
          let tx = ancla.x;
          if (ancla.alineaH === 'c') tx -= anchoTxt / 2;
          else if (ancla.alineaH === 'd') tx -= anchoTxt;
          let tyBase = ancla.y;              // y "vista" del punto de anclaje
          if (ancla.alineaV === 'a') tyBase += altoTxt;
          else if (ancla.alineaV === 'c') tyBase += altoTxt / 2;
          const giroExtra = sello.giro || 0;
          let punto;
          if (giroExtra) {
            // giramos alrededor del centro del texto para que quede centrado
            const cx = tx + anchoTxt / 2, cy = tyBase - altoTxt / 2;
            const rad = (giroExtra * Math.PI) / 180;
            const dx = -anchoTxt / 2, dy = altoTxt / 2;
            const rx = dx * Math.cos(rad) + dy * Math.sin(rad);
            const ry = -dx * Math.sin(rad) + dy * Math.cos(rad);
            punto = dibujaEn(cx + rx, cy + ry);
          } else {
            punto = dibujaEn(tx, tyBase);
          }
          pag.drawText(texto, {
            x: punto.x, y: punto.y, size: tam, font: fnt,
            color: G.aColorPdf(sello.color || '#111111'),
            rotate: degrees(R + giroExtra),
            opacity: sello.opacidad == null ? 1 : sello.opacidad,
          });
        }
      }
    }

    if (opciones.titulo) salida.setTitle(opciones.titulo);
    if (opciones.autor) salida.setAuthor(opciones.autor);
    salida.setProducer('Grapa · taller de PDF');
    salida.setCreator('Grapa');
    const bytes = await salida.save({ useObjectStreams: true });

    // Lo que pesaban esas hojas en los archivos que abriste, para poder decir
    // si aligerar sirvió de algo.
    const antes = paginas.reduce((n, p) => {
      const f = G.estado.fuentes.get(p.fuenteId);
      if (!f || !f.bytes || !f.paginas.length) return n;
      return n + f.bytes.length / f.paginas.length;
    }, 0);

    // Si el archivo ya venía bien comprimido, aligerarlo puede engordarlo.
    // En ese caso se rehace sin tocar nada: nunca se entrega algo peor.
    if (comp && antes && bytes.length >= antes) {
      const limpio = await G.construirPdf(paginas, Object.assign({}, opciones, {
        comprimir: null, informe: null,
      }));
      if (opciones.informe) {
        opciones.informe({
          aligeradas: 0, intactas: paginas.length, sinMejora: true,
          antes: Math.round(antes), despues: limpio.length,
        });
      }
      return limpio;
    }

    if (opciones.informe) {
      opciones.informe({
        aligeradas: aligerar.size, intactas: paginas.length - aligerar.size,
        sinMejora: false, antes: Math.round(antes), despues: bytes.length,
      });
    }
    return bytes;
  };

  /* ---------- ayudas de binarios ---------- */
  G.dataUrlABytes = function (dataUrl) {
    const base64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  /* Cuando Grapa corre publicada como página de Claude, el marco no deja que
     la página descargue por su cuenta: hay que pedirle al visor que guarde el
     archivo. En local no existe esa capacidad y usamos el enlace de siempre. */
  let capDescargas;   // undefined = sin consultar · null = no disponible

  async function capacidadDescargas() {
    if (capDescargas !== undefined) return capDescargas;
    try {
      capDescargas = (window.claude && typeof window.claude.use === 'function')
        ? await window.claude.use('downloads')
        : null;
    } catch (e) { capDescargas = null; }
    return capDescargas;
  }

  /**
   * Entrega un archivo al usuario.
   * Orden: carpeta vinculada · visor que lo aloja · descarga normal.
   * @returns {{estado:'carpeta'|'guardado'|'cancelado', nombre:string}}
   */
  /**
   * @param {{aDescargas?:boolean}} [opciones] aDescargas fuerza la carpeta de
   *   Descargas aunque haya una vinculada: sirve para lo suelto y rápido, que
   *   no tiene por qué acabar mezclado con el expediente terminado.
   */
  G.guardarArchivo = async function (bytes, nombre, tipo, opciones) {
    const o = opciones || {};
    if (!o.aDescargas && G.carpeta && G.carpeta.actual()) {
      const permiso = await G.carpeta.permiso(true);
      if (permiso === 'granted') {
        try {
          const final = await G.carpeta.escribir(nombre, bytes);
          return { estado: 'carpeta', nombre: final };
        } catch (e) {
          console.error(e);
          G.aviso('No se pudo escribir en la carpeta vinculada; va a Descargas.', 'error');
        }
      }
    }
    const cap = await capacidadDescargas();
    if (cap) {
      try {
        await cap.save({ filename: nombre, data: bytes });
        return { estado: 'guardado', nombre };
      } catch (e) {
        if (e && e.code === 'declined') return { estado: 'cancelado', nombre };
        // cualquier otro problema: intentamos por la vía normal
      }
    }
    G.descargar(bytes, nombre, tipo);
    return { estado: 'guardado', nombre };
  };

  /**
   * Entrega varios archivos. Con el visor de Claude los guarda uno a uno
   * (no admite ZIP); en local los junta en un único ZIP.
   * @param {{nombre:string, bytes:Uint8Array}[]} archivos
   */
  G.entregarVarios = async function (archivos, nombreZip, alProgresar) {
    if (archivos.length === 1) {
      const r = await G.guardarArchivo(archivos[0].bytes, archivos[0].nombre);
      return r.estado === 'cancelado' ? 0 : 1;
    }
    // con carpeta vinculada no hay diálogos: se escriben todos ahí
    if (G.carpeta && G.carpeta.actual() && (await G.carpeta.permiso(true)) === 'granted') {
      let n = 0;
      for (let i = 0; i < archivos.length; i++) {
        if (alProgresar) alProgresar(i, archivos.length);
        try { await G.carpeta.escribir(archivos[i].nombre, archivos[i].bytes); n++; }
        catch (e) { console.error(e); break; }
      }
      if (n === archivos.length) return n;
      G.aviso('Algunos archivos no se pudieron escribir en la carpeta.', 'error');
    }
    const cap = await capacidadDescargas();
    if (cap) {
      let n = 0;
      for (let i = 0; i < archivos.length; i++) {
        if (alProgresar) alProgresar(i, archivos.length);
        try {
          await cap.save({ filename: archivos[i].nombre, data: archivos[i].bytes });
          n++;
        } catch (e) {
          if (e && e.code === 'declined') break;
          throw e;
        }
      }
      return n;
    }
    const zip = new JSZip();
    archivos.forEach((a) => zip.file(a.nombre, a.bytes));
    const blob = await zip.generateAsync({ type: 'blob' });
    G.descargar(blob, nombreZip, 'application/zip');
    return archivos.length;
  };

  G.descargar = function (bytes, nombre, tipo) {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: tipo || 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  G.nombreSeguro = function (s, porDefecto) {
    const limpio = String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
    return limpio || porDefecto || 'documento';
  };

  /* ---------- almacenamiento de firmas ---------- */
  const CLAVE = 'grapa.firmas.v1';
  G.almacen = {
    leer() {
      try {
        const txt = localStorage.getItem(CLAVE);
        return txt ? JSON.parse(txt) : [];
      } catch (e) { return []; }
    },
    escribir(firmas) {
      try {
        localStorage.setItem(CLAVE, JSON.stringify(firmas));
        return true;
      } catch (e) { return false; }
    },
  };
})();
