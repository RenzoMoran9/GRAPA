/* ===========================================================
   Pdflash · lector PaddleOCR (PP-OCRv5) dentro de un Worker
   Corre aparte de la pantalla, con ONNX Runtime Web (WebAssembly).
   Dos modelos: uno ENCUENTRA los renglones en la hoja (detección) y
   otro LEE cada renglón (reconocimiento, letra latina: español con
   tildes y eñes). No usa internet: los modelos le llegan en bytes.

   Este código va pegado detrás de ONNX Runtime (ort.wasm.bundle.min.mjs, con su
   «export» cambiado por una constante `ort`) en un solo Worker: abierto con doble
   clic (file://) el navegador no deja que un Worker cargue otras piezas.

   Mensajes:
     → { tipo: 'iniciar', wasm (bytes del motor), det, rec, dic }
     ← { tipo: 'listo' } | { tipo: 'error', mensaje }
     → { tipo: 'leer', id, imagen (ImageBitmap), maxAncho?, soloTitulos? }
     ← { tipo: 'leida', id, palabras: [{ t, x0, y0, x1, y1, c }] }   (fracciones de la imagen)
   =========================================================== */
let det = null, rec = null, dic = null;

const DET_LADO = 1536;        // lado mayor al buscar renglones (múltiplo de 32)
const DET_UMBRAL = 0.3;       // probabilidad para que un punto sea letra
const DET_CAJA = 0.55;        // probabilidad media para aceptar un renglón
const DESPEGUE = 1.5;         // cuánto se agranda la caja hallada (unclip de PaddleOCR)
const REC_ALTO = 48;
const REC_ANCHO_MAX = 3200;
const LOTE = 8;

async function iniciar(m) {
  /* global ort */
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = m.wasm;
  const op = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  det = await ort.InferenceSession.create(new Uint8Array(m.det), op);
  rec = await ort.InferenceSession.create(new Uint8Array(m.rec), op);
  // índice 0 = «en blanco» de CTC; al final va el espacio. Los renglones vacíos del
  // diccionario (el primero lo es) no son letras
  dic = [''].concat(m.dic.split(/\r?\n/).filter((l) => l.length), [' ']);
}

/* ---------- 1. dónde hay renglones ---------- */

