/**
 * Pdflash · Word y Excel
 *
 * Convierte .docx / .xlsx / .xls / .csv a PDF sin salir del navegador: el
 * documento se compone en una caja fuera de pantalla, se fotografía hoja por
 * hoja y esas fotos se arman en un PDF. Nada viaja a ningún servidor.
 *
 * La composición la hace el navegador con las fuentes que tenga instaladas,
 * así que el resultado se parece mucho pero no es idéntico a lo que imprime
 * Word o Excel: los cortes de línea y de página pueden moverse. Para algo que
 * deba salir exacto, sigue siendo mejor «Guardar como PDF» desde Office.
 */
(function (G) {
  'use strict';

  const PX_A_PT = 72 / 96;      // el navegador mide en píxeles CSS de 96 dpi
  const NITIDEZ = 2;            // se fotografía al doble para que el texto se lea
  const A4 = { ancho: 794, alto: 1123 };            // A4 vertical en píxeles CSS
  const MARGEN = 76;                                // ~2 cm
  const ALTO_MAXIMO_LIENZO = 12000;                 // tope prudente por hoja

  G.esWord = (f) => /\.docx$/i.test(f.name)
    || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  G.esExcel = (f) => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name)
    || /spreadsheetml|ms-excel|csv/i.test(f.type || '');
  G.esOffice = (f) => G.esWord(f) || G.esExcel(f);
  /** Formatos de Office que aquí no hay con qué abrir: Word 97 y PowerPoint. */
  G.esOfficeNoLeible = (f) => /\.(doc|ppt|pps|pptx|odt|ods)$/i.test(f.name);

  /**
   * Caja donde se compone el documento. Tiene que estar dibujada de verdad
   * para poder medirla y fotografiarla, así que no se puede ocultar con
   * display:none: se manda fuera de la pantalla.
   */
  function cajaOculta() {
    const caja = document.createElement('div');
    caja.className = 'office-taller';
    caja.style.cssText = [
      'position:fixed', 'left:-30000px', 'top:0', 'z-index:-1',
      'background:#fff', 'color:#000', 'width:' + A4.ancho + 'px',
    ].join(';');
    document.body.appendChild(caja);
    return caja;
  }

  /** Fotografía un trozo de página ya compuesto. */
  async function fotografiar(nodo) {
    return html2canvas(nodo, {
      scale: NITIDEZ,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: false,
      allowTaint: false,
      imageTimeout: 0,
      windowWidth: Math.max(nodo.scrollWidth, A4.ancho),
    });
  }

  /** Arma el PDF con las fotos, cada una en su hoja del tamaño que le toca. */
  async function pdfDesdeLienzos(lienzos) {
    const doc = await PDFLib.PDFDocument.create();
    for (const { lienzo, anchoPx, altoPx } of lienzos) {
      const jpg = await new Promise((res) => lienzo.toBlob((b) => res(b), 'image/jpeg', 0.92));
      const img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const ancho = anchoPx * PX_A_PT;
      const alto = altoPx * PX_A_PT;
      const hoja = doc.addPage([ancho, alto]);
      hoja.drawImage(img, { x: 0, y: 0, width: ancho, height: alto });
    }
    return new Uint8Array(await doc.save());
  }

  /* ------------------------------- Word ------------------------------- */

  /* ---- fuentes: si falta la del documento, la más parecida, nunca la Times por defecto ---- */
  const PARECIDAS = {
    'calibri': ['Carlito', 'Arial'], 'calibri light': ['Carlito', 'Arial'],
    'cambria': ['Caladea', 'Georgia'], 'arial': ['Liberation Sans', 'Arimo', 'Helvetica'],
    'arial narrow': ['Liberation Sans Narrow', 'Arial', 'Liberation Sans'],
    'arial black': ['Arial', 'Liberation Sans'],
    'times new roman': ['Liberation Serif', 'Tinos', 'Times'],
    'courier new': ['Liberation Mono', 'Cousine', 'Courier'],
    'century gothic': ['URW Gothic', 'Avant Garde', 'Arial'], 'tahoma': ['Verdana', 'DejaVu Sans'],
    'verdana': ['DejaVu Sans'], 'segoe ui': ['Arial', 'Liberation Sans'],
    'book antiqua': ['Palatino Linotype', 'Palatino', 'Georgia'], 'garamond': ['Georgia'],
  };
  const CON_SERIFA = /times|cambria|georgia|garamond|antiqua|palatino|serif|bookman|century schoolbook/i;

  /** «Arial Narrow» → «"Arial Narrow", "Liberation Sans Narrow", Arial, …, sans-serif». */
  function conRespaldo(lista) {
    const nombres = String(lista).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    if (!nombres.length || /^var\(/.test(nombres[0])) return lista;
    if (/^(serif|sans-serif|monospace)$/i.test(nombres[nombres.length - 1])) return lista;
    const todos = [];
    nombres.forEach((n) => { todos.push(n); (PARECIDAS[n.toLowerCase()] || []).forEach((p) => todos.push(p)); });
    const unicos = todos.filter((n, i) => todos.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
    const generica = CON_SERIFA.test(nombres[0]) ? 'serif' : /courier|mono/i.test(nombres[0]) ? 'monospace' : 'sans-serif';
    return unicos.map((n) => (/\s/.test(n) ? `"${n}"` : n)).join(', ') + ', ' + generica;
  }

  function completarFuentes(caja) {
    caja.querySelectorAll('style').forEach((st) => {
      st.textContent = st.textContent
        .replace(/(--docx-[\w-]+-font\s*:\s*)([^;}]+)/g, (m, a, b) => a + conRespaldo(b))
        .replace(/(font-family\s*:\s*)([^;}]+)/g, (m, a, b) => a + conRespaldo(b));
    });
    caja.querySelectorAll('[style*="font-family"]').forEach((el) => {
      el.style.fontFamily = conRespaldo(el.style.fontFamily);
    });
  }

  /* ---- cuadros de texto ---- */

  /**
   * docx-preview dibuja los cuadros de texto como <svg><foreignObject>, que la
   * «foto» de la hoja no sabe pintar: el encabezado perdía su texto. Se pasan
   * a un <div> con la misma posición y medida.
   */
  function cuadrosDeTextoADiv(caja) {
    caja.querySelectorAll('svg').forEach((svg) => {
      const fo = svg.querySelector('foreignObject');
      if (!fo) return;
      const div = document.createElement('div');
      div.setAttribute('style', svg.getAttribute('style') || '');
      // los que Word pone «detrás del texto» quedaban detrás del papel blanco
      if (parseInt(div.style.zIndex, 10) < 0) div.style.zIndex = '0';
      div.style.overflow = 'visible';
      while (fo.firstChild) div.appendChild(fo.firstChild);
      svg.replaceWith(div);
    });
  }

  const NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  };

  /**
   * Los cuadros de texto agrupados (el pie con la dirección y la web, típico de
   * los membretes) docx-preview no los dibuja: salían en blanco. Antes de
   * abrir el documento, cada grupo con texto se cambia por una tabla sin
   * bordes, con un cuadro por celda en el orden en que estaban de izquierda a
   * derecha. No queda en la posición exacta, pero el texto está.
   */
  function gruposATablas(xml) {
    if (!/wordprocessingGroup/.test(xml) || !/txbxContent/.test(xml)) return xml;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return xml;
    const grupos = Array.from(doc.getElementsByTagNameNS(NS.wpg, 'wgp'));
    let cambio = false;
    grupos.forEach((g) => {
      if (!g.isConnected) return;
      const cuadros = Array.from(g.getElementsByTagNameNS(NS.wps, 'wsp')).map((wsp) => {
        const txt = wsp.getElementsByTagNameNS(NS.w, 'txbxContent')[0];
        if (!txt || !txt.textContent.trim()) return null;
        const off = wsp.getElementsByTagNameNS(NS.a, 'off')[0];
        const ext = wsp.getElementsByTagNameNS(NS.a, 'ext')[0];
        return {
          txt,
          x: off ? Number(off.getAttribute('x')) || 0 : 0,
          // las medidas dentro de un grupo vienen a su propia escala: con un
          // mínimo holgado, una dirección no se parte en una palabra por línea
          ancho: Math.max(3200, ext ? Math.round((Number(ext.getAttribute('cx')) || 0) / 635) : 0),
        };
      }).filter(Boolean).sort((a, b) => a.x - b.x);
      if (!cuadros.length) return;
      // lo que se quita: el bloque alternativo entero, o el dibujo si va solo
      let quitar = g;
      for (let p = g.parentNode; p && p.nodeType === 1; p = p.parentNode) {
        if (p.namespaceURI === NS.mc && p.localName === 'AlternateContent') { quitar = p; break; }
        if (p.namespaceURI === NS.w && p.localName === 'drawing') quitar = p;
      }
      let parrafo = quitar.parentNode;
      while (parrafo && !(parrafo.namespaceURI === NS.w && parrafo.localName === 'p')) parrafo = parrafo.parentNode;
      if (!parrafo || !parrafo.parentNode) return;

      const W = (n) => doc.createElementNS(NS.w, 'w:' + n);
      const conVal = (el, atr, v) => { el.setAttributeNS(NS.w, 'w:' + atr, v); return el; };
      const tbl = W('tbl');
      const pr = W('tblPr');
      pr.appendChild(conVal(conVal(W('tblW'), 'w', '0'), 'type', 'auto'));
      const bordes = W('tblBorders');
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].forEach((b) => bordes.appendChild(conVal(W(b), 'val', 'nil')));
      pr.appendChild(bordes);
      tbl.appendChild(pr);
      const rejilla = W('tblGrid');
      cuadros.forEach((c) => rejilla.appendChild(conVal(W('gridCol'), 'w', String(c.ancho))));
      tbl.appendChild(rejilla);
      const fila = W('tr');
      cuadros.forEach((c) => {
        const tc = W('tc');
        const tcPr = W('tcPr');
        tcPr.appendChild(conVal(conVal(W('tcW'), 'w', String(c.ancho)), 'type', 'dxa'));
        tc.appendChild(tcPr);
        Array.from(c.txt.childNodes).forEach((n) => tc.appendChild(n.cloneNode(true)));
        const ultimo = tc.lastElementChild;
        if (!ultimo || ultimo.localName !== 'p') tc.appendChild(W('p'));
        fila.appendChild(tc);
      });
      tbl.appendChild(fila);
      quitar.parentNode.removeChild(quitar);
      parrafo.parentNode.insertBefore(tbl, parrafo.nextSibling);
      cambio = true;
    });
    return cambio ? new XMLSerializer().serializeToString(doc) : xml;
  }

  /** Arregla lo que docx-preview no sabe dibujar, tocando solo una copia del archivo. */
  // Por parte del documento, si cada imagen flotante va detrás del texto (en el orden en que aparecen).
  // docx-preview lee ese dato y lo descarta; aquí se apunta para ponerlas detrás después.
  let detrasDelTexto = {};
  async function prepararDocx(buffer) {
    detrasDelTexto = {};
    if (typeof JSZip === 'undefined') return buffer;
    try {
      const zip = await JSZip.loadAsync(buffer);
      const partes = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
      let cambio = false;
      for (const n of partes) {
        const xml = await zip.file(n).async('string');
        detrasDelTexto[n.replace(/^word\/|\.xml$/g, '').replace(/\d+$/, '')] = (detrasDelTexto[n.replace(/^word\/|\.xml$/g, '').replace(/\d+$/, '')] || [])
          .concat((xml.match(/<wp:anchor\b[^>]*>/g) || []).map((a) => /behindDoc="(1|true)"/.test(a)));
        const nuevo = gruposATablas(xml);
        if (nuevo !== xml) { zip.file(n, nuevo); cambio = true; }
      }
      return cambio ? await zip.generateAsync({ type: 'arraybuffer' }) : buffer;
    } catch (e) {
      console.warn('Word: no se pudo preparar el documento, se abre tal cual', e);
      return buffer;
    }
  }

  /* ---- repartir en hojas ---- */

  /**
   * Una imagen «flotante» de Word (delante o detrás del texto: un membrete de
   * hoja entera, un sello, una firma) no ocupa sitio entre los renglones.
   * docx-preview la deja en una cajita de 0 × 0 dentro del renglón, pero la
   * imagen seguía contando para el alto de ese renglón: un membrete de hoja
   * entera puesto en el encabezado lo volvía tan alto como la hoja, el texto
   * «ya no cabía» y cada párrafo se iba a una hoja propia (un Word de 6 hojas
   * salía en 157). Aquí la imagen se saca del renglón: se queda en su sitio,
   * pero flotando, como en Word.
   */
  function flotantesFueraDelRenglon(caja) {
    const flotante = (d) => d.style.position === 'relative' && parseFloat(d.style.width) === 0 && parseFloat(d.style.height) === 0;
    // Una firma o un sello que en Word va «detrás del texto» se dibuja debajo de las letras: si no,
    // tapa el «Firma, Nombres y Apellidos» que lleva encima. Se reconocen por su orden en cada parte.
    caja.querySelectorAll('.gdocx-wrapper > section').forEach((sec) => {
      [['article', 'document'], ['header', 'header'], ['footer', 'footer']].forEach(([sel, parte]) => {
        const lista = detrasDelTexto[parte] || [];
        const zona = sec.querySelector(':scope > ' + sel);
        if (!zona || !lista.length) return;
        Array.from(zona.querySelectorAll('div')).filter(flotante).forEach((d, i) => { if (lista[i]) d.dataset.detras = '1'; });
      });
    });
    caja.querySelectorAll('.gdocx-wrapper div').forEach((d) => {
      const e = d.style;
      if (!flotante(d)) return;
      e.verticalAlign = 'top';
      if (d.dataset.detras) e.zIndex = '-1';
      Array.from(d.children).forEach((h) => {
        if (h.style.position === 'relative' || !h.style.position) h.style.position = 'absolute';
        // una imagen no debe encogerse por caber en una caja de ancho cero
        h.style.maxWidth = 'none';
      });
    });
    // En Word, el encabezado y el pie van siempre POR DEBAJO del cuerpo de la hoja: un membrete
    // de hoja entera puesto ahí queda de fondo, con el texto encima. Sin esto lo tapaba.
    caja.querySelectorAll('.gdocx-wrapper > section').forEach((s) => {
      Array.from(s.children).forEach((ch) => {
        const fondo = ch.tagName === 'HEADER' || ch.tagName === 'FOOTER';
        if (!ch.style.position) ch.style.position = 'relative';
        ch.style.zIndex = fondo ? '0' : '1';
      });
    });
  }

  /**
   * docx-preview solo corta donde el documento tiene un salto de página
   * manual: un memo de tres hojas salía como una sola hoja larguísima. Aquí se
   * mide lo que se compuso y se reparte en hojas del tamaño del papel, con el
   * mismo encabezado y pie en cada una. Las tablas largas se parten por filas.
   */
  function paginar(caja) {
    let s = caja.querySelector('.gdocx-wrapper > section');
    let vueltas = 0;
    while (s && vueltas++ < 500) {
      const nueva = partirSeccion(s);
      s = nueva || s.nextElementSibling;
      while (s && s.tagName !== 'SECTION') s = s.nextElementSibling;
    }
  }

  /** Un renglón suelto, corto y en negrita o en mayúsculas: tiene pinta de título. */
  function esTitulo(el) {
    if (el.tagName !== 'P' && !/^H\d$/.test(el.tagName)) return false;
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (!t || t.length > 90) return false;
    const r = el.getBoundingClientRect();
    const linea = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3 || 16;
    if (r.height > linea * 2.2) return false;
    if (/^H\d$/.test(el.tagName)) return true;
    const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
    const negrita = Array.from(el.querySelectorAll('*')).concat(el).some((x) => x.textContent.trim() && parseInt(getComputedStyle(x).fontWeight, 10) >= 600);
    return negrita || (letras.length >= 4 && letras === letras.toUpperCase());
  }

  /** Un párrafo de un solo renglón. */
  function renglonCorto(el) {
    if (el.tagName !== 'P') return false;
    const linea = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3 || 16;
    return el.getBoundingClientRect().height <= linea * 1.6 && el.textContent.trim().length <= 90;
  }

  const vacio = (el) => !el.textContent.trim() && !el.querySelector('img, svg, table, canvas, div[style*="position"]');

  function partirSeccion(s) {
    const alto = parseFloat(getComputedStyle(s).minHeight);
    if (!alto) return null;
    const rs = s.getBoundingClientRect();
    if (rs.height <= alto + 1) return null;
    const articulo = s.querySelector(':scope > article');
    if (!articulo) return null;
    // docx-preview a veces deja una lista numerada fuera del cuerpo de la hoja,
    // entre el cuerpo y el pie: se mete en el cuerpo para que cuente al repartir
    Array.from(s.children).forEach((ch) => {
      if (ch === articulo || ch.tagName === 'HEADER' || ch.tagName === 'FOOTER') return;
      if (ch.compareDocumentPosition(articulo) & Node.DOCUMENT_POSITION_FOLLOWING) articulo.prepend(ch);
      else articulo.appendChild(ch);
    });
    // a veces el contenido viene envuelto en una sola caja (columnas): se entra en ella
    let cont = articulo;
    while (cont.children.length === 1 && cont.firstElementChild.tagName === 'DIV' && cont.firstElementChild.children.length > 1) {
      cont = cont.firstElementChild;
    }
    const pie = s.querySelector(':scope > footer');
    const limite = rs.top + alto - parseFloat(getComputedStyle(s).paddingBottom)
      - (pie ? Math.max(0, pie.getBoundingClientRect().height - (parseFloat(pie.style.minHeight) || 0)) : 0);
    const hijos = Array.from(cont.children);
    let corte = -1;
    for (let k = 0; k < hijos.length; k++) {
      const r = hijos[k].getBoundingClientRect();
      if (r.bottom <= limite + 0.5) continue;
      if (r.top < limite && /^(TABLE|OL|UL)$/.test(hijos[k].tagName)) {
        const resto = hijos[k].tagName === 'TABLE' ? partirTabla(hijos[k], limite) : partirLista(hijos[k], limite);
        if (resto) { hijos.splice(k + 1, 0, resto); corte = k + 1; break; }
      }
      corte = k;
      break;
    }
    // Un título no se queda solo al pie de una hoja con su contenido en la siguiente: se pasa
    // con él. Word lo hace con «conservar con el siguiente»; muchos formatos no lo marcan y el
    // título cae en la hoja siguiente solo porque allí la letra ocupa algo más.
    // Lo mismo si tras el título solo alcanzan a entrar un par de renglones cortos (un
    // subtítulo, «Señores»): el título se lleva consigo ese arranque.
    if (corte > 1) {
      let titulo = -1;
      for (let k = corte - 1, cortos = 0; k > 0 && cortos <= 3; k--) {
        if (vacio(hijos[k])) continue;
        if (esTitulo(hijos[k])) titulo = k;
        else if (!renglonCorto(hijos[k])) break;
        cortos++;
      }
      if (titulo > 0) corte = titulo;
    }
    if (corte === 0) corte = 1;               // algo más alto que una hoja: va solo en la suya
    if (corte < 1 || corte >= hijos.length) return null;
    const resto = hijos.slice(corte);
    // los párrafos vacíos del final no merecen una hoja en blanco
    if (resto.every(vacio)) { resto.forEach((el) => el.remove()); return null; }

    const nueva = s.cloneNode(false);
    const cabeza = s.querySelector(':scope > header');
    if (cabeza) nueva.appendChild(cabeza.cloneNode(true));
    const art = articulo.cloneNode(false);
    let destino = art;
    const cadena = [];
    for (let p = cont; p !== articulo; p = p.parentElement) cadena.unshift(p);
    cadena.forEach((el) => { const c = el.cloneNode(false); destino.appendChild(c); destino = c; });
    resto.forEach((el) => destino.appendChild(el));
    nueva.appendChild(art);
    if (pie) nueva.appendChild(pie.cloneNode(true));
    s.after(nueva);
    return nueva;
  }

  /** Parte una tabla en la fila que ya no cabe; repite la cabecera si la tiene. */
  function partirTabla(tabla, limite) {
    const filas = Array.from(tabla.rows);
    const enCabeza = tabla.tHead ? tabla.tHead.rows.length : 0;
    const k = filas.findIndex((f, i) => i >= enCabeza && f.getBoundingClientRect().bottom > limite + 0.5);
    if (k <= enCabeza) return null;
    const otra = tabla.cloneNode(false);
    Array.from(tabla.children).forEach((ch) => {
      if (ch.tagName === 'COLGROUP' || ch.tagName === 'THEAD') otra.appendChild(ch.cloneNode(true));
    });
    const cuerpo = document.createElement('tbody');
    filas.slice(k).forEach((f) => cuerpo.appendChild(f));
    otra.appendChild(cuerpo);
    tabla.after(otra);
    return otra;
  }

  /**
   * Una tabla más ancha que la hoja se cortaba por la derecha. Word deja que
   * invada un poco el margen; si se sale del papel, aquí se achica hasta caber
   * (y se le descuenta el alto que deja de ocupar, para que no quede un hueco).
   */
  function ajustarTablas(caja) {
    caja.querySelectorAll('.gdocx-wrapper > section').forEach((s) => {
      const rs = s.getBoundingClientRect();
      const tope = rs.right - Math.min(24, parseFloat(getComputedStyle(s).paddingRight) / 2 || 24);
      s.querySelectorAll('table').forEach((t) => {
        if (t.parentElement.closest('table')) return;      // las de dentro van con la suya
        const r = t.getBoundingClientRect();
        if (r.right <= tope + 1 || r.width <= 0) return;
        const k = Math.max(0.5, (tope - r.left) / r.width);
        t.style.transform = `scale(${k})`;
        t.style.transformOrigin = '0 0';
        t.style.marginBottom = `${-(1 - k) * r.height}px`;
      });
    });
  }

  /** Parte una lista en el punto que ya no cabe; la numeración sigue donde iba. */
  function partirLista(lista, limite) {
    const items = Array.from(lista.children);
    const k = items.findIndex((li) => li.getBoundingClientRect().bottom > limite + 0.5);
    if (k <= 0) return null;
    const otra = lista.cloneNode(false);
    if (lista.tagName === 'OL') otra.setAttribute('start', String((parseInt(lista.getAttribute('start'), 10) || 1) + k));
    items.slice(k).forEach((li) => otra.appendChild(li));
    lista.after(otra);
    return otra;
  }

  async function wordAPdf(file, avisar) {
    if (typeof docx === 'undefined') throw new Error('falta el lector de Word');
    const caja = cajaOculta();
    try {
      if (avisar) avisar(`Componiendo ${file.name}…`);
      const datos = await prepararDocx(await file.arrayBuffer());
      await docx.renderAsync(datos, caja, null, {
        className: 'gdocx',
        inWrapper: true,
        breakPages: true,          // respeta los saltos de página del documento
        ignoreWidth: false,
        ignoreHeight: false,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,        // las imágenes quedan dentro, sin pedir nada fuera
      });
      completarFuentes(caja);
      cuadrosDeTextoADiv(caja);
      flotantesFueraDelRenglon(caja);
      // con las fuentes ya puestas, se espera a que carguen antes de medir
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      ajustarTablas(caja);
      paginar(caja);
      // docx-preview deja una <section> por hoja, ya con su tamaño y márgenes
      const hojas = Array.from(caja.querySelectorAll('.gdocx-wrapper > section'));
      if (!hojas.length) throw new Error('el documento salió vacío');
      const lienzos = [];
      for (let i = 0; i < hojas.length; i++) {
        if (avisar) avisar(`${file.name}: hoja ${i + 1} de ${hojas.length}…`);
        const r = hojas[i].getBoundingClientRect();
        lienzos.push({
          lienzo: await fotografiar(hojas[i]),
          anchoPx: r.width || A4.ancho,
          altoPx: r.height || A4.alto,
        });
      }
      return pdfDesdeLienzos(lienzos);
    } finally {
      caja.remove();
    }
  }

  /* ------------------------------ Excel ------------------------------- */

  const ESTILO_TABLA = `
    .ghoja { font: 12px "Calibri", "Carlito", Arial, sans-serif; color: #000; }
    .ghoja h4 { margin: 0 0 8px; font-size: 13px; }
    .ghoja table { border-collapse: collapse; table-layout: fixed; }
    .ghoja td, .ghoja th {
      border: 1px solid #9aa0a6; padding: 2px 5px; vertical-align: top;
      word-wrap: break-word; overflow-wrap: anywhere;
    }
    .ghoja tr:first-child td { background: #eee; font-weight: bold; }
  `;

  /** Pasa una hoja de cálculo a una tabla HTML con los anchos de sus columnas. */
  function tablaDeHoja(hoja) {
    const html = XLSX.utils.sheet_to_html(hoja, { header: '', footer: '', editable: false });
    const caja = document.createElement('div');
    caja.innerHTML = html;
    const tabla = caja.querySelector('table');
    if (!tabla) return null;
    tabla.removeAttribute('width');
    // Los anchos que traiga el archivo se respetan; el resto se reparte solo.
    const cols = hoja['!cols'];
    if (cols && cols.length) {
      const grupo = document.createElement('colgroup');
      cols.forEach((c) => {
        const col = document.createElement('col');
        const ancho = c && (c.wpx || (c.wch && c.wch * 7.5));
        if (ancho) col.style.width = Math.round(ancho) + 'px';
        grupo.appendChild(col);
      });
      tabla.insertBefore(grupo, tabla.firstChild);
    }
    return tabla;
  }

  /**
   * Reparte las filas en hojas sin partir ninguna por la mitad, y encoge la
   * tabla si es más ancha que el papel (que es lo normal en una cotización).
   */
  async function excelAPdf(file, avisar) {
    if (typeof XLSX === 'undefined') throw new Error('falta el lector de Excel');
    const libro = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
      type: 'array', cellStyles: true, cellDates: true,
    });
    const caja = cajaOculta();
    const estilo = document.createElement('style');
    estilo.textContent = ESTILO_TABLA;
    caja.appendChild(estilo);
    try {
      const lienzos = [];
      for (const nombre of libro.SheetNames) {
        const tabla = tablaDeHoja(libro.Sheets[nombre]);
        if (!tabla) continue;
        const filas = Array.from(tabla.querySelectorAll('tr'));
        if (!filas.length) continue;

        // Se mide con la tabla suelta para saber si entra de pie o echada
        const medidor = document.createElement('div');
        medidor.className = 'ghoja';
        medidor.style.cssText = 'position:absolute;left:0;top:0;width:max-content';
        medidor.appendChild(tabla);
        caja.appendChild(medidor);
        const anchoTabla = tabla.getBoundingClientRect().width;

        const echada = anchoTabla > A4.ancho - MARGEN * 2;
        const hojaAncho = echada ? A4.alto : A4.ancho;
        const hojaAlto = echada ? A4.ancho : A4.alto;
        const util = hojaAncho - MARGEN * 2;
        const encoge = Math.min(1, util / Math.max(anchoTabla, 1));
        const altoUtil = (hojaAlto - MARGEN * 2) / encoge;

        // Se agrupan las filas por lo que cabe en cada hoja
        const grupos = [[]];
        let acumulado = 0;
        for (const fila of filas) {
          const h = fila.getBoundingClientRect().height || 18;
          if (acumulado + h > altoUtil && grupos[grupos.length - 1].length) {
            grupos.push([]);
            acumulado = 0;
          }
          grupos[grupos.length - 1].push(fila);
          acumulado += h;
        }
        medidor.remove();

        for (let i = 0; i < grupos.length; i++) {
          if (avisar) {
            avisar(`${file.name} · ${nombre}: hoja ${i + 1} de ${grupos.length}…`);
          }
          const papel = document.createElement('div');
          papel.className = 'ghoja';
          papel.style.cssText = [
            'width:' + hojaAncho + 'px', 'min-height:' + hojaAlto + 'px',
            'padding:' + MARGEN + 'px', 'box-sizing:border-box', 'background:#fff',
          ].join(';');
          if (libro.SheetNames.length > 1) {
            const titulo = document.createElement('h4');
            titulo.textContent = nombre + (grupos.length > 1 ? ` (${i + 1}/${grupos.length})` : '');
            papel.appendChild(titulo);
          }
          const copia = tabla.cloneNode(false);
          const grupo = tabla.querySelector('colgroup');
          if (grupo) copia.appendChild(grupo.cloneNode(true));
          const cuerpo = document.createElement('tbody');
          grupos[i].forEach((f) => cuerpo.appendChild(f.cloneNode(true)));
          copia.appendChild(cuerpo);
          if (encoge < 1) {
            const envoltura = document.createElement('div');
            envoltura.style.cssText =
              `transform:scale(${encoge});transform-origin:0 0;width:${anchoTabla}px`;
            envoltura.appendChild(copia);
            papel.appendChild(envoltura);
          } else {
            papel.appendChild(copia);
          }
          caja.appendChild(papel);
          const alto = Math.min(
            Math.max(papel.getBoundingClientRect().height, hojaAlto), ALTO_MAXIMO_LIENZO);
          lienzos.push({ lienzo: await fotografiar(papel), anchoPx: hojaAncho, altoPx: alto });
          papel.remove();
        }
      }
      if (!lienzos.length) throw new Error('el libro no tiene celdas con datos');
      return pdfDesdeLienzos(lienzos);
    } finally {
      caja.remove();
    }
  }

  /* ------------------- Excel con su formato (ExcelJS) ------------------- */
  /*
   * El lector de arriba solo saca los valores: sin colores, sin bordes, sin
   * celdas combinadas ni logos, y sin el área de impresión, así que un cuadro
   * comparativo salía diminuto o en blanco. Este arma cada hoja como la
   * imprime Excel: área de impresión, anchos y altos, celdas combinadas,
   * rellenos, bordes, fuentes, formatos de número, imágenes, orientación,
   * márgenes, «ajustar a una página» y filas de título repetidas.
   */

  const PAPELES = { 1: [8.5, 11], 5: [8.5, 14], 8: [11.69, 16.54], 9: [8.27, 11.69], 11: [5.83, 8.27] };   // pulgadas
  const INDEXADOS = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
    '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000',
    '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF',
    '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000',
    '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
    '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966',
    '003300', '333300', '993300', '993366', '333399', '333333'];
  // colores del tema de Office, en el orden de Excel (0 fondo, 1 texto, 2, 3, énfasis 1–6)
  const TEMA_OFFICE = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

  function temaDelLibro(libro) {
    try {
      const xml = libro._themes && (libro._themes.theme1 || Object.values(libro._themes)[0]);
      if (!xml) return TEMA_OFFICE;
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const esquema = doc.getElementsByTagNameNS(NS.a, 'clrScheme')[0];
      if (!esquema) return TEMA_OFFICE;
      const leidos = Array.from(esquema.children).map((el) => {
        const c = el.firstElementChild;
        return c ? (c.getAttribute('val') && c.localName === 'srgbClr' ? c.getAttribute('val') : c.getAttribute('lastClr') || '000000') : '000000';
      });
      // en el archivo van oscuro 1, claro 1, oscuro 2, claro 2…; Excel numera claro 1 primero
      const orden = [1, 0, 3, 2, 4, 5, 6, 7, 8, 9];
      return orden.map((i, k) => leidos[i] || TEMA_OFFICE[k]);
    } catch (e) { return TEMA_OFFICE; }
  }

  function conTinte(hex, tinte) {
    if (!tinte) return '#' + hex;
    let r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    l = tinte < 0 ? l * (1 + tinte) : l * (1 - tinte) + tinte;
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    if (s === 0) r = g = b = l;
    else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  function colorCss(c, tema) {
    if (!c) return null;
    if (c.argb) return '#' + String(c.argb).slice(-6);
    if (c.theme != null) return conTinte(tema[c.theme] || '000000', c.tint);
    if (c.indexed != null) return INDEXADOS[c.indexed] ? '#' + INDEXADOS[c.indexed] : null;
    return null;
  }

  const BORDES = {
    thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid', double: '3px double',
    dashed: '1px dashed', dotted: '1px dotted', mediumDashed: '2px dashed', dashDot: '1px dashed',
    mediumDashDot: '2px dashed', dashDotDot: '1px dotted', mediumDashDotDot: '2px dotted', slantDashDot: '2px dashed',
  };

  const col2num = (letras) => letras.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  function rango(txt) {
    const m = /\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/i.exec(String(txt || '').replace(/^.*!/, ''));
    if (!m) return null;
    const r = { c1: col2num(m[1]), r1: +m[2], c2: col2num(m[3] || m[1]), r2: +(m[4] || m[2]) };
    return { r1: Math.min(r.r1, r.r2), r2: Math.max(r.r1, r.r2), c1: Math.min(r.c1, r.c2), c2: Math.max(r.c1, r.c2) };
  }

  /** El texto de la celda tal como lo muestra Excel (con su formato de número). */
  function textoCelda(celda) {
    let v = celda.value;
    if (v == null) return '';
    if (typeof v === 'object' && !(v instanceof Date)) {
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if ('result' in v) v = v.result;
      else if ('text' in v) v = v.text;
      else if (v.error) return v.error;
      else if (v.formula || v.sharedFormula) return '';
      if (v && typeof v === 'object' && !(v instanceof Date)) return v.error || '';
    }
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
    const ssf = typeof XLSX !== 'undefined' && XLSX.SSF;
    if (v instanceof Date) {
      const serie = (v.getTime() - Date.UTC(1899, 11, 30)) / 864e5;
      try { return ssf ? ssf.format(celda.numFmt || 'dd/mm/yyyy', serie) : v.toLocaleDateString('es'); } catch (e) { return v.toLocaleDateString('es'); }
    }
    if (typeof v === 'number') {
      try { return ssf ? ssf.format(celda.numFmt || 'General', v) : String(v); } catch (e) { return String(v); }
    }
    return String(v);
  }

  const esNumero = (celda) => {
    const v = celda.value && celda.value.result !== undefined ? celda.value.result : celda.value;
    return typeof v === 'number' || v instanceof Date;
  };

  /** `k`: la escala de la hoja; las letras se dibujan ya a su tamaño final. */
  function estiloFuente(f, tema, k) {
    f = f || {};
    const css = [`font-family:${conRespaldo(f.name || 'Calibri')}`, `font-size:${((f.size || 11) * (k || 1)).toFixed(3)}pt`];
    if (f.bold) css.push('font-weight:bold');
    if (f.italic) css.push('font-style:italic');
    const deco = [f.underline ? 'underline' : '', f.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) css.push('text-decoration:' + deco);
    const color = colorCss(f.color, tema);
    if (color) css.push('color:' + color);
    if (f.vertAlign === 'superscript') css.push('vertical-align:super;font-size:smaller');
    return css.join(';');
  }

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /** Lo que ocupa la hoja: el área de impresión o, si no hay, hasta la última celda con algo. */
  function rangoDeHoja(hoja) {
    const ps = hoja.pageSetup || {};
    const area = ps.printArea && rango(String(ps.printArea).split(/&&|,/)[0]);
    if (area) return area;
    let r2 = 0, c2 = 0;
    hoja.eachRow({ includeEmpty: false }, (fila, nr) => {
      fila.eachCell({ includeEmpty: false }, (celda, nc) => {
        const s = celda.style || {};
        const conAlgo = textoCelda(celda) !== '' || (s.fill && s.fill.pattern && s.fill.pattern !== 'none')
          || (s.border && Object.values(s.border).some((b) => b && b.style));
        if (conAlgo) { r2 = Math.max(r2, nr); c2 = Math.max(c2, nc); }
      });
    });
    (hoja.model.merges || []).forEach((m) => { const g = rango(m); if (g && g.r1 <= r2) { r2 = Math.max(r2, g.r2); c2 = Math.max(c2, g.c2); } });
    (hoja.getImages() || []).forEach((im) => {
      const br = im.range && im.range.br;
      if (br) { r2 = Math.max(r2, Math.ceil(br.nativeRow + 1)); c2 = Math.max(c2, Math.ceil(br.nativeCol + 1)); }
    });
    if (!r2 || !c2) return null;
    return { r1: 1, c1: 1, r2: Math.min(r2, 5000), c2: Math.min(c2, 200) };
  }

  async function imagenesDeHoja(libro, hoja) {
    const lista = [];
    for (const im of hoja.getImages() || []) {
      try {
        const media = libro.getImage(Number(im.imageId));
        if (!media) continue;
        let url;
        if (media.base64) url = media.base64.startsWith('data:') ? media.base64 : `data:image/${media.extension};base64,${media.base64}`;
        else if (media.buffer) {
          const blob = new Blob([media.buffer], { type: 'image/' + (media.extension === 'jpg' ? 'jpeg' : media.extension) });
          url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        }
        if (url && im.range && im.range.tl) lista.push({ url, rango: im.range });
      } catch (e) { /* una imagen rara no detiene la hoja */ }
    }
    return lista;
  }

  async function excelConFormato(file, avisar) {
    if (typeof ExcelJS === 'undefined') throw new Error('falta el lector de Excel');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await file.arrayBuffer());
    const tema = temaDelLibro(libro);
    const caja = cajaOculta();
    caja.style.width = 'auto';
    const lienzos = [];
    try {
      for (const hoja of libro.worksheets) {
        if (hoja.state && hoja.state !== 'visible') continue;
        const area = rangoDeHoja(hoja);
        if (!area) continue;
        const ps = hoja.pageSetup || {};

        // columnas y filas visibles, con su medida en píxeles
        const cols = [];
        for (let c = area.c1; c <= area.c2; c++) {
          const col = hoja.getColumn(c);
          if (col.hidden) continue;
          const ancho = col.width || (hoja.properties && hoja.properties.defaultColWidth) || 8.43;
          cols.push({ c, px: Math.round(ancho * 7 + 5) });
        }
        const altoBase = (hoja.properties && hoja.properties.defaultRowHeight) || 15;
        const filas = [];
        for (let r = area.r1; r <= area.r2; r++) {
          const f = hoja.getRow(r);
          if (f.hidden) continue;
          filas.push({ r, px: Math.round((f.height || altoBase) * 4 / 3) });
        }
        if (!cols.length || !filas.length) continue;
        const anchoTabla = cols.reduce((s, c) => s + c.px, 0);
        const colX = new Map(); let x = 0; cols.forEach((c) => { colX.set(c.c, x); x += c.px; });

        // celdas combinadas: para cada celda, la combinada que la cubre
        const cubre = new Map();
        (hoja.model.merges || []).forEach((m) => {
          const g = rango(m);
          if (!g) return;
          for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) cubre.set(r + ':' + c, g);
        });

        // papel, márgenes y escala
        const [pw, ph] = PAPELES[ps.paperSize] || PAPELES[9];
        const echada = ps.orientation === 'landscape';
        const papelW = Math.round((echada ? ph : pw) * 96), papelH = Math.round((echada ? pw : ph) * 96);
        const mg = Object.assign({ left: 0.7, right: 0.7, top: 0.75, bottom: 0.75 }, ps.margins || {});
        const utilW = papelW - (mg.left + mg.right) * 96, utilH = papelH - (mg.top + mg.bottom) * 96;
        const altoTabla = filas.reduce((s, f) => s + f.px, 0);
        let k = (ps.scale || 100) / 100;
        if (ps.fitToPage) {
          const aw = ps.fitToWidth === 0 ? Infinity : utilW * (ps.fitToWidth || 1) / anchoTabla;
          const ah = ps.fitToHeight === 0 || ps.fitToHeight == null ? Infinity : utilH * ps.fitToHeight / altoTabla;
          k = Math.min(1, aw, ah);
        }
        // Excel mandaría las columnas que no caben a otra hoja; aquí se achica para que
        // la tabla se lea entera en el ancho del papel
        // (sin piso: un cuadro comparativo ancho Excel lo imprime al 12 %, y así sale igual)
        k = Math.max(0.05, Math.min(k, utilW / anchoTabla));

        // filas de título repetidas y saltos de página manuales
        const titulos = [];
        const pt = ps.printTitlesRow && /(\d+):\$?(\d+)/.exec(String(ps.printTitlesRow));
        if (pt) filas.forEach((f) => { if (f.r >= +pt[1] && f.r <= +pt[2]) titulos.push(f); });
        const saltos = new Set((hoja.rowBreaks || []).map((b) => b.id));

        // reparto de filas por hoja
        const paginas = [];
        let actual = [], alto = 0;
        const altoTitulos = titulos.reduce((s, f) => s + f.px, 0);
        const disponible = utilH / k;
        filas.forEach((f) => {
          const tope = paginas.length && titulos.length ? disponible - altoTitulos : disponible;
          if (actual.length && alto + f.px > tope) { paginas.push(actual); actual = []; alto = 0; }
          actual.push(f); alto += f.px;
          if (saltos.has(f.r)) { paginas.push(actual); actual = []; alto = 0; }
        });
        if (actual.length) paginas.push(actual);

        const imagenes = await imagenesDeHoja(libro, hoja);
        const filaY = new Map(); let yy = 0; filas.forEach((f) => { filaY.set(f.r, yy); yy += f.px; });
        // Las imágenes se anclan a celdas que pueden quedar fuera del área de impresión
        // (el logo en la columna A con el área desde la B): se miden desde la A1 y se
        // corren lo que mida lo que queda fuera.
        const anchoCol = (c) => { const col = hoja.getColumn(c); return col.hidden ? 0 : Math.round((col.width || (hoja.properties && hoja.properties.defaultColWidth) || 8.43) * 7 + 5); };
        const altoFila = (r) => { const f = hoja.getRow(r); return f.hidden ? 0 : Math.round((f.height || altoBase) * 4 / 3); };
        const xAbs = (c) => { let s = 0; for (let j = 1; j < c; j++) s += anchoCol(j); return s; };
        const yAbs = (r) => { let s = 0; for (let j = 1; j < r; j++) s += altoFila(j); return s; };
        const x0Area = xAbs(area.c1), y0Area = yAbs(area.r1);

        for (let p = 0; p < paginas.length; p++) {
          if (avisar) avisar(`${file.name} · ${hoja.name}: hoja ${p + 1} de ${paginas.length}…`);
          const enPagina = (p > 0 && titulos.length ? titulos.filter((t) => !paginas[p].includes(t)) : []).concat(paginas[p]);
          // Todo se dibuja ya a su tamaño final (medidas × k), sin achicar la hoja después:
          // así el subrayado y las líneas finas no se pierden al reducir.
          let html = `<table style="border-collapse:collapse;table-layout:fixed;width:${anchoTabla * k}px"><colgroup>`
            + cols.map((c) => `<col style="width:${c.px * k}px">`).join('') + '</colgroup>';
          for (const f of enPagina) {
            html += `<tr style="height:${f.px * k}px">`;
            for (let i = 0; i < cols.length; i++) {
              const c = cols[i].c;
              const g = cubre.get(f.r + ':' + c);
              let rs = 1, cs = 1, h = f.px;
              if (g) {
                // una combinada se dibuja una vez por hoja, desde su primera fila y columna
                // visibles aquí (si empezó en la hoja anterior, sigue en esta)
                const filasG = enPagina.filter((x) => x.r >= g.r1 && x.r <= g.r2);
                const colsG = cols.filter((x) => x.c >= g.c1 && x.c <= g.c2);
                if (filasG[0] !== f || colsG[0].c !== c) continue;
                rs = filasG.length; cs = colsG.length;
                h = filasG.reduce((s, x) => s + x.px, 0);
              }
              const fuente = g ? hoja.getCell(g.r1, g.c1) : hoja.getCell(f.r, c);
              const st = fuente.style || {};
              h *= k;
              const fuenteCss = estiloFuente(st.font, tema, k);
              // renglones como los de Excel con Calibri (1,22 veces la letra)
              const css = [fuenteCss, `padding:0 ${3 * k}px`, `height:${h}px`, 'line-height:1.22'];
              const relleno = st.fill && st.fill.type === 'pattern' && st.fill.pattern !== 'none' ? colorCss(st.fill.fgColor, tema)
                : st.fill && st.fill.type === 'gradient' && st.fill.stops ? colorCss(st.fill.stops[0].color, tema) : null;
              if (relleno) css.push('background:' + relleno);
              // en una combinada, cada borde exterior lo lleva la celda de ese lado
              const borde = (lado, celdaB) => {
                const b = celdaB && celdaB.style && celdaB.style.border && celdaB.style.border[lado];
                if (!b || !b.style || !BORDES[b.style]) return;
                // el grosor se achica con la hoja, sin bajar de una línea fina (como imprime Excel)
                const [ancho, tipo] = BORDES[b.style].split(' ');
                const px = Math.max(0.75, parseFloat(ancho) * Math.min(1, k * 2));
                css.push(`border-${lado}:${px.toFixed(2)}px ${tipo === 'double' && px < 2.5 ? 'solid' : tipo} ${colorCss(b.color, tema) || '#000'}`);
              };
              borde('top', fuente);
              borde('left', fuente);
              borde('bottom', g ? hoja.getCell(Math.min(g.r2, enPagina[enPagina.length - 1].r), g.c1) : fuente);
              borde('right', g ? hoja.getCell(g.r1, g.c2) : fuente);
              const al = st.alignment || {};
              const txt = textoCelda(fuente);
              const hor = al.horizontal === 'centerContinuous' ? 'center' : al.horizontal === 'distributed' ? 'justify'
                : al.horizontal === 'fill' ? 'left'
                : al.horizontal || (esNumero(fuente) ? 'right' : typeof fuente.value === 'boolean' ? 'center' : 'left');
              css.push('text-align:' + hor);
              css.push('vertical-align:' + (al.vertical === 'middle' || al.vertical === 'center' ? 'middle' : al.vertical === 'top' ? 'top' : 'bottom'));
              if (al.indent) css.push(`padding-left:${(3 + al.indent * 9) * k}px`);
              // la fuente va pegada al texto (no solo en la celda): la «foto» de la hoja no
              // pinta un subrayado que viene de más arriba, y el título salía sin subrayar
              let dentro = fuente.value && fuente.value.richText
                ? fuente.value.richText.map((t) => `<span style="${estiloFuente(Object.assign({}, st.font, t.font), tema, k)}">${esc(t.text)}</span>`).join('')
                // Excel cuenta un salto de línea al final como un renglón más (y centra el bloque
                // con él); el navegador lo ignora si no lleva algo detrás
                : `<span style="${fuenteCss}">${esc(al.wrapText && /\n$/.test(txt) ? txt + '\u200b' : txt)}</span>`;
              if (al.wrapText) {
                // Un texto más alto que su fila se recorta como en Excel: centrado (o arriba,
                // o abajo) según la celda. Antes se cortaba siempre por abajo, y un encabezado
                // que empieza con líneas en blanco perdía justo las frases que se ven.
                const vert = al.vertical === 'middle' || al.vertical === 'center' ? 'center' : al.vertical === 'top' ? 'flex-start' : 'flex-end';
                css.push('overflow:hidden', 'white-space:pre-wrap', 'word-wrap:break-word');
                dentro = `<div style="height:${h}px;display:flex;flex-direction:column;justify-content:${vert};overflow:hidden"><div>${dentro}</div></div>`;
              } else if (!g && txt && hor === 'left' && i < cols.length - 1 && textoCelda(hoja.getCell(f.r, cols[i + 1].c)) === '') {
                // el texto sin ajustar se sale hacia la celda vacía de al lado, como en Excel
                css.push('overflow:visible', 'white-space:nowrap');
                dentro = `<span style="position:relative;z-index:1">${dentro}</span>`;
              } else {
                css.push('overflow:hidden', 'white-space:nowrap');
              }
              html += `<td${rs > 1 ? ` rowspan="${rs}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''} style="${css.join(';')}">${dentro}</td>`;
            }
            html += '</tr>';
          }
          html += '</table>';

          const papel = document.createElement('div');
          papel.style.cssText = `position:relative;width:${papelW}px;height:${papelH}px;background:#fff;overflow:hidden`;
          const contenido = document.createElement('div');
          const dx = ps.horizontalCentered ? Math.max(0, (utilW - anchoTabla * k) / 2) : 0;
          contenido.style.cssText = `position:absolute;left:${mg.left * 96 + dx}px;top:${mg.top * 96}px;width:${anchoTabla * k}px;color:#000`;
          contenido.innerHTML = html;
          // las imágenes (logos) van en su sitio, si su fila cayó en esta hoja
          const tituloExtra = p > 0 && titulos.length ? altoTitulos : 0;
          const yIni = y0Area + (filaY.get(paginas[p][0].r) || 0);
          const yFin = yIni + paginas[p].reduce((t, f) => t + f.px, 0);
          imagenes.forEach((im) => {
            const tl = im.rango.tl, br = im.rango.br;
            const ax = xAbs(Math.floor(tl.nativeCol) + 1) + (tl.nativeColOff || 0) / 9525;
            const ay = yAbs(Math.floor(tl.nativeRow) + 1) + (tl.nativeRowOff || 0) / 9525;
            let w, h;
            if (br) {
              w = xAbs(Math.floor(br.nativeCol) + 1) + (br.nativeColOff || 0) / 9525 - ax;
              h = yAbs(Math.floor(br.nativeRow) + 1) + (br.nativeRowOff || 0) / 9525 - ay;
            } else if (im.rango.ext) { w = im.rango.ext.width; h = im.rango.ext.height; }
            if (!(w > 0 && h > 0)) return;
            // va en la hoja donde cae su esquina de arriba (o en la primera, si está encima del área)
            const enEsta = (ay >= yIni && ay < yFin) || (p === 0 && ay < yIni);
            if (!enEsta) return;
            const img = document.createElement('img');
            img.src = im.url;
            img.style.cssText = `position:absolute;left:${(ax - x0Area) * k}px;top:${(ay - yIni + tituloExtra) * k}px;width:${w * k}px;height:${h * k}px;z-index:2`;
            contenido.appendChild(img);
          });
          papel.appendChild(contenido);
          caja.appendChild(papel);
          await Promise.all(Array.from(papel.querySelectorAll('img')).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
          lienzos.push({ lienzo: await fotografiar(papel), anchoPx: papelW, altoPx: papelH });
          papel.remove();
        }
      }
      if (!lienzos.length) throw new Error('el libro no tiene celdas con datos');
      return pdfDesdeLienzos(lienzos);
    } finally {
      caja.remove();
    }
  }

  /* ------------------------------ entrada ----------------------------- */

  /** Devuelve los bytes de un PDF a partir de un archivo de Office. */
  G.officeAPdf = async function (file, avisar) {
    if (G.esWord(file)) return wordAPdf(file, avisar);
    if (G.esExcel(file)) {
      // .xlsx y .xlsm, con su formato; los .xls antiguos y los .csv, con el lector simple
      if (/\.(xlsx|xlsm)$/i.test(file.name) && typeof ExcelJS !== 'undefined') {
        try { return await excelConFormato(file, avisar); } catch (e) {
          console.warn('Excel: no se pudo con el formato, se usa el lector simple', e);
        }
      }
      return excelAPdf(file, avisar);
    }
    throw new Error('formato no admitido');
  };
})(window.Grapa);
