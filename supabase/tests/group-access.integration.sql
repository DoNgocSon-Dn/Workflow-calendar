-- Run after migrations 48/49. No passwords/sessions; all fixtures roll back.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'authenticated','authenticated',
 'workflow-group-'||i||'@example.invalid',now(),now() from generate_series(1,5) i;
insert into public.groups(id,name,owner_id) values
 ('40000000-0000-4000-8000-000000000001','Rollback group test','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','Rollback unrelated group','30000000-0000-4000-8000-000000000005');
insert into public.group_members(group_id,user_id,role) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','member'),
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','guest'),
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','admin');
insert into public.group_polls(id,group_id,question,anonymous,created_by) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Anonymous?',true,'30000000-0000-4000-8000-000000000001');
insert into public.group_poll_options(id,poll_id,text) values
 ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Yes');
set local role anon;
do $$ begin
 assert not has_function_privilege(current_user,'public.transfer_group_leadership(uuid,uuid)','execute'),'Anonymous transfer must be denied';
 assert not has_function_privilege(current_user,'public.delete_group_message(uuid)','execute'),'Anonymous moderation must be denied';
 assert not has_function_privilege(current_user,'public.vote_group_poll(uuid,uuid[])','execute'),'Anonymous vote must be denied';
end $$;
reset role;
set local role authenticated;
do $$
declare
 owner_id uuid:='30000000-0000-4000-8000-000000000001'; member_id uuid:='30000000-0000-4000-8000-000000000002';
 guest_id uuid:='30000000-0000-4000-8000-000000000003'; admin_id uuid:='30000000-0000-4000-8000-000000000004';
 outsider_id uuid:='30000000-0000-4000-8000-000000000005';
 g uuid:='40000000-0000-4000-8000-000000000001'; other_g uuid:='40000000-0000-4000-8000-000000000002';
 v_poll_id uuid:='50000000-0000-4000-8000-000000000001'; opt_id uuid:='60000000-0000-4000-8000-000000000001';
 task_id uuid:=gen_random_uuid(); msg_id uuid:=gen_random_uuid(); member_msg uuid:=gen_random_uuid();
 denied boolean; n integer; r jsonb;
