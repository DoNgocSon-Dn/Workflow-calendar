-- Migration 29: Khắc phục các cảnh báo bảo mật từ Supabase Database Linter
-- (Function search_path mutable, Public bucket allows listing, EXECUTE permissions on SECURITY DEFINER functions)

-- ==========================================
-- 1. FIX: Function Search Path Mutable (0011)
-- Gán search_path = public cố định cho các hàm để tránh lỗi Search Path Hijacking
-- ==========================================

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.create_calendar_with_owner(text, text) SET search_path = public;
ALTER FUNCTION public.group_role_rank(text) SET search_path = public;

-- Đảm bảo các hàm helper khác cũng có search_path = public
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'find_user_id_by_email') THEN
    ALTER FUNCTION public.find_user_id_by_email(text) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_email_by_id') THEN
    ALTER FUNCTION public.get_user_email_by_id(uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'group_role_of') THEN
    ALTER FUNCTION public.group_role_of(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_calendar_editor_or_owner') THEN
    ALTER FUNCTION public.is_calendar_editor_or_owner(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_calendar_member') THEN
    ALTER FUNCTION public.is_calendar_member(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_calendar_owner') THEN
    ALTER FUNCTION public.is_calendar_owner(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_event_attendee') THEN
    ALTER FUNCTION public.is_event_attendee(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_event_calendar_editor_or_owner') THEN
    ALTER FUNCTION public.is_event_calendar_editor_or_owner(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_event_calendar_member') THEN
    ALTER FUNCTION public.is_event_calendar_member(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_group_member') THEN
    ALTER FUNCTION public.is_group_member(uuid, uuid) SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'list_group_hidden_members') THEN
    ALTER FUNCTION public.list_group_hidden_members(uuid) SET search_path = public;
  END IF;
END $$;

-- ==========================================
-- 2. FIX: Public Bucket Allows Listing (0025)
-- Thu hẹp RLS SELECT policy trên storage.objects để ngăn kẻ xấu dùng API list() liệt kê toàn bộ file
-- (Public bucket vẫn phục vụ tải file trực tiếp qua URL công khai)
-- ==========================================

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images select policy"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Group attachments are publicly accessible" ON storage.objects;
CREATE POLICY "Group attachments select policy"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'group-attachments'
    AND public.is_group_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

-- ==========================================
-- 3. FIX: Public / Anon Can Execute SECURITY DEFINER Function (0028 / 0029)
-- Thu hồi quyền EXECUTE từ anon đối với các hàm chỉ dành cho người dùng đã xác thực
-- Thu hồi quyền EXECUTE hoàn toàn khỏi public/anon/authenticated đối với các hàm trigger nội bộ
-- ==========================================

-- Hàm trigger nội bộ (chỉ do Postgres trigger tự gọi)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unhide_group_on_message() FROM PUBLIC, anon, authenticated;

-- Thu hồi quyền thực thi từ vai trò ẩn danh (anon) đối với các RPC yêu cầu người dùng đăng nhập
REVOKE EXECUTE ON FUNCTION public.approve_group_join_request(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_group_message(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.edit_group_message(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_event_attendees(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_group_join_requests(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_group_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_group_messages(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_calendar_invites() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_group_invites() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_my_group_tasks() FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_join_group(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.respond_calendar_invite(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.respond_group_invite(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_group_hidden(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_group_leadership(uuid, uuid) FROM anon;
