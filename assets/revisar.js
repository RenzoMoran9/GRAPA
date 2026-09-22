/* ===========================================================
   Grapa · revisar hojas: en blanco, de lado, al revés o torcidas
   Mira cada hoja como se ve ahora y dice qué le pasa. No toca nada:
   quien decide borrar o enderezar es el taller, con lo que diga esto.
   Todo en el navegador, como el resto.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});

  /* Lo que se decide aquí, y por qué:

     · EN BLANCO: se dibuja la hoja y se buscan manchas de tinta de verdad.
       No cuenta lo claro —la letra del otro lado que se trasluce—, ni el
       borde de la hoja —la sombra y la raya negra del escáner—, ni una
       mota suelta. Lo que queda tiene que ser casi nada. Un «V° B°» con
       una rúbrica ya NO es una hoja en blanco.

     · DE LADO O AL REVÉS: si la hoja trae texto de verdad, lo dice el
       propio texto, que sabe hacia dónde se lee. Si es un escaneo, se mira
       la tinta: los renglones van de lado a lado, así que se sabe si la
       hoja está de pie o acostada. Para saber si está de cabeza se usa que
       en castellano sobresalen hacia ARRIBA muchas más letras (b, d, f, h,
       l, t, las tildes y las mayúsculas) que hacia abajo (g, j, p, q, y).
       En una hoja toda en mayúsculas eso no se ve, y entonces no se dice
       nada: mejor callar que girar mal una hoja.

     · TORCIDA: se prueba a girar la tinta de a poco y se queda el giro en
       que los renglones salen más limpios, de hasta 10 grados. */

  const PPP = 150;              // detalle al que se dibuja la hoja para mirarla
  const TOPE_LADO = 2000;       // y un tope, para hojas enormes
  const TORCIDA_MINIMA = 0.6;   // grados: menos que esto no se nota
  const TORCIDA_MAXIMA = 10;

  /* ---------- 1. si la hoja trae texto, él dice hacia dónde se lee ---------- */
  async function mirarTexto(pag, giro) {
    const tc = await pag.getTextContent();
    const peso = [0, 0, 0, 0];   // letras que se leen a 0, 90, 180 y 270 (contra reloj, como se ve)
    let letras = 0;
    for (const it of tc.items) {
      const n = String(it.str || '').replace(/\s/g, '').length;
      if (!n || !it.transform) continue;
      letras += n;
      const [a, b] = it.transform;
      // dirección del renglón en la hoja sin girar, menos el giro con que se ve
      const ang = (Math.atan2(b, a) * 180) / Math.PI - giro;
      peso[G.norm(ang) / 90] += n;
    }
    if (letras < 20) return { letras };
    const mas = peso.indexOf(Math.max(...peso));
    // si no manda con claridad una dirección, mejor no decir nada
    const corregir = peso[mas] >= letras * 0.7 ? mas * 90 : 0;
    return { letras, giro: corregir };
  }

  /* ---------- 2. si es un escaneo: la tinta ---------- */

  /** La hoja en gris, tal como se ve (con su giro y su enderezado). */
  async function dibujar(pagina, pag) {
    const giro = G.norm(pagina.giro);
    const base = pag.getViewport({ scale: 1, rotation: giro });
    const escala = Math.min(PPP / 72, TOPE_LADO / Math.max(base.width, base.height));
    const vp = pag.getViewport({ scale: escala, rotation: giro });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.floor(vp.width));
    lienzo.height = Math.max(1, Math.floor(vp.height));
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pag.render({ canvasContext: ctx, viewport: vp,
      transform: G.matrizEnderezo(pagina.enderezo, lienzo.width, lienzo.height) }).promise;
    const W = lienzo.width, H = lienzo.height;
    const img = ctx.getImageData(0, 0, W, H).data;
    lienzo.width = lienzo.height = 0;
    const gris = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < gris.length; i++, j += 4) {
      gris[i] = (img[j] * 299 + img[j + 1] * 587 + img[j + 2] * 114) / 1000;
    }
    return { gris, W, H };
  }

  /**
   * Qué píxeles son tinta. El papel se mide por bloques —un escaneo tiene
   * sombras—, y es tinta lo que queda BASTANTE más oscuro que su papel: la
   * letra que se trasluce del otro lado es un gris claro y no cuenta.
   */
  function tinta(gris, W, H) {
    const B = 32;
    const bx = Math.ceil(W / B), by = Math.ceil(H / B);
    const fondo = new Uint8Array(bx * by);
    const m = [];
    for (let cy = 0; cy < by; cy++) {
      for (let cx = 0; cx < bx; cx++) {
        m.length = 0;
        for (let y = cy * B; y < Math.min(H, (cy + 1) * B); y += 2) {
          for (let x = cx * B; x < Math.min(W, (cx + 1) * B); x += 2) m.push(gris[y * W + x]);
        }
        m.sort((a, b) => a - b);
        fondo[cy * bx + cx] = m.length ? m[Math.floor(m.length * 0.9)] : 255;
      }
    }
    // el papel de toda la hoja: un bloque que es todo tinta no pone el listón
    const orden = Array.from(fondo).sort((a, b) => a - b);
    const papel = orden[Math.floor(orden.length * 0.75)] || 255;
    const es = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const fy = Math.floor(y / B) * bx;
      for (let x = 0; x < W; x++) {
        const f = Math.max(fondo[fy + Math.floor(x / B)], papel * 0.7);
        const v = gris[y * W + x];
        if (v < f * 0.6 && v < 170) es[y * W + x] = 1;
      }
    }
    return es;
  }

  /**
   * ¿Hay algo escrito? Se cuenta por celdas de unos 1,4 mm, sin el borde de
   * la hoja, y solo valen las celdas con tinta que tienen al lado otra con
   * tinta: una letra, una raya, una firma. Una mota sola no.
   */
  function celdasEscritas(es, W, H) {
    const C = 8;
    const mx = Math.max(12, Math.round(W * 0.04)), my = Math.max(12, Math.round(H * 0.04));
    const cx = Math.floor((W - 2 * mx) / C), cy = Math.floor((H - 2 * my) / C);
    const llena = new Uint8Array(cx * cy);
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let n = 0;
        for (let y = my + j * C; y < my + (j + 1) * C; y++) {
          for (let x = mx + i * C; x < mx + (i + 1) * C; x++) n += es[y * W + x];
        }
        if (n >= 3) llena[j * cx + i] = 1;
      }
    }
    let escritas = 0;
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        if (!llena[j * cx + i]) continue;
        let vecina = false;
        for (let dj = -1; dj <= 1 && !vecina; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const a = i + di, b = j + dj;
            if (a >= 0 && b >= 0 && a < cx && b < cy && llena[b * cx + a]) { vecina = true; break; }
          }
        }
        if (vecina) escritas++;
      }
    }
    return { escritas, mx, my };
  }

  /** Los puntos de tinta, sin el borde, como mucho unos 90 000. */
  function puntosDeTinta(es, W, H, mx, my) {
    let total = 0;
    for (let y = my; y < H - my; y++) for (let x = mx; x < W - mx; x++) total += es[y * W + x];
    const paso = Math.max(1, Math.ceil(total / 90000));
    const xs = [], ys = [];
    let k = 0;
    for (let y = my; y < H - my; y++) {
      for (let x = mx; x < W - mx; x++) {
        if (!es[y * W + x]) continue;
        if (k++ % paso) continue;
        xs.push(x - W / 2); ys.push(y - H / 2);
      }
    }
    return { xs: Float32Array.from(xs), ys: Float32Array.from(ys) };
  }

  /**
   * Cuán limpios salen los renglones si la tinta se gira «grados» (a favor
   * del reloj, como en la pantalla) y se miran de lado a lado (acostada =
   * false) o de arriba abajo (acostada = true). Más alto, más limpios.
   */
  function nitidez(p, grados, acostada) {
    const r = (grados * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    const h = new Map();
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < p.xs.length; i++) {
      const x = p.xs[i], y = p.ys[i];
      // tras girar: y' = x·sen + y·cos · x' = x·cos − y·sen. De 3 en 3
      // píxeles: así no cuenta el vaivén de una letra a otra, solo el de
      // un renglón al siguiente
      const v = Math.floor((acostada ? x * co - y * si : x * si + y * co) / 3);
      h.set(v, (h.get(v) || 0) + 1);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    let s = 0;
    for (const n of h.values()) s += n * n;
    // 1 si la tinta se reparte pareja; tanto más cuanto más se amontona en
    // renglones con papel entre medio. Así no importa si la hoja es más
    // alta que ancha.
    return (s * (max - min + 1)) / (p.xs.length * p.xs.length);
  }

  function mejorGiroFino(p, acostada) {
    let mejor = 0, valor = -1;
    for (let g = -TORCIDA_MAXIMA; g <= TORCIDA_MAXIMA + 1e-9; g += 0.5) {
      const v = nitidez(p, g, acostada);
      if (v > valor) { valor = v; mejor = g; }
    }
    const grueso = mejor;
    for (let g = grueso - 0.45; g <= grueso + 0.45 + 1e-9; g += 0.05) {
      const v = nitidez(p, g, acostada);
      if (v > valor) { valor = v; mejor = g; }
    }
    return { grados: Math.round(mejor * 20) / 20, valor, recto: nitidez(p, 0, acostada) };
  }

  /**
   * ¿Derecha o de cabeza? Se toman los renglones —ya enderezados— y en cada
   * uno se compara la tinta que sobresale por encima del cuerpo de la letra
   * con la que cuelga por debajo. Devuelve +1 (derecha), −1 (de cabeza) o 0
   * si no se puede saber.
   *   «abajo» dice hacia dónde queda el pie de la hoja tras girarla:
   *   0 → hacia y, 90 → hacia x, 180 → hacia −y, 270 → hacia −x.
   */
  function sentido(p, grados, abajo) {
    const r = (grados * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    const vs = new Int32Array(p.xs.length);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < p.xs.length; i++) {
      const x = p.xs[i], y = p.ys[i];
      const gx = x * co - y * si, gy = x * si + y * co;
      const v = Math.round(abajo === 0 ? gy : abajo === 90 ? gx : abajo === 180 ? -gy : -gx);
      vs[i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!isFinite(min)) return { voto: 0 };
    const h = new Float64Array(max - min + 1);
    for (let i = 0; i < vs.length; i++) h[vs[i] - min]++;
    const orden = Array.from(h).filter((n) => n > 0).sort((a, b) => a - b);
    const listón = Math.max(1, (orden[Math.floor(orden.length * 0.9)] || 1) * 0.06);

    // las franjas con tinta, cada una con su cuerpo: donde la tinta pasa
    // de la mitad de su máximo, que es la altura de la «x»
    const franjas = [];
    for (let i = 0; i < h.length;) {
      if (h[i] <= listón) { i++; continue; }
      let j = i;
      while (j < h.length && h[j] > listón) j++;
      let pico = 0;
      for (let k = i; k < j; k++) pico = Math.max(pico, h[k]);
      let a = i, b = j - 1;
      while (h[a] < pico * 0.45) a++;
      while (h[b] < pico * 0.45) b--;
      franjas.push({ i, j, a, b, alto: j - i });
      i = j;
    }
    // Un renglón de letra se parece a los demás renglones: una raya de
    // firma, un sello o la propia firma miden otra cosa y se dejan fuera.
    const altos = franjas.map((f) => f.alto).filter((a) => a >= 7 && a <= 90).sort((x, y) => x - y);
    const tipico = altos[Math.floor(altos.length / 2)] || 0;
    let arriba = 0, debajo = 0, renglones = 0;
    for (const f of franjas) {
      if (f.alto < tipico * 0.6 || f.alto > tipico * 1.6 || f.alto < 7) continue;
      if (f.b - f.a + 1 < f.alto * 0.35) continue;   // casi todo es una raya
      for (let k = f.i; k < f.a; k++) arriba += h[k];
      for (let k = f.b + 1; k < f.j; k++) debajo += h[k];
      renglones++;
    }
    const total = arriba + debajo;
    if (renglones < 3 || total < 150) return { voto: 0, arriba, debajo, renglones };
    const d = (arriba - debajo) / total;
    return { voto: d > 0.15 ? 1 : d < -0.15 ? -1 : 0, d, arriba, debajo, renglones };
  }

  function mirarTinta(gris, W, H) {
    const es = tinta(gris, W, H);
    const { escritas, mx, my } = celdasEscritas(es, W, H);
    // unas 12 celdas son un par de centímetros de letra
    if (escritas < 12) return { blanca: true, escritas };
    const p = puntosDeTinta(es, W, H, mx, my);
    if (p.xs.length < 600) return { blanca: false, escritas };

    const dePie = mejorGiroFino(p, false);
    const echada = mejorGiroFino(p, true);
    const r = { blanca: false, escritas, giro: 0, torcida: 0 };
    let base, abajo;
    if (dePie.valor >= echada.valor * 1.25) { base = dePie; abajo = 0; }
    else if (echada.valor >= dePie.valor * 1.25) { base = echada; abajo = 90; }
    else return r;   // ni renglones claros de pie ni acostados: un cuadro, una foto

    // los renglones tienen que salir de verdad más limpios que sin girar
    if (Math.abs(base.grados) >= TORCIDA_MINIMA && base.valor > base.recto * 1.08) r.torcida = base.grados;
    const g = Math.abs(base.grados) >= TORCIDA_MINIMA ? base.grados : 0;

    const s = sentido(p, g, abajo);
    r.sentido = s;
    if (abajo === 0) r.giro = s.voto < 0 ? 180 : 0;
    else r.giro = s.voto > 0 ? 90 : s.voto < 0 ? 270 : 0;
    // acostada y sin saber hacia qué lado: se avisa, pero no se gira sola
    if (abajo === 90 && !s.voto) r.deLadoSinSentido = true;
    return r;
  }

  /* ---------- 3. la hoja entera ---------- */
  const cache = new Map();
  const claveDe = (p) => `${p.fuenteId}:${p.indice}:${G.norm(p.giro)}:${p.enderezo || 0}`;

  /**
   * Qué le pasa a la hoja. Devuelve
   *   { blanca, giro, torcida, deLadoSinSentido, porTexto }
   * giro: cuánto girarla (a favor del reloj) para dejarla derecha.
   * torcida: cuántos grados enderezarla (a favor del reloj).
   */
  G.revisarHoja = async function (pagina) {
    const k = claveDe(pagina);
    if (cache.has(k)) return cache.get(k);
    const fuente = G.estado.fuentes.get(pagina.fuenteId);
    const pag = await fuente.doc.getPage(pagina.indice + 1);
    let r;
    const t = await mirarTexto(pag, G.norm(pagina.giro) + 0).catch(() => ({ letras: 0 }));
    if (t.letras >= 20) {
      r = { blanca: false, giro: t.giro, torcida: 0, porTexto: true };
    } else {
      const { gris, W, H } = await dibujar(pagina, pag);
      r = mirarTinta(gris, W, H);
      // un poco de letra de verdad en la hoja: no es una hoja en blanco
      if (r.blanca && t.letras > 0) r.blanca = false;
    }
    r.giro = r.giro || 0;
    r.torcida = r.torcida || 0;
    cache.set(k, r);
    return r;
  };
})();
