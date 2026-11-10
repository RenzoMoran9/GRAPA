/* ===========================================================
   Pdflash · corregir un escaneo con su propia letra

   Un escaneo es una foto: su texto es tinta gris, algo borrosa, sobre un
   papel con grano. Escribirle encima con una letra de computadora, nítida y
   negra, se nota siempre, por parecida que sea.

   Aquí la corrección se hace con lo que ya hay en la hoja:
     · lo que no cambia del renglón se queda como está, con sus puntos;
     · cada letra nueva se copia de una letra igual de la misma hoja (primero
       del mismo renglón): misma tinta, mismo grosor, mismo desenfoque;
     · lo que venía detrás se corre a su sitio, también con sus puntos;
     · el hueco se rellena con el papel de al lado, con su grano;
     · solo si una letra no existe en toda la hoja se dibuja, buscando entre
       las letras de la computadora la que más se parece a las del papel y
       dándole su color y su desenfoque.

   Trabaja sobre la hoja dibujada en grande y devuelve un recorte (PNG) con
   el renglón rehecho y dónde va, en fracciones de la hoja.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});

  const mediana = (v) => { if (!v.length) return 0; const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

  /**
   * Mira un renglón: su papel, su tinta, la franja que ocupa y sus letras
   * (cada mancha de tinta separada de la de al lado por una columna en blanco).
   * `img` es un trozo de la hoja ({d, w, h}); `c`, la caja del renglón en él.
   */
  function mirarRenglon(img, c) {
    const { d, w, h } = img;
    // el papel: el color que más se repite
    const cuenta = new Map();
    for (let i = 0; i < d.length; i += 16) {
      const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
      const v = cuenta.get(k) || [0, 0, 0, 0];
      v[0]++; v[1] += d[i]; v[2] += d[i + 1]; v[3] += d[i + 2];
      cuenta.set(k, v);
    }
    let mejor = null;
    cuenta.forEach((v) => { if (!mejor || v[0] > mejor[0]) mejor = v; });
    const papel = [mejor[1] / mejor[0], mejor[2] / mejor[0], mejor[3] / mejor[0]];
    const lejos = (i) => Math.abs(d[i] - papel[0]) + Math.abs(d[i + 1] - papel[1]) + Math.abs(d[i + 2] - papel[2]);
    // la tinta de un escaneo no es negra: el corte se pone a media distancia de lo más oscuro
    let tope = 0;
    for (let y = Math.max(0, c.y0); y < Math.min(h, c.y1); y++) for (let x = Math.max(0, c.x0); x < Math.min(w, c.x1); x++) tope = Math.max(tope, lejos((y * w + x) * 4));
    if (tope < 60) return null;
    const corte = Math.max(45, Math.min(120, tope * 0.42));
    const m = new Uint8Array(w * h);
    for (let k = 0, i = 0; k < m.length; k++, i += 4) m[k] = lejos(i) > corte ? 1 : 0;

    // las rayas de una tabla: un trazo seguido mucho más largo que una letra
    const altoCaja = Math.max(4, c.y1 - c.y0);
    const filaRaya = new Uint8Array(h), colRaya = new Uint8Array(w);
    for (let y = 0; y < h; y++) {
      let run = 0, mayor = 0;
      for (let x = 0; x < w; x++) { run = m[y * w + x] ? run + 1 : 0; if (run > mayor) mayor = run; }
      if (mayor > Math.max(altoCaja * 3, 60)) filaRaya[y] = 1;
    }
    for (let x = 0; x < w; x++) {
      let run = 0, mayor = 0;
      for (let y = 0; y < h; y++) { run = m[y * w + x] ? run + 1 : 0; if (run > mayor) mayor = run; }
      // de arriba abajo del trozo, que lleva aire por encima y por debajo: el palo de una letra no llega
      if (mayor > h * 0.8) colRaya[x] = 1;
    }
    const gorda = (v) => { const r = new Uint8Array(v.length); for (let i = 0; i < v.length; i++) if (v[i]) { r[i] = 1; if (i) r[i - 1] = 1; if (i + 1 < v.length) r[i + 1] = 1; } return r; };
    const fR = gorda(filaRaya), cR = gorda(colRaya);
    const tinta = (x, y) => !fR[y] && !cR[x] && m[y * w + x];

    // la franja del renglón: de la tinta que hay en la caja, y lo que se salga un poco
    let y0 = h, y1 = -1, x0 = w, x1 = -1;
    for (let y = Math.max(0, c.y0); y < Math.min(h, c.y1); y++) for (let x = Math.max(0, c.x0); x < Math.min(w, c.x1); x++) {
      if (!tinta(x, y)) continue;
      if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x;
    }
    if (y1 < 0) return null;
    const fila = (y) => { for (let x = x0; x <= x1; x++) if (tinta(x, y)) return true; return false; };
    const columna = (x) => { for (let y = y0; y <= y1; y++) if (tinta(x, y)) return true; return false; };
    const sube = Math.round(altoCaja * 0.3), lado = Math.round(altoCaja * 0.5);
    const a0 = y0, b0 = y1, i0 = x0, d0 = x1;
    let hubo = true;
    while (hubo) {
      hubo = false;
      if (y0 > 0 && a0 - y0 < sube && !fR[y0 - 1] && fila(y0 - 1)) { y0--; hubo = true; }
      if (y1 < h - 1 && y1 - b0 < sube && !fR[y1 + 1] && fila(y1 + 1)) { y1++; hubo = true; }
      if (x0 > 0 && i0 - x0 < lado && !cR[x0 - 1] && columna(x0 - 1)) { x0--; hubo = true; }
      if (x1 < w - 1 && x1 - d0 < lado && !cR[x1 + 1] && columna(x1 + 1)) { x1++; hubo = true; }
    }
    // La caja del lector a veces deja fuera la primera o la última letra entera. Si a un paso
    // corto (lo que separa dos letras, no dos palabras) sigue habiendo tinta, también es del renglón.
    const salto = Math.max(2, Math.round(altoCaja * 0.2)), lejosMax = Math.round(altoCaja * 1.6);
    const sigue = (desde, paso) => {
      for (let k = 1; k <= salto; k++) {
        const x = desde + paso * k;
        if (x < 0 || x >= w || cR[x]) return -1;
        if (columna(x)) return x;
      }
      return -1;
    };
    for (let n = sigue(x0, -1); n >= 0 && i0 - n < lejosMax; n = sigue(x0, -1)) { x0 = n; while (x0 > 0 && !cR[x0 - 1] && columna(x0 - 1)) x0--; }
    for (let n = sigue(x1, 1); n >= 0 && n - d0 < lejosMax; n = sigue(x1, 1)) { x1 = n; while (x1 < w - 1 && !cR[x1 + 1] && columna(x1 + 1)) x1++; }

    // las letras: tramos de columnas con tinta
    const letras = [];
    let ini = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const hay = x <= x1 && columna(x);
      if (hay && ini < 0) ini = x;
      if (!hay && ini >= 0) {
        let ya = y1, yb = y0;
        for (let xx = ini; xx < x; xx++) for (let y = y0; y <= y1; y++) if (tinta(xx, y)) { if (y < ya) ya = y; if (y > yb) yb = y; }
        letras.push({ x0: ini, x1: x - 1, y0: ya, y1: yb });
        ini = -1;
      }
    }
    if (!letras.length) return null;

    // el color de la tinta: el de sus puntos más oscuros
    let n = 0, tr = 0, tg = 0, tb = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (!tinta(x, y) || lejos(i) < tope * 0.7) continue;
      n++; tr += d[i]; tg += d[i + 1]; tb += d[i + 2];
    }
    const colorTinta = n ? [tr / n, tg / n, tb / n] : [40, 40, 40];

    // por dónde corre el renglón: la mediana de las pendientes entre los pies de sus letras
    const pend = [];
    for (let a = 0; a < letras.length; a++) for (let b = a + 4; b < letras.length; b += 3) {
      pend.push((letras[b].y1 - letras[a].y1) / (letras[b].x0 - letras[a].x0));
    }
    const cuesta = pend.length >= 6 ? mediana(pend) : 0;
    const pie = mediana(letras.map((l) => l.y1 - cuesta * (l.x0 - x0)));     // pie de la letra en x0

    const proy = new Uint16Array(w);
    for (let x = x0; x <= x1; x++) { let k = 0; for (let y = y0; y <= y1; y++) if (tinta(x, y)) k++; proy[x] = k; }
    return { papel, colorTinta, corte, m, fR, cR, tinta, proy, x0, x1, y0, y1, letras, cuesta, pie, alto: y1 - y0 + 1 };
  }

  const lapiz = document.createElement('canvas').getContext('2d');
  /** Lo que avanza cada letra de un texto en una letra corriente: sirve de proporción. */
  function avances(texto) {
    lapiz.font = '100px Arial, "Liberation Sans", sans-serif';
    return Array.from(texto).map((ch) => Math.max(8, lapiz.measureText(ch).width));
  }

  /**
   * Reparte la tinta del renglón entre las palabras y las letras del texto leído.
   *
   * Las palabras se separan por los huecos grandes. Dentro de cada palabra,
   * las letras de un escaneo borroso se tocan y no hay columna en blanco
   * entre ellas: se sabe qué letras son (el texto) y cuánto ocupa cada una
   * en proporción, así que cada corte se busca cerca de donde tocaría, en la
   * columna con menos tinta.
   *
   * Devuelve las palabras de la hoja, cada una con la palabra del texto que
   * le corresponde (`de`, o -1) y, si se pudo, sus letras una por una.
   */
  function repartir(r, texto) {
    const dichas = texto.split(/\s+/).filter(Boolean);
    const L = r.letras;
    if (!dichas.length || !L.length) return null;
    const huecos = [];
    for (let i = 1; i < L.length; i++) huecos.push(L[i].x0 - L[i - 1].x1 - 1);
    const entre = huecos.length ? Math.max(1, mediana(huecos)) : 1;
    let corte = Math.max(entre * 2.2, r.alto * 0.16);
    // si con ese corte no salen las palabras del texto, se prueba con los N−1 huecos mayores
    const partir = (umbral) => {
      const g = [[L[0]]];
      for (let i = 1; i < L.length; i++) { if (huecos[i - 1] > umbral) g.push([]); g[g.length - 1].push(L[i]); }
      return g;
    };
    let grupos = partir(corte);
    if (grupos.length !== dichas.length && dichas.length > 1 && huecos.length >= dichas.length - 1) {
      const orden = huecos.slice().sort((a, b) => b - a);
      const u = orden[dichas.length - 2], sig = orden[dichas.length - 1] || 0;
      if (u > sig * 1.25 && u > r.alto * 0.1) { const g2 = partir((u + sig) / 2); if (g2.length === dichas.length) { grupos = g2; corte = (u + sig) / 2; } }
    }
    const vistas = grupos.map((gl) => ({ x0: gl[0].x0, x1: gl[gl.length - 1].x1, manchas: gl, de: -1, letras: null }));
    const espacios = [];
    for (let i = 1; i < vistas.length; i++) espacios.push(vistas[i].x0 - vistas[i - 1].x1 - 1);

    // qué palabra del texto es cada una: si salen las mismas, una a una; si no, se casan por su ancho
    const anchoDicha = dichas.map((d) => avances(d).reduce((t, v) => t + v, 0));
    if (vistas.length === dichas.length) vistas.forEach((v, i) => { v.de = i; });
    else {
      const tv = vistas.reduce((t, v) => t + (v.x1 - v.x0 + 1), 0), td = anchoDicha.reduce((t, v) => t + v, 0);
      const n = vistas.length, k = dichas.length;
      const costo = (i, j) => Math.abs(Math.log(((vistas[i].x1 - vistas[i].x0 + 1) / tv) / (anchoDicha[j] / td)));
      const T = Array.from({ length: n + 1 }, () => new Float64Array(k + 1)), paso = Array.from({ length: n + 1 }, () => new Uint8Array(k + 1));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= k; j++) {
        if (!i && !j) continue;
        let m = Infinity, q = 0;
        if (i && j) { const c = T[i - 1][j - 1] + Math.min(1.5, costo(i - 1, j - 1) * 2.5); if (c < m) { m = c; q = 1; } }
        if (i) { const c = T[i - 1][j] + 0.8; if (c < m) { m = c; q = 2; } }
        if (j) { const c = T[i][j - 1] + 0.8; if (c < m) { m = c; q = 3; } }
        T[i][j] = m; paso[i][j] = q;
      }
      for (let i = n, j = k; i || j;) {
        const q = paso[i][j];
        if (q === 1) { if (costo(i - 1, j - 1) < 0.3) vistas[i - 1].de = j - 1; i--; j--; } else if (q === 2) i--; else j--;
      }
    }

    // las letras de cada palabra reconocida
    vistas.forEach((v) => {
      if (v.de < 0) return;
      const ch = Array.from(dichas[v.de]);
      v.texto = dichas[v.de]; v.ch = ch;
      const av = avances(dichas[v.de]), total = av.reduce((t, x) => t + x, 0), an = v.x1 - v.x0 + 1;
      const cortes = [v.x0];
      let acum = 0, falla = false;
      for (let k = 0; k < ch.length - 1; k++) {
        acum += av[k];
        const ideal = v.x0 + (acum / total) * an;
        const margen = Math.max(2, Math.min(av[k], av[k + 1]) / total * an * 0.45);
        let mejor = -1, nota = Infinity;
        for (let x = Math.max(cortes[k] + 1, Math.round(ideal - margen)); x <= Math.min(v.x1, Math.round(ideal + margen)); x++) {
          // la columna con menos tinta, y entre iguales la más cercana a donde tocaba
          const q = r.proy[x] * 3 + Math.abs(x - ideal) / margen;
          if (q < nota) { nota = q; mejor = x; }
        }
        if (mejor < 0) { falla = true; break; }
        cortes.push(mejor);
      }
      if (falla) return;
      cortes.push(v.x1 + 1);
      const letras = [];
      for (let k = 0; k < ch.length; k++) {
        let x0 = v.x1, x1 = v.x0, y0 = r.y1, y1 = r.y0, hay = false;
        for (let x = cortes[k]; x < cortes[k + 1]; x++) for (let y = r.y0; y <= r.y1; y++) if (r.tinta(x, y)) {
          hay = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (!hay) return;
        // pegada: si en la columna del corte queda bastante tinta, la letra toca a la de al lado
        letras.push({ x0, x1, y0, y1, c0: cortes[k], c1: cortes[k + 1] - 1 });
      }
      v.letras = letras;
    });
    return {
      entreLetras: entre, espacio: espacios.length ? mediana(espacios) : Math.round(r.alto * 0.32),
      palabras: vistas, dichas,
    };
  }

  /* ---------- letras de la computadora, para lo que no está en la hoja ---------- */

  const POSIBLES = ['Arial', 'Arial Narrow', 'Calibri', 'Tahoma', 'Verdana', 'Segoe UI', 'Times New Roman',
    'Liberation Sans', 'Liberation Sans Narrow', 'Liberation Serif', 'DejaVu Sans'];
  /** De esas, las que este equipo tiene (las que no, saldrían todas con la misma letra de relleno). */
  let instaladas = null;
  function candidatas() {
    if (instaladas) return instaladas;
    const prueba = 'mmmmiiiiWWWWlllloooo0123';
    const mide = (f) => { lapiz.font = `100px ${f}`; return lapiz.measureText(prueba).width; };
    const base = { 'monospace': mide('monospace'), 'serif': mide('serif') };
    instaladas = POSIBLES.filter((f) => mide(`"${f}", monospace`) !== base.monospace || mide(`"${f}", serif`) !== base.serif);
    if (!instaladas.length) instaladas = ['sans-serif'];
    return instaladas;
  }

  /** ¿Se parece esta mancha de la hoja a esa letra? (para no copiar una letra mal leída) */
  function distanciaALetra(q) {
    let mejor = Infinity;
    ['Arial', 'Liberation Sans'].forEach((fuente) => [false, true].forEach((negrita) => {
      const f = formaDibujada(q.ch, fuente, negrita);
      if (!f) return;
      let dif = 0;
      for (let k = 0; k < f.rejilla.length; k++) dif += Math.abs(f.rejilla[k] - q.rejilla[k]);
      // y la proporción: el trozo de un paréntesis no es un guion aunque los dos sean una mancha llena
      mejor = Math.min(mejor, dif / f.rejilla.length + 0.3 * Math.min(1.5, Math.abs(Math.log((f.an / f.al) / (q.an / q.al)))));
    }));
    return mejor;
  }
  const lienzoLetra = () => { const c = document.createElement('canvas'); c.width = 260; c.height = 200; return c; };

  /** Una letra dibujada a 100 px: su caja de tinta y su forma reducida a una cuadrícula. */
  const formas = new Map();
  function formaDibujada(ch, fuente, negrita) {
    const k = fuente + '|' + (negrita ? 1 : 0) + '|' + ch;
    if (formas.has(k)) return formas.get(k);
    const c = lienzoLetra(), g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    // un punto desenfocada, como sale una letra de un escáner: si no, toda letra escaneada parecería negrita
    g.filter = 'blur(1.6px)';
    g.fillStyle = '#000'; g.font = `${negrita ? 'bold ' : ''}100px "${fuente}", sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText(ch, 40, 140);
    g.filter = 'none';
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4] > 150) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    let r = null;
    if (x1 >= 0) r = { an: x1 - x0 + 1, al: y1 - y0 + 1, baja: y1 - 140, rejilla: rejilla((x, y) => d[((y0 + y) * c.width + x0 + x) * 4] <= 150, x1 - x0 + 1, y1 - y0 + 1) };
    formas.set(k, r);
    return r;
  }
  /** Reduce una forma a 12 × 16 casillas: cuánta tinta hay en cada una. */
  function rejilla(tinta, an, al) {
    const NX = 12, NY = 16, r = new Float32Array(NX * NY), n = new Float32Array(NX * NY);
    for (let y = 0; y < al; y++) for (let x = 0; x < an; x++) {
      const k = Math.min(NY - 1, Math.floor((y * NY) / al)) * NX + Math.min(NX - 1, Math.floor((x * NX) / an));
      n[k]++; if (tinta(x, y)) r[k]++;
    }
    for (let k = 0; k < r.length; k++) r[k] = n[k] ? r[k] / n[k] : 0;
    return r;
  }

  /** De las letras de la computadora, la que más se parece a las muestras del papel. */
  function letraQueSeParece(muestras) {
    const usar = muestras.filter((q) => /[A-Za-z0-9]/.test(q.ch)).slice(0, 14);
    if (usar.length < 3) return null;
    let mejor = null;
    candidatas().forEach((fuente) => [false, true].forEach((negrita) => {
      let nota = 0, cuantas = 0, ancho = [], alto = [];
      usar.forEach((q) => {
        const f = formaDibujada(q.ch, fuente, negrita);
        if (!f) return;
        let dif = 0;
        for (let k = 0; k < f.rejilla.length; k++) dif += Math.abs(f.rejilla[k] - q.rejilla[k]);
        nota += dif / f.rejilla.length + 0.35 * Math.abs(Math.log((f.an / f.al) / (q.an / q.al)));
        cuantas++;
        alto.push(q.al / f.al); ancho.push((q.an / f.an) / (q.al / f.al));
      });
      if (cuantas < 3) return;
      nota /= cuantas;
      if (!mejor || nota < mejor.nota) mejor = { nota, fuente, negrita, escala: mediana(alto), estira: mediana(ancho) };
    }));
    return mejor;
  }

  /* ---------- rehacer el renglón ---------- */

  /**
   * `lienzo`: la hoja dibujada en grande. `caja`: el renglón, en fracciones.
   * `otros`: los demás renglones de la hoja ({caja, texto}), de donde sacar
   * letras que este no tenga. Devuelve { url, caja } o null si no se pudo
   * (y entonces quien llama deja el texto escrito como antes).
   */
  G.corregirConSuLetra = function (lienzo, caja, viejo, nuevo, otros) {
    try {
      const W = lienzo.width, H = lienzo.height;
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      const pxCaja = { x0: Math.floor(caja.x0 * W), x1: Math.ceil(caja.x1 * W), y0: Math.floor(caja.y0 * H), y1: Math.ceil(caja.y1 * H) };
      const alto = pxCaja.y1 - pxCaja.y0;
      if (alto < 6) return null;
      // el trozo de hoja donde se trabaja: el renglón, con aire arriba y abajo y sitio para crecer
      const aire = Math.round(alto * 0.6);
      // (a la izquierda también: la caja del lector a veces empieza una letra tarde)
      const rx = Math.max(0, pxCaja.x0 - Math.round(alto * 2.6)), ry = Math.max(0, pxCaja.y0 - aire);
      const rw = Math.min(W, pxCaja.x1 + Math.round((pxCaja.x1 - pxCaja.x0) * 0.6) + alto * 6) - rx, rh = Math.min(H, pxCaja.y1 + aire) - ry;
      const datos = ctx.getImageData(rx, ry, rw, rh);
      const img = { d: datos.data, w: rw, h: rh, datos };
      const r = mirarRenglon(img, { x0: pxCaja.x0 - rx, x1: pxCaja.x1 - rx, y0: pxCaja.y0 - ry, y1: pxCaja.y1 - ry });
      if (!r) return null;
      const rep = repartir(r, viejo);
      if (!rep) return null;
      const dichas = rep.dichas, vistas = rep.palabras;
      const nuevas = nuevo.split(/\s+/).filter(Boolean);

      // qué palabras cambian: las de en medio, entre lo que sigue igual por delante y por detrás
      let p = 0, s = 0;
      while (p < dichas.length && p < nuevas.length && dichas[p] === nuevas[p]) p++;
      while (s < dichas.length - p && s < nuevas.length - p && dichas[dichas.length - 1 - s] === nuevas[nuevas.length - 1 - s]) s++;
      if (p === dichas.length && p === nuevas.length) return null;        // no cambió nada
      const q = dichas.length - s;                                         // la primera que vuelve a ser igual
      // dónde está eso en la hoja: hace falta saber cuáles son las palabras de los dos bordes
      const enHoja = dichas.map(() => -1);
      vistas.forEach((v, i) => { if (v.de >= 0) enHoja[v.de] = i; });
      const iIni = p === 0 ? 0 : (enHoja[p - 1] >= 0 ? enHoja[p - 1] + 1 : -1);
      const iFin = q === dichas.length ? vistas.length : enHoja[q];
      if (iIni < 0 || iFin < 0 || iFin < iIni) return null;
      const poner = nuevas.slice(p, nuevas.length - s);
      const hayCola = iFin < vistas.length;
      const entreLetras = rep.entreLetras, espacio = Math.max(2, rep.espacio);
      const xIni = iIni < vistas.length ? vistas[iIni].x0 : vistas[vistas.length - 1].x1 + espacio + 1;
      const xFinViejo = r.x1;

      // las muestras: cada letra del papel que se sabe cuál es, y que de verdad se le parece
      const propio = { img, r };
      const muestras = [];
      const recoger = (origen, reparto, cerca) => {
        if (!reparto) return;
        const suyas = [];
        reparto.palabras.forEach((v) => { if (v.letras) v.letras.forEach((l, k) => { if (/[A-ZÁÉÍÓÚÑ0-9bdfhklt]/.test(v.ch[k])) suyas.push(l.y1 - l.y0 + 1); }); });
        origen.altoLetra = suyas.length ? mediana(suyas) : 0;
        reparto.palabras.forEach((v, vi) => {
          if (!v.letras) return;
          v.letras.forEach((l, k) => {
            const an = l.x1 - l.x0 + 1, al = l.y1 - l.y0 + 1;
            const m = { ch: v.ch[k], origen, l, an, al, cerca, palabra: vi, rejilla: rejilla((x, y) => origen.r.tinta(l.x0 + x, l.y0 + y), an, al) };
            // una mancha que no se parece a su letra es una letra mal leída o mal cortada: no se copia
            m.parecido = distanciaALetra(m);
            if (m.parecido < 0.36) muestras.push(m);
          });
        });
      };
      recoger(propio, rep, 0);
      let conOtros = false;
      const traerOtros = () => {
        if (conOtros) return;
        conOtros = true;
        (otros || []).slice(0, 160).forEach((o) => {
          try {
            const c = { x0: Math.floor(o.caja.x0 * W), x1: Math.ceil(o.caja.x1 * W), y0: Math.floor(o.caja.y0 * H), y1: Math.ceil(o.caja.y1 * H) };
            const al = c.y1 - c.y0;
            if (al < 6 || al > alto * 1.6 || al < alto * 0.6) return;
            const ox = Math.max(0, c.x0 - al), oy = Math.max(0, c.y0 - Math.round(al * 0.6));
            const ow = Math.min(W, c.x1 + al) - ox, oh = Math.min(H, c.y1 + Math.round(al * 0.6)) - oy;
            const od = ctx.getImageData(ox, oy, ow, oh);
            const oimg = { d: od.data, w: ow, h: oh, datos: od };
            const or = mirarRenglon(oimg, { x0: c.x0 - ox, x1: c.x1 - ox, y0: c.y0 - oy, y1: c.y1 - oy });
            if (or) recoger({ img: oimg, r: or }, repartir(or, o.texto), 1);
          } catch (e) { /* un renglón que no se deja mirar no aporta letras */ }
        });
      };
      // lo que mide una letra alta de este renglón: de otro renglón solo sirven letras del mismo cuerpo
      let altoLetra = propio.altoLetra;
      if (!altoLetra) { traerOtros(); altoLetra = r.alto * 0.78; }
      const buscar = (ch, palabraVieja) => {
        const sirve = (m) => m.ch === ch && (m.cerca === 0 || (m.origen.altoLetra && Math.abs(m.origen.altoLetra - altoLetra) <= altoLetra * 0.1));
        let c0 = muestras.filter(sirve);
        if (!c0.length) { traerOtros(); c0 = muestras.filter(sirve); }
        if (!c0.length) return null;
        // primero de la misma palabra que se corrige, luego del mismo renglón, y entre iguales la más parecida
        c0.sort((a, b) => (a.cerca - b.cerca) || ((a.palabra === palabraVieja ? 0 : 1) - (b.palabra === palabraVieja ? 0 : 1)) || (a.parecido - b.parecido));
        return c0[0];
      };

      // 1. qué va en cada sitio
      //    · una palabra que ya estaba se lleva entera, con sus puntos;
      //    · una nueva se arma letra a letra con copias; la letra que no exista en la hoja se dibuja
      let parecida, buscada = false;
      const dibujada = () => {
        if (!buscada) {
          buscada = true; traerOtros();
          parecida = letraQueSeParece(muestras.filter((m) => m.cerca === 0).concat(muestras.filter((m) => m.cerca)));
        }
        const fuente = parecida ? parecida.fuente : 'Arial', negrita = parecida ? parecida.negrita : false;
        const H0 = formaDibujada('H', fuente, negrita);
        return { fuente, negrita, tam: (100 * altoLetra) / (H0 ? H0.al : 72), estira: parecida ? Math.min(1.2, Math.max(0.72, parecida.estira)) : 1 };
      };
      const piezas = [];
      let sig = iIni;
      poner.forEach((pal) => {
        let igual = -1;
        for (let i = sig; i < iFin; i++) if (vistas[i].de >= 0 && vistas[i].texto === pal) { igual = i; break; }
        if (igual >= 0) {
          sig = igual + 1;
          piezas.push({ tipo: 'bloque', v: vistas[igual], an: vistas[igual].x1 - vistas[igual].x0 + 1 });
          return;
        }
        const propia = sig < iFin ? sig : -1;
        const letras = Array.from(pal).map((ch) => {
          const m = buscar(ch, propia);
          if (m) return { m, an: m.an };
          const dd = dibujada();
          lapiz.font = `${dd.negrita ? 'bold ' : ''}${dd.tam}px "${dd.fuente}", sans-serif`;
          return { ch, dd, an: Math.max(1, Math.round(lapiz.measureText(ch).width * dd.estira) - entreLetras) };
        });
        piezas.push({ tipo: 'letras', letras, an: letras.reduce((t, x) => t + x.an, 0) + entreLetras * (letras.length - 1) });
      });

      // 2. cuánto ocupa lo nuevo, y si cabe: a la derecha puede haber otra columna o una raya
      const hueco = (desdeX, paso) => {
        let n = 0;
        for (let x = desdeX; x >= 0 && x < rw; x += paso) {
          let ocupado = r.cR[x];
          for (let y = r.y0; y <= r.y1 && !ocupado; y++) if (r.m[y * rw + x] && !r.fR[y]) ocupado = 1;
          if (ocupado) break;
          n++;
        }
        return n;
      };
      let largo = piezas.reduce((t, x) => t + x.an, 0) + espacio * Math.max(0, piezas.length - 1);
      const largoCola = hayCola ? (xFinViejo - vistas[iFin].x0 + 1) + (piezas.length ? espacio : 0) : 0;
      const soloNumero = !hayCola && iIni === 0 && /^[\s\d.,:%$S/+-]+$/.test(viejo) && /\d/.test(viejo);
      let aprieta = 1;
      if (soloNumero) {
        // un número: arrimado a la derecha; si no cabe hacia la izquierda, se estrecha
        const cabe = (xFinViejo - r.x0 + 1) + Math.max(0, hueco(r.x0 - 1, -1) - Math.round(r.alto * 0.4));
        if (largo > cabe) aprieta = Math.max(0.6, cabe / largo);
      } else {
        const sitio = (xFinViejo - xIni + 1) + Math.max(0, hueco(xFinViejo + 1, 1) - Math.round(r.alto * 0.5));
        if (largo + largoCola > sitio && largo > 0) aprieta = Math.max(0.6, (sitio - largoCola) / largo);
      }
      largo = Math.round(largo * aprieta);
      const desde = soloNumero ? xFinViejo + 1 - largo : xIni;
      const xFinNuevo = desde + largo + largoCola - 1;

      // 3. el renglón nuevo, sobre una copia del trozo de hoja
      const lienzoDe = (origen) => {
        if (!origen.lienzo) {
          origen.lienzo = document.createElement('canvas');
          origen.lienzo.width = origen.img.w; origen.lienzo.height = origen.img.h;
          origen.lienzo.getContext('2d').putImageData(origen.img.datos, 0, 0);
        }
        return origen.lienzo;
      };
      const obra = document.createElement('canvas');
      obra.width = rw; obra.height = rh;
      const g = obra.getContext('2d', { willReadFrequently: true });
      g.drawImage(lienzoDe(propio), 0, 0);

      // borrar: de donde empieza el cambio al final, con el papel de justo al lado (con su grano)
      // con margen: el borde de una letra escaneada se difumina un par de puntos más allá de su tinta
      const halo = Math.max(3, Math.round(r.alto * 0.16));
      const b0 = Math.max(0, Math.min(desde, xIni) - halo), b1 = Math.min(rw - 1, Math.max(xFinViejo, xFinNuevo) + halo);
      const f0 = Math.max(0, r.y0 - Math.max(2, halo - 1)), f1 = Math.min(rh - 1, r.y1 + Math.max(2, halo - 1));
      const sal = g.getImageData(0, 0, rw, rh), sd = sal.data;
      for (let x = b0; x <= b1; x++) {
        if (r.cR[x]) continue;                   // la raya de la tabla se queda
        // un tramo limpio de papel en esta columna, encima o debajo del renglón
        let de = -1, cuanto = 0;
        const probar = (ya, yb) => {
          let ini = -1;
          for (let y = ya; y <= yb + 1; y++) {
            const limpio = y <= yb && y >= 0 && y < rh && !r.m[y * rw + x] && !r.fR[y];
            if (limpio && ini < 0) ini = y;
            if (!limpio && ini >= 0) { if (y - ini > cuanto) { cuanto = y - ini; de = ini; } ini = -1; }
          }
        };
        probar(0, f0 - 1); probar(f1 + 1, rh - 1);
        for (let y = f0; y <= f1; y++) {
          if (r.fR[y]) continue;
          const o = (y * rw + x) * 4;
          if (cuanto >= 3) {
            // se repite ese tramo, ida y vuelta, para que no se note la costura
            let k = (y - f0) % (2 * cuanto - 2 || 1);
            if (k >= cuanto) k = 2 * cuanto - 2 - k;
            const i = ((de + k) * rw + x) * 4;
            sd[o] = img.d[i]; sd[o + 1] = img.d[i + 1]; sd[o + 2] = img.d[i + 2]; sd[o + 3] = 255;
          } else { sd[o] = r.papel[0]; sd[o + 1] = r.papel[1]; sd[o + 2] = r.papel[2]; sd[o + 3] = 255; }
        }
      }
      g.putImageData(sal, 0, 0);

      // poner. De cada recorte viaja solo la tinta (lo demás es papel de otro sitio y dejaría un
      // recuadro): opaca en la letra y, en su borde difuminado, lo que le toque.
      const soloTinta = (origen, sx, sy, sw, sh) => {
        const t = document.createElement('canvas');
        t.width = sw; t.height = sh;
        const tg = t.getContext('2d', { willReadFrequently: true });
        tg.drawImage(lienzoDe(origen), sx, sy, sw, sh, 0, 0, sw, sh);
        const pd = tg.getImageData(0, 0, sw, sh), pp = origen.r.papel, cc = origen.r.corte, ow = origen.img.w;
        for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) {
          const k = (yy * sw + xx) * 4;
          if (origen.r.cR[sx + xx] || origen.r.fR[sy + yy]) { pd.data[k + 3] = 0; continue; }
          const dist = Math.abs(pd.data[k] - pp[0]) + Math.abs(pd.data[k + 1] - pp[1]) + Math.abs(pd.data[k + 2] - pp[2]);
          pd.data[k + 3] = origen.r.m[(sy + yy) * ow + sx + xx] ? 255 : Math.max(0, Math.min(255, Math.round(((dist - cc * 0.25) / (cc * 0.75)) * 255)));
        }
        tg.putImageData(pd, 0, 0);
        return t;
      };
      const pieEn = (x) => r.pie + r.cuesta * (x - r.x0);
      const ponerLetra = (m, dx, k) => {
        const o = m.origen, l = m.l;
        // de corte a corte: si la letra toca a su vecina, no se lleva un trozo de ella
        const sx = Math.max(0, Math.max(l.x0 - 1, l.c0)), sy = Math.max(0, l.y0 - 1);
        const sw = Math.min(o.img.w, Math.min(l.x1 + 2, l.c1 + 1)) - sx, sh = Math.min(o.img.h, l.y1 + 2) - sy;
        if (sw < 1 || sh < 1) return;
        // apoyada en la raya de este renglón igual que lo estaba en el suyo
        const pieOrigen = o.r.pie + o.r.cuesta * (l.x0 - o.r.x0);
        g.drawImage(soloTinta(o, sx, sy, sw, sh), 0, 0, sw, sh, dx - (l.x0 - sx), Math.round(pieEn(dx) - (pieOrigen - sy)), Math.max(1, Math.round(sw * k)), sh);
      };
      const ponerBloque = (x0, x1, dx) => {
        const sx = Math.max(0, x0 - 1), sw = Math.min(rw, x1 + 2) - sx;
        const dy = Math.round(r.cuesta * (dx - x0));
        g.drawImage(soloTinta(propio, sx, f0, sw, f1 - f0 + 1), dx - (x0 - sx), f0 + dy);
      };
      let x = desde;
      piezas.forEach((pz, i) => {
        if (i) x += Math.round(espacio * aprieta);
        if (pz.tipo === 'bloque') {
          ponerBloque(pz.v.x0, pz.v.x1, x);
        } else {
          let lx = x;
          pz.letras.forEach((it) => {
            if (it.m) ponerLetra(it.m, lx, aprieta);
            else {
              // dibujada: con la letra que más se parece a las del papel, su color y su desenfoque
              const dd = it.dd, tc = document.createElement('canvas');
              tc.width = Math.ceil(it.an * 2 + dd.tam); tc.height = rh;
              const tg = tc.getContext('2d');
              tg.filter = `blur(${Math.max(0.3, altoLetra / 38).toFixed(2)}px)`;
              tg.fillStyle = `rgb(${r.colorTinta.map((v) => Math.round(v)).join(',')})`;
              tg.font = `${dd.negrita ? 'bold ' : ''}${dd.tam}px "${dd.fuente}", sans-serif`;
              tg.textBaseline = 'alphabetic';
              tg.setTransform(dd.estira * aprieta, 0, 0, 1, 8, 0);
              tg.fillText(it.ch, 0, pieEn(lx) + 1);
              g.drawImage(tc, lx - 8, 0);
            }
            lx += Math.round((it.an + entreLetras) * aprieta);
          });
        }
        x += Math.round(pz.an * aprieta);
      });
      // y lo que venía detrás, corrido a su sitio con sus mismos puntos
      if (hayCola) {
        if (piezas.length) x += espacio;
        ponerBloque(vistas[iFin].x0, xFinViejo, x);
      }

      // 4. el recorte que se lleva: solo lo que se tocó
      const cy0 = Math.max(0, f0 - 2), cy1 = Math.min(rh - 1, f1 + 2);
      const fin = document.createElement('canvas');
      fin.width = b1 - b0 + 1; fin.height = cy1 - cy0 + 1;
      fin.getContext('2d').drawImage(obra, b0, cy0, fin.width, fin.height, 0, 0, fin.width, fin.height);
      const sueltas = piezas.reduce((t, pz) => t + (pz.letras ? pz.letras.filter((it) => !it.m).length : 0), 0);
      return {
        url: fin.toDataURL('image/png'),
        caja: { x: (rx + b0) / W, y: (ry + cy0) / H, w: fin.width / W, h: fin.height / H },
        dibujadas: sueltas, letra: sueltas && parecida ? parecida.fuente + (parecida.negrita ? ' negrita' : '') : null,
        muestras: muestras.length,
      };
    } catch (e) {
      console.warn('No se pudo corregir con la letra de la hoja', e);
      return null;
    }
  };
})();
