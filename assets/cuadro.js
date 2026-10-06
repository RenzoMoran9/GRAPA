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

  /*
   * La pantalla es un cuadro comparativo como el del expediente: cada postor es una
   * columna y cada fila un concepto (los ítems, el total, el plazo…). Debajo van los
   * datos del Formato 1 de todos, también en columnas, y los ítems del postor elegido
   * para corregirlos. A la derecha, la hoja de verdad.
   */
  function render() {
    if (!ev || !ev.postores) return;
    const n = ev.postores.length;
    $('#ofSub').textContent = `${n} postor${n === 1 ? '' : 'es'} · ${ev.hojas.length} hoja${ev.hojas.length === 1 ? '' : 's'} leída${ev.hojas.length === 1 ? '' : 's'}`;
    const bloque = (titulo, nota, cuerpo, id) => h('section', { class: 'of-bloque', id },
      h('div', { class: 'of-bloque-cab' }, h('h4', {}, titulo), nota ? h('span', { class: 'of-bloque-nota' }, nota) : null),
      cuerpo);
    const izq = h('div', { class: 'of-izq' },
      h('div', { id: 'ofGanador' }),
      bloque('Cuadro comparativo', 'Toca el nombre de un postor para ver sus hojas. Todo se puede corregir: se recalcula solo.',
        h('div', { class: 'cc-caja' }, cuadroComparativo())),
      h('div', { id: 'ofAvisos' }),
      bloque('Datos de los postores', 'Formato 1 · cada dato se copia con su botón',
        h('div', { class: 'cc-caja' }, datosDeTodos())),
      h('div', { id: 'ofDetalle' }));
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
      h('span', { class: 'of-pie-nota' }, 'Gana el menor precio total entre los que cumplen.'),
      h('span', { class: 'espacio' }),
      h('button', { class: 'btn btn-fantasma', title: 'Copia lo que se leyó de cada hoja y cómo se interpretó: sirve para pedir ayuda si algo no sale', onclick: copiarDiagnostico }, 'Copiar diagnóstico'),
      h('button', { class: 'btn btn-suave', title: 'Copia el cuadro para pegarlo en Excel o en Word', onclick: copiarCuadro }, 'Copiar cuadro'),
      h('button', { class: 'btn btn-suave', onclick: bajarExcel }, 'Excel'),
      h('button', { class: 'btn btn-suave', title: 'Descarga un trabajo para la app HNAL: en «Trabajos» → «Importar trabajo (.json)» llena solos el Cuadro de Validación y el Cuadro Comparativo', onclick: llevarAHnal }, 'Llevar a HNAL'),
      h('button', { class: 'btn btn-secundario', title: 'Agrega al expediente una hoja con este cuadro, como sustento', onclick: agregarHoja }, 'Agregar hoja resumen'),
      h('button', { class: 'btn btn-primario', onclick: cerrar }, 'Cerrar'));
  }

  const CAMPOS = [
    ['marca', 'Marca'], ['modelo', 'Modelo'], ['procedencia', 'Procedencia'],
    ['plazo', 'Plazo de entrega'], ['validez', 'Validez de la oferta'], ['garantia', 'Garantía'], ['pago', 'Forma de pago'],
  ];

  /**
   * Las filas de ítems del cuadro: los ítems en fila con su par de cada postor
   * (ofertas.compararItems) o, si solo uno trae ítems, los suyos.
   */
  function filasDeItems() {
    if (ev.res.filas.length) return ev.res.filas;
    const p = ev.postores.find((q) => q.items.length);
    if (!p) return [];
    return p.items.map((it, k) => ({ n: k + 1, desc: it.desc, cant: it.cant, celdas: new Map([[p.id, it]]) }));
  }

  /** «5760 UNIDAD» de un ítem: la cantidad y la unidad, si se leyeron. */
  function cantidadDe(f) {
    const it = [...f.celdas.values()].find((x) => x.unidad) || {};
    return [f.cant != null ? O().fmt(f.cant).replace(/\.00$/, '') : '', it.unidad || ''].filter(Boolean).join(' ');
  }

  function cuadroComparativo() {
    const ps = ev.postores;
    const col = (p, attrs, ...hijos) => h('td', Object.assign({ 'data-col': p.id, onclick: (e) => { if (!e.target.closest('input,textarea,button,label')) elegir(p.id); } }, attrs), ...hijos);

    const cabeza = h('tr', {},
      h('th', { class: 'cc-concepto' }, h('span', { class: 'cc-titulo' }, 'Postor')),
      ps.map((p, k) => {
        const razon = campo(p.razon, 'of-razon', p.nombreGrupo || 'Razón social', 'Razón social', (v) => { p.razon = v; reevaluar(); sincronizarDato(p, 'razon'); });
        razon.addEventListener('focus', () => señalar(p, 'razon'));
        const ruc = h('input', { type: 'text', class: 'of-in of-ruc', value: p.ruc, placeholder: 'RUC', inputmode: 'numeric', 'aria-label': 'RUC', 'data-dato': 'ruc' });
        ruc.addEventListener('change', () => { p.ruc = ruc.value.replace(/\D/g, ''); ruc.value = p.ruc; reevaluar(); sincronizarDato(p, 'ruc'); });
        ruc.addEventListener('focus', () => señalar(p, 'ruc'));
        const cumple = h('input', { type: 'checkbox', checked: p.cumple !== false, 'aria-label': 'Cumple las especificaciones' });
        cumple.addEventListener('change', () => { p.cumple = cumple.checked; reevaluar(); });
        razon.dataset.dato = 'razon';
        return h('th', { class: 'cc-postor', 'data-col': p.id, onclick: (e) => { if (!e.target.closest('input,textarea,button,label')) elegir(p.id); } },
          h('div', { class: 'cc-cab' },
            h('span', { class: 'cc-num' }, 'POSTOR ' + (k + 1)),
            h('span', { class: 'of-puesto', 'data-puesto': p.id }, '—'),
            h('span', { class: 'espacio' }),
            h('label', { class: 'cc-cumple', title: 'Cumple las especificaciones técnicas. Si no cumple, no entra en la comparación.' }, cumple, 'Cumple'),
            h('button', { class: 'btn btn-mini', title: 'Copiar razón social, RUC y precio de este postor', onclick: () => copiarFila(p) }, ICO('i-duplicar')),
            h('button', { class: 'btn btn-mini btn-peligro-suave', title: 'Quitar este postor del cuadro', onclick: () => quitar(p.id) }, ICO('i-cerrar'))),
          razon,
          h('div', { class: 'of-ruc-fila' }, ruc, h('span', { class: 'of-ruc-ok', 'data-ruc': p.id })));
      }));

    const filas = [];
    const items = filasDeItems();
    if (items.length) {
      filas.push(h('tr', { class: 'cc-seccion' }, h('th', { colspan: ps.length + 1 }, items.length === 1 ? 'Lo ofertado' : `Lo ofertado · ${items.length} ítems`)));
      items.forEach((f, k) => {
        const cant = cantidadDe(f);
        filas.push(h('tr', { class: 'cc-item', 'data-fila': k },
          h('th', { class: 'cc-concepto' },
            h('div', { class: 'cc-item-desc' }, h('span', { class: 'cc-item-n' }, f.n), f.desc || 'Ítem ' + f.n),
            cant ? h('div', { class: 'cc-item-cant' }, 'Cantidad: ' + cant) : null),
          ps.map((p) => {
            const it = f.celdas.get(p.id);
            if (!it) return col(p, { class: 'cc-vacio' }, '—');
            const sub = it.cant != null && it.pu != null ? `${O().fmt(it.cant).replace(/\.00$/, '')} × ${O().fmt(it.pu)} = ${O().fmt(it.total)}` : O().fmt(it.total);
            return col(p, { class: 'cc-precio', 'data-item': k, onclick: () => { elegir(p.id); señalar(p, 'item', it); } },
              h('div', { class: 'cc-pu' }, it.pu != null ? dinero(it.pu, p.moneda) : '—', h('small', {}, ' c/u')),
              h('div', { class: 'cc-sub' }, sub),
              it.marca ? h('div', { class: 'cc-marca', title: it.deCotizacion ? 'Sale de su hoja de cotización' : null }, it.marca) : null,
              it.modelo || it.procedencia ? h('div', { class: 'cc-sub' }, [it.modelo && 'Modelo ' + it.modelo, it.procedencia].filter(Boolean).join(' · ')) : null);
          })));
      });
    }

    filas.push(h('tr', { class: 'cc-seccion' }, h('th', { colspan: ps.length + 1 }, 'La oferta')));
    filas.push(h('tr', { class: 'cc-total-fila' },
      h('th', { class: 'cc-concepto' }, 'Precio total'),
      ps.map((p) => {
        const total = h('input', { type: 'text', class: 'of-in of-total', value: p.total != null ? O().fmt(p.total) : '', placeholder: '—', inputmode: 'decimal', 'aria-label': 'Precio total' });
        total.addEventListener('focus', () => señalar(p, 'total'));
        total.addEventListener('change', () => {
          p.totalDeclarado = O().leerMonto(total.value);
          reevaluar();
          total.value = p.total != null ? O().fmt(p.total) : '';
        });
        return col(p, { class: 'cc-total' }, h('div', { class: 'cc-moneda-fila' }, h('span', { class: 'cc-moneda' }, p.moneda === 'USD' ? 'US$' : 'S/'), total),
          h('div', { class: 'of-total-de', 'data-totalde': p.id }));
      })));
    filas.push(h('tr', { class: 'cc-dif-fila' },
      h('th', { class: 'cc-concepto' }, 'Frente al menor precio'),
      ps.map((p) => col(p, { class: 'cc-dif', 'data-dif': p.id }, '—'))));
    CAMPOS.forEach(([k, t]) => filas.push(h('tr', { 'data-campo': k },
      h('th', { class: 'cc-concepto' }, t),
      ps.map((p) => col(p, { 'data-celda': k }, campo(p[k], '', '—', t, (v) => {
        p[k] = v;
        if (k === 'plazo') p.plazoDias = O().diasDe(p.plazo);
        if (k === 'validez') p.validezDias = O().diasDe(p.validez);
        reevaluar();
      }))))));

    return h('table', { class: 'cc-tabla' }, h('thead', {}, cabeza), h('tbody', {}, filas));
  }

  /** Los datos del Formato 1, para copiar uno por uno y pegarlos donde haga falta. */
  const DATOS = [
    ['razon', 'Razón social'], ['ruc', 'RUC'], ['direccion', 'Domicilio'], ['telefono', 'Teléfono'],
    ['correo', 'Correo'], ['representante', 'Representante legal'], ['dni', 'DNI'], ['contacto', 'Persona de contacto'],
  ];
  function datosDeTodos() {
    const ps = ev.postores;
    const cabeza = h('tr', {}, h('th', { class: 'cc-concepto' }, ''),
      ps.map((p, k) => h('th', { class: 'cc-postor cc-postor-chico', 'data-col': p.id, onclick: () => elegir(p.id) },
        h('span', { class: 'cc-num' }, 'POSTOR ' + (k + 1)), h('div', { class: 'cc-nombre', 'data-nombre': p.id }, p.razon || p.nombreGrupo || 'Postor'))));
    const filas = DATOS.map(([k, t]) => h('tr', {},
      h('th', { class: 'cc-concepto' }, t),
      ps.map((p) => {
        const entrada = campo(p[k], '', '—', t, (v) => {
          p[k] = k === 'ruc' || k === 'dni' ? v.replace(/\D/g, '') : v;
          if (k === 'correo') p.correoDudoso = false;
          entrada.value = p[k];
          reevaluar();
          sincronizarDato(p, k);
        });
        entrada.dataset.dato = k;
        entrada.addEventListener('focus', () => señalar(p, k));
        const dudoso = k === 'correo' && p.correoDudoso;
        return h('td', { 'data-col': p.id },
          h('div', { class: 'cc-dato' },
            entrada,
            h('button', { class: 'btn btn-mini', title: 'Copiar ' + t.toLowerCase(), onclick: () => copiar(entrada.value) }, ICO('i-duplicar'))),
          dudoso ? h('span', { class: 'of-dato-duda', title: 'El correo se leyó de un escaneo y la @ no se reconoció bien' }, 'revisa la @') : null);
      })));
    return h('table', { class: 'cc-tabla cc-datos' }, h('thead', {}, cabeza), h('tbody', {}, filas));
  }

  /** Un dato que está en las dos tablas (razón social y RUC) se corrige en las dos. */
  function sincronizarDato(p, k) {
    document.querySelectorAll(`#ofCuerpo [data-col="${p.id}"] [data-dato="${k}"]`).forEach((e) => {
      if (e.value !== (p[k] || '')) { e.value = p[k] || ''; if (e.tagName === 'TEXTAREA') ajustar(e); }
    });
    const nom = $(`#ofCuerpo [data-nombre="${p.id}"]`);
    if (nom) nom.textContent = p.razon || p.nombreGrupo || 'Postor';
  }

  /** Lo que cambia con cada corrección: el ganador, los puestos, las diferencias y los avisos. */
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
              `${dinero(d.monto, p.moneda)} menos que ${rival ? (rival.razon || rival.nombreGrupo || 'el siguiente') : 'el siguiente'} (${d.porcentaje.toLocaleString('es-PE')} % más barato)`) : null),
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

    // cada columna: ganador, fuera, elegida; puesto, RUC, de dónde sale el total y la diferencia
    const menor = gan.length ? gan[0].total : null;
    ev.postores.forEach((p) => {
      const r = rankDe(p.id);
      const esGanador = res.ganadores.includes(p.id);
      document.querySelectorAll(`#ofCuerpo [data-col="${p.id}"]`).forEach((c) => {
        c.classList.toggle('cc-gana', esGanador);
        c.classList.toggle('cc-fuera', p.cumple === false);
        c.classList.toggle('cc-sel', ev.sel === p.id);
      });
      const pu = $(`#ofCuerpo [data-puesto="${p.id}"]`);
      if (pu) {
        pu.textContent = p.cumple === false ? 'no cumple' : r ? r.rank + '.º' : '—';
        pu.classList.toggle('of-puesto-1', !!r && r.rank === 1);
        pu.classList.toggle('of-puesto-fuera', p.cumple === false);
      }
      const ok = $(`#ofCuerpo [data-ruc="${p.id}"]`);
      if (ok) {
        ok.textContent = !p.ruc ? '' : O().rucValido(p.ruc) ? '✓ válido' : '⚠ no cuadra';
        ok.classList.toggle('mal', !!p.ruc && !O().rucValido(p.ruc));
      }
      const td = $(`#ofCuerpo [data-totalde="${p.id}"]`);
      if (td) td.textContent = p.totalDe ? ({ declarado: 'según su oferta', 'declarado con IGV': 'su total incluye el IGV', 'suma de ítems': 'suma de sus ítems' }[p.totalDe] || p.totalDe) : '';
      const dif = $(`#ofCuerpo [data-dif="${p.id}"]`);
      if (dif) {
        if (p.cumple === false) dif.textContent = 'no entra';
        else if (esGanador) dif.textContent = 'el menor';
        else if (menor != null && p.total != null) {
          const m = Math.round((p.total - menor) * 100) / 100;
          dif.textContent = `+ ${dinero(m, p.moneda)} (+${(Math.round((m / menor) * 1000) / 10).toLocaleString('es-PE')} %)`;
        } else dif.textContent = '—';
      }
      // el plazo más corto se destaca
      const pl = $(`#ofCuerpo tr[data-campo="plazo"] [data-col="${p.id}"]`);
      if (pl) pl.classList.toggle('of-mejor', !!(res.mejorPlazo && res.mejorPlazo.includes(p.id)));
    });

    // el menor precio unitario de cada ítem
    filasDeItems().forEach((f, k) => {
      document.querySelectorAll(`#ofCuerpo tr[data-fila="${k}"] [data-item]`).forEach((c) => {
        const it = f.celdas.get(c.dataset.col);
        const p = postorDe(c.dataset.col);
        c.classList.toggle('of-mejor', !!(it && f.mejor != null && it.pu === f.mejor && p && p.cumple !== false && f.celdas.size > 1));
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
    pintarResumenDetalle();
  }

  function reevaluar() {
    ev.res = O().evaluar(ev.postores);
    pintarResultado();
  }

  function marcarSeleccion() {
    document.querySelectorAll('#ofCuerpo [data-col]').forEach((c) => c.classList.toggle('cc-sel', c.dataset.col === ev.sel));
  }

  function elegir(id) {
    if (!ev || ev.sel === id) return;
    ev.sel = id;
    ev.marca = null;
    const p = postorDe(id);
    ev.hojaVista = p.hojas[0] || null;
    marcarSeleccion();
    pintarDetalle();
    pintarVista();
  }

  function quitar(id) {
    ev.postores = ev.postores.filter((p) => p.id !== id);
    if (ev.sel === id) { ev.sel = ev.postores[0] ? ev.postores[0].id : null; ev.hojaVista = ev.postores[0] ? ev.postores[0].hojas[0] : null; }
    ev.res = O().evaluar(ev.postores);
    render();
  }

  /* ---------- los ítems de un postor, para corregirlos ---------- */

  function pintarDetalle() {
    const cont = $('#ofDetalle');
    if (!cont) return;
    const p = ev.sel && postorDe(ev.sel);
    if (!p) { cont.replaceChildren(); return; }
    const nombre = p.razon || p.nombreGrupo || 'este postor';
    if (!p.items.length) {
      cont.replaceChildren(h('details', { class: 'of-det', open: true },
        h('summary', {}, `Ítems de ${nombre}`),
        h('p', { class: 'nota' }, 'No se leyó ninguna fila de ítems de este postor; solo el total. Mira la hoja de la derecha.')));
      return;
    }
    const filas = p.items.map((it) => {
      const cant = h('input', { type: 'text', class: 'of-in der', value: it.cant == null ? '' : String(it.cant), placeholder: '?', inputmode: 'decimal' });
      const pu = h('input', { type: 'text', class: 'of-in der', value: it.pu == null ? '' : O().fmt(it.pu), placeholder: '?', inputmode: 'decimal' });
      const tot = h('input', { type: 'text', class: 'of-in der', value: O().fmt(it.total), inputmode: 'decimal' });
      const desc = campo(it.desc, '', '', 'Descripción', (v) => { it.desc = v; refrescarItems(); });
      const marca = campo(it.marca, '', '—', 'Marca', (v) => { it.marca = v; refrescarItems(); });
      const cambia = (que) => () => {
        if (que === 'cant') it.cant = cant.value.trim() ? O().leerMonto(cant.value) : null;
        if (que === 'pu') it.pu = pu.value.trim() ? O().leerMonto(pu.value) : null;
        if (que === 'tot') it.total = O().leerMonto(tot.value) || 0;
        // cantidad o unitario cambian el total de la fila (si hay los dos); si se cambia el total se respeta
        if (que !== 'tot' && it.cant != null && it.pu != null) { it.total = Math.round(it.cant * it.pu * 100) / 100; tot.value = O().fmt(it.total); }
        it.inferida = false;
        it.noCuadra = it.cant != null && it.pu != null && Math.abs(Math.round(it.cant * it.pu * 100) / 100 - it.total) > 0.05
          ? { calc: Math.round(it.cant * it.pu * 100) / 100, dice: it.total } : null;
        it.parcial = it.cant == null || it.pu == null ? it.parcial : false;
        cant.value = it.cant == null ? '' : String(it.cant); pu.value = it.pu == null ? '' : O().fmt(it.pu);
        refrescarItems();
      };
      cant.addEventListener('change', cambia('cant')); pu.addEventListener('change', cambia('pu')); tot.addEventListener('change', cambia('tot'));
      [cant, pu, tot, desc, marca].forEach((e) => e.addEventListener('focus', () => señalar(p, 'item', it)));
      return h('tr', { class: it.inferida || it.parcial || it.noCuadra ? 'of-dudosa' : '' },
        h('td', { class: 'n' }, it.n), h('td', { class: 'desc' }, desc), h('td', {}, it.unidad || ''), h('td', {}, marca),
        h('td', {}, cant), h('td', {}, pu), h('td', {}, tot));
    });
    cont.replaceChildren(h('details', { class: 'of-det', open: true },
      h('summary', {}, `Corregir los ítems de ${nombre}`),
      h('table', { class: 'of-items' },
        h('thead', {}, h('tr', {}, h('th', {}, 'N.º'), h('th', {}, 'Descripción'), h('th', {}, 'Und.'), h('th', {}, 'Marca'), h('th', {}, 'Cant.'), h('th', {}, 'P. unitario'), h('th', {}, 'Total'))),
        h('tbody', {}, filas)),
      h('div', { class: 'of-suma', id: 'ofSuma' })));
    pintarResumenDetalle();
    ajustarTodos();
  }

  /** Un ítem corregido cambia la fila del cuadro de arriba: se vuelve a armar, sin tocar lo de abajo. */
  function refrescarItems() {
    ev.res = O().evaluar(ev.postores);
    const viejo = $('#ofCuerpo .cc-tabla:not(.cc-datos)');
    if (viejo) { viejo.replaceWith(cuadroComparativo()); ajustarTodos(); }
    pintarResultado();
  }

  /** Si el postor no declaró total, el total sigue a la suma de sus ítems. */
  function sincronizarTotal(p) {
    const e = $(`#ofCuerpo td[data-col="${p.id}"] .of-total`);
    if (e) e.value = p.total != null ? O().fmt(p.total) : '';
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

  /* ---------- la hoja de verdad, al lado ---------- */

  const ETQ_FORMATO = { 1: 'Formato 1', 5: 'Formato 5', cot: 'Cotización' };

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
    const otro = ev.sel !== p.id;
    ev.sel = p.id;
    ev.hojaVista = c.hoja;
    ev.marca = c;
    marcarSeleccion();
    // los ítems de abajo siguen al postor elegido (sin rehacerlos si ya eran los suyos:
    // se perdería lo que se está escribiendo)
    if (otro && !(document.activeElement && document.activeElement.closest('#ofDetalle'))) pintarDetalle();
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

  /**
   * El cuadro como una matriz, igual que en pantalla: la primera columna dice qué es cada
   * fila y cada postor es una columna. Lo usan «Copiar cuadro», el Excel y la hoja resumen.
   * Las cifras van como números (null si falta). `tipo` dice cómo pintar la fila.
   */
  function matrizCuadro() {
    const ps = ev.postores.slice().sort((a, b) => {
      const ra = rankDe(a.id), rb = rankDe(b.id);
      return (a.cumple === false) - (b.cumple === false) || (ra ? ra.rank : 999) - (rb ? rb.rank : 999);
    });
    const nombre = (p) => p.razon || p.nombreGrupo || 'Postor';
    const filas = [];
    const fila = (tipo, etiqueta, valores) => filas.push({ tipo, etiqueta, valores });
    fila('cab', 'Postor', ps.map(nombre));
    fila('texto', 'RUC', ps.map((p) => p.ruc || ''));
    fila('texto', 'Cumple las especificaciones', ps.map((p) => (p.cumple === false ? 'No' : 'Sí')));
    const items = filasDeItems();
    items.forEach((f) => {
      const cant = cantidadDe(f);
      const desc = `Ítem ${f.n}: ${f.desc || ''}${cant ? ' (cant. ' + cant + ')' : ''}`;
      fila('item', desc + ' · precio unitario', ps.map((p) => { const it = f.celdas.get(p.id); return it && it.pu != null ? it.pu : null; }));
      fila('cifra', desc + ' · subtotal', ps.map((p) => { const it = f.celdas.get(p.id); return it ? it.total : null; }));
      [['marca', 'marca'], ['modelo', 'modelo'], ['procedencia', 'procedencia']].forEach(([k, t]) => {
        if (ps.some((p) => { const it = f.celdas.get(p.id); return it && it[k]; })) {
          fila('texto', desc + ' · ' + t, ps.map((p) => { const it = f.celdas.get(p.id); return (it && it[k]) || ''; }));
        }
      });
    });
    fila('total', 'PRECIO TOTAL (' + (ps.some((p) => p.moneda === 'USD') ? 'US$' : 'S/') + ')', ps.map((p) => (p.total != null ? p.total : null)));
    const menor = ev.res.ganadores.length ? postorDe(ev.res.ganadores[0]).total : null;
    fila('texto', 'Frente al menor precio', ps.map((p) => {
      if (p.cumple === false) return 'no entra';
      if (ev.res.ganadores.includes(p.id)) return 'el menor';
      if (menor == null || p.total == null) return '';
      const m = Math.round((p.total - menor) * 100) / 100;
      return `+ ${O().fmt(m)} (+${(Math.round((m / menor) * 1000) / 10).toLocaleString('es-PE')} %)`;
    }));
    CAMPOS.forEach(([k, t]) => { if (ps.some((p) => p[k])) fila('texto', t, ps.map((p) => p[k] || '')); });
    fila('resultado', 'Puesto', ps.map((p) => {
      const r = rankDe(p.id);
      if (p.cumple === false) return 'No cumple';
      return ev.res.ganadores.includes(p.id) ? '1.º · MENOR PRECIO' : r ? r.rank + '.º' : '';
    }));
    const datos = DATOS.filter(([k]) => k !== 'razon' && k !== 'ruc').map(([k, t]) => ({ tipo: 'texto', etiqueta: t, valores: ps.map((p) => p[k] || '') }));
    return { ps, filas, datos, gana: ps.map((p) => ev.res.ganadores.includes(p.id)) };
  }

  const celdaTexto = (v) => (v == null ? '' : typeof v === 'number' ? O().fmt(v) : String(v));

  function copiarCuadro() {
    const m = matrizCuadro();
    const lineas = m.filas.concat(m.datos).map((f) => [f.etiqueta].concat(f.valores.map(celdaTexto)));
    copiar(lineas.map((l) => l.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'));
  }

  async function bajarExcel() {
    try {
      const m = matrizCuadro();
      const libro = XLSX.utils.book_new();
      const aoa = [['CUADRO COMPARATIVO DE OFERTAS'], ['Criterio: menor precio total entre las ofertas que cumplen'], []]
        .concat(m.filas.map((f) => [f.etiqueta].concat(f.valores.map((v) => (v == null ? '' : v)))));
      aoa.push([], ['DATOS DE LOS POSTORES (Formato 1)']);
      m.datos.forEach((f) => aoa.push([f.etiqueta].concat(f.valores)));
      const hoja1 = XLSX.utils.aoa_to_sheet(aoa);
      hoja1['!cols'] = [{ wch: 46 }].concat(m.ps.map(() => ({ wch: 30 })));
      // las cifras con dos decimales
      Object.keys(hoja1).forEach((k) => { const c = hoja1[k]; if (c && c.t === 'n') c.z = '#,##0.00'; });
      XLSX.utils.book_append_sheet(libro, hoja1, 'Cuadro comparativo');
      const items = [['Postor', 'RUC', 'N.º', 'Descripción', 'Unidad', 'Marca', 'Cantidad', 'Precio unitario', 'Total']];
      ev.postores.forEach((p) => p.items.forEach((it) => items.push([p.razon || p.nombreGrupo, p.ruc, it.n, it.desc, it.unidad, it.marca || '', it.cant, it.pu, it.total])));
      const hoja2 = XLSX.utils.aoa_to_sheet(items);
      hoja2['!cols'] = [34, 13, 5, 50, 8, 16, 10, 14, 14].map((w) => ({ wch: w }));
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

  /**
   * Un «trabajo» para la app HNAL (el generador de la Validación, el Memo, el Cuadro
   * Comparativo y la Nota Informativa): el mismo .json que ella exporta, con los postores,
   * los ítems, los precios y las marcas ya puestos. Allí se abre con «Importar trabajo».
   * El Cuadro Comparativo de HNAL admite hasta 4 postores: van los 4 mejores.
   */
  function trabajoHnal() {
    const orden = ev.postores.slice().sort((a, b) => {
      const ra = rankDe(a.id), rb = rankDe(b.id);
      return (a.cumple === false) - (b.cumple === false) || (ra ? ra.rank : 999) - (rb ? rb.rank : 999);
    });
    const cc = orden.slice(0, 4);
    const filas = filasDeItems();
    const num = (v) => (v == null || isNaN(v) ? '' : String(Math.round(v * 100) / 100));
    const medida = (u) => (!u || /^(UND|UNID|UNIDAD|UNIDADES|UN|UNI|U)\.?$/i.test(u) ? 'UNIDAD' : String(u).toUpperCase());
    const unidadDe = (f) => ([...f.celdas.values()].find((x) => x.unidad) || {}).unidad || '';
    const marcaDe = (f, p) => { const it = f.celdas.get(p.id); return ((it && it.marca) || p.marca || '').toUpperCase(); };
    const plazo = (p) => (p.plazoDias != null ? String(p.plazoDias) : ((/(\d+)/.exec(p.plazo || '') || [])[1] || ''));
    // sin filas de ítems (solo se leyó el total): un ítem con el total de cada uno
    const items = filas.length ? filas : [{ n: 1, desc: '', cant: 1, celdas: new Map(ev.postores.map((p) => [p.id, { pu: p.total, total: p.total }])) }];
    const denom = items.length === 1 ? (items[0].desc || '') : '';
    const gana = cc.findIndex((p) => ev.res.ganadores.includes(p.id));
    const data = {
      v: 4, ts: Date.now(), tipo: 'bien',
      postores: orden.map((p) => ({ nombre: p.razon || '' })),
      items: items.map((f) => ({ codigo: '', denom: f.desc || '', unidad: /^UNIDAD/i.test(medida(unidadDe(f))) ? 'UND' : medida(unidadDe(f)),
        cantidad: num(f.cant), marcas: orden.map((p) => marcaDe(f, p)) })),
      ccPostores: cc.map((p) => ({
        nombre: p.razon || '', ruc: p.ruc || '', contacto: (p.contacto || p.representante || '').toUpperCase(),
        telefono: p.telefono || '', email: p.correo || '', garantia: (p.garantia || '').toUpperCase(),
        plazo_entrega: plazo(p), fecha_solicitud: '', fecha_recepcion: '',
        se_dedica: 'SI', verifica: 'SI', cumple_rtm: p.cumple === false ? 'NO' : '', se_tomo: '',
      })),
      ccGanador: gana >= 0 ? gana : 0,
      ccItems: items.map((f) => ({
        codigo: '', descripcion: f.desc || '', medida: medida(unidadDe(f)), cantidad: num(f.cant),
        precios: cc.map((p) => { const it = f.celdas.get(p.id); return it && it.pu != null ? num(it.pu) : ''; }),
        marcas: cc.map((p) => marcaDe(f, p)), precioHist: '', marcaHist: '',
      })),
      memoFilas: orden.map((p) => ({ empresa: p.razon || '', ruc: p.ruc || '', obs: 'NINGUNA OBSERVACION' })),
      inputs: { adquisicion: denom, 'cc-denom': denom, 'cc-objeto': 'bien' },
    };
    const m = ev.hojas[0];
    const nombre = String((m && m.nombreGrupo) || 'EXPEDIENTE').replace(/\.pdf$/i, '').toUpperCase();
    return { payload: { formato: 'hnal-trabajo', v: 1, nombre, ts: Date.now(), data }, nombre, sobran: orden.length - cc.length };
  }

  async function llevarAHnal() {
    try {
      const { payload, nombre, sobran } = trabajoHnal();
      const base = nombre.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'EXPEDIENTE';
      await G.guardarArchivo(new TextEncoder().encode(JSON.stringify(payload, null, 2)), 'TRABAJO_' + base + '.json',
        'application/json', { aDescargas: true });
      G.aviso('Listo, está en Descargas. En la app HNAL: Trabajos → «Importar trabajo (.json)» y luego «Abrir».'
        + (sobran > 0 ? ` El Cuadro Comparativo de HNAL admite 4 postores: van los 4 de menor precio (quedan fuera ${sobran}).` : ''), 'ok');
    } catch (e) {
      console.error(e);
      G.aviso('No se pudo armar el trabajo para HNAL: ' + e.message, 'error');
    }
  }

  /**
   * Una hoja A4 apaisada con el cuadro, como en pantalla (cada postor una columna), para
   * dejar el sustento dentro del expediente. Si no cabe, sigue en otra hoja.
   */
  async function hojaResumenPdf() {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const normal = await doc.embedStandardFont(StandardFonts.Helvetica);
    const negrita = await doc.embedStandardFont(StandardFonts.HelveticaBold);
    const juego = new Set(normal.getCharacterSet());
    const seguro = (t) => Array.from(String(t == null ? '' : t)).map((c) => (juego.has(c.codePointAt(0)) ? c : '?')).join('');
    const W = 841.89, H = 595.28, M = 34;
    const gris = rgb(0.35, 0.36, 0.4), linea = rgb(0.78, 0.78, 0.8), verde = rgb(0.87, 0.96, 0.9), cabFondo = rgb(0.9, 0.93, 0.97);
    const m = matrizCuadro();
    const n = m.ps.length;
    const tam = n > 6 ? 7.5 : n > 4 ? 8.5 : 9.5;
    const anchoEtq = n > 5 ? 170 : 210;
    const anchoCol = (W - 2 * M - anchoEtq) / Math.max(1, n);

    /** Parte un texto en renglones que quepan en `ancho` (como mucho `max`). */
    const partir = (txt, fuente, t, ancho, max) => {
      const palabras = seguro(txt).split(/\s+/).filter(Boolean);
      const r = [];
      let cur = '';
      palabras.forEach((w) => {
        const prueba = cur ? cur + ' ' + w : w;
        if (fuente.widthOfTextAtSize(prueba, t) <= ancho || !cur) cur = prueba;
        else { r.push(cur); cur = w; }
      });
      if (cur) r.push(cur);
      if (r.length > max) { r.length = max; r[max - 1] = r[max - 1].replace(/.{0,3}$/, '...'); }
      return r.map((l) => { while (l.length > 1 && fuente.widthOfTextAtSize(l, t) > ancho) l = l.slice(0, -4) + '...'; return l; });
    };

    let pag, y;
    const nuevaHoja = (primera) => {
      pag = doc.addPage([W, H]);
      y = H - M;
      if (primera) {
        pag.drawText('CUADRO COMPARATIVO DE OFERTAS', { x: M, y: y - 14, size: 15, font: negrita });
        const hoy = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
        pag.drawText(seguro(`Lima, ${hoy} · Criterio: menor precio total entre las ofertas que cumplen las especificaciones`), { x: M, y: y - 30, size: 9, font: normal, color: gris });
        y -= 46;
      } else y -= 6;
    };
    nuevaHoja(true);

    const dibujarFila = (f, fondoEtq) => {
      const fuenteV = f.tipo === 'total' || f.tipo === 'cab' || f.tipo === 'resultado' ? negrita : normal;
      const etq = partir(f.etiqueta, f.tipo === 'texto' || f.tipo === 'cifra' ? normal : negrita, tam, anchoEtq - 10, 3);
      const vals = f.valores.map((v) => partir(celdaTexto(v), fuenteV, tam, anchoCol - 10, f.tipo === 'cab' ? 3 : 2));
      const renglones = Math.max(etq.length, ...vals.map((v) => v.length), 1);
      const alto = renglones * (tam + 2.5) + 8;
      if (y - alto < M + 14) nuevaHoja(false);
      // fondos: la columna ganadora en verde, la cabecera en celeste
      if (fondoEtq) pag.drawRectangle({ x: M, y: y - alto, width: W - 2 * M, height: alto, color: fondoEtq });
      m.gana.forEach((g, i) => { if (g) pag.drawRectangle({ x: M + anchoEtq + i * anchoCol, y: y - alto, width: anchoCol, height: alto, color: verde }); });
      etq.forEach((l, k) => pag.drawText(l, { x: M + 5, y: y - 4 - (k + 1) * (tam + 2.5) + 2, size: tam, font: f.tipo === 'texto' || f.tipo === 'cifra' ? normal : negrita }));
      vals.forEach((v, i) => {
        const x0 = M + anchoEtq + i * anchoCol;
        const numero = typeof f.valores[i] === 'number';
        v.forEach((l, k) => {
          const fx = numero ? x0 + anchoCol - 5 - fuenteV.widthOfTextAtSize(l, tam) : x0 + 5;
          pag.drawText(l, { x: fx, y: y - 4 - (k + 1) * (tam + 2.5) + 2, size: tam, font: fuenteV });
        });
      });
      // las rayas van encima de los fondos: arriba y abajo de la fila
      pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: linea });
      pag.drawLine({ start: { x: M, y: y - alto }, end: { x: W - M, y: y - alto }, thickness: 0.5, color: linea });
      pag.drawLine({ start: { x: M, y }, end: { x: M, y: y - alto }, thickness: 0.5, color: linea });
      for (let i = 0; i <= n; i++) {
        const x = M + anchoEtq + i * anchoCol;
        pag.drawLine({ start: { x, y }, end: { x, y: y - alto }, thickness: 0.5, color: linea });
      }
      y -= alto;
    };
    pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: linea });
    m.filas.forEach((f) => dibujarFila(f, f.tipo === 'cab' ? cabFondo : f.tipo === 'total' ? rgb(0.95, 0.95, 0.94) : null));
    if (m.datos.some((f) => f.valores.some(Boolean))) {
      if (y - 40 < M) nuevaHoja(false);
      y -= 14;
      pag.drawText('Datos de los postores (Formato 1)', { x: M, y: y - 10, size: 10, font: negrita });
      y -= 18;
      pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: linea });
      m.datos.forEach((f) => dibujarFila(f, null));
    }

    // el resultado en una frase
    const g = ev.res.ganadores.map(postorDe).filter(Boolean);
    if (g.length) {
      if (y - 40 < M) nuevaHoja(false);
      y -= 18;
      const d = ev.res.diferencia;
      const rival = d && postorDe(d.contra);
      const frase = `${g.length > 1 ? 'Empate en el menor precio: ' : 'Menor precio: '}${g.map((x) => x.razon || x.nombreGrupo).join(' y ')}`
        + (g.length === 1 ? ` (RUC ${g[0].ruc || 's/n'}), por ${dinero(g[0].total, g[0].moneda)}` : '')
        + (d && g.length === 1 && rival ? `, ${dinero(d.monto, g[0].moneda)} menos que ${rival.razon || rival.nombreGrupo}.` : '.');
      partir(frase, negrita, 10, W - 2 * M, 3).forEach((l) => { pag.drawText(l, { x: M, y: y - 10, size: 10, font: negrita }); y -= 14; });
    }
    doc.getPages().forEach((pg, i, todas) => pg.drawText(seguro(`Elaborado con Pdflash a partir de los Formatos N.º 1 y N.º 5 de cada postor${todas.length > 1 ? ` · hoja ${i + 1} de ${todas.length}` : ''}.`), { x: M, y: M - 16, size: 7.5, font: normal, color: gris }));
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
