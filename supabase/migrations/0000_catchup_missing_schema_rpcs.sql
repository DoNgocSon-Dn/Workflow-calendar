-- CATCH-UP: 2 object đáng lẽ nằm trong schema.sql nhưng đã KHÔNG tồn tại
-- trên database hiện tại (đã kiểm tra trực tiếp qua service-role key):
--   - function public.handle_new_user() + trigger on_auth_user_created
--   - function public.create_calendar_with_owner(text, text)
-- Không rõ vì sao thiếu (schema.sql có thể đã đổi sau lần setup DB ban đầu),
-- nhưng cả 2 khối dưới đây đều dùng "create or replace" / "drop ... if
-- exists" nên chạy lại nhiều lần vẫn an toàn, không đụng tới dữ liệu/bảng
-- đã có. Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy schema.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_calendar_id uuid;
begin
  insert into public.calendars (owner_id, name, color)
  values (new.id, 'Cá nhân', 'blue')
  returning id into new_calendar_id;

  insert into public.calendar_members (calendar_id, user_id, role)
  values (new_calendar_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_calendar_with_owner(p_name text, p_color text)
returns public.calendars
language plpgsql
security invoker
as $$
declare
  result public.calendars;
begin
  insert into public.calendars (owner_id, name, color)
  values (auth.uid(), p_name, p_color)
  returning * into result;

  insert into public.calendar_members (calendar_id, user_id, role)
  values (result.id, auth.uid(), 'owner');

  return result;
end;
$$;
