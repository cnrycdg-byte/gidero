-- Onay akışı: rapor gönderme, onaylama, iade etme.
-- Durum değişiklikleri yalnızca bu fonksiyonlarla yapılır (reports.status kolonu istemciye kapalı).
-- Kurallar:
--  * Kimse kendi raporunu onaylayamaz; onaylayıcı rapor sahibiyse adım bir üst kişiye çıkar,
--    o da yoksa şirket yöneticilerine düşer.
--  * Muhasebeci (veya büro) BAŞKASI adına girdiği raporu onaysız kaydeder; kendi masrafı akıştan geçer.
--  * Gönderim anındaki adımlar flow_snapshot'a yazılır; akış sonradan değişse de yoldaki rapor etkilenmez.

create or replace function private.manager_of(p_company uuid, p_user uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.manager_user_id from public.memberships m
  where m.company_id = p_company and m.user_id = p_user and m.status = 'active';
$$;

create or replace function private.company_admins(p_company uuid)
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.user_id), '{}') from public.memberships m
  where m.company_id = p_company and m.status = 'active' and 'admin' = any (m.roles);
$$;

-- Bir adımın onaylayıcılarını bulur; rapor sahibini asla döndürmez.
create or replace function private.resolve_step_approvers(p_report public.reports, p_step jsonb)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type text := p_step ->> 'approver_type';
  v_ids uuid[] := '{}';
  v_mgr uuid;
begin
  if v_type = 'manager' then
    v_ids := array_remove(array[private.manager_of(p_report.company_id, p_report.owner_user_id)], null);
  elsif v_type = 'skip_level' then
    v_mgr := private.manager_of(p_report.company_id, p_report.owner_user_id);
    v_ids := array_remove(array[private.manager_of(p_report.company_id, v_mgr)], null);
  elsif v_type = 'cost_center_owner' then
    select array_remove(array[cc.owner_user_id], null) into v_ids
      from public.cost_centers cc where cc.id = p_report.cost_center_id;
  elsif v_type = 'user' then
    v_ids := array[(p_step ->> 'approver_user_id')::uuid];
  elsif v_type = 'role' then
    select coalesce(array_agg(m.user_id), '{}') into v_ids
      from public.memberships m
     where m.company_id = p_report.company_id and m.status = 'active'
       and (p_step ->> 'approver_role') = any (m.roles);
  end if;

  v_ids := array_remove(coalesce(v_ids, '{}'), p_report.owner_user_id);

  -- Kendi kendini onaylama yasak: boş kaldıysa sahibin yöneticisinin yöneticisi, sonra yöneticiler
  if cardinality(v_ids) = 0 and v_type in ('manager','user','cost_center_owner') then
    v_mgr := private.manager_of(p_report.company_id, p_report.owner_user_id);
    if v_mgr is not null and v_mgr <> p_report.owner_user_id then
      v_ids := array_remove(array[private.manager_of(p_report.company_id, v_mgr)], null);
      v_ids := array_remove(v_ids, p_report.owner_user_id);
    end if;
  end if;
  if cardinality(v_ids) = 0 then
    v_ids := array_remove(private.company_admins(p_report.company_id), p_report.owner_user_id);
  end if;
  return v_ids;
end;
$$;