begin
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.group_members(group_id,user_id,role) values(g,owner_id,'leader');
 assert public.group_role_of(g,owner_id)='leader','Owner bootstrap membership';
 insert into public.group_messages(id,group_id,sender_id,message) values(msg_id,g,owner_id,'Owner message');
 insert into public.group_tasks(id,group_id,title,assigned_to,created_by) values(task_id,g,'Assigned task',member_id,owner_id);
 perform public.vote_group_poll(v_poll_id,array[opt_id]);
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 select count(*) into n from public.groups where id=g; assert n=1,'Member sees group';
 denied:=false;
 begin insert into public.group_members(group_id,user_id,role) values(other_g,member_id,'leader'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Cannot self-join another group as leader';
 update public.group_members set role='admin' where group_id=g and user_id=member_id;
 get diagnostics n=row_count; assert n=0,'Cannot self promote';
 delete from public.group_members where group_id=g and user_id=owner_id;
 get diagnostics n=row_count; assert n=0,'Member cannot remove owner';
 denied:=false;
 begin insert into public.group_messages(group_id,sender_id,message) values(g,owner_id,'Forged sender'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Sender identity cannot be spoofed';
 insert into public.group_messages(id,group_id,sender_id,message) values(member_msg,g,member_id,'Own message');
 denied:=false;
 begin update public.group_messages set message='tampered' where id=msg_id; exception when insufficient_privilege then denied:=true; end;
 assert denied,'Direct content tampering denied';
 perform public.edit_group_message(member_msg,'Edited own message');
 select count(*) into n from public.group_messages where id=member_msg and message='Edited own message';
 assert n=1,'Checked RPC edits own message';
 denied:=false;
 begin perform public.delete_group_message(msg_id); exception when others then denied:=true; end;
 assert denied,'Member cannot delete owner message';
 update public.group_tasks set status='done' where id=task_id;
 get diagnostics n=row_count; assert n=1,'Assigned member updates status';
 denied:=false;
 begin update public.group_tasks set title='tampered' where id=task_id; exception when insufficient_privilege then denied:=true; end;
 assert denied,'Assigned member cannot change task content';
 denied:=false;
 begin update public.group_tasks set assigned_to=owner_id where id=task_id; exception when insufficient_privilege then denied:=true; end;
 assert denied,'Member cannot reassign task';
 insert into public.group_tasks(group_id,title,assigned_to,created_by) values(g,'Member-created task',member_id,member_id);
 denied:=false;
 begin insert into public.group_invites(group_id,invited_user_id,invited_by,role) values(g,outsider_id,member_id,'admin'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Member cannot invite admins';
 perform public.vote_group_poll(v_poll_id,array[opt_id]);
 select count(*) into n from public.group_poll_votes where public.group_poll_votes.poll_id=v_poll_id;
 assert n=1,'Anonymous poll hides other voters via table';
 denied:=false;
 begin insert into public.group_poll_votes(poll_id,option_id,user_id) values(v_poll_id,opt_id,member_id); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Cannot bypass poll RPC';
 perform set_config('request.jwt.claim.sub',guest_id::text,true);
 select count(*) into n from public.group_messages where group_id=g; assert n=2,'Guest can read chat';
 denied:=false;
 begin insert into public.group_messages(group_id,sender_id,message) values(g,guest_id,'Guest send'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Guest cannot send';
 denied:=false;
 begin insert into public.group_tasks(group_id,title,created_by) values(g,'Guest task',guest_id); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Guest cannot create tasks';
 denied:=false;
 begin perform public.vote_group_poll(v_poll_id,array[opt_id]); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Guest cannot vote';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 denied:=false;
 begin update public.group_members set user_id=outsider_id where group_id=g and user_id=member_id; exception when insufficient_privilege then denied:=true; end;
 assert denied,'Admin cannot move a membership identity';
 update public.group_members set role='guest' where group_id=g and user_id=member_id;
 get diagnostics n=row_count; assert n=1,'Admin may demote lower role';
 update public.group_members set role='member' where group_id=g and user_id=member_id;
 update public.group_tasks set title='Manager update' where id=task_id;
 get diagnostics n=row_count; assert n=1,'Manager edits task content';
 update public.group_messages set pinned_at=now(),pinned_by=admin_id where id=member_msg;
 get diagnostics n=row_count; assert n=1,'Manager can pin messages';
 denied:=false;
 begin update public.group_messages set pinned_by=owner_id where id=member_msg; exception when insufficient_privilege then denied:=true; end;
 assert denied,'Pin identity cannot be forged';
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 select count(*) into n from public.groups where id=g; assert n=0,'Outsider cannot see group';
 select count(*) into n from public.group_tasks where group_id=g; assert n=0,'Outsider cannot see tasks';
 select count(*) into n from public.group_messages where group_id=g; assert n=0,'Outsider cannot see messages';
 denied:=false;
 begin insert into public.group_message_reads(group_id,user_id) values(g,outsider_id); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Outsider cannot inject read receipts';
 denied:=false;
 begin perform public.vote_group_poll(v_poll_id,array[opt_id]); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Outsider cannot vote';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.delete_group_message(member_msg);
 select count(*) into n from public.group_messages where id=member_msg and deleted_at is not null;
 assert n=1,'Owner moderation soft delete works';
 perform public.transfer_group_leadership(g,admin_id);
 assert public.group_role_of(g,admin_id)='leader' and public.group_role_of(g,owner_id)='admin','Atomic leadership transfer';
end $$;
reset role;
select 'PASS: group roles, membership, tasks, messages, pins, anonymous votes, leadership and outsider isolation; fixtures rolled back' as result;
rollback;

