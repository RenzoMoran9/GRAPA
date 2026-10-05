/* ===========================================================
   Pdflash · leer las ofertas de los postores y compararlas
   Esta parte no toca la pantalla: recibe los renglones de las hojas (ya
   leídos, de texto o de escaneo) y devuelve los postores con sus datos,
   sus precios y quién gana. Por eso se puede probar sola.

   Qué hace con cada hoja:
     · Formato 1  → razón social, RUC, domicilio, teléfono, correo, representante.
     · Formato 5  → los ítems (cantidad × precio unitario = total), el total
                    de la oferta, el plazo, la validez, la garantía y el pago.
   Un escaneo se lee con errores. Para no creerse un número mal leído:
     · cada ítem tiene que cuadrar (cantidad × unitario = total);
     · el total que escribió el postor se contrasta con la suma de sus ítems;
     · el RUC se verifica con su dígito de control, y se corrige si un solo
       dígito confundido lo arregla.
   Todo lo dudoso queda en «avisos» para que se vea antes de decidir.
   =========================================================== */
(function () {
  'use strict';

  /* ---------- texto ---------- */

  /** Mayúsculas y sin tildes, SIN cambiar el largo: así un índice del texto plano vale en el original. */
  function plano(s) {
    return Array.from(String(s || '')).map((c) => {
      const u = c.toUpperCase();
      const d = u.normalize('NFD')[0];
      return d && d.length === 1 ? d : u;
    }).join('');
  }

  const limpiar = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  /** Una etiqueta como «plazo de entrega» que aguanta que el escaneo se coma la primera letra. */
  function etiqueta(frase) {
    const palabras = plano(frase).split(/\s+/);
    const w0 = palabras[0];
    const cabeza = w0.length > 3 ? '\\w?' + w0.slice(1) : w0;
    return new RegExp('(?:^|[^A-Z0-9])' + [cabeza].concat(palabras.slice(1)).join('\\s+'));
  }

  /* ---------- números ---------- */

  /** «1,250.00», «1.250,00», «S/ 980.50», «1250»… → número. null si no es un monto. */
  function leerMonto(token) {
    let t = String(token || '').trim()
      .replace(/^(?:US\$|S\/\.?|\$|USD|PEN)\s*/i, '')
      .replace(/[()*]/g, '')
      .replace(/[.,;:]+$/, '');
    if (!t) return null;
    // un escaneo confunde la O con el 0 y la l con el 1 dentro de una cifra
    if (/^[\d.,OolI]+$/.test(t) && /\d/.test(t)) t = t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1');
    let n = null;
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) n = parseFloat(t.replace(/,/g, ''));
    else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+\.\d{1,2}$/.test(t)) n = parseFloat(t);
    else if (/^\d+,\d{1,2}$/.test(t)) n = parseFloat(t.replace(',', '.'));
    else if (/^\d+$/.test(t)) n = parseFloat(t);
    return n != null && isFinite(n) ? n : null;
  }

  const redondear = (n) => Math.round(n * 100) / 100;
  const casi = (a, b, tol) => Math.abs(a - b) <= (tol == null ? Math.max(0.05, Math.abs(b) * 0.002) : tol);

  /** Los montos de un renglón, con el lugar que ocupan. */
  function montosDe(texto) {
    const toks = texto.split(/\s+/).filter(Boolean);
    const res = [];
    toks.forEach((tk, i) => {
      const v = leerMonto(tk);
      if (v != null) res.push({ i, v, t: tk, decimales: /[.,]\d{2}$/.test(tk.replace(/[.,;:]+$/, '')) });
    });
    return { toks, montos: res };
  }

  /* ---------- RUC ---------- */

  function rucValido(ruc) {
    if (!/^\d{11}$/.test(ruc || '')) return false;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < 10; i++) s += pesos[i] * Number(ruc[i]);
    const dig = (11 - (s % 11)) % 10;
    return dig === Number(ruc[10]) && /^(10|15|16|17|20)/.test(ruc);
  }

  /** Dígitos de lo que el escaneo leyó como letras. */
  const comoDigitos = (s) => s.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');

  /* ---------- una hoja ---------- */

  /** ¿Es el Formato 1 o el 5? null si no lo dice. */
  function formatoDe(lineas) {
    const cab = lineas.slice(0, 14).map((l) => plano(l.texto));
    for (const l of cab) {
      const m = /FORMATO\s*(?:N\W{0,3}|NRO\W{0,2}|NUM\W{0,2})?\s*([1-9]|[SIl])\b/.exec(l);
      if (m) return { '1': 1, I: 1, l: 1, S: 5 }[m[1]] || Number(m[1]);
    }
    const todo = cab.join(' ');
    if (/DATOS\s+DEL\s+POSTOR/.test(todo)) return 1;
    if (/(OFERTA|PROPUESTA)\s+ECONOMICA|CARTA\s+DE\s+(COTIZACION|OFERTA)/.test(todo)) return 5;
    return null;
  }

  const TERMINA_VALOR = /\s{2,}(?=[A-ZÁÉÍÓÚÑa-záéíóúñ.° ]{2,30}:)|\s+R\.?U\.?C\b/;

  /** El texto que va tras una etiqueta: en el mismo renglón o, si no hay, en el de abajo. */
  function valorTras(lineas, i, rx) {
    const l = lineas[i];
    const m = rx.exec(plano(l.texto));
    if (!m) return null;
    let v = l.texto.slice(m.index + m[0].length).replace(/^[\s:.\-–—_]+/, '');
    v = v.split(TERMINA_VALOR)[0];
    v = limpiar(v);
    if (v) return v;
    const sig = lineas[i + 1];
    if (sig && !/^[A-ZÁÉÍÓÚÑ ]{3,40}:/.test(sig.texto.trim())) return limpiar(sig.texto.split(/\s{3,}/)[0]);
    return null;
  }

  function buscarValor(lineas, rx) {
    for (let i = 0; i < lineas.length; i++) {
      const v = valorTras(lineas, i, rx);
      if (v) return { v, i };
    }
    return null;
  }

  const RX = {
    razon: /(?:RAZON\s+SOCIAL|DENOMINACION|NOMBRE\s+DEL\s+POSTOR|NOMBRE\s+DEL\s+PROVEEDOR|EMPRESA)(?:\s+DEL\s+(?:POSTOR|PROVEEDOR))?(?:\s+O\s+RAZON\s+SOCIAL)?/,
    domicilio: /(?:DOMICILIO(?:\s+(?:LEGAL|FISCAL))?|DIRECCION(?:\s+(?:LEGAL|FISCAL))?)/,
    telefono: /(?:TELEFONO|TELEF\.?|TELF?\.?|CELULAR|\bCEL\b)(?:\s*\/\s*(?:CELULAR|FAX))?/,
    representante: /(?:REPRESENTANTE\s+LEGAL|APODERADO|NOMBRE\s+DEL\s+REPRESENTANTE)/,
    plazo: [etiqueta('plazo de entrega'), etiqueta('plazo de ejecucion'), etiqueta('plazo de prestacion'),
      etiqueta('plazo de atencion'), etiqueta('tiempo de entrega')],
    validez: [/(?:VALIDEZ|VIGENCIA)\s+DE\s+(?:LA\s+)?(?:OFERTA|COTIZACION|PROPUESTA)/, /(?:^|[^A-Z])\w?ALIDEZ\s+DE(?:\s+LA)?(?:\s+(?:OFERTA|COTIZACION|PROPUESTA))?/],
    garantia: etiqueta('garantia'),
    pago: [etiqueta('forma de pago'), etiqueta('condiciones de pago'), etiqueta('condicion de pago')],
    lugar: etiqueta('lugar de entrega'),
  };

  function primero(lineas, rxs) {
    for (const rx of [].concat(rxs)) {
      const r = buscarValor(lineas, rx);
      if (r) return r;
    }
    return null;
  }

  function diasDe(txt) {
    const m = /(\d+)\s*(?:\(\s*\d+\s*\)\s*)?(D[IÍ]AS?|SEMANAS?|MESES|MES|A[NÑ]OS?)/i.exec(plano(txt || ''));
    if (!m) { const solo = /^\s*(\d{1,3})\s*$/.exec(txt || ''); return solo ? Number(solo[1]) : null; }
    const n = Number(m[1]);
    const u = m[2];
    if (/^SEMANA/.test(u)) return n * 7;
    if (/^MES/.test(u)) return n * 30;
    if (/^ANO/.test(u)) return n * 365;
    return n;
  }

  /** Los datos de identidad que haya en la hoja (sirve para el Formato 1 y para la cabecera del 5). */
  function leerIdentidad(lineas) {
    const id = {};
    const donde = {};
    id.donde = donde;
    const r = buscarValor(lineas, RX.razon);
    if (r) {
      donde.razon = r.i;
      // lo que quede de renglón tras la razón social no es de ella
      id.razon = limpiar(r.v.replace(/\s+R\.?U\.?C.*$/i, '').replace(/[_]+$/g, ''));
    }
    // RUC: lo que sigue a «RUC», o cualquier cifra de 11 dígitos con cara de RUC
    const candidatos = [];
    const lineaRuc = {};
    lineas.forEach((l) => {
      const p = plano(l.texto);
      const re = /R\.?\s?U\.?\s?C\.?\W{0,6}(?:N[°O.]?\W{0,3})?([0-9OIlSB|][0-9OIlSB| ]{9,13}[0-9OIlSB|])/g;
      let m;
      while ((m = re.exec(p))) {
        const crudo = l.texto.slice(m.index + m[0].length - m[1].length, m.index + m[0].length);
        const d = comoDigitos(crudo).replace(/\D/g, '');
        if (d.length === 11) { candidatos.push(d); lineaRuc[d] = lineaRuc[d] == null ? lineas.indexOf(l) : lineaRuc[d]; }
      }
    });
    if (!candidatos.length) {
      lineas.forEach((l) => {
        const m = /(?:^|\D)((?:10|15|16|17|20)\d{9})(?:\D|$)/.exec(l.texto.replace(/\s/g, ' '));
        if (m) { candidatos.push(m[1]); if (lineaRuc[m[1]] == null) lineaRuc[m[1]] = lineas.indexOf(l); }
      });
    }
    if (candidatos.length) {
      // se prefiere el que pasa la verificación; ninguno se «corrige» a mano: cambiar un
      // dígito hasta que cuadre acierta tan seguido como falla, así que solo se avisa
      const ruc = candidatos.find(rucValido) || candidatos[0];
      id.ruc = ruc;
      if (lineaRuc[ruc] != null) donde.ruc = lineaRuc[ruc];
    }
    const d = buscarValor(lineas, RX.domicilio); if (d) id.direccion = d.v;
    const t = buscarValor(lineas, RX.telefono);
    if (t) { const tel = t.v.replace(/[^\d\s()+\-/]/g, '').replace(/\s{2,}/g, ' ').trim(); if (/\d{5}/.test(tel.replace(/\D/g, ''))) id.telefono = tel; }
    const rl = buscarValor(lineas, RX.representante); if (rl) id.representante = rl.v;
    // «Nombre: … / Cargo: Representante legal» al pie de una carta, sin la etiqueta «representante legal»
    if (!id.representante) {
      for (let i = 0; i < lineas.length - 1; i++) {
        const m = /^\W*NOMBRES?(?:\s+Y\s+APELLIDOS)?\W*:\s*(.+)/.exec(plano(lineas[i].texto));
        if (m && /CARGO|REPRESENTANTE|GERENTE|APODERADO/.test(plano(lineas[i + 1].texto))) {
          id.representante = limpiar(lineas[i].texto.slice(lineas[i].texto.indexOf(':') + 1));
          break;
        }
      }
    }
    for (const l of lineas) {
      const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(l.texto);
      if (m) { id.correo = m[0]; break; }
    }
    if (!id.correo) {
      // el escaneo lee la @ como O, Q, © o «(O9»: se ofrece como duda
      for (const l of lineas) {
        const m = /([A-Za-z0-9._-]{2,}?)(?:\(O9|\(?@|[OQ©])([A-Za-z0-9-]{2,}\.(?:com|pe|net|org|edu|gob)(?:\.[a-z]{2})?)\b/.exec(l.texto);
        if (m && /correo|e-?mail|electr/i.test(l.texto)) { id.correo = m[1] + '@' + m[2]; id.correoDudoso = true; break; }
      }
    }
    for (let i = 0; i < lineas.length; i++) {
      const p = plano(lineas[i].texto);
      const m = /(?:^|[^A-Z])(?:DNI|D\.N\.I\.?|DOC\w*\.?\s+DE\s+IDENTIDAD)\W{0,6}([0-9OIlSB]{8})\b/.exec(p);
      if (m) { id.dni = comoDigitos(lineas[i].texto.slice(m.index + m[0].length - 8, m.index + m[0].length)); break; }
    }
    return id;
  }

  /* ---------- los precios ---------- */

  const UNIDADES = /^(?:UND|UNID|UNIDAD|UNIDADES|UN|UNI|SERV|SERVICIO|GLB|GBL|JGO|JUEGO|CJA|CAJA|PAR|KIT|PZA|PZ|PIEZA|MLL|MILLAR|KG|LT|MT|M2|M3|ROLLO|BLS|BOLSA|PQT|PAQ|PAQUETE|DOC|DOCENA|GAL|GALON|FCO|FRASCO|LTA|LATA|SET|JUE|BAL|BALDE|BID|BIDON)\.?$/i;
  const PALABRAS_TOTAL = /\bTOTAL\b/;
  const ES_CABECERA = /UNITARIO|P\.?\s?UNIT|CANT|DESCRIPCI|UNIDAD\b|IMPORTE\b.*\bUND\b|ITEM|ÍTEM/;

  /** ¿Esta fila es un ítem? Busca cantidad × unitario = total entre sus números. */
  function filaDeItem(texto, sinParcial) {
    const { toks, montos } = montosDe(texto);
    if (montos.length < 2) return sinParcial ? null : filaParcial(toks, montos);
    // cantidad × unitario = total, el trío más a la derecha
    for (let k = montos.length - 1; k >= 2; k--) {
      for (let j = k - 1; j >= 1; j--) {
        for (let i = j - 1; i >= 0; i--) {
          const c = montos[i].v, pu = montos[j].v, t = montos[k].v;
          if (c > 0 && pu > 0 && t > 0 && casi(redondear(c * pu), t) && (montos[j].decimales || montos[k].decimales || t >= 50)) {
            return construir(toks, montos, i, j, k, false);
          }
        }
      }
    }
    // un precio y un total donde la cantidad se perdió: el total es un múltiplo entero del precio
    const n = montos.length;
    const a = montos[n - 2], b = montos[n - 1];
    if (a.decimales && b.decimales && b.v >= a.v && a.v > 0) {
      const c = b.v / a.v;
      if (casi(c, Math.round(c), 0.001) && Math.round(c) >= 1 && Math.round(c) <= 99999) {
        return construir(toks, montos, -1, n - 2, n - 1, true, Math.round(c));
      }
    }
    return sinParcial ? null : filaParcial(toks, montos);
  }

  /**
   * Una fila cuyas cifras no cuadran (casi siempre una cifra mal leída del escaneo).
   * No se descarta: si termina en un monto con decimales y tiene una descripción, se
   * conserva ese total, y se avisa de que cantidad × unitario no lo confirma.
   */
  function filaParcial(toks, montos) {
    const n = montos.length;
    if (!n) return null;
    const ult = montos[n - 1];
    if (ult.i !== toks.length - 1 || !ult.decimales || ult.v < 10) return null;
    const antes = toks.slice(0, ult.i);
    if (/^[xX×]$/.test(antes[antes.length - 1] || '')) return null;      // «… X 50» es una medida
    if (antes.join('').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').length < 8) return null;
    // cantidad y unitario: los dos números pegados antes del total (con un «S/» a lo sumo entre medias)
    const j = n >= 2 && montos[n - 2].i >= ult.i - 2 ? n - 2 : -1;
    const i = j >= 1 && montos[j - 1].i === montos[j].i - 1 ? j - 1 : -1;
    const primero = i >= 0 ? montos[i].i : j >= 0 ? montos[j].i : ult.i;
    let desde = 0, num = null;
    if (/^\d{1,3}[.)]?$/.test(toks[0] || '') && primero > 1) { num = parseInt(toks[0], 10); desde = 1; }
    let hasta = primero;
    let unidad = '';
    if (hasta - 1 >= desde && UNIDADES.test(toks[hasta - 1])) { unidad = toks[hasta - 1].replace(/\.$/, ''); hasta -= 1; }
    // sin dos cifras pegadas ni número de ítem al principio, un monto suelto es de un párrafo, no de una tabla
    if (!(i >= 0 && j >= 0) && num == null) return null;
    const cant = i >= 0 ? montos[i].v : null, pu = j >= 0 ? montos[j].v : null;
    const calc = cant != null && pu != null ? redondear(cant * pu) : null;
    return {
      n: num, desc: limpiar(toks.slice(desde, hasta).join(' ')), unidad, cant, pu, total: ult.v,
      inferida: false, parcial: true,
      noCuadra: calc != null && !casi(calc, ult.v) ? { calc, dice: ult.v } : null,
    };
  }

  function construir(toks, montos, i, j, k, inferida, cantInferida) {
    const primeroIdx = i >= 0 ? montos[i].i : montos[j].i;
    let desde = 0;
    // el número de ítem del principio no es parte de la descripción
    let n = null;
    if (/^\d{1,3}[.)]?$/.test(toks[0] || '') && primeroIdx > 1) { n = parseInt(toks[0], 10); desde = 1; }
    let hasta = primeroIdx;
    let unidad = '';
    if (hasta - 1 >= desde && UNIDADES.test(toks[hasta - 1])) { unidad = toks[hasta - 1].replace(/\.$/, ''); hasta -= 1; }
    return {
      n,
      desc: limpiar(toks.slice(desde, hasta).join(' ')),
      unidad,
      cant: i >= 0 ? montos[i].v : cantInferida,
      pu: montos[j].v,
      total: montos[k].v,
      inferida: !!inferida,
    };
  }

  /** Lo que el postor declara como total, subtotal e IGV. */
  function leerTotales(lineas, esFila) {
    const tot = { totales: [], subtotal: null, igv: null };
    for (let i = 0; i < lineas.length; i++) {
      if (esFila.has(i)) continue;
      const p = plano(lineas[i].texto);
      const esSub = /SUB\s*-?\s*TOTAL|SUMA\s+PARCIAL|VALOR\s+DE\s+VENTA|TOTAL\s+(?:SIN|NO\s+INCL\w*)\s+IGV|BASE\s+IMPONIBLE/.test(p);
      const esIgv = /^\W*(?:I\.?G\.?V\.?)(?!\s*\))/.test(p) && !PALABRAS_TOTAL.test(p);
      const esTotal = PALABRAS_TOTAL.test(p) && !esSub && !ES_CABECERA.test(p);
      if (!esSub && !esIgv && !esTotal) continue;
      let { montos } = montosDe(lineas[i].texto);
      // el 18 % de «IGV 18 %» no es el monto
      montos = montos.filter((m) => !(esIgv && m.v === 18 && !m.decimales));
      if (!montos.length && esTotal) {
        const sig = lineas[i + 1];
        if (sig && !esFila.has(i + 1)) {
          const s = montosDe(sig.texto).montos;
          if (s.length === 1 && !/[A-Za-z]{4,}/.test(sig.texto)) montos = s;
        }
      }
      if (!montos.length) continue;
      const v = montos[montos.length - 1].v;
      if (esSub) tot.subtotal = v;
      else if (esIgv) tot.igv = v;
      else tot.totales.push({ v, linea: i, texto: limpiar(lineas[i].texto) });
    }
    return tot;
  }

  function leerMoneda(lineas) {
    const t = plano(lineas.map((l) => l.texto).join(' \n '));
    const soles = /S\/\.?|SOLES|NUEVOS\s+SOLES|\bPEN\b/.test(t);
    const dolares = /US\s?\$|USD|DOLARES|DOLAR\b/.test(t);
    if (soles && !dolares) return 'PEN';
    if (dolares && !soles) return 'USD';
    if (soles && dolares) return 'PEN';
    return '';
  }

  function leerIgv(lineas) {
    const t = plano(lineas.map((l) => l.texto).join(' \n '));
    if (/NO\s+INCLUYE\s+IGV|NO\s+INCLUIDO\s+(?:EL\s+)?IGV|SIN\s+IGV|MAS\s+IGV|\+\s*IGV/.test(t)) return 'no';
    if (/INCLUIDO\s+(?:EL\s+)?IGV|INCLUYE\s+(?:EL\s+)?IGV|INC\.?\s*IGV|INCLUIDOS?\s+LOS?\s+IMPUESTOS|CON\s+IGV|INCLUIDO\s+I\.?G\.?V/.test(t)) return 'si';
    return '';
  }

  /** Los ítems y todo lo que dice una hoja de precios (Formato 5). */
  function leerPrecios(lineas) {
    const items = [];
    const esFila = new Set();
    let ultimaFila = -1;
    const dudosas = [];
    lineas.forEach((l, i) => {
      const p = plano(l.texto);
      if (ES_CABECERA.test(p) && !/\d[.,]\d{2}/.test(l.texto)) return;
      if (/SUB\s*-?\s*TOTAL|\bTOTAL\b|\bIGV\b/.test(p) && !filaDeItem(l.texto, true)) return;
      const f = filaDeItem(l.texto);
      if (f) {
        // descripción que sigue en el renglón de abajo (la celda se partió en dos)
        f.linea = i;
        items.push(f);
        esFila.add(i);
        ultimaFila = i;
        return;
      }
      // seguimiento de la descripción: renglón corto, sin precios, pegado a la fila anterior
      const medidas = /\d\s*[xX×]\s*\d/.test(l.texto);
      if (ultimaFila === i - 1 && items.length
          && (medidas || montosDe(l.texto).montos.filter((m) => m.decimales).length === 0)
          && !RX.plazo.some((r) => r.test(p)) && !/:/.test(l.texto) && l.texto.length < 70) {
        const cur = items[items.length - 1];
        const dy = l.y0 - lineas[i - 1].y1;
        if (dy < (lineas[i - 1].y1 - lineas[i - 1].y0) * 1.2) {
          cur.desc = limpiar(cur.desc + ' ' + l.texto);
          ultimaFila = i;
          esFila.add(i);
          return;
        }
      }
      if (!/\d\s*[xX×]\s*\d/.test(l.texto) && montosDe(l.texto).montos.filter((m) => m.decimales).length >= 2) dudosas.push(limpiar(l.texto));
    });
    // si no salió ningún ítem, la tabla puede haberse leído rota (cada celda en su renglón): se
    // prueba con todo el bloque de después del encabezado, como si fuera un solo renglón
    if (!items.length) {
      const ini = lineas.findIndex((l) => /(CANTIDAD|CANT\.?)\b.*(PRECIO|UNIT|TOTAL)|PRECIO\s+UNITARIO|OFERTA\s+ES\s+LA\s+SIGUIENTE|COTIZAMOS\s+LO\s+SIGUIENTE|DESCRIPCI.N\b.*\bTOTAL/.test(plano(l.texto)));
      if (ini >= 0) {
        let fin = ini + 1;
        while (fin < lineas.length && fin <= ini + 8 && lineas[fin].texto.length < 90 && !/^\W*(PLAZO|VALIDEZ|GARANT|FORMA\s+DE\s+PAGO|LIMA\b)/.test(plano(lineas[fin].texto))) fin++;
        const bloque = lineas.slice(ini + 1, fin);
        const f = bloque.length > 1 ? filaDeItem(bloque.map((l) => l.texto).join(' ')) : null;
        if (f && !f.parcial) {
          const donde = ini + 1 + bloque.findIndex((l) => l.texto.includes(String(f.total).split('.')[0]) || /\d/.test(l.texto));
          f.linea = Math.max(ini + 1, donde);
          f.desdeBloque = true;
          items.push(f);
        }
      }
    }
    // los ítems siguen el orden de la tabla: si no traen número se les da
    items.forEach((it, k) => { if (it.n == null) it.n = k + 1; });

    const tot = leerTotales(lineas, esFila);
    const cond = {};
    const pl = primero(lineas, RX.plazo); if (pl) { cond.plazo = pl.v; cond.plazoDias = diasDe(pl.v); }
    const va = primero(lineas, RX.validez); if (va) { cond.validez = va.v; cond.validezDias = diasDe(va.v); }
    const ga = buscarValor(lineas, RX.garantia); if (ga) cond.garantia = ga.v;
    const pa = primero(lineas, RX.pago); if (pa) cond.pago = pa.v;
    const lu = buscarValor(lineas, RX.lugar); if (lu) cond.lugar = lu.v;
    return {
      items, subtotal: tot.subtotal, igv: tot.igv, totales: tot.totales, cond,
      moneda: leerMoneda(lineas), igvIncluido: leerIgv(lineas), dudosas,
    };
  }

  /** Todo lo que se puede sacar de una hoja. */
  function leerHoja(lineas) {
    const formato = formatoDe(lineas);
    const ident = leerIdentidad(lineas);
    const precios = leerPrecios(lineas);
    const tienePrecios = precios.items.length > 0 || precios.totales.length > 0;
    return { formato, ident, precios, tienePrecios };
  }

  /* ---------- postores ---------- */

  /**
   * Junta las hojas leídas en postores, en el orden en que vienen.
   * `hojas`: [{ id, grupo, lineas }]; `grupo` es de dónde viene (paquete o archivo).
   * Un postor nuevo empieza cuando cambia el grupo, cuando llega otro
   * Formato 1 o cuando aparece otro RUC.
   */
  function armarPostores(hojas) {
    const postores = [];
    let actual = null;
    let ultimoGrupo = null;
    hojas.forEach((h) => {
      const lec = leerHoja(h.lineas);
      const ruc = lec.ident.ruc;
      let nuevo = !actual || h.grupo !== ultimoGrupo;
      if (!nuevo && ruc && actual.ruc && ruc !== actual.ruc) nuevo = true;
      if (!nuevo && lec.formato === 1 && actual.formatos.includes(1) && !(ruc && ruc === actual.ruc)) nuevo = true;
      if (nuevo) {
        actual = {
          id: 'p' + (postores.length + 1), hojas: [], formatos: [], razon: '', ruc: '',
          direccion: '', telefono: '', correo: '', correoDudoso: false, representante: '', dni: '',
          items: [], total: null, totalDeclarado: null, subtotal: null, igv: null, moneda: '', igvIncluido: '',
          plazo: '', plazoDias: null, validez: '', validezDias: null, garantia: '', pago: '', lugar: '',
          cumple: true, avisos: [], extra: [], dudosas: [], origen: new Set(), donde: {},
        };
        postores.push(actual);
      }
      ultimoGrupo = h.grupo;
      absorber(actual, h, lec);
    });
    postores.forEach(cerrarPostor);
    return postores;
  }

  function absorber(p, h, lec) {
    p.hojas.push(h.id);
    if (lec.formato && !p.formatos.includes(lec.formato)) p.formatos.push(lec.formato);
    if (h.origen) p.origen.add(h.origen);
    const id = lec.ident;
    const caja = (i) => {
      const l = i != null && h.lineas[i];
      return l ? { hoja: h.id, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 } : null;
    };
    ['razon', 'ruc', 'direccion', 'telefono', 'correo', 'representante', 'dni'].forEach((c) => {
      if (id[c] && !p[c]) {
        p[c] = id[c];
        if (id.donde && id.donde[c] != null) p.donde[c] = caja(id.donde[c]);
      }
    });
    if (id.correoDudoso && p.correo === id.correo) p.correoDudoso = true;
    const pr = lec.precios;
    if (lec.tienePrecios) {
      // los ítems y los totales son de la hoja de precios; si hay dos, se suman los ítems
      pr.items.forEach((it) => p.items.push(Object.assign({ hoja: h.id, caja: caja(it.linea) }, it)));
      pr.totales.forEach((t) => {
        if (p.totalDeclarado == null || t.v > p.totalDeclarado) { p.totalDeclarado = t.v; p.donde.total = caja(t.linea); }
      });
      if (pr.subtotal != null) p.subtotal = pr.subtotal;
      if (pr.igv != null) p.igv = pr.igv;
      if (pr.totales.length > 1) p.avisos.push(`Trae varios totales: ${pr.totales.map((t) => fmt(t.v)).join(' · ')}. Se tomó el mayor.`);
      if (pr.moneda && !p.moneda) p.moneda = pr.moneda;
      if (pr.igvIncluido && !p.igvIncluido) p.igvIncluido = pr.igvIncluido;
      p.dudosas.push(...pr.dudosas);
    }
    const c = pr.cond;
    ['plazo', 'validez', 'garantia', 'pago', 'lugar'].forEach((k) => { if (c[k] && !p[k]) p[k] = c[k]; });
    if (c.plazoDias != null && p.plazoDias == null) p.plazoDias = c.plazoDias;
    if (c.validezDias != null && p.validezDias == null) p.validezDias = c.validezDias;
  }

  function cerrarPostor(p) {
    p.items.forEach((it, k) => { it.n = k + 1; });
    recalcular(p);
  }

  const fmt = (n) => (n == null || isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  /** Revisa un postor: el total, la suma de sus ítems y lo que no cuadra. */
  function recalcular(p) {
    p.avisosPropios = [];
    const av = p.avisosPropios;
    const suma = redondear(p.items.reduce((s, it) => s + (Number(it.total) || 0), 0));
    p.sumaItems = p.items.length ? suma : null;
    if (p.totalDeclarado != null) {
      p.total = p.totalDeclarado;
      p.totalDe = 'declarado';
      if (p.sumaItems != null) {
        if (casi(p.sumaItems, p.totalDeclarado, 0.05)) { /* cuadra */ }
        else if (casi(redondear(p.sumaItems * 1.18), p.totalDeclarado, 0.1)) p.totalDe = 'declarado con IGV';
        else av.push(`El total (${fmt(p.totalDeclarado)}) no coincide con la suma de sus ítems (${fmt(p.sumaItems)}). Mira la hoja.`);
      }
    } else if (p.sumaItems != null) {
      p.total = p.sumaItems;
      p.totalDe = 'suma de ítems';
      av.push('No se encontró el total en la hoja; se sumaron los ítems.');
    } else {
      p.total = null;
      p.totalDe = '';
      if (p.formatos.includes(5) || p.hojas.length) av.push('No se pudo leer ningún precio. Escríbelo en el cuadro o mira la hoja.');
    }
    if (p.items.some((it) => it.inferida)) av.push('A algún ítem se le perdió la cantidad al leer; se dedujo del precio. Verifícalo.');
    p.items.forEach((it) => {
      if (it.noCuadra) av.push(`Ítem ${it.n}: cantidad × precio unitario (${fmt(it.cant)} × ${fmt(it.pu)} = ${fmt(it.noCuadra.calc)}) no da el total que dice (${fmt(it.noCuadra.dice)}). Una de las cifras se leyó mal: mira la hoja.`);
      else if (it.parcial && (it.cant == null || it.pu == null)) av.push(`Ítem ${it.n}: solo se pudo leer el total (${fmt(it.total)}); la cantidad y el precio unitario no. Mira la hoja.`);
    });
    if (p.ruc && !rucValido(p.ruc)) av.push(`El RUC ${p.ruc} no pasa la verificación; puede estar mal leído.`);
    if (!p.ruc) av.push('No se encontró el RUC (¿falta el Formato 1?).');
    if (!p.razon) av.push('No se encontró la razón social (¿falta el Formato 1?).');
    p.avisos = (p.extra || []).concat(av).concat(p.dudosas.length ? ['Hay líneas con precios que no se entendieron: ' + p.dudosas.slice(0, 3).join(' | ')] : []);
  }

  /* ---------- quién gana ---------- */

  const palabrasDe = (s) => new Set(plano(s).split(/[^A-Z0-9]+/).filter((w) => w.length > 2));
  function parecido(a, b) {
    const A = palabrasDe(a), B = palabrasDe(b);
    if (!A.size || !B.size) return 0;
    let n = 0;
    A.forEach((w) => { if (B.has(w)) n++; });
    return n / (A.size + B.size - n);
  }

  /** Pone en fila los ítems de todos los postores para ver el menor precio de cada uno. */
  function compararItems(postores) {
    const conItems = postores.filter((p) => p.items.length);
    if (conItems.length < 2) return [];
    const base = conItems.slice().sort((x, y) => y.items.length - x.items.length)[0];
    const filas = base.items.map((it, k) => ({ n: k + 1, desc: it.desc, cant: it.cant, celdas: new Map() }));
    conItems.forEach((p) => {
      const libres = new Set(p.items.map((_, k) => k));
      base.items.forEach((bi, k) => {
        if (p === base) { filas[k].celdas.set(p.id, p.items[k]); libres.delete(k); return; }
        let mejor = -1, q = 0.3;
        libres.forEach((j) => { const s = parecido(bi.desc, p.items[j].desc); if (s > q) { q = s; mejor = j; } });
        if (mejor < 0 && libres.has(k) && base.items.length === p.items.length) mejor = k;
        if (mejor >= 0) { filas[k].celdas.set(p.id, p.items[mejor]); libres.delete(mejor); }
      });
    });
    filas.forEach((f) => {
      let min = Infinity;
      f.celdas.forEach((it, id) => {
        const p = postores.find((x) => x.id === id);
        if (p && p.cumple !== false && it.pu > 0 && it.pu < min) min = it.pu;
      });
      f.mejor = isFinite(min) ? min : null;
    });
    return filas;
  }

  /**
   * Quién gana: el menor precio total entre los que cumplen. Además deja
   * los avisos que cambian la lectura (monedas distintas, un solo postor,
   * un precio sospechosamente bajo…).
   */
  function evaluar(postores) {
    postores.forEach(recalcular);
    const avisos = [];
    const validos = postores.filter((p) => p.cumple !== false && p.total > 0);
    const res = { ganadores: [], ranking: [], diferencia: null, avisos, filas: compararItems(postores), mejorPlazo: null };
    if (!validos.length) {
      avisos.push('Ningún postor tiene un precio total. Revisa las hojas o escribe los precios en el cuadro.');
      return res;
    }
    const monedas = new Set(validos.map((p) => p.moneda || 'PEN'));
    if (monedas.size > 1) {
      avisos.push('Hay ofertas en monedas distintas (soles y dólares): no se pueden comparar así. Unifica la moneda.');
      return res;
    }
    const igv = new Set(validos.map((p) => p.igvIncluido).filter(Boolean));
    if (igv.size > 1) avisos.push('Unos postores incluyen el IGV y otros no: los totales no son comparables tal cual.');
    const orden = validos.slice().sort((a, b) => a.total - b.total);
    let rank = 0, prev = null;
    orden.forEach((p, i) => {
      if (prev == null || !casi(p.total, prev, 0.005)) rank = i + 1;
      prev = p.total;
      res.ranking.push({ id: p.id, rank, total: p.total });
    });
    res.ganadores = res.ranking.filter((r) => r.rank === 1).map((r) => r.id);
    if (res.ganadores.length > 1) avisos.push('Hay un empate en el menor precio: ' + res.ganadores.map((id) => nombreCorto(postores.find((p) => p.id === id))).join(' y ') + '.');
    const segundo = res.ranking.find((r) => r.rank > 1);
    if (segundo) {
      const dif = redondear(segundo.total - orden[0].total);
      res.diferencia = { monto: dif, porcentaje: Math.round((dif / segundo.total) * 1000) / 10, contra: segundo.id };
    }
    if (validos.length === 1) avisos.push('Solo hay una oferta válida.');
    if (validos.length >= 3) {
      const med = orden[Math.floor(orden.length / 2)].total;
      orden.forEach((p) => {
        if (p.total < med * 0.5) avisos.push(`${nombreCorto(p)} cotiza menos de la mitad que los demás (${fmt(p.total)}). Verifica que no sea un error de lectura.`);
      });
    }
    const conPlazo = validos.filter((p) => p.plazoDias != null);
    if (conPlazo.length > 1) {
      const m = Math.min(...conPlazo.map((p) => p.plazoDias));
      res.mejorPlazo = conPlazo.filter((p) => p.plazoDias === m).map((p) => p.id);
    }
    const fuera = postores.filter((p) => p.cumple === false);
    if (fuera.length) avisos.push(`${fuera.length === 1 ? 'Un postor marcado' : fuera.length + ' postores marcados'} como «no cumple»: no entra${fuera.length === 1 ? '' : 'n'} en la comparación.`);
    return res;
  }

  function nombreCorto(p) { return (p && (p.razon || 'Postor ' + p.id.slice(1))) || ''; }

  /* ---------- salidas ---------- */

  /** El cuadro como texto con tabuladores: pega directo en Excel o en otro programa. */
  function aTexto(postores, res) {
    const filas = [['Postor', 'RUC', 'Precio total', 'Plazo de entrega', 'Validez', 'Garantía', 'Forma de pago', 'Cumple', 'Resultado']];
    postores.forEach((p) => {
      const r = res.ranking.find((x) => x.id === p.id);
      const gana = res.ganadores.includes(p.id);
      filas.push([p.razon, p.ruc, p.total != null ? p.total.toFixed(2) : '', p.plazo, p.validez, p.garantia, p.pago,
        p.cumple === false ? 'No' : 'Sí', gana ? 'GANADOR (menor precio)' : r ? 'N.º ' + r.rank : '']);
    });
    return filas.map((f) => f.map((c) => String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  }

  const API = {
    plano, leerMonto, montosDe, rucValido, formatoDe, leerIdentidad, leerPrecios, leerHoja,
    armarPostores, recalcular, evaluar, compararItems, aTexto, fmt, nombreCorto, diasDe,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else (window.Grapa = window.Grapa || {}).ofertas = API;
})();
