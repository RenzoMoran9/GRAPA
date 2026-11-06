/* ===========================================================
   Pdflash · primeros pasos: recorrido guiado y expediente de ejemplo

   Quien abre Pdflash por primera vez ve, una sola vez, un recorrido corto
   que le señala dónde está cada cosa. Y puede practicar con un expediente
   de ejemplo, armado aquí mismo, sin arriesgar sus documentos.
   El recorrido vuelve desde Ayuda ▸ Recorrido guiado.
   =========================================================== */
(function () {
  'use strict';
  const G = window.Grapa;
  const E = G.estado;
  const $ = (s, r) => (r || document).querySelector(s);
  const CLAVE_VISTA = 'grapa.guia.vista';

  /* ---------------- expediente de ejemplo ---------------- */

  const HOJAS_EJEMPLO = [
    {
      titulo: 'REQUERIMIENTO DE BIENES',
      sub: 'Área usuaria: Unidad de Logística',
      lineas: ['Objeto: adquisición de útiles de escritorio para las oficinas administrativas.',
        'Ítem 1 · Papel bond A4 80 g · 50 millares', 'Ítem 2 · Tóner para impresora láser · 12 unidades',
        'Ítem 3 · Archivadores de palanca lomo ancho · 200 unidades', '',
        'Plazo de entrega: 10 días calendario.', 'Lugar de entrega: almacén central.'],
    },
    {
      titulo: 'ESPECIFICACIONES TÉCNICAS',
      sub: 'Adquisición de útiles de escritorio',
      lineas: ['1. Finalidad pública: asegurar el normal funcionamiento de las oficinas.',
        '2. Características: papel bond blanco, 80 g/m², formato A4.',
        '3. Tóner original o compatible certificado, rendimiento mínimo 3 000 páginas.',
        '4. Archivadores de cartón forrado, lomo ancho, con palanca metálica.',
        '5. Garantía comercial mínima: 6 meses.', '6. Forma de pago: única, a la conformidad.'],
    },
    {
      titulo: 'COTIZACIÓN N° 0125-2026',
      sub: 'DISTRIBUIDORA ANDINA S.A.C. · RUC 20123456789',
      lineas: ['Señores: Unidad de Logística', 'Presente.', '',
        'Papel bond A4 80 g · 50 millares ............ S/ 1 250.00',
        'Tóner láser · 12 unidades ...................... S/ 1 980.00',
        'Archivadores lomo ancho · 200 unidades ...... S/ 1 100.00', '',
        'TOTAL: S/ 4 330.00 (incluye IGV)', 'Validez de la oferta: 30 días.'],
    },
    {
      titulo: 'COTIZACIÓN N° 0087',
      sub: 'SUMINISTROS DEL SUR E.I.R.L. · RUC 20987654321',
      lineas: ['Atención: Unidad de Logística', '',
        'Papel bond A4 80 g · 50 millares ............ S/ 1 180.00',
        'Tóner láser · 12 unidades ...................... S/ 2 040.00',
        'Archivadores lomo ancho · 200 unidades ...... S/ 1 060.00', '',
        'TOTAL: S/ 4 280.00 (incluye IGV)', 'Plazo de entrega: 7 días.'],
    },
    {
      titulo: 'FORMATO N° 1',
      sub: 'Declaración jurada de datos del postor',
      lineas: ['El que suscribe declara bajo juramento que la información',
        'consignada es verdadera:', '',
        'Razón social: SUMINISTROS DEL SUR E.I.R.L.', 'RUC: 20987654321',
        'Domicilio legal: Av. Los Próceres 1450, Arequipa', 'Correo: ventas@ejemplo.pe', '',
        '__________________________', 'Firma del representante legal'],
    },
    {
      titulo: 'FORMATO N° 5',
      sub: 'Declaración jurada de no tener impedimento para contratar',
      lineas: ['Declaro bajo juramento no estar impedido para contratar',
        'con el Estado, conforme a la normativa vigente.', '',
        'Lugar y fecha: Arequipa, 3 de noviembre de 2026', '', '',
        '__________________________', 'Firma del representante legal'],
    },
  ];

  /** Un PDF de seis hojas que parece un expediente de verdad, armado aquí mismo. */
  async function crearEjemplo() {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
    const gris = rgb(0.38, 0.39, 0.43);
    // Helvetica no trae algunos signos; se cambian por los que sí tiene
    const limpio = (t) => t.replace(/[^\x20-\x7E\xA0-\xFF]/g, '-');
    HOJAS_EJEMPLO.forEach((h, i) => {
      const p = doc.addPage([595.28, 841.89]);
      p.drawRectangle({ x: 48, y: 48, width: 499, height: 746, borderColor: rgb(0.85, 0.85, 0.83), borderWidth: 1 });
      p.drawText(limpio('ENTIDAD DE EJEMPLO · EXPEDIENTE DE PRUEBA'), { x: 70, y: 765, size: 8, font: normal, color: gris });
      p.drawText(limpio(h.titulo), { x: 70, y: 720, size: 18, font: negrita, color: rgb(0.1, 0.1, 0.12) });
      p.drawText(limpio(h.sub), { x: 70, y: 698, size: 11, font: normal, color: gris });
      p.drawLine({ start: { x: 70, y: 684 }, end: { x: 525, y: 684 }, thickness: 1, color: rgb(0.88, 0.33, 0.18) });
      h.lineas.forEach((l, k) => {
        if (l) p.drawText(limpio(l), { x: 70, y: 650 - k * 22, size: 11, font: normal, color: rgb(0.15, 0.15, 0.17) });
      });
      p.drawText(limpio(`Hoja ${i + 1} de ${HOJAS_EJEMPLO.length} · documento de práctica, sin valor`), { x: 70, y: 66, size: 8, font: normal, color: gris });
    });
    const bytes = await doc.save();
    return new File([bytes], 'Expediente de ejemplo.pdf', { type: 'application/pdf' });
  }

  async function abrirEjemplo() {
    // si este tablero ya tiene trabajo, el ejemplo va en uno nuevo
    if (E.paginas.length) {
      const nuevo = $('#btnTableroNuevo');
      if (nuevo && !nuevo.hidden && !nuevo.disabled) {
        nuevo.click();
        await new Promise((r) => setTimeout(r, 60));
      }
    }
    try {
      await G.anadirArchivos([await crearEjemplo()]);
      G.aviso('Expediente de ejemplo abierto: prueba a foliarlo, firmarlo y exportarlo. No es un documento real.', 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo armar el ejemplo.', 'error');
    }
  }

  /* ---------------- recorrido guiado ---------------- */

  const PASOS = [
    { el: '#btnAbrir', titulo: 'Empieza abriendo tus archivos',
      texto: 'PDF, Word, Excel o fotos. También puedes arrastrarlos a la pantalla o pegarlos con Ctrl+V.' },
    { el: '#riel', titulo: 'Tus herramientas, en orden', lado: 'derecha',
      texto: 'Documentos, buscar, revisar, firmar, foliar, dividir… Toca una y se abre a su lado con lo que necesitas.' },
    { el: '#lienzo', titulo: 'Aquí están tus hojas',
      texto: 'Arrástralas para cambiar el orden. Un clic marca una hoja; con Ctrl o Mayús marcas varias. La tecla V las abre en grande.' },
    { el: '#ruta', titulo: 'Lo que te falta',
      texto: 'Esta tira dice qué está hecho y qué falta: foliar, firmar, guardar… El botón de la derecha hace el paso siguiente.' },
    { el: '#btnGuardarExp', titulo: 'Guarda para seguir otro día',
      texto: 'Guarda el expediente y retómalo cuando quieras desde «Exped.», en las herramientas.' },
    { el: '#btnGuardar', titulo: 'Exporta el PDF final',
      texto: 'Arma el PDF con folios y firmas y lo descarga. Antes te avisa si olvidaste foliar o firmar.' },
    { el: '#btnAyuda', titulo: '¿Dudas?',
      texto: 'Aquí están la ayuda y los atajos. Este recorrido vuelve cuando quieras desde el menú Ayuda.' },
  ];

  const capa = document.createElement('div');
  capa.className = 'guia';
  capa.id = 'guia';
  capa.hidden = true;
  capa.innerHTML = `
    <div class="guia-foco" id="guiaFoco"></div>
    <div class="guia-tarjeta" id="guiaTarjeta" role="dialog" aria-modal="true" aria-labelledby="guiaTitulo" aria-describedby="guiaTexto">
      <span class="guia-paso" id="guiaPaso"></span>
      <h3 id="guiaTitulo"></h3>
      <p id="guiaTexto"></p>
      <div class="guia-botones">
        <button type="button" class="btn btn-mini" id="guiaSaltar">Saltar</button>
        <span class="guia-puntos" id="guiaPuntos" aria-hidden="true"></span>
        <button type="button" class="btn btn-secundario btn-chico" id="guiaAtras">Atrás</button>
        <button type="button" class="btn btn-primario btn-chico" id="guiaSiguiente">Siguiente</button>
      </div>
    </div>`;
  document.body.appendChild(capa);

  const visible = (el) => {
    if (!el || el.hidden || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  let pasos = [];
  let actual = 0;

  function colocar() {
    if (capa.hidden) return;
    const paso = pasos[actual];
    const el = $(paso.el);
    const foco = $('#guiaFoco');
    const tarjeta = $('#guiaTarjeta');
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!visible(el)) {
      foco.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      tarjeta.style.cssText = `left:${Math.max(16, vw / 2 - 170)}px;top:${vh / 2 - 90}px`;
      return;
    }
    const r = el.getBoundingClientRect();
    const m = 6;   // aire alrededor de lo señalado
    const fx = Math.max(4, r.left - m), fy = Math.max(4, r.top - m);
    const fw = Math.min(vw - 8, r.width + 2 * m), fh = Math.min(vh - 8, r.height + 2 * m);
    foco.style.cssText = `left:${fx}px;top:${fy}px;width:${fw}px;height:${fh}px`;

    const tw = tarjeta.offsetWidth, th = tarjeta.offsetHeight;
    let x, y;
    if (paso.lado === 'derecha' && fx + fw + 16 + tw < vw) {
      x = fx + fw + 14; y = Math.min(Math.max(16, fy + 20), vh - th - 16);
    } else if (fh > vh * 0.5) {
      // algo grande (las hojas): la tarjeta va dentro, arriba al centro
      x = fx + fw / 2 - tw / 2; y = fy + 40;
    } else if (fy + fh + 14 + th < vh) {
      x = fx + fw / 2 - tw / 2; y = fy + fh + 14;
    } else {
      x = fx + fw / 2 - tw / 2; y = fy - th - 14;
    }
    x = Math.min(Math.max(16, x), vw - tw - 16);
    y = Math.min(Math.max(16, y), vh - th - 16);
    tarjeta.style.cssText = `left:${x}px;top:${y}px`;
  }

  function pintarPaso() {
    const paso = pasos[actual];
    const ultimo = actual === pasos.length - 1;
    $('#guiaPaso').textContent = `Paso ${actual + 1} de ${pasos.length}`;
    $('#guiaTitulo').textContent = paso.titulo;
    $('#guiaTexto').textContent = paso.texto;
    $('#guiaAtras').hidden = actual === 0;
    $('#guiaSiguiente').textContent = ultimo ? (E.paginas.length ? 'Terminar' : 'Probar con un ejemplo') : 'Siguiente';
    $('#guiaSaltar').textContent = ultimo ? (E.paginas.length ? '' : 'Terminar') : 'Saltar';
    $('#guiaSaltar').hidden = ultimo && !!E.paginas.length;
    $('#guiaPuntos').innerHTML = pasos.map((_, i) => `<i class="${i === actual ? 'activo' : ''}"></i>`).join('');
    colocar();
    // el botón principal recibe el foco: Enter avanza
    setTimeout(() => $('#guiaSiguiente').focus(), 30);
  }

  function empezar() {
    if (!capa.hidden) return;
    // los pasos cuyo botón no está (por permisos, o la ruta sin hojas) se saltan
    pasos = PASOS.filter((p) => visible($(p.el)));
    if (!pasos.length) return;
    actual = 0;
    try { localStorage.setItem(CLAVE_VISTA, '1'); } catch (e) {}
    capa.hidden = false;
    document.documentElement.classList.add('con-guia');
    pintarPaso();
  }

  function terminar() {
    capa.hidden = true;
    document.documentElement.classList.remove('con-guia');
  }

  function siguiente() {
    if (actual < pasos.length - 1) { actual++; pintarPaso(); return; }
    const conEjemplo = !E.paginas.length;
    terminar();
    if (conEjemplo) abrirEjemplo();
  }

  $('#guiaSiguiente').addEventListener('click', siguiente);
  $('#guiaAtras').addEventListener('click', () => { if (actual > 0) { actual--; pintarPaso(); } });
  $('#guiaSaltar').addEventListener('click', terminar);
  // mientras dura, lo de atrás no se toca: ni clics ni atajos
  capa.addEventListener('click', (ev) => { if (ev.target === capa || ev.target.id === 'guiaFoco') ev.stopPropagation(); });
  window.addEventListener('keydown', (ev) => {
    if (capa.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); terminar(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); siguiente(); }
    else if (ev.key === 'ArrowLeft' && actual > 0) { ev.preventDefault(); actual--; pintarPaso(); }
    else if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Tab') return;   // los botones de la tarjeta
    else { ev.preventDefault(); }
    ev.stopImmediatePropagation();
  }, true);
  window.addEventListener('resize', colocar);

  /* ---------------- botones que llevan aquí ---------------- */
  [['#btnEjemplo', abrirEjemplo], ['#menuEjemplo', abrirEjemplo], ['#btnGuiaVacio', empezar], ['#menuGuia', empezar]]
    .forEach(([sel, fn]) => { const b = $(sel); if (b) b.addEventListener('click', () => fn()); });

  G.guia = { empezar, terminar, abrirEjemplo, crearEjemplo };

  /* ---------------- la primera vez, solo ---------------- */
  function yaLaVio() { try { return localStorage.getItem(CLAVE_VISTA) === '1'; } catch (e) { return true; } }
  function puedeEmpezarSola() {
    const acceso = $('#acceso');
    if (acceso && !acceso.hidden) return false;                     // falta iniciar sesión
    if (document.querySelector('.modal:not([hidden])')) return false; // hay un cuadro abierto
    return true;
  }
  if (!yaLaVio()) {
    let intentos = 0;
    const reloj = setInterval(() => {
      if (yaLaVio() || ++intentos > 600) { clearInterval(reloj); return; }   // hasta 5 min esperando el inicio de sesión
      if (!puedeEmpezarSola()) return;
      clearInterval(reloj);
      setTimeout(() => { if (!yaLaVio() && puedeEmpezarSola()) empezar(); }, 700);
    }, 500);
  }
})();
