/* ===========================================================
   Pdflash · letras propias para el texto corregido

   Un PDF trae solo las letras que usó: si en «13,500.00» se cambia el 3 por
   un 4 y el documento no tenía ningún 4 en esa letra, no hay de dónde
   sacarlo. Las catorce letras de fábrica de todo PDF (Arial/Helvetica,
   Times, Courier) cubren muchos casos, pero no Calibri, que es la letra con
   la que Word escribe por defecto y, por eso, la de casi todo formato.

   Aquí va Carlito: una letra libre hecha para ocupar exactamente lo mismo
   que Calibri, letra por letra. Con ella el texto corregido de un documento
   de Word sale con su misma forma y su mismo ancho, y queda guardada dentro
   del PDF (solo las letras usadas), así que se ve igual en cualquier equipo.

   Pesa, así que no se carga hasta que hace falta: al corregir un texto en
   Calibri, o al exportar una hoja que lleve uno.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});

  // Orden: normal, negrita, cursiva, negrita cursiva (como G.FUENTES_TEXTO)
  const PROPIAS = {
    calibri: {
      css: 'PdflashCarlito',
      archivos: ['Carlito-Regular.ttf', 'Carlito-Bold.ttf', 'Carlito-Italic.ttf', 'Carlito-BoldItalic.ttf'],
    },
  };
  G.esLetraPropia = (familia) => Object.prototype.hasOwnProperty.call(PROPIAS, familia);
  G.letraPropiaDe = (nombre) => (/calibri|carlito/i.test(String(nombre || '')) ? 'calibri' : null);

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
  /** En Grapa.html van dentro, comprimidas; en la web se piden a lib/. */
  async function pieza(id, ruta) {
    const dentro = document.getElementById(id);
    if (dentro) return descomprimir(deBase64(dentro.textContent.trim()));
    const r = await fetch(ruta);
    if (!r.ok) throw new Error('no se encontró ' + ruta);
    return new Uint8Array(await r.arrayBuffer());
  }

  const bytes = new Map();
  /** Los bytes de una letra propia, en la variante pedida. */
  G.bytesDeLetra = function (familia, negrita, cursiva) {
    const f = PROPIAS[familia];
    if (!f) return Promise.reject(new Error('letra desconocida'));
    const i = (negrita ? 1 : 0) + (cursiva ? 2 : 0), k = familia + ':' + i;
    if (!bytes.has(k)) {
      const p = pieza(`letra-${familia}-${i}`, 'lib/fuentes/' + f.archivos[i]);
      p.catch(() => bytes.delete(k));
      bytes.set(k, p);
    }
    return bytes.get(k);
  };

  /* ---------- en pantalla ---------- */
  const enPantalla = new Map();
  /**
   * Deja la letra lista para dibujar y medir en el navegador. Devuelve si se
   * pudo: sin ella (Pdflash abierta desde el disco sin sus carpetas) el texto
   * se escribe con Arial ajustada de ancho, como antes.
   */
  G.cargarLetra = function (familia) {
    const f = PROPIAS[familia];
    if (!f) return Promise.resolve(false);
    if (!enPantalla.has(familia)) {
      enPantalla.set(familia, (async () => {
        const caras = await Promise.all([0, 1, 2, 3].map(async (i) => {
          const b = await G.bytesDeLetra(familia, !!(i & 1), !!(i & 2));
          return new FontFace(f.css, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
            { weight: i & 1 ? '700' : '400', style: i & 2 ? 'italic' : 'normal' }).load();
        }));
        caras.forEach((c) => document.fonts.add(c));
        f.lista = true;
        return true;
      })().catch((e) => {
        console.warn('No se pudo cargar la letra ' + familia + '; se usa Arial ajustada.', e);
        enPantalla.delete(familia);
        return false;
      }));
    }
    return enPantalla.get(familia);
  };
  G.letraLista = (familia) => !!(PROPIAS[familia] && PROPIAS[familia].lista);
  /** Cómo se llama en una hoja de estilos (primero la nuestra: es la que irá en el PDF). */
  G.cssDeLetra = (familia) => (PROPIAS[familia] ? `"${PROPIAS[familia].css}", Carlito, Calibri, Helvetica, Arial, sans-serif` : null);

  /* ---------- adelgazar la letra para el PDF ----------
     La letra entera pesa más de medio mega por variante, y un precio corregido
     usa una docena de letras. El «subset» de fontkit, que es lo que pdf-lib
     ofrece para esto, deja con esta letra un archivo que los lectores de PDF
     rechazan (se probó: salían huecos donde iban las letras). Así que se
     adelgaza aquí, de la manera más simple que hay y sin renumerar nada: la
     letra queda con todas sus tablas y sus mismos números de glifo, pero solo
     se conserva el dibujo de los glifos que se usan (y de las piezas de que
     están hechos, como la tilde de la «Í»). Los demás quedan vacíos.        */
  G.adelgazarLetra = function (bytes, usados) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nTablas = v.getUint16(4);
    const tablas = [];
    for (let i = 0; i < nTablas; i++) {
      const o = 12 + i * 16;
      tablas.push({ nombre: String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]), desde: v.getUint32(o + 8), largo: v.getUint32(o + 12) });
    }
    const de = (n) => tablas.find((t) => t.nombre === n);
    const head = de('head'), maxp = de('maxp'), loca = de('loca'), glyf = de('glyf');
    if (!head || !maxp || !loca || !glyf) throw new Error('no es una letra TrueType');
    const nGlifos = v.getUint16(maxp.desde + 4), largos = v.getInt16(head.desde + 50) === 1;
    const sitio = (g) => (largos ? v.getUint32(loca.desde + g * 4) : v.getUint16(loca.desde + g * 2) * 2);

    // los glifos pedidos y las piezas de los compuestos
    const quedan = new Set([0]);
    const pendientes = Array.from(usados).filter((g) => g >= 0 && g < nGlifos);
    while (pendientes.length) {
      const g = pendientes.pop();
      if (quedan.has(g) && g !== 0) continue;
      quedan.add(g);
      const a = glyf.desde + sitio(g), fin = glyf.desde + sitio(g + 1);
      if (fin - a < 10 || v.getInt16(a) >= 0) continue;            // vacío o simple
      let o = a + 10;
      for (;;) {
        const flags = v.getUint16(o), pieza = v.getUint16(o + 2);
        if (!quedan.has(pieza)) pendientes.push(pieza);
        o += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
        if (!(flags & 0x20)) break;
      }
    }

    // glyf y loca nuevos
    const trozos = [], nuevaLoca = new Uint8Array((nGlifos + 1) * 4), lv = new DataView(nuevaLoca.buffer);
    let pos = 0;
    for (let g = 0; g < nGlifos; g++) {
      lv.setUint32(g * 4, pos);
      if (!quedan.has(g)) continue;
      const a = sitio(g), b = sitio(g + 1);
      if (b <= a) continue;
      const t = new Uint8Array((b - a + 3) & ~3);
      t.set(bytes.subarray(glyf.desde + a, glyf.desde + b));
      trozos.push(t);
      pos += t.length;
    }
    lv.setUint32(nGlifos * 4, pos);
    const nuevoGlyf = new Uint8Array(pos);
    let o = 0;
    trozos.forEach((t) => { nuevoGlyf.set(t, o); o += t.length; });

    // el archivo de nuevo, con sus tablas en el mismo orden
    const datos = tablas.map((t) => {
      if (t.nombre === 'glyf') return nuevoGlyf;
      if (t.nombre === 'loca') return nuevaLoca;
      const d = bytes.slice(t.desde, t.desde + t.largo);
      if (t.nombre === 'head') { const hv = new DataView(d.buffer); hv.setInt16(50, 1); hv.setUint32(8, 0); }
      return d;
    });
    const cabecera = 12 + nTablas * 16;
    const total = cabecera + datos.reduce((n, d) => n + ((d.length + 3) & ~3), 0);
    const sal = new Uint8Array(total), sv = new DataView(sal.buffer);
    sal.set(bytes.subarray(0, 12));
    const suma = (d) => {
      let n = 0;
      const lleno = new Uint8Array((d.length + 3) & ~3);
      lleno.set(d);
      const dv = new DataView(lleno.buffer);
      for (let i = 0; i < lleno.length; i += 4) n = (n + dv.getUint32(i)) >>> 0;
      return n;
    };
    let donde = cabecera, dondeHead = -1;
    datos.forEach((d, i) => {
      const e = 12 + i * 16;
      sal.set(bytes.subarray(e, e + 4), e);
      sv.setUint32(e + 4, suma(d)); sv.setUint32(e + 8, donde); sv.setUint32(e + 12, d.length);
      sal.set(d, donde);
      if (tablas[i].nombre === 'head') dondeHead = donde;
      donde += (d.length + 3) & ~3;
    });
    sv.setUint32(dondeHead + 8, (0xB1B0AFBA - suma(sal)) >>> 0);
    return sal;
  };

  /* ---------- en el PDF ---------- */
  let motor = null;
  /** fontkit: lo que pdf-lib necesita para meter en un PDF una letra que no es de fábrica. */
  G.motorDeLetras = function () {
    if (window.fontkit) return Promise.resolve(window.fontkit);
    if (!motor) {
      motor = (async () => {
        const dentro = document.getElementById('lib-fontkit');
        const url = dentro
          ? URL.createObjectURL(new Blob([await descomprimir(deBase64(dentro.textContent.trim()))], { type: 'text/javascript' }))
          : 'lib/fontkit.umd.min.js';
        await new Promise((ok, mal) => {
          const s = document.createElement('script');
          s.src = url;
          s.onload = ok;
          s.onerror = () => mal(new Error('no se pudo cargar fontkit'));
          document.head.appendChild(s);
        });
        if (!window.fontkit) throw new Error('fontkit no arrancó');
        return window.fontkit;
      })();
      motor.catch(() => { motor = null; });
    }
    return motor;
  };
})();
