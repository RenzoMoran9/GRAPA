/* ===========================================================
   Grapa · guardado del trabajo y carpeta de salida
   Los expedientes a medio armar viven en la base de datos del
   navegador; nada se envía a ningún servidor.
   =========================================================== */
(function () {
  'use strict';
  const G = window.Grapa;

  const NOMBRE_BD = 'grapa';
  const VERSION = 1;
  let promesaBd = null;

  function abrir() {
    if (promesaBd) return promesaBd;
    promesaBd = new Promise((ok, no) => {
      let pet;
      try { pet = indexedDB.open(NOMBRE_BD, VERSION); }
      catch (e) { no(e); return; }
      pet.onupgradeneeded = () => {
        const bd = pet.result;
        // expedientes: la disposición de páginas y sellos (ligero)
        if (!bd.objectStoreNames.contains('expedientes')) bd.createObjectStore('expedientes', { keyPath: 'id' });
        // fuentes: los PDF originales, compartidos entre expedientes (pesado)
        if (!bd.objectStoreNames.contains('fuentes')) bd.createObjectStore('fuentes', { keyPath: 'id' });
        // config: carpeta vinculada y demás preferencias
        if (!bd.objectStoreNames.contains('config')) bd.createObjectStore('config');
      };
      pet.onsuccess = () => ok(pet.result);
      pet.onerror = () => no(pet.error);
    });
    return promesaBd;
  }

  function pedir(peticion) {
    return new Promise((ok, no) => {
      peticion.onsuccess = () => ok(peticion.result);
      peticion.onerror = () => no(peticion.error);
    });
  }

  async function conTienda(nombres, modo, fn) {
    const bd = await abrir();
    const tx = bd.transaction(nombres, modo);
    const tiendas = nombres.map((n) => tx.objectStore(n));
    const r = await fn.apply(null, tiendas);
    await new Promise((ok, no) => {
      tx.oncomplete = () => ok();
      tx.onerror = () => no(tx.error);
      tx.onabort = () => no(tx.error);
    });
    return r;
  }

  G.bd = {
    disponible: async () => { try { await abrir(); return true; } catch (e) { return false; } },

    /**
     * Guarda la disposición y, si hace falta, los PDF que aún no estén dentro.
     * La consulta va en una transacción aparte: esperar dentro de una de
     * escritura puede cerrarla antes de tiempo.
     */
    async guardarExpediente(registro, fuentes) {
      const yaEstan = await conTienda(['fuentes'], 'readonly',
        async (fue) => new Set(await pedir(fue.getAllKeys())));
      await conTienda(['expedientes', 'fuentes'], 'readwrite', (exp, fue) => {
        exp.put(registro);
        fuentes.forEach((f) => { if (!yaEstan.has(f.id)) fue.put(f); });
      });
    },

    listarExpedientes() {
      return conTienda(['expedientes'], 'readonly', async (exp) => {
        const todos = await pedir(exp.getAll());
        return todos
          .filter((r) => r.id !== '__auto')
          .sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
      });
    },

    leerExpediente(id) {
      return conTienda(['expedientes'], 'readonly', (exp) => pedir(exp.get(id)));
    },

    async leerFuentes(ids) {
      // todas las peticiones se lanzan de golpe para no dejar morir la transacción
      const leidas = await conTienda(['fuentes'], 'readonly',
        (fue) => Promise.all(ids.map((id) => pedir(fue.get(id)))));
      return leidas.filter(Boolean);
    },

    /** Borra el expediente y los PDF que ya no use ningún otro. */
    async borrarExpediente(id) {
      await conTienda(['expedientes'], 'readwrite', (exp) => { exp.delete(id); });
      const quedan = await conTienda(['expedientes'], 'readonly', (exp) => pedir(exp.getAll()));
      const enUso = new Set();
      quedan.forEach((r) => (r.fuenteIds || []).forEach((f) => enUso.add(f)));
      const claves = await conTienda(['fuentes'], 'readonly', (fue) => pedir(fue.getAllKeys()));
      const sobran = claves.filter((k) => !enUso.has(k));
      if (sobran.length) {
        await conTienda(['fuentes'], 'readwrite', (fue) => { sobran.forEach((k) => fue.delete(k)); });
      }
    },

    async espacio() {
      try {
        const e = await navigator.storage.estimate();
        return { usado: e.usage || 0, total: e.quota || 0 };
      } catch (e) { return null; }
    },

    guardarConfig(clave, valor) {
      return conTienda(['config'], 'readwrite', (c) => {
        if (valor === null || valor === undefined) c.delete(clave); else c.put(valor, clave);
      });
    },
    leerConfig(clave) {
      return conTienda(['config'], 'readonly', (c) => pedir(c.get(clave)));
    },
  };

  /* =========================================================
     Carpeta de salida
     Chrome y Edge permiten que una página escriba en una carpeta
     que el usuario elige. Así el PDF terminado cae directo en la
     carpeta del expediente, sin pasar por Descargas.
     ========================================================= */
  let carpeta = null;

  G.carpeta = {
    // Dentro de un marco (por ejemplo, Grapa abierta desde el enlace publicado)
    // el navegador no deja elegir carpetas: hace falta el archivo local.
    soportado: () => typeof window.showDirectoryPicker === 'function' && window.self === window.top,
    actual: () => carpeta,
    nombre: () => (carpeta ? carpeta.name : null),

    async vincular() {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'grapa-salida' });
      carpeta = dir;
      try { await G.bd.guardarConfig('carpeta', dir); } catch (e) {}
      return dir;
    },

    async desvincular() {
      carpeta = null;
      try { await G.bd.guardarConfig('carpeta', null); } catch (e) {}
    },

    /** Recupera la carpeta de la última vez, si el navegador la conserva. */
    async recuperar() {
      try {
        const h = await G.bd.leerConfig('carpeta');
        if (h && typeof h.getFileHandle === 'function') { carpeta = h; return h; }
      } catch (e) {}
      return null;
    },

    /** 'granted' | 'prompt' | 'denied' | 'sin-carpeta' */
    async permiso(pedirla) {
      if (!carpeta) return 'sin-carpeta';
      const opc = { mode: 'readwrite' };
      try {
        let p = await carpeta.queryPermission(opc);
        if (p !== 'granted' && pedirla) p = await carpeta.requestPermission(opc);
        return p;
      } catch (e) { return 'denied'; }
    },

    /** Busca un nombre libre para no pisar un archivo que ya esté ahí. */
    async nombreLibre(nombre) {
      const punto = nombre.lastIndexOf('.');
      const base = punto > 0 ? nombre.slice(0, punto) : nombre;
      const ext = punto > 0 ? nombre.slice(punto) : '';
      for (let i = 1; i < 100; i++) {
        const intento = i === 1 ? nombre : `${base} (${i})${ext}`;
        try {
          await carpeta.getFileHandle(intento);   // existe: probamos el siguiente
        } catch (e) {
          if (e && e.name === 'NotFoundError') return intento;
          throw e;
        }
      }
      return `${base} (${Date.now()})${ext}`;
    },

    async escribir(nombre, bytes) {
      const final = await G.carpeta.nombreLibre(nombre);
      const fh = await carpeta.getFileHandle(final, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
      return final;
    },
  };
})();
