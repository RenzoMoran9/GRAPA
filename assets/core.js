/* ===========================================================
   Pdflash · núcleo: estado, carga de PDF, miniaturas y geometría
   Todo ocurre en el navegador. Ningún archivo sale del equipo.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});
  const { PDFDocument, StandardFonts, degrees, rgb, PDFRawStream, PDFName, PDFDict, PDFStream,
          PDFArray, PDFRef, PDFNumber, decodePDFRawStream,
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
    // Los PDF de origen son comunes a todos los tableros (cada hoja dice cuál es
    // el suyo por id): así una lectura, una revisión o una miniatura en marcha
    // sigue valiendo aunque cambies de tablero.
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

  /**
   * Enderezar una hoja torcida: girarla unos pocos grados alrededor de su
   * centro. «grados» va a favor del reloj, como se ve en la pantalla. Para
   * dibujarla en un lienzo de W × H devuelve la matriz que pide pdf.js, o
   * undefined si no hay nada que enderezar.
   */
  G.matrizEnderezo = function (grados, W, H) {
    if (!grados) return undefined;
    const r = (grados * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    const cx = W / 2, cy = H / 2;
    return [co, si, -si, co, cx - co * cx + si * cy, cy - si * cx - co * cy];
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

        const id = 'f' + (G.estado.fuentes.size + nuevasFuentes.length + 1) + '-' + Date.now().toString(36)
          + Math.random().toString(36).slice(2, 5);
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

  const clave = (pagina, nivel) =>
    `${pagina.fuenteId}:${pagina.indice}:${G.norm(pagina.giro)}:${pagina.enderezo || 0}:${nivel}`;

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

  /* ---------- miniatura rápida de una hoja escaneada ----------
     Una hoja escaneada es una foto de la página. Para dibujar su miniatura,
     pdf.js descomprime la foto ENTERA (a 300 ppp, con su propio decodificador,
     lento) y luego la achica: unos 350 ms por hoja. El navegador sabe
     descomprimir un JPEG ya en chico, y mucho más rápido (unos 80 ms).

     Solo se hace cuando la hoja no tiene NADA más que fotos JPEG corrientes
     (y, como mucho, texto invisible, el de «Hacer buscables»): nada de texto
     visible, rayas, rellenos, recortes, formularios ni anotaciones. Ante
     cualquier otra cosa, o ante la duda, se dibuja con pdf.js como siempre,
     para que la miniatura nunca salga distinta de la hoja. */
  const ORDENES_DE_ESTADO = new Set(['q', 'Q', 'cm', 'w', 'J', 'j', 'M', 'd', 'ri', 'i',
    'g', 'G', 'rg', 'RG', 'k', 'K', 'cs', 'CS', 'sc', 'SC', 'scn', 'SCN',
    'BT', 'ET', 'Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'BX', 'EX', 'BMC', 'BDC', 'EMC', 'MP', 'DP']);
  const ORDENES_DE_TEXTO = new Set(['Tj', 'TJ', "'", '"']);

  /** ¿Es una foto JPEG que el navegador dibuja igual que pdf.js? */
  function jpegCorriente(context, obj) {
    if (!(obj instanceof PDFRawStream)) return false;
    const d = obj.dict;
    let filtro = context.lookup(d.get(PDFName.of('Filter')));
    if (filtro instanceof PDFArray) filtro = filtro.size() === 1 ? context.lookup(filtro.get(0)) : null;
    if (nombreDe(filtro) !== 'DCTDecode') return false;
    if (d.get(PDFName.of('SMask')) || d.get(PDFName.of('Mask')) || d.get(PDFName.of('Decode')) || d.get(PDFName.of('ImageMask'))) return false;
    if (numeroDe(context, d.get(PDFName.of('BitsPerComponent'))) !== 8) return false;
    const cs = context.lookup(d.get(PDFName.of('ColorSpace')));
    const n = nombreDe(cs);
    if (n === 'DeviceGray' || n === 'DeviceRGB') return true;
    if (cs instanceof PDFArray && nombreDe(context.lookup(cs.get(0))) === 'ICCBased') {
      const icc = context.lookup(cs.get(1));
      const k = icc instanceof PDFStream ? numeroDe(context, icc.dict.get(PDFName.of('N'))) : 0;
      return k === 1 || k === 3;
    }
    return false;
  }

  /** Las fotos de la hoja y dónde van, si la hoja no es más que eso; si no, null. */
  async function soloFotos(pagina) {
    const src = await docPdfLib(pagina.fuenteId);
    const ctx = src.context;
    const nodo = src.getPage(pagina.indice).node;
    const anot = ctx.lookup(nodo.get(PDFName.of('Annots')));
    if (anot instanceof PDFArray && anot.size()) return null;
    const res = ctx.lookup(nodo.Resources());
    const xo = res instanceof PDFDict ? ctx.lookup(res.get(PDFName.of('XObject'))) : null;
    const c = nodo.Contents();
    const flujos = c instanceof PDFArray ? c.asArray().map((r) => ctx.lookup(r)) : [c];
    const fotos = [];
    let ctm = [1, 0, 0, 1, 0, 0], modo = 0, vale = true;
    const pila = [];
    for (const f of flujos) {
      if (!f || !vale) break;
      leerOrdenes(bytesDeFlujo(f), (op, a) => {
        if (!vale) return;
        if (op === 'q') pila.push(ctm);
        else if (op === 'Q') ctm = pila.length ? pila.pop() : [1, 0, 0, 1, 0, 0];
        else if (op === 'cm') {
          if (a.length < 6 || !a.slice(-6).every((x) => typeof x === 'number')) { vale = false; return; }
          ctm = porMatriz(a.slice(-6), ctm);
        } else if (op === 'Tr') modo = typeof a[a.length - 1] === 'number' ? a[a.length - 1] : 0;
        else if (ORDENES_DE_TEXTO.has(op)) { if (modo !== 3) vale = false; }   // texto que se ve
        else if (op === 'Do') {
          const ref = xo instanceof PDFDict && a.length && a[a.length - 1] && a[a.length - 1].nombre
            ? xo.get(PDFName.of(a[a.length - 1].nombre)) : null;
          const obj = ref ? ctx.lookup(ref) : null;
          if (!(obj instanceof PDFStream) || obj.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image') || !jpegCorriente(ctx, obj)) { vale = false; return; }
          fotos.push({ obj, m: ctm.slice() });
        } else if (!ORDENES_DE_ESTADO.has(op)) vale = false;   // rayas, rellenos, recortes, formularios…
      });
    }
    return vale && fotos.length ? fotos : null;
  }

  /** Dibuja la miniatura por el camino rápido. false si no se puede. */
  async function miniaturaRapida(pagina, vp, lienzo) {
    let fotos;
    try { fotos = await soloFotos(pagina); } catch (e) { return false; }
    if (!fotos) return false;
    const bmps = [];
    try {
      for (const f of fotos) {
        const w = Math.max(1, Math.round(Math.hypot(f.m[0], f.m[1]) * vp.scale));
        const h = Math.max(1, Math.round(Math.hypot(f.m[2], f.m[3]) * vp.scale));
        bmps.push(await createImageBitmap(new Blob([f.obj.contents], { type: 'image/jpeg' }),
          { resizeWidth: w, resizeHeight: h, resizeQuality: 'high', imageOrientation: 'none' }));
      }
    } catch (e) { bmps.forEach((b) => b.close()); return false; }
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    const endereza = G.matrizEnderezo(pagina.enderezo, lienzo.width, lienzo.height);
    ctx.setTransform(...(endereza || [1, 0, 0, 1, 0, 0]));
    ctx.transform(...vp.transform);
    ctx.imageSmoothingQuality = 'high';
    fotos.forEach((f, i) => {
      ctx.save();
      ctx.transform(...f.m);
      ctx.transform(1, 0, 0, -1, 0, 1);   // la foto va de arriba abajo; el PDF, al revés
      ctx.drawImage(bmps[i], 0, 0, 1, 1);
      ctx.restore();
      bmps[i].close();
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  }
  G.miniaturaRapida = miniaturaRapida;   // para las pruebas

  let enCola = 0;
  const cola = [];

  // Con worker propio se pueden dibujar varias a la vez; en hilo principal
  // (al abrir el archivo con doble clic) conviene no atorar la interfaz.
  const limiteCola = () => (window.pdfjsWorker ? 2 : 4);

  // Primero lo que se está viendo: una miniatura pedida al pasar por una
  // hoja que ya salió de la pantalla no le quita el turno a las que están
  // a la vista. Si cuando le toca ya no hace falta, se descarta (quien la
  // pidió la vuelve a pedir cuando la hoja vuelva a verse).
  const FUERA = 'fuera de vista';
  function siguienteDeCola() {
    while (enCola < limiteCola() && cola.length) {
      let i = cola.findIndex((t) => !t.vigente || t.vigente() === 'ya');
      if (i < 0) i = cola.findIndex((t) => t.vigente() !== false);
      if (i < 0) { cola.splice(0).forEach((t) => t.descartar()); return; }
      const [t] = cola.splice(i, 1);
      enCola++;
      t.correr().finally(() => { enCola--; siguienteDeCola(); });
    }
  }

  function encolar(fn, vigente) {
    return new Promise((res, rej) => {
      cola.push({ vigente, correr: () => fn().then(res, rej), descartar: () => rej(new Error(FUERA)) });
      siguienteDeCola();
    });
  }
  G.MINI_FUERA = FUERA;

  /**
   * La miniatura de una hoja. `vigente`, si se da, dice si todavía hace
   * falta: 'ya' (está a la vista, va primero), true (cerca) o false (lejos:
   * se descarta).
   */
  G.miniatura = function (pagina, nivel, vigente) {
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
      if (!(await miniaturaRapida(pagina, vp, lienzo))) {
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        await pag.render({ canvasContext: ctx, viewport: vp,
          transform: G.matrizEnderezo(pagina.enderezo, lienzo.width, lienzo.height) }).promise;
      }
      // más calidad en los niveles altos: ahí es donde se va a leer el texto
      const url = lienzo.toDataURL('image/jpeg', n >= 620 ? 0.9 : 0.85);
      guardarCache(k, url);
      return url;
    }, vigente);
  };

  /**
   * Render de una página a canvas, en grande (para el editor de firma / recorte).
   * `doc`: otra copia abierta del mismo PDF (el lector de escaneos dibuja con las suyas,
   * cada una en su hilo, para no hacer fila detrás de la pantalla).
   */
  G.renderGrande = async function (pagina, anchoMax, doc) {
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    const pag = await (doc || fuente.doc).getPage(pagina.indice + 1);
    const base = pag.getViewport({ scale: 1, rotation: G.norm(pagina.giro) });
    const escala = Math.min(anchoMax / base.width, 3500 / base.width);
    const vp = pag.getViewport({ scale: escala, rotation: G.norm(pagina.giro) });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.floor(vp.width);
    lienzo.height = Math.floor(vp.height);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pag.render({ canvasContext: ctx, viewport: vp,
      transform: G.matrizEnderezo(pagina.enderezo, lienzo.width, lienzo.height) }).promise;
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
    return { datos: await desinflar(bits), W, H, ancho: base.width, alto: base.height, x: pag.view[0], y: pag.view[1] };
  }

  /** Mete la imagen de un bit en la hoja, a pelo: pdf-lib solo sabe de
   *  JPEG y PNG, y lo que hace falta aquí es un flujo con su diccionario. */
  function refUnBit(salida, bn) {
    const dic = salida.context.obj({
      Type: 'XObject', Subtype: 'Image', Width: bn.W, Height: bn.H,
      ColorSpace: 'DeviceGray', BitsPerComponent: 1,
      Filter: 'FlateDecode', Length: bn.datos.length,
    });
    return salida.context.register(PDFRawStream.of(dic, bn.datos));
  }
  function dibujarUnBit(salida, hoja, bn) {
    const nombre = hoja.node.newXObject('Image', refUnBit(salida, bn));
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
    return { bytes: G.dataUrlABytes(url), ancho: base.width, alto: base.height, x: pag.view[0], y: pag.view[1] };
  }

  /* ---------- hojas escaneadas CON texto buscable ----------

     Un escaneo que pasó por un reconocedor de texto (el del escáner, o
     «Hacer buscables») lleva la foto de la hoja y encima el texto,
     invisible. Pesa como un escaneo, pero tiene texto: no se vuelve foto
     entera (se perdería el texto); se le achica la foto por dentro, como a
     cualquier imagen de una hoja con texto (ver «achicar las imágenes»). */
  const PESO_ESCANEO = 40 * 1024;   // imágenes de más de esto en una hoja: pesa por ellas

  /** Recorre las imágenes que dibuja una hoja, también las de dentro de un
   *  formulario. `hacer(dicXObject, nombre, ref, flujo)` por cada una. */
  function recorrerImagenes(context, recursos, hacer, vistos = new Set()) {
    const res = context.lookup(recursos);
    if (!(res instanceof PDFDict)) return;
    const xo = context.lookup(res.get(PDFName.of('XObject')));
    if (!(xo instanceof PDFDict)) return;
    for (const [nombre, ref] of xo.entries()) {
      const obj = context.lookup(ref);
      if (!(obj instanceof PDFStream)) continue;
      const tipo = obj.dict.get(PDFName.of('Subtype'));
      if (tipo === PDFName.of('Image')) hacer(xo, nombre, ref, obj);
      else if (tipo === PDFName.of('Form') && !vistos.has(obj)) {
        vistos.add(obj);
        recorrerImagenes(context, obj.dict.get(PDFName.of('Resources')), hacer, vistos);
      }
    }
  }

  /** Cuánto pesan las imágenes de una hoja del documento original. */
  async function pesoImagenes(pagina) {
    const src = await docPdfLib(pagina.fuenteId);
    const nodo = src.getPage(pagina.indice).node;
    let n = 0;
    const contadas = new Set();
    recorrerImagenes(src.context, nodo.Resources(), (xo, nombre, ref, img) => {
      if (contadas.has(img)) return;
      contadas.add(img);
      n += img.getContentsSize();
      const mascara = src.context.lookup(img.dict.get(PDFName.of('SMask')));
      if (mascara instanceof PDFStream) n += mascara.getContentsSize();
    });
    return n;
  }

  /* ---------- achicar las imágenes de las hojas con texto ----------

     Como hacen los compresores de PDF (PDF24, Acrobat): no se toca el texto;
     se entra en cada IMAGEN —la foto de una ficha técnica, el logo, el
     sello— y se guarda a la resolución a la que de verdad se ve en la hoja.
     Una foto de 1600 puntos de ancho dibujada en 15 cm está a 270 ppp: a
     150 ppp se ve igual en pantalla y pesa la cuarta parte.

     Para saber a qué tamaño se ve cada imagen se lee el contenido de la hoja
     (las órdenes «cm», «q», «Q» y «Do»), también dentro de los formularios.
     Una imagen que no se sabe leer —JBIG2, CCITT, JPEG 2000, CMYK— se deja
     como está: esas ya vienen comprimidas. */

  const BLANCOS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

  /** Recorre las órdenes de un contenido de hoja: `alOrden(op, operandos)`. */
  function leerOrdenes(b, alOrden) {
    const n = b.length;
    let i = 0, ops = [];
    const leerPalabra = () => { const ini = i; while (i < n && !BLANCOS.has(b[i]) && !DELIM.has(b[i])) i++; return String.fromCharCode.apply(null, b.subarray(ini, i)); };
    while (i < n) {
      const c = b[i];
      if (BLANCOS.has(c)) { i++; continue; }
      if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; }            // %
      if (c === 40) {                                                                        // ( … )
        let prof = 1; i++;
        while (i < n && prof) { if (b[i] === 92) i++; else if (b[i] === 40) prof++; else if (b[i] === 41) prof--; i++; }
        ops.push(null); continue;
      }
      if (c === 60) {                                                                        // < … > o <<
        if (b[i + 1] === 60) { i += 2; continue; }
        while (i < n && b[i] !== 62) i++;
        i++; ops.push(null); continue;
      }
      if (c === 62 || c === 91 || c === 93 || c === 123 || c === 125) { i += (c === 62 && b[i + 1] === 62) ? 2 : 1; continue; }
      if (c === 47) { i++; ops.push({ nombre: leerPalabra().replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }); continue; }
      const p = leerPalabra();
      if (!p) { i++; continue; }
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(p)) { ops.push(parseFloat(p)); continue; }
      if (p === 'BI') {
        // imagen dentro del contenido: se salta hasta su «EI»
        while (i < n && !(BLANCOS.has(b[i]) && b[i + 1] === 69 && b[i + 2] === 73 && (i + 3 >= n || BLANCOS.has(b[i + 3]) || DELIM.has(b[i + 3])))) i++;
        i += 3; ops = []; continue;
      }
      alOrden(p, ops);
      ops = [];
    }
  }

  const porMatriz = (m, t) => [
    m[0] * t[0] + m[1] * t[2], m[0] * t[1] + m[1] * t[3],
    m[2] * t[0] + m[3] * t[2], m[2] * t[1] + m[3] * t[3],
    m[4] * t[0] + m[5] * t[2] + t[4], m[4] * t[1] + m[5] * t[3] + t[5],
  ];

  function bytesDeFlujo(obj) {
    if (obj instanceof PDFRawStream) return decodePDFRawStream(obj).decode();
    if (obj && typeof obj.getContents === 'function') return obj.getContents();
    return new Uint8Array(0);
  }

  /** A qué tamaño (en puntos) se dibuja cada imagen de estas hojas. */
  function medirImagenes(context, hojas) {
    const usos = new Map();
    const visitar = (contenidos, recursos, ctm0, prof) => {
      if (prof > 12) return;
      const res = context.lookup(recursos);
      const xo = res instanceof PDFDict ? context.lookup(res.get(PDFName.of('XObject'))) : null;
      let ctm = ctm0.slice();
      const pila = [];
      for (const bytes of contenidos) {
        leerOrdenes(bytes, (op, a) => {
          if (op === 'q') pila.push(ctm);
          else if (op === 'Q') ctm = pila.length ? pila.pop() : ctm0.slice();
          else if (op === 'cm' && a.length >= 6 && a.slice(-6).every((x) => typeof x === 'number')) ctm = porMatriz(a.slice(-6), ctm);
          else if (op === 'Do' && a.length && a[a.length - 1] && a[a.length - 1].nombre && xo instanceof PDFDict) {
            const ref = xo.get(PDFName.of(a[a.length - 1].nombre));
            const obj = context.lookup(ref);
            if (!(obj instanceof PDFStream)) return;
            const tipo = obj.dict.get(PDFName.of('Subtype'));
            if (tipo === PDFName.of('Image') && ref instanceof PDFRef) {
              const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
              const u = usos.get(ref.toString()) || { ref, w: 0, h: 0 };
              u.w = Math.max(u.w, w); u.h = Math.max(u.h, h);
              usos.set(ref.toString(), u);
            } else if (tipo === PDFName.of('Form')) {
              const mat = context.lookup(obj.dict.get(PDFName.of('Matrix')));
              const m = mat instanceof PDFArray && mat.size() === 6
                ? [0, 1, 2, 3, 4, 5].map((k) => { const v = context.lookup(mat.get(k)); return v instanceof PDFNumber ? v.asNumber() : 0; })
                : [1, 0, 0, 1, 0, 0];
              let bytes = null;
              try { bytes = bytesDeFlujo(obj); } catch (e) { bytes = null; }
              if (bytes) visitar([bytes], obj.dict.get(PDFName.of('Resources')) || recursos, porMatriz(m, ctm), prof + 1);
            }
          }
        });
      }
    };
    for (const hoja of hojas) {
      const c = hoja.node.Contents();
      const flujos = c instanceof PDFArray ? c.asArray().map((r) => context.lookup(r)) : [c];
      const contenidos = [];
      for (const f of flujos) { try { if (f) contenidos.push(bytesDeFlujo(f)); } catch (e) { /* ilegible: se salta */ } }
      visitar(contenidos, hoja.node.Resources(), [1, 0, 0, 1, 0, 0], 0);
    }
    return usos;
  }

  const nombreDe = (v) => (v instanceof PDFName ? v.asString().replace(/^\//, '') : null);
  const numeroDe = (context, v) => { const x = context.lookup(v); return x instanceof PDFNumber ? x.asNumber() : null; };

  /** Deshace el «predictor PNG» con que se guardan muchas imágenes. */
  function sinPredictor(datos, colores, columnas) {
    const fila = colores * columnas, filas = Math.floor(datos.length / (fila + 1));
    const out = new Uint8Array(fila * filas);
    for (let y = 0; y < filas; y++) {
      const tipo = datos[y * (fila + 1)], ent = y * (fila + 1) + 1, sal = y * fila;
      for (let x = 0; x < fila; x++) {
        const v = datos[ent + x];
        const a = x >= colores ? out[sal + x - colores] : 0;
        const b = y ? out[sal - fila + x] : 0;
        const c = x >= colores && y ? out[sal - fila + x - colores] : 0;
        let p = 0;
        if (tipo === 1) p = a; else if (tipo === 2) p = b; else if (tipo === 3) p = (a + b) >> 1;
        else if (tipo === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        out[sal + x] = (v + p) & 255;
      }
    }
    return out;
  }

  /** Los puntos de una imagen del PDF, en un lienzo; null si no se sabe leer. */
  async function imagenALienzo(context, obj) {
    const d = obj.dict;
    const W = numeroDe(context, d.get(PDFName.of('Width'))), H = numeroDe(context, d.get(PDFName.of('Height')));
    if (!W || !H || W * H > 40e6) return null;
    if (d.get(PDFName.of('ImageMask')) || d.get(PDFName.of('Mask')) || d.get(PDFName.of('Decode'))) return null;
    let filtro = context.lookup(d.get(PDFName.of('Filter')));
    if (filtro instanceof PDFArray) filtro = filtro.size() === 1 ? context.lookup(filtro.get(0)) : null;
    filtro = nombreDe(filtro);
    // el espacio de color: gris, RGB o una paleta de ellos
    let cs = context.lookup(d.get(PDFName.of('ColorSpace')));
    let comps = 0, paleta = null;
    const compsDe = (x) => {
      const n = nombreDe(x);
      if (n === 'DeviceGray' || n === 'CalGray') return 1;
      if (n === 'DeviceRGB' || n === 'CalRGB') return 3;
      if (x instanceof PDFArray) {
        const t = nombreDe(context.lookup(x.get(0)));
        if (t === 'CalGray') return 1;
        if (t === 'CalRGB') return 3;
        if (t === 'ICCBased') { const icc = context.lookup(x.get(1)); const k = icc instanceof PDFStream ? numeroDe(context, icc.dict.get(PDFName.of('N'))) : 0; return k === 1 || k === 3 ? k : 0; }
      }
      return 0;
    };
    if (cs instanceof PDFArray && nombreDe(context.lookup(cs.get(0))) === 'Indexed') {
      const base = compsDe(context.lookup(cs.get(1)));
      const tabla = context.lookup(cs.get(3));
      let t = null;
      if (tabla instanceof PDFStream) { try { t = bytesDeFlujo(tabla); } catch (e) { t = null; } }
      else if (tabla && typeof tabla.asBytes === 'function') t = tabla.asBytes();
      if (!base || !t) return null;
      paleta = { base, t }; comps = 1;
    } else comps = compsDe(cs);
    if (!comps) return null;

    const lienzo = document.createElement('canvas');
    lienzo.width = W; lienzo.height = H;
    const ctx = lienzo.getContext('2d');
    if (filtro === 'DCTDecode') {
      if (paleta) return null;
      const bmp = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' }));
      if (bmp.width !== W || bmp.height !== H) { bmp.close(); return null; }
      ctx.drawImage(bmp, 0, 0); bmp.close();
      return lienzo;
    }
    if (filtro !== 'FlateDecode') return null;
    if (numeroDe(context, d.get(PDFName.of('BitsPerComponent'))) !== 8) return null;
    let datos = decodePDFRawStream(obj).decode();
    const parms = context.lookup(d.get(PDFName.of('DecodeParms')));
    const pred = parms instanceof PDFDict ? numeroDe(context, parms.get(PDFName.of('Predictor'))) || 1 : 1;
    if (pred >= 10) datos = sinPredictor(datos, comps, W);
    else if (pred !== 1) return null;
    if (datos.length < W * H * comps) return null;
    const img = ctx.createImageData(W, H), px = img.data;
    for (let k = 0, j = 0; k < W * H; k++, j += 4) {
      if (paleta) {
        const e = datos[k] * paleta.base;
        if (paleta.base === 1) px[j] = px[j + 1] = px[j + 2] = paleta.t[e];
        else { px[j] = paleta.t[e]; px[j + 1] = paleta.t[e + 1]; px[j + 2] = paleta.t[e + 2]; }
      } else if (comps === 1) px[j] = px[j + 1] = px[j + 2] = datos[k];
      else { px[j] = datos[k * 3]; px[j + 1] = datos[k * 3 + 1]; px[j + 2] = datos[k * 3 + 2]; }
      px[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return lienzo;
  }

  const CLAVES_QUE_CAMBIAN = new Set(['Filter', 'DecodeParms', 'Length', 'Width', 'Height', 'ColorSpace', 'BitsPerComponent', 'Decode', 'Type', 'Subtype']);

  /** Achica las imágenes que se dibujan en estas hojas. Devuelve cuántas. */
  /** Achica una imagen (`u`: su referencia y a qué tamaño se ve). true si se
   *  cambió; si no se sabe leer, lo que pesa (número); si no, false. */
  async function achicarImagen(salida, u, comp) {
    const ctx = salida.context;
    {
      const obj = ctx.lookup(u.ref);
      if (!(obj instanceof PDFRawStream) || obj.contents.length < 12 * 1024) return false;
      let lienzo = null;
      try { lienzo = await imagenALienzo(ctx, obj); } catch (e) { lienzo = null; }
      if (!lienzo) return obj.contents.length;   // no se sabe leer: lo que pesa, para decirlo
      const W = lienzo.width, H = lienzo.height;
      // a la resolución a la que se ve en la hoja, nunca más grande que la original
      const ppp = comp.ppp;
      const quiere = Math.max((u.w / 72) * ppp / W, (u.h / 72) * ppp / H);
      const k = Math.min(1, quiere > 0 ? quiere : 1);
      const nw = Math.max(1, Math.round(W * k)), nh = Math.max(1, Math.round(H * k));
      const chico = document.createElement('canvas');
      chico.width = nw; chico.height = nh;
      const c2 = chico.getContext('2d', { willReadFrequently: !!comp.bn });
      c2.fillStyle = '#fff'; c2.fillRect(0, 0, nw, nh);
      c2.imageSmoothingQuality = 'high';
      c2.drawImage(lienzo, 0, 0, nw, nh);
      lienzo.width = lienzo.height = 0;
      let nuevo = null;
      if (comp.bn && typeof CompressionStream === 'function') {
        const pppImg = u.w > 0 ? nw / (u.w / 72) : ppp;
        const bits = aBlancoYNegro(c2.getImageData(0, 0, nw, nh).data, nw, nh, pppImg);
        if (bits) nuevo = { datos: await desinflar(bits), dic: { ColorSpace: 'DeviceGray', BitsPerComponent: 1, Filter: 'FlateDecode' } };
      }
      if (!nuevo) {
        // una foto de verdad: en JPEG. En «Blanco y negro», como las hojas
        // que son fotos, a 150 ppp para que no pese más que en «Ligero».
        let fuente = chico;
        if (comp.bn) {
          const k2 = Math.min(1, 150 / ppp);
          fuente = document.createElement('canvas');
          fuente.width = Math.max(1, Math.round(nw * k2)); fuente.height = Math.max(1, Math.round(nh * k2));
          const c3 = fuente.getContext('2d');
          c3.imageSmoothingQuality = 'high';
          c3.drawImage(chico, 0, 0, fuente.width, fuente.height);
        }
        nuevo = { datos: G.dataUrlABytes(fuente.toDataURL('image/jpeg', comp.calidad || 0.7)), W: fuente.width, H: fuente.height,
          dic: { ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' } };
        if (fuente !== chico) fuente.width = fuente.height = 0;
      }
      chico.width = chico.height = 0;
      // solo si de verdad pesa menos
      if (nuevo.datos.length >= obj.contents.length * 0.85) return false;
      const dic = ctx.obj(Object.assign({ Type: 'XObject', Subtype: 'Image', Width: nuevo.W || nw, Height: nuevo.H || nh, Length: nuevo.datos.length }, nuevo.dic));
      for (const [clave, valor] of obj.dict.entries()) if (!CLAVES_QUE_CAMBIAN.has(nombreDe(clave))) dic.set(clave, valor);
      ctx.assign(u.ref, PDFRawStream.of(dic, nuevo.datos));
      return true;
    }
  }

  /* ---------- lo repetido, una sola vez ----------
     Al unir PDF de varios archivos, cada uno trae sus letras y sus logos:
     la misma letra puede ir guardada diez veces. Se deja una y las demás
     apuntan a ella («deduplicar», lo llaman los compresores). */
  function juntarRepetidos(salida) {
    const ctx = salida.context;
    const huella = (b) => { let h = 2166136261; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
    const iguales = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const primero = new Map(), cambio = new Map();
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.contents.length < 512) continue;
      const clave = obj.dict.toString() + '|' + obj.contents.length + '|' + huella(obj.contents);
      const ya = primero.get(clave);
      if (ya && iguales(ctx.lookup(ya).contents, obj.contents)) cambio.set(ref.toString(), ya);
      else if (!ya) primero.set(clave, ref);
    }
    if (!cambio.size) return 0;
    const cambiar = (v) => {
      if (v instanceof PDFRef) return cambio.get(v.toString()) || null;
      if (v instanceof PDFDict) { for (const [k, x] of v.entries()) { const n = cambiar(x); if (n) v.set(k, n); } }
      else if (v instanceof PDFArray) { for (let i = 0; i < v.size(); i++) { const n = cambiar(v.get(i)); if (n) v.set(i, n); } }
      else if (v instanceof PDFStream) cambiar(v.dict);
      return null;
    };
    for (const [, obj] of ctx.enumerateIndirectObjects()) cambiar(obj);
    for (const r of cambio.keys()) {
      const [num, gen] = r.split(' ');
      ctx.delete(PDFRef.of(parseInt(num, 10), parseInt(gen, 10)));
    }
    return cambio.size;
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
    //     Las que tienen texto se copian y luego se les achican las
    //     imágenes (1d); en «Mínimo» también se redibujan, salvo las que
    //     pesan por sus imágenes —un escaneo con texto buscable, una ficha
    //     con fotos—, que así conservan su texto.
    const aligerar = new Set();
    if (comp) {
      for (let i = 0; i < paginas.length; i++) {
        if (!(await G.tieneTexto(paginas[i]))) { aligerar.add(i); continue; }
        if (comp.tambienConTexto && (await pesoImagenes(paginas[i]).catch(() => 0)) <= PESO_ESCANEO) aligerar.add(i);
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

    // 1c. armar el documento EN ORDEN: cada hoja, copiada o redibujada. El
    //     avance cuenta TODAS las hojas: las escaneadas se redibujan y a las
    //     de texto se les achican las imágenes, cada una en su turno.
    const porAligerar = aligerar.size;
    const tal = paginas.length - porAligerar;
    // a qué tamaño se ve cada imagen, contando todas las hojas donde aparece
    const usos = comp ? medirImagenes(salida.context, paginas.map((_, i) => copiadas[i]).filter(Boolean)) : new Map();
    const hechasImg = new Set();
    let imagenesAchicadas = 0;
    const sinSaber = { n: 0, peso: 0 };   // imágenes que no se saben leer
    for (let i = 0; i < paginas.length; i++) {
      if (comp && paginas.length > 3) avisar(`Comprimiendo hoja ${i + 1} de ${paginas.length}…`);
      if (!aligerar.has(i)) {
        salida.addPage(copiadas[i]);
        if (comp) {
          for (const clave of medirImagenes(salida.context, [copiadas[i]]).keys()) {
            if (hechasImg.has(clave) || !usos.has(clave)) continue;
            hechasImg.add(clave);
            const r = await achicarImagen(salida, usos.get(clave), comp);
            if (r === true) imagenesAchicadas++;
            else if (typeof r === 'number') { sinSaber.n++; sinSaber.peso += r; }
          }
        }
        continue;
      }
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


    // 1d. lo repetido entre archivos, una sola vez
    if (comp) juntarRepetidos(salida);

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

      // Enderezar una hoja torcida: se gira lo que ya traía la hoja, y nada
      // más. Los folios y las firmas se ponen después, derechos. En el PDF el
      // giro va contra el reloj, porque ahí el eje «y» sube.
      if (est.enderezo) {
        const r = (-est.enderezo * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
        const cx = OX + W / 2, cy = OY + H / 2;
        pag.node.normalize();
        const antes = salida.context.register(pag.createContentStream(pushGraphicsState(),
          concatTransformationMatrix(co, si, -si, co, cx - co * cx + si * cy, cy - si * cx - co * cy)));
        const despues = salida.context.register(pag.createContentStream(popGraphicsState()));
        pag.node.wrapContentStreams(antes, despues);
      }

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
    salida.setProducer('Pdflash · taller de PDF');
    salida.setCreator('Pdflash');
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
          aligeradas: 0, intactas: paginas.length, sinMejora: true, sinSaber,
          antes: Math.round(antes), despues: limpio.length,
        });
      }
      return limpio;
    }

    if (opciones.informe) {
      opciones.informe({
        aligeradas: porAligerar, intactas: tal, imagenes: imagenesAchicadas, sinSaber,
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

  /* Cuando Pdflash corre publicada como página de Claude, el marco no deja que
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
