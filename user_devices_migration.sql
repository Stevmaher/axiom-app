-- ============================================================
-- Migration: device binding via user_devices + check_or_register_device()
-- شغّلها كاملة مرة واحدة في Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- آمنة لإعادة التشغيل (idempotent) — لو شغّلتها تاني بالغلط مش هتكسر حاجة.
-- ============================================================

-- pgcrypto لازم عشان دالة digest() اللي بنعمل بيها hash لقيمة device id.
-- Supabase عادة بيركّبها في schema اسمه extensions.
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1) الجدول: صف واحد بس لكل مستخدم (user_id primary key) —
--    يعني جهاز واحد مصرّح له لكل حساب، بالظبط زي منطق التطبيق الحالي.
-- ------------------------------------------------------------
create table if not exists public.user_devices (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  device_hash   text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.user_devices enable row level security;

-- منع أي صلاحية افتراضية، وإضافة SELECT بس للمستخدم على صفّه هو
-- (مفيدة لو حبيت مستقبلاً تعرض للمستخدم "آخر ظهور لجهازك" مثلاً).
-- مفيش أي INSERT/UPDATE/DELETE policy للمستخدمين — الكتابة الوحيدة
-- المسموحة بتحصل جوه الفنكشن SECURITY DEFINER تحت، مش من الواجهة مباشرة.
revoke all on table public.user_devices from public, anon, authenticated;
grant select on table public.user_devices to authenticated;

drop policy if exists "user can read own device row" on public.user_devices;
create policy "user can read own device row"
  on public.user_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) الفنكشن: check_or_register_device(p_device_id text) returns boolean
--    - أول مرة للمستخدم: يسجّل الجهاز ويرجّع true.
--    - لو نفس الجهاز (نفس الـ hash): يحدّث last_seen_at ويرجّع true.
--    - لو جهاز مختلف: يرجّع false من غير ما يغيّر أي حاجة.
--    مبني على auth.uid() + p_device_id بس — مفيش اعتماد على
--    access_token أو session_id أو IP أو User-Agent.
-- ------------------------------------------------------------
create or replace function public.check_or_register_device(p_device_id text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_hash     text;
  v_existing text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception 'invalid device id';
  end if;

  v_hash := encode(digest(p_device_id, 'sha256'), 'hex');

  select device_hash into v_existing
  from public.user_devices
  where user_id = v_user_id
  for update;

  if v_existing is null then
    insert into public.user_devices (user_id, device_hash, created_at, last_seen_at)
    values (v_user_id, v_hash, now(), now());
    return true;
  end if;

  if v_existing = v_hash then
    update public.user_devices
    set last_seen_at = now()
    where user_id = v_user_id;
    return true;
  end if;

  return false;
end;
$$;

-- تنفيذ الفنكشن مسموح للمستخدمين المسجّلين بس (مش anon، مش public).
revoke all on function public.check_or_register_device(text) from public;
grant execute on function public.check_or_register_device(text) to authenticated;
