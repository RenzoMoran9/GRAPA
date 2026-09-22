/* ===========================================================
   Grapa · buscar dentro del expediente
   Lee el texto de cada hoja una sola vez y encuentra en qué hojas
   aparece una palabra, y en qué sitio de la hoja, para resaltarla.
   Todo en el navegador, como el resto.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});

  /* ---------- normalizar: que «Cotización» y «COTIZACION» sean lo mismo ----
     Se quitan tildes y mayúsculas, y no cuentan ni los espacios ni los
     signos. Los espacios valen poco en un PDF: unos traen «R U C» letra a
     letra, otros pegan «RUC:20131257750». Y quien busca no escribe los
     signos: «razon social distribuidora» tiene que dar con «Razón social:
     Distribuidora», y «1250» con «S/ 1,250.00». */
  const EQUIVALENTES = new Map([['º', '°'], ['˚', '°']]);
  const MARCAS = /\p{M}/gu;
  const NO_CUENTA = /[\s\p{P}´`¨]/u;

  /** Una letra del documento en su forma de comparar: '' si no cuenta. */
  function formaDe(c) {
    if (NO_CUENTA.test(c)) return '';
    const e = EQUIVALENTES.get(c);
    if (e) return e;
    // NFKD también abre las ligaduras que traen muchos PDF: «ﬁ» pasa a «fi»
    return c.normalize('NFKD').replace(MARCAS, '').toLowerCase();
  }

  const formas = new Map();
  const formaGuardada = (c) => {
    let f = formas.get(c);
    if (f === undefined) { f = formaDe(c); formas.set(c, f); }
    return f;
  };

  /** Normaliza guardando de qué letra original sale cada letra normalizada. */
  function normalizar(texto) {
    let norm = '';
    const mapa = [];
    for (let i = 0; i < texto.length; i++) {
      const f = formaGuardada(texto[i]);
      for (let k = 0; k < f.length; k++) { norm += f[k]; mapa.push(i); }
    }
    return { norm, mapa };
  }
  G.normalizarParaBuscar = (s) => normalizar(String(s || '')).norm;

  /* ---------- ancho aproximado de cada letra ----
     pdf.js da el ancho del trozo entero, no el de cada letra. Repartirlo a
     partes iguales ponía el resaltado corrido en cuanto había una «m» o
     una «i»; se reparte según lo que mide cada letra en una letra común. */
  let lienzoMedir = null;
  const anchoLetra = new Map();
  function medida(c) {
    if (anchoLetra.has(c)) return anchoLetra.get(c);
    if (!lienzoMedir) {
      lienzoMedir = document.createElement('canvas').getContext('2d');
      lienzoMedir.font = '100px Helvetica, Arial, sans-serif';
    }
    const w = lienzoMedir.measureText(c).width || 50;
    anchoLetra.set(c, w);
    return w;
  }

  /* ---------- el texto de una hoja ---------- */
  const indice = new Map();     // 'fuenteId:indice' -> hoja leída
  const enCurso = new Map();    // misma clave -> promesa, para no leerla dos veces

  const claveDe = (pagina) => pagina.fuenteId + ':' + pagina.indice;

  /**
   * Junta los trozos de texto de la hoja en una sola cadena, sabiendo de qué
   * trozo y de qué letra sale cada carácter. Entre trozos se pone un espacio
   * o un salto de renglón según dónde caen, para que el contexto que se
   * enseña en la lista se lea como una frase y no como «RUC:20131257750S.A.».
   */
  function juntar(items) {
    let texto = '';
    const origen = [];          // por carácter: [trozo, letra] o null
    let previo = null;
    items.forEach((it, n) => {
      const s = it.str;
      if (previo) {
        let sep = '';
        if (previo.hasEOL) sep = '\n';
        else if (!/\s$/.test(previo.str) && !/^\s/.test(s)) {
          const [a, b] = previo.transform;
          const largo = Math.hypot(a, b) || 1;
          const dx = a / largo, dy = b / largo;
          const finX = previo.transform[4] + dx * previo.width;
          const finY = previo.transform[5] + dy * previo.width;
          const vx = it.transform[4] - finX, vy = it.transform[5] - finY;
          const avance = vx * dx + vy * dy;
          const salto = Math.abs(-vx * dy + vy * dx);
          const alto = previo.height || largo;
          if (salto > alto * 0.6) sep = '\n';
          else if (avance > alto * 0.2) sep = ' ';
        }
        for (let k = 0; k < sep.length; k++) { texto += sep[k]; origen.push(null); }
      }
      for (let k = 0; k < s.length; k++) { texto += s[k]; origen.push([n, k]); }
      if (s.length || it.hasEOL) previo = it;
    });
    return { texto, origen };
  }

  async function leerHoja(pagina) {
    const k = claveDe(pagina);
    if (indice.has(k)) return indice.get(k);
    if (enCurso.has(k)) return enCurso.get(k);
    const p = (async () => {
      let hoja;
      try {
        const fuente = G.estado.fuentes.get(pagina.fuenteId);
        const pag = await fuente.doc.getPage(pagina.indice + 1);
        const tc = await pag.getTextContent();
        // la hoja sin girar: las cajas se guardan así y se giran al pintarlas,
        // para que girar una hoja no obligue a leerla otra vez
        const vp = pag.getViewport({ scale: 1, rotation: 0 });
        const items = tc.items
          .filter((it) => typeof it.str === 'string')
          .map((it) => ({
            str: it.str, transform: it.transform, width: it.width,
            height: it.height, hasEOL: !!it.hasEOL,
          }));
        const { texto, origen } = juntar(items);
        const { norm, mapa } = normalizar(texto);
        const letras = texto.replace(/\s/g, '').length;
        hoja = {
          items, texto, origen, norm, mapa,
          // un par de letras sueltas puede ser basura del escáner
          conTexto: letras >= 20,
          vista: { t: vp.transform.slice(), w: vp.width, h: vp.height },
        };
      } catch (e) {
        hoja = { items: [], texto: '', origen: [], norm: '', mapa: [], conTexto: false, fallo: true,
                 vista: { t: [1, 0, 0, -1, 0, 0], w: 1, h: 1 } };
      }
      indice.set(k, hoja);
      enCurso.delete(k);
      return hoja;
    })();
    enCurso.set(k, p);
    return p;
  }

  /** ¿Ya se leyeron todas estas hojas? */
  G.buscadorListo = (paginas) => paginas.every((p) => indice.has(claveDe(p)));

  /**
   * Lee las hojas que falten. De a una: pdf.js sin worker (con Grapa abierta
   * con doble clic) trabaja en el hilo de la página, y así la interfaz sigue
   * respondiendo entre hoja y hoja.
   */
  G.prepararBusqueda = async function (paginas, alProgresar) {
    const vistas = new Set();
    const faltan = paginas.filter((p) => {
      const k = claveDe(p);
      if (indice.has(k) || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    for (let i = 0; i < faltan.length; i++) {
      await leerHoja(faltan[i]);
      if (alProgresar) alProgresar(i + 1, faltan.length);
    }
    return faltan.length;
  };

  /* ---------- dónde cae cada coincidencia en la hoja ---------- */
  function aplicar(t, x, y) {
    return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
  }

  /** Caja de las letras [desde, hasta) del trozo, en fracciones de la hoja sin girar. */
  function cajaDeTrozo(it, desde, hasta, vista) {
    const [a, b, c, d, e, f] = it.transform;
    const largo = Math.hypot(a, b) || 1;
    const dx = a / largo, dy = b / largo;
    const alto = it.height || Math.hypot(c, d) || largo;
    const letras = Array.from(it.str);
    // Array.from separa por puntos de código; las posiciones vienen en
    // unidades UTF-16. Para los textos de estos documentos coinciden, y si no,
    // se reparte a partes iguales, que también sirve.
    let total = 0;
    const acumulado = [0];
    const usarMedidas = letras.length === it.str.length;
    for (let k = 0; k < it.str.length; k++) {
      total += usarMedidas ? medida(it.str[k]) : 1;
      acumulado.push(total);
    }
    const ancho = it.width > 0 ? it.width : it.str.length * alto * 0.5;
    const s0 = total ? (acumulado[desde] / total) * ancho : 0;
    const s1 = total ? (acumulado[hasta] / total) * ancho : ancho;
    // un poco por debajo de la línea base (las colas de la «p» y la «g») y
    // hasta lo alto de las mayúsculas
    const abajo = -0.24 * alto, arriba = 0.92 * alto;
    const esquinas = [[s0, abajo], [s1, abajo], [s0, arriba], [s1, arriba]].map(([s, h]) =>
      aplicar(vista.t, e + dx * s - dy * h, f + dy * s + dx * h));
    const xs = esquinas.map((p) => p[0]), ys = esquinas.map((p) => p[1]);
    return {
      x0: Math.max(0, Math.min(...xs) / vista.w), x1: Math.min(1, Math.max(...xs) / vista.w),
      y0: Math.max(0, Math.min(...ys) / vista.h), y1: Math.min(1, Math.max(...ys) / vista.h),
    };
  }

  /** Cajas de un tramo del texto de la hoja: una por cada trozo que toca. */
  function cajasDe(hoja, o0, o1) {
    const cajas = [];
    let trozo = -1, desde = 0, hasta = 0;
    const cerrar = () => {
      if (trozo >= 0) cajas.push(cajaDeTrozo(hoja.items[trozo], desde, hasta, hoja.vista));
    };
    for (let i = o0; i < o1; i++) {
      const o = hoja.origen[i];
      if (!o) continue;
      if (o[0] !== trozo) { cerrar(); trozo = o[0]; desde = o[1]; }
      hasta = o[1] + 1;
    }
    cerrar();
    return cajas;
  }

  /** Un trozo de la frase alrededor de la coincidencia, para la lista. */
  function contexto(texto, o0, o1) {
    const MARGEN = 42;
    let a = Math.max(0, o0 - MARGEN), b = Math.min(texto.length, o1 + MARGEN);
    // no empezar ni acabar a media palabra
    if (a > 0) { const sp = texto.slice(a, o0).search(/\s/); if (sp >= 0) a += sp + 1; }
    if (b < texto.length) { const sp = texto.slice(o1, b).search(/\s\S*$/); if (sp >= 0) b = o1 + sp; }
    const limpio = (s) => s.replace(/\s+/g, ' ');
    return {
      antes: (a > 0 ? '…' : '') + limpio(texto.slice(a, o0)).trimStart(),
      dentro: limpio(texto.slice(o0, o1)),
      despues: limpio(texto.slice(o1, b)).trimEnd() + (b < texto.length ? '…' : ''),
    };
  }

  /**
   * Busca en las hojas dadas, en su orden. Devuelve cada coincidencia con su
   * hoja, sus cajas y su contexto, y aparte las hojas sin texto, donde no hay
   * nada en qué buscar (las escaneadas).
   */
  G.buscarEnHojas = function (paginas, consulta, opciones) {
    const tope = (opciones && opciones.tope) || 5000;
    const q = normalizar(String(consulta || '')).norm;
    const hallazgos = [];
    const sinTexto = [];
    const porHoja = new Map();  // uid -> cuántas veces, también las que pasan del tope
    let total = 0;
    if (!q) return { hallazgos, sinTexto, porHoja, total, consulta: q };
    paginas.forEach((pagina) => {
      const hoja = indice.get(claveDe(pagina));
      if (!hoja) return;
      if (!hoja.conTexto) sinTexto.push(pagina);
      let desde = 0;
      for (;;) {
        const i = hoja.norm.indexOf(q, desde);
        if (i < 0) break;
        desde = i + q.length;
        total++;
        porHoja.set(pagina.uid, (porHoja.get(pagina.uid) || 0) + 1);
        if (hallazgos.length >= tope) continue;
        const o0 = hoja.mapa[i];
        const o1 = hoja.mapa[i + q.length - 1] + 1;
        hallazgos.push({ pagina, cajas: cajasDe(hoja, o0, o1), ...contexto(hoja.texto, o0, o1) });
      }
    });
    return { hallazgos, sinTexto, porHoja, total, consulta: q };
  };

  /**
   * Gira una caja guardada sin girar para la hoja tal como se ve. El giro es
   * el de la hoja en Grapa, que es absoluto: el mismo que usa la miniatura.
   */
  G.girarCaja = function (c, giro) {
    switch (G.norm(giro || 0)) {
      case 90: return { x0: 1 - c.y1, x1: 1 - c.y0, y0: c.x0, y1: c.x1 };
      case 180: return { x0: 1 - c.x1, x1: 1 - c.x0, y0: 1 - c.y1, y1: 1 - c.y0 };
      case 270: return { x0: c.y0, x1: c.y1, y0: 1 - c.x1, y1: 1 - c.x0 };
      default: return c;
    }
  };

  G.olvidarBusqueda = () => { indice.clear(); enCurso.clear(); };
})();
