-- Restore least-privilege group access even when older migrations were reapplied.
-- No existing rows are deleted or reassigned.
begin;
create or replace function public.group_role_of(p_group_id uuid,p_user_id uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select case when exists(select 1 from public.groups where id=p_group_id and owner_id=p_user_id) then 'leader'
 else coalesce((select case when role in ('admin','member','guest') then role else 'guest' end
   from public.group_members where group_id=p_group_id and user_id=p_user_id),'none') end;
$$;
create or replace function public.group_role_rank(p_role text) returns integer
language sql immutable set search_path=public,pg_temp as $$
 select case lower(p_role) when 'leader' then 4 when 'admin' then 3 when 'member' then 2 when 'guest' then 1 else 0 end;
$$;

-- Remove permissive legacy ALL policies; PostgreSQL combines these with OR.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public'
   and tablename in ('group_members','group_tasks','group_messages','group_invites') loop
   execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
create policy group_members_read on public.group_members for select to authenticated
 using(user_id=auth.uid() or public.group_role_rank(public.group_role_of(group_id,auth.uid()))>0);
create policy group_members_add on public.group_members for insert to authenticated with check(
 (user_id=auth.uid() and role='leader' and public.group_role_of(group_id,auth.uid())='leader')
 or (role in ('admin','member','guest') and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
     and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>public.group_role_rank(role))
);
create policy group_members_change on public.group_members for update to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>public.group_role_rank(public.group_role_of(group_id,user_id)))
 with check(role in ('admin','member','guest')
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>public.group_role_rank(role));
create policy group_members_remove on public.group_members for delete to authenticated using(
 (user_id=auth.uid() and public.group_role_of(group_id,auth.uid())<>'leader')
 or (public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>public.group_role_rank(public.group_role_of(group_id,user_id)))
);
-- A role update may not move a membership to another group/user.
create or replace function public.guard_group_member_identity() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin')
   and (to_jsonb(new)-'role') is distinct from (to_jsonb(old)-'role') then
   raise exception 'Membership identity is immutable' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists guard_group_member_identity on public.group_members;
create trigger guard_group_member_identity before update on public.group_members for each row execute function public.guard_group_member_identity();

create policy group_tasks_read on public.group_tasks for select to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>0);
create policy group_tasks_add on public.group_tasks for insert to authenticated
 with check(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=2 and created_by=auth.uid());
create policy group_tasks_change on public.group_tasks for update to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   or (public.group_role_of(group_id,auth.uid())='member' and assigned_to=auth.uid()))
 with check(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   or (public.group_role_of(group_id,auth.uid())='member' and assigned_to=auth.uid()));
create policy group_tasks_remove on public.group_tasks for delete to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3);
create or replace function public.guard_group_task_write() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if tg_op='UPDATE' then
   if (new.id,new.group_id,new.created_by,new.created_at) is distinct from (old.id,old.group_id,old.created_by,old.created_at) then
     raise exception 'Task identity is immutable' using errcode='42501';
   end if;
   if public.group_role_rank(public.group_role_of(old.group_id,auth.uid()))<3
      and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
     raise exception 'Members may only change assigned task status' using errcode='42501';
   end if;
 end if;
 if new.assigned_to is not null and public.group_role_rank(public.group_role_of(new.group_id,new.assigned_to))<2 then
   raise exception 'Assignee must be a non-guest group member' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists guard_group_task_write on public.group_tasks;
create trigger guard_group_task_write before insert or update on public.group_tasks for each row execute function public.guard_group_task_write();

create policy group_messages_read on public.group_messages for select to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>0);
create policy group_messages_add on public.group_messages for insert to authenticated
 with check(sender_id=auth.uid() and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=2);
-- Content edits and soft deletion use the existing checked SECURITY DEFINER RPCs.
-- The only direct UPDATE the backend needs is pin/unpin by a manager.
revoke update,delete on public.group_messages from public,anon,authenticated;
grant update(pinned_at,pinned_by) on public.group_messages to authenticated;
create policy group_messages_pin on public.group_messages for update to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3 and deleted_at is null)
 with check(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   and ((pinned_at is null and pinned_by is null) or (pinned_at is not null and pinned_by=auth.uid())));
create or replace function public.guard_group_message_links() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if new.reply_to_id is not null and not exists(select 1 from public.group_messages where id=new.reply_to_id and group_id=new.group_id) then
   raise exception 'Reply must belong to this group' using errcode='22023';
 end if;
 if new.poll_id is not null and not exists(select 1 from public.group_polls where id=new.poll_id and group_id=new.group_id) then
   raise exception 'Poll must belong to this group' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists guard_group_message_links on public.group_messages;
