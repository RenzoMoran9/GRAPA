/**
 * Grapa · Recolector de cotizaciones desde Gmail
 *
 * Módulo aparte: busca en TU correo los hilos de un expediente, baja los
 * adjuntos que mandaron los proveedores, los agrupa por empresa y arma
 * también un PDF del correo con el que llegó cada cotización.
 *
 * Qué toca y qué no:
 *   · Pide permiso de SOLO LECTURA (gmail.readonly). No puede enviar, borrar
 *     ni modificar nada de tu correo.
 *   · El token de acceso vive en memoria y se pierde al cerrar la pestaña:
 *     no se guarda en el disco ni se manda a ningún lado.
 *   · Lo único que se guarda es el identificador de cliente de Google, que es
 *     público por diseño (va escrito en la página de cualquier app web).
 *   · Los correos y adjuntos van de Google a tu navegador y de ahí a tu
 *     carpeta. No pasan por ningún servidor mío ni de nadie.
 */
(function (G) {
  'use strict';

  const AMBITO = 'https://www.googleapis.com/auth/gmail.readonly';
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const GIS = 'https://accounts.google.com/gsi/client';
  const CLAVE_ID = 'grapa.gmail.clienteId';
  const MAX_HILOS = 50;

  let token = null;          // solo en memoria, a propósito
  let clienteToken = null;
  let miCorreo = null;

  /* ------------------------- entorno y permisos ------------------------ */

  /** Google no admite OAuth desde un archivo local: hace falta la web (https). */
  G.correoDisponible = () =>
    location.protocol === 'https:' || /^localhost$|^127\./.test(location.hostname);

  function clienteIdGuardado() {
    try { return localStorage.getItem(CLAVE_ID) || ''; } catch (e) { return ''; }
  }
  function guardarClienteId(id) {
    try { localStorage.setItem(CLAVE_ID, id); } catch (e) {}
  }

  /** Trae la librería de Google solo cuando hace falta: sin esto Grapa sigue
   *  funcionando entera sin conexión. */
  function cargarGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const ya = document.querySelector('script[data-gis]');
      if (ya) { ya.addEventListener('load', res); ya.addEventListener('error', rej); return; }
      const s = document.createElement('script');
      s.src = GIS;
      s.async = true;
      s.dataset.gis = '1';
      s.onload = res;
      s.onerror = () => rej(new Error('no se pudo cargar el conector de Google'));
      document.head.appendChild(s);
    });
  }

  async function conectar(clienteId) {
    if (!G.correoDisponible()) {
      throw new Error('Este módulo necesita la versión web (https). En el archivo '
        + 'local Google no permite iniciar sesión.');
    }
    if (!clienteId) throw new Error('falta el identificador de cliente de Google');
    await cargarGis();
    guardarClienteId(clienteId);
    token = await new Promise((res, rej) => {
      clienteToken = google.accounts.oauth2.initTokenClient({
        client_id: clienteId,
        scope: AMBITO,
        callback: (r) => (r && r.access_token
          ? res(r.access_token)
          : rej(new Error('no se concedió el permiso'))),
        error_callback: (e) => rej(new Error(
          e && e.type === 'popup_closed' ? 'cerraste la ventana de Google' : 'no se pudo entrar')),
      });
      clienteToken.requestAccessToken({ prompt: '' });
    });
    const perfil = await api('/profile');
    miCorreo = (perfil.emailAddress || '').toLowerCase();
    return miCorreo;
  }

  function desconectar() {
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token); } catch (e) {}
    }
    token = null;
    miCorreo = null;
  }

  async function api(ruta, comoTexto) {
    if (!token) throw new Error('no hay sesión de Gmail');
    const r = await fetch(API + ruta, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401 || r.status === 403) {
      token = null;
      throw new Error('la sesión de Gmail caducó: vuelve a conectar');
    }
    if (!r.ok) throw new Error('Gmail respondió ' + r.status);
    return comoTexto ? r.text() : r.json();
  }

  /* ----------------------------- búsqueda ----------------------------- */

  /**
   * "EXP. 10488" y sus variantes: con o sin punto, con o sin espacio, y con
   * lo que venga detrás (// , guion, dos puntos) sin que se pegue otro número.
   */
  G.patronExpediente = function (numero) {
    const n = String(numero).trim().replace(/[^\d]/g, '');
    if (!n) return null;
    return new RegExp('(?:^|[^A-Za-z0-9])EXP(?:EDIENTE)?[\\s.\\-–—:]*0*' + n + '(?![0-9])', 'i');
  };

  /** Cabecera de un mensaje de Gmail por nombre. */
  function cabecera(mensaje, nombre) {
    const h = (mensaje.payload && mensaje.payload.headers) || [];
    const c = h.find((x) => x.name.toLowerCase() === nombre.toLowerCase());
    return c ? c.value : '';
  }

  /** "COMERCIAL XYZ SAC <ventas@xyz.com>" → {nombre, correo} */
  function separarRemitente(valor) {
    const m = String(valor || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m) {
      return {
        nombre: m[1].replace(/^["']|["']$/g, '').trim(),
        correo: m[2].trim().toLowerCase(),
      };
    }
    const correo = String(valor || '').trim().toLowerCase();
    return { nombre: '', correo };
  }

  /** Nombre de carpeta para la empresa: el que firma el correo, o su dominio. */
  function nombreEmpresa(remitente) {
    let base = remitente.nombre;
    if (!base || /@/.test(base)) {
      const dominio = (remitente.correo.split('@')[1] || 'sin-dominio')
        .replace(/\.(com|net|org|pe|es|gob|edu)(\.[a-z]{2})?$/i, '');
      base = dominio;
    }
    return G.nombreSeguro(base, 'empresa').slice(0, 60);
  }

  /* --------------------- lectura de partes del mensaje ------------------ */

  function deBase64Url(s) {
    const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function textoDeBase64Url(s) {
    try { return new TextDecoder('utf-8').decode(deBase64Url(s)); } catch (e) { return ''; }
  }

  /** Recorre el árbol de partes de un mensaje. */
  function recorrerPartes(parte, ver) {
    if (!parte) return;
    ver(parte);
    (parte.parts || []).forEach((p) => recorrerPartes(p, ver));
  }

  /** Adjuntos de verdad: los que tienen nombre y no son la imagen incrustada. */
  function adjuntosDe(mensaje) {
    const salida = [];
    recorrerPartes(mensaje.payload, (p) => {
      const id = p.body && p.body.attachmentId;
      if (!id || !p.filename) return;
      const enLinea = /inline/i.test(
        ((p.headers || []).find((h) => /content-disposition/i.test(h.name)) || {}).value || '');
      const cid = (((p.headers || []).find((h) => /content-id/i.test(h.name)) || {}).value || '')
        .replace(/[<>]/g, '');
      salida.push({
        id, nombre: p.filename, tipo: p.mimeType || 'application/octet-stream',
        tam: (p.body && p.body.size) || 0, enLinea: enLinea && !!cid, cid,
      });
    });
    return salida;
  }

  /** Cuerpo del mensaje, preferido en HTML. */
  function cuerpoDe(mensaje) {
    let html = '', texto = '';
    recorrerPartes(mensaje.payload, (p) => {
      const datos = p.body && p.body.data;
      if (!datos) return;
      if (p.mimeType === 'text/html' && !html) html = textoDeBase64Url(datos);
      if (p.mimeType === 'text/plain' && !texto) texto = textoDeBase64Url(datos);
    });
    return { html, texto };
  }

  /* --------------------------- el recorrido --------------------------- */

  /**
   * Busca los hilos del expediente y devuelve las empresas con sus archivos.
   * No escribe nada todavía: solo trae y ordena.
   */
  async function recolectar(numero, alProgresar) {
    const patron = G.patronExpediente(numero);
    if (!patron) throw new Error('el número de expediente no es válido');
    const avisar = (t) => { if (alProgresar) alProgresar(t); };

    avisar('Buscando en tu correo…');
    let ids = await buscarHilos(`subject:${numero}`);
    if (!ids.length) ids = await buscarHilos(`${numero}`);   // por si el asunto no lo trae
    if (!ids.length) return { numero, empresas: [], hilos: 0, mios: 0, repetidos: 0 };

    const empresas = new Map();
    const devueltos = new Set();     // lo que yo mandé y me vuelve en las respuestas
    let hilosValidos = 0;
    let mios = 0;
    let repetidos = 0;
    const limitados = ids.slice(0, MAX_HILOS);

    for (let i = 0; i < limitados.length; i++) {
      avisar(`Leyendo hilo ${i + 1} de ${limitados.length}…`);
      const hilo = await api(`/threads/${limitados[i]}?format=full`);
      const mensajes = hilo.messages || [];
      // El hilo cuenta si el asunto de alguno lleva el expediente
      if (!mensajes.some((m) => patron.test(cabecera(m, 'Subject')))) continue;
      hilosValidos++;

      mensajes.sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
      // Al responder, el correo del proveedor vuelve a adjuntar lo que yo le
      // mandé. Se apunta para no meter mi propio requerimiento como si fuera
      // documentación suya.
      mensajes.forEach((m) => {
        const de = separarRemitente(cabecera(m, 'From'));
        if (miCorreo && de.correo === miCorreo) {
          adjuntosDe(m).forEach((a) => devueltos.add(senal(a)));
        }
      });
      for (const m of mensajes) {
        const de = separarRemitente(cabecera(m, 'From'));
        if (!de.correo) continue;
        if (miCorreo && de.correo === miCorreo) { mios++; continue; }   // el mío no se baja

        const clave = de.correo;
        if (!empresas.has(clave)) {
          empresas.set(clave, {
            correo: de.correo, nombre: nombreEmpresa(de), mensajes: [], archivos: [],
            vistos: new Set(), huellas: new Set(),
          });
        }
        empresas.get(clave).mensajes.push({
          id: m.id,
          asunto: cabecera(m, 'Subject'),
          fecha: cabecera(m, 'Date') || new Date(Number(m.internalDate || 0)).toLocaleString(),
          cuando: Number(m.internalDate || 0),
          de: de,
          para: cabecera(m, 'To'),
          cuerpo: cuerpoDe(m),
          adjuntos: adjuntosDe(m),
        });
      }
    }

    // Cada empresa: sus mensajes en orden de llegada y la numeración 01, 02…
    const lista = Array.from(empresas.values());
    for (const emp of lista) {
      emp.mensajes.sort((a, b) => a.cuando - b.cuando);
      let n = 0;
      for (const men of emp.mensajes) {
        // Las imágenes incrustadas (el logo de la firma) se traen primero para
        // que el PDF del correo salga como se ve en Gmail
        const enLinea = {};
        for (const adj of men.adjuntos.filter((a) => a.enLinea && a.tam < 2000000)) {
          try {
            const d = await api(`/messages/${men.id}/attachments/${adj.id}`);
            enLinea[adj.cid] = 'data:' + adj.tipo + ';base64,'
              + String(d.data || '').replace(/-/g, '+').replace(/_/g, '/');
          } catch (e) { /* si falla, el correo sale sin esa imagen */ }
        }
        avisar(`${emp.nombre}: armando el PDF del correo…`);
        const pdf = await G.correoAPdf(men, enLinea);
        emp.archivos.push({
          orden: ++n, nombre: prefijo(n) + '-correo.pdf', bytes: pdf,
          tipo: 'application/pdf', esCorreo: true, cuando: men.cuando,
        });
        for (const adj of men.adjuntos) {
          if (adj.enLinea) continue;                       // logos de la firma, no
          const marca = senal(adj);
          // Mi propio requerimiento, que vuelve pegado a la respuesta
          if (devueltos.has(marca)) { repetidos++; continue; }
          // La misma copia que ya trajo esta empresa en otro mensaje del hilo
          if (emp.vistos.has(marca)) { repetidos++; continue; }
          emp.vistos.add(marca);

          avisar(`${emp.nombre}: bajando ${adj.nombre}…`);
          const datos = await api(`/messages/${men.id}/attachments/${adj.id}`);
          const bytes = deBase64Url(datos.data);
          // Última red: el mismo contenido con otro nombre
          const h = await huella(bytes);
          if (emp.huellas.has(h)) { repetidos++; continue; }
          emp.huellas.add(h);

          emp.archivos.push({
            orden: ++n,
            nombre: prefijo(n) + '-' + G.nombreSeguro(adj.nombre, 'adjunto'),
            bytes, tipo: adj.tipo, cuando: men.cuando,
          });
        }
      }
      // se renumera al final para que quede 01, 02, 03 sin huecos
      emp.archivos.forEach((a, i) => {
        a.nombre = a.nombre.replace(/^\d+-/, prefijo(i + 1) + '-');
      });
    }
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { numero, empresas: lista, hilos: hilosValidos, mios, repetidos };
  }

  const prefijo = (n) => String(n).padStart(2, '0');

  /** Nombre + tamaño: reconoce la copia ANTES de gastar la descarga. */
  const senal = (adj) => `${String(adj.nombre).toLowerCase()}|${adj.tam}`;

  /** Huella del contenido: reconoce la copia aunque venga con otro nombre. */
  async function huella(bytes) {
    try {
      const h = await crypto.subtle.digest('SHA-256', bytes.slice(0).buffer);
      return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return 'sin-huella-' + bytes.length + '-' + Math.random();
    }
  }

  async function buscarHilos(consulta) {
    const vistos = [];
    let pagina = '';
    for (let v = 0; v < 5; v++) {
      const r = await api('/messages?maxResults=100&q=' + encodeURIComponent(consulta)
        + (pagina ? '&pageToken=' + pagina : ''));
      (r.messages || []).forEach((m) => {
        if (!vistos.includes(m.threadId)) vistos.push(m.threadId);
      });
      pagina = r.nextPageToken || '';
      if (!pagina) break;
    }
    return vistos;
  }

  /* --------------------- el correo convertido en PDF -------------------- */

  const PROHIBIDOS = 'script,style,iframe,object,embed,link,meta,base,form,input,button,svg';

  /**
   * Deja el HTML del correo en algo seguro de dibujar: sin guiones, sin
   * recursos de fuera (que además avisarían al remitente de que se abrió) y
   * sin nada que se ejecute.
   */
  function limpiarHtml(html) {
    // DOMParser arma un documento inerte: no ejecuta nada y, sobre todo, NO
    // pide los recursos de fuera. Con innerHTML el navegador dispararía las
    // imágenes al instante —incluido el píxel de rastreo que traen muchos
    // correos— antes de que diera tiempo a quitarlas.
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const caja = doc.body;
    caja.querySelectorAll(PROHIBIDOS).forEach((n) => n.remove());
    caja.querySelectorAll('*').forEach((n) => {
      Array.from(n.attributes).forEach((a) => {
        const nombre = a.name.toLowerCase();
        const valor = String(a.value || '');
        if (nombre.startsWith('on')) n.removeAttribute(a.name);
        else if (/^(href|src|xlink:href|action|background|formaction)$/.test(nombre)
                 && /^\s*(javascript|data:text\/html|vbscript)/i.test(valor)) {
          n.removeAttribute(a.name);
        }
      });
    });
    caja.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (/^cid:/i.test(src)) return;                   // se resuelve luego
      if (/^data:image\//i.test(src)) return;           // ya viene dentro
      img.replaceWith(doc.createTextNode('[imagen no incluida]'));
    });
    // Ya limpio, se trae al documento de verdad para poder dibujarlo. Se
    // traen los hijos, no el <body>: un <body> anidado arrastra los estilos
    // que el navegador le pone por defecto y mete un marco gris y un hueco.
    const destino = document.createElement('div');
    Array.from(caja.childNodes).forEach((n) => destino.appendChild(document.importNode(n, true)));
    return destino;
  }

  const ESTILO_CORREO = `
    .gcorreo { font: 13px "Calibri", "Carlito", Arial, sans-serif; color:#000; line-height:1.45; }
    .gcorreo .ficha { border:1px solid #444; padding:10px 12px; margin-bottom:14px; }
    .gcorreo .ficha div { margin:2px 0; }
    .gcorreo .ficha b { display:inline-block; min-width:64px; }
    .gcorreo .cuerpo { word-wrap:break-word; overflow-wrap:anywhere; }
    .gcorreo .cuerpo table { border-collapse:collapse; max-width:100%; }
    .gcorreo .cuerpo img { max-width:100%; height:auto; }
    .gcorreo .pie { margin-top:16px; border-top:1px solid #bbb; padding-top:6px;
                    font-size:10px; color:#555; }
  `;

  /** Arma el PDF de un correo: ficha con fecha, remitente y asunto, y el cuerpo. */
  G.correoAPdf = async function (men, adjuntosEnLinea) {
    const P = G.papel;
    const caja = P.caja();
    try {
      const estilo = document.createElement('style');
      estilo.textContent = ESTILO_CORREO;
      caja.appendChild(estilo);

      const hoja = document.createElement('div');
      hoja.className = 'gcorreo';
      // el alto mínimo de una hoja evita que un correo corto se estire para
      // llenar la página al pasarlo a PDF
      hoja.style.cssText = `width:${P.A4.ancho}px;min-height:${P.A4.alto}px;`
        + `padding:${P.MARGEN}px;box-sizing:border-box;background:#fff`;

      const ficha = document.createElement('div');
      ficha.className = 'ficha';
      [['De', `${men.de.nombre ? men.de.nombre + ' ' : ''}<${men.de.correo}>`],
       ['Para', men.para || ''],
       ['Fecha', men.fecha || ''],
       ['Asunto', men.asunto || '']].forEach(([k, v]) => {
        const f = document.createElement('div');
        const b = document.createElement('b');
        b.textContent = k + ':';
        f.appendChild(b);
        f.appendChild(document.createTextNode(' ' + v));
        ficha.appendChild(f);
      });
      hoja.appendChild(ficha);

      const cuerpo = document.createElement('div');
      cuerpo.className = 'cuerpo';
      if (men.cuerpo && men.cuerpo.html) {
        const limpio = limpiarHtml(men.cuerpo.html);
        // Las imágenes incrustadas (cid:) se resuelven con lo que ya se bajó
        if (adjuntosEnLinea) {
          limpio.querySelectorAll('img[src^="cid:"], img[SRC^="cid:"]').forEach((img) => {
            const cid = (img.getAttribute('src') || '').slice(4).replace(/[<>]/g, '');
            const dato = adjuntosEnLinea[cid];
            if (dato) img.setAttribute('src', dato);
            else img.replaceWith(document.createTextNode(''));
          });
        }
        cuerpo.appendChild(limpio);
      } else {
        const pre = document.createElement('div');
        pre.style.whiteSpace = 'pre-wrap';
        pre.textContent = (men.cuerpo && men.cuerpo.texto) || '(el correo no traía texto)';
        cuerpo.appendChild(pre);
      }
      hoja.appendChild(cuerpo);

      if (men.adjuntos && men.adjuntos.length) {
        const pie = document.createElement('div');
        pie.className = 'pie';
        pie.textContent = 'Adjuntos del correo: '
          + men.adjuntos.filter((a) => !a.enLinea).map((a) => a.nombre).join(' · ');
        hoja.appendChild(pie);
      }

      caja.appendChild(hoja);
      const lienzo = await P.fotografiar(hoja);
      const alto = hoja.getBoundingClientRect().height;
      if (alto <= P.A4.alto + 4) {
        return P.aPdf([{ lienzo, anchoPx: P.A4.ancho, altoPx: P.A4.alto }]);
      }
      // correo largo: se reparte en hojas del mismo alto
      return P.aPdf(P.partir(lienzo, P.A4.alto)
        .map((l) => ({ lienzo: l, anchoPx: P.A4.ancho, altoPx: P.A4.alto })));
    } finally {
      caja.remove();
    }
  };

  /* -------------------------- lo que se entrega ------------------------ */

  /** Guarda el resultado como EXP-10488 / empresa / archivos. */
  async function guardarEnCarpeta(resultado, alProgresar) {
    const raiz = G.carpeta.actual();
    if (!raiz) throw new Error('primero elige la carpeta de destino');
    const permiso = await G.carpeta.permiso(true);
    if (permiso !== 'granted') throw new Error('no diste permiso sobre la carpeta');
    const dirExp = await raiz.getDirectoryHandle('EXP-' + resultado.numero, { create: true });
    let escritos = 0;
    for (const emp of resultado.empresas) {
      const dirEmp = await dirExp.getDirectoryHandle(emp.nombre, { create: true });
      for (const a of emp.archivos) {
        if (alProgresar) alProgresar(`Guardando ${emp.nombre}/${a.nombre}…`);
        const fh = await dirEmp.getFileHandle(a.nombre, { create: true });
        const w = await fh.createWritable();
        await w.write(a.bytes);
        await w.close();
        escritos++;
      }
    }
    return { carpeta: 'EXP-' + resultado.numero, escritos };
  }

  /** Los archivos como File, en orden, listos para el taller. */
  function comoArchivos(resultado) {
    const salida = [];
    for (const emp of resultado.empresas) {
      for (const a of emp.archivos) {
        salida.push(new File([a.bytes.slice(0)], `${emp.nombre} ${a.nombre}`, { type: a.tipo }));
      }
    }
    return salida;
  }

  G.correo = {
    disponible: G.correoDisponible,
    clienteIdGuardado,
    conectar,
    desconectar,
    conectado: () => !!token,
    cuenta: () => miCorreo,
    recolectar,
    guardarEnCarpeta,
    comoArchivos,
  };
})(window.Grapa);
