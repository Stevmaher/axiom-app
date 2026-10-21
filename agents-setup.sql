-- شغّل الملف ده مرة واحدة في Supabase → SQL Editor
-- بيفترض إن عندك دالة is_admin() وجدول subscriptions(id = auth user id).

create table if not exists public.plans(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  days int not null check (days > 0),
  price numeric not null default 0 check (price >= 0),   -- السعر اللي الوكيل بيفعّل بيه
  active boolean not null default true,
  created_at timestamptz default now());

create table if not exists public.agents(
  user_id uuid primary key references auth.users(id),
  email text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz default now());

create table if not exists public.agent_sales(
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(user_id),
  customer_email text not null,
  plan_name text not null,
  days int not null,
  price numeric not null,
  created_at timestamptz default now());

create table if not exists public.ready_accounts(
  email text primary key,
  password text not null,
  status text not null default 'available',   -- available | assigned
  agent_id uuid references public.agents(user_id),
  created_at timestamptz default now());

alter table public.plans enable row level security;
alter table public.agents enable row level security;
alter table public.agent_sales enable row level security;
alter table public.ready_accounts enable row level security;

drop policy if exists plans_admin on public.plans;
drop policy if exists plans_read on public.plans;
drop policy if exists agents_admin on public.agents;
drop policy if exists agents_self on public.agents;
drop policy if exists sales_admin on public.agent_sales;
drop policy if exists sales_self on public.agent_sales;
drop policy if exists ready_admin on public.ready_accounts;

create policy plans_admin  on public.plans for all using (public.is_admin()) with check (public.is_admin());
create policy plans_read   on public.plans for select to authenticated using (active);
create policy agents_admin on public.agents for all using (public.is_admin()) with check (public.is_admin());
create policy agents_self  on public.agents for select using (user_id = auth.uid());
create policy sales_admin  on public.agent_sales for all using (public.is_admin()) with check (public.is_admin());
create policy sales_self   on public.agent_sales for select using (agent_id = auth.uid());
create policy ready_admin  on public.ready_accounts for all using (public.is_admin()) with check (public.is_admin());
-- الوكيل مالوش وصول مباشر لـ ready_accounts: بياخد حساب عن طريق agent_take_ready بس.

create or replace function public.is_agent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.agents where user_id = auth.uid() and active) $$;

-- دالة داخلية: بتفعّل/بتمدّد الاشتراك (الوكيل مش بيناديها مباشرة)
create or replace function public._activate_sub(p_email text, p_days int, p_plan text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare uid uuid; cur timestamptz; nexp timestamptz;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'الإيميل ده معندوش حساب لسه'; end if;
  select expires_at into cur from public.subscriptions where id = uid;
  nexp := greatest(coalesce(cur, now()), now()) + make_interval(days => p_days);
  insert into public.subscriptions(id, email, active, expires_at, plan)
  values (uid, lower(p_email), true, nexp, p_plan)
  on conflict (id) do update set active = true, expires_at = excluded.expires_at, plan = excluded.plan;
  return nexp;
end $$;
revoke all on function public._activate_sub(text, int, text) from public, anon, authenticated;

create or replace function public.agent_activate(p_email text, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl public.plans; nexp timestamptz;
begin
  if not public.is_agent() then return jsonb_build_object('success', false, 'reason', 'مش وكيل مفعّل'); end if;
  select * into pl from public.plans where id = p_plan_id and active;
  if not found then return jsonb_build_object('success', false, 'reason', 'الباقة مش متاحة'); end if;
  begin
    nexp := public._activate_sub(p_email, pl.days, pl.name);
  exception when others then
    return jsonb_build_object('success', false, 'reason', sqlerrm);
  end;
  insert into public.agent_sales(agent_id, customer_email, plan_name, days, price)
  values (auth.uid(), lower(p_email), pl.name, pl.days, pl.price);
  return jsonb_build_object('success', true, 'expires_at', nexp);
end $$;

create or replace function public.agent_take_ready(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl public.plans; acc public.ready_accounts; nexp timestamptz;
begin
  if not public.is_agent() then return jsonb_build_object('success', false, 'reason', 'مش وكيل مفعّل'); end if;
  select * into pl from public.plans where id = p_plan_id and active;
  if not found then return jsonb_build_object('success', false, 'reason', 'الباقة مش متاحة'); end if;
  select * into acc from public.ready_accounts where status = 'available'
    order by created_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('success', false, 'reason', 'مفيش حسابات جاهزة، كلّم الأدمن'); end if;
  nexp := public._activate_sub(acc.email, pl.days, pl.name);
  update public.ready_accounts set status = 'assigned', agent_id = auth.uid() where email = acc.email;
  insert into public.agent_sales(agent_id, customer_email, plan_name, days, price)
  values (auth.uid(), acc.email, pl.name, pl.days, pl.price);
  return jsonb_build_object('success', true, 'email', acc.email, 'password', acc.password, 'expires_at', nexp);
end $$;

create or replace function public.admin_register_agent(p_email text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then return jsonb_build_object('success', false, 'reason', 'للأدمن بس'); end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then return jsonb_build_object('success', false, 'reason', 'الحساب مش موجود'); end if;
  insert into public.agents(user_id, email, name) values (uid, lower(p_email), p_name)
  on conflict (user_id) do update set name = excluded.name, active = true;
  return jsonb_build_object('success', true);
end $$;

revoke all on function public.is_agent(), public.agent_activate(text, uuid),
  public.agent_take_ready(uuid), public.admin_register_agent(text, text) from public, anon;
grant execute on function public.is_agent(), public.agent_activate(text, uuid),
  public.agent_take_ready(uuid), public.admin_register_agent(text, text) to authenticated;
