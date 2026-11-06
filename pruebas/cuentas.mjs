/**
 * Pruebas de las cuentas de Pdflash (inicio de sesión, permisos y panel de
 * control) contra un Supabase de mentira: el navegador cree hablar con
 * https://demo.supabase.co, pero cada llamada la contesta este archivo.
 *
 *   node pruebas/cuentas.mjs            → todas
 *   node pruebas/cuentas.mjs panel      → solo las que tengan «panel» en el nombre
 *
 * Hace falta Playwright, igual que pruebas/correr.mjs.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Falta Playwright. Instálalo con:\n  npm install --no-save playwright\n  npx playwright install chromium');
  process.exit(2);
}

const PUERTO = 4800 + Math.floor(Math.random() * 500);
const URL_APP = `http://localhost:${PUERTO}/`;
const SB = 'https://demo.supabase.co';
const filtro = process.argv[2] || '';

function afirmar(cond, que, extra) {
  if (!cond) throw new Error('falló: ' + que + (extra ? ' · ' + JSON.stringify(extra) : ''));
}

/* ---------------- el Supabase de mentira ---------------- */
function servidorFalso() {
  const s = {
    caido: false,
    claves: { 'admin@x.com': 'secreta123', 'ana@x.com': 'secreta123', 'luis@x.com': 'secreta123' },
    perfiles: [
      { id: 'u-admin', email: 'admin@x.com', nombre: 'Renzo Admin', rol: 'admin', estado: 'activo', funciones: {}, creado: '2026-01-01T00:00:00Z', ultimo_acceso: null },
      { id: 'u-ana', email: 'ana@x.com', nombre: 'Ana Pérez', rol: 'usuario', estado: 'activo', funciones: { exportar: false, firmas: false }, creado: '2026-02-01T00:00:00Z', ultimo_acceso: null },
      { id: 'u-luis', email: 'luis@x.com', nombre: 'Luis Gómez', rol: 'usuario', estado: 'pendiente', funciones: {}, creado: '2026-03-01T00:00:00Z', ultimo_acceso: null },
    ],
    cambios: [],
    recuperados: [],
  };
  const tokenDe = (id) => 'tok-' + id;
  const quien = (req) => {
    const t = (req.headers().authorization || '').replace('Bearer ', '');
    return t.startsWith('tok-') ? t.slice(4) : null;
  };
  const json = (route, cuerpo, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: cuerpo === null ? '' : JSON.stringify(cuerpo),
    headers: { 'access-control-allow-origin': '*' },
  });
  s.atender = async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (s.caido) return route.abort('internetdisconnected');
    const u = new URL(req.url());
    const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
    const yo = quien(req);
    const p = s.perfiles.find((x) => x.id === yo);
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
      const pf = s.perfiles.find((x) => x.email === cuerpo.email);
      if (!pf || s.claves[cuerpo.email] !== cuerpo.password) return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      return json(route, { access_token: tokenDe(pf.id), refresh_token: 'r-' + pf.id, expires_in: 3600, user: { id: pf.id, email: pf.email } });
    }
    if (u.pathname === '/auth/v1/user' && req.method() === 'PUT') {
      if (!p) return json(route, { message: 'invalid JWT' }, 401);
      s.claves[p.email] = cuerpo.password;
      return json(route, { id: p.id, email: p.email });
    }
    if (u.pathname === '/auth/v1/user' && req.method() === 'GET') {
      return p ? json(route, { id: p.id, email: p.email }) : json(route, { message: 'invalid JWT' }, 401);
    }
    if (u.pathname === '/auth/v1/logout') return json(route, null, 204);
    if (u.pathname === '/auth/v1/recover') { s.recuperados.push({ email: cuerpo.email, redirect_to: u.searchParams.get('redirect_to') }); return json(route, {}); }
    if (u.pathname === '/rest/v1/rpc/registrar_acceso') return json(route, null, 204);
    if (u.pathname === '/rest/v1/perfiles') {
      if (!p) return json(route, { message: 'JWT expired' }, 401);
      const admin = p.rol === 'admin' && p.estado === 'activo';
      const id = (u.searchParams.get('id') || '').replace('eq.', '');
      if (req.method() === 'GET') {
        const visibles = s.perfiles.filter((x) => admin || x.id === p.id);
        return json(route, id ? visibles.filter((x) => x.id === id) : visibles);
      }
      if (req.method() === 'PATCH') {
        if (!admin) return json(route, []);   // RLS: no cambia nada
        const obj = s.perfiles.find((x) => x.id === id);
        Object.assign(obj, cuerpo);
        s.cambios.push({ id, cuerpo });
        return json(route, [obj]);
      }
    }
    return json(route, { message: 'no existe ' + u.pathname }, 404);
  };
  return s;
}