-- Raporu sıradaki adıma taşır; adım kalmadıysa onaylar.
create or replace function private.advance_report(p_report_id uuid, p_from int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_steps jsonb;
  v_next int;
  v_ids uuid[];
begin
  select * into r from public.reports where id = p_report_id for update;
  v_steps := coalesce(r.flow_snapshot, '[]'::jsonb);
  v_next := p_from + 1;
  if v_next >= jsonb_array_length(v_steps) then
    update public.reports
       set status = 'approved', current_step = null, current_approver_ids = '{}', approved_at = now()
     where id = p_report_id;
    return;
  end if;
  v_ids := private.resolve_step_approvers(r, v_steps -> v_next);
  if cardinality(v_ids) = 0 then
    raise exception 'Bu adım için onaylayıcı bulunamadı: %', v_steps -> v_next ->> 'name'
      using errcode = 'P0001', hint = 'Şirket ayarlarında yönetici veya onay adımı tanımlayın.';
  end if;
  update public.reports
     set status = 'pending', current_step = v_next, current_approver_ids = v_ids
   where id = p_report_id;
end;
$$;

create or replace function public.submit_report(p_report uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
  v_flow public.approval_flows;
  v_steps jsonb;
begin
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'Rapor bulunamadı' using errcode = 'P0002'; end if;
  if r.status not in ('draft','returned') then
    raise exception 'Bu rapor gönderilemez (durum: %)', r.status using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.expenses e where e.report_id = r.id) then
    raise exception 'Rapor boş; önce en az bir fiş ekleyin' using errcode = 'P0001';
  end if;

  -- Muhasebeci başkası adına girdiyse: onaysız kayıt
  if r.created_by = v_me and r.owner_user_id <> v_me
     and private.has_any_role(r.company_id, array['accountant']) then
    update public.reports set status = 'approved', submitted_at = now(), approved_at = now(),
                              flow_snapshot = '[]'::jsonb, current_step = null, current_approver_ids = '{}'
     where id = r.id;
    insert into public.approval_actions (report_id, company_id, actor_user_id, action)
    values (r.id, r.company_id, v_me, 'booked_without_approval');
    return 'approved';
  end if;

  if r.owner_user_id <> v_me then
    raise exception 'Raporu yalnızca sahibi gönderebilir' using errcode = '42501';
  end if;

  select * into v_flow from public.approval_flows f
   where f.company_id = r.company_id and f.active
     and (f.min_total is null or r.total >= f.min_total)
     and (cardinality(f.cost_center_ids) = 0 or r.cost_center_id = any (f.cost_center_ids))
   order by f.priority desc, f.created_at
   limit 1;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.position), '[]'::jsonb) into v_steps
    from public.approval_steps s
   where s.flow_id = v_flow.id and (s.min_total is null or r.total >= s.min_total);

  update public.reports
     set flow_id = v_flow.id, flow_snapshot = v_steps, submitted_at = now()
   where id = r.id;
  insert into public.approval_actions (report_id, company_id, actor_user_id, action)
  values (r.id, r.company_id, v_me, 'submitted');

  if jsonb_array_length(v_steps) = 0 then
    update public.reports set status = 'approved', approved_at = now(), current_step = null,
                              current_approver_ids = '{}'
     where id = r.id;
    insert into public.approval_actions (report_id, company_id, actor_user_id, action)
    values (r.id, r.company_id, v_me, 'auto_approved');
    return 'approved';
  end if;

  perform private.advance_report(r.id, -1);
  return (select status from public.reports where id = r.id);
end;
$$;

create or replace function public.approve_report(p_report uuid, p_note text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
begin
  select * into r from public.reports where id = p_report for update;
  if not found or r.status <> 'pending' then
    raise exception 'Onay bekleyen bir rapor değil' using errcode = 'P0001';
  end if;
  if r.owner_user_id = v_me then
    raise exception 'Kendi raporunuzu onaylayamazsınız' using errcode = '42501';
  end if;
  if not (v_me = any (r.current_approver_ids)) then
    raise exception 'Bu adımın onaylayıcısı değilsiniz' using errcode = '42501';
  end if;
  insert into public.approval_actions (report_id, company_id, step_position, actor_user_id, action, note)
  values (r.id, r.company_id, r.current_step, v_me, 'approved', p_note);
  perform private.advance_report(r.id, r.current_step);
  return (select status from public.reports where id = r.id);
end;
$$;

create or replace function public.return_report(p_report uuid, p_note text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  v_me uuid := (select auth.uid());
begin
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'İade gerekçesi zorunludur' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = p_report for update;
  if not found or r.status <> 'pending' then
    raise exception 'Onay bekleyen bir rapor değil' using errcode = 'P0001';
  end if;
  if not (v_me = any (r.current_approver_ids)) then
    raise exception 'Bu adımın onaylayıcısı değilsiniz' using errcode = '42501';
  end if;
  insert into public.approval_actions (report_id, company_id, step_position, actor_user_id, action, note)
  values (r.id, r.company_id, r.current_step, v_me, 'returned', p_note);
  update public.reports set status = 'returned', current_step = null, current_approver_ids = '{}'
   where id = r.id;
  return 'returned';
end;
$$;

revoke all on function public.submit_report(uuid) from public, anon;
revoke all on function public.approve_report(uuid, text) from public, anon;
revoke all on function public.return_report(uuid, text) from public, anon;
grant execute on function public.submit_report(uuid) to authenticated;
grant execute on function public.approve_report(uuid, text) to authenticated;
grant execute on function public.return_report(uuid, text) to authenticated;

revoke all on function private.manager_of(uuid, uuid) from public;
revoke all on function private.company_admins(uuid) from public;
revoke all on function private.resolve_step_approvers(public.reports, jsonb) from public;
revoke all on function private.advance_report(uuid, int) from public;
