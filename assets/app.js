/* ===========================================================
   Grapa · interfaz del taller
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

  let contadorCarga = 0;
  G.cargando = function (activo, texto) {
    const capa = $('#cargando');
    contadorCarga = Math.max(0, contadorCarga + (activo ? 1 : -1));
    if (texto) $('#cargandoTexto').textContent = texto;
    capa.hidden = contadorCarga === 0;
  };

  /* ---------------- historial (deshacer / rehacer) ---------------- */
  const historial = { atras: [], adelante: [] };

  function instantanea() {
    return JSON.stringify({ paginas: E.paginas, seleccion: Array.from(E.seleccion) });
  }
  function aplicarInstantanea(txt) {
    const d = JSON.parse(txt);
    E.paginas = d.paginas;
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
  const seleccionadas = () => E.paginas.filter((p) => E.seleccion.has(p.uid));
  const objetivo = () => (E.seleccion.size ? seleccionadas() : E.paginas);

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
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      if (!en.isIntersecting) return;
      observador.unobserve(en.target);
      const uid = en.target.dataset.uid;
      const pagina = E.paginas.find((p) => p.uid === uid);
      if (!pagina) return;
      G.miniatura(pagina).then((url) => {
        const img = en.target.querySelector('.mini');
        if (img) { img.src = url; img.style.display = 'block'; }
        const hueco = en.target.querySelector('.pag-cargando');
        if (hueco) hueco.remove();
      }).catch(() => {});
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

    const hueco = document.createElement('div');
    hueco.className = 'pag-cargando';
    marco.appendChild(hueco);

    const img = document.createElement('img');
    img.className = 'mini';
    img.alt = 'Página ' + (indice + 1);
    img.style.cssText = 'display:none;width:100%;height:auto';
    marco.appendChild(img);

    const cinta = document.createElement('div');
    cinta.className = 'pag-cinta';
    cinta.style.background = fuente ? fuente.color : '#999';
    marco.appendChild(cinta);

    marco.appendChild(nodoSellos(pagina, anchoPx));

    const num = document.createElement('span');
    num.className = 'pag-num';
    num.textContent = indice + 1;
    marco.appendChild(num);

    if (fuente) {
      const org = document.createElement('span');
      org.className = 'pag-origen';
      org.textContent = fuente.nombre;
      org.title = fuente.nombreCompleto + ' · página original ' + (pagina.indice + 1);
      marco.appendChild(org);
    }

    const acciones = document.createElement('div');
    acciones.className = 'pag-acciones';
    [
      ['↺', 'Girar a la izquierda', () => { marcar(); pagina.giro = G.norm(pagina.giro - 90); pintar(); }],
      ['↻', 'Girar a la derecha', () => { marcar(); pagina.giro = G.norm(pagina.giro + 90); pintar(); }],
      ['🔍', 'Ver esta hoja en grande', () => abrirLector(E.paginas.indexOf(pagina))],
      ['✍', 'Colocar firma o sello', () => abrirFirmar(pagina)],
      ['⧉', 'Duplicar', () => { marcar(); duplicar([pagina]); }],
      ['🗑', 'Eliminar', () => { marcar(); eliminar([pagina]); }, 'peligro'],
    ].forEach(([txt, titulo, fn, clase]) => {
      const b = document.createElement('button');
      b.textContent = txt;
      b.title = titulo;
      if (clase) b.className = clase;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      acciones.appendChild(b);
    });
    marco.appendChild(acciones);

    el.appendChild(marco);

    const etiqueta = document.createElement('div');
    etiqueta.className = 'pag-etiqueta';
    etiqueta.textContent = `${Math.round(vis.w * 0.3528)}×${Math.round(vis.h * 0.3528)} mm`;
    el.appendChild(etiqueta);

    // tijera de corte (no aparece en la última página)
    if (indice < E.paginas.length - 1) {
      const corte = document.createElement('div');
      corte.className = 'corte' + (pagina.corte ? ' activo' : '');
      const b = document.createElement('button');
      b.textContent = '✂';
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

    el.addEventListener('click', (ev) => clicPagina(ev, pagina, indice));
    el.addEventListener('dblclick', () => abrirFirmar(pagina));
    observador.observe(el);
    return el;
  }

  function pintar() {
    recalcularFolios();
    const rejilla = $('#rejilla');
    rejilla.innerHTML = '';
    E.paginas.forEach((p, i) => rejilla.appendChild(tarjeta(p, i)));
    $('#vacio').hidden = E.paginas.length > 0;

    $('#infoPaginas').textContent = E.paginas.length === 1 ? '1 página' : E.paginas.length + ' páginas';
    const n = E.seleccion.size;
    $('#infoSeleccion').textContent = n
      ? (n === 1 ? '1 seleccionada' : n + ' seleccionadas')
      : (E.paginas.length ? 'nada seleccionado · las acciones se aplican a todo' : 'sin documentos');

    pintarDocs();
    pintarFirmas();
    actualizarBotonesHistorial();
    if (!E.paginas.length && expedienteAbierto) expedienteAbierto = null;
    actualizarEstadoGuardado();
    programarAutoguardado();
  }
  G.pintar = pintar;

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
      sel.textContent = '◎';
      sel.title = 'Seleccionar sus páginas';
      sel.addEventListener('click', () => {
        E.seleccion = new Set(E.paginas.filter((p) => p.fuenteId === f.id).map((p) => p.uid));
        pintar();
      });
      const quitar = document.createElement('button');
      quitar.className = 'btn btn-mini btn-peligro-suave';
      quitar.textContent = '✕';
      quitar.title = 'Quitar este documento del taller';
      quitar.addEventListener('click', () => {
        marcar();
        eliminar(E.paginas.filter((p) => p.fuenteId === f.id));
      });
      li.append(punto, nom, meta, sel, quitar);
      lista.appendChild(li);
    });
    $('#contDocs').textContent = vivos;
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
      borrar.textContent = '✕';
      borrar.title = 'Borrar esta firma';
      borrar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm(`¿Borrar la firma «${f.nombre}»?`)) G.borrarFirma(f.id);
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
    } else if (ev.ctrlKey || ev.metaKey) {
      if (E.seleccion.has(pagina.uid)) E.seleccion.delete(pagina.uid);
      else E.seleccion.add(pagina.uid);
      E.ancla = indice;
    } else {
      const solaYa = E.seleccion.size === 1 && E.seleccion.has(pagina.uid);
      E.seleccion.clear();
      if (!solaYa) E.seleccion.add(pagina.uid);
      E.ancla = indice;
    }
    pintar();
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
    pintar();
  }

  /** Mueve la selección para que empiece justo en la posición dada (1 = primera). */
  function moverSeleccionAPosicion(numeroPos) {
    const objs = seleccionadas();
    if (!objs.length) { G.aviso('Selecciona primero las páginas que quieres mover.', 'error'); return; }
    if (!Number.isFinite(numeroPos)) { G.aviso('Escribe el número de la posición.', 'error'); return; }
    marcar();
    const mover = new Set(objs.map((p) => p.uid));
    const resto = E.paginas.filter((p) => !mover.has(p.uid));
    const destino = Math.max(0, Math.min(resto.length, Math.round(numeroPos) - 1));
    resto.splice(destino, 0, ...objs);
    E.paginas = resto;
    pintar();
    G.aviso(`Movidas a la posición ${destino + 1}.`, 'ok');
  }

  function moverExtremo(alInicio) {
    const objs = seleccionadas();
    if (!objs.length) { G.aviso('Selecciona primero las páginas que quieres mover.', 'error'); return; }
    marcar();
    const mover = new Set(objs.map((p) => p.uid));
    const resto = E.paginas.filter((p) => !mover.has(p.uid));
    E.paginas = alInicio ? objs.concat(resto) : resto.concat(objs);
    pintar();
  }

  /* ---------------- reordenar arrastrando ---------------- */
  let arrastrando = null;

  $('#rejilla').addEventListener('dragstart', (ev) => {
    const tarjeta = ev.target.closest('.pag');
    if (!tarjeta) return;
    const uid = tarjeta.dataset.uid;
    // Nunca repintar aquí: el navegador acaba de tomar la instantánea para
    // arrastrar esta misma tarjeta. Si reconstruimos la rejilla (innerHTML),
    // el nodo original queda fuera del documento y, por especificación,
    // el navegador cancela el arrastre sin avisar: nunca llega el drop.
    if (!E.seleccion.has(uid)) {
      E.seleccion = new Set([uid]);
      $$('.pag').forEach((t) => t.classList.toggle('sel', t.dataset.uid === uid));
    }
    arrastrando = Array.from(E.seleccion);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', uid);
    setTimeout(() => {
      $$('.pag').forEach((t) => { if (E.seleccion.has(t.dataset.uid)) t.classList.add('arrastrando'); });
    }, 0);
  });

  $('#rejilla').addEventListener('dragend', () => {
    arrastrando = null;
    $$('.pag').forEach((t) => t.classList.remove('arrastrando', 'destino-izq', 'destino-der'));
  });

  $('#rejilla').addEventListener('dragover', (ev) => {
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
    }
    resto.splice(destino, 0, ...movidas);
    E.paginas = resto;
    arrastrando = null;
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

  async function anadir(files, indice) {
    const lote = Array.from(files || []);   // copia inmediata: la FileList puede vaciarse
    if (!lote.length) return;
    G.cargando(true, 'Abriendo archivos…');
    try {
      await G.prepararMotor();
      const r = await G.cargarArchivos(lote, (t) => { $('#cargandoTexto').textContent = t; });
      if (r.paginas.length) {
        marcar();
        r.fuentes.forEach((f) => E.fuentes.set(f.id, f));
        if (indice == null) {
          // Lo nuevo va encima de lo que ya había, como al grapar un
          // documento sobre un expediente físico: no al final.
          E.paginas = r.paginas.concat(E.paginas);
        } else {
          E.paginas.splice(Math.max(0, Math.min(indice, E.paginas.length)), 0, ...r.paginas);
        }
        E.seleccion = new Set(r.paginas.map((p) => p.uid));
        pintar();
        const nom = $('#nombreSalida');
        if (r.fuentes.length && (!nom.value || nom.value === 'documento-unido')) {
          nom.value = G.nombreSeguro(r.fuentes[0].nombre, 'documento-unido');
        }
        G.aviso(`Se añadieron ${r.paginas.length} página(s) de ${r.fuentes.length} archivo(s).`, 'ok');
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
      if (arrastrando) return;
      ev.preventDefault();
      zona.classList.add(resaltado);
    }));
    ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (ev) => {
      if (t === 'drop') ev.preventDefault();
      if (t === 'dragleave' && zona.contains(ev.relatedTarget)) return;
      zona.classList.remove(resaltado);
    }));
    zona.addEventListener('drop', (ev) => {
      if (arrastrando) return;
      const archivos = ev.dataTransfer && ev.dataTransfer.files;
      if (archivos && archivos.length) anadir(archivos, conPosicion ? indiceDesdeEvento(ev) : null);
    });
  }

  /* ---------------- editor de firma ---------------- */
  const fir = { pagina: null, sello: null, vis: null, arrastre: null };

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

    const previo = pagina.sellos.filter((s) => s.rol === 'firma').slice(-1)[0];
    fir.sello = previo
      ? Object.assign({}, previo)
      : { rol: 'firma', firmaId: sel.value, fx: 0.58, fy: 0.72, fw: 0.28, giro: 0, opacidad: 1 };
    if (!previo) fir.sello.firmaId = sel.value;
    sel.value = fir.sello.firmaId;

    $('#firmarAncho').value = Math.round(fir.sello.fw * 100);
    $('#firmarGiro').value = fir.sello.giro || 0;
    $('#firmarOpacidad').value = Math.round((fir.sello.opacidad == null ? 1 : fir.sello.opacidad) * 100);
    $('#modalFirmar').hidden = false;

    G.cargando(true, 'Preparando la página…');
    try {
      const lienzo = await G.renderGrande(pagina, 1200);
      const destino = $('#firmarLienzo');
      destino.width = lienzo.width;
      destino.height = lienzo.height;
      destino.getContext('2d').drawImage(lienzo, 0, 0);
    } catch (e) {
      G.aviso('No se pudo mostrar la página: ' + e.message, 'error');
    } finally {
      G.cargando(false);
    }
    pintarSello();
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
      destino.forEach((p) => {
        p.sellos = p.sellos.filter((s) => s.rol !== 'firma' || s.firmaId !== fir.sello.firmaId);
        p.sellos.push(Object.assign({}, fir.sello));
      });
      $('#modalFirmar').hidden = true;
      pintar();
      G.aviso(`Firma colocada en ${destino.length} página(s).`, 'ok');
    });

    $('#btnFirmarQuitarPagina').addEventListener('click', () => {
      marcar();
      fir.pagina.sellos = fir.pagina.sellos.filter((s) => s.rol !== 'firma');
      $('#modalFirmar').hidden = true;
      pintar();
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
  function opcionesSalida(paginas) {
    recalcularFolios();
    return {
      titulo: $('#metaTitulo').value.trim() || undefined,
      autor: $('#metaAutor').value.trim() || undefined,
      totalFolio: totalFolios || E.paginas.length,
      numeros: paginas.map((p) => folios.get(p.uid)),
      baseIndices: paginas.map((p) => E.paginas.indexOf(p)),
    };
  }

  async function guardar() {
    if (!E.paginas.length) { G.aviso('No hay páginas para guardar.', 'error'); return; }
    G.cargando(true, 'Armando el PDF…');
    try {
      const bytes = await G.construirPdf(E.paginas, opcionesSalida(E.paginas));
      const nombre = G.nombreSeguro($('#nombreSalida').value, 'documento-unido') + '.pdf';
      const r = await G.guardarArchivo(bytes, nombre, 'application/pdf');
      G.aviso(
        r.estado === 'carpeta' ? `Guardado en «${G.carpeta.nombre()}» como ${r.nombre}`
          : r.estado === 'guardado' ? 'PDF guardado.' : 'Guardado cancelado.',
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

  function fuentesUsadas() {
    const ids = new Set(E.paginas.map((p) => p.fuenteId));
    return Array.from(ids).map((id) => {
      const f = E.fuentes.get(id);
      return f ? {
        id: f.id, nombre: f.nombre, nombreCompleto: f.nombreCompleto,
        color: f.color, paginas: f.paginas, bytes: f.bytes,
      } : null;
    }).filter(Boolean);
  }

  function serializar(id, nombre) {
    const fuentes = fuentesUsadas();
    const registro = {
      id, nombre,
      fecha: Date.now(),
      numPaginas: E.paginas.length,
      fuenteIds: fuentes.map((f) => f.id),
      paginas: JSON.parse(JSON.stringify(E.paginas)),
      salida: {
        nombre: $('#nombreSalida').value,
        titulo: $('#metaTitulo').value,
        autor: $('#metaAutor').value,
      },
    };
    // El autoguardado recuerda de qué expediente con nombre venía, para que
    // "Continuar donde lo dejé" también recupere la opción de Actualizar.
    if (id === '__auto' && expedienteAbierto) {
      registro.origenId = expedienteAbierto.id;
      registro.origenNombre = expedienteAbierto.nombre;
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
      E.paginas = (registro.paginas || [])
        .filter((p) => vivas.has(p.fuenteId))
        .map((p) => Object.assign({}, p, { uid: G.nuevoUid() }));
      E.seleccion.clear();
      historial.atras.length = 0;
      historial.adelante.length = 0;
      if (registro.salida) {
        $('#nombreSalida').value = registro.salida.nombre || 'documento-unido';
        $('#metaTitulo').value = registro.salida.titulo || '';
        $('#metaAutor').value = registro.salida.autor || '';
      }
      // Deja anotado sobre qué guardado se está trabajando: el próximo
      // guardado lo actualiza en vez de crear uno nuevo por separado.
      expedienteAbierto = registro.id === '__auto'
        ? (registro.origenId ? { id: registro.origenId, nombre: registro.origenNombre || 'expediente' } : null)
        : { id: registro.id, nombre: registro.nombre };
      actualizarEstadoGuardado();
      pintar();
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

  function programarAutoguardado() {
    if (!autoguardar) return;
    clearTimeout(relojAuto);
    relojAuto = setTimeout(async () => {
      try {
        if (!E.paginas.length) return;
        const { registro, fuentes } = serializar('__auto', 'Trabajo en curso');
        await G.bd.guardarExpediente(registro, fuentes);
      } catch (e) {
        console.warn('autoguardado no disponible', e);
        autoguardar = false;
      }
    }, 2500);
  }

  const fechaCorta = (ms) => {
    const d = new Date(ms || Date.now());
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  };

  async function comprobarAutoguardado() {
    try {
      const reg = await G.bd.leerExpediente('__auto');
      if (!reg || !reg.numPaginas) return;
      $('#restaurarTexto').textContent =
        `Quedó un trabajo sin terminar: ${reg.numPaginas} página(s) del ${fechaCorta(reg.fecha)}.`;
      $('#restaurar').hidden = false;
      $('#btnRestaurar').onclick = async () => {
        $('#restaurar').hidden = true;
        await restaurarExpediente(reg);
      };
      $('#btnDescartarAuto').onclick = async () => {
        $('#restaurar').hidden = true;
        try { await G.bd.borrarExpediente('__auto'); } catch (e) {}
      };
    } catch (e) { /* sin base de datos: se sigue sin guardar */ }
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
    lista.innerHTML = '';
    regs.forEach((r) => {
      const li = document.createElement('li');
      if (expedienteAbierto && expedienteAbierto.id === r.id) li.classList.add('actual');
      const datos = document.createElement('div');
      datos.className = 'guardado-datos';
      const nom = document.createElement('strong');
      nom.textContent = r.nombre;
      nom.title = r.nombre;
      const meta = document.createElement('span');
      meta.textContent = `${r.numPaginas} pág. · ${fechaCorta(r.fecha)}`;
      datos.append(nom, meta);

      const abrir = document.createElement('button');
      abrir.className = 'btn btn-mini';
      abrir.textContent = 'Abrir';
      abrir.addEventListener('click', async () => {
        if (E.paginas.length && !confirm('Se reemplaza lo que tienes en el taller. ¿Abrir de todos modos?')) return;
        await restaurarExpediente(r);
      });

      const borrar = document.createElement('button');
      borrar.className = 'btn btn-mini btn-peligro-suave';
      borrar.textContent = '✕';
      borrar.title = 'Borrar este expediente guardado';
      borrar.addEventListener('click', async () => {
        if (!confirm(`¿Borrar «${r.nombre}»? Esto no toca los PDF de tu computadora.`)) return;
        await G.bd.borrarExpediente(r.id);
        pintarGuardados();
      });

      li.append(datos, abrir, borrar);
      lista.appendChild(li);
    });
    if (!regs.length) {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = 'Todavía no has guardado ningún expediente.';
      lista.appendChild(p);
    }
    const esp = await G.bd.espacio();
    $('#espacioUsado').textContent = esp && esp.total
      ? `Ocupado: ${(esp.usado / 1048576).toFixed(1)} MB de ${(esp.total / 1048576 / 1024).toFixed(1)} GB disponibles.`
      : '';
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
      actualizarEstadoGuardado();
      $('#guardarNombre').value = '';
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
    G.cargando(true, 'Actualizando el expediente…');
    try {
      const { registro, fuentes } = serializar(expedienteAbierto.id, expedienteAbierto.nombre);
      await G.bd.guardarExpediente(registro, fuentes);
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
    actualizarEstadoGuardado();
  }

  /* ---------------- carpeta de destino ---------------- */
  function pintarCarpeta() {
    const est = $('#carpetaEstado'), nota = $('#carpetaNota');
    if (!G.carpeta.soportado()) {
      $('#carpetaBotones').hidden = true;
      est.textContent = 'Los PDF van a tu carpeta de Descargas.';
      est.classList.remove('vinculada');
      nota.textContent = 'Elegir una carpeta de destino solo funciona en Chrome o Edge, con Grapa abierta desde tu computadora.';
      return;
    }
    const c = G.carpeta.actual();
    $('#btnDesvincularCarpeta').hidden = !c;
    $('#btnVincularCarpeta').textContent = c ? 'Cambiar carpeta' : 'Elegir carpeta';
    est.classList.toggle('vinculada', !!c);
    est.textContent = c ? c.name : 'Los PDF van a tu carpeta de Descargas.';
    nota.textContent = c
      ? 'Lo que guardes se escribe aquí directamente. Si ya hay un archivo con ese nombre, Grapa añade (2) en vez de pisarlo.'
      : 'Si vinculas una carpeta, el PDF terminado se escribe ahí, sin pasar por Descargas.';
  }

  /* =========================================================
     LECTOR · las hojas en grande, una debajo de otra
     ========================================================= */
  const lector = { abierto: false, actual: 0, obs: null };

  function paginaActualLector() { return E.paginas[lector.actual] || null; }

  function construirLector() {
    const cont = $('#lectorHojas');
    cont.innerHTML = '';
    if (lector.obs) lector.obs.disconnect();

    lector.obs = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        const hoja = en.target;
        const i = Number(hoja.dataset.indice);
        const pagina = E.paginas[i];
        if (!pagina) return;
        if (en.isIntersecting) {
          if (hoja.dataset.pintada === '1') return;
          hoja.dataset.pintada = '1';
          const anchoPx = Math.min(2000, Math.round(hoja.clientWidth * (window.devicePixelRatio || 1)));
          G.renderGrande(pagina, Math.max(700, anchoPx)).then((lienzo) => {
            if (hoja.dataset.pintada !== '1') return;
            const hueco = hoja.querySelector('.hoja-hueco');
            if (hueco) hueco.remove();
            const previo = hoja.querySelector('canvas');
            if (previo) previo.remove();
            hoja.insertBefore(lienzo, hoja.firstChild);
            hoja.appendChild(nodoSellos(pagina, hoja.clientWidth));
          }).catch(() => {});
        } else if (hoja.dataset.pintada === '1') {
          // se suelta la memoria de las hojas que quedaron lejos
          hoja.dataset.pintada = '0';
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

    E.paginas.forEach((pagina, i) => {
      const vis = visDe(pagina);
      const fuente = E.fuentes.get(pagina.fuenteId);
      const hoja = document.createElement('div');
      hoja.className = 'hoja';
      hoja.dataset.indice = i;
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

      hoja.addEventListener('click', () => marcarHoja(i));
      cont.appendChild(hoja);
      lector.obs.observe(hoja);
    });
    aplicarZoomLector();
  }

  function aplicarZoomLector() {
    const v = Number($('#lectorZoom').value) / 100;
    const ancho = Math.round(Math.min(window.innerWidth - 40, window.innerWidth * v));
    $('#lectorHojas').style.setProperty('--hoja-ancho', ancho + 'px');
  }

  function marcarHoja(i) {
    lector.actual = Math.max(0, Math.min(E.paginas.length - 1, i));
    $$('.hoja', $('#lectorHojas')).forEach((h) => {
      h.classList.toggle('actual', Number(h.dataset.indice) === lector.actual);
    });
    const pagina = paginaActualLector();
    const fuente = pagina ? E.fuentes.get(pagina.fuenteId) : null;
    $('#lectorTitulo').textContent = `Hoja ${lector.actual + 1} de ${E.paginas.length}`;
    $('#lectorOrigen').textContent = fuente
      ? `${fuente.nombreCompleto} · página ${pagina.indice + 1}` : '';
  }

  function irAHoja(i, alInstante) {
    marcarHoja(i);
    const hoja = $$('.hoja', $('#lectorHojas'))[lector.actual];
    if (hoja) hoja.scrollIntoView({ behavior: alInstante ? 'instant' : 'smooth', block: 'start' });
  }

  function abrirLector(indice) {
    if (!E.paginas.length) { G.aviso('Primero abre un PDF.', 'error'); return; }
    lector.abierto = true;
    $('#lector').hidden = false;
    construirLector();
    irAHoja(indice == null ? lector.actual : indice, true);
  }

  function cerrarLector() {
    lector.abierto = false;
    $('#lector').hidden = true;
    if (lector.obs) lector.obs.disconnect();
    $('#lectorHojas').innerHTML = '';
  }

  function refrescarLector(indice) {
    if (!lector.abierto) return;
    if (!E.paginas.length) { cerrarLector(); return; }
    construirLector();
    irAHoja(indice == null ? lector.actual : indice, true);
  }

  /** Sube o baja la hoja que se está viendo, y la sigue en la pantalla. */
  function moverHojaLector(delta) {
    const pagina = paginaActualLector();
    if (!pagina) return;
    const idx = E.paginas.indexOf(pagina);
    const destino = idx + delta;
    if (destino < 0 || destino >= E.paginas.length) return;
    moverPosiciones([pagina], delta);
    refrescarLector(destino);
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
        for (let i = 0; i < hojas.length; i++) {
          if (hojas[i].getBoundingClientRect().top <= limite) mejor = i; else break;
        }
        if (mejor !== lector.actual) marcarHoja(mejor);
      });
    }, { passive: true });
  }

  /* ---------------- atajos de teclado ---------------- */
  document.addEventListener('keydown', (ev) => {
    const enCampo = /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
    const ctrl = ev.ctrlKey || ev.metaKey;

    if (ev.key === 'Escape') {
      if (lector.abierto && $$('.modal:not([hidden])').length === 0) { cerrarLector(); return; }
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
      if (ev.key === 'End') { ev.preventDefault(); irAHoja(E.paginas.length - 1); return; }
      if (ev.key === '[') { accionLector((p) => { p.giro = G.norm(p.giro - 90); }); return; }
      if (ev.key === ']') { accionLector((p) => { p.giro = G.norm(p.giro + 90); }); return; }
    }
    if (ctrl && ev.key.toLowerCase() === 'z') { ev.preventDefault(); deshacer(); return; }
    if (ctrl && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (ctrl && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(); return; }
    if (ctrl && ev.key.toLowerCase() === 'o') { ev.preventDefault(); $('#entradaArchivos').click(); return; }
    if (enCampo) return;
    if (ctrl && ev.key.toLowerCase() === 'a') {
      ev.preventDefault();
      E.seleccion = new Set(E.paginas.map((p) => p.uid));
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
    if (ev.key.toLowerCase() === 'v') { abrirLector(); return; }
  });

  /* ---------------- arranque ---------------- */
  function conectar() {
    // acordeón
    $$('.bloque-cabecera').forEach((cab) => {
      cab.addEventListener('click', () => cab.parentElement.classList.toggle('abierto'));
    });

    // tema
    const temaGuardado = (() => { try { return localStorage.getItem('grapa.tema'); } catch (e) { return null; } })();
    if (temaGuardado) document.documentElement.dataset.tema = temaGuardado;
    // Sin preferencia propia, Grapa hereda el tema de quien la muestra.
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
    conectarSoltar($('#zonaSoltar'), 'encima');
    conectarSoltar($('#lienzo'), 'encima', true);

    // historial
    $('#btnDeshacer').addEventListener('click', deshacer);
    $('#btnRehacer').addEventListener('click', rehacer);

    // barra del taller
    $('#btnSelTodo').addEventListener('click', () => { E.seleccion = new Set(E.paginas.map((p) => p.uid)); pintar(); });
    $('#btnSelNada').addEventListener('click', () => { E.seleccion.clear(); pintar(); });
    $('#btnSelInvertir').addEventListener('click', () => {
      const nueva = new Set();
      E.paginas.forEach((p) => { if (!E.seleccion.has(p.uid)) nueva.add(p.uid); });
      E.seleccion = nueva;
      pintar();
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
    });
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
      m.addEventListener('click', (ev) => { if (ev.target === m) m.hidden = true; });
      $$('[data-cerrar]', m).forEach((b) => b.addEventListener('click', () => { m.hidden = true; }));
    });

    // guardar el trabajo
    $('#btnGuardarTrabajo').addEventListener('click', guardarComoNuevo);
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
          ? 'Para elegir carpeta, abre Grapa desde el archivo de tu computadora, no desde el enlace.'
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
    $('#lectorEliminar').addEventListener('click', () => {
      const p = paginaActualLector();
      if (!p) return;
      marcar();
      const i = lector.actual;
      eliminar([p]);
      refrescarLector(Math.min(i, E.paginas.length - 1));
    });
    $('#lectorZoom').addEventListener('input', aplicarZoomLector);
    window.addEventListener('resize', () => { if (lector.abierto) aplicarZoomLector(); });
    seguirScrollLector();

    iniciarEditorFirma();
    G.iniciarFirmasUI();

    // avisar antes de cerrar con trabajo sin guardar
    window.addEventListener('beforeunload', (ev) => {
      if (E.paginas.length) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  E.firmas = G.almacen.leer();
  if (E.firmas.length) E.firmaActiva = E.firmas[0].id;
  conectar();
  pintar();
  G.prepararMotor();

  // lo que necesita la base de datos se resuelve aparte, sin frenar el arranque
  (async () => {
    try { await G.carpeta.recuperar(); } catch (e) {}
    pintarCarpeta();
    await pintarGuardados();
    await comprobarAutoguardado();
  })();
})();
