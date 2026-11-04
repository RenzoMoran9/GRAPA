-- ===========================================================
--  Pdflash · cuentas de usuario y permisos por función
--
--  Pégalo entero en Supabase ▸ SQL Editor ▸ New query ▸ Run.
--  Se puede volver a correr sin romper nada: crea lo que falta y
--  reemplaza las funciones y reglas por su última versión.
--
--  Qué deja armado:
--    · perfiles: una fila por cuenta, con su rol (admin / usuario),
--      su estado (pendiente / activo / bloqueado) y las funciones de
--      Pdflash que tiene encendidas.
--    · La PRIMERA cuenta que se registre queda como administradora y
--      activa. Las demás entran como «pendiente» hasta que el
--      administrador las aprueba desde el Panel de control.
--    · Reglas (RLS): cada uno lee solo su perfil; solo el administrador
--      ve a todos y cambia estados y permisos. Nadie se da permisos a sí
--      mismo, aunque sepa programar: la base lo impide, no la pantalla.
--
--  Los PDF, las firmas y los expedientes NO pasan por aquí: siguen
--  quedándose en el navegador de cada persona.
-- ===========================================================

create table if not exists public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  nombre         text,
  rol            text not null default 'usuario' check (rol in ('admin', 'usuario')),
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'activo', 'bloqueado')),
  -- { "exportar": true, "firmas": false, ... } · lo que no figura, está permitido
  funciones      jsonb not null default '{}'::jsonb,
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now(),
  ultimo_acceso  timestamptz
);

alter table public.perfiles enable row level security;

-- ---------- ¿quien pregunta es administrador activo? ----------
-- security definer: consulta perfiles sin pasar por las reglas de la
-- propia tabla (si no, la regla se llamaría a sí misma sin fin).
create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and estado = 'activo'
  );
$$;

-- ---------- reglas ----------
drop policy if exists "perfil propio o admin" on public.perfiles;
create policy "perfil propio o admin" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

drop policy if exists "solo admin cambia perfiles" on public.perfiles;
create policy "solo admin cambia perfiles" on public.perfiles
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Sin reglas de insert ni delete: los perfiles los crea el disparador de
-- abajo y se borran solos al borrar la cuenta en Authentication ▸ Users.
revoke insert, delete on public.perfiles from anon, authenticated;
revoke all on public.perfiles from anon;

-- ---------- al registrarse alguien, su perfil ----------
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  primero boolean;
begin
  -- que dos registros a la vez no se lleven los dos el puesto de admin
  lock table public.perfiles in share row exclusive mode;
  primero := not exists (select 1 from public.perfiles where rol = 'admin');
  insert into public.perfiles (id, email, nombre, rol, estado)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), ''),
    case when primero then 'admin' else 'usuario' end,
    case when primero then 'activo' else 'pendiente' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------- que nunca se quede sin administrador ----------
create or replace function public.cuidar_perfil()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.actualizado := now();
  -- el correo y la fecha de alta no se tocan desde la app
  new.email := old.email;
  new.creado := old.creado;
  if old.rol = 'admin' and old.estado = 'activo'
     and (new.rol <> 'admin' or new.estado <> 'activo')
     and not exists (
       select 1 from public.perfiles
       where rol = 'admin' and estado = 'activo' and id <> old.id
     ) then
    raise exception 'No se puede quitar o bloquear al único administrador activo.';
  end if;
  return new;
end;
$$;

drop trigger if exists antes_de_cambiar_perfil on public.perfiles;
create trigger antes_de_cambiar_perfil
  before update on public.perfiles
  for each row execute function public.cuidar_perfil();

-- ---------- lo que cada uno puede hacer con su propio perfil ----------
-- Anotar cuándo entró (lo ve el administrador en el panel).
create or replace function public.registrar_acceso()
returns void
language sql security definer
set search_path = public
as $$
  update public.perfiles set ultimo_acceso = now() where id = auth.uid();
$$;

-- Cambiar el nombre con el que aparece. Nada más.
create or replace function public.cambiar_mi_nombre(nuevo text)
returns void
language sql security definer
set search_path = public
as $$
  update public.perfiles
  set nombre = nullif(trim(left(coalesce(nuevo, ''), 80)), '')
  where id = auth.uid();
$$;

revoke execute on function public.registrar_acceso() from anon;
revoke execute on function public.cambiar_mi_nombre(text) from anon;
grant execute on function public.registrar_acceso() to authenticated;
grant execute on function public.cambiar_mi_nombre(text) to authenticated;
grant select, update on public.perfiles to authenticated;

-- ---------- cuentas creadas antes de correr este archivo ----------
-- Si ya había usuarios, se les crea el perfil (pendiente). Si ninguno es
-- admin todavía, el más antiguo pasa a serlo.
insert into public.perfiles (id, email, nombre)
select u.id, u.email, nullif(trim(coalesce(u.raw_user_meta_data ->> 'nombre', '')), '')
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id);

update public.perfiles set rol = 'admin', estado = 'activo'
where id = (select id from public.perfiles order by creado asc limit 1)
  and not exists (select 1 from public.perfiles where rol = 'admin');