/* ---------------- las pruebas ---------------- */
async function entrar(page, correo, clave) {
  await page.waitForSelector('#acceso:not([hidden]) #accesoCorreo');
  await page.fill('#accesoCorreo', correo);
  await page.fill('#accesoClave', clave || 'secreta123');
  // entrar con otra cuenta que la de antes recarga la página en su cajón
  await Promise.all([page.waitForEvent('load'), page.click('.acceso-enviar')]);
  await page.waitForFunction(() => window.Grapa && window.Grapa.pintar && window.Grapa.cuentas.perfil());
}

const PRUEBAS = {
  async 'sin sesión: pantalla de acceso y nada de atajos detrás'({ page }) {
    await page.waitForSelector('#acceso:not([hidden])');
    afirmar(await page.isVisible('text=Inicia sesión'), 'se ve «Inicia sesión»');
    await page.keyboard.press('Control+o');
    await page.keyboard.press('v');
    afirmar(!(await page.evaluate(() => document.querySelector('#lector') && !document.querySelector('#lector').hidden)), 'la V no abrió el lector detrás');
    await page.fill('#accesoCorreo', 'admin@x.com');
    await page.fill('#accesoClave', 'mal');
    await page.click('.acceso-enviar');
    await page.waitForSelector('.acceso-msg.error');
    afirmar((await page.textContent('.acceso-msg.error')).includes('incorrectos'), 'error en español');
  },

  async 'admin: entra, ve todo y aprueba desde el panel de control'({ page, sb }) {
    await entrar(page, 'admin@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    await page.waitForFunction(() => window.Grapa && window.Grapa.pintar);
    afirmar(await page.evaluate(() => window.Grapa.cuentas.esAdmin()), 'es admin');
    afirmar((await page.textContent('#cuentaAvatar')) === 'RA', 'iniciales en el avatar');
    afirmar(await page.isVisible('.riel-btn[data-va="firmas"]'), 'admin ve Firmas');
    await page.waitForSelector('#cuentaPendientes:not([hidden])');
    afirmar((await page.textContent('#cuentaPendientes')) === '1', 'una cuenta por aprobar en el avatar');
    await page.click('#btnCuenta');
    await page.click('#btnPanelControl');
    await page.waitForSelector('#modalControl:not([hidden]) .control-usuario');
    afirmar((await page.$$('.control-usuario')).length === 3, 'lista las tres cuentas');
    // la pendiente sale elegida primero
    afirmar((await page.textContent('.control-ficha h4')).includes('Luis'), 'elige la pendiente');
    await page.click('[data-accion="aprobar"]');
    await page.waitForFunction(() => document.querySelector('.control-ficha .insignia').textContent === 'Activo');
    afirmar(sb.perfiles.find((x) => x.id === 'u-luis').estado === 'activo', 'Luis quedó activo en el servidor');
    // apagar Imprimir a Luis
    await page.click('.control-funcion:has(input[data-funcion="imprimir"])');
    await page.waitForFunction(() => /Guardado/.test(document.querySelector('#controlGuardado').textContent));
    const f = sb.perfiles.find((x) => x.id === 'u-luis').funciones;
    afirmar(f.imprimir === false, 'imprimir apagado en el servidor', f);
    // filtros y búsqueda
    await page.fill('#controlBuscar', 'ana');
    afirmar((await page.$$('.control-usuario')).length === 1, 'la búsqueda filtra');
    await page.keyboard.press('Escape');
    afirmar(await page.isHidden('#modalControl'), 'Esc cierra el panel');
  },

  async 'usuario: solo ve lo que el admin le dejó'({ page }) {
    await entrar(page, 'ana@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    afirmar(!(await page.evaluate(() => window.Grapa.cuentas.esAdmin())), 'no es admin');
    afirmar(await page.isHidden('.riel-btn[data-va="firmas"]'), 'Firmas oculto en el riel');
    afirmar(await page.isHidden('.bloque[data-bloque="firmas"]'), 'Firmas oculto en el panel');
    afirmar(await page.isVisible('.riel-btn[data-va="foliar"]'), 'Folios sí');
    afirmar(await page.evaluate(() => document.querySelector('#btnGuardar').classList.contains('bloqueado-admin')), 'Exportar con candado');
    await page.click('#btnCuenta');
    afirmar(await page.isHidden('#btnPanelControl'), 'sin panel de control');
    await page.keyboard.press('Escape');
    // Ctrl+S explica en vez de exportar
    await page.click('.area-hojas, main, body', { position: { x: 900, y: 500 } }).catch(() => {});
    await page.keyboard.press('Control+s');
    await page.waitForSelector('.aviso:has-text("no está habilitada")');
    // ni por el atajo de buscar a una sección apagada
    const r = await page.evaluate(() => window.Grapa.cuentas.permitido('firmas'));
    afirmar(r === false, 'permitido(firmas) es false');
  },

  async 'el admin cambia permisos y al usuario le llegan solos'({ page, sb }) {
    await entrar(page, 'ana@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    afirmar(await page.isHidden('.riel-btn[data-va="firmas"]'), 'empieza sin Firmas');
    sb.perfiles.find((x) => x.id === 'u-ana').funciones = { firmas: true, exportar: true };
    // lo que hace el reloj cada tres minutos, sin esperarlos
    await page.evaluate(() => window.Grapa.cuentas.comprobar());
    await page.waitForSelector('.riel-btn[data-va="firmas"]', { state: 'visible' });
    afirmar(!(await page.evaluate(() => document.querySelector('#btnGuardar').classList.contains('bloqueado-admin'))), 'Exportar sin candado');
    await page.waitForSelector('.aviso:has-text("actualizó lo que puedes usar")');
    // y si se lo vuelve a quitar, se apaga otra vez
    sb.perfiles.find((x) => x.id === 'u-ana').funciones = { firmas: false };
    await page.evaluate(() => window.Grapa.cuentas.comprobar());
    await page.waitForSelector('.riel-btn[data-va="firmas"]', { state: 'hidden' });
  },

  async 'pendiente y bloqueado: no pasan de la pantalla de acceso'({ page, sb }) {
    await entrar(page, 'luis@x.com');
    await page.waitForSelector('text=Tu cuenta espera aprobación');
    afirmar(await page.isVisible('#acceso'), 'sigue la pantalla');
    sb.perfiles.find((x) => x.id === 'u-luis').estado = 'activo';
    await page.click('#accesoComprobar');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    sb.perfiles.find((x) => x.id === 'u-luis').estado = 'bloqueado';
    await page.reload();
    await page.waitForSelector('text=Tu cuenta está desactivada');
  },

  async 'cada cuenta su cajón: la segunda no ve las firmas de la primera'({ page }) {
    await entrar(page, 'admin@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    afirmar((await page.evaluate(() => window.Grapa.sufijoDatos)) === '', 'la primera cuenta usa el cajón de siempre');
    await page.evaluate(() => window.Grapa.almacen.escribir([{ id: 'f1', nombre: 'Firma de Renzo' }]));
    await page.evaluate(() => { localStorage.removeItem('grapa.cuenta.sesion'); localStorage.removeItem('grapa.cuenta.perfil'); });
    await page.reload();
    await entrar(page, 'ana@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    afirmar((await page.evaluate(() => window.Grapa.sufijoDatos)) === ':u-ana', 'Ana tiene su cajón');
    afirmar((await page.evaluate(() => window.Grapa.almacen.leer().length)) === 0, 'Ana no ve la firma de Renzo');
  },

  async 'sin internet sigue con los últimos permisos'({ page, sb }) {
    await entrar(page, 'ana@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    sb.caido = true;
    await page.reload();
    await page.waitForFunction(() => window.Grapa && window.Grapa.pintar);
    await page.waitForTimeout(400);
    afirmar(await page.isHidden('#acceso'), 'entra sin conexión');
    afirmar(await page.isHidden('.riel-btn[data-va="firmas"]'), 'con los permisos guardados');
  },

  async 'recuperar la contraseña: el enlace vuelve a esta misma página'({ page, sb }) {
    await page.waitForSelector('#acceso:not([hidden])');
    await page.click('[data-ir="recuperar"]');
    await page.fill('#accesoCorreo', 'ana@x.com');
    await page.click('.acceso-enviar');
    await page.waitForSelector('.acceso-msg.ok');
    afirmar(sb.recuperados.length === 1, 'pidió el correo');
    afirmar(sb.recuperados[0].redirect_to === new URL(page.url()).origin + '/', 'vuelve a la página de la app', sb.recuperados[0]);
    // y al volver con el enlace, pide la contraseña nueva
    // (cambiar solo el # no recarga la página: se recarga a mano, como al abrir el enlace)
    await page.evaluate(() => { location.hash = 'access_token=tok-u-ana&refresh_token=r-u-ana&expires_in=3600&type=recovery'; });
    await page.reload();
    await page.waitForSelector('text=Nueva contraseña');
    // hay que escribirla dos veces, y tienen que coincidir
    await page.fill('#accesoClave', 'nuevaclave1');
    await page.fill('#accesoClave2', 'nuevaclave2');
    afirmar((await page.textContent('#accesoCoincide')).includes('no coinciden'), 'avisa mientras escribe');
    await page.click('.acceso-enviar');
    await page.waitForSelector('.acceso-msg.error:has-text("no coinciden")');
    afirmar(sb.claves['ana@x.com'] === 'secreta123', 'no cambió la contraseña');
    await page.fill('#accesoClave', 'nuevaclave1');
    await page.fill('#accesoClave2', 'nuevaclave1');
    afirmar((await page.textContent('#accesoCoincide')).includes('coinciden'), 'dice que coinciden');
    await Promise.all([page.waitForEvent('load'), page.click('.acceso-enviar')]);
    afirmar(sb.claves['ana@x.com'] === 'nuevaclave1', 'contraseña cambiada en el servidor');
    await page.waitForFunction(() => window.Grapa && window.Grapa.cuentas.perfil() && document.querySelector('#acceso').hidden);
  },

  async 'cerrar sesión vuelve a la pantalla de acceso'({ page }) {
    await entrar(page, 'admin@x.com');
    await page.waitForSelector('#acceso', { state: 'hidden' });
    await page.click('#btnCuenta');
    await page.click('#btnSalir');
    await page.click('#confirmarSi');
    await page.waitForSelector('#acceso:not([hidden])');
    afirmar(!(await page.evaluate(() => localStorage.getItem('grapa.cuenta.sesion'))), 'sesión borrada');
  },
};

/* ---------------- el corredor ---------------- */
const srv = spawn(process.execPath, [RAIZ + 'servidor.mjs'], { env: { ...process.env, PUERTO: String(PUERTO) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
let bien = 0, mal = 0;
try {
  for (const [nombre, prueba] of Object.entries(PRUEBAS)) {
    if (filtro && !nombre.toLowerCase().includes(filtro.toLowerCase())) continue;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sb = servidorFalso();
    // el recorrido de la primera vez taparía la pantalla: se da por visto (tiene su propia prueba)
    await ctx.addInitScript(() => { try { localStorage.setItem('grapa.guia.vista', '1'); } catch (e) {} });
    await ctx.route(SB + '/**', sb.atender);
    await ctx.route('**/assets/config.js*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `window.GRAPA_CONFIG = { supabaseUrl: '${SB}', supabaseKey: 'anon-de-prueba', diasSinConexion: 7 };`,
    }));
    const errores = [];
    const t0 = Date.now();
    try {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errores.push(e.message));
      page.on('dialog', (d) => d.accept());
      await page.goto(URL_APP);
      await prueba({ page, sb });
      afirmar(!errores.length, 'sin errores en la página', errores);
      bien++;
      console.log(`  ✓ ${nombre}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      mal++;
      console.log(`  ✗ ${nombre}\n      ${String(e.message).split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