function pixeles(img, w, h, sx, sy, sw, sh) {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (sw != null) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  else ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

async function detectar(img) {
  const W = img.width, H = img.height;
  const esc = Math.min(1, DET_LADO / Math.max(W, H));
  const w = Math.max(32, Math.round((W * esc) / 32) * 32), h = Math.max(32, Math.round((H * esc) / 32) * 32);
  const d = pixeles(img, w, h);
  const n = w * h;
  const t = new Float32Array(3 * n);
  const media = [0.485, 0.456, 0.406], desv = [0.229, 0.224, 0.225];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    // PaddleOCR trabaja en BGR
    t[i] = (d[j + 2] / 255 - media[0]) / desv[0];
    t[n + i] = (d[j + 1] / 255 - media[1]) / desv[1];
    t[2 * n + i] = (d[j] / 255 - media[2]) / desv[2];
  }
  const sal = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, h, w]) });
  const p = sal[det.outputNames[0]].data;

  // manchas de puntos «letra», cada una un renglón (o un trozo)
  const marca = new Int32Array(n);
  const cajas = [];
  const pila = new Int32Array(n);
  for (let i0 = 0; i0 < n; i0++) {
    if (marca[i0] || p[i0] <= DET_UMBRAL) continue;
    let tope = 0, cuenta = 0, suma = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    pila[tope++] = i0;
    marca[i0] = 1;
    while (tope) {
      const i = pila[--tope];
      const x = i % w, y = (i / w) | 0;
      cuenta++; suma += p[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && !marca[i - 1] && p[i - 1] > DET_UMBRAL) { marca[i - 1] = 1; pila[tope++] = i - 1; }
      if (x < w - 1 && !marca[i + 1] && p[i + 1] > DET_UMBRAL) { marca[i + 1] = 1; pila[tope++] = i + 1; }
      if (y > 0 && !marca[i - w] && p[i - w] > DET_UMBRAL) { marca[i - w] = 1; pila[tope++] = i - w; }
      if (y < h - 1 && !marca[i + w] && p[i + w] > DET_UMBRAL) { marca[i + w] = 1; pila[tope++] = i + w; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (Math.min(bw, bh) < 3 || suma / cuenta < DET_CAJA) continue;
    // la mancha es el «corazón» del texto: se agranda como hace PaddleOCR
    const dd = (bw * bh * DESPEGUE) / (2 * (bw + bh));
    const fx = W / w, fy = H / h;
    cajas.push({
      x0: Math.max(0, (x0 - dd) * fx), x1: Math.min(W, (x1 + 1 + dd) * fx),
      y0: Math.max(0, (y0 - dd) * fy), y1: Math.min(H, (y1 + 1 + dd) * fy),
      // el alto de la letra, sin el agrandado
      ly0: Math.max(0, (y0 - dd * 0.35) * fy), ly1: Math.min(H, (y1 + 1 + dd * 0.35) * fy),
    });
  }
  return cajas;
}

/* ---------- 2. leer cada renglón ---------- */

async function reconocer(img, cajas) {
  const items = cajas.map((b) => {
    const sw = b.x1 - b.x0, sh = b.y1 - b.y0;
    const ancho = Math.max(8, Math.min(REC_ANCHO_MAX, Math.round((REC_ALTO * sw) / sh)));
    return { b, sw, sh, ancho };
  }).filter((it) => it.sw >= 2 && it.sh >= 2);
  // los de ancho parecido van juntos: se rellena menos
  items.sort((a, b) => a.ancho - b.ancho);
  const palabras = [];
  for (let k = 0; k < items.length; k += LOTE) {
    const lote = items.slice(k, k + LOTE);
    const W = Math.ceil(Math.max(...lote.map((it) => it.ancho)) / 8) * 8;
    const N = lote.length, plano = REC_ALTO * W;
    const t = new Float32Array(N * 3 * plano);   // el relleno queda en 0, como en PaddleOCR
    lote.forEach((it, q) => {
      const d = pixeles(img, it.ancho, REC_ALTO, it.b.x0, it.b.y0, it.sw, it.sh);
      const base = q * 3 * plano;
      for (let y = 0; y < REC_ALTO; y++) {
        for (let x = 0; x < it.ancho; x++) {
          const j = (y * it.ancho + x) * 4, i = y * W + x;
          t[base + i] = (d[j + 2] / 255 - 0.5) / 0.5;
          t[base + plano + i] = (d[j + 1] / 255 - 0.5) / 0.5;
          t[base + 2 * plano + i] = (d[j] / 255 - 0.5) / 0.5;
        }
      }
    });
    const sal = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', t, [N, 3, REC_ALTO, W]) });
    const o = sal[rec.outputNames[0]];
    const [, T, C] = o.dims;
    const v = o.data;
    lote.forEach((it, q) => {
      const pasos = Math.min(T, Math.ceil((it.ancho / W) * T) + 1);
      const letras = [];
      let previo = 0;
      for (let s = 0; s < pasos; s++) {
        const off = (q * T + s) * C;
        let mejor = 0, pm = v[off];
        for (let c = 1; c < C; c++) if (v[off + c] > pm) { pm = v[off + c]; mejor = c; }
        if (mejor && mejor !== previo) letras.push({ ch: dic[mejor] || '', p: pm, s });
        previo = mejor;
      }
      partirEnPalabras(letras, it, W / T, palabras);
    });
  }
  return palabras;
}

/** Junta las letras leídas en palabras con su lugar en la hoja (por el paso de CTC de cada letra). */
function partirEnPalabras(letras, it, pasoPx, salida) {
  const aHoja = (s) => it.b.x0 + ((s + 0.5) * pasoPx * it.sw) / it.ancho;
  const medio = (pasoPx * it.sw) / it.ancho;   // un paso de CTC, en puntos de la hoja
  let actual = [];
  const cerrar = () => {
    if (!actual.length) return;
    const t = actual.map((l) => l.ch).join('');
    const xa = aHoja(actual[0].s), xb = aHoja(actual[actual.length - 1].s);
    const ancho = actual.length > 1 ? (xb - xa) / (actual.length - 1) : (it.b.ly1 - it.b.ly0) * 0.55;
    salida.push({
      t,
      x0: Math.max(it.b.x0, xa - Math.max(medio, ancho * 0.5)),
      x1: Math.min(it.b.x1, xb + Math.max(medio, ancho * 0.5)),
      y0: it.b.ly0, y1: it.b.ly1,
      c: actual.reduce((s, l) => s + l.p, 0) / actual.length,
    });
    actual = [];
  };
  // el paso típico entre dos letras seguidas: un hueco bastante mayor es un espacio que el
  // modelo no escribió (o el salto entre columnas de una tabla)
  const pasos = [];
  for (let i = 1; i < letras.length; i++) if (letras[i].ch !== ' ' && letras[i - 1].ch !== ' ') pasos.push(letras[i].s - letras[i - 1].s);
  pasos.sort((a, b) => a - b);
  const tipico = pasos.length ? pasos[pasos.length >> 1] : 2;
  const hueco = Math.max(4, tipico * 2.6);
  letras.forEach((l, i) => {
    if (l.ch === ' ' || (actual.length && l.s - letras[i - 1].s > hueco)) cerrar();
    if (l.ch !== ' ' && l.ch) actual.push(l);
  });
  cerrar();
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tipo === 'iniciar') {
      await iniciar(m);
      self.postMessage({ tipo: 'listo' });
    } else if (m.tipo === 'leer') {
      const img = m.imagen;
      const t0 = performance.now();
      let cajas = await detectar(img);
      // `maxAncho`: los renglones más anchos que esa fracción de la imagen no se leen (al
      // buscar solo un título, los párrafos sobran)
      if (m.maxAncho) cajas = cajas.filter((b) => b.x1 - b.x0 <= img.width * m.maxAncho);
      // `soloTitulos`: solo lo que puede ser un título: lo corto, o lo centrado de largo mediano
      if (m.soloTitulos) {
        cajas = cajas.filter((b) => {
          const proporcion = (b.x1 - b.x0) / Math.max(1, b.ly1 - b.ly0);
          const centro = (b.x0 + b.x1) / 2 / img.width;
          return proporcion <= 12 || (proporcion <= 32 && centro > 0.3 && centro < 0.7);
        });
      }
      const t1 = performance.now();
      const palabras = await reconocer(img, cajas);
      const W = img.width, H = img.height;
      palabras.forEach((p) => { p.x0 /= W; p.x1 /= W; p.y0 /= H; p.y1 /= H; });
      if (img.close) img.close();
      self.postMessage({ tipo: 'leida', id: m.id, palabras, ms: { det: t1 - t0, rec: performance.now() - t1, cajas: cajas.length } });
    }
  } catch (err) {
    self.postMessage({ tipo: 'error', id: m.id, mensaje: String((err && err.message) || err) });
  }
};
