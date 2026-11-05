/* ===========================================================
   Pdflash · configuración de cuentas (Supabase)

   Con los dos campos vacíos, Pdflash funciona como siempre: sin
   cuentas, sin inicio de sesión y sin conexión.

   Al rellenarlos, pide iniciar sesión y aplica los permisos que el
   administrador da a cada cuenta. Ambos datos están en Supabase ▸
   Project Settings ▸ API (o «Connect»):
     · supabaseUrl  → Project URL      (https://xxxx.supabase.co)
     · supabaseKey  → anon / publishable key

   La clave «anon» es pública por diseño: puede ir en la página. Lo que
   protege los datos son las reglas de supabase/esquema.sql. NUNCA pongas
   aquí la «service_role» / secret key.
   =========================================================== */
window.GRAPA_CONFIG = {
  supabaseUrl: '',
  supabaseKey: 'sb_publishable_2ciRVwG702SWZeTZMy2mzg__ma8IBld',
  // Días que se puede seguir trabajando sin internet con los últimos
  // permisos comprobados. Pasado ese plazo, pide conectarse.
  diasSinConexion: 7,
};
