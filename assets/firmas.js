/* ===========================================================
   Grapa · firmas y sellos
   Creación de firmas transparentes a partir de escaneos,
   imágenes o trazos hechos a mano.
   =========================================================== */
(function () {
  'use strict';
  const G = window.Grapa;
  const $ = (s, r) => (r || document).querySelector(s);

  /* ---------- limpieza del fondo ---------- */

  /** Umbral de Otsu sobre un histograma de 256 casillas. */
  function otsu(hist, total) {
    let suma = 0;
    for (let i = 0; i < 256; i++) suma += i * hist[i];
    let sumaB = 0, pesoB = 0, mejor = 0, mejorVar = -1;
    for (let t = 0; t < 256; t++) {
      pesoB += hist[t];
      if (!pesoB) continue;
      const pesoF = total - pesoB;
      if (!pesoF) break;
      sumaB += t * hist[t];
      const mediaB = sumaB / pesoB;
      const mediaF = (suma - sumaB) / pesoF;
      const entre = pesoB * pesoF * (mediaB - mediaF) * (mediaB - mediaF);
      if (entre > mejorVar) { mejorVar = entre; mejor = t; }
    }
    return mejor;
  }

  /**
   * Estima el color del papel zona por zona. Un escaneo real casi nunca es
   * blanco parejo: hay sombras, papel gris y fotos de celular con un lado
   * más oscuro que el otro. Tomamos un percentil alto de luminancia por
   * celdas, ensanchamos con un máximo local para que el trazo no arrastre
   * el fondo hacia abajo, suavizamos y lo devolvemos a tamaño completo.
   */
  function fondoLocal(lum, w, h) {
    const paso = Math.max(6, Math.round(Math.min(w, h) / 10));
    const cw = Math.max(1, Math.ceil(w / paso));
    const ch = Math.max(1, Math.ceil(h / paso));
    const rejilla = new Float32Array(cw * ch);
    const hist = new Uint32Array(256);

    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        hist.fill(0);
        let n = 0;
        const x1 = Math.min(w, (cx + 1) * paso), y1 = Math.min(h, (cy + 1) * paso);
        for (let y = cy * paso; y < y1; y += 2) {
          for (let x = cx * paso; x < x1; x += 2) {
            hist[lum[y * w + x] | 0]++; n++;
          }
        }
        let objetivo = n * 0.85, acum = 0, v = 255;
        for (let i = 0; i < 256; i++) { acum += hist[i]; if (acum >= objetivo) { v = i; break; } }
        rejilla[cy * cw + cx] = n ? v : 255;
      }
    }

    // máximo local: el papel nunca debe estimarse por debajo del trazo
    const dilatada = new Float32Array(cw * ch);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const y = cy + dy; if (y < 0 || y >= ch) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx; if (x < 0 || x >= cw) continue;
            const v = rejilla[y * cw + x]; if (v > m) m = v;
          }
        }
        dilatada[cy * cw + cx] = m;
      }
    }

    // suavizado para que no se noten las celdas
    let a = dilatada, b = new Float32Array(cw * ch);
    for (let paseo = 0; paseo < 2; paseo++) {
      for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const y = cy + dy; if (y < 0 || y >= ch) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const x = cx + dx; if (x < 0 || x >= cw) continue;
              s += a[y * cw + x]; n++;
            }
          }
          b[cy * cw + cx] = s / n;
        }
      }
      const t = a; a = b; b = t;
    }

    // vuelta a tamaño completo, bilineal
    const fondo = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(ch - 1, Math.max(0, (y + 0.5) / paso - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(ch - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(cw - 1, Math.max(0, (x + 0.5) / paso - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(cw - 1, x0 + 1), tx = fx - x0;
        const arriba = a[y0 * cw + x0] * (1 - tx) + a[y0 * cw + x1] * tx;
        const abajo  = a[y1 * cw + x0] * (1 - tx) + a[y1 * cw + x1] * tx;
        fondo[y * w + x] = arriba * (1 - ty) + abajo * ty;
      }
    }
    return fondo;
  }

  /** Borra manchitas sueltas (polvo del escáner) sin tocar el trazo. */
  function quitaMotitas(px, w, h, minPix) {
    const visto = new Uint8Array(w * h);
    const pila = new Int32Array(w * h);
    const grupo = new Int32Array(1024);
    for (let inicio = 0; inicio < w * h; inicio++) {
      if (visto[inicio] || px[inicio * 4 + 3] <= 90) continue;
      let cima = 0, n = 0, desbordado = false;
      pila[cima++] = inicio;
      visto[inicio] = 1;
      while (cima > 0) {
        const i = pila[--cima];
        if (n < grupo.length) grupo[n] = i; else desbordado = true;
        n++;
        if (desbordado) continue;          // ya es grande: no hay que borrarlo
        const x = i % w, y = (i / w) | 0;
        if (x > 0     && !visto[i - 1] && px[(i - 1) * 4 + 3] > 90) { visto[i - 1] = 1; pila[cima++] = i - 1; }
        if (x < w - 1 && !visto[i + 1] && px[(i + 1) * 4 + 3] > 90) { visto[i + 1] = 1; pila[cima++] = i + 1; }
        if (y > 0     && !visto[i - w] && px[(i - w) * 4 + 3] > 90) { visto[i - w] = 1; pila[cima++] = i - w; }
        if (y < h - 1 && !visto[i + w] && px[(i + w) * 4 + 3] > 90) { visto[i + w] = 1; pila[cima++] = i + w; }
      }
      if (!desbordado && n < minPix) {
        for (let k = 0; k < n; k++) px[grupo[k] * 4 + 3] = 0;
      }
    }
  }

  /**
   * Deja el trazo y vuelve transparente el papel.
   *
   * No hay un umbral fijo: se estima el papel de cada zona de la imagen y
   * se mide cuánto más oscuro que su papel es cada píxel. Así funciona
   * igual con una hoja blanca escaneada que con una foto de celular sobre
   * papel gris y con sombra.
   *
   * @param {HTMLCanvasElement} origen
   * @param {{limpieza:number, intensidad:number, mono:boolean,
   *          recortar:boolean, motitas:boolean}} opciones
   *          limpieza e intensidad van de 0 a 1; 0.5 es el punto automático.
   * @returns {{dataUrl:string, ancho:number, alto:number, vacia:boolean}}
   */
  G.limpiarFondo = function (origen, opciones) {
    const o = Object.assign(
      { limpieza: 0.5, intensidad: 0.5, mono: false, recortar: true, motitas: true },
      opciones || {}
    );
    const ctx = origen.getContext('2d', { willReadFrequently: true });
    const w = origen.width, h = origen.height;
    const datos = ctx.getImageData(0, 0, w, h);
    const px = datos.data;
    const total = w * h;

    // 1. luminancia
    const lum = new Float32Array(total);
    for (let i = 0, j = 0; i < total; i++, j += 4) {
      lum[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
    }

    // 2. papel estimado por zonas
    const fondo = fondoLocal(lum, w, h);

    // 3. distancia al papel, y su histograma
    const dist = new Float32Array(total);
    const hist = new Uint32Array(256);
    for (let i = 0; i < total; i++) {
      let d = fondo[i] - lum[i];
      if (d < 0) d = 0; else if (d > 255) d = 255;
      dist[i] = d;
      hist[d | 0]++;
    }

    // 4. corte automático entre papel y tinta
    let dT = otsu(hist, total);
    if (dT < 12) dT = 12; else if (dT > 140) dT = 140;

    // 5. los dos extremos se mueven por separado: subir la limpieza borra
    //    más papel sin que el trazo pierda cuerpo.
    const lim = Math.min(1, Math.max(0, o.limpieza));
    const inten = Math.min(1, Math.max(0, o.intensidad));
    const u0 = dT * (0.15 + 0.75 * lim);
    let u1 = dT * (1.6 - 1.0 * inten);
    if (u1 < u0 + dT * 0.15) u1 = u0 + dT * 0.15;
    const rango = u1 - u0;

    // 6. color medio del papel, para poder despejar el color real de la tinta
    let pr = 0, pg = 0, pb = 0, np = 0;
    const limitePapel = u0 * 0.6;
    for (let i = 0, j = 0; i < total; i++, j += 4) {
      if (dist[i] <= limitePapel) { pr += px[j]; pg += px[j + 1]; pb += px[j + 2]; np++; }
    }
    if (np > total * 0.02) { pr /= np; pg /= np; pb /= np; } else { pr = pg = pb = 255; }
    const lumPapel = Math.max(1, 0.299 * pr + 0.587 * pg + 0.114 * pb);

    // 7. opacidad y color
    let tinta = 0;
    for (let i = 0, j = 0; i < total; i++, j += 4) {
      let a = (dist[i] - u0) / rango;
      a = a <= 0 ? 0 : a >= 1 ? 1 : a;
      px[j + 3] = (a * 255) | 0;
      if (a > 0.5) tinta++;
      if (o.mono) { px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; continue; }
      if (a > 0.15) {
        // el píxel es papel y tinta mezclados: despejamos la tinta
        const k = Math.min(1, (a - 0.15) / 0.35);
        const escala = fondo[i] / lumPapel;
        const p = [pr * escala, pg * escala, pb * escala];
        for (let c = 0; c < 3; c++) {
          let v = (px[j + c] - p[c] * (1 - a)) / a;
          v = v < 0 ? 0 : v > 255 ? 255 : v;
          px[j + c] = (px[j + c] * (1 - k) + v * k) | 0;
        }
      }
    }

    // 8. motitas
    if (o.motitas) quitaMotitas(px, w, h, Math.max(3, Math.round(Math.min(w, h) * 0.005)));

    // 9. recorte de los márgenes vacíos
    let x0 = 0, y0 = 0, x1 = w, y1 = h;
    if (o.recortar && tinta) {
      const filas = new Uint32Array(h), cols = new Uint32Array(w);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3] > 70) { filas[y]++; cols[x]++; }
        }
      }
      const minFila = Math.max(1, Math.round(w * 0.002));
      const minCol = Math.max(1, Math.round(h * 0.002));
      while (y0 < h && filas[y0] < minFila) y0++;
      while (y1 > y0 + 1 && filas[y1 - 1] < minFila) y1--;
      while (x0 < w && cols[x0] < minCol) x0++;
      while (x1 > x0 + 1 && cols[x1 - 1] < minCol) x1--;
      if (x1 - x0 < 4 || y1 - y0 < 4) { x0 = 0; y0 = 0; x1 = w; y1 = h; }
      const margen = Math.round(Math.max(w, h) * 0.012);
      x0 = Math.max(0, x0 - margen); y0 = Math.max(0, y0 - margen);
      x1 = Math.min(w, x1 + margen); y1 = Math.min(h, y1 + margen);
    }

    const salida = document.createElement('canvas');
    salida.width = x1 - x0;
    salida.height = y1 - y0;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d').putImageData(datos, 0, 0);
    salida.getContext('2d').drawImage(tmp, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height);

    return {
      dataUrl: salida.toDataURL('image/png'),
      ancho: salida.width,
      alto: salida.height,
      vacia: tinta < total * 0.0004,
    };
  };

  /* ---------- alta / baja en la biblioteca ---------- */
  G.guardarFirma = function (nombre, dataUrl, ancho, alto) {
    const firma = {
      id: 'firma-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nombre: (nombre || '').trim() || 'Firma ' + (G.estado.firmas.length + 1),
      dataUrl, ancho, alto,
    };
    G.estado.firmas.push(firma);
    G.estado.firmaActiva = firma.id;
    const ok = G.almacen.escribir(G.estado.firmas);
    if (G.alCambiarFirmas) G.alCambiarFirmas(ok);
    return firma;
  };

  G.borrarFirma = function (id) {
    G.estado.firmas = G.estado.firmas.filter((f) => f.id !== id);
    if (G.estado.firmaActiva === id) G.estado.firmaActiva = G.estado.firmas[0] ? G.estado.firmas[0].id : null;
    G.almacen.escribir(G.estado.firmas);
    if (G.alCambiarFirmas) G.alCambiarFirmas(true);
  };

  G.firmaPorId = (id) => G.estado.firmas.find((f) => f.id === id) || null;

  /* ---------- importar desde imagen ---------- */
  G.firmaDesdeArchivo = function (file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 1600;
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  };

  /* =========================================================
     MODAL · recortar firma desde un escaneo
     ========================================================= */
  const rec = {
    fuente: null,      // canvas con la página renderizada
    giro: 0,
    marco: null,       // {x,y,w,h} en fracciones del lienzo
    arrastre: null,
    temporizador: null,
  };

  function elRec() {
    return {
      modal: $('#modalRecorte'),
      envoltura: $('#recorteEnvoltura'),
      lienzo: $('#recorteLienzo'),
      marco: $('#recorteMarco'),
      origen: $('#recorteOrigen'),
      limpieza: $('#recorteLimpieza'),
      intensidad: $('#recorteIntensidad'),
      motitas: $('#recorteMotitas'),
      mono: $('#recorteMono'),
      recortar: $('#recorteRecortar'),
      previa: $('#recortePrevia'),
      vacio: $('#recorteVacio'),
      nombre: $('#recorteNombre'),
    };
  }

  G.abrirRecorte = async function (paginaPreferida) {
    const e = elRec();
    if (!G.estado.paginas.length) {
      G.aviso('Primero abre el PDF escaneado que contiene tu firma.', 'error');
      return;
    }
    e.origen.innerHTML = G.estado.paginas
      .map((p, i) => {
        const f = G.estado.fuentes.get(p.fuenteId);
        return `<option value="${p.uid}">Página ${i + 1} · ${G.escapaHtml(f ? f.nombre : '')}</option>`;
      })
      .join('');
    const inicial = paginaPreferida || G.estado.paginas[0];
    e.origen.value = inicial.uid;
    rec.giro = 0;
    rec.marco = null;
    e.marco.hidden = true;
    e.previa.removeAttribute('src');
    e.nombre.value = '';
    e.modal.hidden = false;
    await cargarPaginaRecorte();
  };

  async function cargarPaginaRecorte() {
    const e = elRec();
    const pagina = G.estado.paginas.find((p) => p.uid === e.origen.value);
    if (!pagina) return;
    G.cargando(true, 'Preparando la página…');
    try {
      const virtual = Object.assign({}, pagina, { giro: G.norm(pagina.giro + rec.giro) });
      const lienzo = await G.renderGrande(virtual, 1700);
      rec.fuente = lienzo;
      e.lienzo.width = lienzo.width;
      e.lienzo.height = lienzo.height;
      e.lienzo.getContext('2d').drawImage(lienzo, 0, 0);
      e.marco.hidden = true;
      rec.marco = null;
      e.previa.removeAttribute('src');
    } catch (err) {
      G.aviso('No se pudo mostrar la página: ' + err.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  function pintaMarco() {
    const e = elRec();
    if (!rec.marco) { e.marco.hidden = true; return; }
    e.marco.hidden = false;
    e.marco.style.left = rec.marco.x * 100 + '%';
    e.marco.style.top = rec.marco.y * 100 + '%';
    e.marco.style.width = rec.marco.w * 100 + '%';
    e.marco.style.height = rec.marco.h * 100 + '%';
  }

  function actualizaPrevia() {
    clearTimeout(rec.temporizador);
    rec.temporizador = setTimeout(() => {
      const e = elRec();
      if (!rec.fuente || !rec.marco) { e.previa.removeAttribute('src'); e.vacio.hidden = true; return; }
      const sx = Math.round(rec.marco.x * rec.fuente.width);
      const sy = Math.round(rec.marco.y * rec.fuente.height);
      const sw = Math.max(4, Math.round(rec.marco.w * rec.fuente.width));
      const sh = Math.max(4, Math.round(rec.marco.h * rec.fuente.height));
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(rec.fuente, sx, sy, sw, sh, 0, 0, sw, sh);
      const res = G.limpiarFondo(c, {
        limpieza: Number(e.limpieza.value) / 100,
        intensidad: Number(e.intensidad.value) / 100,
        motitas: e.motitas.checked,
        mono: e.mono.checked,
        recortar: e.recortar.checked,
      });
      rec.resultado = res;
      e.previa.src = res.dataUrl;
      e.vacio.hidden = !res.vacia;
    }, 90);
  }

  function iniciaRecorteUI() {
    const e = elRec();
    if (!e.modal) return;

    e.origen.addEventListener('change', cargarPaginaRecorte);
    $('#btnRecorteGirar').addEventListener('click', async () => {
      rec.giro = G.norm(rec.giro + 90);
      await cargarPaginaRecorte();
    });
    $('#btnRecorteTodo').addEventListener('click', () => {
      rec.marco = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
      pintaMarco();
      actualizaPrevia();
    });
    [e.limpieza, e.intensidad, e.motitas, e.mono, e.recortar]
      .forEach((c) => c.addEventListener('input', actualizaPrevia));
    $('#btnRecorteAuto').addEventListener('click', () => {
      e.limpieza.value = 50;
      e.intensidad.value = 50;
      e.motitas.checked = true;
      actualizaPrevia();
    });

    const rect = () => e.envoltura.getBoundingClientRect();
    const frac = (ev) => {
      const r = rect();
      return {
        x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
      };
    };

    e.envoltura.addEventListener('pointerdown', (ev) => {
      if (ev.target.classList.contains('tirador')) {
        rec.arrastre = { modo: 'tam' };
      } else if (ev.target === e.marco) {
        const p = frac(ev);
        rec.arrastre = { modo: 'mover', dx: p.x - rec.marco.x, dy: p.y - rec.marco.y };
      } else {
        const p = frac(ev);
        rec.marco = { x: p.x, y: p.y, w: 0, h: 0 };
        rec.arrastre = { modo: 'nuevo', x0: p.x, y0: p.y };
        pintaMarco();
      }
      e.envoltura.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    e.envoltura.addEventListener('pointermove', (ev) => {
      if (!rec.arrastre) return;
      const p = frac(ev);
      if (rec.arrastre.modo === 'nuevo') {
        rec.marco.x = Math.min(p.x, rec.arrastre.x0);
        rec.marco.y = Math.min(p.y, rec.arrastre.y0);
        rec.marco.w = Math.abs(p.x - rec.arrastre.x0);
        rec.marco.h = Math.abs(p.y - rec.arrastre.y0);
      } else if (rec.arrastre.modo === 'mover') {
        rec.marco.x = Math.min(1 - rec.marco.w, Math.max(0, p.x - rec.arrastre.dx));
        rec.marco.y = Math.min(1 - rec.marco.h, Math.max(0, p.y - rec.arrastre.dy));
      } else {
        rec.marco.w = Math.max(0.01, Math.min(1 - rec.marco.x, p.x - rec.marco.x));
        rec.marco.h = Math.max(0.01, Math.min(1 - rec.marco.y, p.y - rec.marco.y));
      }
      pintaMarco();
    });

    const soltar = () => {
      if (!rec.arrastre) return;
      rec.arrastre = null;
      if (rec.marco && (rec.marco.w < 0.012 || rec.marco.h < 0.012)) { rec.marco = null; pintaMarco(); }
      actualizaPrevia();
    };
    e.envoltura.addEventListener('pointerup', soltar);
    e.envoltura.addEventListener('pointercancel', soltar);

    $('#btnRecorteGuardar').addEventListener('click', () => {
      if (!rec.resultado || !rec.marco) {
        G.aviso('Marca primero un recuadro alrededor de la firma.', 'error');
        return;
      }
      if (rec.resultado.vacia) {
        G.aviso('El recuadro está casi vacío: ahí no se ve tinta.', 'error');
        return;
      }
      G.guardarFirma(e.nombre.value, rec.resultado.dataUrl, rec.resultado.ancho, rec.resultado.alto);
      e.modal.hidden = true;
      G.aviso('Firma guardada en tu biblioteca.', 'ok');
    });
  }

  /* =========================================================
     MODAL · dibujar firma
     ========================================================= */
  function iniciaDibujoUI() {
    const lienzo = $('#dibujoLienzo');
    if (!lienzo) return;
    const ctx = lienzo.getContext('2d');
    let pintando = false, ultimo = null, huboTrazo = false;

    const punto = (ev) => {
      const r = lienzo.getBoundingClientRect();
      return {
        x: ((ev.clientX - r.left) / r.width) * lienzo.width,
        y: ((ev.clientY - r.top) / r.height) * lienzo.height,
      };
    };

    lienzo.addEventListener('pointerdown', (ev) => {
      pintando = true; huboTrazo = true;
      ultimo = punto(ev);
      lienzo.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    lienzo.addEventListener('pointermove', (ev) => {
      if (!pintando) return;
      const p = punto(ev);
      ctx.strokeStyle = $('#dibujoColor').value;
      ctx.lineWidth = Number($('#dibujoGrosor').value) * (lienzo.width / lienzo.getBoundingClientRect().width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ultimo.x, ultimo.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ultimo = p;
    });
    const fin = () => { pintando = false; };
    lienzo.addEventListener('pointerup', fin);
    lienzo.addEventListener('pointercancel', fin);

    $('#btnDibujoLimpiar').addEventListener('click', () => {
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      huboTrazo = false;
    });

    $('#btnDibujoGuardar').addEventListener('click', () => {
      if (!huboTrazo) { G.aviso('Dibuja tu firma antes de guardarla.', 'error'); return; }
      // recorte de los márgenes vacíos conservando la transparencia
      const d = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      let x0 = lienzo.width, y0 = lienzo.height, x1 = 0, y1 = 0;
      for (let y = 0; y < lienzo.height; y++) {
        for (let x = 0; x < lienzo.width; x++) {
          if (d.data[(y * lienzo.width + x) * 4 + 3] > 12) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      if (x1 <= x0 || y1 <= y0) { G.aviso('Dibuja tu firma antes de guardarla.', 'error'); return; }
      const m = 8;
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
      x1 = Math.min(lienzo.width - 1, x1 + m); y1 = Math.min(lienzo.height - 1, y1 + m);
      const c = document.createElement('canvas');
      c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
      c.getContext('2d').drawImage(lienzo, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      G.guardarFirma($('#dibujoNombre').value, c.toDataURL('image/png'), c.width, c.height);
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      huboTrazo = false;
      $('#modalDibujo').hidden = true;
      G.aviso('Firma guardada en tu biblioteca.', 'ok');
    });
  }

  G.iniciarFirmasUI = function () {
    iniciaRecorteUI();
    iniciaDibujoUI();
  };
})();
