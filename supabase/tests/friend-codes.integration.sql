-- Run after migration 50. Disposable fixtures and every write are rolled back.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at) values
 ('20000000-0000-4000-8000-000000000001','authenticated','authenticated','workflow-code-a@example.invalid','{"full_name":"Code Test A"}',now(),now()),
 ('20000000-0000-4000-8000-000000000002','authenticated','authenticated','workflow-code-b@example.invalid','{"full_name":"Code Test B"}',now(),now());
set local role authenticated;
do $$
declare
 a uuid:='20000000-0000-4000-8000-000000000001'; b uuid:='20000000-0000-4000-8000-000000000002';
 code_a text; code_b text; r jsonb; denied boolean; n integer;
begin
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;
 begin perform public.social_my_friend_code(); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Anonymous cannot obtain a code';
 perform set_config('request.jwt.claim.sub',a::text,true);
 code_a:=public.social_my_friend_code();
 assert code_a ~ '^WF-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$','Readable random code';
 assert public.social_my_friend_code()=code_a,'Code is stable';
 perform set_config('request.jwt.claim.sub',b::text,true);
 code_b:=public.social_my_friend_code();
 assert code_b<>code_a,'Accounts have distinct codes';
 select count(*) into n from public.social_friend_codes;
 assert n=1,'RLS reveals only the caller code';
 denied:=false;
 begin perform public.social_request_friend_code(code_b); exception when no_data_found then denied:=true; end;
 assert denied,'Self request is denied';
 denied:=false;
 begin perform public.social_request_friend_code('WF-invalid'); exception when invalid_parameter_value then denied:=true; end;
 assert denied,'Malformed code is denied';
 r:=public.social_request_friend_code(lower(replace(code_a,'-','')));
 assert r->>'recipientId'=a::text,'Normalized code resolves the intended recipient';
 assert r->>'status'='pending','A code sends a request, never auto-accepts';
 assert public.social_request_friend_code(code_a)->>'id'=r->>'id','Duplicate requests are idempotent';
 denied:=false;
 begin perform public.social_send_message(a,gen_random_uuid(),'before acceptance'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Knowing a code cannot bypass acceptance';
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.social_friend_action((r->>'id')::uuid,'accept');
 assert jsonb_array_length(public.social_overview()->'friends')=1,'Recipient can accept';
 assert public.social_send_message(b,gen_random_uuid(),'after acceptance')->'message'->>'body'='after acceptance','Accepted friends can chat';
 perform public.social_block(b,true);
 perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;
 begin perform public.social_request_friend_code(code_a); exception when no_data_found then denied:=true; end;
 assert denied,'A share code cannot bypass a block';
end $$;
rollback;
select 'friend share codes: 14 assertions passed; fixtures rolled back' as result;
