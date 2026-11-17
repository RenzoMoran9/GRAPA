/* ===========================================================
   Pdflash · modo enfocado

   Las hojas se quedan con casi toda la pantalla. Lo demás no desaparece:
   se aparta y vuelve cuando se le busca.

     · Arriba queda una sola tira: las pestañas de los tableros, deshacer,
       el paso siguiente del expediente y Exportar PDF.
     · La barra de menús (Archivo, Editar, Ver, Ayuda) baja sola al acercar
       el ratón al borde de arriba, o con el botón del logo.
     · El riel de herramientas sale al acercar el ratón al borde izquierdo;
       la herramienta elegida se abre como un cajón ENCIMA de las hojas, sin
       encogerlas. Con la chincheta se queda fijo, como antes.
     · La rueda (botón redondo abajo a la derecha, o clic derecho en el
       tablero) junta todas las herramientas alrededor del puntero. Con clic
       derecho sobre una hoja, la rueda trae lo que se hace con esa hoja (o
       con las marcadas, si es una de ellas).
     · El zoom pasa a una columnita junto a la rueda: «+», «−» y «Ajustar»,
       que deja las hojas del tamaño justo para leerlas sin desplazarse.
       Ctrl + rueda del ratón sobre las hojas también acerca y aleja.
     · La barra de lo marcado solo aparece cuando hay algo marcado.

   Todo actúa sobre los botones de siempre (se les hace clic): no hay una
   segunda manera de hacer lo mismo que pueda separarse con el tiempo.
   Se enciende y se apaga con F o desde Ver ▸ Modo enfocado.
   =========================================================== */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ico = (id) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const CLAVE = 'grapa.enfocado';
  const CLAVE_FIJO = 'grapa.enfocado.cajonFijo';
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const poner = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const cuerpo = document.body;
  const activo = () => cuerpo.classList.contains('enfocado');

  /* ---------------- piezas nuevas ---------------- */

  // Bordes que despiertan lo escondido al acercar el ratón
  const zonaArriba = document.createElement('div');
  zonaArriba.className = 'enf-zona enf-zona-arriba';
  const zonaIzq = document.createElement('div');
  zonaIzq.className = 'enf-zona enf-zona-izq';
  cuerpo.append(zonaArriba, zonaIzq);

  // En la tira de pestañas: el logo, que baja los menús…
  const tableros = $('#tableros');
  const btnLogo = document.createElement('button');
  btnLogo.type = 'button';
  btnLogo.className = 'enf-logo';
  btnLogo.title = 'Menús: Archivo, Editar, Ver y Ayuda (o acerca el ratón al borde de arriba)';
  btnLogo.setAttribute('aria-label', 'Mostrar los menús');
  btnLogo.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 21V12.5a4.5 4.5 0 0 1 9 0V22a3 3 0 0 0 6 0v-7"/></svg>';
  tableros.prepend(btnLogo);

  // …y a la derecha: el paso siguiente, deshacer, rehacer y Exportar
  const acciones = document.createElement('div');
  acciones.className = 'enf-acciones';
  acciones.innerHTML = `
    <button type="button" class="enf-ruta" hidden><span class="enf-puntos"></span><span class="enf-ruta-txt"></span></button>
    <button type="button" class="enf-ico" data-espejo="#btnDeshacer" aria-label="Deshacer">${ico('deshacer')}</button>
    <button type="button" class="enf-ico" data-espejo="#btnRehacer" aria-label="Rehacer">${ico('rehacer')}</button>
    <button type="button" class="btn btn-primario enf-exportar" data-espejo="#btnGuardar">${ico('guardar')} Exportar PDF</button>`;
  tableros.append(acciones);

  // Zoom en columna, sobre la rueda
  const zoomCol = document.createElement('div');
  zoomCol.className = 'enf-zoom';
  zoomCol.innerHTML = `
    <button type="button" data-zoom="mas" title="Acercar (Ctrl + rueda del ratón)" aria-label="Acercar">${ico('mas')}</button>
    <span class="enf-zoom-num" title="Tamaño de las hojas">100%</span>
    <button type="button" data-zoom="menos" title="Alejar (Ctrl + rueda del ratón)" aria-label="Alejar"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
    <span class="enf-zoom-sep"></span>
    <button type="button" data-zoom="ajustar" title="Ajustar: las hojas del tamaño justo para leerlas sin desplazarte" aria-label="Ajustar a la pantalla">${ico('captura')}</button>`;
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'enf-fab';
  fab.title = 'Herramientas (o clic derecho sobre las hojas)';
  fab.setAttribute('aria-label', 'Abrir la rueda de herramientas');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="18.1" cy="9.5" r="2"/><circle cx="15.8" cy="16.6" r="2"/><circle cx="8.2" cy="16.6" r="2"/><circle cx="5.9" cy="9.5" r="2"/></svg>';
  const dock = document.createElement('div');
  dock.className = 'enf-dock';
  dock.append(zoomCol, fab);
  $('.taller').append(dock);

  // La rueda
  const rueda = document.createElement('div');
  rueda.className = 'enf-rueda';
  rueda.hidden = true;
  rueda.setAttribute('role', 'menu');
  rueda.innerHTML = '<div class="enf-rueda-aro"></div><button type="button" class="enf-rueda-centro" aria-label="Cerrar la rueda"><b></b><small></small></button>';
  cuerpo.append(rueda);

  // Botones del cajón: fijarlo y cerrarlo
  const panel = $('#panel');
  const cajonBotones = document.createElement('div');
  cajonBotones.className = 'enf-cajon-botones';
  cajonBotones.innerHTML = `
    <button type="button" class="enf-ico" data-cajon="fijar" title="Fijar el panel al lado de las hojas" aria-label="Fijar el panel"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/></svg></button>
    <button type="button" class="enf-ico" data-cajon="cerrar" title="Cerrar (Esc)" aria-label="Cerrar el panel">${ico('cerrar')}</button>`;
  panel.append(cajonBotones);

  // Ver ▸ Modo enfocado
  const menuVer = $$('#menus .menu').find((m) => m.querySelector('[data-vista="hojas"]'));
  const itemMenu = document.createElement('button');
  itemMenu.className = 'menu-item';
  itemMenu.setAttribute('role', 'menuitem');
  itemMenu.innerHTML = `${ico('captura')} <span class="enf-menu-txt">Modo enfocado</span><kbd>F</kbd>`;
  if (menuVer) menuVer.querySelector('.menu-lista').prepend(itemMenu);

  /* ---------------- espejos de los botones de siempre ---------------- */

  function copiarEstado(copia, original) {
    copia.disabled = original.disabled;
    if (original.title) copia.title = original.title;
  }
  $$('[data-espejo]', acciones).forEach((copia) => {
    const original = $(copia.dataset.espejo);
    if (!original) { copia.remove(); return; }
    copia.addEventListener('click', () => original.click());
    copiarEstado(copia, original);
    new MutationObserver(() => copiarEstado(copia, original))
      .observe(original, { attributes: true, attributeFilter: ['disabled', 'title'] });
  });

  // La ruta del expediente, en seis puntos y el paso siguiente
  const ruta = $('#ruta');
  const enfRuta = $('.enf-ruta', acciones);
  function pintarRuta() {
    const pasos = $$('#rutaPasos .paso');
    const sig = $('#rutaSiguiente');
    enfRuta.hidden = ruta.hidden || !pasos.length;
    if (enfRuta.hidden) return;
    $('.enf-puntos', enfRuta).innerHTML = pasos.map((p) => {
      const cls = ['hecho', 'alerta'].find((e) => p.classList.contains('est-' + e)) || '';
      return `<i class="${cls}${p.classList.contains('siguiente') ? ' sig' : ''}"></i>`;
    }).join('');
    const listo = sig.classList.contains('listo');
    enfRuta.classList.toggle('listo', listo);
    $('.enf-ruta-txt', enfRuta).textContent = listo ? 'Todo listo' : sig.textContent;
    const hechos = pasos.filter((p) => p.classList.contains('est-hecho')).length;
    enfRuta.title = `Ruta del expediente: ${hechos} de ${pasos.length} pasos hechos. ${sig.title || ''}`;
    enfRuta.disabled = listo;
  }
  enfRuta.addEventListener('click', () => $('#rutaSiguiente').click());
  new MutationObserver(pintarRuta).observe(ruta, { attributes: true, childList: true, subtree: true, characterData: true });
  pintarRuta();

  /* ---------------- zoom ---------------- */

  const zoom = $('#zoom');
  const ZOOM_BASE = 180;
  function ponerZoom(v) {
    zoom.value = String(Math.round(Math.max(+zoom.min, Math.min(+zoom.max, v))));
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
    zoom.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const numZoom = $('.enf-zoom-num', zoomCol);
  const pintarZoom = () => { numZoom.textContent = Math.round((+zoom.value / ZOOM_BASE) * 100) + '%'; };
  zoom.addEventListener('input', pintarZoom);
  pintarZoom();

  /** El ancho de hoja con el que una fila entera cabe en la pantalla, alta y sin desplazarse. */
  function anchoAjustado() {
    const lienzo = $('#lienzo');
    const cs = getComputedStyle(lienzo);
    const ancho = lienzo.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const alto = lienzo.clientHeight - parseFloat(cs.paddingTop) - 34; // el pie de la hoja
    const hueco = 18;
    // la proporción de la primera hoja (A4 si aún no hay ninguna)
    const marco = $('#rejilla .pag-marco');
    const prop = marco ? marco.clientHeight / Math.max(1, marco.clientWidth) : 1.414;
    const ideal = alto / prop;
    const columnas = Math.max(1, Math.ceil((ancho + hueco) / (ideal + hueco)));
    return Math.floor((ancho - hueco * (columnas - 1)) / columnas) - 1;
  }
  zoomCol.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-zoom]');
    if (!b) return;
    const v = +zoom.value;
    if (b.dataset.zoom === 'mas') ponerZoom(v * 1.12);
    else if (b.dataset.zoom === 'menos') ponerZoom(v / 1.12);
    else ponerZoom(anchoAjustado());
  });
  // Ctrl + rueda sobre las hojas: acerca y aleja las hojas, no la página entera
  $('#lienzo').addEventListener('wheel', (ev) => {
    if (!activo() || !(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    ponerZoom(+zoom.value * (ev.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });

  /* ---------------- bordes: menús arriba, riel a la izquierda ---------------- */

  let tArriba = 0, tIzq = 0;
  const menuAbierto = () => $$('#menus .menu-lista').some((l) => !l.hidden);
  function verArriba(si) {
    clearTimeout(tArriba);
    cuerpo.classList.toggle('ver-arriba', si);
  }
  function ocultarArribaLuego() {
    clearTimeout(tArriba);
    tArriba = setTimeout(() => {
      const barra = $('.barra-superior');
      if (menuAbierto() || barra.matches(':hover') || barra.contains(document.activeElement)) { ocultarArribaLuego(); return; }
      verArriba(false);
    }, 450);
  }
  zonaArriba.addEventListener('mouseenter', () => verArriba(true));
  // con un movimiento rápido el puntero puede no llegar a «entrar» en la barra:
  // también se cuenta salir del borde
  zonaArriba.addEventListener('mouseleave', ocultarArribaLuego);
  $('.barra-superior').addEventListener('mouseleave', ocultarArribaLuego);
  $('.barra-superior').addEventListener('mouseenter', () => clearTimeout(tArriba));
  btnLogo.addEventListener('click', () => {
    verArriba(!cuerpo.classList.contains('ver-arriba'));
    if (cuerpo.classList.contains('ver-arriba')) ocultarArribaLuego();
  });
  // un clic en una opción de menú la usa y la barra vuelve a subir
  $('#menus').addEventListener('click', (ev) => { if (ev.target.closest('.menu-item')) setTimeout(() => verArriba(false), 120); });

  function verIzq(si) {
    clearTimeout(tIzq);
    cuerpo.classList.toggle('ver-izq', si);
  }
  function ocultarIzqLuego() {
    clearTimeout(tIzq);
    tIzq = setTimeout(() => {
      if (panel.matches(':hover') || panel.contains(document.activeElement)) return;
      verIzq(false);
    }, 380);
  }
  zonaIzq.addEventListener('mouseenter', () => verIzq(true));
  zonaIzq.addEventListener('mouseleave', ocultarIzqLuego);
  panel.addEventListener('mouseenter', () => clearTimeout(tIzq));
  panel.addEventListener('mouseleave', ocultarIzqLuego);

  /* ---------------- el cajón de la herramienta ---------------- */

  const cajonAbierto = () => cuerpo.classList.contains('cajon-abierto');
  function abrirCajon(cual) {
    cuerpo.classList.add('cajon-abierto');
    const b = $(`.riel-btn[data-va="${cual}"]`);
    if (b && !b.classList.contains('activo')) b.click();
    devolverScroll();
  }
  function cerrarCajon() {
    cuerpo.classList.remove('cajon-abierto');
    verIzq(false);
  }
  // irASeccion() hace scrollIntoView, y con el panel aún fuera de la vista el
  // navegador podía correr la página entera: se devuelve a su sitio.
  function devolverScroll() {
    requestAnimationFrame(() => {
      document.documentElement.scrollTop = document.documentElement.scrollLeft = 0;
      cuerpo.scrollTop = cuerpo.scrollLeft = 0;
    });
  }
  // un clic en el riel abre su cajón; otro clic en la que ya está abierta lo cierra
  $('#riel').addEventListener('click', (ev) => {
    if (!activo()) return;
    const b = ev.target.closest('.riel-btn');
    if (!b) return;
    if (ev.isTrusted && cajonAbierto() && b.classList.contains('activo')) {
      cerrarCajon();
      ev.stopImmediatePropagation();
      return;
    }
    cuerpo.classList.add('cajon-abierto');
    devolverScroll();
  }, true);
  cajonBotones.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cajon]');
    if (!b) return;
    if (b.dataset.cajon === 'cerrar') {
      cuerpo.classList.remove('cajon-fijo');
      poner(CLAVE_FIJO, '0');
      cerrarCajon();
    } else {
      const fijo = !cuerpo.classList.contains('cajon-fijo');
      cuerpo.classList.toggle('cajon-fijo', fijo);
      cuerpo.classList.add('cajon-abierto');
      poner(CLAVE_FIJO, fijo ? '1' : '0');
      b.title = fijo ? 'Soltar el panel: que vuelva a flotar encima de las hojas' : 'Fijar el panel al lado de las hojas';
    }
  });

  /* ---------------- la rueda ---------------- */

  const HERRAMIENTAS = [
    { ico: 'abrir', txt: 'Abrir', largo: 'Abrir archivos (Ctrl+O)', hacer: () => $('#btnAbrir').click() },
    { ico: 'docs', txt: 'Docs', largo: 'Documentos del expediente', hacer: () => abrirCajon('docs') },
    { ico: 'lupa', txt: 'Buscar', largo: 'Buscar en todas las hojas (Ctrl+F)', hacer: () => abrirCajon('buscar') },
    { ico: 'revisar', txt: 'Revisar', largo: 'Hojas en blanco o torcidas', hacer: () => abrirCajon('revisar') },
    { ico: 'firma', txt: 'Firmas', largo: 'Firmas y sellos', hacer: () => abrirCajon('firmas') },
    { ico: 'sello', txt: 'Marca', largo: 'Marca de agua o sello de texto', hacer: () => abrirCajon('marca') },
    { ico: 'folios', txt: 'Folios', largo: 'Foliación y numeración', hacer: () => abrirCajon('foliar') },
    { ico: 'dividir', txt: 'Separar', largo: 'Separar hojas en otro PDF', hacer: () => abrirCajon('dividir') },
    { ico: 'comparar', txt: 'Grande', largo: 'Ver las hojas en grande (V)', hacer: () => $('#btnLector').click() },
    { ico: 'salida', txt: 'Opciones', largo: 'Nombre, peso y carpeta del PDF', hacer: () => abrirCajon('salida') },
  ];

  /** Lo que se hace con una hoja: los mismos botones que salen al pasar por encima de ella. */
  function accionesDeHoja(pag) {
    const botones = $$('.pag-acciones button', pag);
    const de = (i) => () => botones[i] && botones[i].click();
    const n = $$('.pag.sel').length;
    if (pag.classList.contains('sel') && n > 1) {
      // es una de varias marcadas: la rueda trabaja con todas ellas
      const por = (sel) => () => $(sel).click();
      return {
        titulo: `${n} hojas`, sub: 'marcadas',
        lista: [
          { ico: 'girar-izq', txt: 'Girar izq.', largo: 'Girar a la izquierda', hacer: por('#btnGirarIzq') },
          { ico: 'girar-der', txt: 'Girar der.', largo: 'Girar a la derecha', hacer: por('#btnGirarDer') },
          { ico: 'firma', txt: 'Firmar', largo: 'Firmar estas hojas', hacer: por('#bsFirmar') },
          { ico: 'comparar', txt: 'Comparar', largo: 'Verlas una al lado de otra', hacer: por('#btnComparar') },
          { ico: 'inicio', txt: 'Al inicio', largo: 'Moverlas al inicio', hacer: por('#btnMoverInicio') },
          { ico: 'fin', txt: 'Al final', largo: 'Moverlas al final', hacer: por('#btnMoverFin') },
          { ico: 'guardar', txt: 'Extraer', largo: 'Bajarlas en un PDF aparte', hacer: por('#btnDescargarSel') },
          { ico: 'imprimir', txt: 'Imprimir', largo: 'Imprimir solo estas', hacer: por('#btnImprimirSel') },
          { ico: 'duplicar', txt: 'Duplicar', largo: 'Duplicarlas (Ctrl+D)', hacer: por('#btnDuplicar') },
          { ico: 'borrar', txt: 'Eliminar', largo: 'Eliminarlas (Supr)', hacer: por('#btnEliminar'), peligro: true },
        ],
      };
    }
    const num = (pag.querySelector('.pag-etiqueta b') || {}).textContent || $$('#rejilla .pag').indexOf(pag) + 1;
    return {
      titulo: 'Hoja ' + num, sub: 'clic derecho',
      lista: [
        { ico: 'girar-izq', txt: 'Girar izq.', largo: 'Girar a la izquierda', hacer: de(0) },
        { ico: 'girar-der', txt: 'Girar der.', largo: 'Girar a la derecha', hacer: de(1) },
        { ico: 'lupa', txt: 'Grande', largo: 'Ver esta hoja en grande', hacer: de(2) },
        { ico: 'firma', txt: 'Firmar', largo: 'Colocar firma o sello', hacer: de(3) },
        { ico: 'texto', txt: 'Texto', largo: 'Corregir el texto de esta hoja', hacer: de(4) },
        { ico: 'guardar', txt: 'Bajar', largo: 'Descargar solo esta hoja', hacer: de(5) },
        { ico: 'imprimir', txt: 'Imprimir', largo: 'Imprimir esta hoja', hacer: de(6) },
        { ico: 'duplicar', txt: 'Duplicar', largo: 'Duplicar', hacer: de(7) },
        { ico: 'borrar', txt: 'Eliminar', largo: 'Eliminar', hacer: de(8), peligro: true },
      ],
    };
  }

  const RADIO = 104;
  let alCerrarRueda = null;
  function abrirRueda(x, y, menu) {
    const aro = $('.enf-rueda-aro', rueda);
    const centro = $('.enf-rueda-centro', rueda);
    const titulo = menu.titulo || 'Herramientas';
    const sub = menu.sub || 'elige una';
    aro.innerHTML = '';
    menu.lista.forEach((h, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / menu.lista.length;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'enf-rueda-btn' + (h.peligro ? ' peligro' : '');
      b.setAttribute('role', 'menuitem');
      b.style.setProperty('--x', (Math.cos(ang) * RADIO).toFixed(1) + 'px');
      b.style.setProperty('--y', (Math.sin(ang) * RADIO).toFixed(1) + 'px');
      b.style.setProperty('--d', (i * 14) + 'ms');
      b.innerHTML = ico(h.ico) + `<span>${h.txt}</span>`;
      b.setAttribute('aria-label', h.largo);
      b.addEventListener('mouseenter', () => { $('b', centro).textContent = h.txt; $('small', centro).textContent = h.largo; });
      b.addEventListener('mouseleave', () => { $('b', centro).textContent = titulo; $('small', centro).textContent = sub; });
      b.addEventListener('click', () => { cerrarRueda(); h.hacer(); });
      aro.appendChild(b);
    });
    $('b', centro).textContent = titulo;
    $('small', centro).textContent = sub;
    const m = RADIO + 52;
    rueda.style.left = Math.max(m, Math.min(innerWidth - m, x)) + 'px';
    rueda.style.top = Math.max(m, Math.min(innerHeight - m, y)) + 'px';
    rueda.hidden = false;
    rueda.classList.remove('abierta');
    void rueda.offsetWidth;
    rueda.classList.add('abierta');
    fab.setAttribute('aria-expanded', 'true');
    fab.classList.add('activo');
    setTimeout(() => { const p = $('.enf-rueda-btn', rueda); if (p && document.activeElement === document.body) p.focus({ preventScroll: true }); }, 0);
  }
  function cerrarRueda() {
    if (rueda.hidden) return;
    rueda.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.classList.remove('activo');
    if (alCerrarRueda) { alCerrarRueda(); alCerrarRueda = null; }
  }
  $('.enf-rueda-centro', rueda).addEventListener('click', cerrarRueda);
  rueda.addEventListener('mousedown', (ev) => { if (ev.target === rueda) cerrarRueda(); });
  document.addEventListener('mousedown', (ev) => {
    if (!rueda.hidden && !rueda.contains(ev.target) && !fab.contains(ev.target)) cerrarRueda();
  }, true);
  fab.addEventListener('click', () => {
    if (!rueda.hidden) { cerrarRueda(); return; }
    // arriba a la izquierda del botón, para que el botón siga a la vista y cierre
    const r = fab.getBoundingClientRect();
    abrirRueda(r.left + r.width / 2 - 150, r.top + r.height / 2 - 150, { lista: HERRAMIENTAS });
  });
  // clic derecho: sobre una hoja, lo de esa hoja; en el resto del tablero, las herramientas
  $('#lienzo').addEventListener('contextmenu', (ev) => {
    if (!activo() || ev.shiftKey) return; // Mayús + clic derecho: el menú de siempre del navegador
    ev.preventDefault();
    const pag = ev.target.closest('.pag');
    if (pag) {
      pag.classList.add('enf-apuntada');
      alCerrarRueda = () => pag.classList.remove('enf-apuntada');
      abrirRueda(ev.clientX, ev.clientY, accionesDeHoja(pag));
    } else {
      abrirRueda(ev.clientX, ev.clientY, { lista: HERRAMIENTAS });
    }
  });

  /* ---------------- encender y apagar ---------------- */

  function aplicar(si, recordar) {
    cuerpo.classList.toggle('enfocado', si);
    if (!si) { cuerpo.classList.remove('ver-arriba', 'ver-izq', 'cajon-abierto'); cerrarRueda(); }
    $('.enf-menu-txt', itemMenu).textContent = si ? 'Salir del modo enfocado' : 'Modo enfocado';
    if (recordar) poner(CLAVE, si ? '1' : '0');
    // la parrilla cambió de ancho: que las miniaturas se vuelvan a medir
    window.dispatchEvent(new Event('resize'));
    $('#lienzo').dispatchEvent(new Event('scroll'));
  }
  itemMenu.addEventListener('click', () => aplicar(!activo(), true));
  if (leer(CLAVE_FIJO) === '1') cuerpo.classList.add('cajon-fijo', 'cajon-abierto');
  aplicar(leer(CLAVE) === '1', false);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (!rueda.hidden) { ev.stopPropagation(); cerrarRueda(); return; }
      if (activo() && cuerpo.classList.contains('ver-arriba')) { verArriba(false); }
      if (activo() && cajonAbierto() && !cuerpo.classList.contains('cajon-fijo')
        && !$$('.modal:not([hidden])').length && !$('#lector').offsetParent) { cerrarCajon(); }
      return;
    }
    const t = ev.target;
    const enCampo = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
    if (enCampo || ev.ctrlKey || ev.metaKey || ev.altKey || $$('.modal:not([hidden])').length) return;
    if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); aplicar(!activo(), true); }
  }, true);

  // para las pruebas y las capturas
  window.PdflashEnfocado = { aplicar, abrirRueda, cerrarRueda, abrirCajon, cerrarCajon, verArriba, verIzq, HERRAMIENTAS, accionesDeHoja };
})();
