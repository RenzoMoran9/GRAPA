/* ===========================================================
   Pdflash · cuentas de usuario, permisos y panel de control

   Con Supabase configurado (assets/config.js), cada persona entra con
   su cuenta y solo ve las herramientas que el administrador le dejó
   encendidas. Sin configurar, no hace nada: Pdflash sigue como siempre.

   Lo único que viaja a Supabase es el correo, la contraseña (a su
   servicio de cuentas) y los permisos. Los PDF, las firmas y los
   expedientes siguen sin salir del navegador.

   Va antes que core.js: decide en qué «cajón» del navegador se guardan
   las firmas y los expedientes de quien está dentro, para que dos
   personas que comparten computadora no vean lo del otro.
   =========================================================== */
(function () {
  'use strict';

  const G = (window.Grapa = window.Grapa || {});
  const CFG = window.GRAPA_CONFIG || {};
  const URL_SB = String(CFG.supabaseUrl || '').trim().replace(/\/+$/, '');
  const LLAVE = String(CFG.supabaseKey || '').trim();
  const ACTIVO = !!(URL_SB && LLAVE);

  /* ---------------- las funciones que el administrador enciende y apaga ----------------
     «secciones» son las del panel lateral (data-bloque / data-va del riel);
     «botones», los que las abren desde la barra, los menús o la barra de
     selección. Lo que no esté aquí lo tiene siempre todo el mundo. */
  const FUNCIONES = [
    { id: 'expedientes', grupo: 'Entrada', nombre: 'Expedientes guardados', desc: 'Guardar un expediente para retomarlo y abrir los guardados.', secciones: ['guardados'], botones: ['#btnGuardarExp'] },
    { id: 'buscar', grupo: 'Trabajo', nombre: 'Buscar en el expediente', desc: 'Buscar palabras en todas las hojas (Ctrl+F) y leer escaneos.', secciones: ['buscar'], botones: ['#btnBuscarBarra'] },
    { id: 'revisar', grupo: 'Trabajo', nombre: 'Revisar y ubicar formatos', desc: 'Hojas en blanco o torcidas, Formatos 1 y 5, cotizaciones.', secciones: ['revisar'] },
    { id: 'firmas', grupo: 'Trabajo', nombre: 'Firmas y sellos', desc: 'Crear firmas desde un escaneo y colocarlas en las hojas.', secciones: ['firmas'], botones: ['#bsFirmar'] },
    { id: 'sello', grupo: 'Trabajo', nombre: 'Sello de texto / marca de agua', desc: 'Poner un texto o marca de agua sobre las hojas.', secciones: ['marca'] },
    { id: 'foliar', grupo: 'Trabajo', nombre: 'Foliación', desc: 'Numerar las hojas del expediente.', secciones: ['foliar'] },
    { id: 'dividir', grupo: 'Salida', nombre: 'Separar en otro PDF', desc: 'Sacar hojas o partir el expediente en varios PDF.', secciones: ['dividir'], botones: ['#btnDividirHacer'] },
    { id: 'exportar', grupo: 'Salida', nombre: 'Exportar PDF', desc: 'Armar y descargar el PDF terminado (Ctrl+S).', botones: ['#btnGuardar', '#btnDescargarSel'] },
    { id: 'imprimir', grupo: 'Salida', nombre: 'Imprimir', desc: 'Imprimir hojas, paquetes o la selección (Ctrl+P).', botones: ['#btnImprimir', '#btnImprimirSel'] },
    { id: 'editarTexto', grupo: 'Salida', nombre: 'Editar texto', desc: 'Corregir el texto de una hoja o escribir encima.', botones: ['#btnEditarTexto', '#menuEditorAvanzado', '#lectorEditarTexto'] },
    { id: 'subirWeb', grupo: 'Salida', nombre: 'Subir a otra web', desc: 'Descargar el PDF y abrir un editor externo en internet.', botones: ['#btnEditorExterno'] },
  ];
  const FUNCION_DE_SECCION = {};
  FUNCIONES.forEach((f) => (f.secciones || []).forEach((s) => { FUNCION_DE_SECCION[s] = f.id; }));

  /* ---------------- almacenamiento local ---------------- */
  const CLAVE_SESION = 'grapa.cuenta.sesion';
  const CLAVE_PERFIL = 'grapa.cuenta.perfil';
  const CLAVE_DUENO = 'grapa.cuenta.dueno-datos';
  const leerJSON = (k) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const escribirJSON = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /**
   * En qué cajón guarda Pdflash las cosas de esta cuenta. La primera cuenta
   * que entra en este navegador se queda con lo que ya había (el cajón sin
   * sufijo): así quien ya usaba Pdflash no pierde sus firmas ni sus
   * expedientes al activar las cuentas. Las demás estrenan cajón propio.
   */
  function sufijoPara(uid) {
    let dueno = null;
    try { dueno = localStorage.getItem(CLAVE_DUENO); } catch (e) {}
    if (!dueno) { try { localStorage.setItem(CLAVE_DUENO, uid); } catch (e) {} dueno = uid; }
    return dueno === uid ? '' : ':' + uid;
  }

  let sesion = ACTIVO ? leerJSON(CLAVE_SESION) : null;
  let perfil = ACTIVO ? (leerJSON(CLAVE_PERFIL) || {}).perfil || null : null;
  if (perfil && sesion && sesion.user && perfil.id !== sesion.user.id) perfil = null;
  if (ACTIVO) G.sufijoDatos = sesion && sesion.user ? sufijoPara(sesion.user.id) : ':sin-sesion';

  /* ---------------- lo que usa el resto de Pdflash ---------------- */
  const esAdmin = () => !!(perfil && perfil.rol === 'admin' && perfil.estado === 'activo');
  function puede(id) {
    if (!ACTIVO) return true;
    if (!perfil || perfil.estado !== 'activo') return false;
    if (perfil.rol === 'admin') return true;
    const f = perfil.funciones || {};
    return f[id] !== false;
  }
  const nombreFuncion = (id) => (FUNCIONES.find((f) => f.id === id) || { nombre: id }).nombre;
  function avisar(texto, tipo) {
    if (G.aviso) G.aviso(texto, tipo); else console.warn(texto);
  }
  /** Para las acciones: true si puede; si no, lo explica y devuelve false. */
  function permitido(id) {
    if (puede(id)) return true;
    avisar(`«${nombreFuncion(id)}» no está habilitada para tu cuenta. Pídesela al administrador.`, 'error');
    return false;
  }

  G.cuentas = {
    activo: ACTIVO,
    puede,
    permitido,
    seccionPermitida: (s) => !FUNCION_DE_SECCION[s] || puede(FUNCION_DE_SECCION[s]),
    funcionDeSeccion: (s) => FUNCION_DE_SECCION[s] || null,
    perfil: () => perfil,
    esAdmin,
    FUNCIONES,
  };
  if (!ACTIVO) return;

  /* ===========================================================
     Conversación con Supabase (sin librería: tres o cuatro llamadas)
     =========================================================== */
  const TRADUCCIONES = [
    [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/email not confirmed/i, 'Todavía no confirmas tu correo. Abre el enlace que te llegó y vuelve a entrar.'],
    [/user already registered|already been registered/i, 'Ese correo ya tiene una cuenta. Inicia sesión o recupera la contraseña.'],
    [/password should be at least (\d+)/i, (m) => `La contraseña debe tener al menos ${m[1]} caracteres.`],
    [/weak.?password|password is too weak|pwned/i, 'Esa contraseña es muy fácil de adivinar. Usa una más larga o con más variedad.'],
    [/unable to validate email|invalid email|email address .* is invalid/i, 'Ese correo no parece válido.'],
    [/rate limit|too many requests|security purposes/i, 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'],
    [/signups? not allowed|signup is disabled/i, 'El registro de cuentas nuevas está cerrado. Pídele al administrador que te cree una.'],
    [/same.?password|different from the old/i, 'La nueva contraseña tiene que ser distinta de la anterior.'],
    [/jwt expired|invalid jwt|refresh token/i, 'Tu sesión venció. Vuelve a iniciar sesión.'],
    [/único administrador/i, (m, t) => t],
  ];
  function traducir(datos, estado) {
    const t = datos && (datos.msg || datos.message || datos.error_description || datos.error || datos.hint) || '';
    for (const [re, txt] of TRADUCCIONES) {
      const m = String(t).match(re);
      if (m) return typeof txt === 'function' ? txt(m, t) : txt;
    }
    if (estado === 401 || estado === 403) return 'No tienes permiso para hacer eso.';
    if (estado >= 500) return 'El servidor de cuentas no responde bien ahora. Prueba en un momento.';
    return t || `Algo salió mal (código ${estado}).`;
  }

  class ErrorCuenta extends Error {
    constructor(msg, estado, sinRed) { super(msg); this.estado = estado; this.sinRed = !!sinRed; }
  }

  async function pedir(ruta, o) {
    o = o || {};
    const cab = { apikey: LLAVE, 'Content-Type': 'application/json' };
    // solo con sesión: las claves nuevas «sb_publishable_…» no son JWT y no van aquí
    if (o.token) cab.Authorization = 'Bearer ' + o.token;
    if (o.prefer) cab.Prefer = o.prefer;
    let r;
    try {
      r = await fetch(URL_SB + ruta, { method: o.metodo || 'GET', headers: cab, body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo) });
    } catch (e) {
      throw new ErrorCuenta('No hay conexión con el servidor de cuentas.', 0, true);
    }
    const txt = await r.text();
    let datos = null;
    try { datos = txt ? JSON.parse(txt) : null; } catch (e) { datos = { message: txt }; }
    if (!r.ok) throw new ErrorCuenta(traducir(datos, r.status), r.status);
    return datos;
  }

  function guardarSesion(d) {
    if (!d) { sesion = null; escribirJSON(CLAVE_SESION, null); return; }
    sesion = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (Number(d.expires_in) || 3600) * 1000,
      user: { id: d.user.id, email: d.user.email },
    };
    escribirJSON(CLAVE_SESION, sesion);
  }
  function guardarPerfil(p) {
    perfil = p;
    escribirJSON(CLAVE_PERFIL, p ? { perfil: p, comprobado: Date.now() } : null);
  }

  let refrescando = null;
  async function refrescar() {
    if (!sesion || !sesion.refresh_token) throw new ErrorCuenta('Tu sesión venció. Vuelve a iniciar sesión.', 401);
    if (!refrescando) {
      refrescando = pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', cuerpo: { refresh_token: sesion.refresh_token } })
        .then((d) => { guardarSesion(d); })
        .finally(() => { refrescando = null; });
    }
    return refrescando;
  }

  /** Un token vigente: lo renueva si le queda menos de un minuto. */
  async function token() {
    if (!sesion) throw new ErrorCuenta('Inicia sesión.', 401);
    if (sesion.expires_at - Date.now() < 60000) await refrescar();
    return sesion.access_token;
  }

  /** Llamada con la sesión; si el token caducó por el camino, renueva y repite una vez. */
  async function conSesion(ruta, o) {
    o = Object.assign({}, o);
    o.token = await token();
    try { return await pedir(ruta, o); } catch (e) {
      if (e.estado !== 401) throw e;
      await refrescar();
      o.token = sesion.access_token;
      return pedir(ruta, o);
    }
  }

  /**
   * A dónde vuelve el enlace del correo (recuperar contraseña, confirmar
   * cuenta): a esta misma página. Así no depende de que la «Site URL» de
   * Supabase esté bien escrita; si esta dirección no figura en sus
   * «Redirect URLs», Supabase usa la Site URL. Abierta como archivo
   * (file://) no hay a dónde volver, y se deja a la Site URL.
   */
  const volverA = () => /^https?:$/.test(location.protocol)
    ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname)
    : '';

  const API = {
    entrar: (correo, clave) => pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', cuerpo: { email: correo, password: clave } }),
    registrar: (correo, clave, nombre) => pedir('/auth/v1/signup' + volverA(), {
      metodo: 'POST',
      cuerpo: { email: correo, password: clave, data: { nombre } },
    }),
    recuperar: (correo) => pedir('/auth/v1/recover' + volverA(), { metodo: 'POST', cuerpo: { email: correo } }),
    cambiarClave: (clave) => conSesion('/auth/v1/user', { metodo: 'PUT', cuerpo: { password: clave } }),
    usuario: (tok) => pedir('/auth/v1/user', { token: tok }),
    salir: () => sesion ? pedir('/auth/v1/logout', { metodo: 'POST', token: sesion.access_token }).catch(() => {}) : Promise.resolve(),
    miPerfil: () => conSesion('/rest/v1/perfiles?select=*&id=eq.' + encodeURIComponent(sesion.user.id)).then((f) => f && f[0] || null),
    perfiles: () => conSesion('/rest/v1/perfiles?select=*&order=creado.asc'),
    cambiarPerfil: (id, cambios) => conSesion('/rest/v1/perfiles?id=eq.' + encodeURIComponent(id), {
      metodo: 'PATCH', cuerpo: cambios, prefer: 'return=representation',
    }).then((f) => f && f[0]),
    registrarAcceso: () => conSesion('/rest/v1/rpc/registrar_acceso', { metodo: 'POST', cuerpo: {} }).catch(() => {}),
    cambiarMiNombre: (n) => conSesion('/rest/v1/rpc/cambiar_mi_nombre', { metodo: 'POST', cuerpo: { nuevo: n } }),
  };

  /* ===========================================================
     Pantalla de acceso
     =========================================================== */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 21V12.5a4.5 4.5 0 0 1 9 0V22a3 3 0 0 0 6 0v-7"/></svg>';

  const acceso = document.createElement('div');
  acceso.className = 'acceso';
  acceso.id = 'acceso';
  acceso.hidden = true;
  acceso.setAttribute('role', 'dialog');
  acceso.setAttribute('aria-modal', 'true');
  acceso.setAttribute('aria-labelledby', 'accesoTitulo');
  acceso.innerHTML = `
    <section class="acceso-marca" aria-hidden="true">
      <div class="acceso-logo">${LOGO}</div>
      <h1>Pdflash</h1>
      <p class="acceso-lema">El taller de expedientes PDF de tu equipo.</p>
      <ul class="acceso-puntos">
        <li>${ico('docs')}<span><b>Arma el expediente</b> uniendo escaneos, Word, Excel y fotos.</span></li>
        <li>${ico('folios')}<span><b>Folia y firma</b> con tu firma y sello, sin imprimir.</span></li>
        <li>${ico('check')}<span><b>Tus documentos no salen de tu computadora.</b> La cuenta solo dice quién eres y qué herramientas tienes.</span></li>
      </ul>
    </section>
    <section class="acceso-lado">
      <form class="acceso-caja" id="accesoForm" novalidate></form>
    </section>`;
  document.body.appendChild(acceso);
  const form = $('#accesoForm', acceso);

  // Lo que pasa detrás no se toca mientras se ve la pantalla de acceso:
  // ni atajos, ni archivos soltados o pegados.
  const fuera = (ev) => !acceso.hidden && !acceso.contains(ev.target);
  window.addEventListener('keydown', (ev) => { if (fuera(ev)) { ev.stopImmediatePropagation(); } }, true);
  ['paste', 'drop', 'dragover'].forEach((t) => window.addEventListener(t, (ev) => {
    if (!acceso.hidden) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true));

  let modo = 'entrar';
  let mensajeArriba = null;   // { texto, tipo: 'ok' | 'error' | 'info' }

  const MODOS = {
    entrar: { titulo: 'Inicia sesión', sub: 'Entra con tu cuenta para usar Pdflash.', boton: 'Entrar' },
    registro: { titulo: 'Crea tu cuenta', sub: 'El administrador la revisa y te da acceso a las herramientas.', boton: 'Crear cuenta' },
    recuperar: { titulo: 'Recupera tu contraseña', sub: 'Te enviamos un enlace al correo para poner una nueva.', boton: 'Enviar enlace' },
    nueva: { titulo: 'Nueva contraseña', sub: 'Escribe la contraseña que usarás desde ahora.', boton: 'Guardar contraseña' },
  };

  function pintarAcceso() {
    const m = MODOS[modo];
    if (m) {
      const correo = $('#accesoCorreo', form) ? $('#accesoCorreo', form).value : (sesion && sesion.user && sesion.user.email) || '';
      const nombrePrevio = $('#accesoNombre', form) ? $('#accesoNombre', form).value : '';
      form.innerHTML = `
        <div class="acceso-logo acceso-logo-mini">${LOGO}</div>
        <h2 id="accesoTitulo">${m.titulo}</h2>
        <p class="acceso-sub">${m.sub}</p>
        ${mensajeArriba ? `<p class="acceso-msg ${mensajeArriba.tipo}" role="alert">${esc(mensajeArriba.texto)}</p>` : ''}
        ${modo === 'registro' ? `<label class="campo">Nombre y apellido<input type="text" id="accesoNombre" autocomplete="name" required maxlength="80" value="${esc(nombrePrevio)}"></label>` : ''}
        ${modo !== 'nueva' ? `<label class="campo">Correo<input type="email" id="accesoCorreo" autocomplete="email" required value="${esc(correo)}"></label>` : ''}
        ${modo !== 'recuperar' ? `<label class="campo">${modo === 'entrar' ? 'Contraseña' : 'Contraseña nueva'}
          <span class="acceso-clave"><input type="password" id="accesoClave" autocomplete="${modo === 'entrar' ? 'current-password' : 'new-password'}" required minlength="${modo === 'entrar' ? 1 : 8}">
          <button type="button" class="btn btn-mini" id="accesoVer" aria-label="Mostrar la contraseña">Ver</button></span>
          ${modo !== 'entrar' ? '<small class="acceso-pista">Mínimo 8 caracteres.</small>' : ''}</label>` : ''}
        ${modo === 'registro' || modo === 'nueva' ? `<label class="campo">Repite la contraseña
          <input type="password" id="accesoClave2" autocomplete="new-password" required>
          <small class="acceso-pista" id="accesoCoincide" aria-live="polite"></small></label>` : ''}
        ${modo === 'entrar' ? `<button type="button" class="acceso-link acceso-olvido" data-ir="recuperar">¿Olvidaste la contraseña?</button>` : ''}
        <button class="btn btn-primario acceso-enviar" type="submit">${m.boton}</button>
        <div class="acceso-pie">
          ${modo === 'entrar' ? `¿No tienes cuenta? <button type="button" class="acceso-link" data-ir="registro">Solicitar acceso</button>` : ''}
          ${modo === 'registro' || modo === 'recuperar' ? `<button type="button" class="acceso-link" data-ir="entrar">${ico('volver')} Volver a iniciar sesión</button>` : ''}
        </div>`;
    } else {
      // estados de la cuenta: pendiente, bloqueada o sin conexión
      const p = perfil || {};
      const quien = esc(p.nombre || (sesion && sesion.user && sesion.user.email) || '');
      const textos = {
        pendiente: ['Tu cuenta espera aprobación', `Hola${quien ? ', ' + quien : ''}. El administrador tiene que aprobar tu cuenta y elegir qué herramientas usarás. En cuanto lo haga, podrás entrar.`],
        bloqueado: ['Tu cuenta está desactivada', 'El administrador desactivó el acceso de esta cuenta. Si crees que es un error, habla con él.'],
        'sin-conexion': ['Necesitas conectarte', 'Hace tiempo que Pdflash no comprueba tu cuenta. Conéctate a internet y pulsa «Comprobar de nuevo».'],
        cargando: ['Comprobando tu cuenta…', ''],
      }[modo] || ['', ''];
      form.innerHTML = `
        <div class="acceso-logo acceso-logo-mini">${LOGO}</div>
        <h2 id="accesoTitulo">${textos[0]}</h2>
        ${textos[1] ? `<p class="acceso-sub">${textos[1]}</p>` : '<div class="giro acceso-giro"></div>'}
        ${mensajeArriba ? `<p class="acceso-msg ${mensajeArriba.tipo}" role="alert">${esc(mensajeArriba.texto)}</p>` : ''}
        ${modo !== 'cargando' ? `<button type="button" class="btn btn-primario acceso-enviar" id="accesoComprobar">Comprobar de nuevo</button>
        <div class="acceso-pie"><span>${esc(sesion && sesion.user ? sesion.user.email : '')}</span> · <button type="button" class="acceso-link" id="accesoSalir">Cerrar sesión</button></div>` : ''}`;
    }
    const primero = $('input:not([value]), input[value=""]', form) || $('input', form);
    if (primero && !acceso.hidden) setTimeout(() => primero.focus(), 30);
  }

  function irAModo(m, msg) {
    modo = m;
    mensajeArriba = msg || null;
    pintarAcceso();
  }

  function mostrarAcceso(m, msg) {
    document.documentElement.classList.add('con-acceso');
    acceso.hidden = false;
    irAModo(m || 'entrar', msg);
  }
  function ocultarAcceso() {
    acceso.hidden = true;
    document.documentElement.classList.remove('con-acceso');
  }

  form.addEventListener('click', (ev) => {
    const ir = ev.target.closest('[data-ir]');
    if (ir) { irAModo(ir.dataset.ir); return; }
    if (ev.target.closest('#accesoVer')) {
      const c = $('#accesoClave', form);
      const ver = c.type === 'password';
      // «Ver» enseña las dos: así se nota si se escribieron distinto
      [c, $('#accesoClave2', form)].forEach((x) => { if (x) x.type = ver ? 'text' : 'password'; });
      ev.target.closest('#accesoVer').textContent = ver ? 'Ocultar' : 'Ver';
      return;
    }
    if (ev.target.closest('#accesoComprobar')) { comprobar({ forzar: true }); return; }
    if (ev.target.closest('#accesoSalir')) { salir(); }
  });

  // mientras se escribe la repetida, dice si ya coincide
  form.addEventListener('input', (ev) => {
    if (!ev.target.matches('#accesoClave, #accesoClave2')) return;
    const a = $('#accesoClave', form), b = $('#accesoClave2', form), aviso = $('#accesoCoincide', form);
    if (!a || !b || !aviso) return;
    const ok = b.value && a.value === b.value;
    aviso.textContent = !b.value ? '' : ok ? '✓ Las contraseñas coinciden.' : 'Todavía no coinciden.';
    aviso.classList.toggle('bien', !!ok);
    aviso.classList.toggle('mal', !!b.value && !ok);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = $('.acceso-enviar', form);
    const correo = ($('#accesoCorreo', form) || {}).value;
    const clave = ($('#accesoClave', form) || {}).value;
    const nombre = (($('#accesoNombre', form) || {}).value || '').trim();
    const falta = (t) => { mensajeArriba = { texto: t, tipo: 'error' }; pintarAcceso(); };
    if (modo !== 'nueva' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim())) return falta('Escribe un correo válido.');
    if (modo === 'registro' && nombre.length < 2) return falta('Escribe tu nombre.');
    if ((modo === 'registro' || modo === 'nueva') && String(clave || '').length < 8) return falta('La contraseña debe tener al menos 8 caracteres.');
    if ((modo === 'registro' || modo === 'nueva') && clave !== ($('#accesoClave2', form) || {}).value) return falta('Las dos contraseñas no coinciden. Escríbelas otra vez.');
    if (modo === 'entrar' && !clave) return falta('Escribe tu contraseña.');
    boton.disabled = true;
    boton.textContent = 'Un momento…';
    try {
      const c = String(correo || '').trim().toLowerCase();
      if (modo === 'entrar') {
        guardarSesion(await API.entrar(c, clave));
        await trasEntrar();
      } else if (modo === 'registro') {
        const d = await API.registrar(c, clave, nombre);
        if (d && d.access_token) {
          guardarSesion(d);
          await trasEntrar();
        } else {
          irAModo('entrar', { texto: `Listo. Te enviamos un correo a ${c}: abre el enlace para confirmarlo y luego inicia sesión aquí.`, tipo: 'ok' });
        }
      } else if (modo === 'recuperar') {
        await API.recuperar(c);
        irAModo('entrar', { texto: `Si ${c} tiene cuenta, te llegará un enlace para poner una contraseña nueva.`, tipo: 'ok' });
      } else if (modo === 'nueva') {
        await API.cambiarClave(clave);
        mensajeArriba = null;
        await trasEntrar();
        avisar('Contraseña cambiada.', 'ok');
      }
    } catch (e) {
      mensajeArriba = { texto: e.message, tipo: 'error' };
      pintarAcceso();
    }
  });

  /* ===========================================================
     Comprobar la cuenta y aplicar los permisos
     =========================================================== */
  const DIAS_SIN_CONEXION = Number(CFG.diasSinConexion) >= 0 ? Number(CFG.diasSinConexion) : 7;

  /** Tras entrar: si es otra cuenta que la que estaba abierta, se recarga en su cajón. */
  async function trasEntrar() {
    const sufijo = sufijoPara(sesion.user.id);
    if (sufijo !== G.sufijoDatos) {
      // el perfil se pide ya, para que al volver no haga falta esperar
      try { guardarPerfil(await API.miPerfil()); } catch (e) {}
      API.registrarAcceso();
      location.reload();
      return;
    }
    await comprobar({ forzar: true });
    API.registrarAcceso();
  }

  let ultimaComprobacion = 0;
  /**
   * Pide el perfil al servidor y aplica lo que diga. Sin conexión, sigue
   * con el último conocido mientras no pase el plazo de config.js.
   */
  async function comprobar(o) {
    o = o || {};
    if (!sesion) { mostrarAcceso('entrar'); return; }
    if (!o.forzar && Date.now() - ultimaComprobacion < 60000) return;
    ultimaComprobacion = Date.now();
    const antes = perfil ? JSON.stringify([perfil.estado, perfil.rol, perfil.funciones]) : null;
    try {
      const p = await API.miPerfil();
      if (!p) {
        // la cuenta existe pero no tiene perfil: falta correr esquema.sql
        guardarPerfil(null);
        mostrarAcceso('entrar', { texto: 'Tu cuenta no tiene perfil en el servidor. El administrador debe correr supabase/esquema.sql.', tipo: 'error' });
        return;
      }
      guardarPerfil(p);
      const ahora = JSON.stringify([p.estado, p.rol, p.funciones]);
      aplicar();
      if (antes && antes !== ahora && p.estado === 'activo' && !o.silencio) {
        avisar('El administrador actualizó lo que puedes usar en Pdflash.', 'info');
      }
    } catch (e) {
      if (e.sinRed) {
        const guardado = leerJSON(CLAVE_PERFIL);
        const edad = guardado ? Date.now() - guardado.comprobado : Infinity;
        if (perfil && edad < DIAS_SIN_CONEXION * 864e5) { aplicar(); return; }
        mostrarAcceso('sin-conexion');
        return;
      }
      if (e.estado === 401 || e.estado === 400 || e.estado === 403) {
        // sesión vencida o revocada
        guardarSesion(null);
        guardarPerfil(null);
        mostrarAcceso('entrar', { texto: 'Tu sesión venció. Vuelve a iniciar sesión.', tipo: 'info' });
        return;
      }
      if (perfil) { aplicar(); return; }
      mostrarAcceso('entrar', { texto: e.message, tipo: 'error' });
    }
  }

  /** Enciende o apaga en pantalla cada función según el perfil. */
  function aplicar() {
    if (!perfil) { mostrarAcceso('entrar'); return; }
    if (perfil.estado !== 'activo') { mostrarAcceso(perfil.estado === 'bloqueado' ? 'bloqueado' : 'pendiente'); }
    else if (!acceso.hidden) ocultarAcceso();
    FUNCIONES.forEach((f) => {
      const si = puede(f.id);
      (f.secciones || []).forEach((s) => {
        $$(`.riel-btn[data-va="${s}"], .bloque[data-bloque="${s}"]`).forEach((el) => el.classList.toggle('oculto-admin', !si));
      });
      (f.botones || []).forEach((sel) => {
        $$(`${sel}, [data-clic="${sel}"]`).forEach((el) => {
          el.classList.toggle('bloqueado-admin', !si);
          el.dataset.funcion = f.id;
          if (!si) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
        });
      });
    });
    // si la sección abierta se quedó sin permiso, vuelve a Documentos
    const abierta = $('.bloque.abierto.oculto-admin');
    if (abierta) {
      abierta.classList.remove('abierto');
      const docs = $('.bloque[data-bloque="docs"]');
      if (docs) docs.classList.add('abierto');
    }
    pintarUsuario();
  }

  // un clic en un botón apagado lo explica en vez de no hacer nada
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('.bloqueado-admin');
    if (!b) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    permitido(b.dataset.funcion);
  }, true);

  async function salir() {
    const confirmado = !G.confirmar || acceso.hidden === false ? true : await G.confirmar({
      titulo: 'Cerrar sesión',
      mensaje: 'Lo que no hayas guardado en este tablero se puede perder. ¿Cerrar la sesión?',
      aceptar: 'Cerrar sesión',
    });
    if (!confirmado) return;
    await API.salir();
    guardarSesion(null);
    guardarPerfil(null);
    location.reload();
  }

  /* ===========================================================
     Botón de la cuenta, arriba a la derecha
     =========================================================== */
  const iniciales = (p) => {
    const base = (p && (p.nombre || p.email)) || '?';
    const partes = base.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    return ((partes[0] || '?')[0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
  };

  const cuenta = document.createElement('div');
  cuenta.className = 'cuenta';
  cuenta.innerHTML = `
    <button class="cuenta-boton" id="btnCuenta" type="button" aria-haspopup="true" aria-expanded="false" title="Tu cuenta">
      <span class="avatar" id="cuentaAvatar">?</span><em class="cuenta-marca" id="cuentaPendientes" hidden></em>
    </button>
    <div class="cuenta-menu" id="cuentaMenu" role="menu" hidden>
      <div class="cuenta-quien">
        <span class="avatar avatar-g" id="cuentaAvatar2">?</span>
        <div><strong id="cuentaNombre"></strong><small id="cuentaCorreo"></small><span class="insignia" id="cuentaRol"></span></div>
      </div>
      <button class="menu-item" role="menuitem" id="btnPanelControl" hidden>${ico('usuarios')} Panel de control <em class="cuenta-marca" id="cuentaPendientes2" hidden></em></button>
      <button class="menu-item" role="menuitem" id="btnMiNombre">${ico('editar')} Cambiar mi nombre</button>
      <button class="menu-item" role="menuitem" id="btnMiClave">${ico('candado')} Cambiar mi contraseña</button>
      <span class="menu-sep" role="separator"></span>
      <button class="menu-item" role="menuitem" id="btnSalir">${ico('salir')} Cerrar sesión</button>
    </div>`;
  const acciones = $('.barra-acciones');
  if (acciones) {
    const sep = document.createElement('span');
    sep.className = 'separador-vertical';
    acciones.append(sep, cuenta);
  }

  let pendientes = 0;
  function pintarUsuario() {
    const p = perfil || {};
    $('#cuentaAvatar').textContent = $('#cuentaAvatar2').textContent = iniciales(p);
    $('#cuentaNombre').textContent = p.nombre || 'Sin nombre';
    $('#cuentaCorreo').textContent = p.email || (sesion && sesion.user && sesion.user.email) || '';
    $('#cuentaRol').textContent = esAdmin() ? 'Administrador' : 'Usuario';
    $('#cuentaRol').classList.toggle('insignia-acento', esAdmin());
    $('#btnPanelControl').hidden = !esAdmin();
    $('#btnCuenta').title = (p.nombre || p.email || 'Tu cuenta') + (esAdmin() ? ' · Administrador' : '');
    [$('#cuentaPendientes'), $('#cuentaPendientes2')].forEach((el) => {
      el.hidden = !(esAdmin() && pendientes);
      el.textContent = pendientes;
    });
  }

  const menuCuenta = $('#cuentaMenu');
  const cerrarMenuCuenta = () => { menuCuenta.hidden = true; $('#btnCuenta').setAttribute('aria-expanded', 'false'); };
  $('#btnCuenta').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const abrir = menuCuenta.hidden;
    menuCuenta.hidden = !abrir;
    $('#btnCuenta').setAttribute('aria-expanded', String(abrir));
    if (abrir) comprobar();
  });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.cuenta')) cerrarMenuCuenta(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarMenuCuenta(); });
  $('#btnSalir').addEventListener('click', () => { cerrarMenuCuenta(); salir(); });
  $('#btnPanelControl').addEventListener('click', () => { cerrarMenuCuenta(); abrirPanelControl(); });
  $('#btnMiClave').addEventListener('click', () => { cerrarMenuCuenta(); cambiarMiClave(); });
  $('#btnMiNombre').addEventListener('click', async () => {
    cerrarMenuCuenta();
    if (!G.pedirTexto) return;
    const n = await G.pedirTexto({ titulo: 'Tu nombre', mensaje: 'Así te verá el administrador en el panel.', valor: (perfil && perfil.nombre) || '', aceptar: 'Guardar' });
    if (n == null || !String(n).trim()) return;
    try {
      await API.cambiarMiNombre(String(n).trim());
      await comprobar({ forzar: true, silencio: true });
      avisar('Nombre actualizado.', 'ok');
    } catch (e) { avisar(e.message, 'error'); }
  });

  async function cambiarMiClave() {
    if (!G.pedirTexto) return;
    const c = await G.pedirTexto({ titulo: 'Cambiar mi contraseña', mensaje: 'Escribe la contraseña nueva (mínimo 8 caracteres).', aceptar: 'Siguiente', tipo: 'password' });
    if (c == null) return;
    if (String(c).length < 8) { avisar('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    const otra = await G.pedirTexto({ titulo: 'Repite la contraseña', mensaje: 'Escríbela otra vez para comprobar que está bien.', aceptar: 'Cambiar', tipo: 'password' });
    if (otra == null) return;
    if (otra !== c) { avisar('Las dos contraseñas no coinciden. No se cambió nada.', 'error'); return; }
    try { await API.cambiarClave(String(c)); avisar('Contraseña cambiada.', 'ok'); } catch (e) { avisar(e.message, 'error'); }
  }

  /* ===========================================================
     Panel de control (solo administrador)
     =========================================================== */
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'modalControl';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-caja modal-ancha control-caja" role="dialog" aria-modal="true" aria-labelledby="controlTitulo">
      <header class="modal-cabecera">
        <div><h3 id="controlTitulo">Panel de control</h3><small class="control-resumen" id="controlResumen"></small></div>
        <div class="control-cab-acciones">
          <button class="btn btn-mini" id="controlRefrescar" type="button" title="Volver a cargar la lista">${ico('recoger')} Actualizar</button>
          <button class="btn btn-fantasma cerrar" id="controlCerrar" aria-label="Cerrar">${ico('cerrar')}</button>
        </div>
      </header>
      <div class="control-cuerpo">
        <aside class="control-lista">
          <div class="control-busca">${ico('lupa')}<input type="search" id="controlBuscar" placeholder="Buscar por nombre o correo" autocomplete="off"></div>
          <div class="control-filtros" id="controlFiltros" role="tablist"></div>
          <ul class="control-usuarios" id="controlUsuarios"></ul>
        </aside>
        <section class="control-detalle" id="controlDetalle"></section>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const panel = { usuarios: [], filtro: 'todos', texto: '', elegido: null, cargando: false };

  const ESTADOS = {
    activo: { txt: 'Activo', cls: 'ok' },
    pendiente: { txt: 'Pendiente', cls: 'espera' },
    bloqueado: { txt: 'Bloqueado', cls: 'no' },
  };

  function haceCuanto(fecha) {
    if (!fecha) return 'nunca';
    const s = (Date.now() - new Date(fecha).getTime()) / 1000;
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    if (s < 86400 * 30) { const d = Math.round(s / 86400); return d === 1 ? 'ayer' : `hace ${d} días`; }
    return new Date(fecha).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const fechaCorta = (f) => f ? new Date(f).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  async function abrirPanelControl() {
    if (!esAdmin()) return;
    modal.hidden = false;
    await cargarUsuarios();
    setTimeout(() => $('#controlBuscar').focus(), 30);
  }
  function cerrarPanelControl() { modal.hidden = true; }
  $('#controlCerrar').addEventListener('click', cerrarPanelControl);
  modal.addEventListener('click', (ev) => { if (ev.target === modal) cerrarPanelControl(); });
  $('#controlRefrescar').addEventListener('click', () => cargarUsuarios());
  $('#controlBuscar').addEventListener('input', (ev) => { panel.texto = ev.target.value; pintarLista(); });

  async function cargarUsuarios() {
    panel.cargando = true;
    pintarLista();
    try {
      panel.usuarios = await API.perfiles() || [];
      contarPendientes();
      if (!panel.elegido || !panel.usuarios.some((u) => u.id === panel.elegido)) {
        const prim = panel.usuarios.find((u) => u.estado === 'pendiente') || panel.usuarios.find((u) => u.id !== perfil.id) || panel.usuarios[0];
        panel.elegido = prim ? prim.id : null;
      }
    } catch (e) {
      avisar(e.message, 'error');
    }
    panel.cargando = false;
    pintarLista();
    pintarDetalle();
  }

  function contarPendientes() {
    pendientes = panel.usuarios.filter((u) => u.estado === 'pendiente').length;
    pintarUsuario();
  }

  function pintarLista() {
    const cuenta = (e) => panel.usuarios.filter((u) => e === 'todos' || u.estado === e).length;
    $('#controlFiltros').innerHTML = [['todos', 'Todos'], ['pendiente', 'Pendientes'], ['activo', 'Activos'], ['bloqueado', 'Bloqueados']]
      .map(([k, t]) => `<button type="button" role="tab" class="chip${panel.filtro === k ? ' activo' : ''}" data-filtro="${k}" aria-selected="${panel.filtro === k}">${t}<b>${cuenta(k)}</b></button>`).join('');
    const total = panel.usuarios.length;
    $('#controlResumen').textContent = panel.cargando && !total ? 'Cargando…'
      : `${total} ${total === 1 ? 'cuenta' : 'cuentas'}` + (pendientes ? ` · ${pendientes} por aprobar` : '');
    const q = panel.texto.trim().toLowerCase();
    const lista = panel.usuarios
      .filter((u) => panel.filtro === 'todos' || u.estado === panel.filtro)
      .filter((u) => !q || (u.nombre || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      // primero lo que pide atención
      .sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1));
    const ul = $('#controlUsuarios');
    if (panel.cargando && !total) { ul.innerHTML = '<li class="control-vacio"><div class="giro"></div></li>'; return; }
    if (!lista.length) { ul.innerHTML = `<li class="control-vacio">${q ? 'Nadie coincide con «' + esc(panel.texto) + '».' : 'No hay cuentas en este grupo.'}</li>`; return; }
    ul.innerHTML = lista.map((u) => {
      const e = ESTADOS[u.estado] || ESTADOS.pendiente;
      const apagadas = u.rol === 'admin' ? 0 : FUNCIONES.filter((f) => (u.funciones || {})[f.id] === false).length;
      return `<li><button type="button" class="control-usuario${u.id === panel.elegido ? ' elegido' : ''}" data-id="${u.id}">
        <span class="avatar">${esc(iniciales(u))}</span>
        <span class="control-u-txt"><strong>${esc(u.nombre || u.email)}${u.id === perfil.id ? ' <small>(tú)</small>' : ''}</strong>
        <small>${u.rol === 'admin' ? 'Administrador' : apagadas ? `${FUNCIONES.length - apagadas} de ${FUNCIONES.length} funciones` : 'Todas las funciones'} · ${haceCuanto(u.ultimo_acceso)}</small></span>
        <span class="estado-punto ${e.cls}" title="${e.txt}"></span>
      </button></li>`;
    }).join('');
  }

  $('#controlFiltros').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-filtro]');
    if (!b) return;
    panel.filtro = b.dataset.filtro;
    pintarLista();
  });
  $('#controlUsuarios').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-id]');
    if (!b) return;
    panel.elegido = b.dataset.id;
    pintarLista();
    pintarDetalle();
  });

  function pintarDetalle() {
    const caja = $('#controlDetalle');
    const u = panel.usuarios.find((x) => x.id === panel.elegido);
    if (!u) { caja.innerHTML = '<div class="control-vacio">Elige una cuenta de la lista.</div>'; return; }
    const yo = u.id === perfil.id;
    const e = ESTADOS[u.estado] || ESTADOS.pendiente;
    const esAdm = u.rol === 'admin';
    const fun = u.funciones || {};
    const grupos = [];
    FUNCIONES.forEach((f) => { let g = grupos.find((x) => x.nombre === f.grupo); if (!g) grupos.push(g = { nombre: f.grupo, f: [] }); g.f.push(f); });
    const acciones = yo ? '' : u.estado === 'pendiente'
      ? `<button class="btn btn-primario" data-accion="aprobar">${ico('check')} Aprobar acceso</button><button class="btn btn-secundario btn-peligro-suave" data-accion="bloquear">Rechazar</button>`
      : u.estado === 'activo'
        ? `<button class="btn btn-secundario btn-peligro-suave" data-accion="bloquear">Bloquear acceso</button>`
        : `<button class="btn btn-primario" data-accion="aprobar">Reactivar acceso</button>`;
    caja.innerHTML = `
      <div class="control-ficha">
        <span class="avatar avatar-xl">${esc(iniciales(u))}</span>
        <div class="control-ficha-txt">
          <h4>${esc(u.nombre || 'Sin nombre')}${yo ? ' <small>(tú)</small>' : ''}</h4>
          <p>${esc(u.email)}</p>
          <p class="control-insignias"><span class="insignia estado-${e.cls}">${e.txt}</span>${esAdm ? '<span class="insignia insignia-acento">Administrador</span>' : ''}</p>
        </div>
        <div class="control-ficha-acciones">${acciones}</div>
      </div>
      <dl class="control-datos">
        <div><dt>Alta</dt><dd>${fechaCorta(u.creado)}</dd></div>
        <div><dt>Último acceso</dt><dd>${haceCuanto(u.ultimo_acceso)}</dd></div>
      </dl>
      <div class="control-funciones-cab">
        <h5>Funciones habilitadas</h5>
        ${esAdm ? '' : `<span><button class="btn btn-mini" data-accion="todas">Encender todas</button><button class="btn btn-mini" data-accion="ninguna">Apagar todas</button></span>`}
        <small class="control-guardado" id="controlGuardado" aria-live="polite"></small>
      </div>
      ${esAdm ? '<p class="nota">Los administradores tienen siempre todas las funciones.</p>' : ''}
      <div class="control-funciones${esAdm ? ' apagado' : ''}">
        ${grupos.map((g) => `<div class="control-grupo"><span class="control-grupo-nom">${g.nombre}</span>
          ${g.f.map((f) => `<label class="control-funcion">
            <span><strong>${f.nombre}</strong><small>${f.desc}</small></span>
            <input type="checkbox" class="interruptor" data-funcion="${f.id}" ${esAdm || fun[f.id] !== false ? 'checked' : ''} ${esAdm ? 'disabled' : ''}>
          </label>`).join('')}</div>`).join('')}
      </div>
      ${u.estado === 'pendiente' && !yo ? '<p class="nota">Puedes dejar listas las funciones antes de aprobar: se guardan al momento.</p>' : ''}`;
  }

  let relojGuardado = 0;
  function marcarGuardado(txt, error) {
    const el = $('#controlGuardado');
    if (!el) return;
    el.textContent = txt;
    el.classList.toggle('error', !!error);
    clearTimeout(relojGuardado);
    if (!error) relojGuardado = setTimeout(() => { el.textContent = ''; }, 2200);
  }

  async function cambiar(u, cambios, textoOk) {
    const antes = Object.assign({}, u);
    Object.assign(u, cambios);
    pintarLista();
    marcarGuardado('Guardando…');
    try {
      const nuevo = await API.cambiarPerfil(u.id, cambios);
      if (nuevo) Object.assign(u, nuevo);
      contarPendientes();
      pintarLista();
      marcarGuardado('Guardado ✓');
      if (textoOk) avisar(textoOk, 'ok');
      return true;
    } catch (e) {
      Object.assign(u, antes);
      pintarLista();
      pintarDetalle();
      marcarGuardado(e.message, true);
      avisar(e.message, 'error');
      return false;
    }
  }

  $('#controlDetalle').addEventListener('change', (ev) => {
    const ent = ev.target.closest('input[data-funcion]');
    if (!ent) return;
    const u = panel.usuarios.find((x) => x.id === panel.elegido);
    if (!u) return;
    const funciones = Object.assign({}, u.funciones || {});
    funciones[ent.dataset.funcion] = ent.checked;
    cambiar(u, { funciones });
  });

  $('#controlDetalle').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    const u = panel.usuarios.find((x) => x.id === panel.elegido);
    if (!u) return;
    const quien = u.nombre || u.email;
    const a = b.dataset.accion;
    if (a === 'aprobar') {
      if (await cambiar(u, { estado: 'activo' }, `${quien} ya puede entrar.`)) pintarDetalle();
    } else if (a === 'bloquear') {
      const ok = !G.confirmar || await G.confirmar({
        titulo: u.estado === 'pendiente' ? 'Rechazar la solicitud' : 'Bloquear el acceso',
        mensaje: `${quien} no podrá usar Pdflash hasta que lo reactives. Lo que tenga guardado en su computadora no se borra.`,
        aceptar: u.estado === 'pendiente' ? 'Rechazar' : 'Bloquear',
        peligro: true,
      });
      if (ok && await cambiar(u, { estado: 'bloqueado' }, `Acceso de ${quien} bloqueado.`)) pintarDetalle();
    } else if (a === 'todas' || a === 'ninguna') {
      const funciones = {};
      FUNCIONES.forEach((f) => { funciones[f.id] = a === 'todas'; });
      if (await cambiar(u, { funciones })) pintarDetalle();
    }
  });

  // Esc cierra el panel aunque el foco esté en el buscador
  modal.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrarPanelControl(); } });

  /* ===========================================================
     Arranque
     =========================================================== */

  /** Vuelta desde un enlace del correo: confirmar cuenta o poner contraseña nueva. */
  async function leerEnlaceDelCorreo() {
    const h = location.hash.replace(/^#/, '');
    if (!/access_token=|error_description=/.test(h)) return false;
    const q = new URLSearchParams(h);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (q.get('error_description')) {
      mostrarAcceso('entrar', { texto: 'El enlace no sirve: ' + q.get('error_description').replace(/\+/g, ' ') + '. Pide otro.', tipo: 'error' });
      return true;
    }
    try {
      const tok = q.get('access_token');
      const user = await API.usuario(tok);
      guardarSesion({
        access_token: tok,
        refresh_token: q.get('refresh_token'),
        expires_at: Number(q.get('expires_at')) || undefined,
        expires_in: q.get('expires_in'),
        user,
      });
      if (q.get('type') === 'recovery') { mostrarAcceso('nueva'); return true; }
      await trasEntrar();
    } catch (e) {
      mostrarAcceso('entrar', { texto: e.message, tipo: 'error' });
    }
    return true;
  }

  // para comprobar a mano (y para las pruebas)
  G.cuentas.comprobar = () => comprobar({ forzar: true });
  G.cuentas.abrirPanelControl = abrirPanelControl;

  (async function arrancar() {
    if (await leerEnlaceDelCorreo()) return;
    if (!sesion) { mostrarAcceso('entrar'); return; }
    // con un perfil activo ya conocido se entra al instante y se comprueba detrás;
    // sin él, se espera a la respuesta
    if (perfil) aplicar(); else mostrarAcceso('cargando');
    await comprobar({ forzar: true, silencio: true });
    if (perfil && perfil.estado === 'activo') {
      API.registrarAcceso();
      if (esAdmin()) API.perfiles().then((l) => { panel.usuarios = l || []; contarPendientes(); }).catch(() => {});
    }
  })();

  // los cambios del administrador llegan solos: cada pocos minutos y al volver a la ventana
  setInterval(async () => {
    if (!sesion || document.visibilityState !== 'visible') return;
    await comprobar({ forzar: true });
    // al administrador, el globito de cuentas por aprobar al día
    if (esAdmin() && modal.hidden) API.perfiles().then((l) => { panel.usuarios = l || []; contarPendientes(); }).catch(() => {});
  }, 3 * 60 * 1000);
  window.addEventListener('focus', () => { if (sesion) comprobar(); });
  // otra ventana inició o cerró sesión: esta se pone al día
  window.addEventListener('storage', (ev) => {
    if (ev.key !== CLAVE_SESION) return;
    const nueva = leerJSON(CLAVE_SESION);
    const antes = sesion && sesion.user ? sesion.user.id : null;
    const ahora = nueva && nueva.user ? nueva.user.id : null;
    if (antes !== ahora) location.reload();
    else sesion = nueva;
  });
})();
