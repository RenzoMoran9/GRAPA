/* ===========================================================
   Pdflash · interfaz del taller
   =========================================================== */
(function () {
  'use strict';
  const G = window.Grapa;
  const E = G.estado;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- avisos y capa de carga ---------------- */
  G.aviso = function (texto, tipo) {
    const caja = $('#avisos');
    const el = document.createElement('div');
    el.className = 'aviso ' + (tipo || '');
    el.textContent = texto;
    caja.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, tipo === 'error' ? 5200 : 3200);
  };

  /**
   * Pregunta dentro de la propia página. No usamos confirm() del navegador
   * porque Chrome deja marcar "impedir que esta página cree más diálogos":
   * a partir de ahí confirm() devuelve siempre que no, y los botones que
   * dependían de él se quedaban muertos sin explicación.
   */
  /** Pide un texto con un cuadro propio (los del navegador se pueden suprimir). */
  G.pedirTexto = function (opciones) {
    const o = opciones || {};
    return new Promise((resolve) => {
      const modal = $('#modalTexto');
      const campo = $('#textoValor');
      const si = $('#textoSi');
      const no = $('#textoNo');
      $('#textoTitulo').textContent = o.titulo || 'Escribe un nombre';
      $('#textoMensaje').textContent = o.mensaje || '';
      campo.value = o.valor || '';
      const cerrar = (valor) => {
        modal.hidden = true;
        si.removeEventListener('click', alSi);
        no.removeEventListener('click', alNo);
        modal.removeEventListener('click', alFondo);
        document.removeEventListener('keydown', alTecla, true);
        resolve(valor);
      };
      const alSi = () => cerrar(campo.value.trim() || null);
      const alNo = () => cerrar(null);
      const alFondo = (ev) => { if (ev.target === modal) cerrar(null); };
      const alTecla = (ev) => {
        if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(null); }
        if (ev.key === 'Enter') { ev.stopPropagation(); ev.preventDefault(); alSi(); }
      };
      si.addEventListener('click', alSi);
      no.addEventListener('click', alNo);
      modal.addEventListener('click', alFondo);
      document.addEventListener('keydown', alTecla, true);
      modal.hidden = false;
      campo.focus();
      campo.select();
    });
  };

  G.confirmar = function (opciones) {
    const o = opciones || {};
    return new Promise((resolve) => {
      const modal = $('#modalConfirmar');
      const si = $('#confirmarSi');
      const no = $('#confirmarNo');
      $('#confirmarTitulo').textContent = o.titulo || '¿Continuar?';
      $('#confirmarMensaje').textContent = o.mensaje || '';
      si.textContent = o.aceptar || 'Continuar';
      si.className = 'btn ' + (o.peligro ? 'btn-primario btn-riesgo' : 'btn-primario');

      const cerrar = (valor) => {
        modal.hidden = true;
        si.removeEventListener('click', alSi);
        no.removeEventListener('click', alNo);
        modal.removeEventListener('click', alFondo);
        document.removeEventListener('keydown', alTecla, true);
        resolve(valor);
      };
      const alSi = () => cerrar(true);
      const alNo = () => cerrar(false);
      const alFondo = (ev) => { if (ev.target === modal) cerrar(false); };
      const alTecla = (ev) => {
        if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(false); }
        else if (ev.key === 'Enter') { ev.stopPropagation(); cerrar(true); }
      };
      si.addEventListener('click', alSi);
      no.addEventListener('click', alNo);
      modal.addEventListener('click', alFondo);
      document.addEventListener('keydown', alTecla, true);
      modal.hidden = false;
      si.focus();
    });
  };

  let contadorCarga = 0;
  /**
   * Cambia el texto de la capa de espera sin tocar su contador. Avisar del
   * avance con G.cargando(true, …) lo subía una vez por hoja y la capa se
   * quedaba abierta al terminar.
   */
  G.progreso = function (texto) {
    const c = $('#cargandoTexto');
    if (c) c.textContent = texto;
  };

  G.cargando = function (activo, texto) {
    const capa = $('#cargando');
    contadorCarga = Math.max(0, contadorCarga + (activo ? 1 : -1));
    if (texto) $('#cargandoTexto').textContent = texto;
    capa.hidden = contadorCarga === 0;
  };

  /* ---------------- tableros: el estado, antes que nada ---------------- */
  const MAX_TABLEROS = 3;
  const tableros = [];          // los abiertos, en el orden de sus pestañas
  let tableroActivo = null;     // el que se está viendo
  let contadorTablero = 0;

  /* ---------------- historial (deshacer / rehacer) ---------------- */
  const historial = { atras: [], adelante: [] };

  function instantanea(paginas, seleccion, paquetes) {
    // Los paquetes van dentro: si no, al deshacer el borrado de uno volverían
    // sus hojas pero con el nombre perdido, rebautizado con el del archivo.
    // Sin argumentos es el tablero que se está viendo; con ellos, el de otro
    // (al enviarle hojas desde aquí hay que poder deshacerlo allí).
    return JSON.stringify({
      paginas: paginas || E.paginas,
      seleccion: Array.from(seleccion || E.seleccion),
      paquetes: Array.from((paquetes || E.paquetes).values()),
    });
  }
  function aplicarInstantanea(txt) {
    const d = JSON.parse(txt);
    E.paginas = d.paginas;
    if (d.paquetes) E.paquetes = new Map(d.paquetes.map((q) => [q.id, q]));
    E.seleccion = new Set(d.seleccion.filter((u) => d.paginas.some((p) => p.uid === u)));
    pintar();
  }
  function marcar() {
    historial.atras.push(instantanea());
    if (historial.atras.length > 60) historial.atras.shift();
    historial.adelante.length = 0;
    actualizarBotonesHistorial();
  }
  function actualizarBotonesHistorial() {
    $('#btnDeshacer').disabled = !historial.atras.length;
    $('#btnRehacer').disabled = !historial.adelante.length;
  }
  function deshacer() {
    if (!historial.atras.length) return;
    historial.adelante.push(instantanea());
    aplicarInstantanea(historial.atras.pop());
    actualizarBotonesHistorial();
  }
  function rehacer() {
    if (!historial.adelante.length) return;
    historial.atras.push(instantanea());
    aplicarInstantanea(historial.adelante.pop());
    actualizarBotonesHistorial();
  }

  /* ---------------- consultas del estado ---------------- */
  const metaDe = (p) => {
    const f = E.fuentes.get(p.fuenteId);
    return f ? f.paginas[p.indice] : { w: 595, h: 842, giro: 0 };
  };
  const visDe = (p) => { const m = metaDe(p); return G.cajaVisible(m.w, m.h, p.giro); };
  /** Pone uno de los iconos del juego dentro de un elemento. */
  function icono(nombre, clase) {
    return `<svg class="${clase || 'ico'}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
  }
  G.icono = icono;

  const seleccionadas = () => E.paginas.filter((p) => E.seleccion.has(p.uid));
  const objetivo = () => (E.seleccion.size ? seleccionadas() : hojasVisibles());

  /* ---------------- paquetes ---------------- */
  // Un paquete es lo que entró de una vez: si una empresa manda su cotización
  // en tres archivos y se cargan juntos, esos tres son un paquete. Es solo una
  // forma de ver y trabajar: el PDF final sale exactamente igual.
  // Con un solo documento no hay nada que agrupar: se ven las hojas, como
  // siempre. La vista de paquetes se enciende sola en cuanto llega el segundo,
  // que es cuando empieza a estorbar tener todo suelto.
  let vista = 'hojas';             // 'paquetes' | 'hojas'
  let paqueteAbierto = null;       // id del paquete que se está mirando por dentro

  const COLORES_PAQUETE = ['#e0532f', '#2f7de0', '#2fa36b', '#a3652f', '#7d2fe0', '#c02f7d'];
  let contadorPaquete = 0;

  function nuevoPaquete(nombre) {
    const id = 'q' + (++contadorPaquete) + '-' + Date.now().toString(36);
    const paq = {
      id,
      nombre: G.nombreSeguro(nombre, 'Paquete ' + contadorPaquete),
      color: COLORES_PAQUETE[(contadorPaquete - 1) % COLORES_PAQUETE.length],
    };
    E.paquetes.set(id, paq);
    return paq;
  }

  /** Páginas de antes de los paquetes (o de un expediente viejo): una por archivo. */
  function asegurarPaquetes() {
    const porFuente = new Map();
    E.paginas.forEach((p) => {
      if (p.paqueteId && E.paquetes.has(p.paqueteId)) return;
      if (!porFuente.has(p.fuenteId)) {
        const f = E.fuentes.get(p.fuenteId);
        porFuente.set(p.fuenteId, nuevoPaquete(f ? f.nombre : 'Documento'));
      }
      p.paqueteId = porFuente.get(p.fuenteId).id;
    });
  }

  /**
   * Mantiene juntas las hojas de un mismo paquete y en el orden en que aparece
   * cada paquete. Sin esto, mover una hoja al otro extremo dejaría el paquete
   * partido en dos trozos por el expediente.
   */
  function normalizarPaquetes() {
    const orden = [];
    const grupos = new Map();
    E.paginas.forEach((p) => {
      if (!grupos.has(p.paqueteId)) { grupos.set(p.paqueteId, []); orden.push(p.paqueteId); }
      grupos.get(p.paqueteId).push(p);
    });
    let plano = [];
    orden.forEach((id) => { plano = plano.concat(grupos.get(id)); });
    E.paginas = plano;
    // se olvidan los paquetes que ya no tienen ninguna hoja
    Array.from(E.paquetes.keys()).forEach((id) => { if (!grupos.has(id)) E.paquetes.delete(id); });
    if (paqueteAbierto && !grupos.has(paqueteAbierto)) paqueteAbierto = null;
  }

  /** [{paquete, paginas}] en el orden en que están en el expediente. */
  function paquetesEnOrden() {
    const orden = [];
    const grupos = new Map();
    E.paginas.forEach((p) => {
      if (!grupos.has(p.paqueteId)) { grupos.set(p.paqueteId, []); orden.push(p.paqueteId); }
      grupos.get(p.paqueteId).push(p);
    });
    return orden.map((id) => ({ paquete: E.paquetes.get(id), paginas: grupos.get(id) }))
      .filter((g) => g.paquete);
  }

  /** Lo que se ve ahora mismo: todo el expediente, o solo el paquete abierto. */
  function hojasVisibles() {
    return paqueteAbierto ? E.paginas.filter((p) => p.paqueteId === paqueteAbierto) : E.paginas;
  }

  /**
   * Al soltar hojas en otro sitio del expediente, pasan a ser del paquete de
   * su nuevo vecino: es lo que uno espera al meter una hoja dentro de otra
   * cotización, y evita dejar el paquete partido.
   */
  function adoptarPaquete(movidas) {
    if (!movidas.length) return;
    // Con un paquete abierto, lo que se mueve se queda en él: si adoptara el
    // paquete del vecino, desaparecería de lo que se está mirando.
    if (paqueteAbierto) {
      movidas.forEach((p) => { p.paqueteId = paqueteAbierto; });
      return;
    }
    const desde = E.paginas.indexOf(movidas[0]);
    if (desde < 0) return;
    const antes = E.paginas[desde - 1];
    const despues = E.paginas[desde + movidas.length];
    const destino = (antes && antes.paqueteId) || (despues && despues.paqueteId);
    if (destino) movidas.forEach((p) => { p.paqueteId = destino; });
  }

  /* ---------------- numeración de folios ---------------- */
  /**
   * Reparte los folios entre las páginas que llevan sello de foliación.
   * En el sentido de expediente la última página es el folio inicial y se
   * cuenta hacia arriba: así, adjuntar documentos encima no obliga a
   * renumerar lo que ya estaba foliado.
   */
  let folios = new Map();
  let totalFolios = 0;

  function recalcularFolios() {
    folios = new Map();
    const conFolio = E.paginas.filter((p) => p.sellos.some((s) => s.rol === 'folio'));
    totalFolios = conFolio.length;
    conFolio.forEach((p, k) => {
      const s = p.sellos.find((x) => x.rol === 'folio');
      const inicio = s.inicio == null ? 1 : s.inicio;
      folios.set(p.uid, s.invertido ? inicio + (totalFolios - 1 - k) : inicio + k);
    });
  }

  /* ---------------- pintado ---------------- */
  /**
   * Ancho real de una hoja en pantalla. Se mide del DOM y no de la variable
   * CSS porque la rejilla usa 1fr: la columna se estira más allá del mínimo
   * y, si nos guiábamos por el mínimo, la miniatura salía corta de detalle.
   */
  const anchoTarjeta = () => {
    const marco = document.querySelector('.pag-marco');
    const real = marco ? marco.getBoundingClientRect().width : 0;
    return Math.round(real
      || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ancho-pag'))
      || 180);
  };

  // El nivel se calcula una vez por pintada, no por tarjeta: medir el DOM
  // dentro del bucle obligaba al navegador a recalcular la maqueta 80 veces.
  let nivelActual = 0;
  const refrescarNivel = () => (nivelActual = G.nivelPara(anchoTarjeta()));
  const nivelVigente = () => nivelActual || refrescarNivel();

  /** ¿Sigue haciendo falta la miniatura de esta tarjeta? 'ya' si se ve,
   *  true si está cerca (se va a ver al bajar un poco), false si no. */
  const vigenciaDe = (el) => () => {
    if (!el.isConnected) return false;
    const c = el.getBoundingClientRect(), H = window.innerHeight;
    if (c.bottom >= 0 && c.top <= H) return 'ya';
    return c.bottom >= -500 && c.top <= H + 500;
  };

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      if (!en.isIntersecting) return;
      observador.unobserve(en.target);
      const uid = en.target.dataset.uid;
      const pagina = E.paginas.find((p) => p.uid === uid);
      if (!pagina) return;
      // Primero la versión ligera, para que la hoja aparezca cuanto antes;
      // afinarVisibles() la vuelve a pedir con el detalle que pida el zoom.
      G.miniatura(pagina, G.NIVELES_MINI[0], vigenciaDe(en.target)).then((url) => {
        const img = en.target.querySelector('.mini');
        if (img && !img.src.startsWith('data:')) { img.src = url; img.style.display = 'block'; }
        const hueco = en.target.querySelector('.pag-cargando');
        if (hueco) hueco.remove();
        afinarVisibles();
      }).catch((e) => {
        // se pasó de largo: cuando vuelva a verse, se pide otra vez
        if (e && e.message === G.MINI_FUERA && en.target.isConnected) observador.observe(en.target);
      });
    });
  }, { rootMargin: '400px 0px' });

  function nodoSellos(pagina, anchoPx) {
    const capa = document.createElement('div');
    capa.className = 'pag-sellos';
    const vis = visDe(pagina);
    const k = anchoPx / vis.w;
    pagina.sellos.forEach((s) => {
      if (s.rol === 'firma') {
        const firma = G.firmaPorId(s.firmaId);
        if (!firma) return;
        const img = document.createElement('img');
        img.className = 'sello-mini';
        img.draggable = false;
        img.src = firma.dataUrl;
        img.style.left = s.fx * 100 + '%';
        img.style.top = s.fy * 100 + '%';
        img.style.width = s.fw * 100 + '%';
        img.style.aspectRatio = firma.ancho + ' / ' + firma.alto;
        img.style.opacity = s.opacidad == null ? 1 : s.opacidad;
        if (s.giro) { img.style.transformOrigin = '0 100%'; img.style.transform = `rotate(${-s.giro}deg)`; }
        capa.appendChild(img);
      } else {
        const texto = s.rol === 'folio'
          ? String(s.plantilla || '{n}')
              .replace(/\{n\}/g, String(folios.get(pagina.uid) != null ? folios.get(pagina.uid) : ''))
              .replace(/\{t\}/g, String(totalFolios))
          : String(s.texto || '');
        const sp = document.createElement('span');
        sp.className = 'sello-texto';
        sp.textContent = texto;
        const margen = G.mm(s.margen == null ? 12 : s.margen);
        const pt = G.puntoPorCodigo(s.pos || 'ad', vis, margen);
        sp.style.left = (pt.x / vis.w) * 100 + '%';
        sp.style.top = (pt.y / vis.h) * 100 + '%';
        sp.style.fontSize = Math.max(4, (s.tam || 11) * k) + 'px';
        sp.style.color = s.color || '#111';
        sp.style.opacity = s.opacidad == null ? 1 : s.opacidad;
        sp.style.lineHeight = '1';
        const tx = pt.alineaH === 'c' ? '-50%' : pt.alineaH === 'd' ? '-100%' : '0';
        const ty = pt.alineaV === 'c' ? '-50%' : pt.alineaV === 'b' ? '-100%' : '0';
        sp.style.transform = `translate(${tx}, ${ty})` + (s.giro ? ` rotate(${-s.giro}deg)` : '');
        capa.appendChild(sp);
      }
    });
    return capa;
  }

  /** Vuelve a pedir las miniaturas visibles con el detalle que pide el zoom. */
  let relojNitidez = null;
  function afinarVisibles() {
    clearTimeout(relojNitidez);
    relojNitidez = setTimeout(() => {
      const nivel = refrescarNivel();
      const alto = window.innerHeight;
      $$('.pag').forEach((el) => {
        const caja = el.getBoundingClientRect();
        if (caja.bottom < -600 || caja.top > alto + 600) return;   // fuera de vista
        const pagina = E.paginas.find((p) => p.uid === el.dataset.uid);
        const img = el.querySelector('.mini');
        if (!pagina || !img) return;
        G.miniatura(pagina, nivel, vigenciaDe(el)).then((url) => {
          if (url && img.src !== url) { img.src = url; img.style.display = 'block'; }
          const hueco = el.querySelector('.pag-cargando');
          if (hueco) hueco.remove();
        }).catch(() => {});
      });
    }, 250);
  }

  /** Barra de arriba: dice en qué paquete estás y cómo salir. */
  function pintarBarraPaquete() {
    const btnVista = $('#btnVista');
    const btnVolver = $('#btnVolverPaquetes');
    if (!btnVista || !btnVolver) return;
    const hay = E.paginas.length > 0;
    btnVista.hidden = true;     // el selector de vista de arriba ocupa su lugar
    btnVista.innerHTML = vista === 'paquetes'
      ? icono('hojas') + ' Ver todas las hojas'
      : icono('paquete') + ' Ver por paquetes';
    if (paqueteAbierto) {
      const paq = E.paquetes.get(paqueteAbierto);
      btnVolver.hidden = false;
      btnVolver.innerHTML = icono('volver') + ' Paquetes · ' + G.escapaHtml(paq ? paq.nombre : '');
    } else {
      btnVolver.hidden = true;
    }
  }

  /** Tarjeta de un paquete: portada, nombre y lo que trae dentro. */
  function tarjetaPaquete(grupo) {
    const { paquete, paginas } = grupo;
    const portada = paginas[0];
    const vis = visDe(portada);

    const el = document.createElement('div');
    el.className = 'pag paquete';
    el.dataset.uid = portada.uid;           // el observador dibuja la portada
    el.dataset.paquete = paquete.id;
    el.draggable = true;

    const marco = document.createElement('div');
    marco.className = 'pag-marco';
    marco.style.aspectRatio = vis.w + ' / ' + vis.h;
    const hueco = document.createElement('div');
    hueco.className = 'pag-cargando';
    marco.appendChild(hueco);
    const img = document.createElement('img');
    img.className = 'mini';
    img.draggable = false;
    img.alt = paquete.nombre;
    img.style.cssText = 'display:none;width:100%;height:auto';
    const previa = G.miniaturaCacheada(portada, nivelVigente());
    if (previa) { img.src = previa; img.style.display = 'block'; hueco.remove(); }
    marco.appendChild(img);
    const cinta = document.createElement('div');
    cinta.className = 'pag-cinta';
    cinta.style.background = paquete.color;
    marco.appendChild(cinta);
    const cuenta = document.createElement('span');
    cuenta.className = 'paquete-cuenta';
    cuenta.textContent = paginas.length + (paginas.length === 1 ? ' hoja' : ' hojas');
    marco.appendChild(cuenta);
    const enPaquete = nodoHallazgosPaquete(paginas);
    if (enPaquete) { marco.appendChild(enPaquete); el.classList.add('hallada'); }
    el.appendChild(marco);

    const pie = document.createElement('div');
    pie.className = 'paquete-pie';
    const nom = document.createElement('strong');
    nom.className = 'paquete-nombre';
    nom.textContent = paquete.nombre;
    nom.title = 'Doble clic para cambiarle el nombre';
    nom.addEventListener('dblclick', () => renombrarPaquete(paquete.id));
    const archivos = new Set(paginas.map((p) => p.fuenteId)).size;
    const meta = document.createElement('span');
    meta.className = 'paquete-meta';
    meta.textContent = archivos === 1 ? '1 archivo' : archivos + ' archivos';
    pie.append(nom, meta);
    el.appendChild(pie);

    const acciones = document.createElement('div');
    acciones.className = 'paquete-acciones';
    [
      ['Ver', 'Abrir este paquete y trabajar sus hojas', () => abrirPaquete(paquete.id)],
      [icono('editar'), 'Cambiar el nombre', () => renombrarPaquete(paquete.id)],
      [icono('mas'), 'Añadir más archivos a este paquete', () => anadirAPaquete(paquete.id)],
      [icono('cerrar'), 'Quitar el paquete entero del taller', async () => {
        const sigue = await G.confirmar({
          titulo: 'Quitar el paquete',
          mensaje: `Se quitan del taller las ${paginas.length} hoja(s) de «${paquete.nombre}».`,
          aceptar: 'Quitar', peligro: true,
        });
        if (!sigue) return;
        marcar();
        eliminar(paginas);
      }],
    ].forEach(([txt, tit, fn]) => {
      const b = document.createElement('button');
      b.className = 'btn btn-mini' + (txt === 'Ver' ? ' btn-primario' : '');
      b.innerHTML = txt;
      b.title = tit;
      if (!b.textContent.trim()) b.setAttribute('aria-label', tit);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      acciones.appendChild(b);
    });
    el.appendChild(acciones);

    el.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.paquete-nombre, .paquete-acciones')) return;
      abrirPaquete(paquete.id);
    });
    observador.observe(el);
    return el;
  }

  function abrirPaquete(id) {
    paqueteAbierto = id;
    vista = 'paquetes';
    E.seleccion.clear();
    pintar();
    $('#lienzo').scrollTop = 0;
  }

  function cerrarPaquete() {
    paqueteAbierto = null;
    E.seleccion.clear();
    pintar();
  }

  async function renombrarPaquete(id) {
    const paq = E.paquetes.get(id);
    if (!paq) return;
    const nombre = await G.pedirTexto({
      titulo: 'Nombre del paquete',
      mensaje: 'Ponle el nombre de la empresa o del documento, para reconocerlo de un vistazo.',
      valor: paq.nombre,
    });
    if (nombre == null) return;
    marcar();
    paq.nombre = G.nombreSeguro(nombre, paq.nombre);
    pintar();
  }

  /** Carga archivos directamente dentro de un paquete que ya existe. */
  function anadirAPaquete(id) {
    const entrada = $('#entradaArchivos');
    destinoCarga = id;
    entrada.click();
  }

  function tarjeta(pagina, indice) {
    const fuente = E.fuentes.get(pagina.fuenteId);
    const vis = visDe(pagina);
    const anchoPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ancho-pag')) || 180;

    const el = document.createElement('div');
    el.className = 'pag' + (E.seleccion.has(pagina.uid) ? ' sel' : '');
    el.dataset.uid = pagina.uid;
    el.draggable = true;

    const marco = document.createElement('div');
    marco.className = 'pag-marco';
    marco.style.aspectRatio = vis.w + ' / ' + vis.h;

    // Casilla para marcar hojas sin teclado: suma o quita esta sola, sin tocar
    // las demás. Antes había que saberse Ctrl+clic.
    const casilla = document.createElement('button');
    casilla.className = 'pag-check';
    casilla.type = 'button';
    casilla.title = 'Marcar o desmarcar esta hoja';
    casilla.setAttribute('aria-label', 'Marcar esta hoja');
    // Marcar es cosa de la casilla y de nadie más. Conserva Shift+clic para
    // marcar un rango entero desde la última que se tocó.
    casilla.addEventListener('click', (ev) => {
      ev.stopPropagation();
      clicPagina(ev, pagina, indice);
    });
    casilla.addEventListener('dblclick', (ev) => ev.stopPropagation());
    marco.appendChild(casilla);

    const hueco = document.createElement('div');
    hueco.className = 'pag-cargando';
    marco.appendChild(hueco);

    const img = document.createElement('img');
    img.className = 'mini';
    // Una imagen es arrastrable por su cuenta: si no se apaga, al agarrar la
    // miniatura el navegador arrastra LA IMAGEN (y le adjunta un JPEG), no la
    // hoja, y ese archivo acaba entrando como una página nueva.
    img.draggable = false;
    img.alt = 'Página ' + (indice + 1);
    img.style.cssText = 'display:none;width:100%;height:auto';
    // si ya se dibujó antes, se muestra al instante y luego se afina
    const previa = G.miniaturaCacheada(pagina, nivelVigente());
    if (previa) {
      img.src = previa;
      img.style.display = 'block';
      hueco.remove();
    }
    marco.appendChild(img);

    const cinta = document.createElement('div');
    cinta.className = 'pag-cinta';
    cinta.style.background = fuente ? fuente.color : '#999';
    marco.appendChild(cinta);

    marco.appendChild(nodoSellos(pagina, anchoPx));
    const capaHallazgos = nodoHallazgos(pagina);
    if (capaHallazgos) { marco.appendChild(capaHallazgos); el.classList.add('hallada'); }

    const avisoRevision = nodoRevision(pagina);
    if (avisoRevision) marco.appendChild(avisoRevision);

    // Marcas de lo que la hoja ya lleva: firmada, y con qué folio
    if (pagina.sellos.some((x) => x.rol === 'firma')) {
      const f = document.createElement('span');
      f.className = 'pag-marca-firma';
      f.title = 'Lleva firma o sello';
      f.innerHTML = icono('firma');
      marco.appendChild(f);
    }
    const folioDe = folios.get(pagina.uid);
    if (folioDe != null) {
      const f = document.createElement('span');
      f.className = 'pag-folio';
      f.textContent = 'F. ' + folioDe;
      f.title = 'Folio ' + folioDe;
      marco.appendChild(f);
    }

    const acciones = document.createElement('div');
    acciones.className = 'pag-acciones';
    [
      [icono('girar-izq'), 'Girar a la izquierda', () => { marcar(); pagina.giro = G.norm(pagina.giro - 90); pintar(); }],
      [icono('girar-der'), 'Girar a la derecha', () => { marcar(); pagina.giro = G.norm(pagina.giro + 90); pintar(); }],
      // se pasa la página misma: cualquier posición que se calcule aquí puede
      // no corresponder con la lista que el lector acabe recorriendo
      [icono('lupa'), 'Ver esta hoja en grande', () => abrirLector(pagina)],
      [icono('firma'), 'Colocar firma o sello', () => abrirFirmar(pagina)],
      [icono('texto'), 'Corregir el texto de esta hoja', () => editarTexto([pagina])],
      [icono('guardar'), 'Descargar solo esta hoja', () => descargarHoja(pagina)],
      [icono('duplicar'), 'Duplicar', () => { marcar(); duplicar([pagina]); }],
      [icono('borrar'), 'Eliminar', () => { marcar(); eliminar([pagina]); }, 'peligro'],
    ].forEach(([txt, titulo, fn, clase]) => {
      const b = document.createElement('button');
      b.innerHTML = txt;
      b.title = titulo;
      // Solo si no hay texto visible: un aria-label sobre un botón que ya se
      // lee lo renombra, y entonces lo que se ve y lo que se anuncia difieren.
      if (!b.textContent.trim()) b.setAttribute('aria-label', titulo);
      if (clase) b.className = clase;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      acciones.appendChild(b);
    });
    marco.appendChild(acciones);

    el.appendChild(marco);

    // El pie: su sitio en el expediente y a qué paquete pertenece. El tamaño y
    // el archivo de origen quedan en el texto que sale al apuntarlo.
    const etiqueta = document.createElement('div');
    etiqueta.className = 'pag-etiqueta';
    const numero = document.createElement('b');
    numero.textContent = indice + 1;
    const paq = E.paquetes.get(pagina.paqueteId);
    const quien = document.createElement('span');
    quien.textContent = fuente ? fuente.nombre : '';
    etiqueta.append(numero, quien);
    etiqueta.title = (paq ? 'Paquete «' + paq.nombre + '» · ' : '')
      + (fuente ? fuente.nombreCompleto + ' · página original ' + (pagina.indice + 1) + ' · ' : '')
      + `${Math.round(vis.w * 0.3528)}×${Math.round(vis.h * 0.3528)} mm`;
    el.appendChild(etiqueta);

    // tijera de corte (no aparece en la última página)
    if (indice < E.paginas.length - 1) {
      const corte = document.createElement('div');
      corte.className = 'corte' + (pagina.corte ? ' activo' : '');
      const b = document.createElement('button');
      b.innerHTML = icono('dividir');
      b.title = pagina.corte ? 'Quitar la marca de corte' : 'Cortar después de esta página';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        marcar();
        pagina.corte = !pagina.corte;
        pintar();
      });
      corte.appendChild(b);
      el.appendChild(corte);
    }

    // Doble clic = verla en grande. El clic suelto sobre la hoja no hace nada:
    // marcar pasó a ser solo de la casilla, para no desmarcar sin querer.
    el.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.pag-acciones, .pag-check, .corte')) return;
      abrirLector(pagina);
    });
    observador.observe(el);
    return el;
  }

  /**
   * Cambiar la selección no altera el contenido de las hojas, así que basta
   * con mover las clases: reconstruir toda la rejilla en cada clic hacía
   * parpadear las miniaturas y costaba cada vez más con expedientes largos.
   */
  /** Sobre qué van a actuar los botones. Sin nada marcado actúan sobre TODO,
   *  y eso conviene que se vea, no que se descubra después de girar 80 hojas. */
  function textoAlcance(enPaquetes) {
    if (enPaquetes) {
      return E.paginas.length
        ? { txt: 'arrastra un paquete para cambiarlo de orden · «Ver» para entrar', alerta: false }
        : { txt: 'sin documentos', alerta: false };
    }
    if (!E.paginas.length) return { txt: 'sin documentos', alerta: false };
    const n = E.seleccion.size;
    if (n) return { txt: n === 1 ? '1 hoja marcada' : n + ' hojas marcadas', alerta: false };
    const cuantas = hojasVisibles().length;
    return { txt: `sin marcar · las acciones van a las ${cuantas}`, alerta: true };
  }

  function pintarAlcance(enPaquetes) {
    pintarEnviar();
    const el = $('#infoSeleccion');
    const a = textoAlcance(enPaquetes);
    el.textContent = a.txt;
    el.classList.toggle('alcance-todo', a.alerta);
    pintarBarraSeleccion(enPaquetes);
  }

  /** La barra flotante: cuántas hojas marcadas, o «Todas» si no hay ninguna. */
  function pintarBarraSeleccion(enPaquetes) {
    const barra = $('#barraSeleccion');
    if (!barra) return;
    barra.hidden = !E.paginas.length || !!enPaquetes;
    const n = E.seleccion.size;
    $('#bsNumero').textContent = n ? n : 'Todas';
    $('#bsTexto').textContent = n ? (n === 1 ? 'hoja' : 'hojas') : '';
    $('#bsCuenta').classList.toggle('todas', !n);
    $('#bsCuenta').title = n
      ? (n === 1 ? '1 hoja marcada' : n + ' hojas marcadas')
      : `Sin marcar: las acciones van a las ${hojasVisibles().length} hojas`;
  }

  function refrescarSeleccion() {
    $$('.pag').forEach((el) => el.classList.toggle('sel', E.seleccion.has(el.dataset.uid)));
    pintarAlcance(vista === 'paquetes' && !paqueteAbierto);
  }

  function pintar() {
    asegurarPaquetes();
    normalizarPaquetes();
    recalcularFolios();
    recalcularBusqueda();
    const rejilla = $('#rejilla');
    rejilla.innerHTML = '';
    rejilla.classList.toggle('con-hallazgos', hojasConHallazgos().size > 0);
    const enPaquetes = vista === 'paquetes' && !paqueteAbierto;
    rejilla.classList.toggle('rejilla-paquetes', enPaquetes);
    if (enPaquetes) {
      paquetesEnOrden().forEach((g) => rejilla.appendChild(tarjetaPaquete(g)));
    } else {
      // el número que lleva la hoja es su sitio en el expediente entero, no
      // dentro del paquete: si no, dentro de una cotización todo empieza en 1
      hojasVisibles().forEach((p) => rejilla.appendChild(tarjeta(p, E.paginas.indexOf(p))));
    }
    $('#vacio').hidden = E.paginas.length > 0;
    pintarBarraPaquete();

    const grupos = paquetesEnOrden();
    const visibles = hojasVisibles().length;
    $('#infoPaginas').textContent = enPaquetes
      ? `${grupos.length} paquete(s) · ${E.paginas.length} páginas`
      : (paqueteAbierto
        ? `${visibles} de ${E.paginas.length} páginas`
        : (E.paginas.length === 1 ? '1 página' : E.paginas.length + ' páginas'));
    pintarAlcance(enPaquetes);
    // En la vista de paquetes no se enseñan herramientas de hoja suelta:
    // actuarían sobre una selección que no se está viendo.
    $('.taller-herramientas').classList.toggle('solo-paquetes', enPaquetes);
    $('.taller-herramientas').classList.toggle('sin-hojas', !E.paginas.length);
    pintarTamano();
    pintarSegVista();

    pintarDocs();
    pintarEstadoExpediente();
    pintarFirmas();
    actualizarBotonesHistorial();
    // Taller vacío es empezar de nuevo, se haya llegado ahí por el botón
    // Nuevo o borrando las hojas: el nombre escrito para el documento
    // anterior no lo puede heredar el siguiente.
    if (!E.paginas.length) {
      expedienteAbierto = null;
      nombreManual = false;
      if ($('#guardarNombre').value) $('#guardarNombre').value = '';
    }
    actualizarEstadoGuardado();
    sincronizarNombreSalida();
    afinarVisibles();
    programarAutoguardado();
    programarPestanas();
    seguirBusquedaTrasPintar();
    pintarRevision();
    pintarPesos();
    seguirLectorTrasPintar();
  }
  G.pintar = pintar;

  /** «A4» si todas las hojas son A4; si no, el tamaño o «Tamaños mixtos». */
  function pintarTamano() {
    const el = $('#infoTamano');
    if (!el) return;
    if (!E.paginas.length) { el.textContent = ''; return; }
    const medidas = new Set(E.paginas.map((p) => {
      const v = visDe(p);
      const a = Math.round(v.w * 0.3528), b = Math.round(v.h * 0.3528);
      return a + '×' + b;
    }));
    if (medidas.size > 1) { el.textContent = 'Tamaños mixtos'; return; }
    const [m] = medidas;
    el.textContent = (m === '210×297' || m === '297×210') ? 'A4' : m + ' mm';
  }

  /** Hojas · Paquetes · En grande: la vista que está encendida. */
  function irAVista(v) {
    if (!E.paginas.length) return;
    if (paqueteAbierto) { if (v === 'paquetes') cerrarPaquete(); return; }
    if (vista === v) return;
    vista = v;
    E.seleccion.clear();
    pintar();
  }
  function pintarSegVista() {
    const seg = $('#segVista');
    if (!seg) return;
    const hay = E.paginas.length > 0;
    const enPaquetes = vista === 'paquetes' && !paqueteAbierto;
    $$('[data-vista]', seg).forEach((b) => {
      const on = !lector.abierto && (b.dataset.vista === 'paquetes' ? enPaquetes : !enPaquetes);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = !hay;
    });
    $('#btnLector').classList.toggle('on', !!lector.abierto);
    $('#btnLector').disabled = !hay;
  }

  /** Lo que de un vistazo falta o sobra en el expediente que se ve. */
  function pintarEstadoExpediente() {
    const caja = $('#estadoExp');
    if (!caja) return;
    caja.hidden = !E.paginas.length;
    if (caja.hidden) return;
    const filas = [];
    filas.push(['Foliación', totalFolios
      ? { ok: true, t: totalFolios === 1 ? '1 folio' : totalFolios + ' folios' }
      : { t: 'Sin foliar' }]);
    const sellos = E.paginas.reduce((n, p) => n + p.sellos.filter((x) => x.rol !== 'folio').length, 0);
    filas.push(['Firmas y sellos', sellos ? { t: sellos === 1 ? '1 colocado' : sellos + ' colocados' } : { t: 'Ninguno' }]);
    const { blancas, giradas } = avisosRevision();
    const sinRevisar = E.paginas.filter((p) => !revision.hechas.has(p.uid)).length;
    const porMirar = blancas.length + giradas.length;
    filas.push(['Blancas o torcidas', sinRevisar === E.paginas.length
      ? { t: 'Sin revisar' }
      : porMirar ? { aviso: true, t: porMirar === 1 ? '1 por revisar' : porMirar + ' por revisar' }
        : { ok: true, t: sinRevisar ? 'Ninguna (faltan ' + sinRevisar + ')' : 'Ninguna' }]);
    const bytes = fuentesUsadas().reduce((n, f) => n + (f.bytes ? f.bytes.length : 0), 0);
    filas.push(['Peso de los originales', { t: enMb(bytes) }]);

    const dl = $('#estadoExpLista');
    dl.innerHTML = '';
    filas.forEach(([nombre, v]) => {
      const fila = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = nombre;
      const dd = document.createElement('dd');
      if (v.ok) { dd.className = 'ok'; dd.innerHTML = icono('check'); }
      if (v.aviso) dd.className = 'aviso';
      dd.append(v.t);
      fila.append(dt, dd);
      dl.appendChild(fila);
    });
  }

  /** Los menús de arriba: cada opción acciona el botón de siempre. */
  function conectarMenus() {
    const menus = $$('#menus .menu');
    const cerrar = () => menus.forEach((m) => {
      m.classList.remove('abierto');
      m.querySelector('.menu-lista').hidden = true;
      m.querySelector('.menu-boton').setAttribute('aria-expanded', 'false');
    });
    const abrir = (m) => {
      cerrar();
      // lo que no se puede hacer ahora se ve apagado, como el botón que lo acciona
      $$('.menu-item[data-clic]', m).forEach((it) => {
        const d = $(it.dataset.clic);
        it.disabled = !!(d && d.disabled);
      });
      $$('.menu-item[data-vista]', m).forEach((it) => { it.disabled = !E.paginas.length; });
      m.classList.add('abierto');
      m.querySelector('.menu-lista').hidden = false;
      m.querySelector('.menu-boton').setAttribute('aria-expanded', 'true');
    };
    menus.forEach((m) => {
      const boton = m.querySelector('.menu-boton');
      boton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (m.classList.contains('abierto')) cerrar(); else abrir(m);
      });
      // con uno abierto, pasar el puntero a otro lo abre, como en cualquier programa
      boton.addEventListener('mouseenter', () => {
        if (menus.some((x) => x.classList.contains('abierto')) && !m.classList.contains('abierto')) abrir(m);
      });
      m.querySelector('.menu-lista').addEventListener('click', (ev) => {
        const it = ev.target.closest('.menu-item');
        if (!it || it.disabled) return;
        cerrar();
        if (it.dataset.clic) { const d = $(it.dataset.clic); if (d) d.click(); }
        else if (it.dataset.vista) irAVista(it.dataset.vista);
      });
    });
    document.addEventListener('click', (ev) => { if (!ev.target.closest('#menus')) cerrar(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrar(); }, true);
    window.addEventListener('blur', cerrar);
  }

  function pintarDocs() {
    const lista = $('#listaDocs');
    lista.innerHTML = '';
    const usados = new Map();
    E.paginas.forEach((p) => usados.set(p.fuenteId, (usados.get(p.fuenteId) || 0) + 1));
    let vivos = 0;
    E.fuentes.forEach((f) => {
      const cuenta = usados.get(f.id) || 0;
      if (!cuenta) return;
      vivos++;
      const li = document.createElement('li');
      const punto = document.createElement('span');
      punto.className = 'punto-color';
      punto.style.background = f.color;
      const nom = document.createElement('span');
      nom.className = 'doc-nombre';
      nom.textContent = f.nombreCompleto;
      nom.title = f.nombreCompleto;
      const meta = document.createElement('span');
      meta.className = 'doc-meta';
      meta.textContent = cuenta + (cuenta === 1 ? ' pág.' : ' págs.');
      const sel = document.createElement('button');
      sel.className = 'btn btn-mini';
      sel.innerHTML = icono('diana');
      sel.setAttribute('aria-label', 'Seleccionar sus páginas');
      sel.title = 'Seleccionar sus páginas';
      sel.addEventListener('click', () => {
        E.seleccion = new Set(E.paginas.filter((p) => p.fuenteId === f.id).map((p) => p.uid));
        pintar();
      });
      const quitar = document.createElement('button');
      quitar.className = 'btn btn-mini btn-peligro-suave';
      quitar.innerHTML = icono('cerrar');
      quitar.setAttribute('aria-label', 'Quitar este documento del taller');
      quitar.title = 'Quitar este documento del taller';
      quitar.addEventListener('click', () => {
        marcar();
        eliminar(E.paginas.filter((p) => p.fuenteId === f.id));
      });
      li.append(punto, nom, meta, sel, quitar);
      lista.appendChild(li);
    });
    $('#contDocs').textContent = vivos;
    pintarMarcaRiel('#marcaDocs', vivos);
  }

  function pintarFirmas() {
    const lista = $('#listaFirmas');
    lista.innerHTML = '';
    E.firmas.forEach((f) => {
      const li = document.createElement('li');
      li.className = E.firmaActiva === f.id ? 'activa' : '';
      const previa = document.createElement('div');
      previa.className = 'firma-previa';
      const img = document.createElement('img');
      img.src = f.dataUrl;
      img.alt = f.nombre;
      previa.appendChild(img);
      const nom = document.createElement('span');
      nom.className = 'firma-nombre';
      nom.textContent = f.nombre;
      nom.title = f.nombre;
      const borrar = document.createElement('button');
      borrar.className = 'btn btn-mini btn-peligro-suave';
      borrar.innerHTML = icono('cerrar');
      borrar.setAttribute('aria-label', 'Borrar');
      borrar.title = 'Borrar esta firma';
      borrar.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const sigue = await G.confirmar({
          titulo: 'Borrar la firma',
          mensaje: `Se borra «${f.nombre}» de tu biblioteca de firmas.`,
          aceptar: 'Borrar',
          peligro: true,
        });
        if (sigue) G.borrarFirma(f.id);
      });
      li.append(previa, nom, borrar);
      li.addEventListener('click', () => { E.firmaActiva = f.id; pintarFirmas(); });
      lista.appendChild(li);
    });
    if (!E.firmas.length) {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = 'Todavía no tienes firmas guardadas. Crea la primera desde el escaneo de tu sello.';
      lista.appendChild(p);
    }
    $('#contFirmas').textContent = E.firmas.length;
    pintarMarcaRiel('#marcaFirmas', E.firmas.length);
  }

  G.alCambiarFirmas = function (guardado) {
    pintarFirmas();
    pintar();
    if (!guardado) G.aviso('La firma se usará ahora, pero este navegador no permitió guardarla para la próxima vez.', 'error');
  };

  /* ---------------- selección ---------------- */
  function clicPagina(ev, pagina, indice) {
    if (ev.shiftKey && E.ancla != null) {
      const a = Math.min(E.ancla, indice), b = Math.max(E.ancla, indice);
      if (!ev.ctrlKey && !ev.metaKey) E.seleccion.clear();
      for (let i = a; i <= b; i++) E.seleccion.add(E.paginas[i].uid);
    } else {
      // Clic = marcar o desmarcar esa hoja, igual que su casilla, sin tocar
      // las demás. Antes el clic reemplazaba la selección entera: con todo
      // marcado, pulsar una lo desmarcaba todo menos esa.
      if (E.seleccion.has(pagina.uid)) E.seleccion.delete(pagina.uid);
      else E.seleccion.add(pagina.uid);
      E.ancla = indice;
    }
    refrescarSeleccion();
  }

  /* ---------------- operaciones sobre páginas ---------------- */
  function eliminar(paginas) {
    const fuera = new Set(paginas.map((p) => p.uid));
    E.paginas = E.paginas.filter((p) => !fuera.has(p.uid));
    fuera.forEach((u) => E.seleccion.delete(u));
    pintar();
  }
  function duplicar(paginas) {
    const copias = [];
    paginas.forEach((p) => {
      const idx = E.paginas.indexOf(p);
      const copia = JSON.parse(JSON.stringify(p));
      copia.uid = G.nuevoUid();
      E.paginas.splice(idx + 1, 0, copia);
      copias.push(copia.uid);
    });
    E.seleccion = new Set(copias);
    pintar();
  }
  function girar(delta) {
    const objs = objetivo();
    if (!objs.length) return;
    marcar();
    objs.forEach((p) => { p.giro = G.norm(p.giro + delta); });
    pintar();
  }
  /**
   * Adelanta o retrasa las páginas dadas una posición, respetando el orden
   * entre ellas. Es la manera rápida de reordenar sin arrastrar: sirve
   * igual para una selección de varias páginas que para una sola.
   */
  function moverPosiciones(objs, delta) {
    if (!objs.length || !delta) return;
    marcar();
    const marcados = new Set(objs.map((p) => p.uid));
    const orden = E.paginas;
    if (delta < 0) {
      for (let i = 1; i < orden.length; i++) {
        if (marcados.has(orden[i].uid) && !marcados.has(orden[i - 1].uid)) {
          const t = orden[i - 1]; orden[i - 1] = orden[i]; orden[i] = t;
        }
      }
    } else {
      for (let i = orden.length - 2; i >= 0; i--) {
        if (marcados.has(orden[i].uid) && !marcados.has(orden[i + 1].uid)) {
          const t = orden[i]; orden[i] = orden[i + 1]; orden[i + 1] = t;
        }
      }
    }
    adoptarPaquete(objs);
    pintar();
  }

  /** Mueve la selección para que empiece justo en la posición dada (1 = primera). */
  function moverSeleccionAPosicion(numeroPos) {
    const objs = hojasVisibles().filter((p) => E.seleccion.has(p.uid));
    if (!objs.length) { G.aviso('Selecciona primero las páginas que quieres mover.', 'error'); return; }
    if (!Number.isFinite(numeroPos)) { G.aviso('Escribe el número de la posición.', 'error'); return; }
    marcar();
    const mover = new Set(objs.map((p) => p.uid));
    if (paqueteAbierto) {
      // la posición es la del paquete, que es lo que se está viendo
      const suyas = E.paginas.filter((p) => p.paqueteId === paqueteAbierto);
      const resto = suyas.filter((p) => !mover.has(p.uid));
      const destino = Math.max(0, Math.min(resto.length, Math.round(numeroPos) - 1));
      resto.splice(destino, 0, ...objs);
      let i = 0;
      E.paginas = E.paginas.map((p) => (p.paqueteId === paqueteAbierto ? resto[i++] : p));
      pintar();
      G.aviso(`Movidas a la posición ${destino + 1} del paquete.`, 'ok');
      return;
    }
    const resto = E.paginas.filter((p) => !mover.has(p.uid));
    const destino = Math.max(0, Math.min(resto.length, Math.round(numeroPos) - 1));
    resto.splice(destino, 0, ...objs);
    E.paginas = resto;
    adoptarPaquete(objs);
    pintar();
    G.aviso(`Movidas a la posición ${destino + 1}.`, 'ok');
  }

  /**
   * Manda la selección al principio o al final. Dentro de un paquete, al
   * principio o al final DE ESE paquete; con todas las hojas a la vista, del
   * expediente entero.
   */
  function moverExtremo(alInicio) {
    const objs = hojasVisibles().filter((p) => E.seleccion.has(p.uid));
    if (!objs.length) { G.aviso('Selecciona primero las páginas que quieres mover.', 'error'); return; }
    marcar();
    const mover = new Set(objs.map((p) => p.uid));
    if (paqueteAbierto) {
      const suyas = E.paginas.filter((p) => p.paqueteId === paqueteAbierto);
      const resto = suyas.filter((p) => !mover.has(p.uid));
      const nuevas = alInicio ? objs.concat(resto) : resto.concat(objs);
      let i = 0;
      // el paquete ocupa un tramo seguido: se reescribe ese tramo y ya
      E.paginas = E.paginas.map((p) => (p.paqueteId === paqueteAbierto ? nuevas[i++] : p));
      pintar();
      return;
    }
    const resto = E.paginas.filter((p) => !mover.has(p.uid));
    E.paginas = alInicio ? objs.concat(resto) : resto.concat(objs);
    adoptarPaquete(objs);
    pintar();
  }

  /* ---------------- reordenar arrastrando ---------------- */
  // Tipo propio: viaja dentro del arrastre y dice que la carga es una hoja de
  // Pdflash. Sobrevive aunque el estado se haya limpiado antes de que el evento
  // termine de subir, así que es el guardia fiable contra tratarla como
  // archivo que llega de fuera.
  const TIPO_HOJA = 'application/x-grapa-hoja';
  let arrastrando = null;
  const esArrastreDeHoja = (ev) => !!arrastrando
    || (!!ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes(TIPO_HOJA));

  let arrastrandoPaquete = null;

  /** El tacho solo asoma mientras arrastras: el resto del tiempo estorba. */
  function mostrarTacho(si) {
    const t = $('#tacho');
    if (!t) return;
    t.hidden = !si;
    if (!si) t.classList.remove('encima');
  }

  function conectarTacho() {
    const t = $('#tacho');
    if (!t) return;
    ['dragenter', 'dragover'].forEach((tipo) => t.addEventListener(tipo, (ev) => {
      if (!arrastrando && !arrastrandoPaquete) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      t.classList.add('encima');
    }));
    t.addEventListener('dragleave', (ev) => {
      if (t.contains(ev.relatedTarget)) return;
      t.classList.remove('encima');
    });
    t.addEventListener('drop', (ev) => {
      ev.preventDefault();
      t.classList.remove('encima');
      if (arrastrandoPaquete) {
        const grupo = paquetesEnOrden().find((g) => g.paquete.id === arrastrandoPaquete);
        arrastrandoPaquete = null;
        mostrarTacho(false);
        if (!grupo) return;
        marcar();
        const nombre = grupo.paquete.nombre;
        const cuantas = grupo.paginas.length;
        eliminar(grupo.paginas);
        G.aviso(`«${nombre}» al tacho: ${cuantas} hoja(s). Ctrl+Z lo devuelve.`, 'ok');
        return;
      }
      if (!arrastrando) return;
      const fuera = new Set(arrastrando);
      const objs = E.paginas.filter((p) => fuera.has(p.uid));
      arrastrando = null;
      mostrarTacho(false);
      if (!objs.length) return;
      marcar();
      eliminar(objs);
      G.aviso(`${objs.length} hoja(s) al tacho. Ctrl+Z las devuelve.`, 'ok');
    });
  }

  $('#rejilla').addEventListener('dragstart', (ev) => {
    const tarjeta = ev.target.closest('.pag');
    if (!tarjeta) return;
    if (tarjeta.dataset.paquete) {
      // se arrastra la cotización entera, con todas sus hojas dentro
      arrastrandoPaquete = tarjeta.dataset.paquete;
      mostrarTacho(true);
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', arrastrandoPaquete);
      ev.dataTransfer.setData(TIPO_HOJA, arrastrandoPaquete);
      setTimeout(() => tarjeta.classList.add('arrastrando'), 0);
      return;
    }
    const uid = tarjeta.dataset.uid;
    // Nunca repintar aquí: el navegador acaba de tomar la instantánea para
    // arrastrar esta misma tarjeta. Si reconstruimos la rejilla (innerHTML),
    // el nodo original queda fuera del documento y, por especificación,
    // el navegador cancela el arrastre sin avisar: nunca llega el drop.
    // Arrastrar una hoja que NO está marcada mueve solo esa, sin tocar lo
    // marcado. Antes reemplazaba la selección entera, y como basta con mover
    // el ratón un par de píxeles al pulsar para que el navegador lo tome por
    // arrastre, marcar hojas desmarcaba las anteriores sin motivo aparente.
    arrastrando = E.seleccion.has(uid) ? Array.from(E.seleccion) : [uid];
    const enArrastre = new Set(arrastrando);
    mostrarTacho(true);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', uid);
    ev.dataTransfer.setData(TIPO_HOJA, uid);
    setTimeout(() => {
      $$('.pag').forEach((t) => { if (enArrastre.has(t.dataset.uid)) t.classList.add('arrastrando'); });
    }, 0);
  });

  $('#rejilla').addEventListener('dragend', () => {
    arrastrando = null;
    arrastrandoPaquete = null;
    mostrarTacho(false);
    $$('.pag').forEach((t) => t.classList.remove('arrastrando', 'destino-izq', 'destino-der'));
  });

  $('#rejilla').addEventListener('dragover', (ev) => {
    if (arrastrandoPaquete) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      const t = ev.target.closest('.pag');
      $$('.pag').forEach((x) => x.classList.remove('destino-izq', 'destino-der'));
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.classList.add(ev.clientX < r.left + r.width / 2 ? 'destino-izq' : 'destino-der');
      return;
    }
    if (!arrastrando) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const tarjeta = ev.target.closest('.pag');
    $$('.pag').forEach((t) => t.classList.remove('destino-izq', 'destino-der'));
    if (!tarjeta) return;
    const r = tarjeta.getBoundingClientRect();
    tarjeta.classList.add(ev.clientX < r.left + r.width / 2 ? 'destino-izq' : 'destino-der');
  });

  $('#rejilla').addEventListener('drop', (ev) => {
    if (arrastrandoPaquete) {
      ev.preventDefault();
      $$('.pag').forEach((x) => x.classList.remove('destino-izq', 'destino-der'));
      const t = ev.target.closest('.pag');
      const movido = arrastrandoPaquete;
      arrastrandoPaquete = null;
      if (!t || !t.dataset.paquete || t.dataset.paquete === movido) return;
      marcar();
      const grupos = paquetesEnOrden();
      const orden = grupos.map((g) => g.paquete.id).filter((id) => id !== movido);
      const r = t.getBoundingClientRect();
      let pos = orden.indexOf(t.dataset.paquete);
      if (pos < 0) pos = orden.length;
      else if (ev.clientX >= r.left + r.width / 2) pos++;
      orden.splice(pos, 0, movido);
      // se rehace el expediente con los paquetes en el orden nuevo
      const porId = new Map(grupos.map((g) => [g.paquete.id, g.paginas]));
      let plano = [];
      orden.forEach((id) => { plano = plano.concat(porId.get(id) || []); });
      E.paginas = plano;
      mostrarTacho(false);
      pintar();
      return;
    }
    if (!arrastrando) return;
    ev.preventDefault();
    const tarjeta = ev.target.closest('.pag');
    $$('.pag').forEach((t) => t.classList.remove('destino-izq', 'destino-der'));
    marcar();
    const mover = new Set(arrastrando);
    const movidas = E.paginas.filter((p) => mover.has(p.uid));
    const resto = E.paginas.filter((p) => !mover.has(p.uid));
    let destino = resto.length;
    if (tarjeta) {
      const uidRef = tarjeta.dataset.uid;
      const r = tarjeta.getBoundingClientRect();
      const antes = ev.clientX < r.left + r.width / 2;
      const pos = resto.findIndex((p) => p.uid === uidRef);
      destino = pos < 0 ? resto.length : (antes ? pos : pos + 1);
    } else if (paqueteAbierto) {
      // soltar en el hueco vacío, dentro de un paquete, es «al final de este
      // paquete»: al final del expediente saldría de lo que se está viendo
      const suyas = resto.filter((p) => p.paqueteId === paqueteAbierto);
      destino = suyas.length ? resto.indexOf(suyas[suyas.length - 1]) + 1 : resto.length;
    }
    resto.splice(destino, 0, ...movidas);
    E.paginas = resto;
    adoptarPaquete(movidas);
    arrastrando = null;
    mostrarTacho(false);
    pintar();
  });

  /* ---------------- añadir archivos ---------------- */
  /** Índice de inserción a partir de la tarjeta sobre la que se soltó. */
  function indiceDesdeEvento(ev) {
    const tarjeta = ev.target.closest && ev.target.closest('.pag');
    if (!tarjeta) return null;
    const r = tarjeta.getBoundingClientRect();
    const pos = E.paginas.findIndex((p) => p.uid === tarjeta.dataset.uid);
    if (pos < 0) return null;
    return ev.clientX < r.left + r.width / 2 ? pos : pos + 1;
  }

  // Cuando se pulsa el «＋» de un paquete, lo que se cargue va dentro de él
  let destinoCarga = null;

  async function anadir(files, indice) {
    const lote = Array.from(files || []);   // copia inmediata: la FileList puede vaciarse
    const dentroDe = destinoCarga || (paqueteAbierto || null);
    destinoCarga = null;
    if (!lote.length) return;
    G.cargando(true, 'Abriendo archivos…');
    try {
      await G.prepararMotor();
      const r = await G.cargarArchivos(lote, (t) => { $('#cargandoTexto').textContent = t; });
      if (r.paginas.length) {
        marcar();
        r.fuentes.forEach((f) => E.fuentes.set(f.id, f));
        // Lo que entra de una vez es un paquete: si una empresa manda su
        // cotización en varios archivos y se cargan juntos, van juntos.
        const paq = dentroDe && E.paquetes.has(dentroDe)
          ? E.paquetes.get(dentroDe)
          : nuevoPaquete(r.fuentes.length > 1
            ? r.fuentes[0].nombre
            : (r.fuentes[0] ? r.fuentes[0].nombre : 'Paquete'));
        r.paginas.forEach((p) => { p.paqueteId = paq.id; });
        if (dentroDe && E.paquetes.has(dentroDe)) {
          // se meten al final de ese paquete, no encima de todo
          const suyas = E.paginas.filter((x) => x.paqueteId === paq.id);
          const fin = E.paginas.indexOf(suyas[suyas.length - 1]) + 1;
          E.paginas.splice(fin, 0, ...r.paginas);
        } else if (indice == null) {
          // Lo nuevo va encima de lo que ya había, como al grapar un
          // documento sobre un expediente físico: no al final.
          E.paginas = r.paginas.concat(E.paginas);
        } else {
          E.paginas.splice(Math.max(0, Math.min(indice, E.paginas.length)), 0, ...r.paginas);
        }
        E.seleccion = new Set(r.paginas.map((p) => p.uid));
        if (!paqueteAbierto && paquetesEnOrden().length > 1) vista = 'paquetes';
        pintar();
        G.aviso(`Se añadieron ${r.paginas.length} página(s) de ${r.fuentes.length} archivo(s).`, 'ok');
        if (lote.some((f) => G.esOffice && G.esOffice(f))) {
          // La composición la rehace el navegador, no Word: conviene mirarla
          G.aviso('Word/Excel convertido a PDF. Revisa cómo quedó: el reparto de '
            + 'líneas y hojas puede moverse un poco respecto a Office.', '');
        }
      }
      r.errores.forEach((e) => G.aviso(e, 'error'));
    } catch (e) {
      console.error(e);
      G.aviso('No se pudieron abrir los archivos: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  function conectarSoltar(zona, resaltado, conPosicion) {
    ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (ev) => {
      if (esArrastreDeHoja(ev)) return;
      ev.preventDefault();
      zona.classList.add(resaltado);
    }));
    ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (ev) => {
      if (t === 'drop') ev.preventDefault();
      if (t === 'dragleave' && zona.contains(ev.relatedTarget)) return;
      zona.classList.remove(resaltado);
    }));
    zona.addEventListener('drop', (ev) => {
      if (esArrastreDeHoja(ev)) return;
      const archivos = ev.dataTransfer && ev.dataTransfer.files;
      if (archivos && archivos.length) anadir(archivos, conPosicion ? indiceDesdeEvento(ev) : null);
    });
  }

  /* ---------------- editor de firma ---------------- */
  const fir = { pagina: null, sello: null, vis: null, arrastre: null,
                dibujado: 0, reloj: null, base: 0 };

  /**
   * Ajusta el tamaño con el que se ve la página al colocar la firma. El 100 %
   * es «lo que cabe en el hueco»; de ahí para arriba el escenario se desplaza.
   * La firma se guarda en fracciones de la página, así que acercar no mueve
   * nada de lo ya colocado: solo se ve más grande para afinar mejor.
   */
  function ajustarZoomFirma(volverADibujar) {
    const esc = $('#firmarEscenario');
    const caja = $('#firmarPagina');
    if (!esc || !caja || !fir.vis) return;
    const z = Number($('#firmarZoom').value || 100) / 100;
    // La base —lo que mide la página al 100 %— se calcula una sola vez, al
    // abrir o al cambiar de tamaño la ventana. Recalcularla en cada paso del
    // acercamiento la hacía encoger: al crecer la página aparece la barra de
    // desplazamiento, el hueco se estrecha y la cuenta salía cada vez menor.
    if (!fir.base || volverADibujar === 'medir') {
      const hueco = 28;                                 // el relleno del escenario
      const dispW = Math.max(120, esc.clientWidth - hueco);
      const dispH = Math.max(120, esc.clientHeight - hueco);
      fir.base = Math.min(dispW, dispH * (fir.vis.w / fir.vis.h));
    }
    const ancho = Math.round(fir.base * z);
    caja.style.setProperty('--firmar-ancho', ancho + 'px');
    if (volverADibujar !== true) return;
    // Si se acerca mucho, se vuelve a dibujar con más detalle: si no, se ve
    // el mismo dibujo estirado y la firma se coloca a ciegas.
    clearTimeout(fir.reloj);
    fir.reloj = setTimeout(() => {
      const quiere = Math.min(3000, Math.round(ancho * (window.devicePixelRatio || 1)));
      if (quiere <= fir.dibujado + 200 || !fir.pagina) return;
      const pagina = fir.pagina;
      G.renderGrande(pagina, quiere).then((lienzo) => {
        if (fir.pagina !== pagina) return;              // se cambió de página entretanto
        const destino = $('#firmarLienzo');
        destino.width = lienzo.width;
        destino.height = lienzo.height;
        destino.getContext('2d').drawImage(lienzo, 0, 0);
        fir.dibujado = quiere;
      }).catch(() => {});
    }, 220);
  }

  async function abrirFirmar(pagina) {
    if (!E.firmas.length) {
      G.aviso('Primero crea una firma: usa «Desde escaneo» en el panel de la izquierda.', 'error');
      return;
    }
    fir.pagina = pagina;
    fir.vis = visDe(pagina);
    const sel = $('#firmarSelector');
    sel.innerHTML = E.firmas.map((f) => `<option value="${f.id}">${G.escapaHtml(f.nombre)}</option>`).join('');
    sel.value = E.firmaActiva || E.firmas[0].id;

    // La firma que se arrastra es siempre UNA NUEVA. De la última puesta solo
    // se hereda el tamaño y el giro, que es lo que ahorra trabajo al repetir;
    // ella se queda donde está, dibujada como una más de la página.
    const previo = pagina.sellos.filter((s) => s.rol === 'firma').slice(-1)[0];
    fir.sello = {
      rol: 'firma',
      firmaId: sel.value,
      fx: previo ? previo.fx : 0.58,
      fy: previo ? Math.min(0.92, previo.fy + 0.04) : 0.72,
      fw: previo ? previo.fw : 0.28,
      giro: previo ? previo.giro || 0 : 0,
      opacidad: previo && previo.opacidad != null ? previo.opacidad : 1,
    };

    $('#firmarAncho').value = Math.round(fir.sello.fw * 100);
    $('#firmarGiro').value = fir.sello.giro || 0;
    $('#firmarOpacidad').value = Math.round((fir.sello.opacidad == null ? 1 : fir.sello.opacidad) * 100);
    $('#modalFirmar').hidden = false;

    $('#firmarZoom').value = 100;
    fir.base = 0;
    ajustarZoomFirma('medir');

    G.cargando(true, 'Preparando la página…');
    try {
      const lienzo = await G.renderGrande(pagina, 1200);
      const destino = $('#firmarLienzo');
      destino.width = lienzo.width;
      destino.height = lienzo.height;
      destino.getContext('2d').drawImage(lienzo, 0, 0);
      fir.dibujado = 1200;
    } catch (e) {
      G.aviso('No se pudo mostrar la página: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
    ajustarZoomFirma('medir');
    pintarPuestas();
    pintarSello();
  }

  /**
   * Dibuja en el modal las firmas que ya están puestas en esta página. Antes
   * no se veían, así que colocar una segunda era a ciegas.
   */
  function pintarPuestas() {
    const capa = $('#firmarPuestas');
    if (!capa || !fir.pagina) return;
    capa.innerHTML = '';
    fir.pagina.sellos.forEach((sello, i) => {
      if (sello.rol !== 'firma') return;
      const firma = G.firmaPorId(sello.firmaId);
      if (!firma) return;
      const el = document.createElement('div');
      el.className = 'firmar-puesta';
      el.title = 'Clic para volver a cogerla y moverla';
      el.style.left = sello.fx * 100 + '%';
      el.style.top = sello.fy * 100 + '%';
      el.style.width = sello.fw * 100 + '%';
      el.style.aspectRatio = firma.ancho + ' / ' + firma.alto;
      el.style.opacity = sello.opacidad == null ? 1 : sello.opacidad;
      el.style.transformOrigin = '0 100%';
      if (sello.giro) el.style.transform = `rotate(${-sello.giro}deg)`;
      const img = document.createElement('img');
      img.src = firma.dataUrl;
      img.draggable = false;
      el.appendChild(img);
      el.addEventListener('click', () => recogerFirma(i));
      capa.appendChild(el);
    });
    // El botón existe porque la firma que se está moviendo tapa a las puestas:
    // acertarle el clic a la de debajo no siempre se puede.
    const btn = $('#btnFirmarRecoger');
    if (btn) {
      const cuantas = capa.children.length;
      btn.disabled = !cuantas;
      btn.innerHTML = cuantas
        ? icono('recoger') + ` Recoger la última (hay ${cuantas})`
        : icono('recoger') + ' Recoger la última puesta';
    }
  }

  /** Saca una firma ya puesta del papel para volver a colocarla. */
  function recogerFirma(indice) {
    const sello = fir.pagina.sellos[indice];
    if (!sello || sello.rol !== 'firma') return;
    marcar();
    fir.pagina.sellos.splice(indice, 1);
    fir.sello = Object.assign({}, sello);
    $('#firmarSelector').value = fir.sello.firmaId;
    $('#firmarAncho').value = Math.round(fir.sello.fw * 100);
    $('#firmarGiro').value = fir.sello.giro || 0;
    $('#firmarOpacidad').value = Math.round((fir.sello.opacidad == null ? 1 : fir.sello.opacidad) * 100);
    pintarPuestas();
    pintarSello();
    pintar();
    G.aviso('Firma recogida: muévela y vuelve a colocarla.', 'ok');
  }

  function pintarSello() {
    const caja = $('#firmarSello');
    const img = $('#firmarSelloImg');
    const firma = G.firmaPorId(fir.sello.firmaId);
    if (!firma) { caja.hidden = true; return; }
    caja.hidden = false;
    img.src = firma.dataUrl;
    caja.style.left = fir.sello.fx * 100 + '%';
    caja.style.top = fir.sello.fy * 100 + '%';
    caja.style.width = fir.sello.fw * 100 + '%';
    caja.style.aspectRatio = firma.ancho + ' / ' + firma.alto;
    caja.style.opacity = fir.sello.opacidad;
    caja.style.transformOrigin = '0 100%';
    caja.style.transform = fir.sello.giro ? `rotate(${-fir.sello.giro}deg)` : '';
  }

  function iniciarEditorFirma() {
    const caja = $('#firmarSello');
    const pagina = $('#firmarPagina');

    const frac = (ev) => {
      const r = pagina.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height, r };
    };

    caja.addEventListener('pointerdown', (ev) => {
      const p = frac(ev);
      fir.arrastre = ev.target.classList.contains('tirador')
        ? { modo: 'tam' }
        : { modo: 'mover', dx: p.x - fir.sello.fx, dy: p.y - fir.sello.fy };
      caja.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      ev.stopPropagation();
    });
    caja.addEventListener('pointermove', (ev) => {
      if (!fir.arrastre) return;
      const p = frac(ev);
      if (fir.arrastre.modo === 'mover') {
        fir.sello.fx = Math.max(-0.2, Math.min(1.1, p.x - fir.arrastre.dx));
        fir.sello.fy = Math.max(-0.2, Math.min(1.1, p.y - fir.arrastre.dy));
      } else {
        fir.sello.fw = Math.max(0.03, Math.min(1.6, p.x - fir.sello.fx));
        $('#firmarAncho').value = Math.round(fir.sello.fw * 100);
      }
      pintarSello();
    });
    const fin = () => { fir.arrastre = null; };
    caja.addEventListener('pointerup', fin);
    caja.addEventListener('pointercancel', fin);

    // clic en la página: llevar la firma a ese punto
    pagina.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('#firmarSello')) return;
      const p = frac(ev);
      const firma = G.firmaPorId(fir.sello.firmaId);
      if (!firma || !fir.vis) return;
      const alto = (fir.sello.fw * fir.vis.w * (firma.alto / firma.ancho)) / fir.vis.h;
      fir.sello.fx = Math.max(0, Math.min(1 - fir.sello.fw, p.x - fir.sello.fw / 2));
      fir.sello.fy = Math.max(0, Math.min(1 - alto, p.y - alto / 2));
      pintarSello();
    });

    $('#firmarZoom').addEventListener('input', () => ajustarZoomFirma(true));
    window.addEventListener('resize', () => {
      if (!$('#modalFirmar').hidden) ajustarZoomFirma('medir');
    });
    $('#firmarSelector').addEventListener('change', (ev) => {
      fir.sello.firmaId = ev.target.value;
      E.firmaActiva = ev.target.value;
      pintarSello();
      pintarFirmas();
    });
    $('#firmarAncho').addEventListener('input', (ev) => {
      fir.sello.fw = Math.max(0.03, Math.min(1.6, Number(ev.target.value) / 100));
      pintarSello();
    });
    $('#firmarGiro').addEventListener('input', (ev) => {
      fir.sello.giro = Number(ev.target.value) || 0;
      pintarSello();
    });
    $('#firmarOpacidad').addEventListener('input', (ev) => {
      fir.sello.opacidad = Number(ev.target.value) / 100;
      pintarSello();
    });

    rejillaPosiciones($('#firmarPos'), 'bd', (codigo) => {
      const firma = G.firmaPorId(fir.sello.firmaId);
      if (!firma || !fir.vis) return;
      const m = 0.05;
      const alto = (fir.sello.fw * fir.vis.w * (firma.alto / firma.ancho)) / fir.vis.h;
      const h = codigo[1], v = codigo[0];
      fir.sello.fx = h === 'i' ? m : h === 'd' ? 1 - m - fir.sello.fw : (1 - fir.sello.fw) / 2;
      fir.sello.fy = v === 'a' ? m : v === 'b' ? 1 - m - alto : (1 - alto) / 2;
      pintarSello();
    });

    $('#btnFirmarAplicar').addEventListener('click', () => {
      const alcance = $('#firmarAlcance').value;
      let destino;
      if (alcance === 'seleccion') destino = seleccionadas().length ? seleccionadas() : [fir.pagina];
      else if (alcance === 'todas') destino = E.paginas.slice();
      else if (alcance === 'ultima') destino = E.paginas.length ? [E.paginas[E.paginas.length - 1]] : [];
      else destino = [fir.pagina];
      if (!destino.length) return;
      marcar();
      // Se añade, no se reemplaza: antes borraba la firma anterior que tuviera
      // el mismo sello, así que la segunda se comía a la primera.
      destino.forEach((p) => { p.sellos.push(Object.assign({}, fir.sello)); });
      // El modal se queda abierto: la puesta pasa a verse fija y aparece otra
      // un poco más abajo, lista para colocar sin volver a entrar.
      fir.sello = Object.assign({}, fir.sello, { fy: Math.min(0.92, fir.sello.fy + 0.04) });
      pintarPuestas();
      pintarSello();
      pintar();
      G.aviso(`Firma colocada en ${destino.length} página(s). `
        + 'Puedes poner otra o salir con «Listo».', 'ok');
    });

    $('#btnFirmarQuitarPagina').addEventListener('click', () => {
      marcar();
      fir.pagina.sellos = fir.pagina.sellos.filter((s) => s.rol !== 'firma');
      pintarPuestas();
      pintar();
      G.aviso('Firmas quitadas de esta página.', 'ok');
    });

    $('#btnFirmarListo').addEventListener('click', () => { $('#modalFirmar').hidden = true; });

    $('#btnFirmarRecoger').addEventListener('click', () => {
      for (let i = fir.pagina.sellos.length - 1; i >= 0; i--) {
        if (fir.pagina.sellos[i].rol === 'firma') { recogerFirma(i); return; }
      }
    });
  }

  /* ---------------- rejillas de posición ---------------- */
  function rejillaPosiciones(cont, porDefecto, alElegir) {
    cont.innerHTML = '';
    cont.dataset.valor = cont.dataset.valor || porDefecto;
    G.CODIGOS_POS.forEach((codigo) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.codigo = codigo;
      b.title = codigo;
      b.appendChild(document.createElement('span'));
      if (cont.dataset.valor === codigo) b.classList.add('activo');
      b.addEventListener('click', () => {
        cont.dataset.valor = codigo;
        $$('button', cont).forEach((o) => o.classList.toggle('activo', o.dataset.codigo === codigo));
        if (alElegir) alElegir(codigo);
      });
      cont.appendChild(b);
    });
  }

  /* ---------------- foliación y marca de agua ---------------- */
  function plantillaFolio() {
    const v = $('#folioFormato').value;
    return v === '__libre__' ? ($('#folioTextoLibre').value || '{n}') : v;
  }

  function aplicarFolio() {
    const soloSel = $('#folioSoloSel').checked;
    const destino = soloSel ? seleccionadas() : E.paginas;
    if (!destino.length) { G.aviso('No hay páginas a las que aplicar la foliación.', 'error'); return; }
    marcar();
    const saltaPrimera = $('#folioSaltaPrimera').checked;
    const conf = {
      rol: 'folio',
      plantilla: plantillaFolio(),
      inicio: Number($('#folioInicio').value) || 0,
      tam: Number($('#folioTam').value) || 11,
      margen: Number($('#folioMargen').value),
      color: $('#folioColor').value,
      pos: $('#folioPos').dataset.valor || 'ad',
      invertido: $('#folioSentido').value === 'inverso',
    };
    destino.forEach((p) => {
      p.sellos = p.sellos.filter((s) => s.rol !== 'folio');
      if (saltaPrimera && E.paginas.indexOf(p) === 0) return;
      p.sellos.push(Object.assign({}, conf));
    });
    pintar();
    G.aviso('Foliación aplicada.', 'ok');
  }

  function aplicarMarca() {
    const soloSel = $('#marcaSoloSel').checked;
    const destino = soloSel ? seleccionadas() : E.paginas;
    if (!destino.length) { G.aviso('No hay páginas a las que aplicar el sello.', 'error'); return; }
    const texto = $('#marcaTexto').value.trim();
    if (!texto) { G.aviso('Escribe el texto del sello.', 'error'); return; }
    marcar();
    const conf = {
      rol: 'marca', texto,
      tam: Number($('#marcaTam').value) || 34,
      giro: Number($('#marcaGiro').value) || 0,
      color: $('#marcaColor').value,
      opacidad: Number($('#marcaOpacidad').value) / 100,
      margen: 12,
      pos: $('#marcaPos').dataset.valor || 'cc',
      negrita: true,
    };
    destino.forEach((p) => {
      p.sellos = p.sellos.filter((s) => s.rol !== 'marca');
      p.sellos.push(Object.assign({}, conf));
    });
    pintar();
    G.aviso('Sello aplicado.', 'ok');
  }

  function quitarRol(rol, soloSel) {
    const destino = soloSel ? seleccionadas() : E.paginas;
    if (!destino.length) return;
    marcar();
    destino.forEach((p) => { p.sellos = p.sellos.filter((s) => s.rol !== rol); });
    pintar();
  }

  /* ---------------- guardar y dividir ---------------- */
  /** Lo que informó el último armado sobre el peso, para contarlo al guardar. */
  let ultimoInforme = null;

  function opcionesSalida(paginas) {
    recalcularFolios();
    ultimoInforme = null;
    return {
      titulo: $('#metaTitulo').value.trim() || undefined,
      autor: $('#metaAutor').value.trim() || undefined,
      totalFolio: totalFolios || E.paginas.length,
      numeros: paginas.map((p) => folios.get(p.uid)),
      baseIndices: paginas.map((p) => E.paginas.indexOf(p)),
      comprimir: G.PESOS[$('#pesoSalida').value] || null,
      informe: (d) => { ultimoInforme = d; },
      alProgresar: (t) => G.progreso(t),
    };
  }

  const enMb = (n) => (n < 1048576
    ? Math.max(1, Math.round(n / 1024)) + ' KB'
    : (n / 1048576).toFixed(1) + ' MB');

  const NOTAS_PESO = {
    original: 'Deja el PDF tal cual, con todo el detalle de los originales.',
    ligero: 'Las hojas escaneadas se vuelven a dibujar a 150 ppp. En las que tienen texto de verdad '
      + '(correos, fichas, escaneos con texto buscable) el texto no se toca: se achican sus fotos y logos '
      + 'a 150 ppp. Lo repetido entre archivos se guarda una sola vez. No se pierde ninguna hoja, ni las firmas ni los folios.',
    minimo: 'Todo a 100 ppp y con más compresión. Las hojas de texto sin fotos se vuelven foto y su texto deja de '
      + 'poder seleccionarse; las que tienen fotos o son escaneos con texto buscable lo conservan. Conserva el color.',
    bn: 'Las hojas escaneadas pasan a blanco y negro, a 200 ppp: pesan la mitad que en «Mínimo» '
      + 'y se leen mejor. En las hojas con texto de verdad el texto no se toca: sus imágenes de papel escrito '
      + 'pasan a blanco y negro y sus fotos se achican a 150 ppp. Se pierde el color, y una hoja que sea una '
      + 'fotografía se guarda a color igual, para no estropearla.',
  };
  function pintarNotaPeso() {
    const v = $('#pesoSalida').value;
    $('#pesoNota').textContent = NOTAS_PESO[v] || NOTAS_PESO.original;
  }

  /** Una línea contando cómo quedó el peso, si se pidió aligerar. */
  function frasePeso() {
    const d = ultimoInforme;
    if (!d || !d.antes) return '';
    // lo que Pdflash no supo achicar: así se sabe dónde queda el peso
    const quedan = d.sinSaber && d.sinSaber.n
      ? ` Quedaron ${d.sinSaber.n === 1 ? '1 imagen' : d.sinSaber.n + ' imágenes'} en un formato que Pdflash no sabe achicar (${enMb(d.sinSaber.peso)}).`
      : '';
    if (d.sinMejora) {
      return ` El archivo ya venía bien comprimido: aligerarlo lo habría engordado, así que se dejó igual (${enMb(d.despues)}).${quedan}`;
    }
    if (!d.aligeradas) {
      // todo el documento son hojas de texto: solo cuentan sus imágenes
      if (!d.imagenes && !quedan) return '';
      return ` Pasó de ${enMb(d.antes)} a ${enMb(d.despues)}: todas las hojas conservan su texto`
        + (d.imagenes ? ` y se achicaron ${d.imagenes === 1 ? '1 imagen' : d.imagenes + ' imágenes'}` : '') + '.' + quedan;
    }
    const img = d.imagenes === 1 ? '1 imagen' : d.imagenes + ' imágenes';
    const intactas = !d.intactas ? ''
      : (d.intactas === 1 ? '. La otra tiene texto de verdad: lo conserva' : `. Las otras ${d.intactas} tienen texto de verdad: lo conservan`)
        + (d.imagenes ? `, y se achicaron sus ${img}` : '');
    return ` Pasó de ${enMb(d.antes)} a ${enMb(d.despues)}: se aligeraron ${d.aligeradas} hoja(s)${intactas}.${quedan}`;
  }

  /* ---------- peso máximo ----------
     Muchos sistemas no aceptan más de tantos MB. Se escribe el máximo y
     Pdflash arma el PDF DE VERDAD con cada ajuste de peso, del que menos
     pierde al que más, hasta dar con el primero que cabe: no es una
     estimación, es lo que pesará. Y al guardar, si el ajuste elegido no
     cabe, lo dice antes, con el que sí cabe ya armado.

     El MB es el de Windows: 1 MB = 1024 × 1024 bytes.                    */
  const ORDEN_PESOS = ['original', 'ligero', 'bn', 'minimo'];
  const NOMBRE_PESO = { original: 'Original', ligero: 'Ligero', bn: 'Blanco y negro', minimo: 'Mínimo' };
  let calculoPeso = null;   // { firma, limite, pesos: { modo: bytes } }

  function limitePeso() {
    const v = parseFloat(String($('#pesoMaximo').value).replace(',', '.'));
    return v > 0 ? Math.round(v * 1048576) : 0;
  }
  /** Lo que decide el peso: qué hojas, cómo giradas y qué llevan encima. */
  function firmaPeso() {
    return JSON.stringify(E.paginas.map((p) => [p.fuenteId, p.indice, p.giro, p.enderezo || 0, p.sellos]))
      + '|' + totalFolios;
  }
  const primeroQueCabe = (pesos, limite) => ORDEN_PESOS.find((m) => pesos[m] != null && pesos[m] <= limite);

  /** Arma el PDF con cada ajuste, en orden, y para en el primero que cabe. */
  async function pesarAjustes(limite, yaArmado) {
    const pesos = {}, bytesDe = {};
    if (yaArmado) { pesos[yaArmado.modo] = yaArmado.bytes.length; bytesDe[yaArmado.modo] = yaArmado.bytes; }
    for (const modo of ORDEN_PESOS) {
      if (pesos[modo] == null) {
        G.progreso(`Calculando el peso: «${NOMBRE_PESO[modo]}»…`);
        const op = Object.assign(opcionesSalida(E.paginas), { comprimir: G.PESOS[modo] || null, informe: null });
        const b = await G.construirPdf(E.paginas, op);
        pesos[modo] = b.length; bytesDe[modo] = b;
      }
      if (limite && pesos[modo] <= limite) break;
    }
    calculoPeso = { firma: firmaPeso(), limite, pesos };
    return { pesos, bytesDe };
  }

  async function calcularPeso() {
    if (!E.paginas.length) { G.aviso('Primero abre un PDF.', 'error'); return; }
    G.cargando(true, 'Calculando el peso…');
    try { await pesarAjustes(limitePeso()); }
    catch (e) { console.error(e); G.aviso('No se pudo calcular: ' + e.message, 'error'); }
    finally { G.cargando(false); }
    pintarPesos();
  }

  function usarPeso(modo) {
    $('#pesoSalida').value = modo;
    $('#pesoSalida').dispatchEvent(new Event('change'));
  }

  function pintarPesos() {
    const lista = $('#pesosLista');
    lista.innerHTML = '';
    const limite = limitePeso();
    const c = calculoPeso;
    if (!c || !E.paginas.length) { lista.hidden = true; return; }
    lista.hidden = false;
    if (c.firma !== firmaPeso()) {
      const li = document.createElement('li');
      li.className = 'pesos-aviso';
      li.textContent = 'Cambiaste hojas desde el último cálculo: vuelve a calcular.';
      lista.appendChild(li);
      return;
    }
    const recomendado = limite ? primeroQueCabe(c.pesos, limite) : null;
    const elegido = $('#pesoSalida').value;
    ORDEN_PESOS.forEach((modo) => {
      const n = c.pesos[modo];
      const li = document.createElement('li');
      li.className = 'peso-fila' + (modo === elegido ? ' elegido' : '');
      li.dataset.modo = modo;
      const nom = document.createElement('span');
      nom.className = 'peso-nombre';
      nom.textContent = NOMBRE_PESO[modo];
      const mb = document.createElement('span');
      mb.className = 'peso-mb';
      mb.textContent = n == null ? '—' : enMb(n);
      li.append(nom, mb);
      if (limite && n != null) {
        const cabe = document.createElement('span');
        cabe.className = 'peso-cabe ' + (n <= limite ? 'si' : 'no');
        cabe.textContent = n <= limite ? 'cabe' : 'no cabe';
        li.appendChild(cabe);
      }
      if (n != null && modo !== elegido && (!limite || modo === recomendado)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-mini';
        b.textContent = 'Usar';
        b.title = 'Guardar con «' + NOMBRE_PESO[modo] + '»';
        b.addEventListener('click', () => usarPeso(modo));
        li.appendChild(b);
      }
      if (n == null) li.title = 'No hizo falta calcularlo: ya cabe con uno que pierde menos.';
      lista.appendChild(li);
    });
    if (limite) {
      const li = document.createElement('li');
      li.className = 'pesos-aviso';
      li.textContent = recomendado
        ? (recomendado === elegido
          ? `Con «${NOMBRE_PESO[recomendado]}» cabe en ${enMb(limite)}.`
          : `Cabe en ${enMb(limite)} con «${NOMBRE_PESO[recomendado]}»: es el que menos pierde de los que caben.`)
        : `No cabe en ${enMb(limite)} ni con el más chico. Divídelo en partes (en «Dividir») o quita hojas.`;
      lista.appendChild(li);
    }
  }

  async function guardar() {
    if (!E.paginas.length) { G.aviso('No hay páginas para guardar.', 'error'); return; }
    G.cargando(true, 'Armando el PDF…');
    try {
      let bytes = await G.construirPdf(E.paginas, opcionesSalida(E.paginas));
      // ¿cabe en el máximo? Si no, se dice ANTES de guardar, con el ajuste
      // que sí cabe ya armado
      const limite = limitePeso();
      if (limite && bytes.length > limite) {
        const modo = $('#pesoSalida').value;
        const informe = ultimoInforme;
        const { pesos, bytesDe } = await pesarAjustes(limite, { modo, bytes });
        const cabe = primeroQueCabe(pesos, limite);
        G.cargando(false);
        pintarPesos();
        const ok = cabe
          ? await G.confirmar({
            titulo: 'No cabe en ' + enMb(limite),
            mensaje: `Con «${NOMBRE_PESO[modo]}» pesa ${enMb(bytes.length)}. Con «${NOMBRE_PESO[cabe]}» queda en ${enMb(pesos[cabe])} y sí cabe.`,
            aceptar: `Guardar con «${NOMBRE_PESO[cabe]}»`,
          })
          : await G.confirmar({
            titulo: 'No cabe en ' + enMb(limite),
            mensaje: `Pesa ${enMb(bytes.length)}, y ni con el ajuste más chico baja de ${enMb(Math.min(...Object.values(pesos)))}. Puedes dividirlo en partes en «Dividir».`,
            aceptar: 'Guardar igual', peligro: true,
          });
        if (!ok) { G.aviso('No se guardó nada.'); return; }
        G.cargando(true, 'Guardando…');
        if (cabe) {
          if (cabe !== modo) usarPeso(cabe);
          bytes = bytesDe[cabe];
          ultimoInforme = null;
        } else ultimoInforme = informe;
      }
      const nombre = G.nombreSeguro($('#nombreSalida').value, 'documento-unido') + '.pdf';
      const r = await G.guardarArchivo(bytes, nombre, 'application/pdf');
      G.aviso(
        (r.estado === 'carpeta' ? `Guardado en «${G.carpeta.nombre()}» como ${r.nombre}`
          : r.estado === 'guardado' ? 'PDF guardado.' : 'Guardado cancelado.')
          + (r.estado === 'cancelado' ? '' : frasePeso()),
        r.estado === 'cancelado' ? '' : 'ok'
      );
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo guardar: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  async function entregarGrupos(grupos, prefijo) {
    const validos = grupos.filter((g) => g.length);
    if (!validos.length) { G.aviso('No hay páginas que dividir.', 'error'); return; }
    G.cargando(true, 'Dividiendo…');
    try {
      const base = G.nombreSeguro($('#nombreSalida').value, 'documento');
      const archivos = [];
      for (let i = 0; i < validos.length; i++) {
        $('#cargandoTexto').textContent = `Generando parte ${i + 1} de ${validos.length}…`;
        const bytes = await G.construirPdf(validos[i], opcionesSalida(validos[i]));
        archivos.push({
          bytes,
          nombre: validos.length === 1
            ? `${base}-${prefijo}.pdf`
            : `${base}-${prefijo}-${String(i + 1).padStart(2, '0')}.pdf`,
        });
      }
      const guardados = await G.entregarVarios(archivos, `${base}-${prefijo}.zip`, (i, total) => {
        $('#cargandoTexto').textContent = `Guardando archivo ${i + 1} de ${total}…`;
      });
      G.aviso(
        guardados === archivos.length
          ? `Listo: ${guardados} archivo(s).`
          : `Se guardaron ${guardados} de ${archivos.length} archivos.`,
        guardados ? 'ok' : ''
      );
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo dividir: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  function gruposPorMarcas() {
    const grupos = [[]];
    E.paginas.forEach((p) => {
      grupos[grupos.length - 1].push(p);
      if (p.corte) grupos.push([]);
    });
    return grupos;
  }

  function parsearRangos(txt, total) {
    const grupos = [];
    String(txt).split(',').forEach((trozo) => {
      const t = trozo.trim();
      if (!t) return;
      const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(t);
      if (!m) return;
      let a = parseInt(m[1], 10);
      let b = m[2] ? parseInt(m[2], 10) : a;
      if (a > b) { const c = a; a = b; b = c; }
      a = Math.max(1, a); b = Math.min(total, b);
      if (a > total || b < 1) return;
      grupos.push(E.paginas.slice(a - 1, b));
    });
    return grupos;
  }

  /* =========================================================
     TABLEROS
     Hasta tres expedientes abiertos a la vez, cada uno en su pestaña, para
     avanzar con varios en paralelo. Cada tablero tiene lo suyo: sus hojas,
     paquetes, selección, deshacer, el expediente que se está editando, los
     campos del archivo de salida y su propio autoguardado.
     Se comparten los PDF de origen, las firmas y sellos, la lista de
     guardados y las preferencias.

     Solo hay UNA pantalla de trabajo: al cambiar de tablero, el estado vivo
     (E y las variables de este archivo) se guarda en el tablero que se deja
     y se carga el del que se abre. Así todo el programa sigue leyendo E como
     siempre y no hay que enseñarle a ningún módulo qué es un tablero.
     ========================================================= */
  const COLORES_TABLERO = ['#e0532f', '#2f6fed', '#1f9d64'];
  const CAMPOS_TABLERO = ['nombreSalida', 'metaTitulo', 'metaAutor', 'guardarNombre', 'divRangos'];

  function leerCampos() {
    const c = {};
    CAMPOS_TABLERO.forEach((id) => { const el = $('#' + id); if (el) c[id] = el.value; });
    return c;
  }
  function escribirCampos(c) {
    CAMPOS_TABLERO.forEach((id) => {
      const el = $('#' + id);
      if (el) el.value = c && c[id] != null ? c[id] : (id === 'nombreSalida' ? 'documento-unido' : '');
    });
  }

  /** Lo que tiene un tablero ahora: lo vivo si es el que se ve, lo guardado si no. */
  function datosDe(t) {
    if (t === tableroActivo) {
      return { paginas: E.paginas, paquetes: E.paquetes, seleccion: E.seleccion, expediente: expedienteAbierto,
        nombreManual, campos: leerCampos(), historial };
    }
    return { paginas: t.paginas, paquetes: t.paquetes, seleccion: t.seleccion, expediente: t.expedienteAbierto,
      nombreManual: t.nombreManual, campos: t.campos, historial: t.historial };
  }

  function crearTablero() {
    if (tableros.length >= MAX_TABLEROS) return null;
    const usados = new Set(tableros.map((t) => t.slot));
    let slot = 1;
    while (usados.has(slot)) slot++;
    const t = {
      id: 't' + (++contadorTablero),
      slot,                        // su color y su clave de autoguardado
      paginas: [], paquetes: new Map(), seleccion: new Set(), ancla: null,
      historial: { atras: [], adelante: [] },
      vista: 'hojas', paqueteAbierto: null,
      expedienteAbierto: null, nombreManual: false,
      campos: {}, scroll: 0,
      firmaGuardada: null,         // cómo estaba lo último que se guardó con nombre
      firmaActual: '',             // cómo está ahora (se calcula al dejarlo)
      guardadoEn: null,
      desfasado: false,            // otra ventana lo guardó después de abrirlo aquí
    };
    tableros.push(t);
    return t;
  }

  function volcarEnTablero(t) {
    t.paginas = E.paginas;
    t.paquetes = E.paquetes;
    t.seleccion = E.seleccion;
    t.ancla = E.ancla;
    t.historial = { atras: historial.atras, adelante: historial.adelante };
    t.vista = vista;
    t.paqueteAbierto = paqueteAbierto;
    t.expedienteAbierto = expedienteAbierto;
    t.nombreManual = nombreManual;
    t.campos = leerCampos();
    t.scroll = $('#lienzo').scrollTop;
    t.firmaActual = firmaTrabajo(E.paginas, E.paquetes);
  }

  function cargarDeTablero(t) {
    E.paginas = t.paginas;
    E.paquetes = t.paquetes;
    E.seleccion = t.seleccion;
    E.ancla = t.ancla;
    historial.atras = t.historial.atras;
    historial.adelante = t.historial.adelante;
    vista = t.vista;
    paqueteAbierto = t.paqueteAbierto;
    expedienteAbierto = t.expedienteAbierto;
    nombreManual = t.nombreManual;
    escribirCampos(t.campos);
  }

  /** Lo que identifica el contenido de un tablero, sin los identificadores de sesión. */
  function firmaTrabajo(paginas, paquetes) {
    return JSON.stringify([
      paginas.map((p) => [p.fuenteId, p.indice, p.giro, p.enderezo || 0, p.paqueteId, !!p.corte, p.sellos]),
      Array.from(paquetes.values()).map((q) => [q.id, q.nombre, q.color]),
    ]);
  }

  /** 'vacio' · 'nuevo' (sin guardar nunca) · 'sucio' (cambió desde que se guardó) · 'guardado'. */
  function estadoDe(t) {
    const d = datosDe(t);
    if (!d.paginas.length) return 'vacio';
    if (!d.expediente) return 'nuevo';
    const ahora = t === tableroActivo ? firmaTrabajo(d.paginas, d.paquetes) : t.firmaActual;
    return ahora === t.firmaGuardada ? 'guardado' : 'sucio';
  }

  function nombreTablero(t) {
    const d = datosDe(t);
    if (d.expediente && d.expediente.nombre) return d.expediente.nombre;
    const base = d.paginas[d.paginas.length - 1];
    const f = base && E.fuentes.get(base.fuenteId);
    return f ? f.nombre : 'Tablero en blanco';
  }
  const numeroDe = (t) => tableros.indexOf(t) + 1;

  /** Lo que hay que parar o soltar antes de mostrar otro tablero. */
  function prepararCambio() {
    if (lector.abierto) cerrarLector();
    if (capturando) alternarCaptura(false);
    if (revision.corriendo) revision.corriendo.cancelada = true;
    busqueda.turno++;
    busqueda.actual = -1;
    calculoPeso = null;
    ultimoInforme = null;
    destinoCarga = null;
  }

  /**
   * Cambia de tablero. No lo hace con una carga a medias ni con una ventana
   * abierta encima (firma, captura…): lo que se está haciendo caería en el
   * tablero equivocado. «interno» es para lo que lo pide el propio programa.
   */
  function activarTablero(id, opciones) {
    const t = tableros.find((x) => x.id === id);
    if (!t || t === tableroActivo) return false;
    if (!(opciones && opciones.interno)) {
      if (contadorCarga > 0 || $$('.modal:not([hidden])').length) return false;
    }
    adelantarAutoguardado();
    prepararCambio();
    volcarEnTablero(tableroActivo);
    tableroActivo = t;
    cargarDeTablero(t);
    pintar();
    pintarTableros();
    const donde = t.scroll;
    requestAnimationFrame(() => { $('#lienzo').scrollTop = donde; });
    marcarGuardadosAbiertos();
    return true;
  }

  async function cerrarTablero(id) {
    const t = tableros.find((x) => x.id === id);
    if (!t || tableros.length < 2) return;
    if (estadoDe(t) === 'nuevo' || estadoDe(t) === 'sucio') {
      const sigue = await G.confirmar({
        titulo: 'Cerrar este tablero',
        mensaje: `«${nombreTablero(t)}» tiene cambios que no has guardado. Si lo cierras se pierden.`,
        aceptar: 'Cerrar sin guardar',
        peligro: true,
      });
      if (!sigue) return;
    }
    const i = tableros.indexOf(t);
    if (t === tableroActivo) {
      const vecino = tableros[i + 1] || tableros[i - 1];
      clearTimeout(relojAuto);
      relojAuto = null;
      prepararCambio();
      tableros.splice(i, 1);
      tableroActivo = vecino;
      cargarDeTablero(vecino);
      pintar();
      pintarTableros();
      const donde = vecino.scroll;
      requestAnimationFrame(() => { $('#lienzo').scrollTop = donde; });
    } else {
      tableros.splice(i, 1);
    }
    try { await G.bd.borrarExpediente(claveAuto(t)); } catch (e) {}
    soltarFuentesSinUso();
    pintarTableros();
    marcarGuardadosAbiertos();
  }

  /** Otro tablero en blanco; si ya están los tres, vacía el que se ve. */
  async function nuevoTablero() {
    const t = crearTablero();
    if (t) { activarTablero(t.id, { interno: true }); return; }
    await empezarDeCero();
  }

  /**
   * Abre un expediente guardado. Solo puede estar abierto en UN tablero: si ya
   * lo está, se va a ese. Si no, va al tablero actual cuando está en blanco, a
   * otro tablero en blanco si lo hay, a uno nuevo si hay sitio, y si están los
   * tres en uso pregunta antes de pisar.
   */
  async function abrirEnTablero(r) {
    const abierto = tableros.find((t) => { const d = datosDe(t); return d.expediente && d.expediente.id === r.id; });
    if (abierto) {
      activarTablero(abierto.id);
      G.aviso(`«${r.nombre}» ya estaba abierto en el tablero ${numeroDe(abierto)}.`, 'ok');
      return;
    }
    if (!E.paginas.length) { await restaurarExpediente(r); return; }
    // un tablero en blanco que ya esté abierto se aprovecha antes que ocupar otro sitio
    const enBlanco = tableros.find((t) => t !== tableroActivo && !datosDe(t).paginas.length);
    if (enBlanco) {
      activarTablero(enBlanco.id, { interno: true });
      await restaurarExpediente(r);
      return;
    }
    const nuevo = crearTablero();
    if (nuevo) {
      activarTablero(nuevo.id, { interno: true });
      await restaurarExpediente(r);
      return;
    }
    const perdera = estadoDe(tableroActivo) !== 'guardado';
    const sigue = await G.confirmar({
      titulo: 'Abrir este expediente',
      mensaje: `Los ${MAX_TABLEROS} tableros están en uso. Se reemplaza lo del tablero ${numeroDe(tableroActivo)} `
        + `(«${nombreTablero(tableroActivo)}») por «${r.nombre}».` + (perdera ? ' Lo que no hayas guardado se pierde.' : ''),
      aceptar: 'Reemplazar',
      peligro: perdera,
    });
    if (!sigue) return;
    await restaurarExpediente(r);
  }

  /** Guarda lo del tablero que se ve: actualiza su guardado, o lo guarda con nombre si es nuevo. */
  async function guardarExpedienteActual() {
    if (!E.paginas.length) { G.aviso('No hay nada que guardar todavía.', 'error'); return; }
    if (expedienteAbierto) { await actualizarGuardado(); return; }
    const nombre = await G.pedirTexto({
      titulo: 'Guardar el expediente',
      mensaje: 'Ponle un nombre para reconocerlo en la lista de guardados. Se guarda en este navegador.',
      valor: nombreDelTrabajo() || '',
    });
    if (!nombre) return;
    $('#guardarNombre').value = nombre;
    await guardarComoNuevo();
  }

  /** Lo recién guardado es lo que hay ahora en el tablero que se ve. */
  function marcarGuardado() {
    const t = tableroActivo;
    t.firmaGuardada = firmaTrabajo(E.paginas, E.paquetes);
    t.guardadoEn = Date.now();
    t.desfasado = false;
    pintarTableros();
  }

  /** Suelta de la memoria los PDF de origen que ya no usa ningún tablero (ni su deshacer). */
  function soltarFuentesSinUso() {
    const usadas = new Set();
    tableros.forEach((t) => {
      const d = datosDe(t);
      d.paginas.forEach((p) => usadas.add(p.fuenteId));
      [].concat(d.historial.atras, d.historial.adelante).forEach((txt) => {
        for (const m of String(txt).matchAll(/"fuenteId":"([^"]+)"/g)) usadas.add(m[1]);
      });
    });
    const sueltas = [];
    E.fuentes.forEach((f, id) => { if (!usadas.has(id)) sueltas.push(id); });
    if (!sueltas.length) return;
    sueltas.forEach((id) => {
      const f = E.fuentes.get(id);
      E.fuentes.delete(id);
      try { if (f && f.doc && f.doc.destroy) f.doc.destroy(); } catch (e) {}
    });
    G.olvidarDocs();
    G.olvidarBusqueda(sueltas);
  }

  /* ---------------- enviar hojas a otro tablero ---------------- */
  /**
   * Copia (o mueve) las hojas marcadas a otro tablero. Los folios no viajan:
   * se numeraban dentro del expediente de origen y allí tienen otro sitio;
   * las firmas y los sellos sí.
   */
  function enviarHojas(destinoId, mover) {
    const t = tableros.find((x) => x.id === destinoId);
    const objs = seleccionadas();
    if (!t || t === tableroActivo) return;
    if (!objs.length) { G.aviso('Marca primero las hojas que quieres enviar.', 'error'); return; }
    const origen = nombreTablero(tableroActivo);
    // el deshacer del tablero de destino también las quita
    t.historial.atras.push(instantanea(t.paginas, t.seleccion, t.paquetes));
    if (t.historial.atras.length > 60) t.historial.atras.shift();
    t.historial.adelante = [];

    contadorPaquete++;
    const paq = {
      id: 'q' + contadorPaquete + '-' + Date.now().toString(36),
      nombre: G.nombreSeguro('De ' + origen, 'Hojas enviadas'),
      color: COLORES_PAQUETE[(contadorPaquete - 1) % COLORES_PAQUETE.length],
    };
    t.paquetes.set(paq.id, paq);
    const copias = objs.map((p) => {
      const c = JSON.parse(JSON.stringify(p));
      c.uid = G.nuevoUid();
      c.paqueteId = paq.id;
      c.sellos = (c.sellos || []).filter((x) => x.rol !== 'folio');
      return c;
    });
    t.paginas = copias.concat(t.paginas);     // encima, como al grapar sobre un expediente
    t.seleccion = new Set(copias.map((c) => c.uid));
    t.paqueteAbierto = null;                  // si estaba dentro de un paquete, no vería lo que llega
    t.firmaActual = firmaTrabajo(t.paginas, t.paquetes);
    autoguardarTablero(t);

    if (mover) { marcar(); eliminar(objs); }
    G.aviso(`${objs.length} hoja(s) ${mover ? 'movida(s)' : 'copiada(s)'} al tablero ${numeroDe(t)} `
      + `(«${nombreTablero(t)}»). Ctrl+Z allí las quita.`, 'ok');
    pintarTableros();
    const el = $(`.tablero[data-id="${t.id}"]`);
    if (el) { el.classList.remove('recibe'); void el.offsetWidth; el.classList.add('recibe'); }
  }

  /* ---------------- sincronía entre tableros y ventanas ---------------- */
  /** Cambia el nombre en todo tablero que tenga abierto ese expediente. */
  function renombrarEnTableros(id, nombre) {
    tableros.forEach((t) => {
      const e = t === tableroActivo ? expedienteAbierto : t.expedienteAbierto;
      if (e && e.id === id) e.nombre = nombre;
    });
    actualizarEstadoGuardado();
    sincronizarNombreSalida();
    pintarTableros();
  }

  /** Si se borró de la lista, el tablero que lo tenía abierto pasa a ser uno sin guardar. */
  function olvidarEnTableros(id) {
    tableros.forEach((t) => {
      const e = t === tableroActivo ? expedienteAbierto : t.expedienteAbierto;
      if (!e || e.id !== id) return;
      if (t === tableroActivo) expedienteAbierto = null; else t.expedienteAbierto = null;
      t.firmaGuardada = null;
    });
    actualizarEstadoGuardado();
    sincronizarNombreSalida();
    pintarTableros();
  }

  /** En la lista de guardados, dice cuáles están abiertos y en qué tablero. */
  function marcarGuardadosAbiertos() {
    $$('#listaGuardados li[data-id]').forEach((li) => {
      const t = tableros.find((x) => { const d = datosDe(x); return d.expediente && d.expediente.id === li.dataset.id; });
      li.classList.toggle('actual', !!t && t === tableroActivo);
      li.classList.toggle('en-otro', !!t && t !== tableroActivo);
      let chip = li.querySelector('.guardado-tablero');
      if (!t) { if (chip) chip.remove(); } else {
        if (!chip) {
          chip = document.createElement('span');
          chip.className = 'guardado-tablero';
          li.querySelector('.guardado-datos').appendChild(chip);
        }
        chip.textContent = 'Tablero ' + numeroDe(t);
        chip.style.setProperty('--color-tablero', COLORES_TABLERO[t.slot - 1]);
      }
      const abrir = li.querySelector('.guardado-abrir');
      if (abrir) abrir.textContent = t ? (t === tableroActivo ? 'Abierto' : 'Ir al tablero ' + numeroDe(t)) : 'Abrir';
    });
  }

  /** Otra ventana de Pdflash guardó, renombró o borró un expediente. */
  function alCambioDeOtraVentana(msg) {
    pintarGuardados();
    const t = tableros.find((x) => { const d = datosDe(x); return d.expediente && d.expediente.id === msg.id; });
    if (!t) return;
    if (msg.op === 'renombrar') { renombrarEnTableros(msg.id, msg.nombre); return; }
    if (msg.op === 'borrar') {
      olvidarEnTableros(msg.id);
      G.aviso('Ese expediente se borró desde otra ventana. Lo que tienes aquí queda sin guardar.', 'error');
      return;
    }
    if (msg.op === 'guardar') {
      t.desfasado = true;
      G.aviso(`«${msg.nombre || nombreTablero(t)}» se guardó desde otra ventana. Si lo actualizas aquí, pisarás ese cambio.`, 'error');
    }
  }

  /* ---------------- las pestañas ---------------- */
  let relojPestanas = null;
  /** Tras cada pintada, y sin apurar: no hace falta rehacer las pestañas por cada gesto. */
  function programarPestanas() {
    clearTimeout(relojPestanas);
    relojPestanas = setTimeout(pintarTableros, 120);
  }

  function pintarTableros() {
    const lista = $('#tablerosLista');
    if (!lista) return;
    lista.innerHTML = '';
    tableros.forEach((t) => {
      const d = datosDe(t);
      const estado = estadoDe(t);
      const el = document.createElement('div');
      // «est-»: «vacio» ya es la clase de la pantalla «Aún no hay páginas»
      el.className = 'tablero est-' + estado + (t === tableroActivo ? ' activo' : '');
      el.dataset.id = t.id;
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', t === tableroActivo ? 'true' : 'false');
      el.tabIndex = 0;
      el.style.setProperty('--color-tablero', COLORES_TABLERO[t.slot - 1]);
      const nombre = nombreTablero(t);
      el.title = `Tablero ${numeroDe(t)} · ${nombre} · `
        + (estado === 'vacio' ? 'en blanco' : estado === 'guardado' ? 'guardado' : 'sin guardar') + ` · Alt+${numeroDe(t)}`;

      const punto = document.createElement('span');
      punto.className = 'tablero-punto';
      const nom = document.createElement('span');
      nom.className = 'tablero-nombre';
      nom.textContent = nombreCorto(nombre, 30);
      const meta = document.createElement('span');
      meta.className = 'tablero-meta';
      meta.textContent = d.paginas.length ? d.paginas.length + ' h' : '';
      meta.title = d.paginas.length + (d.paginas.length === 1 ? ' hoja' : ' hojas');
      el.append(punto, nom, meta);

      const marca = document.createElement('span');
      marca.className = 'tablero-estado';
      marca.title = estado === 'guardado' ? 'Guardado' : 'Sin guardar';
      el.appendChild(marca);

      if (tableros.length > 1) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'tablero-cerrar';
        x.setAttribute('aria-label', 'Cerrar el tablero ' + numeroDe(t));
        x.title = 'Cerrar este tablero';
        x.innerHTML = icono('cerrar');
        el.appendChild(x);
      }
      lista.appendChild(el);
    });

    const lleno = tableros.length >= MAX_TABLEROS;
    const nuevo = $('#btnTableroNuevo');
    nuevo.disabled = lleno;
    $('#tablerosCupo').textContent = `${tableros.length} de ${MAX_TABLEROS} tableros`;
    nuevo.hidden = lleno;
    $('#tablerosCupo').classList.toggle('lleno', lleno);
    actualizarBotonNuevo();
    pintarEnviar();
    pintarCabeceraYEstado();
  }

  /** «hace un momento», «hace 5 min»… para lo último que se guardó. */
  function haceCuanto(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 45) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.max(1, Math.round(s / 60)) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return fechaCorta(ms);
  }

  /** El título del tablero, su chip de estado y la barra de abajo. */
  function pintarCabeceraYEstado() {
    const t = tableroActivo;
    if (!t || !$('#tituloTablero')) return;
    const estado = estadoDe(t);
    const nombre = nombreTablero(t);
    $('#tituloTablero').textContent = nombre;
    $('#tituloTablero').title = nombre;
    document.title = estado === 'vacio' ? 'Pdflash · Taller de PDF' : nombre + ' · Pdflash';

    const chip = $('#chipEstado');
    chip.hidden = estado === 'vacio';
    chip.className = 'chip-estado est-' + estado;
    chip.innerHTML = estado === 'guardado'
      ? icono('check') + ' Guardado'
      : '<i class="punto-sucio"></i> Sin guardar';
    chip.title = estado === 'guardado'
      ? 'Todo lo que ves está guardado'
      : 'Hay cambios sin guardar. Clic para guardar (Ctrl+Mayús+S).';
    chip.disabled = estado === 'guardado';

    const g = $('#estadoGuardado');
    g.className = 'estado-guardado est-' + estado;
    g.innerHTML = estado === 'vacio' ? 'Tablero en blanco'
      : estado === 'guardado'
        ? icono('check') + ' Guardado ' + haceCuanto(t.guardadoEn || Date.now())
        : '<i class="punto-sucio"></i> Sin guardar';
    const n = tableros.length;
    $('#estadoSyncTexto').textContent = n === 1 ? 'Sincronizado' : `Sincronizado en ${n} tableros`;
  }

  function actualizarBotonNuevo() {
    const b = $('#btnNuevo');
    if (!b) return;
    const lleno = tableros.length >= MAX_TABLEROS;
    b.title = lleno
      ? `Están los ${MAX_TABLEROS} tableros en uso: vacía este para armar otro expediente.`
      : 'Abre otro tablero en blanco para armar otro expediente a la vez. No toca lo que ya tienes.';
    $('#txtNuevo').textContent = lleno ? 'Vaciar este tablero' : 'Nuevo tablero';
  }

  /** «Enviar a»: solo aparece si hay otros tableros y hojas marcadas. */
  function pintarEnviar() {
    const b = $('#btnEnviar');
    if (!b) return;
    b.hidden = tableros.length < 2 || !E.seleccion.size;
    if (b.hidden) cerrarMenuEnviar();
  }
  function cerrarMenuEnviar() { const m = $('#menuEnviar'); if (m) m.hidden = true; }
  function abrirMenuEnviar() {
    const m = $('#menuEnviar');
    m.innerHTML = '';
    const n = E.seleccion.size;
    const tit = document.createElement('p');
    tit.className = 'menu-enviar-titulo';
    tit.textContent = n === 1 ? 'Enviar 1 hoja a…' : `Enviar ${n} hojas a…`;
    m.appendChild(tit);
    tableros.filter((t) => t !== tableroActivo).forEach((t) => {
      const fila = document.createElement('div');
      fila.className = 'menu-enviar-fila';
      fila.style.setProperty('--color-tablero', COLORES_TABLERO[t.slot - 1]);
      const nom = document.createElement('span');
      nom.className = 'menu-enviar-nombre';
      nom.textContent = `Tablero ${numeroDe(t)} · ${nombreCorto(nombreTablero(t), 26)}`;
      const copiar = document.createElement('button');
      copiar.type = 'button';
      copiar.className = 'btn btn-mini';
      copiar.textContent = 'Copiar';
      copiar.addEventListener('click', () => { cerrarMenuEnviar(); enviarHojas(t.id, false); });
      const mover = document.createElement('button');
      mover.type = 'button';
      mover.className = 'btn btn-mini';
      mover.textContent = 'Mover';
      mover.addEventListener('click', () => { cerrarMenuEnviar(); enviarHojas(t.id, true); });
      fila.append(nom, copiar, mover);
      m.appendChild(fila);
    });
    m.hidden = false;
  }

  function conectarTableros() {
    const barra = $('#tableros');
    barra.addEventListener('click', (ev) => {
      const cerrar = ev.target.closest('.tablero-cerrar');
      const pest = ev.target.closest('.tablero');
      if (cerrar && pest) { ev.stopPropagation(); cerrarTablero(pest.dataset.id); return; }
      if (pest) activarTablero(pest.dataset.id);
    });
    barra.addEventListener('keydown', (ev) => {
      const pest = ev.target.closest('.tablero');
      if (pest && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); activarTablero(pest.dataset.id); }
    });
    // una pestaña con el botón central se cierra, como en el navegador
    barra.addEventListener('auxclick', (ev) => {
      const pest = ev.target.closest('.tablero');
      if (ev.button === 1 && pest) { ev.preventDefault(); cerrarTablero(pest.dataset.id); }
    });
    $('#btnTableroNuevo').addEventListener('click', nuevoTablero);
    $('#btnEnviar').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if ($('#menuEnviar').hidden) abrirMenuEnviar(); else cerrarMenuEnviar();
    });
    document.addEventListener('click', (ev) => { if (!ev.target.closest('#menuEnviar, #btnEnviar')) cerrarMenuEnviar(); });
    G.bd.alCambiar(alCambioDeOtraVentana);
  }

  /* =========================================================
     GUARDAR EL TRABAJO
     El expediente a medio armar (orden, giros, firmas, folios) vive en
     la base de datos del navegador junto con los PDF de origen.
     ========================================================= */
  /** Expediente guardado que se está editando ahora mismo, o null si es nuevo. */
  let expedienteAbierto = null;

  function actualizarEstadoGuardado() {
    const caja = $('#expedienteActual');
    const btn = $('#btnActualizarTrabajo');
    if (!caja || !btn) return;
    if (expedienteAbierto) {
      caja.hidden = false;
      $('#expedienteActualNombre').textContent = expedienteAbierto.nombre;
      btn.hidden = false;
      btn.textContent = 'Actualizar este guardado';
      btn.title = `Sobrescribe «${expedienteAbierto.nombre}» con lo que tienes ahora`;
    } else {
      caja.hidden = true;
      btn.hidden = true;
    }
  }

  function fuentesUsadas(paginas) {
    const ids = new Set((paginas || E.paginas).map((p) => p.fuenteId));
    return Array.from(ids).map((id) => {
      const f = E.fuentes.get(id);
      return f ? {
        id: f.id, nombre: f.nombre, nombreCompleto: f.nombreCompleto,
        color: f.color, paginas: f.paginas, bytes: f.bytes,
      } : null;
    }).filter(Boolean);
  }

  function serializar(id, nombre, tablero) {
    const d = datosDe(tablero || tableroActivo);
    const fuentes = fuentesUsadas(d.paginas);
    const registro = {
      id, nombre,
      fecha: Date.now(),
      numPaginas: d.paginas.length,
      fuenteIds: fuentes.map((f) => f.id),
      paginas: JSON.parse(JSON.stringify(d.paginas)),
      paquetes: Array.from(d.paquetes.values()),
      salida: {
        nombre: d.campos.nombreSalida,
        titulo: d.campos.metaTitulo,
        autor: d.campos.metaAutor,
        nombreManual: d.nombreManual,
      },
    };
    // El autoguardado recuerda de qué expediente con nombre venía, para que
    // "Continuar donde lo dejé" también recupere la opción de Actualizar.
    if (String(id).startsWith('__auto')) {
      registro.resumen = nombreTablero(tablero || tableroActivo);   // para reconocerlo en el aviso de recuperación
      if (d.expediente) {
        registro.origenId = d.expediente.id;
        registro.origenNombre = d.expediente.nombre;
      }
    }
    return { registro, fuentes };
  }

  async function restaurarExpediente(registro) {
    G.cargando(true, 'Abriendo el expediente…');
    try {
      const fuentes = await G.bd.leerFuentes(registro.fuenteIds || []);
      await G.restaurarFuentes(fuentes);
      const vivas = new Set(fuentes.map((f) => f.id));
      const perdidas = (registro.paginas || []).filter((p) => !vivas.has(p.fuenteId)).length;
      E.paquetes = new Map((registro.paquetes || []).map((q) => [q.id, Object.assign({}, q)]));
      E.paginas = (registro.paginas || [])
        .filter((p) => vivas.has(p.fuenteId))
        .map((p) => Object.assign({}, p, { uid: G.nuevoUid() }));
      paqueteAbierto = null;
      vista = 'hojas';   // se recalcula abajo, cuando ya están puestas las hojas
      E.seleccion = new Set();
      historial.atras = [];
      historial.adelante = [];
      // Deja anotado sobre qué guardado se está trabajando: el próximo
      // guardado lo actualiza en vez de crear uno nuevo por separado.
      const esAuto = String(registro.id).startsWith('__auto');
      expedienteAbierto = esAuto
        ? (registro.origenId ? { id: registro.origenId, nombre: registro.origenNombre || 'expediente' } : null)
        : { id: registro.id, nombre: registro.nombre };
      // Abrir un expediente es entrar en él: el nombre del archivo pasa a ser
      // el suyo. Lo que quedara escrito en «Guardar como nuevo» era para otro
      // trabajo y no debe mandar sobre el expediente que se acaba de abrir.
      $('#guardarNombre').value = '';
      if (registro.salida) {
        $('#metaTitulo').value = registro.salida.titulo || '';
        $('#metaAutor').value = registro.salida.autor || '';
        // Solo se conserva el nombre del archivo si consta que lo escribió el
        // usuario. Los expedientes guardados antes de que el nombre se
        // sincronizara no lo dicen, y ahí manda el nombre del expediente.
        nombreManual = registro.salida.nombreManual === true;
        if (nombreManual) $('#nombreSalida').value = registro.salida.nombre || '';
      } else {
        nombreManual = false;
      }
      actualizarEstadoGuardado();
      asegurarPaquetes();
      if (paquetesEnOrden().length > 1) vista = 'paquetes';
      pintar();
      // Un guardado con nombre es lo que hay en la base: queda «guardado» hasta
      // que se cambie algo. Un autoguardado no lo es, y hay que volver a guardar.
      tableroActivo.firmaGuardada = esAuto ? null : firmaTrabajo(E.paginas, E.paquetes);
      tableroActivo.guardadoEn = esAuto ? null : (registro.fecha || Date.now());
      tableroActivo.desfasado = false;
      soltarFuentesSinUso();
      pintarTableros();
      await pintarGuardados();
      G.aviso(perdidas
        ? `Expediente abierto; faltaban ${perdidas} página(s) por un archivo que ya no está.`
        : `Expediente abierto: ${E.paginas.length} página(s).`, perdidas ? 'error' : 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo abrir el expediente: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  /* ---------------- autoguardado ---------------- */
  let relojAuto = null;
  let autoguardar = true;

  /** Cada tablero tiene su propio autoguardado: __auto1, __auto2 y __auto3. */
  const claveAuto = (t) => '__auto' + t.slot;

  function programarAutoguardado() {
    if (!autoguardar) return;
    clearTimeout(relojAuto);
    const t = tableroActivo;
    relojAuto = setTimeout(() => { relojAuto = null; autoguardarTablero(t); }, 2500);
  }

  /**
   * Guarda el trabajo en curso de ese tablero. El registro se arma al instante
   * (antes del primer await), así que lo que se guarda es lo de ese momento
   * aunque después se cambie de tablero.
   */
  async function autoguardarTablero(t) {
    try {
      if (!autoguardar || !tableros.includes(t)) return;
      if (!datosDe(t).paginas.length) return;
      const { registro, fuentes } = serializar(claveAuto(t), 'Trabajo en curso', t);
      await G.bd.guardarExpediente(registro, fuentes);
    } catch (e) {
      console.warn('autoguardado no disponible', e);
      autoguardar = false;
    }
  }

  /** Antes de cambiar de tablero: lo que estaba por guardarse se guarda ya, de SU tablero. */
  function adelantarAutoguardado() {
    if (!relojAuto) return;
    clearTimeout(relojAuto);
    relojAuto = null;
    autoguardarTablero(tableroActivo);
  }

  const fechaCorta = (ms) => {
    const d = new Date(ms || Date.now());
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Corta por el MEDIO, no por el final. Los expedientes empiezan igual
   * («EXP. 10488-2026 ADQUISICION DE…») y lo que los distingue está al final,
   * así que cortando por detrás se leían todos iguales.
   */
  function nombreCorto(texto, tope) {
    const t = String(texto || '');
    const max = tope || 62;
    if (t.length <= max) return t;
    const cola = Math.min(22, Math.floor(max / 3));
    return t.slice(0, max - cola - 1).trimEnd() + '…' + t.slice(-cola).trimStart();
  }

  /** Para la lista: «hoy», «ayer» o la fecha. La hora solo si es de hoy. */
  const fechaLista = (ms) => {
    const d = new Date(ms || Date.now());
    const hoy = new Date();
    const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dias = Math.round((dia(hoy) - dia(d)) / 86400000);
    if (dias === 0) return 'hoy ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    if (dias === 1) return 'ayer';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const slotDeAuto = (id) => { const m = /^__auto(\d)$/.exec(String(id)); return m ? Number(m[1]) : 0; };

  async function comprobarAutoguardado() {
    try {
      const todos = (await G.bd.listarAutoguardados()).filter((r) => r.numPaginas);
      if (!todos.length) return;
      const regs = todos.slice(0, MAX_TABLEROS);   // los más recientes, si hubiera de más
      $('#restaurarTexto').textContent = regs.length === 1
        ? `Quedó un trabajo sin terminar: ${regs[0].numPaginas} página(s) del ${fechaCorta(regs[0].fecha)}.`
        : `Quedaron ${regs.length} tableros sin terminar: `
          + regs.map((r) => `«${nombreCorto(r.resumen || r.origenNombre || 'Trabajo en curso', 26)}» (${r.numPaginas} pág.)`).join(' · ') + '.';
      $('#btnRestaurar').textContent = regs.length === 1 ? 'Continuar donde lo dejé' : `Continuar con los ${regs.length} tableros`;
      $('#restaurar').hidden = false;
      $('#btnRestaurar').onclick = async () => {
        $('#restaurar').hidden = true;
        await restaurarAutoguardados(regs);
      };
      $('#btnDescartarAuto').onclick = async () => {
        $('#restaurar').hidden = true;
        for (const r of todos) { try { await G.bd.borrarExpediente(r.id); } catch (e) {} }
      };
    } catch (e) { /* sin base de datos: se sigue sin guardar */ }
  }

  /** Vuelve a poner cada tablero en su pestaña, en el orden en que estaban. */
  async function restaurarAutoguardados(regs) {
    const orden = regs.slice().sort((a, b) => (slotDeAuto(a.id) || 9) - (slotDeAuto(b.id) || 9));
    const reciente = regs.reduce((m, r) => ((r.fecha || 0) > (m.fecha || 0) ? r : m), regs[0]);
    let dondeSeguia = null;
    for (const r of orden) {
      let t = tableroActivo;
      if (datosDe(t).paginas.length) {
        t = crearTablero();
        if (!t) break;
        activarTablero(t.id, { interno: true });
      }
      // conserva su número de autoguardado, para no dejar uno huérfano en la base
      const quiere = slotDeAuto(r.id);
      if (quiere && !tableros.some((x) => x !== t && x.slot === quiere)) t.slot = quiere;
      await restaurarExpediente(r);
      if (r === reciente) dondeSeguia = t;
    }
    if (dondeSeguia && dondeSeguia !== tableroActivo) activarTablero(dondeSeguia.id, { interno: true });
    // el autoguardado de la versión de un solo tablero, ya recogido
    try { if (regs.some((r) => r.id === '__auto')) await G.bd.borrarExpediente('__auto'); } catch (e) {}
  }

  /* ---------------- lista de expedientes guardados ---------------- */
  async function pintarGuardados() {
    const lista = $('#listaGuardados');
    if (!lista) return;
    let regs = [];
    try { regs = await G.bd.listarExpedientes(); }
    catch (e) {
      lista.innerHTML = '';
      $('#espacioUsado').textContent = 'Este navegador no permite guardar expedientes.';
      return;
    }
    $('#contGuardados').textContent = regs.length;
    pintarMarcaRiel('#marcaGuardados', regs.length);

    // el buscador solo asoma cuando ya hay unos cuantos y estorba buscarlos a ojo
    const buscador = $('#buscarGuardados');
    if (buscador) buscador.hidden = regs.length < 5;
    const filtro = (buscador && !buscador.hidden ? buscador.value : '').trim().toLowerCase();
    const visibles = filtro
      ? regs.filter((r) => String(r.nombre || '').toLowerCase().includes(filtro))
      : regs;

    lista.innerHTML = '';
    visibles.forEach((r) => {
      const li = document.createElement('li');
      li.dataset.id = r.id;
      const datos = document.createElement('div');
      datos.className = 'guardado-datos';
      const nom = document.createElement('strong');
      nom.textContent = nombreCorto(r.nombre);
      nom.title = r.nombre;
      const meta = document.createElement('span');
      meta.textContent = `${r.numPaginas} pág. · ${fechaLista(r.fecha)}`;
      meta.title = fechaCorta(r.fecha);
      datos.append(nom, meta);

      const abrir = document.createElement('button');
      abrir.className = 'btn btn-mini';
      abrir.textContent = 'Abrir';
      abrir.className += ' guardado-abrir';
      abrir.addEventListener('click', () => abrirEnTablero(r));

      const renombrar = document.createElement('button');
      renombrar.className = 'btn btn-mini';
      renombrar.innerHTML = icono('editar');
      renombrar.setAttribute('aria-label', 'Cambiar el nombre');
      renombrar.title = 'Cambiarle el nombre a este expediente guardado';
      renombrar.addEventListener('click', async () => {
        const nuevo = await G.pedirTexto({
          titulo: 'Cambiar el nombre',
          mensaje: 'Solo cambia cómo se llama en la lista. No se toca ninguna hoja.',
          valor: r.nombre,
        });
        if (!nuevo || nuevo === r.nombre) return;
        await G.bd.renombrarExpediente(r.id, nuevo);
        // si está abierto en algún tablero, el taller y el nombre de salida lo siguen
        renombrarEnTableros(r.id, nuevo);
        await pintarGuardados();
        G.aviso(`Ahora se llama «${nuevo}».`, 'ok');
      });

      const borrar = document.createElement('button');
      borrar.className = 'btn btn-mini btn-peligro-suave';
      borrar.innerHTML = icono('cerrar');
      borrar.setAttribute('aria-label', 'Borrar');
      borrar.title = 'Borrar este expediente guardado';
      borrar.addEventListener('click', async () => {
        const sigue = await G.confirmar({
          titulo: 'Borrar el expediente guardado',
          mensaje: `Se borra «${r.nombre}» de la lista. Esto no toca los PDF de tu computadora.`,
          aceptar: 'Borrar',
          peligro: true,
        });
        if (!sigue) return;
        await G.bd.borrarExpediente(r.id);
        olvidarEnTableros(r.id);
        pintarGuardados();
      });

      // Las acciones van en su propia línea: apretadas al lado del nombre le
      // dejaban 125 px de 300, y dos expedientes distintos se leían igual.
      const acciones = document.createElement('div');
      acciones.className = 'guardado-acciones';
      acciones.append(abrir, renombrar, borrar);
      li.append(datos, acciones);
      lista.appendChild(li);
    });
    if (!visibles.length) {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = regs.length
        ? `Ninguno de los ${regs.length} guardados dice «${filtro}».`
        : 'Todavía no has guardado ningún expediente.';
      lista.appendChild(p);
    }
    marcarGuardadosAbiertos();
    const esp = await G.bd.espacio();
    $('#espacioUsado').textContent = esp && esp.total
      ? `Ocupado: ${(esp.usado / 1048576).toFixed(1)} MB de ${(esp.total / 1048576 / 1024).toFixed(1)} GB disponibles.`
      : '';
  }

  /* ---------------- nombre del archivo de salida ---------------- */
  // El nombre del PDF terminado sigue solo al documento que se está
  // trabajando. En cuanto lo escribes tú, manda el tuyo y deja de moverse.
  let nombreManual = false;

  /** Cómo se llama lo que hay ahora mismo en el taller. */
  function nombreDelTrabajo() {
    const escribiendo = ($('#guardarNombre').value || '').trim();
    if (escribiendo) return escribiendo;                       // lo que va a guardar
    if (expedienteAbierto && expedienteAbierto.nombre) return expedienteAbierto.nombre;
    // Lo que se adjunta va encima, así que el documento base es el de abajo:
    // el que lleva el folio 1 y da nombre al expediente.
    const base = E.paginas[E.paginas.length - 1];
    const fuente = base && E.fuentes.get(base.fuenteId);
    return fuente ? fuente.nombre : '';
  }

  function sincronizarNombreSalida() {
    const campo = $('#nombreSalida');
    if (!campo) return;
    if (!nombreManual) {
      const automatico = G.nombreSeguro(nombreDelTrabajo(), 'documento-unido');
      if (campo.value !== automatico) campo.value = automatico;
    }
    const nota = $('#nombreNotaTexto');
    const btn = $('#btnNombreAuto');
    if (!nota || !btn) return;
    nota.textContent = nombreManual
      ? 'Nombre puesto por ti.'
      : 'Toma el nombre del documento que estás trabajando.';
    btn.hidden = !nombreManual;
  }

  function volverANombreAutomatico() {
    nombreManual = false;
    sincronizarNombreSalida();
    G.aviso('El nombre vuelve a seguir al documento que estás trabajando.', 'ok');
  }

  async function guardarComoNuevo() {
    if (!E.paginas.length) { G.aviso('No hay nada que guardar todavía.', 'error'); return; }
    const nombre = ($('#guardarNombre').value || '').trim()
      || G.nombreSeguro($('#nombreSalida').value, 'Expediente');
    G.cargando(true, 'Guardando el expediente…');
    try {
      const id = 'exp-' + Date.now().toString(36);
      const { registro, fuentes } = serializar(id, nombre);
      await G.bd.guardarExpediente(registro, fuentes);
      expedienteAbierto = { id, nombre };
      marcarGuardado();
      actualizarEstadoGuardado();
      $('#guardarNombre').value = '';
      sincronizarNombreSalida();
      await pintarGuardados();
      G.aviso(`Expediente «${nombre}» guardado.`, 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo guardar: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  async function actualizarGuardado() {
    if (!expedienteAbierto) return;
    if (!E.paginas.length) { G.aviso('No hay nada que guardar todavía.', 'error'); return; }
    if (tableroActivo.desfasado) {
      const sigue = await G.confirmar({
        titulo: 'Se guardó desde otra ventana',
        mensaje: `«${expedienteAbierto.nombre}» cambió en otra ventana de Pdflash después de que lo abrieras aquí. `
          + 'Si lo actualizas ahora, se pisa ese cambio.',
        aceptar: 'Actualizar igual',
        peligro: true,
      });
      if (!sigue) return;
    }
    G.cargando(true, 'Actualizando el expediente…');
    try {
      const { registro, fuentes } = serializar(expedienteAbierto.id, expedienteAbierto.nombre);
      await G.bd.guardarExpediente(registro, fuentes);
      marcarGuardado();
      await pintarGuardados();
      G.aviso(`«${expedienteAbierto.nombre}» actualizado: no se pierde lo que acabas de firmar o adjuntar.`, 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo actualizar: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  function dejarDeEditar() {
    expedienteAbierto = null;
    tableroActivo.firmaGuardada = null;
    pintarTableros();
    marcarGuardadosAbiertos();
    actualizarEstadoGuardado();
    sincronizarNombreSalida();
  }

  /**
   * Vacía el taller para armar otro expediente, sin cerrar el navegador.
   * No borra el historial de deshacer por capricho: al soltar también los
   * PDF de origen, una vuelta atrás dejaría páginas apuntando a archivos
   * que ya no están en memoria.
   */
  async function empezarDeCero() {
    if (E.paginas.length) {
      const mensaje = expedienteAbierto
        ? `«${expedienteAbierto.nombre}» queda guardado y lo puedes volver a abrir cuando quieras.`
        : 'Lo que tienes armado se perderá si no lo has guardado antes.';
      const sigue = await G.confirmar({
        titulo: 'Empezar otro expediente',
        mensaje: 'Se vacía el taller. ' + mensaje,
        aceptar: 'Vaciar el taller',
        peligro: !expedienteAbierto,
      });
      if (!sigue) return;
    }
    E.paginas = [];
    E.seleccion = new Set();
    E.paquetes = new Map();
    paqueteAbierto = null;
    vista = 'hojas';
    E.ancla = null;
    $('#buscarTexto').value = '';
    busqueda.texto = '';
    busqueda.turno++;
    historial.atras = [];
    historial.adelante = [];
    // los PDF de origen que ningún otro tablero usa se sueltan de la memoria
    soltarFuentesSinUso();
    expedienteAbierto = null;
    tableroActivo.firmaGuardada = null;
    nombreManual = false;
    $('#nombreSalida').value = 'documento-unido';
    $('#metaTitulo').value = '';
    $('#metaAutor').value = '';
    $('#guardarNombre').value = '';
    $('#divRangos').value = '';
    $('#restaurar').hidden = true;
    // la pantalla se refresca ya; el borrado del autoguardado va a disco y no
    // debe dejar la insignia "Editando…" visible mientras tanto
    pintar();
    G.aviso('Taller vacío. Ya puedes armar otro expediente.', 'ok');
    // si no se borra, al volver a entrar ofrecería recuperar lo descartado
    try { await G.bd.borrarExpediente(claveAuto(tableroActivo)); } catch (e) {}
  }

  /** Saca una sola hoja a su propio PDF, sin tocar el expediente. */
  async function descargarHoja(pagina) {
    G.cargando(true, 'Armando la hoja…');
    try {
      // se numera por su sitio en el expediente, para reconocerla después
      const n = String(E.paginas.indexOf(pagina) + 1).padStart(2, '0');
      const bytes = await G.construirPdf([pagina], opcionesSalida([pagina]));
      const base = G.nombreSeguro($('#nombreSalida').value, 'documento');
      // a Descargas a propósito: la carpeta vinculada es para el expediente
      // terminado, no para una hoja que se saca de paso
      const r = await G.guardarArchivo(
        bytes, `${base} - hoja ${n}.pdf`, 'application/pdf', { aDescargas: true });
      G.aviso(r.estado === 'cancelado'
        ? 'Descarga cancelada.'
        : `Hoja ${n} descargada (va a Descargas, no a la carpeta vinculada).`,
        r.estado === 'cancelado' ? '' : 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo descargar la hoja: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  /** Abre en grande, una al lado de otra, solo las hojas marcadas. */
  function compararMarcadas() {
    const objs = hojasVisibles().filter((p) => E.seleccion.has(p.uid));
    if (objs.length < 2) {
      G.aviso('Marca al menos dos hojas para compararlas una al lado de otra.', 'error');
      return;
    }
    lector.columnas = Math.min(4, objs.length);
    $('#lectorColumnas').value = String(lector.columnas);
    // comparando, el 100 % es «que las columnas llenen el ancho»
    $('#lectorZoom').value = '100';
    abrirLector(objs[0], { soloMarcadas: true });
    G.aviso(`Comparando ${objs.length} hoja(s). Cambia las columnas o el tamaño arriba.`, 'ok');
  }

  /** Baja las hojas marcadas en un solo PDF, siempre a Descargas. */
  async function descargarSeleccion() {
    const objs = seleccionadas();
    if (!objs.length) {
      G.aviso('Marca primero las hojas que quieres bajar.', 'error');
      return;
    }
    G.cargando(true, 'Armando el PDF…');
    try {
      const bytes = await G.construirPdf(objs, opcionesSalida(objs));
      const base = G.nombreSeguro($('#nombreSalida').value, 'documento');
      // a Descargas a propósito, como la hoja suelta: la carpeta vinculada es
      // para el expediente terminado, no para un recorte que se saca de paso
      const r = await G.guardarArchivo(
        bytes, `${base} - seleccion (${objs.length} hojas).pdf`, 'application/pdf',
        { aDescargas: true });
      G.aviso(r.estado === 'cancelado'
        ? 'Descarga cancelada.'
        : `${objs.length} hoja(s) descargadas en un PDF (van a Descargas).`,
        r.estado === 'cancelado' ? '' : 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo descargar la selección: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  /* ---------------- editor externo ---------------- */
  const EDITOR_POR_DEFECTO = 'https://pdfguru.com/app/account';
  const CLAVE_EDITOR = 'grapa.editor.url';

  function urlEditor() {
    const escrita = ($('#editorUrl').value || '').trim();
    if (escrita) return escrita;
    try { return localStorage.getItem(CLAVE_EDITOR) || EDITOR_POR_DEFECTO; } catch (e) {}
    return EDITOR_POR_DEFECTO;
  }

  /** El botón dice a dónde lleva, sacándolo de la propia dirección. */
  function pintarEditorExterno() {
    const btn = $('#btnEditorExterno');
    if (!btn) return;
    let donde = '';
    try { donde = new URL(urlEditor()).hostname.replace(/^www\./, ''); } catch (e) {}
    // No puede llamarse «Editar…»: al lado está «Editar texto», que es otra
    // cosa y no saca el documento del equipo. Confundirlos sale caro, porque
    // este sí lo descarga para que lo subas a una web ajena.
    btn.innerHTML = icono('externo') + (donde ? ' Subir a ' + G.escapaHtml(donde) : ' Subir a otra web');
    btn.title = donde
      ? `Guarda el PDF en Descargas y abre ${donde} en otra pestaña para que lo subas ahí. `
        + 'Lo que subas sale de tu computadora.'
      : 'Escribe primero la dirección de esa web en «Archivo de salida»';
  }

  /**
   * Guarda lo que se está viendo y abre el editor externo. La pestaña se abre
   * antes de armar el PDF: si se abriera después, el navegador la tomaría por
   * una ventana emergente no pedida y la bloquearía.
   */
  async function editarFuera() {
    const objs = E.seleccion.size ? seleccionadas() : hojasVisibles();
    if (!objs.length) { G.aviso('Primero abre un PDF.', 'error'); return; }
    const destino = urlEditor();
    let bien = true;
    try { new URL(destino); } catch (e) { bien = false; }
    if (!bien) {
      G.aviso('La dirección del editor no es válida. Revísala en «Archivo de salida».', 'error');
      return;
    }
    window.open(destino, '_blank', 'noopener,noreferrer');
    G.cargando(true, 'Armando el PDF para editar…');
    try {
      const bytes = await G.construirPdf(objs, opcionesSalida(objs));
      const base = G.nombreSeguro($('#nombreSalida').value, 'documento');
      // a Descargas, como la hoja suelta: es un archivo de paso para subirlo
      // a otro sitio, no tiene por qué acabar en la carpeta del expediente
      const r = await G.guardarArchivo(
        bytes, `${base} - para editar.pdf`, 'application/pdf', { aDescargas: true });
      G.aviso(r.estado === 'cancelado'
        ? 'Se abrió el editor, pero no se guardó el PDF.'
        : `«${base} - para editar.pdf» está en Descargas (${objs.length} hoja(s)). `
          + 'Arrástralo en la pestaña que se abrió.', r.estado === 'cancelado' ? '' : 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo armar el PDF: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  /* ---------------- capturas ----------------
     Marcar un trozo de una hoja y llevárselo como imagen, para pegarlo en
     un correo, un informe o donde haga falta. La captura NO se saca del
     lienzo que se está viendo —que está al tamaño de la pantalla y saldría
     borroso al pegarlo— sino de un dibujo nuevo a alta resolución, y encima
     se le pintan los sellos que lleve la hoja, para que salga tal como se
     ve.                                                                   */
  const ANCHO_CAPTURA = 2400;
  let capturando = false;
  let arrastreCaptura = null;

  function pintarBotonCaptura() {
    const b = $('#lectorCapturar');
    if (b) b.classList.toggle('activo', capturando);
    document.body.classList.toggle('capturando', capturando);
  }

  function alternarCaptura(si) {
    capturando = si == null ? !capturando : si;
    quitarMarcoCaptura();
    pintarBotonCaptura();
    if (capturando) G.aviso('Arrastra sobre la hoja para marcar el trozo que quieres.', '');
  }

  function quitarMarcoCaptura() {
    $$('.captura-marco').forEach((m) => m.remove());
    arrastreCaptura = null;
  }

  /** Dibuja los sellos de la hoja sobre la captura, como se ven en pantalla. */
  function dibujarSellosEn(ctx, pagina, W, H) {
    const vis = visDe(pagina);
    const k = W / vis.w;
    const pendientes = [];
    pagina.sellos.forEach((s) => {
      ctx.save();
      ctx.globalAlpha = s.opacidad == null ? 1 : s.opacidad;
      if (s.rol === 'firma') {
        const firma = G.firmaPorId(s.firmaId);
        if (!firma) { ctx.restore(); return; }
        const an = s.fw * W, al = an * (firma.alto / firma.ancho);
        const x = s.fx * W, y = s.fy * H;
        const img = new window.Image();
        pendientes.push(new Promise((listo) => {
          img.onload = () => {
            ctx.save();
            ctx.globalAlpha = s.opacidad == null ? 1 : s.opacidad;
            ctx.translate(x, y + al);
            if (s.giro) ctx.rotate((-s.giro * Math.PI) / 180);
            ctx.drawImage(img, 0, -al, an, al);
            ctx.restore();
            listo();
          };
          img.onerror = () => listo();
          img.src = firma.dataUrl;
        }));
      } else {
        const texto = s.rol === 'folio'
          ? String(s.plantilla || '{n}')
              .replace(/\{n\}/g, String(folios.get(pagina.uid) != null ? folios.get(pagina.uid) : ''))
              .replace(/\{t\}/g, String(totalFolios))
          : String(s.texto || '');
        const margen = G.mm(s.margen == null ? 12 : s.margen);
        const pt = G.puntoPorCodigo(s.pos || 'ad', vis, margen);
        const tam = Math.max(4, (s.tam || 11) * k);
        ctx.font = tam + 'px Helvetica, Arial, sans-serif';
        ctx.fillStyle = s.color || '#111';
        ctx.textAlign = pt.alineaH === 'c' ? 'center' : pt.alineaH === 'd' ? 'right' : 'left';
        ctx.textBaseline = pt.alineaV === 'c' ? 'middle' : pt.alineaV === 'b' ? 'bottom' : 'top';
        ctx.translate((pt.x / vis.w) * W, (pt.y / vis.h) * H);
        if (s.giro) ctx.rotate((-s.giro * Math.PI) / 180);
        ctx.fillText(texto, 0, 0);
      }
      ctx.restore();
    });
    return Promise.all(pendientes);
  }

  /** Saca el trozo marcado, en fracciones de la hoja, como un lienzo aparte. */
  async function sacarCaptura(pagina, f) {
    const grande = await G.renderGrande(pagina, ANCHO_CAPTURA);
    const ctx0 = grande.getContext('2d');
    await dibujarSellosEn(ctx0, pagina, grande.width, grande.height);
    const x = Math.round(f.x * grande.width), y = Math.round(f.y * grande.height);
    const an = Math.max(1, Math.round(f.an * grande.width));
    const al = Math.max(1, Math.round(f.al * grande.height));
    const trozo = document.createElement('canvas');
    trozo.width = an; trozo.height = al;
    trozo.getContext('2d').drawImage(grande, x, y, an, al, 0, 0, an, al);
    return trozo;
  }

  async function terminarCaptura(pagina, f) {
    if (f.an < 0.004 || f.al < 0.004) { quitarMarcoCaptura(); return; }
    G.cargando(true, 'Preparando la captura…');
    try {
      const trozo = await sacarCaptura(pagina, f);
      const blob = await new Promise((r) => trozo.toBlob(r, 'image/png'));
      quitarMarcoCaptura();
      alternarCaptura(false);
      abrirCaptura(blob, trozo.width, trozo.height);
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo hacer la captura: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  function abrirCaptura(blob, an, al) {
    const url = URL.createObjectURL(blob);
    $('#capturaPrevia').src = url;
    $('#capturaMedidas').textContent = an + ' × ' + al + ' px · ' + enMb(blob.size);
    $('#modalCaptura').hidden = false;
    $('#modalCaptura').dataset.url = url;
    $('#btnCapturaCopiar').onclick = async () => {
      try {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        G.aviso('Copiado. Pégalo donde quieras con Ctrl+V.', 'ok');
        cerrarCaptura();
      } catch (e) {
        // sin permiso de portapapeles: queda la descarga, que siempre funciona
        G.aviso('El navegador no dejó copiar. Usa «Descargar».', 'error');
      }
    };
    $('#btnCapturaDescargar').onclick = async () => {
      const base = G.nombreSeguro($('#nombreSalida').value, 'recorte');
      await G.guardarArchivo(new Uint8Array(await blob.arrayBuffer()),
        base + ' - captura.png', 'image/png', { aDescargas: true });
      G.aviso('La captura está en Descargas.', 'ok');
      cerrarCaptura();
    };
  }

  function cerrarCaptura() {
    const m = $('#modalCaptura');
    if (m.dataset.url) { URL.revokeObjectURL(m.dataset.url); delete m.dataset.url; }
    m.hidden = true;
  }

  function conectarCaptura() {
    const zona = $('#lectorHojas');
    zona.addEventListener('mousedown', (ev) => {
      if (!capturando || ev.button !== 0) return;
      const hoja = ev.target.closest('.hoja');
      if (!hoja) return;
      ev.preventDefault();
      const caja = hoja.getBoundingClientRect();
      const marco = document.createElement('div');
      marco.className = 'captura-marco';
      hoja.appendChild(marco);
      arrastreCaptura = { hoja, caja, x0: ev.clientX, y0: ev.clientY, marco };
    });
    window.addEventListener('mousemove', (ev) => {
      const a = arrastreCaptura;
      if (!a) return;
      const x = Math.min(Math.max(ev.clientX, a.caja.left), a.caja.right);
      const y = Math.min(Math.max(ev.clientY, a.caja.top), a.caja.bottom);
      const izq = Math.min(a.x0, x) - a.caja.left, arr = Math.min(a.y0, y) - a.caja.top;
      a.marco.style.left = izq + 'px';
      a.marco.style.top = arr + 'px';
      a.marco.style.width = Math.abs(x - a.x0) + 'px';
      a.marco.style.height = Math.abs(y - a.y0) + 'px';
    });
    window.addEventListener('mouseup', (ev) => {
      const a = arrastreCaptura;
      if (!a) return;
      arrastreCaptura = null;
      const x = Math.min(Math.max(ev.clientX, a.caja.left), a.caja.right);
      const y = Math.min(Math.max(ev.clientY, a.caja.top), a.caja.bottom);
      const f = {
        x: (Math.min(a.x0, x) - a.caja.left) / a.caja.width,
        y: (Math.min(a.y0, y) - a.caja.top) / a.caja.height,
        an: Math.abs(x - a.x0) / a.caja.width,
        al: Math.abs(y - a.y0) / a.caja.height,
      };
      const pagina = hojasLector()[Number(a.hoja.dataset.indice)];
      if (pagina) terminarCaptura(pagina, f);
      else quitarMarcoCaptura();
    });
  }

  /* ---------------- editor de texto (Pdflash Editor) ----------------
     Pdflash no lleva el motor de edición dentro: abre Pdflash Editor en otra
     pestaña y le pasa el documento en memoria. Por eso siguen siendo dos
     programas independientes, y Pdflash no hereda su licencia.            */
  const EDITOR_AL_LADO = 'GrapaEditor.html';
  const EDITOR_PUBLICADO = 'https://renzomoran9.github.io/HERRAMIENTA-PDF/';
  const CLAVE_EDITOR_TEXTO = 'grapa.editor.texto';

  function editorConfigurado() {
    const campo = $('#editorTextoUrl');
    const escrita = ((campo && campo.value) || '').trim();
    if (escrita) return escrita;
    try { return (localStorage.getItem(CLAVE_EDITOR_TEXTO) || '').trim(); } catch (e) {}
    return '';
  }

  /**
   * Dónde está el editor. Abierta desde el disco, se busca el archivo suelto
   * al lado, que es lo normal; servida desde la web, se comprueba si está al
   * lado y, si no, se va al editor publicado. Antes se iba siempre al de al
   * lado y, desde GitHub Pages, eso dejaba una pestaña con un 404 y ninguna
   * explicación.
   */
  async function urlEditorTexto() {
    const escrita = editorConfigurado();
    if (escrita) return escrita;
    const alLado = new URL(EDITOR_AL_LADO, location.href).href;
    if (location.protocol === 'file:') return alLado;   // preguntar no funciona en file://
    try {
      const r = await fetch(alLado, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) return alLado;
    } catch (e) { /* no está, o no deja preguntar */ }
    return EDITOR_PUBLICADO;
  }

  const puente = { ventana: null, listo: false, arrancando: false, pendiente: null,
                   enviadas: null, reloj: null, tarea: null, tablero: null };

  function mandarAlEditor() {
    if (!puente.pendiente || !puente.listo) return;
    if (!puente.ventana || puente.ventana.closed) return;
    const carga = puente.pendiente;
    puente.pendiente = null;
    clearTimeout(puente.reloj);
    puente.ventana.postMessage(
      { grapa: 'documento', nombre: carga.nombre, bytes: carga.bytes, tarea: carga.tarea || null }, '*');
    G.aviso(carga.tarea === 'buscable'
      ? 'El editor está leyendo las hojas escaneadas. Al terminar vuelven solas aquí.'
      : 'Documento enviado al editor de texto.', 'ok');
  }

  /**
   * Abre el editor y le manda lo que se está viendo. La ventana se abre dentro
   * del propio clic: si se abriera al terminar de armar el PDF, el navegador la
   * tomaría por una ventana emergente no pedida y la bloquearía.
   */
  /**
   * Lo que viaja al editor va SIN comprimir y SIN sellos.
   *
   * Comprimir vuelve cada hoja una foto —con «Mínimo», también las de
   * texto—, y entonces al editor no le llega ni una letra que corregir;
   * además rasterizar un expediente entero tarda minutos con la pantalla
   * bloqueada. Y los folios y las firmas los vuelve a poner Pdflash al
   * guardar, así que si viajaran pegados a la hoja saldrían por duplicado:
   * se quedan aquí y se le devuelven a la hoja corregida cuando vuelve.
   */
  function paraElEditor(objs) {
    return objs.map((p) => Object.assign({}, p, { sellos: [] }));
  }

  async function editarTexto(cuales, opciones) {
    const tarea = (opciones && opciones.tarea) || null;
    const objs = (cuales && cuales.length) ? cuales
      : (E.seleccion.size ? seleccionadas() : hojasVisibles());
    if (!objs.length) { G.aviso('Primero abre un PDF.', 'error'); return; }

    // La ventana se abre en blanco dentro del propio clic y se la manda a su
    // destino después: así no la bloquea el navegador aunque averiguar dónde
    // está el editor lleve un momento.
    const v = window.open('', 'grapa-editor');
    if (!v) {
      G.aviso('El navegador bloqueó la ventana del editor. Permite las ventanas '
        + 'emergentes para Pdflash y vuelve a intentarlo.', 'error');
      return;
    }
    puente.ventana = v;
    puente.listo = false;
    puente.arrancando = false;
    puente.pendiente = null;
    clearTimeout(puente.reloj);

    const destino = await urlEditorTexto();
    if (v.closed) return;
    try { v.location.replace(destino); } catch (e) { v.location.href = destino; }

    puente.reloj = setTimeout(() => {
      if (puente.listo || puente.arrancando) return;
      // Ahí no hay ningún editor: la pestaña solo estorba, y un 404 no explica nada.
      try { if (puente.ventana && !puente.ventana.closed) puente.ventana.close(); } catch (e) {}
      G.aviso('Ahí no hay ningún editor, así que cerré la pestaña. Guarda '
        + '«GrapaEditor.html» en la misma carpeta que Pdflash, o escribe dónde está '
        + 'en «Archivo de salida» → «Editor de texto».', 'error');
    }, 12000);

    G.cargando(true, objs.length > 1
      ? `Preparando ${objs.length} hojas para el editor…`
      : 'Preparando la hoja para el editor…');
    try {
      const bytes = await G.construirPdf(paraElEditor(objs), { alProgresar: (t) => G.progreso(t) });
      const base = G.nombreSeguro($('#nombreSalida').value, 'documento');
      // para poder devolver la corrección a su sitio exacto
      puente.enviadas = objs.map((x) => x.uid);
      puente.tablero = tableroActivo.id;     // a ese tablero vuelve lo corregido, esté donde esté el usuario
      puente.tarea = tarea;
      puente.pendiente = { nombre: base + '.pdf', bytes, tarea };
      mandarAlEditor();
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo armar el PDF: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  /* Lo que llega de la otra pestaña. Solo se atiende a la ventana que abrimos
     nosotros: cualquier otra pestaña que mande mensajes se ignora. Comparar el
     origen no serviría, porque abriendo Pdflash desde el disco el origen es
     «null» para todos. */
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || typeof d !== 'object' || !d.grapa) return;
    if (!puente.ventana || ev.source !== puente.ventana) return;

    // El editor saluda nada más abrirse, antes de cargar su motor: así se
    // distingue «no hay editor ahí» de «lo hay, pero tarda en arrancar».
    if (d.grapa === 'editor-arrancando') { puente.arrancando = true; return; }

    if (d.grapa === 'editor-listo') { puente.listo = true; mandarAlEditor(); return; }

    if (d.grapa === 'documento-editado') {
      const bytes = d.bytes instanceof Uint8Array ? d.bytes : new Uint8Array(d.bytes || []);
      if (!bytes.length) { G.aviso('El editor devolvió un documento vacío.', 'error'); return; }
      const base = G.nombreSeguro(String(d.nombre || 'documento'), 'documento').replace(/\.pdf$/i, '');
      const cambios = Number(d.cambios) || 0, buscable = d.tarea === 'buscable' ? d : null;
      // Lo corregido vuelve al tablero que mandó las hojas. Si mientras tanto se
      // cambió de tablero, se va a aquel primero: no se mezcla con otro expediente.
      if (puente.tablero && tableroActivo.id !== puente.tablero) {
        const origen = tableros.find((x) => x.id === puente.tablero);
        if (!origen) {
          puente.enviadas = null;
          G.aviso('El tablero que mandó esas hojas ya se cerró: lo que volvió del editor no se aplicó.', 'error');
          return;
        }
        activarTablero(origen.id, { interno: true });
        G.aviso(`Lo corregido vuelve al tablero ${numeroDe(origen)}.`, 'ok');
      }
      recibirDelEditor(bytes, base, cambios, buscable);
    }
  });

  /* ---------------- hacer buscable lo escaneado ----------------
     Una hoja escaneada es una foto: el buscador no tiene letras en las que
     buscar. El editor, que es el que sabe leer fotos, lee todas de una vez
     y les pone el texto invisible encima; vuelven cada una a su sitio, con
     sus folios y firmas, y se ven igual que antes. */
  function pintarEscaneadas() {
    const caja = $('#buscarEscaneadas');
    const sin = E.paginas.length ? G.hojasSinTexto(E.paginas) : [];
    caja.hidden = !sin.length || !!busqueda.leyendo;
    if (caja.hidden) return;
    const n = sin.length;
    $('#buscarEscaneadasTexto').textContent = (n === 1
      ? 'Una hoja es escaneada: es una foto del papel y el buscador no puede leerla.'
      : `${n} hojas son escaneadas: son fotos del papel y el buscador no puede leerlas.`)
      + ' El editor puede leerlas y dejarlas buscables, sin cambiar cómo se ven.';
    $('#btnHacerBuscables').textContent = n === 1 ? 'Hacerla buscable' : `Hacer buscables las ${n} hojas`;
  }

  function hacerBuscables() {
    const sin = G.hojasSinTexto(E.paginas);
    if (!sin.length) { G.aviso('No hay hojas escaneadas por leer.', 'ok'); return; }
    editarTexto(sin, { tarea: 'buscable' });
  }

  function avisarBuscables(d) {
    const leidas = Number(d.leidas) || 0, vacias = Number(d.vacias) || 0;
    let t = leidas === 1 ? 'Listo: 1 hoja escaneada ya se puede buscar.'
      : `Listo: ${leidas} hojas escaneadas ya se pueden buscar.`;
    if (vacias) t += vacias === 1 ? ' En 1 no se reconoció ninguna palabra.' : ` En ${vacias} no se reconoció ninguna palabra.`;
    // lo que hizo el editor por su cuenta, que su pestaña ya no enseña
    const enderezadas = Number(d.enderezadas) || 0;
    if (enderezadas) t += enderezadas === 1 ? ' 1 hoja estaba torcida y se enderezó.' : ` ${enderezadas} hojas estaban torcidas y se enderezaron.`;
    const corr = d.corregidos && typeof d.corregidos === 'object' ? d.corregidos : {};
    const nCorr = Object.values(corr).reduce((a, n) => a + (Number(n) || 0), 0);
    if (nCorr) t += ` Se corrigieron ${nCorr} errores típicos de lectura (`
      + Object.entries(corr).map(([k, n]) => `${String(k).slice(0, 4)} ×${Number(n) || 0}`).join(', ') + ').';
    G.aviso(t, 'ok');
    // se vuelve a buscar lo que estuviera escrito, ahora también en esas hojas
    leerTextoQueFalta().then(() => {
      busqueda.turno++;
      recalcularBusqueda();
      ponerCapasHallazgos();
      pintarPanelBusqueda();
      if (lector.abierto) pintarLectorBusqueda();
    });
  }

  /**
   * Lo corregido vuelve a su sitio. Si vuelven tantas hojas como se
   * mandaron, cada una sustituye a la suya: misma posición, mismo paquete y
   * con los folios y las firmas que llevaba, que se habían quedado aquí
   * para no viajar pegados. Si el número no cuadra —porque en el editor se
   * hizo otra cosa— entra como documento aparte y no se toca nada.
   */
  async function recibirDelEditor(bytes, base, cuantos, buscable) {
    const enviadas = (puente.enviadas || [])
      .map((u) => E.paginas.find((x) => x.uid === u))
      .filter(Boolean);
    puente.enviadas = null;

    G.cargando(true, 'Recogiendo lo corregido…');
    try {
      await G.prepararMotor();
      const archivo = new File([bytes], base + ' (texto editado).pdf', { type: 'application/pdf' });
      const r = await G.cargarArchivos([archivo], (t) => G.progreso(t));
      if (!r.paginas.length) {
        (r.errores || []).forEach((e) => G.aviso(e, 'error'));
        G.aviso('No se pudo leer lo que devolvió el editor.', 'error');
        return;
      }
      marcar();
      r.fuentes.forEach((f) => E.fuentes.set(f.id, f));

      if (enviadas.length && enviadas.length === r.paginas.length) {
        enviadas.forEach((vieja, i) => {
          const nueva = r.paginas[i];
          nueva.paqueteId = vieja.paqueteId;
          nueva.giro = vieja.giro;
          nueva.sellos = vieja.sellos;     // los folios y firmas vuelven a la hoja
          nueva.corte = vieja.corte;
          const donde = E.paginas.indexOf(vieja);
          if (donde >= 0) E.paginas[donde] = nueva;
        });
        E.seleccion = new Set(r.paginas.map((x) => x.uid));
        pintar();
        if (buscable) { avisarBuscables(buscable); return; }
        G.aviso(cuantos
          ? `${cuantos} corrección(es) puesta(s) en su sitio.`
          : `${r.paginas.length} hoja(s) actualizada(s) en su sitio.`, 'ok');
        return;
      }

      const paq = nuevoPaquete(base + ' (texto editado)');
      r.paginas.forEach((x) => { x.paqueteId = paq.id; });
      E.paginas = r.paginas.concat(E.paginas);
      E.seleccion = new Set(r.paginas.map((x) => x.uid));
      if (!paqueteAbierto && paquetesEnOrden().length > 1) vista = 'paquetes';
      pintar();
      G.aviso(enviadas.length
        ? `Volvieron ${r.paginas.length} hoja(s) y se habían mandado ${enviadas.length}: `
          + 'entra como documento aparte para no descuadrar el expediente.'
        : 'Volvió del editor como documento nuevo.', 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo recoger lo corregido: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
  }

  /* ---------------- carpeta de destino ---------------- */
  function pintarCarpeta() {
    const est = $('#carpetaEstado'), nota = $('#carpetaNota');
    if (!G.carpeta.soportado()) {
      $('#carpetaBotones').hidden = true;
      est.textContent = 'Los PDF van a tu carpeta de Descargas.';
      est.classList.remove('vinculada');
      nota.textContent = 'Elegir una carpeta de destino solo funciona en Chrome o Edge, con Pdflash abierto desde tu computadora.';
      return;
    }
    const c = G.carpeta.actual();
    $('#btnDesvincularCarpeta').hidden = !c;
    $('#btnVincularCarpeta').textContent = c ? 'Cambiar carpeta' : 'Elegir carpeta';
    est.classList.toggle('vinculada', !!c);
    est.textContent = c ? c.name : 'Los PDF van a tu carpeta de Descargas.';
    nota.textContent = c
      ? 'Lo que guardes se escribe aquí directamente. Si ya hay un archivo con ese nombre, Pdflash añade (2) en vez de pisarlo.'
      : 'Si vinculas una carpeta, el PDF terminado se escribe ahí, sin pasar por Descargas.';
  }

  /* =========================================================
     LECTOR · las hojas en grande, una debajo de otra
     ========================================================= */
  const lector = { abierto: false, actual: 0, obs: null, soloMarcadas: false, columnas: 1, huella: '' };

  /**
   * Lo que recorre el lector: normalmente lo que se está viendo en el taller,
   * y en modo comparar solo las hojas marcadas.
   */
  function hojasLector() {
    if (!lector.soloMarcadas) return hojasVisibles();
    const marcadas = hojasVisibles().filter((p) => E.seleccion.has(p.uid));
    return marcadas.length ? marcadas : hojasVisibles();
  }

  function paginaActualLector() { return hojasLector()[lector.actual] || null; }

  /**
   * Lo que se ve en el lector: qué hojas, en qué orden, giradas cómo y con
   * qué firmas, sellos y folios. Si cambia, hay que volver a dibujarlo.
   */
  function huellaLector() {
    return hojasLector().map((p) => [p.uid, p.fuenteId, p.indice, p.giro, p.enderezo || 0,
      folios.get(p.uid), JSON.stringify(p.sellos)].join('|')).join('/') + '#' + totalFolios;
  }

  /**
   * El lector ya no tapa el panel: lo que se haga desde ahí (firmar, foliar,
   * sellar, girar, borrar las blancas…) tiene que verse en él enseguida,
   * sin cerrarlo y volverlo a abrir. Sigue en la misma hoja que se miraba.
   */
  function seguirLectorTrasPintar() {
    if (!lector.abierto || huellaLector() === lector.huella) return;
    const antes = $$('.hoja', $('#lectorHojas'))[lector.actual];
    const uid = antes && antes.dataset.uid;
    const i = hojasLector().findIndex((p) => p.uid === uid);
    refrescarLector(i >= 0 ? i : Math.min(lector.actual, hojasLector().length - 1));
  }

  /** Píxeles de dibujo por cada píxel de pantalla. Por debajo de 1 se ve borroso. */
  const TOPE_LIENZO = 3500;   // más allá de esto la memoria no compensa

  function anchoDeseado(hoja) {
    const css = hoja.clientWidth || 700;
    // 1.5 dibujando por cada píxel de pantalla: con 1 clavado el texto sale
    // correcto pero pastoso; con 1.5 se lee fino, y es lo que ya se veía bien
    const quiere = css * (window.devicePixelRatio || 1) * 1.5;
    return Math.max(700, Math.min(TOPE_LIENZO, Math.round(quiere)));
  }

  /** Dibuja la hoja del lector al tamaño al que se está viendo ahora mismo. */
  function pintarHojaLector(hoja, pagina) {
    hoja.dataset.pintada = '1';
    const quiere = anchoDeseado(hoja);
    hoja.dataset.ancho = String(quiere);
    return G.renderGrande(pagina, quiere).then((lienzo) => {
      if (hoja.dataset.pintada !== '1') return;
      const hueco = hoja.querySelector('.hoja-hueco');
      if (hueco) hueco.remove();
      const previo = hoja.querySelector('canvas');
      if (previo) previo.remove();
      const sellosPrevios = hoja.querySelector('.pag-sellos');
      if (sellosPrevios) sellosPrevios.remove();
      hoja.insertBefore(lienzo, hoja.firstChild);
      hoja.appendChild(nodoSellos(pagina, hoja.clientWidth));
    }).catch(() => {});
  }

  /**
   * Al mover el tamaño, la hoja se estiraba: el mismo dibujo de 700 px sobre
   * el doble de pantalla, y por eso se veía borrosa. Aquí se vuelve a dibujar
   * a la medida nueva, que es lo que la deja nítida de verdad.
   */
  let reloj = null;
  function renitidezLector() {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      if (!lector.abierto) return;
      $$('.hoja', $('#lectorHojas')).forEach((hoja) => {
        if (hoja.dataset.pintada !== '1') return;
        const tiene = Number(hoja.dataset.ancho) || 0;
        // un 2 % de margen: mover el deslizador no debe redibujar por nada
        if (anchoDeseado(hoja) <= tiene * 1.02) return;
        const pagina = E.paginas.find((p) => p.uid === hoja.dataset.uid);
        if (pagina) pintarHojaLector(hoja, pagina);
      });
    }, 260);
  }

  function construirLector() {
    const cont = $('#lectorHojas');
    cont.innerHTML = '';
    if (lector.obs) lector.obs.disconnect();
    lector.huella = huellaLector();

    lector.obs = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        const hoja = en.target;
        // La hoja se identifica por su uid, no por su posición: dentro de un
        // paquete la posición es la del paquete y buscarla en la lista global
        // dibujaba una página que no era la que se está mirando.
        const pagina = E.paginas.find((p) => p.uid === hoja.dataset.uid);
        if (!pagina) return;
        if (en.isIntersecting) {
          if (hoja.dataset.pintada === '1') return;
          pintarHojaLector(hoja, pagina);
        } else if (hoja.dataset.pintada === '1') {
          // se suelta la memoria de las hojas que quedaron lejos
          hoja.dataset.pintada = '0';
          hoja.dataset.ancho = '0';
          const c = hoja.querySelector('canvas');
          const sellos = hoja.querySelector('.pag-sellos');
          if (sellos) sellos.remove();
          if (c) {
            const hueco = document.createElement('div');
            hueco.className = 'hoja-hueco';
            hueco.style.aspectRatio = c.width + ' / ' + c.height;
            c.replaceWith(hueco);
          }
        }
      });
    }, { root: cont, rootMargin: '1400px 0px' });

    hojasLector().forEach((pagina, i) => {
      const vis = visDe(pagina);
      const fuente = E.fuentes.get(pagina.fuenteId);
      const hoja = document.createElement('div');
      hoja.className = 'hoja';
      hoja.dataset.indice = i;
      hoja.dataset.uid = pagina.uid;
      hoja.dataset.pintada = '0';

      const hueco = document.createElement('div');
      hueco.className = 'hoja-hueco';
      hueco.style.aspectRatio = vis.w + ' / ' + vis.h;
      hoja.appendChild(hueco);

      const num = document.createElement('span');
      num.className = 'hoja-num';
      num.textContent = 'Hoja ' + (i + 1);
      hoja.appendChild(num);

      if (fuente) {
        const org = document.createElement('span');
        org.className = 'hoja-origen';
        org.textContent = fuente.nombreCompleto;
        hoja.appendChild(org);
      }

      // el resaltado va desde ya, antes de dibujar la hoja: así se puede
      // saltar a una coincidencia de una hoja que todavía no se pintó
      const capa = nodoHallazgos(pagina);
      if (capa) hoja.appendChild(capa);

      hoja.addEventListener('click', () => {
        marcarHoja(i);
        // la hoja que se mira queda seleccionada: así lo que se haga desde
        // el panel o la barra de arriba va a ESA hoja. Comparando no, que ahí
        // lo marcado es justamente lo que se está comparando.
        if (!lector.soloMarcadas && !capturando) {
          E.seleccion = new Set([pagina.uid]);
          refrescarSeleccion();
        }
      });
      cont.appendChild(hoja);
      lector.obs.observe(hoja);
    });
    aplicarZoomLector();
    pintarLectorBusqueda();
  }

  function aplicarZoomLector() {
    const v = Number($('#lectorZoom').value) / 100;
    const cont = $('#lectorHojas');
    const cols = Math.max(1, Math.min(4, lector.columnas || 1));
    cont.classList.add('columnas');
    cont.style.setProperty('--lector-cols', cols);
    // el 100 % es «que quepan justo las columnas pedidas»; de ahí para arriba
    // se desplaza a los lados, que es lo que hace falta para leer de cerca
    const hueco = Math.max(240, (cont.clientWidth || window.innerWidth) - 32);
    const ancho = Math.round(((hueco - (cols - 1) * 26) / cols) * v);
    cont.style.setProperty('--hoja-ancho', Math.max(160, ancho) + 'px');
  }

  function marcarHoja(i) {
    const cuantas = hojasLector().length;
    lector.actual = Math.max(0, Math.min(cuantas - 1, i));
    $$('.hoja', $('#lectorHojas')).forEach((h) => {
      h.classList.toggle('actual', Number(h.dataset.indice) === lector.actual);
    });
    const pagina = paginaActualLector();
    const fuente = pagina ? E.fuentes.get(pagina.fuenteId) : null;
    $('#lectorTitulo').textContent = `Hoja ${lector.actual + 1} de ${cuantas}`;
    $('#lectorOrigen').textContent = fuente
      ? `${fuente.nombreCompleto} · página ${pagina.indice + 1}` : '';
  }

  function irAHoja(i, alInstante) {
    marcarHoja(i);
    const hoja = $$('.hoja', $('#lectorHojas'))[lector.actual];
    if (hoja) hoja.scrollIntoView({ behavior: alInstante ? 'instant' : 'smooth', block: 'start' });
  }

  /** Admite la página, su posición, o nada (y entonces la que esté marcada). */
  function abrirLector(donde, opciones) {
    lector.soloMarcadas = !!(opciones && opciones.soloMarcadas);
    const visibles = hojasLector();
    if (!visibles.length) { G.aviso('Primero abre un PDF.', 'error'); return; }
    let indice;
    if (donde && typeof donde === 'object') indice = visibles.indexOf(donde);
    else if (typeof donde === 'number') indice = donde;
    else {
      // Sin decirle cuál, la primera seleccionada. Antes usaba la última que
      // se hubiera mirado, que podía ser de otro rato y de otra hoja.
      const sel = visibles.findIndex((p) => E.seleccion.has(p.uid));
      indice = sel >= 0 ? sel : lector.actual;
    }
    if (!(indice >= 0)) indice = 0;
    lector.abierto = true;
    $('#lector').hidden = false;
    construirLector();
    irAHoja(indice, true);
    pintarSegVista();
  }

  function cerrarLector() {
    if (capturando) alternarCaptura(false);
    lector.abierto = false;
    lector.soloMarcadas = false;
    lector.columnas = 1;
    $('#lectorColumnas').value = '1';
    $('#lector').hidden = true;
    lector.huella = '';
    if (lector.obs) lector.obs.disconnect();
    $('#lectorHojas').innerHTML = '';
    pintarLectorBusqueda();
    pintarSegVista();
  }

  function refrescarLector(indice) {
    if (!lector.abierto) return;
    if (!hojasLector().length) { cerrarLector(); return; }
    // si ya se había redibujado al pintar el taller, no se hace dos veces
    if (huellaLector() !== lector.huella) construirLector();
    irAHoja(indice == null ? lector.actual : indice, true);
  }

  /** Sube o baja la hoja que se está viendo, y la sigue en la pantalla. */
  function moverHojaLector(delta) {
    const pagina = paginaActualLector();
    if (!pagina) return;
    const visibles = hojasVisibles();
    const idx = visibles.indexOf(pagina);
    const destino = idx + delta;
    if (destino < 0 || destino >= visibles.length) return;
    moverPosiciones([pagina], delta);
    // comparando, la hoja cambia de sitio en el expediente pero sigue siendo
    // la misma de la comparación: el hueco que se mira no cambia
    refrescarLector(lector.soloMarcadas ? lector.actual : destino);
  }

  function accionLector(fn) {
    const pagina = paginaActualLector();
    if (!pagina) return;
    marcar();
    fn(pagina);
    pintar();
    refrescarLector();
  }

  function seguirScrollLector() {
    const cont = $('#lectorHojas');
    let pendiente = false;
    cont.addEventListener('scroll', () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        const hojas = $$('.hoja', cont);
        const limite = cont.getBoundingClientRect().top + 80;
        let mejor = 0;
        if (lector.columnas > 1) {
          // en rejilla la fila entera empieza a la misma altura: la que cuenta
          // es la PRIMERA que todavía se ve, no la última de esa fila
          mejor = hojas.findIndex((h) => h.getBoundingClientRect().bottom > limite);
          if (mejor < 0) mejor = hojas.length - 1;
        } else {
          for (let i = 0; i < hojas.length; i++) {
            if (hojas[i].getBoundingClientRect().top <= limite) mejor = i; else break;
          }
        }
        if (mejor !== lector.actual) marcarHoja(mejor);
      });
    }, { passive: true });
  }

  /* ---------------- buscar en el expediente ----------------
     En qué hojas aparece una palabra y en qué sitio de cada una, sin salir
     del taller. El texto de cada hoja se lee una sola vez: buscar otra
     palabra, girar o mover hojas ya no vuelve a leer nada. */
  const busqueda = {
    texto: '',            // lo escrito, tal cual
    resultado: null,      // lo que devuelve G.buscarEnHojas
    porUid: new Map(),    // uid -> [{caja, n}] para pintar el resaltado
    actual: -1,           // la coincidencia a la que se saltó por última vez
    leyendo: null,        // {hechas, total} mientras se lee el texto
    turno: 0,             // para descartar una búsqueda que ya quedó vieja
    saltarAlLeer: false,  // se pulsó Enter antes de que terminara de leer
  };
  const MOSTRAR_HALLAZGOS = 200;
  const AYUDA_BUSCAR = 'Busca en el texto de todas las hojas. Da igual si escribes con tildes o mayúsculas.';

  const hayBusqueda = () => !!G.normalizarParaBuscar(busqueda.texto);
  const hallazgos = () => (busqueda.resultado ? busqueda.resultado.hallazgos : []);
  const hojasConHallazgos = () => (busqueda.resultado ? busqueda.resultado.porHoja : new Map());

  /** Recalcula con lo ya leído. Es barato: se hace en cada pintada. */
  function recalcularBusqueda() {
    busqueda.porUid = new Map();
    if (!hayBusqueda()) { busqueda.resultado = null; busqueda.actual = -1; return; }
    busqueda.resultado = G.buscarEnHojas(E.paginas, busqueda.texto);
    hallazgos().forEach((h, n) => {
      if (!busqueda.porUid.has(h.pagina.uid)) busqueda.porUid.set(h.pagina.uid, []);
      const lista = busqueda.porUid.get(h.pagina.uid);
      h.cajas.forEach((caja) => lista.push({ caja, n }));
    });
    if (busqueda.actual >= hallazgos().length) busqueda.actual = hallazgos().length - 1;
  }

  /** El resaltado de una hoja, girado como se ve la hoja. null si no hay nada. */
  function nodoHallazgos(pagina) {
    const lista = busqueda.porUid.get(pagina.uid);
    if (!lista || !lista.length) return null;
    const capa = document.createElement('div');
    capa.className = 'pag-hallazgos';
    // la hoja enderezada se dibuja girada esos grados: la palabra también
    if (pagina.enderezo) capa.style.transform = `rotate(${pagina.enderezo}deg)`;
    lista.forEach(({ caja, n }) => {
      const c = G.girarCaja(caja, pagina.giro);
      const m = document.createElement('mark');
      m.className = 'hallazgo' + (n === busqueda.actual ? ' actual' : '');
      m.dataset.n = n;
      m.style.left = c.x0 * 100 + '%';
      m.style.top = c.y0 * 100 + '%';
      m.style.width = (c.x1 - c.x0) * 100 + '%';
      m.style.height = (c.y1 - c.y0) * 100 + '%';
      capa.appendChild(m);
    });
    return capa;
  }

  /** Cuántas veces sale en un paquete, para enseñarlo en su tarjeta. */
  function nodoHallazgosPaquete(paginas) {
    const porHoja = hojasConHallazgos();
    const veces = paginas.reduce((n, p) => n + (porHoja.get(p.uid) || 0), 0);
    if (!veces) return null;
    const el = document.createElement('span');
    el.className = 'paquete-hallazgos';
    el.innerHTML = icono('lupa');
    el.append(' ' + veces);
    el.title = veces === 1 ? 'Aparece 1 vez en este paquete' : `Aparece ${veces} veces en este paquete`;
    return el;
  }

  /**
   * Pone o quita el resaltado en lo que ya está pintado, sin rehacer la
   * rejilla: rehacerla en cada letra que se escribe hacía parpadear todas
   * las miniaturas.
   */
  function ponerCapasHallazgos() {
    const porUid = new Map(E.paginas.map((p) => [p.uid, p]));
    const porHoja = hojasConHallazgos();
    const rejilla = $('#rejilla');
    rejilla.classList.toggle('con-hallazgos', porHoja.size > 0);
    $$('.pag', rejilla).forEach((el) => {
      const marco = el.querySelector('.pag-marco');
      if (!marco) return;
      if (el.classList.contains('paquete')) {
        const previo = marco.querySelector('.paquete-hallazgos');
        if (previo) previo.remove();
        const g = paquetesEnOrden().find((x) => x.paquete.id === el.dataset.paquete);
        const nodo = g ? nodoHallazgosPaquete(g.paginas) : null;
        if (nodo) marco.appendChild(nodo);
        el.classList.toggle('hallada', !!nodo);
        return;
      }
      const pagina = porUid.get(el.dataset.uid);
      const previo = marco.querySelector('.pag-hallazgos');
      if (previo) previo.remove();
      const capa = pagina ? nodoHallazgos(pagina) : null;
      if (capa) (marco.querySelector('.pag-sellos') || marco.querySelector('.mini')).after(capa);
      el.classList.toggle('hallada', !!capa);
    });
    $$('.hoja', $('#lectorHojas')).forEach((hoja) => {
      const previo = hoja.querySelector('.pag-hallazgos');
      if (previo) previo.remove();
      const pagina = porUid.get(hoja.dataset.uid);
      const capa = pagina ? nodoHallazgos(pagina) : null;
      if (capa) hoja.appendChild(capa);
    });
  }

  function marcarHallazgoActual() {
    $$('.hallazgo').forEach((m) => m.classList.toggle('actual', Number(m.dataset.n) === busqueda.actual));
    $$('.hallazgo-fila').forEach((b) => b.classList.toggle('actual', Number(b.dataset.n) === busqueda.actual));
  }

  const listaHojas = (nums) => nums.length === 1 ? 'la ' + nums[0]
    : 'las ' + nums.slice(0, -1).join(', ') + ' y ' + nums[nums.length - 1];

  function textoEstadoBusqueda() {
    if (busqueda.leyendo && (hayBusqueda() || document.activeElement === $('#buscarTexto'))) {
      const { hechas, total } = busqueda.leyendo;
      return `Leyendo el texto de las hojas… ${hechas} de ${total}`;
    }
    if (!hayBusqueda()) return AYUDA_BUSCAR;
    if (!E.paginas.length) return 'Primero abre un PDF.';
    const r = busqueda.resultado;
    if (!r) return 'Buscando…';
    const buscado = busqueda.texto.trim();
    let t;
    if (!r.total) {
      t = `«${buscado}» no aparece en ninguna hoja.`;
    } else {
      const hojas = r.porHoja.size;
      t = (r.total === 1 ? 'Aparece 1 vez' : `Aparece ${r.total} veces`)
        + (hojas === 1 ? ' en 1 hoja.' : ` en ${hojas} hojas.`);
      if (busqueda.actual >= 0) t = `${busqueda.actual + 1} de ${r.hallazgos.length} · ` + t;
    }
    const escaneadas = r.sinTexto.length;
    if (escaneadas) {
      if (escaneadas === E.paginas.length) {
        t += ' Todas las hojas son escaneadas: son fotos del papel y no llevan texto en el que buscar.';
      } else {
        const pos = new Map(E.paginas.map((p, i) => [p.uid, i + 1]));
        const nums = r.sinTexto.map((p) => pos.get(p.uid)).sort((a, b) => a - b);
        t += escaneadas <= 6
          ? ` ${escaneadas === 1 ? 'La hoja' : 'Las hojas'} ${listaHojas(nums).replace(/^la |^las /, '')} ${escaneadas === 1 ? 'es escaneada' : 'son escaneadas'}: ahí no se puede buscar todavía.`
          : ` ${escaneadas} hojas son escaneadas: ahí no se puede buscar todavía.`;
      }
    }
    return t;
  }

  function pintarListaHallazgos() {
    const ol = $('#listaHallazgos');
    ol.innerHTML = '';
    const hs = hallazgos();
    if (!hs.length) return;
    const pos = new Map(E.paginas.map((p, i) => [p.uid, i + 1]));
    hs.slice(0, MOSTRAR_HALLAZGOS).forEach((h, n) => {
      const li = document.createElement('li');
      li.className = 'hallazgo-li';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hallazgo-fila' + (n === busqueda.actual ? ' actual' : '');
      b.dataset.n = n;
      const cab = document.createElement('span');
      cab.className = 'hallazgo-hoja';
      const f = E.fuentes.get(h.pagina.fuenteId);
      const num = document.createElement('strong');
      num.textContent = 'Hoja ' + pos.get(h.pagina.uid);
      cab.appendChild(num);
      if (f) cab.append(' · ' + f.nombre);
      const txt = document.createElement('span');
      txt.className = 'hallazgo-texto';
      const m = document.createElement('mark');
      m.textContent = h.dentro;
      txt.append(h.antes, m, h.despues);
      b.append(cab, txt);
      b.addEventListener('click', () => irAHallazgo(n));
      const ver = document.createElement('button');
      ver.type = 'button';
      ver.className = 'btn btn-mini hallazgo-ver';
      ver.innerHTML = icono('lupa');
      ver.title = 'Ver esta hoja en grande';
      ver.setAttribute('aria-label', 'Ver la hoja ' + pos.get(h.pagina.uid) + ' en grande');
      ver.addEventListener('click', () => {
        busqueda.actual = n;
        abrirLector(h.pagina);
        centrarHallazgoEnLector();
      });
      li.append(b, ver);
      ol.appendChild(li);
    });
    if (hs.length > MOSTRAR_HALLAZGOS) {
      const li = document.createElement('li');
      li.className = 'nota hallazgos-mas';
      li.textContent = `Y ${hs.length - MOSTRAR_HALLAZGOS} más: sigue con ↓, o escribe algo más preciso.`;
      ol.appendChild(li);
    }
  }

  function pintarLectorBusqueda() {
    const caja = $('#lectorBusqueda');
    const hs = hallazgos();
    caja.hidden = !(lector.abierto && hs.length);
    if (caja.hidden) return;
    $('#lectorBuscarCuenta').textContent = `«${busqueda.texto.trim()}» · `
      + (busqueda.actual >= 0 ? `${busqueda.actual + 1} de ${hs.length}` : `${hs.length}`);
  }

  function pintarPanelBusqueda() {
    $('#buscarEstado').textContent = textoEstadoBusqueda();
    const hs = hallazgos();
    const porHoja = hojasConHallazgos();
    $('#buscarAnterior').disabled = !hs.length;
    $('#buscarSiguiente').disabled = !hs.length;
    const marcarBtn = $('#buscarMarcar');
    marcarBtn.hidden = !porHoja.size;
    marcarBtn.textContent = porHoja.size === 1 ? 'Marcar esta hoja' : `Marcar estas ${porHoja.size} hojas`;
    pintarListaHallazgos();
    pintarMarcaRiel('#marcaBuscar', porHoja.size);
    const chip = $('#chipBusqueda');
    chip.hidden = !hayBusqueda();
    if (!chip.hidden) {
      $('#chipBusquedaTexto').textContent = `«${busqueda.texto.trim()}» · `
        + (busqueda.leyendo || !busqueda.resultado ? 'buscando…'
          : porHoja.size === 1 ? 'en 1 hoja' : porHoja.size ? `en ${porHoja.size} hojas` : 'en ninguna');
    }
    pintarLectorBusqueda();
    pintarEscaneadas();
  }

  /** Lee el texto de las hojas que falten, una sola lectura a la vez. */
  let lecturaBusqueda = null;
  function leerTextoQueFalta() {
    if (lecturaBusqueda) return lecturaBusqueda;
    if (G.buscadorListo(E.paginas)) return Promise.resolve();
    lecturaBusqueda = (async () => {
      try {
        // mientras se lee pueden entrar hojas nuevas: se sigue hasta tenerlas todas
        while (!G.buscadorListo(E.paginas)) {
          await G.prepararBusqueda(E.paginas, (hechas, total) => {
            busqueda.leyendo = { hechas, total };
            $('#buscarEstado').textContent = textoEstadoBusqueda();
          });
        }
      } finally {
        busqueda.leyendo = null;
        lecturaBusqueda = null;
        pintarEscaneadas();
      }
    })();
    return lecturaBusqueda;
  }

  async function lanzarBusqueda() {
    busqueda.texto = $('#buscarTexto').value;
    busqueda.actual = -1;
    const turno = ++busqueda.turno;
    if (hayBusqueda() && !G.buscadorListo(E.paginas)) {
      // lo que ya está leído se enseña ya; el resto llega al terminar
      recalcularBusqueda();
      ponerCapasHallazgos();
      pintarPanelBusqueda();
      await leerTextoQueFalta();
      if (turno !== busqueda.turno) return;
    }
    recalcularBusqueda();
    ponerCapasHallazgos();
    pintarPanelBusqueda();
    if (busqueda.saltarAlLeer) { busqueda.saltarAlLeer = false; irAHallazgo(0); }
  }

  /** Después de pintar(): si entraron hojas nuevas, leerlas y volver a buscar. */
  function seguirBusquedaTrasPintar() {
    pintarPanelBusqueda();
    if (!hayBusqueda() || G.buscadorListo(E.paginas)) return;
    const turno = busqueda.turno;
    leerTextoQueFalta().then(() => {
      if (turno !== busqueda.turno) return;
      recalcularBusqueda();
      ponerCapasHallazgos();
      pintarPanelBusqueda();
    });
  }

  function limpiarBusqueda() {
    $('#buscarTexto').value = '';
    busqueda.texto = '';
    busqueda.turno++;
    busqueda.saltarAlLeer = false;
    recalcularBusqueda();
    ponerCapasHallazgos();
    pintarPanelBusqueda();
  }

  /**
   * En el lector, con la hoja ya arriba (irAHoja), trae la coincidencia a la
   * vista si quedó fuera. Solo se baja, nunca se sube: centrarla subiendo
   * dejaba a la vista el final de la hoja anterior, el lector la tomaba por
   * la actual, y «Texto» o «Girar» habrían caído en la hoja equivocada.
   */
  function centrarHallazgoEnLector() {
    const cont = $('#lectorHojas');
    const m = $(`#lectorHojas .hallazgo[data-n="${busqueda.actual}"]`);
    if (m) {
      const c = cont.getBoundingClientRect();
      const r = m.getBoundingClientRect();
      const abajo = r.bottom > c.bottom - 40;
      const deLado = r.left < c.left || r.right > c.right;
      if (abajo || deLado) {
        cont.scrollBy({
          top: abajo ? Math.max(0, r.top + r.height / 2 - (c.top + c.height / 2)) : 0,
          left: deLado ? r.left + r.width / 2 - (c.left + c.width / 2) : 0,
          behavior: 'instant',
        });
      }
    }
    marcarHallazgoActual();
    pintarLectorBusqueda();
  }

  /**
   * Salta a una coincidencia. Si la hoja no está a la vista —porque se ven
   * los paquetes cerrados, o otro paquete— se pasa a ver todas las hojas:
   * abrir el paquete obligaría a soltar lo que esté marcado.
   */
  function irAHallazgo(n) {
    const hs = hallazgos();
    if (!hs.length) return;
    busqueda.actual = ((n % hs.length) + hs.length) % hs.length;   // da la vuelta
    const h = hs[busqueda.actual];

    if (lector.abierto) {
      const i = hojasLector().indexOf(h.pagina);
      if (i >= 0) { irAHoja(i, true); centrarHallazgoEnLector(); }
      return;
    }

    const aLaVista = !(vista === 'paquetes' && !paqueteAbierto) && hojasVisibles().includes(h.pagina);
    if (!aLaVista) { vista = 'hojas'; paqueteAbierto = null; pintar(); }
    marcarHallazgoActual();
    $('#buscarEstado').textContent = textoEstadoBusqueda();
    const el = $(`#rejilla .pag[data-uid="${h.pagina.uid}"]`);
    if (el) {
      const marca = el.querySelector(`.hallazgo[data-n="${busqueda.actual}"]`);
      (marca || el).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      el.classList.remove('destello');
      void el.offsetWidth;
      el.classList.add('destello');
    }
    const fila = $(`#listaHallazgos .hallazgo-fila[data-n="${busqueda.actual}"]`);
    if (fila) fila.scrollIntoView({ block: 'nearest' });
  }

  /** En el lector con «solo marcadas», salta solo entre las que se ven. */
  function saltarHallazgoLector(delta) {
    const hs = hallazgos();
    if (!hs.length) return;
    const enLector = new Set(hojasLector().map((p) => p.uid));
    // sin ninguna elegida, «siguiente» es la primera y «anterior» la última
    const base = busqueda.actual >= 0 ? busqueda.actual : (delta > 0 ? -1 : 0);
    for (let k = 1; k <= hs.length; k++) {
      const n = ((base + delta * k) % hs.length + hs.length) % hs.length;
      if (enLector.has(hs[n].pagina.uid)) { irAHallazgo(n); return; }
    }
  }

  function abrirBuscador() {
    // el lector se queda abierto: la búsqueda salta dentro de él
    irASeccion('buscar');
    const campo = $('#buscarTexto');
    campo.focus();
    campo.select();
    leerTextoQueFalta();
  }

  function conectarBuscador() {
    const campo = $('#buscarTexto');
    let reloj = null;
    campo.addEventListener('input', () => {
      clearTimeout(reloj);
      reloj = setTimeout(lanzarBusqueda, 220);
    });
    // se empieza a leer en cuanto se va a buscar, no al escribir la primera letra
    campo.addEventListener('focus', () => {
      if (!E.paginas.length || G.buscadorListo(E.paginas)) return;
      leerTextoQueFalta().then(() => { $('#buscarEstado').textContent = textoEstadoBusqueda(); });
      $('#buscarEstado').textContent = textoEstadoBusqueda();
    });
    campo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (campo.value) { ev.preventDefault(); ev.stopPropagation(); limpiarBusqueda(); }
        return;
      }
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      // lo último escrito puede no haberse buscado aún
      if (campo.value !== busqueda.texto || busqueda.leyendo) {
        clearTimeout(reloj);
        busqueda.saltarAlLeer = true;
        if (campo.value !== busqueda.texto) lanzarBusqueda();
        return;
      }
      if (ev.shiftKey) irAHallazgo(busqueda.actual < 0 ? -1 : busqueda.actual - 1);
      else irAHallazgo(busqueda.actual + 1);
    });
    $('#buscarSiguiente').addEventListener('click', () => irAHallazgo(busqueda.actual + 1));
    $('#buscarAnterior').addEventListener('click', () => irAHallazgo(busqueda.actual < 0 ? -1 : busqueda.actual - 1));
    $('#chipBusqueda').addEventListener('click', limpiarBusqueda);
    $('#lectorBuscarSiguiente').addEventListener('click', () => saltarHallazgoLector(1));
    $('#lectorBuscarAnterior').addEventListener('click', () => saltarHallazgoLector(-1));
    $('#btnHacerBuscables').addEventListener('click', hacerBuscables);
    $('#buscarMarcar').addEventListener('click', () => {
      const uids = new Set(hojasConHallazgos().keys());
      if (!uids.size) return;
      // marcadas se tienen que ver: lo que se haga con ellas no puede caer
      // sobre hojas escondidas en un paquete cerrado
      vista = 'hojas';
      paqueteAbierto = null;
      E.seleccion = uids;
      pintar();
      G.aviso(uids.size === 1
        ? 'Hoja marcada. Ahora puedes bajarla, moverla o sacarla a un PDF aparte.'
        : `${uids.size} hojas marcadas. Ahora puedes bajarlas, moverlas o sacarlas a un PDF aparte.`);
    });
  }

  /* ---------------- revisar: hojas en blanco, de lado o torcidas ----------------
     «Revisar» mira cada hoja (revisar.js) y deja apuntado qué le pasa. Lo
     que se enseña se calcula siempre sobre cómo están ahora las hojas: si
     una se endereza, se gira a mano o se borra, su aviso desaparece solo, y
     con Ctrl+Z vuelve. Nada se toca hasta pulsar «Borrarlas» o
     «Enderezarlas», y solo lo que siga con la casilla puesta. */
  const revision = {
    hechas: new Map(),   // uid -> { r, giro, enderezo } · la hoja tal como se miró
    fuera: new Set(),    // 'b:uid' o 'g:uid' · lo que se quitó de la lista a mano
    corriendo: null,     // { cancelada } mientras revisa
    revisadas: 0,        // cuántas se miraron la última vez
  };

  /** Lo que queda por hacer, con las hojas como están ahora. */
  function avisosRevision() {
    const blancas = [], giradas = [];
    E.paginas.forEach((p, i) => {
      const h = revision.hechas.get(p.uid);
      if (!h) return;
      if (h.r.blanca) { blancas.push({ p, num: i + 1 }); return; }
      // si la hoja se giró o se enderezó después de mirarla, ya no vale
      if (G.norm(p.giro) !== h.giro || (p.enderezo || 0) !== h.enderezo) return;
      if (h.r.giro || h.r.torcida || h.r.deLadoSinSentido) giradas.push({ p, num: i + 1, r: h.r });
    });
    return { blancas, giradas };
  }

  function textoGirada(r) {
    const partes = [];
    if (r.deLadoSinSentido) partes.push('de lado: gírala a mano');
    else if (r.giro === 180) partes.push('de cabeza');
    else if (r.giro) partes.push('de lado');
    if (r.torcida) partes.push(`torcida ${String(Math.abs(r.torcida)).replace('.', ',')}°`);
    return partes.join(' y ');
  }

  /** La etiqueta de la miniatura. */
  function nodoRevision(pagina) {
    const h = revision.hechas.get(pagina.uid);
    if (!h) return null;
    let texto = '', clase = '';
    if (h.r.blanca) { texto = 'En blanco'; clase = ' blanca'; }
    else if (G.norm(pagina.giro) === h.giro && (pagina.enderezo || 0) === h.enderezo
             && (h.r.giro || h.r.torcida || h.r.deLadoSinSentido)) {
      texto = textoGirada(h.r);
      texto = texto.charAt(0).toUpperCase() + texto.slice(1);
    }
    if (!texto) return null;
    const el = document.createElement('span');
    el.className = 'pag-revision' + clase;
    el.textContent = texto;
    return el;
  }

  const activosEn = (lista, letra) => lista.filter((x) => !revision.fuera.has(letra + ':' + x.p.uid));

  function filaRevision(item, letra, texto, conCasilla) {
    const li = document.createElement('li');
    li.className = 'revisar-li';
    const fila = document.createElement('label');
    const clave = letra + ':' + item.p.uid;
    fila.className = 'revisar-fila' + (revision.fuera.has(clave) ? ' fuera' : '') + (conCasilla ? '' : ' solo-aviso');
    if (conCasilla) {
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = !revision.fuera.has(clave);
      c.title = 'Quítale la marca si esta hoja está bien';
      c.addEventListener('change', () => {
        if (c.checked) revision.fuera.delete(clave); else revision.fuera.add(clave);
        pintarRevision();
      });
      fila.appendChild(c);
    }
    const sp = document.createElement('span');
    const num = document.createElement('strong');
    num.textContent = 'Hoja ' + item.num;
    sp.append(num, ' · ' + texto);
    fila.appendChild(sp);
    const ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'btn btn-mini';
    ver.innerHTML = icono('lupa');
    ver.title = 'Ver esta hoja en grande';
    ver.setAttribute('aria-label', 'Ver la hoja ' + item.num + ' en grande');
    ver.addEventListener('click', () => abrirLector(item.p));
    li.append(fila, ver);
    return li;
  }

  function pintarRevision() {
    const { blancas, giradas } = avisosRevision();
    const boton = $('#btnRevisar');
    const estado = $('#revisarEstado');
    if (revision.corriendo) {
      boton.textContent = 'Detener';
    } else {
      const faltan = E.paginas.filter((p) => !revision.hechas.has(p.uid)).length;
      boton.textContent = !revision.hechas.size || faltan === E.paginas.length
        ? 'Revisar las hojas'
        : faltan ? `Revisar también las ${faltan} nuevas` : 'Volver a revisar';
      boton.disabled = !E.paginas.length;
      if (!revision.hechas.size) estado.textContent = '';
      else if (!blancas.length && !giradas.length) {
        estado.textContent = 'Todo en orden: ninguna hoja en blanco, de lado ni torcida.';
      } else estado.textContent = '';
    }

    const grupo = (id, lista, letra, titulo, texto, botones) => {
      $(id).hidden = !lista.length;
      $(id + 'Titulo').textContent = titulo;
      const ul = $(id + 'Lista');
      ul.innerHTML = '';
      lista.forEach((x) => ul.appendChild(filaRevision(x, letra, texto(x), !x.r || !x.r.deLadoSinSentido)));
      const n = activosEn(lista, letra).filter((x) => !x.r || !x.r.deLadoSinSentido).length;
      botones(n);
    };
    grupo('#revisarBlancas', blancas, 'b',
      blancas.length === 1 ? '1 hoja en blanco' : `${blancas.length} hojas en blanco`,
      () => 'en blanco', (n) => {
        $('#revisarBlancasBorrar').disabled = $('#revisarBlancasMarcar').disabled = !n;
        $('#revisarBlancasBorrar').textContent = n === 1 ? 'Borrar 1 hoja' : `Borrar ${n} hojas`;
      });
    grupo('#revisarGiradas', giradas, 'g',
      giradas.length === 1 ? '1 hoja por enderezar' : `${giradas.length} hojas por enderezar`,
      (x) => textoGirada(x.r), (n) => {
        $('#revisarGiradasEnderezar').disabled = $('#revisarGiradasMarcar').disabled = !n;
        $('#revisarGiradasEnderezar').textContent = n === 1 ? 'Enderezar 1 hoja' : `Enderezar ${n} hojas`;
      });
    pintarMarcaRiel('#marcaRevisar', blancas.length + giradas.length);
  }

  async function revisarHojas() {
    if (revision.corriendo) { revision.corriendo.cancelada = true; return; }
    if (!E.paginas.length) return;
    const tarea = (revision.corriendo = { cancelada: false });
    const estado = $('#revisarEstado');
    pintarRevision();
    const lista = E.paginas.slice();
    const t0 = performance.now();
    // De a dos: mientras se hacen las cuentas de una hoja, la siguiente se
    // va leyendo del archivo (eso lo hace pdf.js aparte). El resultado de
    // cada hoja es el mismo; solo se espera menos.
    const enCurso = new Map();
    const lanzar = (j) => {
      if (j >= lista.length || enCurso.has(j) || !E.paginas.includes(lista[j])) return;
      const q = lista[j];
      const foto = { giro: G.norm(q.giro), enderezo: q.enderezo || 0 };
      enCurso.set(j, G.revisarHoja(q).then((r) => ({ r, foto }), (e) => ({ e, foto })));
    };
    try {
      for (let i = 0; i < lista.length && !tarea.cancelada; i++) {
        const p = lista[i];
        lanzar(i); lanzar(i + 1);
        if (!enCurso.has(i)) continue;
        estado.textContent = `Revisando hoja ${i + 1} de ${lista.length}…`;
        const hecho = await enCurso.get(i);
        enCurso.delete(i);
        const foto = hecho.foto;
        if (hecho.e) { console.error(hecho.e); continue; }
        const r = hecho.r;
        revision.hechas.set(p.uid, Object.assign({ r }, foto));
        // una hoja revisada otra vez vuelve a salir aunque antes se quitara a mano
        revision.fuera.delete('b:' + p.uid);
        revision.fuera.delete('g:' + p.uid);
      }
    } finally {
      revision.corriendo = null;
    }
    pintar();
    if (tarea.cancelada) {
      estado.textContent = 'Revisión detenida. Lo que se alcanzó a revisar está abajo.';
      return;
    }
    const { blancas, giradas } = avisosRevision();
    if (blancas.length || giradas.length) {
      const partes = [];
      if (blancas.length) partes.push(blancas.length === 1 ? '1 en blanco' : `${blancas.length} en blanco`);
      if (giradas.length) partes.push(giradas.length === 1 ? '1 por enderezar' : `${giradas.length} por enderezar`);
      estado.textContent = `Revisadas ${lista.length} hojas en ${Math.max(1, Math.round((performance.now() - t0) / 1000))} s: `
        + partes.join(' y ') + '. Quita la marca a las que estén bien.';
    }
  }

  function marcarLasDeRevision(lista) {
    if (!lista.length) return;
    vista = 'hojas';
    paqueteAbierto = null;
    E.seleccion = new Set(lista.map((x) => x.p.uid));
    pintar();
    G.aviso(lista.length === 1 ? 'Hoja marcada.' : `${lista.length} hojas marcadas.`, 'ok');
  }

  function borrarBlancas() {
    const lista = activosEn(avisosRevision().blancas, 'b');
    if (!lista.length) return;
    marcar();
    eliminar(lista.map((x) => x.p));
    G.aviso((lista.length === 1 ? 'Se borró 1 hoja en blanco.' : `Se borraron ${lista.length} hojas en blanco.`)
      + ' Ctrl+Z la(s) devuelve.', 'ok');
  }

  function enderezarGiradas() {
    const lista = activosEn(avisosRevision().giradas, 'g').filter((x) => !x.r.deLadoSinSentido);
    if (!lista.length) return;
    marcar();
    lista.forEach(({ p, r }) => {
      p.giro = G.norm(p.giro + r.giro);
      const e = Math.round(((p.enderezo || 0) + r.torcida) * 100) / 100;
      if (Math.abs(e) < 0.05) delete p.enderezo; else p.enderezo = e;
    });
    pintar();
    G.aviso((lista.length === 1 ? '1 hoja enderezada.' : `${lista.length} hojas enderezadas.`)
      + ' Ctrl+Z lo deshace.', 'ok');
  }

  function conectarRevisar() {
    $('#btnRevisar').addEventListener('click', revisarHojas);
    $('#revisarBlancasMarcar').addEventListener('click', () => marcarLasDeRevision(activosEn(avisosRevision().blancas, 'b')));
    $('#revisarGiradasMarcar').addEventListener('click', () => marcarLasDeRevision(
      activosEn(avisosRevision().giradas, 'g').filter((x) => !x.r.deLadoSinSentido)));
    $('#revisarBlancasBorrar').addEventListener('click', borrarBlancas);
    $('#revisarGiradasEnderezar').addEventListener('click', enderezarGiradas);
  }

  /* ---------------- atajos de teclado ---------------- */
  document.addEventListener('keydown', (ev) => {
    const enCampo = /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
    const ctrl = ev.ctrlKey || ev.metaKey;

    if (ev.key === 'Escape') {
      // estando a media captura, Esc cancela la captura y no cierra el lector
      if (capturando && $$('.modal:not([hidden])').length === 0) { alternarCaptura(false); return; }
      // Esc en un campo del panel (el buscador, por ejemplo) es para ese
      // campo, no para cerrar las hojas en grande
      const enPanel = enCampo && !ev.target.closest('#lector');
      if (lector.abierto && !enPanel && $$('.modal:not([hidden])').length === 0) { cerrarLector(); return; }
      if (!$('#modalCaptura').hidden) cerrarCaptura();
      $$('.modal').forEach((m) => { m.hidden = true; });
      return;
    }
    if (lector.abierto && !enCampo && !$$('.modal:not([hidden])').length) {
      if (ev.altKey && ev.key === 'ArrowUp') { ev.preventDefault(); moverHojaLector(-1); return; }
      if (ev.altKey && ev.key === 'ArrowDown') { ev.preventDefault(); moverHojaLector(1); return; }
      if (ev.key === 'ArrowDown' || ev.key === 'PageDown' || ev.key === ' ') {
        ev.preventDefault(); irAHoja(lector.actual + 1); return;
      }
      if (ev.key === 'ArrowUp' || ev.key === 'PageUp') {
        ev.preventDefault(); irAHoja(lector.actual - 1); return;
      }
      if (ev.key === 'Home') { ev.preventDefault(); irAHoja(0); return; }
      if (ev.key === 'End') { ev.preventDefault(); irAHoja(hojasLector().length - 1); return; }
      if (ev.key === '[') { accionLector((p) => { p.giro = G.norm(p.giro - 90); }); return; }
      if (ev.key === ']') { accionLector((p) => { p.giro = G.norm(p.giro + 90); }); return; }
    }
    // Alt+1, Alt+2, Alt+3: de tablero en tablero
    if (ev.altKey && !ctrl && /^Digit[1-3]$/.test(ev.code)) {
      const t = tableros[Number(ev.code.slice(5)) - 1];
      if (t) { ev.preventDefault(); activarTablero(t.id); }
      return;
    }
    if (ctrl && ev.key.toLowerCase() === 'z') { ev.preventDefault(); deshacer(); return; }
    if (ctrl && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (ctrl && ev.key.toLowerCase() === 's' && ev.shiftKey) { ev.preventDefault(); guardarExpedienteActual(); return; }
    if (ctrl && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(); return; }
    // Ctrl+F busca dentro del expediente: la del navegador no ve el texto de
    // las hojas, que en pantalla son imágenes
    if (ctrl && ev.key.toLowerCase() === 'f' && !$$('.modal:not([hidden])').length) {
      ev.preventDefault(); abrirBuscador(); return;
    }
    if (ctrl && ev.key.toLowerCase() === 'o') { ev.preventDefault(); $('#entradaArchivos').click(); return; }
    if (enCampo) return;
    if (ctrl && ev.key.toLowerCase() === 'a') {
      ev.preventDefault();
      E.seleccion = new Set(hojasVisibles().map((p) => p.uid));
      pintar();
      return;
    }
    if (ctrl && ev.key.toLowerCase() === 'd') {
      ev.preventDefault();
      const objs = seleccionadas();
      if (objs.length) { marcar(); duplicar(objs); }
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const objs = seleccionadas();
      if (objs.length) { ev.preventDefault(); marcar(); eliminar(objs); }
      return;
    }
    if (ev.altKey && ev.key === 'ArrowUp') {
      ev.preventDefault();
      const objs = seleccionadas();
      if (!objs.length) { G.aviso('Selecciona primero las páginas que quieres mover.', 'error'); return; }
      moverPosiciones(objs, -1);
      return;
    }
    if (ev.altKey && ev.key === 'ArrowDown') {
      ev.preventDefault();
      const objs = seleccionadas();
      if (!objs.length) { G.aviso('Selecciona primero las páginas que quieres mover.', 'error'); return; }
      moverPosiciones(objs, 1);
      return;
    }
    if (ev.key === '[') { girar(-90); return; }
    if (ev.key === ']') { girar(90); return; }
    if (ev.key.toLowerCase() === 'p') { $('#btnPanel').click(); return; }
    if (ev.key.toLowerCase() === 'v') { abrirLector(); return; }
  });

  /* ---------------- arranque ---------------- */
  /* ---------------- riel de herramientas ---------------- */
  const CLAVE_RIEL = 'grapa.riel';

  /**
   * Abre esa sección y la trae a la vista. No cierra las demás: dejarlas
   * abiertas a la vez es útil (ver los documentos mientras se ajusta la
   * salida), y el riel ya sirve para llegar a cualquiera de un clic.
   */
  function irASeccion(cual, opciones) {
    const o = opciones || {};
    const seccion = $$('.bloque').find((b) => b.dataset.bloque === cual);
    if (!seccion) return;
    // Al elegir en el riel se queda esa y las demás se pliegan: el panel no
    // se convierte en una tira larga de todo abierto a la vez.
    $$('.bloque').forEach((b) => b.classList.toggle('abierto', b === seccion));
    // si el panel estaba recogido, el riel lo vuelve a abrir. Al arrancar no:
    // ahí se respeta cómo lo dejó el usuario la última vez.
    if (o.desplegar !== false) {
      abrirPanel();
      seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // un destello para no perder de vista a dónde acaba de saltar
      seccion.classList.remove('destacada');
      void seccion.offsetWidth;
      seccion.classList.add('destacada');
    }
    seccionActual = cual;
    marcarRiel();
    try { localStorage.setItem(CLAVE_RIEL, cual); } catch (e) {}
    // al abrir Buscar se lee ya el texto, para saber de entrada qué hojas
    // son escaneadas y ofrecer hacerlas buscables sin esperar a escribir
    if (cual === 'buscar' && E.paginas.length) leerTextoQueFalta();
  }

  /**
   * Marca SOLO la sección donde estás, no todas las abiertas: con varias
   * abiertas se encendía medio riel y dejaba de señalar nada.
   */
  let seccionActual = null;
  /** Lo rellena conectar(); el riel lo usa para desplegar el panel recogido. */
  let abrirPanel = () => {};
  function marcarRiel() {
    $$('.riel-btn').forEach((b) => {
      const s = $$('.bloque').find((x) => x.dataset.bloque === b.dataset.va);
      const abierta = !!(s && s.classList.contains('abierto'));
      b.classList.toggle('activo', b.dataset.va === seccionActual && abierta);
      b.classList.toggle('abierta', abierta);
      b.setAttribute('aria-expanded', String(abierta));
    });
  }

  /** Los contadores viven en el riel, para verlos sin abrir ninguna sección. */
  function pintarMarcaRiel(id, n) {
    const el = $(id);
    if (!el) return;
    el.textContent = n;
    el.hidden = !n;
  }

  /* ---------- deslizadores con botones ----------
     Arrastrar el tirador pide pulso fino y basta un roce para pasarse de
     largo. Cada deslizador lleva ahora un «−» y un «+»: una pulsación mueve
     un paso, y si se mantiene pulsado sigue moviéndose solo. */

  /** Los deslizadores que llevan botones, con el tamaño de su paso.
   *  «factor» multiplica —los acercamientos suben mejor a saltos
   *  proporcionales: cortos abajo y largos arriba— y «paso» suma. */
  const DESLIZADORES = [
    ['#zoom', 'zoom', { factor: 1.12 }],
    ['#lectorZoom', 'tamaño', { factor: 1.12 }],
    ['#firmarZoom', 'acercamiento', { factor: 1.12 }],
    ['#firmarOpacidad', 'opacidad', { paso: 5 }],
    ['#marcaOpacidad', 'opacidad', { paso: 5 }],
    ['#recorteLimpieza', 'limpieza', { paso: 5 }],
    ['#recorteIntensidad', 'intensidad', { paso: 5 }],
    ['#dibujoGrosor', 'grosor', { paso: 1 }],
  ];

  /**
   * Mueve un deslizador un paso y avisa a quien lo escuchaba, igual que si
   * lo hubieran arrastrado. Devuelve false cuando ya estaba en el tope, que
   * es como la repetición sabe que tiene que parar.
   */
  function moverDeslizador(ent, dir, como) {
    const min = Number(ent.min || 0);
    const max = Number(ent.max === '' || ent.max == null ? 100 : ent.max);
    const antes = Number(ent.value);
    let v;
    if (como.factor) {
      v = dir > 0 ? antes * como.factor : antes / como.factor;
      // con valores pequeños el redondeo se comía el paso entero
      v = dir > 0 ? Math.max(Math.ceil(v), antes + 1) : Math.min(Math.floor(v), antes - 1);
    } else {
      v = antes + dir * como.paso;
    }
    v = Math.max(min, Math.min(max, Math.round(v)));
    if (v === antes) return false;
    ent.value = String(v);
    ent.dispatchEvent(new Event('input', { bubbles: true }));
    ent.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function botonDePaso(ent, dir, como, nombre) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn paso';
    b.textContent = dir > 0 ? '+' : '−';
    b.title = (dir > 0 ? 'Más ' : 'Menos ') + nombre + ' (mantén pulsado para seguir)';
    b.setAttribute('aria-label', (dir > 0 ? 'Más ' : 'Menos ') + nombre);
    let tempo = 0;
    const parar = () => { clearTimeout(tempo); tempo = 0; };
    const seguir = (espera) => {
      tempo = setTimeout(() => {
        if (moverDeslizador(ent, dir, como)) seguir(110); else parar();
      }, espera);
    };
    b.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0) return;
      ev.preventDefault();                       // ni arrastra la página ni roba el foco
      try { b.setPointerCapture(ev.pointerId); } catch (e) {}
      moverDeslizador(ent, dir, como);
      seguir(420);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach((t) => b.addEventListener(t, parar));
    // con el teclado no hay pointerdown y el clic llega con detail 0
    b.addEventListener('click', (ev) => { if (!ev.detail) moverDeslizador(ent, dir, como); });
    return b;
  }

  function ponerBotonesDePaso() {
    DESLIZADORES.forEach(([sel, nombre, como]) => {
      const ent = $(sel);
      if (!ent || ent.dataset.conPasos) return;
      ent.dataset.conPasos = '1';
      const caja = document.createElement('span');
      caja.className = 'deslizador';
      ent.parentNode.insertBefore(caja, ent);
      caja.appendChild(botonDePaso(ent, -1, como, nombre));
      caja.appendChild(ent);
      caja.appendChild(botonDePaso(ent, 1, como, nombre));
    });
  }

  function conectar() {
    $$('.riel-btn').forEach((b) => {
      b.addEventListener('click', () => irASeccion(b.dataset.va));
    });
    // acordeón: la cabecera sigue plegando su sección
    $$('.bloque-cabecera').forEach((cab) => {
      cab.addEventListener('click', () => {
        const sec = cab.parentElement;
        const abierta = sec.classList.toggle('abierto');
        if (!abierta && seccionActual === sec.dataset.bloque) seccionActual = null;
        if (abierta) seccionActual = sec.dataset.bloque;
        marcarRiel();
      });
    });
    // arranca en la sección donde se quedó, y solo en esa
    let inicial = 'docs';
    try { inicial = localStorage.getItem(CLAVE_RIEL) || 'docs'; } catch (e) {}
    irASeccion(inicial, { desplegar: false });

    // tema
    const temaGuardado = (() => { try { return localStorage.getItem('grapa.tema'); } catch (e) { return null; } })();
    if (temaGuardado) document.documentElement.dataset.tema = temaGuardado;
    // Sin preferencia propia, Pdflash hereda el tema de quien la muestra.
    const temaEfectivo = () => {
      const propio = document.documentElement.dataset.tema;
      if (propio) return propio;
      const impuesto = document.documentElement.getAttribute('data-theme');
      if (impuesto === 'dark') return 'oscuro';
      if (impuesto === 'light') return 'claro';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
    };
    $('#btnTema').addEventListener('click', () => {
      const nuevo = temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro';
      document.documentElement.dataset.tema = nuevo;
      try { localStorage.setItem('grapa.tema', nuevo); } catch (e) {}
    });

    // abrir archivos
    const entrada = $('#entradaArchivos');
    entrada.addEventListener('change', () => {
      const lote = Array.from(entrada.files || []);
      entrada.value = '';
      anadir(lote);
    });
    ['#btnAbrir', '#btnAbrir2', '#zonaSoltar'].forEach((s) => $(s).addEventListener('click', () => entrada.click()));
    // pegar con Ctrl+V: los archivos copiados entran igual que si se soltaran
    document.addEventListener('paste', (ev) => {
      const archivos = Array.from((ev.clipboardData && ev.clipboardData.files) || []);
      if (!archivos.length) return;      // pegar texto en un campo sigue siendo pegar texto
      ev.preventDefault();
      anadir(archivos, null);
    });

    conectarTacho();

    conectarSoltar($('#zonaSoltar'), 'encima');
    conectarSoltar($('#lienzo'), 'encima', true);

    // historial
    $('#btnDeshacer').addEventListener('click', deshacer);
    $('#btnRehacer').addEventListener('click', rehacer);

    // barra del taller
    $('#btnSelTodo').addEventListener('click', () => { E.seleccion = new Set(hojasVisibles().map((p) => p.uid)); refrescarSeleccion(); });
    $('#btnSelNada').addEventListener('click', () => { E.seleccion.clear(); refrescarSeleccion(); });
    $('#btnSelInvertir').addEventListener('click', () => {
      const nueva = new Set();
      hojasVisibles().forEach((p) => { if (!E.seleccion.has(p.uid)) nueva.add(p.uid); });
      E.seleccion = nueva;
      refrescarSeleccion();
    });
    // panel lateral plegable: con el expediente largo, la parrilla agradece
    // los 300 px de más y el panel casi nunca hace falta a la vez
    const CLAVE_PANEL = 'grapa.panel.oculto';
    function pintarPanel(oculto) {
      document.body.classList.toggle('sin-panel', oculto);
      const b = $('#btnPanel');
      b.innerHTML = icono('panel');
      b.title = (oculto ? 'Mostrar' : 'Ocultar') + ' el panel lateral (P)';
      b.setAttribute('aria-expanded', String(!oculto));
      refrescarNivel();
      afinarVisibles();
    }
    let panelOculto = false;
    try { panelOculto = localStorage.getItem(CLAVE_PANEL) === '1'; } catch (e) {}
    const recordarPanel = () => {
      try { localStorage.setItem(CLAVE_PANEL, panelOculto ? '1' : '0'); } catch (e) {}
    };
    pintarPanel(panelOculto);
    // Recogido queda el riel: desde ahí se abre cualquier sección y el panel
    // se despliega solo, sin tener que devolverlo a mano primero.
    abrirPanel = () => {
      if (!panelOculto) return;
      panelOculto = false;
      recordarPanel();
      pintarPanel(panelOculto);
    };
    $('#btnPanel').addEventListener('click', () => {
      panelOculto = !panelOculto;
      recordarPanel();
      pintarPanel(panelOculto);
    });

    // editor externo
    try {
      const peso = localStorage.getItem('grapa-peso');
      if (peso && G.PESOS[peso] !== undefined) $('#pesoSalida').value = peso;
    } catch (e) {}
    pintarNotaPeso();
    try { $('#editorUrl').value = localStorage.getItem(CLAVE_EDITOR) || EDITOR_POR_DEFECTO; } catch (e) {
      $('#editorUrl').value = EDITOR_POR_DEFECTO;
    }
    pintarEditorExterno();
    $('#editorUrl').addEventListener('input', () => {
      try { localStorage.setItem(CLAVE_EDITOR, $('#editorUrl').value.trim()); } catch (e) {}
      pintarEditorExterno();
    });
    $('#btnEditorExterno').addEventListener('click', editarFuera);

    // editor de texto
    try { $('#editorTextoUrl').value = localStorage.getItem(CLAVE_EDITOR_TEXTO) || ''; } catch (e) {}
    $('#editorTextoUrl').addEventListener('input', () => {
      try { localStorage.setItem(CLAVE_EDITOR_TEXTO, $('#editorTextoUrl').value.trim()); } catch (e) {}
    });
    $('#btnEditarTexto').addEventListener('click', editarTexto);

    $('#btnVista').addEventListener('click', () => {
      vista = vista === 'paquetes' ? 'hojas' : 'paquetes';
      E.seleccion.clear();
      pintar();
    });
    $('#btnVolverPaquetes').addEventListener('click', cerrarPaquete);
    $('#btnDescargarSel').addEventListener('click', descargarSeleccion);
    $('#buscarGuardados').addEventListener('input', () => pintarGuardados());
    $('#pesoSalida').addEventListener('change', (ev) => {
      pintarNotaPeso();
      pintarPesos();
      try { localStorage.setItem('grapa-peso', ev.target.value); } catch (e) {}
    });
    try { $('#pesoMaximo').value = localStorage.getItem('grapa-peso-max') || ''; } catch (e) {}
    $('#pesoMaximo').addEventListener('input', () => {
      try { localStorage.setItem('grapa-peso-max', $('#pesoMaximo').value); } catch (e) {}
      pintarPesos();
    });
    $('#btnVerPeso').addEventListener('click', calcularPeso);
    $('#btnComparar').addEventListener('click', compararMarcadas);
    $('#lectorColumnas').addEventListener('change', (ev) => {
      lector.columnas = Number(ev.target.value) || 1;
      aplicarZoomLector();
      irAHoja(lector.actual, true);
      renitidezLector();
    });
    $('#btnGirarIzq').addEventListener('click', () => girar(-90));
    $('#btnGirarDer').addEventListener('click', () => girar(90));
    $('#btnDuplicar').addEventListener('click', () => {
      const objs = seleccionadas();
      if (!objs.length) { G.aviso('Selecciona las páginas que quieres duplicar.', 'error'); return; }
      marcar(); duplicar(objs);
    });
    $('#btnEliminar').addEventListener('click', () => {
      const objs = seleccionadas();
      if (!objs.length) { G.aviso('Selecciona las páginas que quieres eliminar.', 'error'); return; }
      marcar(); eliminar(objs);
    });
    $('#btnMoverInicio').addEventListener('click', () => moverExtremo(true));
    $('#btnMoverFin').addEventListener('click', () => moverExtremo(false));
    $('#btnSaltoPos').addEventListener('click', () => {
      moverSeleccionAPosicion(Number($('#saltoPos').value));
    });
    $('#saltoPos').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); $('#btnSaltoPos').click(); }
    });
    $('#zoom').addEventListener('input', (ev) => {
      document.documentElement.style.setProperty('--ancho-pag', ev.target.value + 'px');
      afinarVisibles();
    });
    $('#lienzo').addEventListener('scroll', afinarVisibles, { passive: true });
    document.documentElement.style.setProperty('--ancho-pag', $('#zoom').value + 'px');

    // firmas
    $('#btnNuevaFirmaArchivo').addEventListener('click', () => $('#entradaImagenFirma').click());
    $('#entradaImagenFirma').addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try {
        const lienzo = await G.firmaDesdeArchivo(file);
        const res = G.limpiarFondo(lienzo, { mono: false, recortar: true });
        G.guardarFirma(file.name.replace(/\.[^.]+$/, ''), res.dataUrl, res.ancho, res.alto);
        G.aviso('Firma añadida desde la imagen.', 'ok');
      } catch (e) {
        G.aviso('No se pudo usar la imagen: ' + e.message, 'error');
      }
    });
    $('#btnNuevaFirmaEscaneo').addEventListener('click', () => {
      const pref = seleccionadas()[0] || E.paginas[0];
      G.abrirRecorte(pref);
    });
    $('#btnNuevaFirmaDibujo').addEventListener('click', () => { $('#modalDibujo').hidden = false; });

    // foliación
    $('#folioFormato').addEventListener('change', (ev) => {
      $('#campoFolioLibre').classList.toggle('oculto', ev.target.value !== '__libre__');
    });
    const explicaFolio = () => {
      $('#folioExplica').textContent = $('#folioSentido').value === 'inverso'
        ? 'La última página lleva el folio 1 y se cuenta hacia arriba, así los documentos que adjuntes encima no obligan a renumerar los anteriores.'
        : 'La primera página lleva el folio 1 y se cuenta hacia abajo, como en un informe corriente.';
    };
    $('#folioSentido').addEventListener('change', explicaFolio);
    explicaFolio();
    rejillaPosiciones($('#folioPos'), 'ad');
    rejillaPosiciones($('#marcaPos'), 'cc');
    $('#btnFoliarAplicar').addEventListener('click', aplicarFolio);
    $('#btnFoliarQuitar').addEventListener('click', () => quitarRol('folio', $('#folioSoloSel').checked));
    $('#btnMarcaAplicar').addEventListener('click', aplicarMarca);
    $('#btnMarcaQuitar').addEventListener('click', () => quitarRol('marca', $('#marcaSoloSel').checked));

    // guardar / dividir
    $('#btnGuardar').addEventListener('click', guardar);
    $('#btnDividirMarcas').addEventListener('click', () => {
      const grupos = gruposPorMarcas();
      if (grupos.filter((g) => g.length).length < 2) {
        G.aviso('Marca primero dónde cortar con las tijeras entre páginas.', 'error');
        return;
      }
      entregarGrupos(grupos, 'parte');
    });
    $('#btnExtraerSel').addEventListener('click', () => {
      const objs = seleccionadas();
      if (!objs.length) { G.aviso('Selecciona las páginas que quieres extraer.', 'error'); return; }
      entregarGrupos([objs], 'extraido');
    });
    $('#btnDividirUna').addEventListener('click', () => {
      if (!E.paginas.length) { G.aviso('No hay páginas.', 'error'); return; }
      entregarGrupos(E.paginas.map((p) => [p]), 'pag');
    });
    $('#btnDividirRangos').addEventListener('click', () => {
      const grupos = parsearRangos($('#divRangos').value, E.paginas.length);
      if (!grupos.length) { G.aviso('Escribe rangos válidos, por ejemplo: 1-3, 5, 8-10', 'error'); return; }
      entregarGrupos(grupos, 'rango');
    });

    // modales
    $('#btnAyuda').addEventListener('click', () => { $('#modalAyuda').hidden = false; });
    $$('.modal').forEach((m) => {
      if (m.id === 'modalConfirmar') return;   // se cierra por su propia promesa
      m.addEventListener('click', (ev) => { if (ev.target === m) m.hidden = true; });
      $$('[data-cerrar]', m).forEach((b) => b.addEventListener('click', () => {
        if (m.id === 'modalCaptura') { cerrarCaptura(); return; }
        m.hidden = true;
      }));
    });

    // empezar otro expediente
    $('#btnNuevo').addEventListener('click', nuevoTablero);
    conectarTableros();
    conectarMenus();
    $$('#segVista [data-vista]').forEach((b) => b.addEventListener('click', () => irAVista(b.dataset.vista)));
    $('#btnBuscarBarra').addEventListener('click', abrirBuscador);
    $('#btnGuardarExp').addEventListener('click', guardarExpedienteActual);
    $('#chipEstado').addEventListener('click', guardarExpedienteActual);
    $('#bsFirmar').addEventListener('click', () => irASeccion('firmas'));
    setInterval(pintarCabeceraYEstado, 30000);

    // nombre del archivo de salida
    $('#nombreSalida').addEventListener('input', () => {
      nombreManual = true;
      sincronizarNombreSalida();
    });
    $('#btnNombreAuto').addEventListener('click', volverANombreAutomatico);

    // guardar el trabajo
    $('#btnGuardarTrabajo').addEventListener('click', guardarComoNuevo);
    $('#guardarNombre').addEventListener('input', sincronizarNombreSalida);
    $('#btnActualizarTrabajo').addEventListener('click', actualizarGuardado);
    $('#btnDejarDeEditar').addEventListener('click', dejarDeEditar);

    // carpeta de destino
    $('#btnVincularCarpeta').addEventListener('click', async () => {
      try {
        await G.carpeta.vincular();
        pintarCarpeta();
        G.aviso(`Los PDF se guardarán en «${G.carpeta.nombre()}».`, 'ok');
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // el usuario cerró el diálogo
        G.aviso(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError')
          ? 'Para elegir carpeta, abre Pdflash desde el archivo de tu computadora, no desde el enlace.'
          : 'No se pudo vincular la carpeta: ' + e.message, 'error');
      }
    });
    $('#btnDesvincularCarpeta').addEventListener('click', async () => {
      await G.carpeta.desvincular();
      pintarCarpeta();
    });

    // lector
    $('#btnLector').addEventListener('click', () => abrirLector());
    $('#lectorCerrar').addEventListener('click', cerrarLector);
    $('#lectorAnterior').addEventListener('click', () => irAHoja(lector.actual - 1));
    $('#lectorSiguiente').addEventListener('click', () => irAHoja(lector.actual + 1));
    $('#lectorGirarIzq').addEventListener('click', () => accionLector((p) => { p.giro = G.norm(p.giro - 90); }));
    $('#lectorGirarDer').addEventListener('click', () => accionLector((p) => { p.giro = G.norm(p.giro + 90); }));
    $('#lectorSubir').addEventListener('click', () => moverHojaLector(-1));
    $('#lectorBajar').addEventListener('click', () => moverHojaLector(1));
    $('#lectorFirmar').addEventListener('click', () => {
      const p = paginaActualLector();
      if (p) abrirFirmar(p);
    });
    $('#lectorEditarTexto').addEventListener('click', () => {
      const p = paginaActualLector();
      if (p) editarTexto([p]);
    });
    $('#lectorCapturar').addEventListener('click', () => alternarCaptura());
    conectarCaptura();
    $('#lectorEliminar').addEventListener('click', () => {
      const p = paginaActualLector();
      if (!p) return;
      marcar();
      const i = lector.actual;
      eliminar([p]);
      refrescarLector(Math.min(i, E.paginas.length - 1));
    });
    $('#lectorZoom').addEventListener('input', () => {
      aplicarZoomLector();
      // al agrandar, la hoja que se estaba mirando se iba de la pantalla:
      // se la vuelve a traer en vez de dejar la vista donde estaba
      const hoja = $$('.hoja', $('#lectorHojas'))[lector.actual];
      if (hoja) hoja.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
      renitidezLector();
    });
    window.addEventListener('resize', () => { if (lector.abierto) aplicarZoomLector(); });
    seguirScrollLector();

    ponerBotonesDePaso();
    conectarBuscador();
    conectarRevisar();

    iniciarEditorFirma();
    G.iniciarFirmasUI();

    // avisar antes de cerrar con trabajo sin guardar
    window.addEventListener('beforeunload', (ev) => {
      if (tableros.some((t) => datosDe(t).paginas.length)) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  E.firmas = G.almacen.leer();
  if (E.firmas.length) E.firmaActiva = E.firmas[0].id;
  tableroActivo = crearTablero();       // el primero es lo que ya hay en pantalla
  conectar();
  pintar();
  pintarTableros();
  G.prepararMotor();

  // lo que necesita la base de datos se resuelve aparte, sin frenar el arranque
  (async () => {
    try { await G.carpeta.recuperar(); } catch (e) {}
    pintarCarpeta();
    await pintarGuardados();
    await comprobarAutoguardado();
  })();
})();
