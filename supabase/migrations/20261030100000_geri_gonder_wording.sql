-- Onaylanmayan rapor için kullanıcıya görünen ifade: "iade" yerine "geri gönder".
-- Yalnızca metinler değişir; işlev gövdeleri önceki tanımla aynıdır.

create or replace function private.notify_report_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner text;
  v_what text;
  v_note text;
  v_uid uuid;
begin
  select coalesce(nullif(p.full_name, ''), 'Bir çalışan') into v_owner from public.profiles p where p.id = new.owner_user_id;
  v_owner := coalesce(v_owner, 'Bir çalışan');
  v_what := new.title || ', ' || private.tl(new.total);

  if new.status = 'pending' and (old.status is distinct from 'pending' or old.current_step is distinct from new.current_step) then
    foreach v_uid in array new.current_approver_ids loop
      insert into public.notifications (user_id, company_id, report_id, kind, title, body)
      values (v_uid, new.company_id, new.id, 'approval_needed', 'Onayınızı bekleyen rapor', v_owner || ': ' || v_what);
    end loop;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    if old.status = 'pending' then
      insert into public.notifications (user_id, company_id, report_id, kind, title, body)
      values (new.owner_user_id, new.company_id, new.id, 'approved', 'Raporunuz onaylandı', v_what);
    end if;
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    select a, new.company_id, new.id, 'ready_for_accounting', 'Muhasebeye hazır rapor', v_owner || ': ' || v_what
      from private.company_accountants(new.company_id) as a
     where a <> new.owner_user_id and a <> (select auth.uid());
  end if;

  if new.status = 'returned' and old.status is distinct from 'returned' then
    select a.note into v_note from public.approval_actions a
     where a.report_id = new.id and a.action = 'returned' order by a.created_at desc limit 1;
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    values (new.owner_user_id, new.company_id, new.id, 'returned', 'Raporunuz geri gönderildi',
            new.title || coalesce('. Gerekçe: ' || v_note, ''));
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid' and new.owner_user_id <> coalesce((select auth.uid()), new.owner_user_id) then
    insert into public.notifications (user_id, company_id, report_id, kind, title, body)
    values (new.owner_user_id, new.company_id, new.id, 'paid', 'Masrafınız ödendi',
            v_what || coalesce('. ' || new.paid_note, ''));
  end if;
  return new;
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
    raise exception 'Geri gönderme nedeni zorunludur' using errcode = 'P0001';
  end if;
  select * into r from public.reports where id = p_report for update;
  if not found or r.status <> 'pending' then
    raise exception 'Onay bekleyen bir rapor değil' using errcode = 'P0001';
  end if;
  if not (v_me = any (r.current_approver_ids)) or not private.is_member(r.company_id) then
    raise exception 'Bu adımın onaylayıcısı değilsiniz' using errcode = '42501';
  end if;
  insert into public.approval_actions (report_id, company_id, step_position, actor_user_id, action, note)
  values (r.id, r.company_id, r.current_step, v_me, 'returned', p_note);
  update public.reports set status = 'returned', current_step = null, current_approver_ids = '{}'
   where id = r.id;
  return 'returned';
end;
$$;

revoke all on function public.return_report(uuid, text) from public, anon;
grant execute on function public.return_report(uuid, text) to authenticated;
