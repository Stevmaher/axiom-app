-- ============================================================
-- شغّل الكود ده مرة واحدة بس في: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- جدول الاشتراكات
create table if not exists public.subscriptions (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  active boolean not null default false,
  notes text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- دالة بتحدد مين الأدمن (غيّر الإيميل هنا لإيميلك)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') in ('admin@example.com')
$$;

-- العميل يقدر يشوف بيانات اشتراكه بس، والأدمن يشوف الكل
drop policy if exists "select own or admin" on public.subscriptions;
create policy "select own or admin"
on public.subscriptions for select
using (id = auth.uid() or public.is_admin());

-- العميل بيسجل نفسه، والصف بيتحط active=false إجباري (مش هو اللي بيفعّل نفسه)
drop policy if exists "insert self inactive" on public.subscriptions;
create policy "insert self inactive"
on public.subscriptions for insert
with check (id = auth.uid() and active = false);

-- التعديل (التفعيل/الإيقاف) للأدمن بس
drop policy if exists "update admin only" on public.subscriptions;
create policy "update admin only"
on public.subscriptions for update
using (public.is_admin())
with check (public.is_admin());

-- الحذف للأدمن بس
drop policy if exists "delete admin only" on public.subscriptions;
create policy "delete admin only"
on public.subscriptions for delete
using (public.is_admin());
