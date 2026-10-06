/* ===========================================================
   Pdflash · Evaluar ofertas
   Con las hojas marcadas (el Formato 1 y el Formato 5 de cada postor) lee
   los datos y los precios, arma el cuadro comparativo y dice quién gana:
   el menor precio entre los que cumplen. La lógica está en ofertas.js; aquí
   solo está la pantalla.

   Lo leído de un escaneo puede traer errores, así que:
     · el cuadro es editable, y al corregir una cifra todo se recalcula;
     · al lado se ve la hoja de verdad, para cotejar;
     · y lo dudoso sale como aviso, sin esconderse.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const O = () => G.ofertas;

  /** Crea un elemento: h('div', {class:'x', onclick: fn}, hijos…). */
  function h(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }

  const ICO = (id) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  };

  const dinero = (n, moneda) => (n == null || isNaN(n) ? '' : (moneda === 'USD' ? 'US$ ' : 'S/ ') + O().fmt(n));

  /* ---------- estado de lo que se está evaluando ---------- */
  let ev = null;
  let modal = null;
  const vistas = new Map();     // uid → lienzo de la hoja, para no dibujarla dos veces


  /** Un campo de texto que crece a lo alto según lo que tenga: nada se corta. */
  function ajustar(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 30) + 'px'; }
  function campo(valor, clase, placeholder, etiqueta, alCambiar) {
    const t = h('textarea', { class: 'of-in of-auto ' + (clase || ''), rows: 1, spellcheck: 'false', placeholder: placeholder || '', 'aria-label': etiqueta });
    t.value = valor || '';
    t.addEventListener('input', () => ajustar(t));
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } e.stopPropagation(); });
    t.addEventListener('change', () => alCambiar(t.value.replace(/\s+/g, ' ').trim(), t));
    return t;
  }
  function ajustarTodos() { document.querySelectorAll('#ofCuerpo .of-auto').forEach(ajustar); }

  /* ---------- la ventana ---------- */

  function crearModal() {
    if (modal) return modal;
    modal = h('div', { class: 'modal', id: 'modalOfertas', hidden: true },
      h('div', { class: 'modal-caja of-caja' },
        h('header', { class: 'modal-cabecera' },
          h('h3', {}, 'Evaluar ofertas'),
          h('span', { class: 'of-sub', id: 'ofSub' }),
          h('button', { class: 'btn btn-fantasma cerrar', 'aria-label': 'Cerrar', onclick: cerrar }, ICO('i-cerrar'))),
        h('div', { class: 'of-cuerpo', id: 'ofCuerpo' }),
        h('footer', { class: 'modal-pie of-pie', id: 'ofPie' })));
    document.body.appendChild(modal);
    return modal;
  }

  function cerrar() {
    if (ev) ev.cancelado = true;
    if (modal) modal.hidden = true;
    vistas.clear();
    ev = null;
  }

  /* ---------- leer las hojas ---------- */

  function pintarProgreso(i, n, texto, fraccion) {
    $('#ofSub').textContent = '';
    $('#ofPie').replaceChildren(h('button', { class: 'btn btn-suave', onclick: cerrar }, 'Cancelar'));
    const barra = h('div', { class: 'of-barra' }, h('i', { style: `width:${Math.round(Math.max(0.03, ((i + (fraccion || 0)) / n)) * 100)}%` }));
    $('#ofCuerpo').replaceChildren(h('div', { class: 'of-leyendo' },
      h('b', {}, `Leyendo hoja ${Math.min(i + 1, n)} de ${n}`),
      h('span', {}, texto || ''), barra,
      h('p', { class: 'nota' }, 'Los escaneos se leen dentro de tu computadora; ningún documento sale de aquí. La primera vez tarda un poco más.')));
  }

  async function abrir() {
    const marcadas = G.evaluacion.marcadas();
    if (!marcadas.length) {
      G.aviso('Marca las hojas del Formato 1 y del Formato 5 de cada postor, y vuelve a pulsar «Evaluar ofertas».', 'error');
      return;
    }
    crearModal();
    vistas.clear();
    modal.hidden = false;
    const sesion = { cancelado: false, hojas: marcadas, lecturas: new Map(), formatos: new Map() };
    ev = sesion;
    const n = marcadas.length;
    const baja = G.alEstadoOcr((t) => { if (t && ev === sesion) pintarProgreso(sesion.i || 0, n, t); });
    // todas las hojas se piden de una vez: el lector las reparte entre sus núcleos
    let listas = 0;
    const pedidas = marcadas.map((m) => G.leerLineas(m.pagina).then((lec) => {
      listas++;
      if (ev === sesion && !sesion.cancelado) pintarProgreso(listas - 1, n, 'Reconociendo el texto de las hojas…', 1);
      return lec;
    }, (e) => {
      listas++;
      return { e };
    }));
    try {
      for (let i = 0; i < n; i++) {
        sesion.i = i;
        if (sesion.cancelado || modal.hidden) { sesion.cancelado = true; return; }
        const m = marcadas[i];
        if (i === 0) pintarProgreso(0, n, G.hojaLeida(m.pagina) ? '' : 'Reconociendo el texto de las hojas…');
        let lec = await pedidas[i];
        if (lec.e) {
          const e = lec.e;
          console.error(e);
          if (/lector de texto|antiguo/.test(e.message)) { G.aviso(e.message, 'error'); cerrar(); return; }
          lec = { lineas: [], origen: 'texto', fallo: true, error: e && e.message ? e.message : String(e) };
        }
        lec = await segundaPasada(m, lec, sesion, i, n);
        if (sesion.cancelado || modal.hidden) { sesion.cancelado = true; return; }
        sesion.lecturas.set(m.id, lec);
        sesion.formatos.set(m.id, O().formatoDe(lec.lineas));
      }
    } finally {
      baja();
    }
    if (sesion.cancelado) return;
    armar(sesion);
    render();
  }

  /**
   * Si la lectura no quedó limpia se prueba la otra forma de leer la hoja y se queda la que
   * mejor salió: un escaneo de letra chica se vuelve a leer con más detalle, y una hoja con
   * texto de verdad de la que no sale nada se lee como imagen (hay PDF con un texto oculto
   * mal armado, de cuando se escaneó).
   */
  async function segundaPasada(m, lec, sesion, i, n) {
    if (lec.fallo) return lec;
    const a = O().leerHoja(lec.lineas);
    const hablaDePrecios = a.formato === 5 || /PRECIO|OFERTA|COTIZ|TOTAL/.test(O().plano(lec.lineas.map((l) => l.texto).join(' ')));
    const sucia = !a.tienePrecios || a.precios.items.some((it) => it.parcial || it.inferida);
    const sinNada = !a.tienePrecios && !a.ident.ruc && !a.ident.razon;
    if (!((hablaDePrecios && sucia) || sinNada)) return lec;
    // una hoja con texto de verdad solo se lee como imagen si de su texto no salió ningún precio
    if (lec.origen === 'texto' && a.tienePrecios) return lec;
    // PaddleOCR ya lee la letra chica: volver a leer más grande no le aporta y cuesta segundos
    if (lec.origen !== 'texto' && lec.motor === 'paddle') return lec;
    const opciones = lec.origen === 'texto' ? { forzarOcr: true } : { alta: true };
    pintarProgreso(i, n, 'Volviendo a leer con más cuidado…');
    try {
      const alt = await G.leerLineas(m.pagina, Object.assign({
        alProgreso: (f) => { if (ev === sesion) pintarProgreso(i, n, 'Volviendo a leer con más cuidado…', f); },
      }, opciones));
      const puntaje = (r) => r.precios.items.filter((it) => !it.parcial && !it.inferida).length * 3
        + (r.precios.totales.length ? 1 : 0) - r.precios.items.filter((it) => it.parcial).length
        + (r.ident.ruc ? 2 : 0) + (r.ident.razon ? 2 : 0);
      return puntaje(O().leerHoja(alt.lineas)) > puntaje(a) ? alt : lec;
    } catch (e) {
      console.error(e);
      return lec;
    }
  }

  /** Con lo leído, arma los postores y decide. */
  function armar(sesion) {
    sesion.postores = O().armarPostores(sesion.hojas.map((m) => ({
      id: m.id, grupo: m.grupo, lineas: sesion.lecturas.get(m.id).lineas, origen: sesion.lecturas.get(m.id).origen,
    })));
    sesion.postores.forEach((p) => {
      const suyas = sesion.hojas.filter((m) => p.hojas.includes(m.id));
      const primera = suyas[0];
      // si el paquete junta varios archivos y este postor es de uno solo, se le nombra con el archivo
      const unSoloArchivo = suyas.length && suyas.every((m) => m.nombreArchivo === suyas[0].nombreArchivo);
      p.nombreGrupo = primera ? (primera.variosArchivos && unSoloArchivo ? primera.nombreArchivo : primera.nombreGrupo) : '';
    });
    sesion.hojas.forEach((m) => {
      const lec = sesion.lecturas.get(m.id);
      const p = sesion.postores.find((x) => x.hojas.includes(m.id));
      if (!p || !lec) return;
      if (lec.fallo) p.extra.push(`La hoja ${m.numero} no se pudo leer (${lec.error || 'error desconocido'}). Pulsa «Copiar diagnóstico» y mándaselo a quien te ayuda.`);
      else if (!lec.lineas.length) p.extra.push(`De la hoja ${m.numero} no salió ningún texto: puede estar en blanco, muy borrosa o con letra muy chica.`);
    });
    // postores que se llaman igual (vienen del mismo archivo): se distinguen por su hoja
    const repetidos = {};
    sesion.postores.forEach((p) => { repetidos[p.nombreGrupo] = (repetidos[p.nombreGrupo] || 0) + 1; });
    sesion.postores.forEach((p) => {
      if (p.nombreGrupo && repetidos[p.nombreGrupo] > 1) {
        const m = sesion.hojas.find((x) => x.id === p.hojas[0]);
        p.nombreGrupo += ` · hoja ${m ? m.numero : '?'}`;
      }
    });
    sesion.postores.forEach((p) => O().recalcular(p));
    sesion.sel = sesion.postores.length ? sesion.postores[0].id : null;
    sesion.hojaVista = sesion.postores.length ? sesion.postores[0].hojas[0] : null;
    sesion.res = O().evaluar(sesion.postores);
  }

  /* ---------- pantalla del resultado ---------- */

  const postorDe = (id) => ev.postores.find((p) => p.id === id);
  const rankDe = (id) => ev.res.ranking.find((r) => r.id === id);

  function render() {
    if (!ev || !ev.postores) return;
    const n = ev.postores.length;
    $('#ofSub').textContent = `${n} postor${n === 1 ? '' : 'es'} · ${ev.hojas.length} hoja${ev.hojas.length === 1 ? '' : 's'} leída${ev.hojas.length === 1 ? '' : 's'}`;
    const izq = h('div', { class: 'of-izq' },
      h('div', { id: 'ofGanador' }),
      h('div', { class: 'of-tabla-caja' }, tabla()),
      h('div', { id: 'ofAvisos' }),
      h('div', { id: 'ofDetalle' }),
      h('div', { id: 'ofPorItem' }));
    const der = h('aside', { class: 'of-der' },
      h('div', { class: 'of-der-cab', id: 'ofHojas' }),
      h('div', { class: 'of-der-hoja', id: 'ofVista' }),
      h('div', { class: 'of-der-texto', id: 'ofTexto' }));
    $('#ofCuerpo').replaceChildren(izq, der);
    pie();
    pintarResultado();
    pintarDetalle();
    pintarVista();
    ajustarTodos();
    // la ventana aún no se había dibujado cuando se midieron los campos: se mide otra vez
    requestAnimationFrame(ajustarTodos);
  }

  function pie() {
    $('#ofPie').replaceChildren(
      h('span', { class: 'of-pie-nota' }, 'Gana el menor precio entre los que cumplen. Corrige lo que haga falta: se recalcula solo.'),
      h('span', { class: 'espacio' }),
      h('button', { class: 'btn btn-fantasma', title: 'Copia lo que se leyó de cada hoja y cómo se interpretó: sirve para pedir ayuda si algo no sale', onclick: copiarDiagnostico }, 'Copiar diagnóstico'),
      h('button', { class: 'btn btn-suave', title: 'Copia el cuadro para pegarlo en Excel u otro programa', onclick: copiarCuadro }, 'Copiar cuadro'),
      h('button', { class: 'btn btn-suave', onclick: bajarExcel }, 'Excel'),
      h('button', { class: 'btn btn-secundario', title: 'Agrega al expediente una hoja con este cuadro, como sustento', onclick: agregarHoja }, 'Agregar hoja resumen'),
      h('button', { class: 'btn btn-primario', onclick: cerrar }, 'Cerrar'));
  }

  const CAMPOS = [
    ['plazo', 'Plazo de entrega'], ['validez', 'Validez'], ['garantia', 'Garantía'], ['pago', 'Forma de pago'],
  ];

  function tabla() {
    const cab = h('tr', {},
      h('th', { class: 'c-cumple', title: 'Cumple las especificaciones' }, 'Cumple'),
      h('th', { class: 'c-puesto' }, 'Puesto'),
      h('th', { class: 'c-postor' }, 'Postor'),
      h('th', { class: 'c-total' }, 'Precio total'),
      CAMPOS.map(([, t]) => h('th', {}, t)),
      h('th', { class: 'c-acc' }, ''));
    const filas = ev.postores.map((p) => {
      const razon = campo(p.razon, 'of-razon', p.nombreGrupo || 'Razón social', 'Razón social', (v) => { p.razon = v; reevaluar(); });
      razon.addEventListener('focus', () => señalar(p, 'razon'));
      const ruc = h('input', { type: 'text', class: 'of-in of-ruc', value: p.ruc, placeholder: 'RUC', inputmode: 'numeric', 'aria-label': 'RUC' });
      ruc.addEventListener('change', () => { p.ruc = ruc.value.replace(/\D/g, ''); ruc.value = p.ruc; reevaluar(); });
      ruc.addEventListener('focus', () => señalar(p, 'ruc'));
      const total = h('input', { type: 'text', class: 'of-in of-total', value: p.total != null ? O().fmt(p.total) : '', placeholder: '—', inputmode: 'decimal', 'aria-label': 'Precio total' });
      total.addEventListener('focus', () => señalar(p, 'total'));
      total.addEventListener('change', () => {
        const v = O().leerMonto(total.value);
        p.totalDeclarado = v;
        reevaluar();
        total.value = p.total != null ? O().fmt(p.total) : '';
      });
      const celdas = CAMPOS.map(([k, t]) => h('td', { 'data-campo': k }, campo(p[k], '', '—', t, (v) => {
        p[k] = v;
        if (k === 'plazo') p.plazoDias = O().diasDe(p.plazo);
        if (k === 'validez') p.validezDias = O().diasDe(p.validez);
        reevaluar();
      })));
      const cumple = h('input', { type: 'checkbox', checked: p.cumple !== false, 'aria-label': 'Cumple' });
      cumple.addEventListener('change', () => { p.cumple = cumple.checked; reevaluar(); });
      return h('tr', { 'data-id': p.id, onclick: (e) => { if (!e.target.closest('input,button')) elegir(p.id); } },
        h('td', { class: 'c-cumple' }, cumple),
        h('td', { class: 'c-puesto' }, h('span', { class: 'of-puesto', 'data-puesto': p.id }, '—')),
        h('td', { class: 'c-postor' }, razon, h('div', { class: 'of-ruc-fila' }, ruc, h('span', { class: 'of-ruc-ok', 'data-ruc': p.id }))),
        h('td', { class: 'c-total' }, total, h('div', { class: 'of-total-de', 'data-totalde': p.id })),
        celdas,
        h('td', { class: 'c-acc' },
          h('button', { class: 'btn btn-mini', title: 'Copiar razón social, RUC y precio de este postor', onclick: () => copiarFila(p) }, ICO('i-duplicar')),
          h('button', { class: 'btn btn-mini btn-peligro-suave', title: 'Quitar este postor del cuadro', onclick: () => quitar(p.id) }, ICO('i-cerrar'))));
    });
    return h('table', { class: 'of-tabla' }, h('thead', {}, cab), h('tbody', {}, filas));
  }

  /** Lo que cambia con cada corrección: el ganador, los puestos y los avisos. */
  function pintarResultado() {
    if (!ev || !ev.postores) return;
    const res = ev.res;
    const gan = res.ganadores.map(postorDe).filter(Boolean);

    // el ganador
    const caja = $('#ofGanador');
    if (gan.length) {
      const p = gan[0];
      const d = res.diferencia;
      const rival = d && postorDe(d.contra);
      caja.replaceChildren(h('div', { class: 'of-ganador' },
        h('div', { class: 'of-ganador-etiqueta' }, gan.length > 1 ? 'EMPATE EN EL MENOR PRECIO' : 'MENOR PRECIO'),
        h('div', { class: 'of-ganador-fila' },
          h('div', { class: 'of-ganador-datos' },
            h('div', { class: 'of-ganador-nombre' }, gan.map((g) => g.razon || g.nombreGrupo || 'Postor').join('  ·  ')),
            h('div', { class: 'of-ganador-ruc' }, gan.length === 1 ? (p.ruc ? 'RUC ' + p.ruc : 'RUC no leído') : ''),
            d && gan.length === 1 ? h('div', { class: 'of-ganador-dif' },
              `${d.porcentaje.toLocaleString('es-PE')} % menos que ${rival ? (rival.razon || rival.nombreGrupo || 'el siguiente') : 'el siguiente'} (${dinero(d.monto, p.moneda)} de diferencia)`) : null),
          h('div', { class: 'of-ganador-monto' }, dinero(p.total, p.moneda))),
        gan.length === 1 ? h('div', { class: 'of-ganador-copiar' },
          h('button', { class: 'btn btn-mini', onclick: () => copiar(p.razon) }, 'Copiar razón social'),
          h('button', { class: 'btn btn-mini', onclick: () => copiar(p.ruc) }, 'Copiar RUC'),
          h('button', { class: 'btn btn-mini', onclick: () => copiar(p.total.toFixed(2)) }, 'Copiar monto'),
          h('button', { class: 'btn btn-mini', onclick: () => copiar([p.razon, p.ruc, p.total.toFixed(2)].join('\t')) }, 'Copiar los tres')) : null));
    } else {
      caja.replaceChildren(h('div', { class: 'of-ganador of-sin' },
        h('div', { class: 'of-ganador-etiqueta' }, 'SIN GANADOR TODAVÍA'),
        h('div', { class: 'of-ganador-dif' }, res.avisos[0] || 'Falta al menos un precio.')));
    }

    // puestos, filas y marcas del RUC
    ev.postores.forEach((p) => {
      const tr = $(`#ofCuerpo tr[data-id="${p.id}"]`);
      if (!tr) return;
      const r = rankDe(p.id);
      const esGanador = res.ganadores.includes(p.id);
      tr.classList.toggle('of-gana', esGanador);
      tr.classList.toggle('of-fuera', p.cumple === false);
      tr.classList.toggle('of-sel', ev.sel === p.id);
      const pu = tr.querySelector('[data-puesto]');
      pu.textContent = r ? '#' + r.rank : '—';
      pu.classList.toggle('of-puesto-1', !!r && r.rank === 1);
      const ok = tr.querySelector('[data-ruc]');
      ok.textContent = !p.ruc ? '' : O().rucValido(p.ruc) ? '✓ RUC válido' : '⚠ RUC no cuadra';
      ok.classList.toggle('mal', !!p.ruc && !O().rucValido(p.ruc));
      const td = tr.querySelector('[data-totalde]');
      td.textContent = p.totalDe ? ({ declarado: 'según su oferta', 'declarado con IGV': 'su total incluye el IGV', 'suma de ítems': 'suma de sus ítems' }[p.totalDe] || p.totalDe) : '';
      // el plazo más corto se destaca
      CAMPOS.forEach(([k]) => {
        const c = tr.querySelector(`td[data-campo="${k}"]`);
        if (c && k === 'plazo') c.classList.toggle('of-mejor', !!(res.mejorPlazo && res.mejorPlazo.includes(p.id)));
      });
    });

    // avisos
    const todos = res.avisos.map((a) => ({ a }));
    ev.postores.forEach((p) => p.avisos.forEach((a) => todos.push({ a, de: p.razon || p.nombreGrupo || 'Postor ' + p.id.slice(1), id: p.id })));
    const av = $('#ofAvisos');
    if (!todos.length) av.replaceChildren(h('div', { class: 'of-ok' }, '✓ Los datos leídos son coherentes: cada ítem cuadra y los totales coinciden.'));
    else av.replaceChildren(h('div', { class: 'of-avisos' },
      h('b', {}, 'Revisa antes de decidir'),
      h('ul', {}, todos.map((t) => h('li', { onclick: t.id ? () => elegir(t.id) : null }, t.de ? h('em', {}, t.de + ': ') : null, t.a)))));
    pintarPorItem();
    pintarResumenDetalle();
  }

  function reevaluar() {
    ev.res = O().evaluar(ev.postores);
    pintarResultado();
  }

  function elegir(id) {
    if (!ev || ev.sel === id) return;
    ev.sel = id;
    ev.marca = null;
    const p = postorDe(id);
    ev.hojaVista = p.hojas[0] || null;
    $$tr().forEach((tr) => tr.classList.toggle('of-sel', tr.dataset.id === id));
    pintarDetalle();
    pintarVista();
  }
  const $$tr = () => Array.from(document.querySelectorAll('#ofCuerpo tbody tr'));

  function quitar(id) {
    ev.postores = ev.postores.filter((p) => p.id !== id);
    if (ev.sel === id) { ev.sel = ev.postores[0] ? ev.postores[0].id : null; ev.hojaVista = ev.postores[0] ? ev.postores[0].hojas[0] : null; }
    ev.res = O().evaluar(ev.postores);
    render();
  }

  /* ---------- los ítems de un postor ---------- */

  function pintarDetalle() {
    const cont = $('#ofDetalle');
    if (!cont) return;
    const p = ev.sel && postorDe(ev.sel);
    if (!p) { cont.replaceChildren(); return; }
    const datos = datosDelPostor(p);
    if (!p.items.length) {
      cont.replaceChildren(datos, h('details', { class: 'of-det', open: true },
        h('summary', {}, `Ítems de ${p.razon || p.nombreGrupo || 'este postor'}`),
        h('p', { class: 'nota' }, 'No se leyó ninguna fila de ítems de este postor; solo el total. Mira la hoja de la derecha.')));
      ajustarTodos();
      return;
    }
    const filas = p.items.map((it) => {
      const cant = h('input', { type: 'text', class: 'of-in der', value: it.cant == null ? '' : String(it.cant), placeholder: '?', inputmode: 'decimal' });
      const pu = h('input', { type: 'text', class: 'of-in der', value: it.pu == null ? '' : O().fmt(it.pu), placeholder: '?', inputmode: 'decimal' });
      const tot = h('input', { type: 'text', class: 'of-in der', value: O().fmt(it.total), inputmode: 'decimal' });
      const desc = campo(it.desc, '', '', 'Descripción', (v) => { it.desc = v; reevaluar(); });
      const cambia = (campo) => () => {
        if (campo === 'cant') it.cant = cant.value.trim() ? O().leerMonto(cant.value) : null;
        if (campo === 'pu') it.pu = pu.value.trim() ? O().leerMonto(pu.value) : null;
        if (campo === 'tot') it.total = O().leerMonto(tot.value) || 0;
        // cantidad o unitario cambian el total de la fila (si hay los dos); si se cambia el total se respeta
        if (campo !== 'tot' && it.cant != null && it.pu != null) { it.total = Math.round(it.cant * it.pu * 100) / 100; tot.value = O().fmt(it.total); }
        it.inferida = false;
        it.noCuadra = it.cant != null && it.pu != null && Math.abs(Math.round(it.cant * it.pu * 100) / 100 - it.total) > 0.05
          ? { calc: Math.round(it.cant * it.pu * 100) / 100, dice: it.total } : null;
        it.parcial = it.cant == null || it.pu == null ? it.parcial : false;
        cant.value = it.cant == null ? '' : String(it.cant); pu.value = it.pu == null ? '' : O().fmt(it.pu);
        reevaluar();
        sincronizarTotal(p);
      };
      cant.addEventListener('change', cambia('cant')); pu.addEventListener('change', cambia('pu')); tot.addEventListener('change', cambia('tot'));
      [cant, pu, tot, desc].forEach((e) => e.addEventListener('focus', () => señalar(p, 'item', it)));
      return h('tr', { class: it.inferida || it.parcial || it.noCuadra ? 'of-dudosa' : '' },
        h('td', { class: 'n' }, it.n), h('td', { class: 'desc' }, desc), h('td', {}, it.unidad || ''),
        h('td', {}, cant), h('td', {}, pu), h('td', {}, tot));
    });
    cont.replaceChildren(datos, h('details', { class: 'of-det', open: true },
      h('summary', {}, `Ítems de ${p.razon || p.nombreGrupo || 'este postor'}`),
      h('table', { class: 'of-items' },
        h('thead', {}, h('tr', {}, h('th', {}, 'N.º'), h('th', {}, 'Descripción'), h('th', {}, 'Und.'), h('th', {}, 'Cant.'), h('th', {}, 'P. unitario'), h('th', {}, 'Total'))),
        h('tbody', {}, filas)),
      h('div', { class: 'of-suma', id: 'ofSuma' })));
    pintarResumenDetalle();
    ajustarTodos();
  }


  /** Los datos del Formato 1, para copiar uno por uno y pegarlos donde haga falta. */
  const DATOS = [
    ['razon', 'Razón social'], ['ruc', 'RUC'], ['direccion', 'Domicilio'], ['telefono', 'Teléfono'],
    ['correo', 'Correo'], ['representante', 'Representante legal'], ['dni', 'DNI'],
  ];
  function datosDelPostor(p) {
    const filas = DATOS.map(([k, t]) => {
      const entrada = campo(p[k], '', '—', t, (v) => {
        p[k] = k === 'ruc' || k === 'dni' ? v.replace(/\D/g, '') : v;
        if (k === 'correo') p.correoDudoso = false;
        reevaluar();
        entrada.value = p[k];
        if (k === 'razon' || k === 'ruc') { const fila = $(`#ofCuerpo tr[data-id="${p.id}"]`); if (fila) { fila.querySelector(k === 'razon' ? '.of-razon' : '.of-ruc').value = p[k]; } }
      });
      if (k === 'razon' || k === 'ruc') entrada.addEventListener('focus', () => señalar(p, k));
      const dudoso = k === 'correo' && p.correoDudoso;
      return h('div', { class: 'of-dato' },
        h('label', {}, t),
        entrada,
        dudoso ? h('span', { class: 'of-dato-duda', title: 'El correo se leyó de un escaneo y la @ no se reconoció bien' }, 'revisa la @') : null,
        h('button', { class: 'btn btn-mini', title: 'Copiar ' + t.toLowerCase(), onclick: () => copiar(entrada.value) }, ICO('i-duplicar')));
    });
    return h('details', { class: 'of-det', open: true },
      h('summary', {}, 'Datos del postor (Formato 1)'),
      h('div', { class: 'of-datos' }, filas));
  }

  /** Si el postor no declaró total, el total sigue a la suma de sus ítems. */
  function sincronizarTotal(p) {
    const tr = $(`#ofCuerpo tr[data-id="${p.id}"] .of-total`);
    if (tr) tr.value = p.total != null ? O().fmt(p.total) : '';
  }

  function pintarResumenDetalle() {
    const cont = $('#ofSuma');
    if (!cont) return;
    const p = ev.sel && postorDe(ev.sel);
    if (!p || p.sumaItems == null) { cont.replaceChildren(); return; }
    const difiere = p.totalDeclarado != null && Math.abs(p.sumaItems - p.totalDeclarado) > 0.05 && Math.abs(p.sumaItems * 1.18 - p.totalDeclarado) > 0.1;
    cont.replaceChildren(...[
      h('span', {}, 'Suma de los ítems: ', h('b', {}, O().fmt(p.sumaItems))),
      p.totalDeclarado != null ? h('span', {}, ' · Total de la oferta: ', h('b', {}, O().fmt(p.totalDeclarado))) : null,
      difiere ? h('button', { class: 'btn btn-suave', onclick: () => { p.totalDeclarado = p.sumaItems; reevaluar(); sincronizarTotal(p); } }, 'Usar la suma como total') : null,
    ].filter(Boolean));
  }

  /** Cada ítem, con el menor precio de cada uno marcado. */
  function pintarPorItem() {
    const cont = $('#ofPorItem');
    if (!cont) return;
    const filas = ev.res.filas;
    if (!filas.length) { cont.replaceChildren(); return; }
    const ps = ev.postores.filter((p) => p.items.length);
    const cuerpo = filas.map((f) => h('tr', {},
      h('td', { class: 'n' }, f.n), h('td', { class: 'desc' }, f.desc), h('td', { class: 'der' }, f.cant),
      ps.map((p) => {
        const it = f.celdas.get(p.id);
        return h('td', { class: 'der' + (it && f.mejor != null && it.pu === f.mejor && p.cumple !== false ? ' of-mejor' : '') }, it ? O().fmt(it.pu) : '—');
      })));
    cont.replaceChildren(h('details', { class: 'of-det' },
      h('summary', {}, 'Comparación por ítem (precio unitario)'),
      h('table', { class: 'of-items' },
        h('thead', {}, h('tr', {}, h('th', {}, 'N.º'), h('th', {}, 'Descripción'), h('th', {}, 'Cant.'), ps.map((p) => h('th', { class: 'der' }, (p.razon || p.nombreGrupo || 'Postor').slice(0, 24))))),
        h('tbody', {}, cuerpo)),
      h('p', { class: 'nota' }, 'En verde, el menor precio unitario de cada ítem. Si se adjudica por ítem, mira esta tabla; si es por el total, manda el cuadro de arriba.')));
  }

  /* ---------- la hoja de verdad, al lado ---------- */

  const ETQ_FORMATO = { 1: 'Formato 1', 5: 'Formato 5' };

  function pintarVista() {
    const cab = $('#ofHojas'), cont = $('#ofVista');
    if (!cab) return;
    const p = ev.sel && postorDe(ev.sel);
    if (!p) { cab.replaceChildren(); cont.replaceChildren(); return; }
    cab.replaceChildren(
      h('b', {}, p.razon || p.nombreGrupo || 'Postor'),
      ...p.hojas.map((uid) => {
        const m = ev.hojas.find((x) => x.id === uid);
        const f = ev.formatos.get(uid);
        return h('button', {
          class: 'of-chip' + (uid === ev.hojaVista ? ' activo' : ''),
          onclick: () => { ev.hojaVista = uid; pintarVista(); },
          title: 'Hoja ' + (m ? m.numero : ''),
        }, (ETQ_FORMATO[f] || 'Hoja') + ' · p. ' + (m ? m.numero : '?'));
      }));
    pintarTexto();
    const uid = ev.hojaVista;
    const m = ev.hojas.find((x) => x.id === uid);
    if (!m) { cont.replaceChildren(); return; }
    const poner = (lienzo) => {
      const caja = h('div', { class: 'of-hoja-caja' }, lienzo);
      const mc = ev.marca && ev.marca.hoja === uid ? ev.marca : null;
      if (mc) {
        const pad = 0.004;
        caja.append(h('div', { class: 'of-marca', style: `left:${(mc.x0 - pad) * 100}%;top:${(mc.y0 - pad) * 100}%;width:${(mc.x1 - mc.x0 + 2 * pad) * 100}%;height:${(mc.y1 - mc.y0 + 2 * pad) * 100}%` }));
      }
      $('#ofVista').replaceChildren(caja);
      const m2 = caja.querySelector('.of-marca');
      if (m2) m2.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const cache = vistas.get(uid);
    if (cache) { poner(cache); return; }
    cont.replaceChildren(h('div', { class: 'of-cargando' }, 'Dibujando la hoja…'));
    G.renderGrande(m.pagina, 1100).then((lienzo) => {
      lienzo.className = 'of-lienzo';
      vistas.set(uid, lienzo);
      if (ev && ev.hojaVista === uid) poner(lienzo);
    }).catch(() => { if (ev && ev.hojaVista === uid) $('#ofVista').replaceChildren(h('div', { class: 'of-cargando' }, 'No se pudo dibujar la hoja.')); });
  }

  /** El texto tal como se leyó de la hoja que se está viendo: sirve para entender por qué falló algo. */
  function pintarTexto() {
    const cont = $('#ofTexto');
    if (!cont) return;
    const lec = ev.hojaVista && ev.lecturas.get(ev.hojaVista);
    if (!lec) { cont.replaceChildren(); return; }
    const texto = G.unirLineas(lec.lineas, false);
    const p = ev.sel && postorDe(ev.sel);
    const sinPrecio = !!p && p.avisos.some((a) => /ningún precio/.test(a));
    cont.replaceChildren(h('details', { class: 'of-det', open: sinPrecio },
      h('summary', {}, `Texto leído de esta hoja (${lec.lineas.length} líneas${lec.origen === 'ocr' ? ', de un escaneo' : ''})`),
      h('div', { class: 'of-texto-pie' },
        h('button', { class: 'btn btn-mini', onclick: () => copiar(texto) }, 'Copiar todo el texto'),
        h('span', { class: 'nota' }, 'Es lo que Pdflash entendió. Si falta algo aquí, falta también en el cuadro.')),
      h('pre', { class: 'of-texto' }, texto)));
  }

  /** Enseña en la hoja de verdad de dónde salió un dato (al entrar en su casilla). */
  function señalar(p, que, it) {
    const c = it ? it.caja : p.donde && p.donde[que];
    if (!ev || !c) return;
    ev.sel = p.id;
    ev.hojaVista = c.hoja;
    ev.marca = c;
    $$tr().forEach((tr) => tr.classList.toggle('of-sel', tr.dataset.id === p.id));
    pintarVista();
  }

  /* ---------- salidas ---------- */

  async function copiar(texto) {
    if (!texto) { G.aviso('No hay nada que copiar: ese dato está vacío.', 'error'); return; }
    try {
      await navigator.clipboard.writeText(texto);
      G.aviso('Copiado: ' + (texto.length > 60 ? texto.slice(0, 57) + '…' : texto.replace(/\t/g, '  ')), 'ok');
    } catch (e) {
      G.aviso('El navegador no dejó copiar. Selecciona el dato y usa Ctrl+C.', 'error');
    }
  }

  /** Todo lo que se leyó y cómo se entendió, en texto: para pegarlo en un mensaje si algo falla. */
  function copiarDiagnostico() {
    const v = (document.querySelector('script[src*="app.js"]') || {}).src || '';
    const partes = [`DIAGNÓSTICO DE LECTURA · Pdflash ${(/v=([0-9a-z]+)/.exec(v) || [])[1] || 'archivo único'}`,
      `${ev.postores.length} postores · ${ev.hojas.length} hojas`];
    ev.hojas.forEach((m) => {
      const lec = ev.lecturas.get(m.id) || { lineas: [] };
      const lec1 = O().leerHoja(lec.lineas);
      const p = ev.postores.find((x) => x.hojas.includes(m.id));
      partes.push('', `=== Hoja ${m.numero} · paquete «${m.nombreGrupo}» · archivo «${m.nombreArchivo}» · Formato ${lec1.formato || '?'} · ${lec.origen === 'ocr' ? 'escaneo leído' : 'texto del documento'}${lec.fallo ? ' · FALLÓ: ' + lec.error : ''} · ${lec.lineas.length} líneas`);
      partes.push(G.unirLineas(lec.lineas, false).split('\n').slice(0, 90).join('\n'));
      partes.push(`-- Interpretación: razón=${lec1.ident.razon || '—'} · RUC=${lec1.ident.ruc || '—'} · ítems=${JSON.stringify(lec1.precios.items.map((i) => [i.cant, i.pu, i.total]))} · totales=${JSON.stringify(lec1.precios.totales.map((t) => t.v))}${p ? ' · postor ' + p.id : ''}`);
    });
    copiar(partes.join('\n'));
  }

  function copiarFila(p) {
    copiar([p.razon, p.ruc, p.total != null ? p.total.toFixed(2) : ''].join('\t'));
  }

  function copiarCuadro() {
    copiar(O().aTexto(ev.postores, ev.res));
  }

  function filasCuadro() {
    const cab = ['Puesto', 'Postor', 'RUC', 'Moneda', 'Precio total', 'Plazo de entrega', 'Validez de la oferta', 'Garantía', 'Forma de pago', 'Cumple', 'Resultado'];
    const filas = ev.postores.map((p) => {
      const r = rankDe(p.id);
      const gana = ev.res.ganadores.includes(p.id);
      return [r ? r.rank : '', p.razon || p.nombreGrupo, p.ruc, p.moneda === 'USD' ? 'US$' : 'S/', p.total != null ? p.total : '', p.plazo, p.validez, p.garantia, p.pago,
        p.cumple === false ? 'No' : 'Sí', gana ? 'GANADOR (menor precio)' : ''];
    });
    return { cab, filas };
  }

  async function bajarExcel() {
    try {
      const { cab, filas } = filasCuadro();
      const libro = XLSX.utils.book_new();
      const hoja1 = XLSX.utils.aoa_to_sheet([cab].concat(filas));
      hoja1['!cols'] = [8, 38, 14, 8, 14, 20, 20, 16, 20, 8, 24].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(libro, hoja1, 'Cuadro comparativo');
      const items = [['Postor', 'N.º', 'Descripción', 'Unidad', 'Cantidad', 'Precio unitario', 'Total']];
      ev.postores.forEach((p) => p.items.forEach((it) => items.push([p.razon || p.nombreGrupo, it.n, it.desc, it.unidad, it.cant, it.pu, it.total])));
      const hoja2 = XLSX.utils.aoa_to_sheet(items);
      hoja2['!cols'] = [34, 6, 60, 8, 10, 14, 14].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(libro, hoja2, 'Ítems');
      const bytes = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
      await G.guardarArchivo(new Uint8Array(bytes), 'Cuadro comparativo de ofertas.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { aDescargas: true });
      G.aviso('El cuadro está en Descargas, en Excel.', 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo armar el Excel: ' + e.message, 'error');
    }
  }

  /** Una hoja A4 apaisada con el cuadro, para dejar el sustento dentro del expediente. */
  async function hojaResumenPdf() {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const normal = await doc.embedStandardFont(StandardFonts.Helvetica);
    const negrita = await doc.embedStandardFont(StandardFonts.HelveticaBold);
    const juego = new Set(normal.getCharacterSet());
    const seguro = (s) => Array.from(String(s == null ? '' : s)).map((c) => (juego.has(c.codePointAt(0)) ? c : '?')).join('');
    const W = 841.89, H = 595.28, M = 36;
    const pag = doc.addPage([W, H]);
    const recorta = (txt, fuente, tam, ancho) => {
      let t = seguro(txt);
      if (fuente.widthOfTextAtSize(t, tam) <= ancho) return t;
      while (t.length > 1 && fuente.widthOfTextAtSize(t + '…', tam) > ancho) t = t.slice(0, -1);
      return t + '...';
    };
    const texto = (t, x, y, tam, fuente, color) => pag.drawText(seguro(t), { x, y, size: tam, font: fuente || normal, color: color || rgb(0.1, 0.1, 0.12) });
    texto('CUADRO COMPARATIVO DE OFERTAS', M, H - M - 8, 16, negrita);
    const hoy = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    texto(`Lima, ${hoy} · Criterio: menor precio entre las ofertas que cumplen`, M, H - M - 26, 9.5, normal, rgb(0.35, 0.36, 0.4));

    const cols = [['Puesto', 36], ['Postor', 232], ['RUC', 78], ['Precio total', 84], ['Plazo de entrega', 110], ['Validez', 96], ['Garantía', 66], ['Cumple', 40]];
    let x0 = M, y = H - M - 56;
    pag.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.93, 0.93, 0.92) });
    cols.forEach(([t, w]) => { texto(t, x0 + 4, y, 8.5, negrita); x0 += w; });
    y -= 22;
    const ordenados = ev.postores.slice().sort((a, b) => {
      const ra = rankDe(a.id), rb = rankDe(b.id);
      return (ra ? ra.rank : 999) - (rb ? rb.rank : 999);
    });
    ordenados.forEach((p) => {
      const r = rankDe(p.id);
      const gana = ev.res.ganadores.includes(p.id);
      if (gana) pag.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(0.87, 0.96, 0.9) });
      const vals = [r ? '#' + r.rank : '—', p.razon || p.nombreGrupo, p.ruc, p.total != null ? dinero(p.total, p.moneda) : '—', p.plazo, p.validez, p.garantia, p.cumple === false ? 'No' : 'Sí'];
      let x = M;
      cols.forEach(([, w], i) => {
        const f = i === 1 && gana ? negrita : normal;
        texto(recorta(vals[i], f, 9, w - 8), x + 4, y, 9, f);
        x += w;
      });
      pag.drawLine({ start: { x: M, y: y - 8 }, end: { x: W - M, y: y - 8 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
      y -= 22;
    });
    y -= 10;
    const g = ev.res.ganadores.map(postorDe).filter(Boolean);
    if (g.length) {
      const d = ev.res.diferencia;
      const rival = d && postorDe(d.contra);
      texto('Resultado', M, y, 11, negrita); y -= 16;
      texto(`${g.length > 1 ? 'Empate en el menor precio: ' : 'Menor precio: '}${g.map((x) => x.razon || x.nombreGrupo).join(' y ')}${g.length === 1 ? ` (RUC ${g[0].ruc || 's/n'}) por ${dinero(g[0].total, g[0].moneda)}` : ''}.`, M, y, 10); y -= 14;
      if (d && g.length === 1 && rival) { texto(`Es ${d.porcentaje.toLocaleString('es-PE')} % menor que la oferta de ${rival.razon || rival.nombreGrupo} (${dinero(d.monto, g[0].moneda)} de diferencia).`, M, y, 10); y -= 14; }
    }
    const fuera = ev.postores.filter((p) => p.cumple === false);
    if (fuera.length) { texto(`No cumplen y no entran en la comparación: ${fuera.map((p) => p.razon || p.nombreGrupo).join(', ')}.`, M, y, 9.5, normal, rgb(0.4, 0.2, 0.2)); y -= 14; }
    texto('Elaborado con Pdflash a partir de los Formatos N.º 1 y N.º 5 de cada postor.', M, M - 6, 8, normal, rgb(0.5, 0.5, 0.55));
    return doc.save();
  }

  async function agregarHoja() {
    try {
      const bytes = await hojaResumenPdf();
      const archivo = new File([bytes], 'Cuadro comparativo de ofertas.pdf', { type: 'application/pdf' });
      await G.evaluacion.anadir([archivo]);
      G.aviso('Se agregó la hoja «Cuadro comparativo de ofertas» al final del expediente.', 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo armar la hoja: ' + e.message, 'error');
    }
  }

  G.evaluarOfertas = abrir;
  G.cerrarEvaluarOfertas = cerrar;
})();