create trigger guard_group_message_links before insert on public.group_messages for each row execute function public.guard_group_message_links();

create policy group_invites_read on public.group_invites for select to authenticated
 using(invited_user_id=auth.uid() or public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3);
create policy group_invites_add on public.group_invites for insert to authenticated
 with check(invited_by=auth.uid() and status='pending' and role in ('admin','member','guest')
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>public.group_role_rank(role));
create policy group_invites_change on public.group_invites for update to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3)
 with check(role in ('admin','member','guest') and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3
   and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>public.group_role_rank(role));
create policy group_invites_remove on public.group_invites for delete to authenticated
 using(public.group_role_rank(public.group_role_of(group_id,auth.uid()))>=3);
create or replace function public.guard_group_invite_identity() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') and
   (new.id,new.group_id,new.invited_user_id,new.created_at) is distinct from (old.id,old.group_id,old.invited_user_id,old.created_at) then
   raise exception 'Invite identity is immutable' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists guard_group_invite_identity on public.group_invites;
create trigger guard_group_invite_identity before update on public.group_invites for each row execute function public.guard_group_invite_identity();
revoke all on function public.guard_group_member_identity(),public.guard_group_task_write(),
 public.guard_group_message_links(),public.guard_group_invite_identity() from public,anon,authenticated;

-- Read receipts require actual membership, not just a matching user_id.
drop policy if exists group_message_reads_upsert on public.group_message_reads;
drop policy if exists group_message_reads_update on public.group_message_reads;
create policy group_message_reads_upsert on public.group_message_reads for insert to authenticated
 with check(user_id=auth.uid() and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>0);
create policy group_message_reads_update on public.group_message_reads for update to authenticated
 using(user_id=auth.uid() and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>0)
 with check(user_id=auth.uid() and public.group_role_rank(public.group_role_of(group_id,auth.uid()))>0);

-- Votes are written through the validated RPC only. Anonymous polls must not
-- expose other voters' IDs through direct table SELECT or the realtime fallback.
drop policy if exists gpv_write on public.group_poll_votes;
drop policy if exists gpv_select on public.group_poll_votes;
revoke insert,update,delete on public.group_poll_votes from public,anon,authenticated;
create policy gpv_select on public.group_poll_votes for select to authenticated using(
 exists(select 1 from public.group_polls p where p.id=poll_id
   and public.group_role_rank(public.group_role_of(p.group_id,auth.uid()))>0 and (not p.anonymous or user_id=auth.uid()))
);
create or replace function public.vote_group_poll(p_poll_id uuid,p_option_ids uuid[]) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare poll public.group_polls; n_valid integer;
begin
 select * into poll from public.group_polls where id=p_poll_id for update;
 if not found then raise exception 'poll not found'; end if;
 if public.group_role_rank(public.group_role_of(poll.group_id,auth.uid()))<2 then raise exception 'not authorized' using errcode='42501'; end if;
 if poll.closed_at is not null then raise exception 'poll closed'; end if;
 if coalesce(cardinality(p_option_ids),0)=0 then
   delete from public.group_poll_votes where poll_id=p_poll_id and user_id=auth.uid(); return;
 end if;
 if not poll.allow_multiple and cardinality(p_option_ids)>1 then raise exception 'single choice only'; end if;
 select count(*) into n_valid from public.group_poll_options where poll_id=p_poll_id and id=any(p_option_ids);
 if n_valid<>cardinality(p_option_ids) then raise exception 'invalid option'; end if;
 delete from public.group_poll_votes where poll_id=p_poll_id and user_id=auth.uid();
 insert into public.group_poll_votes(poll_id,option_id,user_id) select p_poll_id,unnest(p_option_ids),auth.uid();
end $$;
revoke all on function public.vote_group_poll(uuid,uuid[]) from public,anon;
grant execute on function public.vote_group_poll(uuid,uuid[]) to authenticated;
-- Revoking only from anon is insufficient when PUBLIC still has the default
-- EXECUTE grant. All group RPCs require a signed-in role, including legacy RPCs
-- whose old NULL comparisons were not designed for anonymous execution.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public' and p.prokind='f' and p.proname like '%group%'
     and p.proname not like 'guard_%' loop
   execute format('revoke execute on function %s from public,anon',f.signature);
   execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
