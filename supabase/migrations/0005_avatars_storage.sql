-- Storage bucket cho ảnh đại diện người dùng. Chạy 1 lần trong Supabase
-- SQL Editor, SAU khi đã chạy schema.sql + các migration trước.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Ảnh đại diện là public để hiển thị được trực tiếp qua URL (avatar-btn,
-- dropdown...), nhưng chỉ chủ sở hữu mới được ghi/xoá. Quy ước đường dẫn:
-- avatars/<user_id>/<filename>, nên kiểm tra bằng cách so foldername đầu
-- tiên với auth.uid().

-- Lưu ý: CREATE POLICY không hỗ trợ "IF NOT EXISTS" trong PostgreSQL — phải
-- drop rồi tạo lại để chạy lại migration này an toàn nhiều lần.
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
