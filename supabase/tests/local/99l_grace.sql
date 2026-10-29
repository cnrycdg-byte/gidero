-- Ek süre: bitişten sonra 10 gün "grace", sonra "locked"
reset role;
insert into public.accounts (id, kind, name) values ('10000000-0000-0000-0000-0000000a6ace', 'company', 'Süre Test') on conflict do nothing;
insert into public.subscriptions (account_id, status, trial_ends_at) values ('10000000-0000-0000-0000-0000000a6ace', 'trial', now() - interval '3 days')
on conflict (account_id) do update set status = 'trial', trial_ends_at = now() - interval '3 days', current_period_end = null;
select test.ok(private.account_phase('10000000-0000-0000-0000-0000000a6ace') = 'grace', 'Bitişten 3 gün sonra ek süredeyiz');
update public.subscriptions set trial_ends_at = now() - interval '11 days' where account_id = '10000000-0000-0000-0000-0000000a6ace';
select test.ok(private.account_phase('10000000-0000-0000-0000-0000000a6ace') = 'locked', '10 gün sonra hesap kilitlenir');
update public.subscriptions set trial_ends_at = now() + interval '5 days' where account_id = '10000000-0000-0000-0000-0000000a6ace';
select test.ok(private.account_phase('10000000-0000-0000-0000-0000000a6ace') = 'active', 'Yenileyince açılır');
