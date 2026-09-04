/**
 * Grapa · Word y Excel
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

  async function wordAPdf(file, avisar) {
    if (typeof docx === 'undefined') throw new Error('falta el lector de Word');
    const caja = cajaOculta();
    try {
      if (avisar) avisar(`Componiendo ${file.name}…`);
      await docx.renderAsync(await file.arrayBuffer(), caja, null, {
        className: 'gdocx',
        inWrapper: true,
        breakPages: true,          // respeta los saltos de página del documento
        ignoreWidth: false,
        ignoreHeight: false,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,        // las imágenes quedan dentro, sin pedir nada fuera
      });
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

  /**
   * Corta un lienzo muy alto en hojas del alto pedido. Se usa cuando el
   * contenido no viene en bloques que se puedan repartir (el cuerpo de un
   * correo, por ejemplo).
   */
  function partirLienzo(lienzo, altoHojaPx) {
    const partes = [];
    const altoTrozo = Math.round(altoHojaPx * NITIDEZ);
    for (let y = 0; y < lienzo.height; y += altoTrozo) {
      const alto = Math.min(altoTrozo, lienzo.height - y);
      const trozo = document.createElement('canvas');
      trozo.width = lienzo.width;
      trozo.height = altoTrozo;                       // hojas todas del mismo alto
      const cx = trozo.getContext('2d');
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, trozo.width, trozo.height);
      cx.drawImage(lienzo, 0, y, lienzo.width, alto, 0, 0, lienzo.width, alto);
      partes.push(trozo);
    }
    return partes;
  }

  /**
   * Lo que necesita cualquier módulo que quiera imprimir HTML a PDF sin salir
   * del navegador: una caja donde componer, la foto y el armado del PDF.
   */
  G.papel = {
    A4,
    MARGEN,
    caja: cajaOculta,
    fotografiar,
    partir: partirLienzo,
    aPdf: pdfDesdeLienzos,
  };

  /* ------------------------------ entrada ----------------------------- */

  /** Devuelve los bytes de un PDF a partir de un archivo de Office. */
  G.officeAPdf = async function (file, avisar) {
    if (G.esWord(file)) return wordAPdf(file, avisar);
    if (G.esExcel(file)) return excelAPdf(file, avisar);
    throw new Error('formato no admitido');
  };
})(window.Grapa);
